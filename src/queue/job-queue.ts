import pg from "pg";
import { appPool, adminPool, TenantContext, withTenantTransaction } from "../db/tenant-context.js";

export interface DocumentJob {
  id: string;
  organization_id: string;
  workspace_id: string;
  document_id: string;
  action: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error?: string | null;
  locked_by?: string | null;
  locked_at?: Date | null;
  lease_expires_at?: Date | null;
  lease_generation: number;
  fencing_token: string;
  run_at: Date;
  idempotency_key: string;
}

export class TransactionalJobQueue {
  private pool: pg.Pool;

  constructor(pool: pg.Pool = adminPool) {
    this.pool = pool;
  }

  /**
   * Enqueue a job within a tenant context.
   * If a job with the same idempotency_key already exists, returns the existing job.
   */
  async enqueueJob(
    ctx: TenantContext,
    documentId: string,
    action: string,
    idempotencyKey: string,
    priority: number = 10
  ): Promise<{ job: DocumentJob; isDuplicate: boolean }> {
    return withTenantTransaction(ctx, async (client) => {
      const checkResult = await client.query(
        `SELECT id, organization_id, workspace_id, document_id, action, status, priority,
                attempts, max_attempts, lease_generation, fencing_token, run_at, idempotency_key
         FROM document_jobs
         WHERE idempotency_key = $1;`,
        [idempotencyKey]
      );

      if (checkResult.rows.length > 0) {
        return { job: checkResult.rows[0], isDuplicate: true };
      }

      const insertResult = await client.query(
        `INSERT INTO document_jobs (
           organization_id, workspace_id, document_id, action, status, priority, idempotency_key
         ) VALUES ($1, $2, $3, $4, 'QUEUED', $5, $6)
         RETURNING id, organization_id, workspace_id, document_id, action, status, priority,
                   attempts, max_attempts, lease_generation, fencing_token, run_at, idempotency_key;`,
        [ctx.organizationId, ctx.workspaceId, documentId, action, priority, idempotencyKey]
      );

      return { job: insertResult.rows[0], isDuplicate: false };
    }, this.pool);
  }

  /**
   * Atomically claims the next available queued job using FOR UPDATE SKIP LOCKED.
   * Increments lease_generation and generates a new fencing_token.
   */
  async claimJob(
    workerId: string,
    leaseDurationSeconds: number = 300
  ): Promise<DocumentJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const claimSql = `
        UPDATE document_jobs
        SET status = 'PROCESSING',
            locked_by = $1,
            locked_at = CURRENT_TIMESTAMP,
            lease_expires_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::interval,
            lease_generation = lease_generation + 1,
            fencing_token = uuid_generate_v4(),
            attempts = attempts + 1
        WHERE id = (
          SELECT id FROM document_jobs
          WHERE status = 'QUEUED'
            AND run_at <= CURRENT_TIMESTAMP
          ORDER BY priority DESC, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, organization_id, workspace_id, document_id, action, status, priority,
                  attempts, max_attempts, locked_by, lease_expires_at, lease_generation, fencing_token, idempotency_key;
      `;

