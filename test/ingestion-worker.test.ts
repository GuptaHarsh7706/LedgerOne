import "../src/dns-resolver.js";
import { IngestionWorker } from "../src/workers/ingestion-worker.js";
import { adminPool, appPool, withTenantTransaction } from "../src/db/tenant-context.js";
import crypto from "node:crypto";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runWorkerTest() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 3: INGESTION WORKER & BACKGROUND PIPELINE TEST SUITE");
  console.log("================================================================================");

  const testSuffix = Date.now().toString(36);
  const client = await adminPool.connect();

  try {
    // 1. Provision test tenant and document
    console.log("\n1. Provisioning test tenant, workspace, and queued job...");
    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id;`,
      [`Worker Test Org ${testSuffix}`, `worker-org-${testSuffix}`]
    );
    const orgId = orgRes.rows[0].id;

    const wsRes = await client.query(
      `INSERT INTO workspaces (organization_id, name, slug) VALUES ($1, 'General', 'general') RETURNING id;`,
      [orgId]
    );
    const wsId = wsRes.rows[0].id;

    const docId = crypto.randomUUID();
    await client.query(
      `INSERT INTO documents (
         id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status
       ) VALUES ($1, $2, $3, 'sample-invoice.pdf', 1024, 'application/pdf', $4, 'test-key', 'QUEUED');`,
      [docId, orgId, wsId, crypto.createHash("sha256").update("sample").digest("hex")]
    );

    const idempotencyKey = `${docId}:PROCESS_DOCUMENT:v1`;
    const jobRes = await client.query(
      `INSERT INTO document_jobs (
         organization_id, workspace_id, document_id, action, status, priority, idempotency_key
       ) VALUES ($1, $2, $3, 'PROCESS_DOCUMENT', 'QUEUED', 1000, $4)
       RETURNING id;`,
      [orgId, wsId, docId, idempotencyKey]
    );
    const jobId = jobRes.rows[0].id;
    console.log(`   --> Created test doc ${docId} and job ${jobId}`);

    // 2. Instantiate IngestionWorker and drain until target job is processed
    console.log("\n2. Executing IngestionWorker to process queued jobs...");
    const worker = new IngestionWorker({ workerId: `test-worker-${testSuffix}`, pollIntervalMs: 100 });
    let didFindTargetJob = false;
    for (let i = 0; i < 10; i++) {
      const didWork = await worker.pollOnce();
      if (!didWork) break;
      const check = await client.query("SELECT status FROM document_jobs WHERE id = $1;", [jobId]);
      if (check.rows[0].status === "COMPLETED") {
        didFindTargetJob = true;
        break;
      }
    }
    assert(didFindTargetJob === true, `Worker should process target job ${jobId} until COMPLETED`);

    // 3. Verify Job Completion
    console.log("\n3. Verifying database state post-execution...");
    const jobCheck = await client.query(
      `SELECT status, locked_by, locked_at, lease_expires_at FROM document_jobs WHERE id = $1;`,
      [jobId]
    );
    assert(jobCheck.rows[0].status === "COMPLETED", `Job status should be COMPLETED, got ${jobCheck.rows[0].status}`);
    assert(jobCheck.rows[0].locked_by === null, "Worker lock must be released on completion");

    // 4. Verify Document Completion & Chunks
    const docCheck = await client.query(
      `SELECT status FROM documents WHERE id = $1;`,
      [docId]
    );
    assert(docCheck.rows[0].status === "COMPLETED", `Document status should be COMPLETED, got ${docCheck.rows[0].status}`);

    const chunkCheck = await client.query(
      `SELECT id, content FROM document_chunks WHERE document_id = $1 AND organization_id = $2;`,
      [docId, orgId]
    );
    assert(chunkCheck.rows.length > 0, "Document chunks must be inserted during processing");
    console.log(`   --> PASSED: Document transitioned to COMPLETED and chunk inserted: "${chunkCheck.rows[0].content}"`);

    console.log("\n================================================================================");
    console.log("  PHASE 3 WORKER TEST SUMMARY");
    console.log("================================================================================");
    console.log("  Total Tests: 1 | Passed: 1 | Failed: 0");
    console.log("  [PASS] WORKER-001: Background ingestion worker claims job, executes pipeline, inserts chunks, and completes job");
    console.log("================================================================================\n");

  } finally {
    client.release();
    await appPool.end();
    await adminPool.end();
  }
}

runWorkerTest().catch((err) => {
  console.error("Worker test failed with error:", err);
  process.exit(1);
});
