import { createApp } from "../src/app.js";
import { config, validateConfig } from "../src/config.js";
import { initDatabase, checkDatabaseHealth, insertTransaction, getTransactions } from "../src/db.js";
import {
  checkStorageHealth,
  uploadDocument,
  getDocument,
  listDocuments,
  deleteDocument,
} from "../src/storage.js";

async function runEndToEndVerification() {
  console.log("=================================================");
  console.log("  LedgerOne Neon Services End-to-End Verification");
  console.log("=================================================\n");

  validateConfig();

  console.log(`[Config] Neon Branch: ${config.neon.branch}`);
  console.log(`[Config] Storage Bucket: ${config.storage.bucket}`);
  console.log(`[Config] Storage Region: ${config.storage.region}`);
  console.log(`[Config] Storage Endpoint: ${config.storage.endpoint}\n`);

  // Step 1: Start App Server
  console.log("1. Starting LedgerOne Application Server...");
  await initDatabase();
  const app = createApp();
  const testPort = 3188;
  const server = app.listen(testPort);
  console.log(`   App running on http://127.0.0.1:${testPort}\n`);

  try {
    // Step 2: Test Health Check Endpoint
    console.log("2. Testing /health endpoint...");
    const healthRes = await fetch(`http://127.0.0.1:${testPort}/health`);
    const healthJson: any = await healthRes.json();
    console.log(`   HTTP Status: ${healthRes.status}`);
    console.log(`   Health Payload:`, JSON.stringify(healthJson, null, 2));

    if (healthRes.status !== 200 || healthJson.status !== "healthy") {
      throw new Error("Health check endpoint failed");
    }
    console.log("   --> Health check PASSED: Postgres and Object Storage both reporting OK.\n");

    // Step 3: Test Neon Postgres Service
    console.log("3. Testing Neon Postgres (Database Operations)...");
    const testTxData = {
      description: "Neon Deployment Verified Deposit",
      amount: 75000.50,
      type: "CREDIT" as const,
      document_key: "receipts/tx-001.json",
    };

    console.log("   Creating transaction via POST /api/transactions...");
    const createTxRes = await fetch(`http://127.0.0.1:${testPort}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testTxData),
    });
    const createdTxJson: any = await createTxRes.json();
    console.log(`   Created Transaction ID: ${createdTxJson.transaction?.id}`);
    console.log(`   Created Amount: $${createdTxJson.transaction?.amount}`);

    console.log("   Querying transactions via GET /api/transactions...");
    const listTxRes = await fetch(`http://127.0.0.1:${testPort}/api/transactions`);
    const listTxJson: any = await listTxRes.json();
    const foundTx = listTxJson.transactions?.find((t: any) => t.id === createdTxJson.transaction?.id);
    if (!foundTx) {
      throw new Error("Inserted transaction was not found in GET /api/transactions");
    }
    console.log(`   --> Postgres Verification PASSED: Transaction persisted and retrieved.\n`);

    // Step 4: Test Neon Object Storage Service
    console.log("4. Testing Neon Object Storage (Bucket Operations)...");
    const testDocKey = `test/receipt-${Date.now()}.txt`;
    const testDocContent = `Neon Object Storage Test Payload - Timestamp: ${new Date().toISOString()}`;

    console.log(`   Uploading test object '${testDocKey}' via POST /api/documents...`);
    const uploadRes = await fetch(`http://127.0.0.1:${testPort}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: testDocKey,
        content: testDocContent,
        contentType: "text/plain",
      }),
    });
    const uploadJson: any = await uploadRes.json();
    console.log(`   Upload Response:`, JSON.stringify(uploadJson));

    console.log(`   Listing objects via GET /api/documents?prefix=test/...`);
    const listDocsRes = await fetch(`http://127.0.0.1:${testPort}/api/documents?prefix=test/`);
    const listDocsJson: any = await listDocsRes.json();
    console.log(`   Keys in Bucket under 'test/':`, listDocsJson.keys);
    if (!listDocsJson.keys.includes(testDocKey)) {
      throw new Error(`Uploaded key '${testDocKey}' was not found in bucket listing`);
    }

    console.log(`   Retrieving object '${testDocKey}' via GET /api/documents/:key...`);
    const getDocRes = await fetch(`http://127.0.0.1:${testPort}/api/documents/${encodeURIComponent(testDocKey)}`);
    const getDocJson: any = await getDocRes.json();
    console.log(`   Downloaded Content: "${getDocJson.document?.content}"`);

    if (getDocJson.document?.content !== testDocContent) {
      throw new Error("Retrieved document content did not match uploaded content");
    }
    console.log(`   --> Object Storage Verification PASSED: Object uploaded, listed, and verified.\n`);

    // Clean up test document
    console.log(`   Cleaning up test object '${testDocKey}'...`);
    await deleteDocument(testDocKey);
    console.log(`   Cleanup complete.`);

    console.log("\n=================================================");
    console.log("  ALL END-TO-END VERIFICATIONS PASSED (100%)");
    console.log("=================================================");
  } finally {
    server.close();
  }
}

runEndToEndVerification().catch((err) => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
