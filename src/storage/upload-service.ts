import crypto from "node:crypto";
import { S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../storage.js";
import { config } from "../config.js";
import { withTenantTransaction, TenantContext, appPool, adminPool } from "../db/tenant-context.js";
import { TransactionalJobQueue } from "../queue/job-queue.js";

export interface FileSecurityValidation {
  isValid: boolean;
  detectedMime: string;
  sha256?: string;
  error?: string;
}

/**
 * Validates binary magic bytes, structural markers (e.g. PDF %%EOF),
 * strict resource limits, and scans for embedded malicious payloads.
 */
export function validateFileSecurity(buffer: Buffer, declaredFilename: string): FileSecurityValidation {
  const maxSizeBytes = 50 * 1024 * 1024; // 50MB strict limit
  if (!buffer || buffer.length < 4) {
    return { isValid: false, detectedMime: "unknown", error: "File buffer is too small to identify format" };
  }
  if (buffer.length > maxSizeBytes) {
    return { isValid: false, detectedMime: "unknown", error: `File exceeds maximum allowed size of 50MB` };
  }

  // 1. Explicitly reject executable binary formats (Windows PE: 'MZ', Linux ELF: '\x7fELF')
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { isValid: false, detectedMime: "application/x-msdownload", error: "Executable binary (PE) strictly prohibited" };
  }
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { isValid: false, detectedMime: "application/x-elf", error: "Executable binary (ELF) strictly prohibited" };
  }

  // EICAR standard antivirus test signature detection
  const asciiHeader = buffer.subarray(0, Math.min(buffer.length, 128)).toString("ascii");
  if (asciiHeader.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
    return { isValid: false, detectedMime: "malware/eicar", error: "Malware signature detected (EICAR)" };
  }

  // 2. PDF Validation: %PDF- header and structural %%EOF trailer
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    // Must contain %%EOF marker towards the end (standard PDF structure)
    const tailSearchLength = Math.min(buffer.length, 2048);
    const tailBuffer = buffer.subarray(buffer.length - tailSearchLength);
    const tailString = tailBuffer.toString("latin1");

    if (!tailString.includes("%%EOF")) {
      return {
        isValid: false,
        detectedMime: "application/pdf",
        error: "Malformed PDF: missing required %%EOF trailer marker",
      };
    }

    // Inspect for suspicious high-risk PDF launch actions
    if (tailString.includes("/Launch") || tailString.includes("/EmbeddedFiles")) {
      // Check if embedded files contain executable header
      const embeddedMz = buffer.indexOf(Buffer.from([0x4d, 0x5a]));
      if (embeddedMz !== -1) {
        return {
          isValid: false,
          detectedMime: "application/pdf",
          error: "Malicious PDF: contains embedded executable PE binary",
        };
      }
    }

    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return { isValid: true, detectedMime: "application/pdf", sha256 };
  }

  // 3. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return { isValid: true, detectedMime: "image/png", sha256 };
  }

  // 4. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return { isValid: true, detectedMime: "image/jpeg", sha256 };
  }

  // 5. TIFF: II*. (49 49 2A 00) or MM.* (4D 4D 00 2A)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return { isValid: true, detectedMime: "image/tiff", sha256 };
  }

  return { isValid: false, detectedMime: "unknown", error: "Unsupported or spoofed file signature" };
}