      const result = await client.query(claimSql, [workerId, leaseDurationSeconds]);
      await client.query("COMMIT;");

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Extends the worker lease (heartbeat).
   * Verifies worker ownership, matching fencing_token and lease_generation, and active lease.
   */
  async renewHeartbeat(
    jobId: string,
    workerId: string,
    fencingToken: string,
    leaseGeneration: number,
    leaseExtensionSeconds: number = 300
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE document_jobs
       SET lease_expires_at = CURRENT_TIMESTAMP + ($5 || ' seconds')::interval
       WHERE id = $1
         AND locked_by = $2
         AND fencing_token = $3
         AND lease_generation = $4
         AND status = 'PROCESSING'
         AND lease_expires_at > CURRENT_TIMESTAMP;`,
      [jobId, workerId, fencingToken, leaseGeneration, leaseExtensionSeconds]
    );

    return (result.rowCount ?? 0) === 1;
  }

  /**
   * Mark job completed atomically and coordinate document state transition.
   * Requires exact match on workerId, fencingToken, leaseGeneration, and active lease.
   */
  async completeJob(
    jobId: string,
    workerId: string,
    fencingToken: string,
    leaseGeneration: number,
    targetDocumentStatus: string = "COMPLETED"
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const result = await client.query(
        `UPDATE document_jobs
         SET status = 'COMPLETED',
             locked_by = NULL,
             locked_at = NULL,
             lease_expires_at = NULL
         WHERE id = $1
           AND locked_by = $2
           AND fencing_token = $3
           AND lease_generation = $4
           AND status = 'PROCESSING'
           AND lease_expires_at > CURRENT_TIMESTAMP
         RETURNING document_id;`,
        [jobId, workerId, fencingToken, leaseGeneration]
      );

      if ((result.rowCount ?? 0) !== 1) {
        await client.query("ROLLBACK;");
        return false;
      }

      const docId = result.rows[0].document_id;

      // Coordinate document status transition transactionally
      await client.query(
        `UPDATE documents
         SET status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [docId, targetDocumentStatus]
      );

      await client.query("COMMIT;");
      return true;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mark job failed or schedule retry with exponential backoff.
   */
  async failJob(
    jobId: string,
    workerId: string,
    fencingToken: string,
    errorMessage: string
  ): Promise<{ status: "RETRYING" | "FAILED"; attempts: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const check = await client.query(
        `SELECT attempts, max_attempts, document_id
         FROM document_jobs
         WHERE id = $1 AND locked_by = $2 AND fencing_token = $3;`,
        [jobId, workerId, fencingToken]
      );

      if (check.rows.length === 0) {
        await client.query("ROLLBACK;");
        throw new Error("Job not found or worker fencing token does not match active lease");
      }

      const { attempts, max_attempts, document_id } = check.rows[0];
      const isDeadLetter = attempts >= max_attempts;
      const nextStatus = isDeadLetter ? "FAILED" : "QUEUED";

      await client.query(
        `UPDATE document_jobs
         SET status = $1,
             locked_by = NULL,
             locked_at = NULL,
             lease_expires_at = NULL,
             last_error = $2,
             run_at = CASE 
               WHEN $3 = 'QUEUED' THEN CURRENT_TIMESTAMP + (POWER(2, attempts) * INTERVAL '5 seconds')
               ELSE CURRENT_TIMESTAMP
             END
         WHERE id = $4;`,
        [nextStatus, errorMessage, nextStatus, jobId]
      );

      if (isDeadLetter) {
        await client.query(
          `UPDATE documents SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [document_id]
        );
      }

      await client.query("COMMIT;");
      return { status: isDeadLetter ? "FAILED" : "RETRYING", attempts };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reaper process: Recovers jobs whose worker crashed or lease expired.
   * Generates new fencing token on reclamation to invalidate zombie workers.
   */
  async reapExpiredLeases(): Promise<{ recoveredCount: number; dlqCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const result = await client.query(`
        UPDATE document_jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
            locked_by = NULL,
            locked_at = NULL,
            lease_expires_at = NULL,
            fencing_token = uuid_generate_v4(),
            last_error = 'Worker lease expired; process crash or network partition assumed',
            run_at = CASE 
              WHEN attempts >= max_attempts THEN CURRENT_TIMESTAMP 
              ELSE CURRENT_TIMESTAMP + (POWER(2, attempts) * INTERVAL '5 seconds')
            END
        WHERE status = 'PROCESSING'
          AND lease_expires_at < CURRENT_TIMESTAMP
        RETURNING id, status, document_id;
      `);

      for (const row of result.rows) {
        if (row.status === "FAILED") {
          await client.query(
            `UPDATE documents SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
            [row.document_id]
          );
        }
      }

      await client.query("COMMIT;");

      let recoveredCount = 0;
      let dlqCount = 0;
      for (const row of result.rows) {
        if (row.status === "FAILED") dlqCount++;
        else recoveredCount++;
      }

      return { recoveredCount, dlqCount };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }
}
