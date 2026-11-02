import "../dns-resolver.js";
import { TransactionalJobQueue, DocumentJob } from "../queue/job-queue.js";
import { UploadService } from "../storage/upload-service.js";
import { adminPool } from "../db/tenant-context.js";
import crypto from "node:crypto";

export interface WorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  reaperIntervalMs?: number;
  janitorIntervalMs?: number;
}

export class IngestionWorker {
  public readonly workerId: string;
  private queue: TransactionalJobQueue;
  private uploadService: UploadService;
  private isRunning: boolean = false;
  private pollIntervalMs: number;
  private reaperIntervalMs: number;
  private janitorIntervalMs: number;

  private pollTimer: NodeJS.Timeout | null = null;
  private reaperTimer: NodeJS.Timeout | null = null;
  private janitorTimer: NodeJS.Timeout | null = null;

  constructor(options: WorkerOptions = {}) {
    this.workerId = options.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.queue = new TransactionalJobQueue(adminPool);
    this.uploadService = new UploadService();
    this.pollIntervalMs = options.pollIntervalMs || 2000;
    this.reaperIntervalMs = options.reaperIntervalMs || 60000; // 60s
    this.janitorIntervalMs = options.janitorIntervalMs || 15 * 60000; // 15 min
  }

  /**
   * Process a single claimed job.
   * Extensible pipeline for OCR, Chunking, Extraction, and Indexing.
   */
  async processJob(job: DocumentJob): Promise<void> {
    console.log(`[Worker ${this.workerId}] Processing job ${job.id} for doc ${job.document_id} (${job.action})...`);

    // Setup periodic heartbeat extension while processing
    const heartbeatInterval = setInterval(async () => {
      try {
        const renewed = await this.queue.renewHeartbeat(job.id, this.workerId, 300);
        if (!renewed) {
          console.warn(`[Worker ${this.workerId}] Heartbeat renewal failed for job ${job.id} (lease expired or lost)`);
        }
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Heartbeat renewal error:`, err.message);
      }
    }, 15000);

    try {
      // 1. Fetch document metadata
      const docResult = await adminPool.query(
        `SELECT id, organization_id, workspace_id, filename, s3_key, mime_type, file_size_bytes
         FROM documents
         WHERE id = $1 AND organization_id = $2;`,
        [job.document_id, job.organization_id]
      );

      if (docResult.rows.length === 0) {
        throw new Error(`Document ${job.document_id} not found`);
      }

      const doc = docResult.rows[0];

      // 2. Mark document as PROCESSING
      await adminPool.query(
        `UPDATE documents SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [doc.id]
      );

      // Simulation / hook for Phase 4: Document Intelligence (OCR & Extraction)
      // For now, extract simulated metadata & chunk
      await adminPool.query(
        `INSERT INTO document_chunks (
           organization_id, workspace_id, document_id, chunk_index, page_number, content
         ) VALUES ($1, $2, $3, 0, 1, $4)
         ON CONFLICT DO NOTHING;`,
        [
          doc.organization_id,
          doc.workspace_id,
          doc.id,
          `Extracted text placeholder for ${doc.filename}`,
        ]
      );

      // 3. Mark document as COMPLETED
      await adminPool.query(
        `UPDATE documents SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [doc.id]
      );

      // 4. Mark job COMPLETED
      await this.queue.completeJob(job.id, this.workerId);
      console.log(`[Worker ${this.workerId}] Job ${job.id} completed successfully.`);
    } catch (err: any) {
      console.error(`[Worker ${this.workerId}] Job ${job.id} failed:`, err.message);
      await this.queue.failJob(job.id, this.workerId, err.message);
      await adminPool.query(
        `UPDATE documents SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [job.document_id]
      );
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  /**
   * Run one iteration of polling and job claiming.
   */
  async pollOnce(): Promise<boolean> {
    try {
      const job = await this.queue.claimJob(this.workerId, 300);
      if (job) {
        await this.processJob(job);
        return true;
      }
    } catch (err: any) {
      console.error(`[Worker ${this.workerId}] Polling error:`, err.message);
    }
    return false;
  }

  /**
   * Start worker polling loop and background janitor/reaper timers.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Worker ${this.workerId}] Ingestion worker started.`);

    // Polling loop
    const runPoll = async () => {
      if (!this.isRunning) return;
      const didWork = await this.pollOnce();
      const delay = didWork ? 100 : this.pollIntervalMs;
      this.pollTimer = setTimeout(runPoll, delay);
    };
    runPoll();

    // Reaper timer
    this.reaperTimer = setInterval(async () => {
      try {
        const stats = await this.queue.reapExpiredLeases();
        if (stats.recoveredCount > 0 || stats.dlqCount > 0) {
          console.log(`[Worker ${this.workerId}] Reaper ran: recovered ${stats.recoveredCount}, DLQ ${stats.dlqCount}`);
        }
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Reaper error:`, err.message);
      }
    }, this.reaperIntervalMs);

    // Janitor timer
    this.janitorTimer = setInterval(async () => {
      try {
        const stats = await this.uploadService.cleanupOrphanedUploads();
        if (stats.cleanedCount > 0) {
          console.log(`[Worker ${this.workerId}] Janitor swept ${stats.cleanedCount} abandoned uploads.`);
        }
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Janitor error:`, err.message);
      }
    }, this.janitorIntervalMs);
  }

  /**
   * Stop worker gracefully.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.reaperTimer) clearInterval(this.reaperTimer);
    if (this.janitorTimer) clearInterval(this.janitorTimer);
    console.log(`[Worker ${this.workerId}] Ingestion worker stopped.`);
  }
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith("ingestion-worker.ts") || process.argv[1]?.endsWith("ingestion-worker.js")) {
  const worker = new IngestionWorker();
  worker.start();

  process.on("SIGINT", () => {
    console.log("Shutting down worker...");
    worker.stop();
    process.exit(0);
  });
}