// Helper to convert AWS SDK stream to Buffer
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class UploadService {
  private queue: TransactionalJobQueue;

  constructor() {
    this.queue = new TransactionalJobQueue();
  }

  /**
   * Phase 1: Register Upload Intent
   * Creates document record in status 'UPLOAD_PENDING' with 15-minute lease and S3 key.
   */
  async createUploadIntent(
    ctx: TenantContext,
    input: {
      filename: string;
      fileSizeBytes: number;
      mimeType: string;
      sha256Hash: string;
      category?: string;
    }
  ): Promise<{ documentId: string; s3Key: string; presignedPutUrl: string }> {
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB limit
    if (input.fileSizeBytes > maxSizeBytes) {
      throw new Error(`File size ${input.fileSizeBytes} bytes exceeds 50MB limit`);
    }

    const docId = crypto.randomUUID();
    const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `assets/${ctx.organizationId}/${ctx.workspaceId || "default"}/${docId}/${sanitizedFilename}`;

    await withTenantTransaction(ctx, async (client) => {
      await client.query(
        `INSERT INTO documents (
           id, organization_id, workspace_id, uploaded_by_user_id, filename, file_size_bytes,
           mime_type, sha256_hash, s3_key, status, upload_lease_expires_at, category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UPLOAD_PENDING', CURRENT_TIMESTAMP + INTERVAL '15 minutes', $10);`,
        [
          docId,
          ctx.organizationId,
          ctx.workspaceId,
          ctx.userId || null,
          sanitizedFilename,
          input.fileSizeBytes,
          input.mimeType,
          input.sha256Hash,
          s3Key,
          input.category || "INVOICE",
        ]
      );
    });

    const command = new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: s3Key,
      ContentType: input.mimeType,
    });

    const presignedPutUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    return { documentId: docId, s3Key, presignedPutUrl };
  }

  /**
   * Phase 2: Confirm Upload
   * Downloads S3 object, verifies SHA-256 byte checksum, validates file parser & security,
   * then atomically transitions document to QUEUED and enqueues job.
   */
  async confirmUpload(
    ctx: TenantContext,
    documentId: string
  ): Promise<{ documentId: string; status: string; jobId: string }> {
    // 1. Fetch document metadata under tenant context
    const doc = await withTenantTransaction(ctx, async (client) => {
      const docResult = await client.query(
        `SELECT id, organization_id, workspace_id, filename, s3_key, file_size_bytes, sha256_hash, status, upload_lease_expires_at
         FROM documents
         WHERE id = $1 AND organization_id = $2;`,
        [documentId, ctx.organizationId]
      );

      if (docResult.rows.length === 0) {
        throw new Error("Document not found");
      }

      const d = docResult.rows[0];
      if (d.status === "QUEUED" || d.status === "COMPLETED") {
        throw new Error(`Document is already confirmed in status '${d.status}'`);
      }

      if (d.status !== "UPLOAD_PENDING") {
        throw new Error(`Cannot confirm document in status '${d.status}'`);
      }

      return d;
    });

    // 2. Download uploaded bytes from S3 to verify presence, size, and checksum
    let objectBuffer: Buffer;
    try {
      const getObj = await s3.send(
        new GetObjectCommand({
          Bucket: config.storage.bucket,
          Key: doc.s3_key,
        })
      );

      if (!getObj.Body) {
        throw new Error("Empty body returned from storage");
      }
      objectBuffer = await streamToBuffer(getObj.Body);
    } catch (err: any) {
      throw new Error(`Storage read verification failed: ${err.message}`);
    }

    if (objectBuffer.length === 0) {
      throw new Error("Uploaded object in storage is empty (0 bytes)");
    }

    // 3. Checksum verification against declared hash
    const actualSha256 = crypto.createHash("sha256").update(objectBuffer).digest("hex");
    if (actualSha256.toLowerCase() !== doc.sha256_hash.trim().toLowerCase()) {
      // Mismatch: purge object from S3 and record status durably in database
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: doc.s3_key }));
      } catch {}
      await withTenantTransaction(ctx, async (client) => {
        await client.query(
          `UPDATE documents SET status = 'FAILED_CHECKSUM_MISMATCH', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [documentId]
        );
      });
      throw new Error(`Checksum mismatch: expected ${doc.sha256_hash}, computed ${actualSha256}`);
    }

    // 4. Parser and Security Validation
    const securityCheck = validateFileSecurity(objectBuffer, doc.filename);
    if (!securityCheck.isValid) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: doc.s3_key }));
      } catch {}
      await withTenantTransaction(ctx, async (client) => {
        await client.query(
          `UPDATE documents SET status = 'FAILED_MALFORMED_FILE', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [documentId]
        );
      });
      throw new Error(`File security check failed: ${securityCheck.error}`);
    }

    // 5. Atomically transition document to QUEUED and enqueue job
    return withTenantTransaction(ctx, async (client) => {
      // Lock document row to prevent concurrent confirmation race
      const lockCheck = await client.query(
        `SELECT status FROM documents WHERE id = $1 AND organization_id = $2 FOR UPDATE;`,
        [documentId, ctx.organizationId]
      );

      if (lockCheck.rows.length === 0) {
        throw new Error("Document not found");
      }

      const currentStatus = lockCheck.rows[0].status;
      if (currentStatus === "QUEUED" || currentStatus === "COMPLETED") {
        throw new Error(`Document is already confirmed in status '${currentStatus}'`);
      }
      if (currentStatus !== "UPLOAD_PENDING") {
        throw new Error(`Cannot confirm document in status '${currentStatus}'`);
      }

      await client.query(
        `UPDATE documents
         SET status = 'QUEUED', upload_lease_expires_at = NULL, file_size_bytes = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [documentId, objectBuffer.length]
      );

      const idempotencyKey = `${documentId}:PROCESS_DOCUMENT:v1`;
      const jobResult = await client.query(
        `INSERT INTO document_jobs (
           organization_id, workspace_id, document_id, action, status, priority, idempotency_key
         ) VALUES ($1, $2, $3, 'PROCESS_DOCUMENT', 'QUEUED', 10, $4)
         RETURNING id;`,
        [ctx.organizationId, doc.workspace_id, documentId, idempotencyKey]
      );

      return {
        documentId,
        status: "QUEUED",
        jobId: jobResult.rows[0].id,
      };
    });
  }

  /**
   * Phase 4: Durable Orphaned Object Janitor
   * Atomically transitions stale documents from UPLOAD_PENDING -> CLEANUP_PENDING
   * with a cleanup lease, deletes S3 objects, then transitions to UPLOAD_EXPIRED.
   */
  async cleanupOrphanedUploads(): Promise<{ cleanedCount: number }> {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Claim stale uploads using durable CLEANUP_PENDING lease
      const claimResult = await client.query(`
        UPDATE documents
        SET status = 'CLEANUP_PENDING',
            cleanup_lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        WHERE id IN (
          SELECT id FROM documents
          WHERE status = 'UPLOAD_PENDING'
            AND upload_lease_expires_at < CURRENT_TIMESTAMP
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, s3_key;
      `);

      await client.query("COMMIT;");

      let cleanedCount = 0;
      for (const row of claimResult.rows) {
        // 2. Delete S3 object
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: config.storage.bucket,
              Key: row.s3_key,
            })
          );
        } catch (err: any) {
          console.warn(`[Janitor] Failed to delete S3 key ${row.s3_key}:`, err.message);
        }

        // 3. Mark UPLOAD_EXPIRED
        await client.query(
          `UPDATE documents
           SET status = 'UPLOAD_EXPIRED', cleanup_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1;`,
          [row.id]
        );
        cleanedCount++;
      }

      return { cleanedCount };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }
}
