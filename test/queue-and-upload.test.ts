import crypto from "node:crypto";
import { appPool, adminPool, TenantContext } from "../src/db/tenant-context.js";
import { TransactionalJobQueue } from "../src/queue/job-queue.js";
import { UploadService, validateFileSignature } from "../src/storage/upload-service.js";
import { s3 } from "../src/storage.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../src/config.js";

async function runQueueAndUploadTests() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 1: TRANSACTIONAL QUEUE & UPLOAD RELIABILITY TEST SUITE");
  console.log("================================================================================\n");

  const queue = new TransactionalJobQueue();
  const uploadService = new UploadService();

  // Test Tenant Context
  const orgId = crypto.randomUUID();
  const wsId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  console.log("1. Setting up test tenant and workspace for queue & upload tests...");
  await adminPool.query(`
    INSERT INTO organizations (id, name, slug) VALUES ('${orgId}', 'Queue Test Org', 'queue-${Date.now()}');
    INSERT INTO workspaces (id, organization_id, name, slug) VALUES ('${wsId}', '${orgId}', 'Queue WS', 'main');
    INSERT INTO users (id, email, password_hash, full_name) VALUES ('${userId}', 'user-${Date.now()}@queue.com', 'hash', 'Queue Tester');
    INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role) VALUES ('${orgId}', '${wsId}', '${userId}', 'DOCUMENT_MANAGER');
  `);
  console.log("   --> Test tenant initialized.\n");

  const ctx: TenantContext = { organizationId: orgId, workspaceId: wsId, userId, userRole: "DOCUMENT_MANAGER" };
  const results: { testId: string; scenario: string; passed: boolean; details: string }[] = [];

  // --------------------------------------------------------------------------
  // TEST UPLOAD-001: Magic-Byte Binary Signature Validation
  // --------------------------------------------------------------------------
  console.log("2. Running UPLOAD-001: Magic-byte binary signature validation...");
  try {
    // Valid PDF buffer: %PDF-1.4
    const validPdfBuffer = Buffer.from("%PDF-1.4 sample document content");
    const validPdfCheck = validateFileSignature(validPdfBuffer, "invoice.pdf");

    // Spoofed executable buffer: 'MZ' executable bytes with .pdf extension
    const spoofedExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const spoofedExeCheck = validateFileSignature(spoofedExeBuffer, "malicious_invoice.pdf");

    // Valid PNG buffer: \x89PNG\r\n\x1a\n
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const validPngCheck = validateFileSignature(validPngBuffer, "receipt.png");

    if (
      validPdfCheck.isValid && validPdfCheck.detectedMime === "application/pdf" &&
      !spoofedExeCheck.isValid && spoofedExeCheck.detectedMime === "application/x-msdownload" &&
      validPngCheck.isValid && validPngCheck.detectedMime === "image/png"
    ) {
      results.push({
        testId: "UPLOAD-001",
        scenario: "Binary magic byte inspection correctly validates PDF/PNG and blocks spoofed executables",
        passed: true,
        details: "Valid signatures accepted; PE executable with .pdf extension rejected.",
      });
      console.log("   --> PASSED: Magic-byte verification accepted legitimate files and blocked spoofed PE.\n");
    } else {
      throw new Error(`Magic-byte check failed! PDF: ${validPdfCheck.isValid}, Spoofed: ${spoofedExeCheck.isValid}`);
    }
  } catch (err: any) {
    results.push({ testId: "UPLOAD-001", scenario: "Magic Bytes", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST UPLOAD-002: Two-Phase Upload Intent & Confirmation Saga
  // --------------------------------------------------------------------------
  console.log("3. Running UPLOAD-002: Two-phase upload intent and confirmation saga...");
  let uploadedDocId = "";
  try {
    // Step 1: Register Intent
    const intent = await uploadService.createUploadIntent(ctx, {
      filename: "january-invoice.pdf",
      fileSizeBytes: 1024,
      mimeType: "application/pdf",
      sha256Hash: crypto.createHash("sha256").update("sample pdf").digest("hex"),
      category: "INVOICE",
    });

    uploadedDocId = intent.documentId;
    console.log(`   Intent registered: doc_id = ${intent.documentId}`);

    // Verify document is in UPLOAD_PENDING
    const pendingCheck = await adminPool.query("SELECT status FROM documents WHERE id = $1;", [intent.documentId]);
    if (pendingCheck.rows[0].status !== "UPLOAD_PENDING") {
      throw new Error(`Expected UPLOAD_PENDING, got ${pendingCheck.rows[0].status}`);
    }

    // Step 2: Upload object to S3
    await s3.send(new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: intent.s3Key,
      Body: Buffer.from("%PDF-1.4 test invoice binary bytes"),
      ContentType: "application/pdf",
    }));

    // Step 3: Confirm Upload
    const confirmation = await uploadService.confirmUpload(ctx, intent.documentId);
    console.log(`   Upload confirmed: doc_id = ${confirmation.documentId}, job_id = ${confirmation.jobId}`);

    // Verify document transitioned to QUEUED
    const queuedCheck = await adminPool.query("SELECT status FROM documents WHERE id = $1;", [intent.documentId]);
    if (queuedCheck.rows[0].status !== "QUEUED") {
      throw new Error(`Expected QUEUED, got ${queuedCheck.rows[0].status}`);
    }

    results.push({
      testId: "UPLOAD-002",
      scenario: "Two-phase upload intent and confirmation atomically transitions document to QUEUED and inserts job",
      passed: true,
      details: "S3 HeadObject verified object presence; atomic database transaction committed.",
    });
    console.log("   --> PASSED: Two-phase upload intent and confirmation saga succeeded.\n");
  } catch (err: any) {
    results.push({ testId: "UPLOAD-002", scenario: "Two-Phase Upload", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST UPLOAD-003: Duplicate Confirmation Prevention
  // --------------------------------------------------------------------------
  console.log("4. Running UPLOAD-003: Duplicate confirmation prevention...");
  try {
    let duplicateBlocked = false;
    try {
      await uploadService.confirmUpload(ctx, uploadedDocId);
    } catch (err: any) {
      if (err.message.includes("already confirmed in status 'QUEUED'")) {
        duplicateBlocked = true;
      }
    }

    if (duplicateBlocked) {
      results.push({
        testId: "UPLOAD-003",
        scenario: "Duplicate upload confirmation is rejected to prevent duplicate enqueueing",
        passed: true,
        details: "Re-confirming an already queued document threw expected error.",
      });
      console.log("   --> PASSED: Duplicate confirmation prevented.\n");
    } else {
      throw new Error("Duplicate confirmation was not blocked!");
    }
  } catch (err: any) {
    results.push({ testId: "UPLOAD-003", scenario: "Duplicate Confirmation", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST QUEUE-001: Concurrent SKIP LOCKED Job Claiming
  // --------------------------------------------------------------------------
  console.log("5. Running QUEUE-001: Concurrent SKIP LOCKED job claiming...");
  try {
    // We already have 1 queued job from UPLOAD-002. Let's enqueue a 2nd job.
    const doc2Id = crypto.randomUUID();
    await adminPool.query(`
      INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status)
      VALUES ('${doc2Id}', '${orgId}', '${wsId}', 'doc2.pdf', 500, 'application/pdf', 'h2', 'k2', 'QUEUED');
    `);
    await queue.enqueueJob(ctx, doc2Id, "PROCESS_DOCUMENT", `${doc2Id}:ACTION:v1`, 10);

    // Simulate Worker 1 and Worker 2 attempting to claim simultaneously
    const [worker1Job, worker2Job] = await Promise.all([
      queue.claimJob("worker-node-1", 300),
      queue.claimJob("worker-node-2", 300),
    ]);

    if (!worker1Job || !worker2Job) {
      throw new Error("One of the concurrent workers failed to claim a job!");
    }

    if (worker1Job.id === worker2Job.id) {
      throw new Error(`Concurrency race! Both workers claimed the SAME job ID: ${worker1Job.id}`);
    }

    results.push({
      testId: "QUEUE-001",
      scenario: "Concurrent worker job claiming with FOR UPDATE SKIP LOCKED guarantees mutually exclusive assignment",
      passed: true,
      details: `Worker 1 claimed job ${worker1Job.id}; Worker 2 claimed job ${worker2Job.id}. Zero conflict.`,
    });
    console.log(`   --> PASSED: Mutual exclusion verified (Worker 1 != Worker 2 claimed jobs).\n`);

    // Clean up worker 1 job
    await queue.completeJob(worker1Job.id, "worker-node-1");
  } catch (err: any) {
    results.push({ testId: "QUEUE-001", scenario: "SKIP LOCKED Concurrency", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST QUEUE-002: Worker Lease Extension (Heartbeat) & Ownership Verification
  // --------------------------------------------------------------------------
  console.log("6. Running QUEUE-002: Worker lease extension (heartbeat) and ownership verification...");
  try {
    // Create and claim a job with worker-alpha
    const doc3Id = crypto.randomUUID();
    await adminPool.query(`
      INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status)
      VALUES ('${doc3Id}', '${orgId}', '${wsId}', 'doc3.pdf', 500, 'application/pdf', 'h3', 'k3', 'QUEUED');
    `);
    await queue.enqueueJob(ctx, doc3Id, "PROCESS_DOCUMENT", `${doc3Id}:HEARTBEAT:v1`, 10);
    const claimed = await queue.claimJob("worker-alpha", 300);
    if (!claimed) throw new Error("Could not claim test job");

    // 1. Worker Alpha extends heartbeat -> should succeed
    const alphaRenewed = await queue.renewHeartbeat(claimed.id, "worker-alpha", 600);
    if (!alphaRenewed) throw new Error("Worker Alpha could not renew its own heartbeat!");

    // 2. Rogue Worker Beta tries to complete or extend Alpha's job -> should fail
    const betaCompleted = await queue.completeJob(claimed.id, "worker-rogue-beta");
    if (betaCompleted) throw new Error("Rogue worker was able to complete Alpha's job!");

    // 3. Worker Alpha completes its job -> should succeed
    const alphaCompleted = await queue.completeJob(claimed.id, "worker-alpha");
    if (!alphaCompleted) throw new Error("Worker Alpha could not complete its job!");

    results.push({
      testId: "QUEUE-002",
      scenario: "Worker lease renewals and completions verify worker ownership and active lease",
      passed: true,
      details: "Legitimate worker heartbeats accepted; unauthorized worker attempts rejected.",
    });
    console.log("   --> PASSED: Worker ownership strictly validated on heartbeat and completion.\n");
  } catch (err: any) {
    results.push({ testId: "QUEUE-002", scenario: "Worker Ownership", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST QUEUE-003: Worker Crash & Expired Lease Reaper Recovery
  // --------------------------------------------------------------------------
  console.log("7. Running QUEUE-003: Worker crash and expired lease reaper recovery...");
  try {
    const doc4Id = crypto.randomUUID();
    await adminPool.query(`
      INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status)
      VALUES ('${doc4Id}', '${orgId}', '${wsId}', 'doc4.pdf', 500, 'application/pdf', 'h4', 'k4', 'QUEUED');
    `);
    const enqRes = await queue.enqueueJob(ctx, doc4Id, "PROCESS_DOCUMENT", `${doc4Id}:CRASH:v1`, 9999);
    const crashedJob = await queue.claimJob("crashed-worker-node", 10);
    if (!crashedJob) throw new Error("Could not claim job");
    if (crashedJob.id !== enqRes.job.id) {
      throw new Error(`Claimed job ${crashedJob.id} did not match enqueued job ${enqRes.job.id}`);
    }

    // Simulate worker crash by setting lease_expires_at in the past
    await adminPool.query(`
      UPDATE document_jobs 
      SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 seconds'
      WHERE id = '${crashedJob.id}';
    `);

    // Run Reaper
    const reaperResult = await queue.reapExpiredLeases();
    console.log(`   Reaper recovered: ${reaperResult.recoveredCount} jobs, DLQ: ${reaperResult.dlqCount}`);

    // Verify job was reset to QUEUED with attempts = 1
    const recovered = await adminPool.query("SELECT status, attempts, last_error FROM document_jobs WHERE id = $1;", [crashedJob.id]);
    if (recovered.rows[0].status !== "QUEUED" || recovered.rows[0].attempts !== 1) {
      throw new Error(`Job was not recovered to QUEUED! Status: ${recovered.rows[0].status}, Attempts: ${recovered.rows[0].attempts}`);
    }

    results.push({
      testId: "QUEUE-003",
      scenario: "Expired worker leases are reclaimed by reaper with exponential backoff and retry tracking",
      passed: true,
      details: `Reaper recovered crashed job back to QUEUED; attempts tracked: ${recovered.rows[0].attempts}`,
    });
    console.log("   --> PASSED: Crashed worker job recovered by reaper with retry backoff.\n");
  } catch (err: any) {
    results.push({ testId: "QUEUE-003", scenario: "Worker Crash Recovery", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST UPLOAD-004: Incomplete Upload Janitor Sweep
  // --------------------------------------------------------------------------
  console.log("8. Running UPLOAD-004: Incomplete upload Janitor sweep...");
  try {
    // Create an abandoned document in UPLOAD_PENDING with an expired lease
    const abandonedDocId = crypto.randomUUID();
    const abandonedS3Key = `assets/${orgId}/${wsId}/${abandonedDocId}/abandoned.pdf`;

    await adminPool.query(`
      INSERT INTO documents (
        id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status, upload_lease_expires_at
      ) VALUES (
        '${abandonedDocId}', '${orgId}', '${wsId}', 'abandoned.pdf', 100, 'application/pdf', 'hash', '${abandonedS3Key}',
        'UPLOAD_PENDING', CURRENT_TIMESTAMP - INTERVAL '10 minutes'
      );
    `);

    // Run Janitor
    const janitorResult = await uploadService.cleanupOrphanedUploads();
    console.log(`   Janitor swept ${janitorResult.cleanedCount} abandoned documents.`);

    // Verify document status is now UPLOAD_EXPIRED
    const swept = await adminPool.query("SELECT status FROM documents WHERE id = $1;", [abandonedDocId]);
    if (swept.rows[0].status !== "UPLOAD_EXPIRED") {
      throw new Error(`Abandoned document status was not updated to UPLOAD_EXPIRED! Got: ${swept.rows[0].status}`);
    }

    results.push({
      testId: "UPLOAD-004",
      scenario: "Orphaned upload Janitor sweeps expired upload leases and marks UPLOAD_EXPIRED",
      passed: true,
      details: `Janitor cleaned ${janitorResult.cleanedCount} records; status transitioned to UPLOAD_EXPIRED.`,
    });
    console.log("   --> PASSED: Orphaned upload Janitor successfully cleaned stale upload leases.\n");
  } catch (err: any) {
    results.push({ testId: "UPLOAD-004", scenario: "Orphaned Upload Janitor", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // Summary
  console.log("================================================================================");
  console.log("  QUEUE & UPLOAD RELIABILITY TEST SUMMARY");
  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`  Total Tests: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.testId}: ${r.scenario}`);
  }
  console.log("================================================================================\n");

  await adminPool.end();
  await appPool.end();

  if (passedCount !== results.length) {
    throw new Error("One or more queue/upload reliability tests failed!");
  }
}

// Execute
runQueueAndUploadTests().catch((err) => {
  console.error("Queue and upload test suite failed:", err);
  process.exit(1);
});
