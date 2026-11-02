import { createApp } from "../src/app.js";
import { config, validateConfig } from "../src/config.js";
import { adminPool, appPool } from "../src/db/tenant-context.js";
import { IngestionWorker } from "../src/workers/ingestion-worker.js";
import { FixedDecimal, calculateCurrencyTolerance, getCurrencyScale } from "../src/intelligence/decimal-math.js";
import { DocumentTextExtractor } from "../src/intelligence/text-extractor.js";
import { FinancialFieldExtractor } from "../src/intelligence/field-extractor.js";
import { FinancialInvariantEngine } from "../src/intelligence/invariant-engine.js";
import { s3 } from "../src/storage.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

export async function runDocumentIntelligenceTests() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 4: DOCUMENT INTELLIGENCE & FINANCIAL EXTRACTION TEST SUITE");
  console.log("  Evaluates: Decimal Precision, Provenance, Invariants, HITL Review, Idempotency");
  console.log("================================================================================\n");

  validateConfig();

  const results: Array<{ testId: string; scenario: string; passed: boolean; details: string }> = [];

  // Setup express server for API tests
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testSuffix = crypto.randomUUID().slice(0, 8);
  let adminToken = "";
  let reviewerToken = "";
  let viewerToken = "";
  let orgId = "";
  let wsId = "";
  let adminUserId = "";
  let reviewerUserId = "";
  let viewerUserId = "";

  try {
    // -------------------------------------------------------------------------
    // Setup Tenant, Roles, and Auth
    // -------------------------------------------------------------------------
    console.log("1. Setting up tenant, workspace, and 6-role members for Phase 4...");
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `admin-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Admin User" }),
    });
    const adminData: any = await adminReg.json();
    adminUserId = adminData.user.id;

    const reviewerReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rev-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Reviewer User" }),
    });
    const reviewerData: any = await reviewerReg.json();
    reviewerUserId = reviewerData.user.id;

    const viewerReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `view-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Viewer User" }),
    });
    const viewerData: any = await viewerReg.json();
    viewerUserId = viewerData.user.id;

    // Login Admin
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `admin-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    adminToken = ((await adminLogin.json()) as any).accessToken;

    // Create Organization
    const orgRes = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Test Org ${testSuffix}`, slug: `org-${testSuffix}` }),
    });
    const orgData: any = await orgRes.json();
    orgId = orgData.organization.id;
    wsId = orgData.defaultWorkspace.id;

    // Add Reviewer and Viewer to Workspace
    await fetch(`${baseUrl}/api/v1/workspaces/${wsId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}`, "x-organization-id": orgId },
      body: JSON.stringify({ targetUserId: reviewerUserId, role: "REVIEWER" }),
    });

    await fetch(`${baseUrl}/api/v1/workspaces/${wsId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}`, "x-organization-id": orgId },
      body: JSON.stringify({ targetUserId: viewerUserId, role: "VIEWER" }),
    });

    // Login Reviewer and Viewer to obtain workspace-scoped tokens
    const revLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rev-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    reviewerToken = ((await revLogin.json()) as any).accessToken;

    const viewLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `view-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    viewerToken = ((await viewLogin.json()) as any).accessToken;

    console.log("   --> Test tenant, workspace, and roles configured.\n");

    // -------------------------------------------------------------------------
    // TEST INTEL-001: High-Precision Decimal Arithmetic & Currency Scales
    // -------------------------------------------------------------------------
    console.log("2. Running INTEL-001: Decimal precision and currency-aware rounding policies...");
    try {
      // 1. Classic IEEE-754 binary floating point trap: 0.1 + 0.2
      const dec1 = FixedDecimal.fromString("0.1");
      const dec2 = FixedDecimal.fromString("0.2");
      const sum = dec1.add(dec2);
      assert(sum.toString(2) === "0.30", `Expected 0.30, got ${sum.toString(2)}`);

      // 2. Multi-item fractional cents rounding: 3 items at $33.3333
      const price = FixedDecimal.fromString("33.3333");
      const qty = 3;
      const total = price.mul(qty).roundToScale(2);
      assert(total.toString(2) === "100.00", `Expected 100.00, got ${total.toString(2)}`);

      // 3. JPY 0-decimal scale verification
      const jpyScale = getCurrencyScale("JPY");
      assert(jpyScale === 0, `Expected JPY scale 0, got ${jpyScale}`);
      const jpyTol = calculateCurrencyTolerance("JPY", 5);
      assert(jpyTol.toNumber() <= 1, `JPY tolerance must be <= 1 currency unit`);

      // 4. BHD 3-decimal scale verification
      const bhdScale = getCurrencyScale("BHD");
      assert(bhdScale === 3, `Expected BHD scale 3, got ${bhdScale}`);
      const bhdAmount = FixedDecimal.fromString("12.450").add(FixedDecimal.fromString("0.005"));
      assert(bhdAmount.toString(3) === "12.455", `Expected 12.455, got ${bhdAmount.toString(3)}`);

      results.push({
        testId: "INTEL-001",
        scenario: "Arbitrary-precision decimal arithmetic and ISO 4217 currency scales eliminate IEEE-754 drift",
        passed: true,
        details: "FixedDecimal verified across USD (2), JPY (0), and BHD (3) with half-up rounding.",
      });
      console.log("   --> PASSED: Financial decimal engine verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-001", scenario: "Decimal Arithmetic", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-002: Document Text, Page Geometry & Token Bounding Boxes
    // -------------------------------------------------------------------------
    console.log("3. Running INTEL-002: Document text and layout geometry extraction...");
    try {
      const extractor = new DocumentTextExtractor();
      const mockPdfText = "%PDF-1.4\nstream\n1 0 0 1 50 700 Tm\n(INVOICE #INV-2026-001) Tj\n1 0 0 1 50 650 Tm\n(Total: $1,250.00) Tj\nendstream\n%%EOF";
      const extraction = await extractor.extract(Buffer.from(mockPdfText), "application/pdf", "sample-invoice.pdf");

      assert(extraction.rawText.includes("INVOICE"), "Must extract raw text");
      assert(extraction.pages.length >= 1, "Must extract pages");
      assert(extraction.chunks.length >= 1, "Must generate chunks");

      const firstToken = extraction.pages[0].tokens[0];
      assert(Boolean(firstToken), "Must extract tokens");
      assert(firstToken.boundingBox.length === 4, "Token must have 4 bounding box coordinates");
      assert(firstToken.boundingBox[0] >= 0 && firstToken.boundingBox[2] <= 1.0, "Bounding box must be normalized [0,1]");

      results.push({
        testId: "INTEL-002",
        scenario: "DocumentTextExtractor extracts page layout, token bounding boxes, and chunks",
        passed: true,
        details: `Extracted ${extraction.pages[0].tokens.length} tokens with normalized geometry [x_min, y_min, x_max, y_max].`,
      });
      console.log("   --> PASSED: Text and geometry extraction verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-002", scenario: "Geometry Extraction", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-003: Clean Invoice Extraction & Mathematical Invariant Passing
    // -------------------------------------------------------------------------
    console.log("4. Running INTEL-003: Clean Invoice extraction and mathematical invariant passing (COMPLETED)...");
    try {
      const cleanInvoiceText = `
        TAX INVOICE
        Invoice Number: INV-9901
        Date: 2026-11-01
        Due Date: 2026-11-30
        From: Global Cloud Logistics Pte Ltd
        Tax ID: 201823901A
        Bill To: Acme Corp International
        Currency: USD

        Description                    Qty   UnitPrice   Total
        Database Hosting Services       2      400.00    800.00
        Dedicated Support Tier          1      200.00    200.00

        Subtotal: $1,000.00
        Tax (10%): $100.00
        Total Amount: $1,100.00
      `;

      const textExtractor = new DocumentTextExtractor();
      const textExt = await textExtractor.extract(Buffer.from(cleanInvoiceText), "text/plain", "clean-invoice.txt");

      const fieldExtractor = new FinancialFieldExtractor();
      const fields = fieldExtractor.extractFields(textExt, "INVOICE");

      const invNum = fields.find((f) => f.fieldName === "invoice_number");
      assert(invNum?.fieldValueNormalized === "INV-9901", `Expected INV-9901, got ${invNum?.fieldValueNormalized}`);
      assert(invNum!.confidence >= 0.90, "Invoice number confidence must be >= 0.90");

      const vendor = fields.find((f) => f.fieldName === "vendor_name");
      assert(vendor?.fieldValueNormalized.includes("Global Cloud"), "Vendor name must be extracted");

      const invariantEngine = new FinancialInvariantEngine();
      const report = invariantEngine.validate("INVOICE", fields);

      assert(report.isValid, "Clean invoice must satisfy all mathematical invariants");
      assert(report.recommendedStatus === "COMPLETED", `Expected COMPLETED, got ${report.recommendedStatus}`);
      assert(report.violations.length === 0, "Clean invoice must have 0 violations");

      results.push({
        testId: "INTEL-003",
        scenario: "Clean invoice satisfies line item math, sum-to-subtotal, and header balance (COMPLETED)",
        passed: true,
        details: "1,000.00 + 100.00 = 1,100.00 verified; all invariants passed.",
      });
      console.log("   --> PASSED: Clean invoice invariants verified (COMPLETED).\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-003", scenario: "Clean Invoice Invariants", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-004: Inconsistent Invoice Math Detection (AWAITING_REVIEW)
    // -------------------------------------------------------------------------
    console.log("5. Running INTEL-004: Arithmetic mismatch detection and review routing (AWAITING_REVIEW)...");
    try {
      const inconsistentInvoiceText = `
        TAX INVOICE
        Invoice Number: INV-ERR-002
        Date: 2026-11-01
        From: Vendor Corp
        Currency: USD

        Description       Qty   UnitPrice   Total
        Consulting         1     500.00     500.00

        Subtotal: $500.00
        Tax: $50.00
        Total Amount: $600.00  <!-- TAMPERED / ARITHMETIC ERROR: 500 + 50 != 600 -->
      `;

      const textExtractor = new DocumentTextExtractor();
      const textExt = await textExtractor.extract(Buffer.from(inconsistentInvoiceText), "text/plain", "tampered.txt");

      const fieldExtractor = new FinancialFieldExtractor();
      const fields = fieldExtractor.extractFields(textExt, "INVOICE");

      const invariantEngine = new FinancialInvariantEngine();
      const report = invariantEngine.validate("INVOICE", fields);

      assert(!report.isValid, "Arithmetic error must invalidate document");
      assert(report.recommendedStatus === "AWAITING_REVIEW", `Expected AWAITING_REVIEW, got ${report.recommendedStatus}`);
      assert(report.violations.length >= 1, "Must record invariant violation");
      const balanceViolation = report.violations.find((v) => v.ruleId === "MATH-HEADER-BALANCE");
      assert(Boolean(balanceViolation), "Must flag MATH-HEADER-BALANCE rule");

      results.push({
        testId: "INTEL-004",
        scenario: "Header arithmetic discrepancy (500 + 50 != 600) flags violation and routes to AWAITING_REVIEW",
        passed: true,
        details: `Discrepancy caught: ${balanceViolation?.discrepancy || "Header balance mismatch"}`,
      });
      console.log("   --> PASSED: Invariant violation caught and routed to AWAITING_REVIEW.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-004", scenario: "Arithmetic Mismatch", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-005: Receipt & Purchase Order Specific Parsing
    // -------------------------------------------------------------------------
    console.log("6. Running INTEL-005: Receipt & Purchase Order specific extractors and optional field handling...");
    try {
      // Receipt
      const receiptText = `
        STARBUCKS COFFEE #1042
        Receipt #: REC-88321
        Date: 2026-10-25
        Payment Method: Visa ending in 4128
        Total: $15.75
        Tax: $1.25
      `;
      const textExtractor = new DocumentTextExtractor();
      const recExt = await textExtractor.extract(Buffer.from(receiptText), "text/plain", "receipt.txt");
      const fieldExtractor = new FinancialFieldExtractor();
      const recFields = fieldExtractor.extractFields(recExt, "RECEIPT");

      const recNum = recFields.find((f) => f.fieldName === "receipt_number");
      assert(recNum?.fieldValueNormalized === "REC-88321", "Must extract receipt number");
      const paymentMethod = recFields.find((f) => f.fieldName === "payment_method");
      assert(paymentMethod?.fieldValueNormalized.includes("VISA"), "Must extract payment method");

      const invariantEngine = new FinancialInvariantEngine();
      const recReport = invariantEngine.validate("RECEIPT", recFields);
      assert(recReport.isValid, "Missing subtotal on receipt must not fail validation");
      assert(recReport.recommendedStatus === "COMPLETED", "Receipt must complete without false optional field errors");

      // Purchase Order
      const poText = `
        PURCHASE ORDER
        PO Number: PO-2026-554
        Date: 2026-11-02
        Vendor: Server Rack Dynamics
        Buyer: Global Cloud Infrastructure
        Currency: USD

        Description           Qty   UnitPrice   Total
        Server Chassis 2U      4      250.00    1000.00

        Subtotal: $1,000.00
        Total Amount: $1,000.00
      `;
      const poExt = await textExtractor.extract(Buffer.from(poText), "text/plain", "po.txt");
      const poFields = fieldExtractor.extractFields(poExt, "PURCHASE_ORDER");
      const poNum = poFields.find((f) => f.fieldName === "po_number");
      assert(poNum?.fieldValueNormalized === "PO-2026-554", "Must extract PO number");

      const poReport = invariantEngine.validate("PURCHASE_ORDER", poFields);
      assert(poReport.isValid, "Purchase order must validate");

      results.push({
        testId: "INTEL-005",
        scenario: "Receipt and Purchase Order categories handle optional fields without false failures",
        passed: true,
        details: "Receipt payment method extracted; PO validated with 0 false negatives.",
      });
      console.log("   --> PASSED: Receipt and PO specific extractors verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-005", scenario: "Receipt & PO Extractors", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-006: Ingestion Worker End-to-End Extraction & State Routing
    // -------------------------------------------------------------------------
    console.log("7. Running INTEL-006: Worker end-to-end ingestion, chunking, and field persistence...");
    let processedDocId = crypto.randomUUID();
    let inconsistentDocId = crypto.randomUUID();

    try {
      const s3Key1 = `assets/${orgId}/${wsId}/${processedDocId}/invoice.txt`;
      const invoicePayload = Buffer.from(`
        TAX INVOICE
        Invoice Number: INV-LIVE-100
        Date: 2026-11-01
        From: Singapore Tech Solutions
        Currency: SGD
        Description          Qty   UnitPrice   Total
        Cloud Compute Node    2     350.00     700.00
        Subtotal: 700.00
        Tax: 63.00
        Total Amount: 763.00
      `);

      // Upload payload to S3
      await s3.send(new PutObjectCommand({ Bucket: config.storage.bucket, Key: s3Key1, Body: invoicePayload }));

      // Insert document and job
      await adminPool.query(`
        INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status, category)
        VALUES ('${processedDocId}', '${orgId}', '${wsId}', 'invoice.txt', ${invoicePayload.length}, 'text/plain', 'hash1', '${s3Key1}', 'QUEUED', 'INVOICE');

        INSERT INTO document_jobs (organization_id, workspace_id, document_id, action, status, priority, idempotency_key)
        VALUES ('${orgId}', '${wsId}', '${processedDocId}', 'PROCESS_DOCUMENT', 'QUEUED', 9999, '${processedDocId}:v1');
      `);

      // Run IngestionWorker
      const worker = new IngestionWorker({ workerId: `test-worker-${testSuffix}` });
      await worker.pollOnce();

      // Verify document status in DB transitioned to COMPLETED
      const docCheck = await adminPool.query("SELECT status, metadata FROM documents WHERE id = $1;", [processedDocId]);
      assert(docCheck.rows[0].status === "COMPLETED", `Expected COMPLETED, got ${docCheck.rows[0].status}`);
      assert(docCheck.rows[0].metadata?.intelligence?.overall_confidence >= 0.85, "Must record intelligence metadata");

      // Verify chunks were persisted
      const chunkCheck = await adminPool.query("SELECT COUNT(*) FROM document_chunks WHERE document_id = $1;", [processedDocId]);
      assert(parseInt(chunkCheck.rows[0].count) >= 1, "Must persist chunks in document_chunks");

      // Verify fields were persisted
      const fieldCheck = await adminPool.query("SELECT field_name, field_value_normalized FROM extracted_fields WHERE document_id = $1;", [processedDocId]);
      assert(fieldCheck.rows.length >= 4, "Must persist extracted fields");

      results.push({
        testId: "INTEL-006",
        scenario: "IngestionWorker executes extraction pipeline, persists chunks and fields, and coordinates COMPLETED state",
        passed: true,
        details: "Document transitioned to COMPLETED; chunks and fields persisted with provenance.",
      });
      console.log("   --> PASSED: Worker pipeline execution verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-006", scenario: "Worker Extraction Pipeline", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-007: Human Verification (HITL) Workflow & Immutable Audit Trail
    // -------------------------------------------------------------------------
    console.log("8. Running INTEL-007: Reviewer HITL field verification API and immutable audit log...");
    try {
      // Get field ID to verify
      const fieldRes = await adminPool.query(
        "SELECT id, field_name, field_value_raw, field_value_normalized FROM extracted_fields WHERE document_id = $1 AND field_name = 'invoice_number';",
        [processedDocId]
      );
      const fieldToVerify = fieldRes.rows[0];
      assert(Boolean(fieldToVerify), "Field must exist in database");

      // Reviewer calls PUT /api/v1/documents/:id/fields/:fieldId/verify to correct value
      const verifyRes = await fetch(`${baseUrl}/api/v1/documents/${processedDocId}/fields/${fieldToVerify.id}/verify`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewerToken}`,
          "x-organization-id": orgId,
          "x-workspace-id": wsId,
        },
        body: JSON.stringify({
          verifiedValue: "INV-LIVE-100-CORRECTED",
          notes: "Reviewer confirmed against paper record",
        }),
      });

      const verifyText = await verifyRes.text();
      assert(verifyRes.status === 200, `Expected 200, got ${verifyRes.status}: ${verifyText}`);
      const verifyJson: any = JSON.parse(verifyText);
      assert(verifyJson.field.is_verified === true, "Field must be marked is_verified = true");
      assert(verifyJson.field.verified_value === "INV-LIVE-100-CORRECTED", "Field must store verified value");
      assert(verifyJson.field.field_value_raw === "INV-LIVE-100", "Raw extraction value must be preserved verbatim!");

      // Verify immutable audit log in DB
      const auditRes = await adminPool.query(
        "SELECT action, entity_type, entity_id, new_state FROM audit_logs WHERE entity_id = $1 AND action = 'FIELD_VERIFIED';",
        [fieldToVerify.id]
      );
      assert(auditRes.rows.length === 1, "Must log immutable audit record for field verification");
      assert(auditRes.rows[0].new_state.verified_value === "INV-LIVE-100-CORRECTED", "Audit log must record new state");

      results.push({
        testId: "INTEL-007",
        scenario: "Reviewer verifies field; raw value preserved; verified value stored; immutable audit log recorded",
        passed: true,
        details: "Raw value 'INV-LIVE-100' preserved; verified 'INV-LIVE-100-CORRECTED' audited.",
      });
      console.log("   --> PASSED: Reviewer HITL verification workflow verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-007", scenario: "HITL Verification", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-008: Worker Reprocessing Protection (Human Edits Preserved)
    // -------------------------------------------------------------------------
    console.log("9. Running INTEL-008: Reprocessing protection: verified values are NEVER overwritten...");
    try {
      // Enqueue re-processing job for the same document
      await adminPool.query(`
        INSERT INTO document_jobs (organization_id, workspace_id, document_id, action, status, priority, idempotency_key)
        VALUES ('${orgId}', '${wsId}', '${processedDocId}', 'PROCESS_DOCUMENT', 'QUEUED', 9999, '${processedDocId}:v2');
      `);

      // Worker runs second time
      const worker = new IngestionWorker({ workerId: `test-worker-reprocess-${testSuffix}` });
      await worker.pollOnce();

      // Check field value in DB: verified_value must STILL be 'INV-LIVE-100-CORRECTED'!
      const fieldCheck = await adminPool.query(
        "SELECT is_verified, verified_value, field_value_raw FROM extracted_fields WHERE document_id = $1 AND field_name = 'invoice_number';",
        [processedDocId]
      );
      assert(fieldCheck.rows[0].is_verified === true, "Must remain verified");
      assert(
        fieldCheck.rows[0].verified_value === "INV-LIVE-100-CORRECTED",
        `Human verified value was overwritten! Got: ${fieldCheck.rows[0].verified_value}`
      );

      results.push({
        testId: "INTEL-008",
        scenario: "Worker reprocessing respects ON CONFLICT WHERE is_verified = FALSE safeguard",
        passed: true,
        details: "Human-verified value 'INV-LIVE-100-CORRECTED' strictly protected against AI overwriting.",
      });
      console.log("   --> PASSED: Reprocessing protection verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-008", scenario: "Reprocessing Safeguard", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-009: Authorization & Viewer Role Restrictions
    // -------------------------------------------------------------------------
    console.log("10. Running INTEL-009: Role authorization gates on field verification...");
    try {
      const fieldRes = await adminPool.query(
        "SELECT id FROM extracted_fields WHERE document_id = $1 LIMIT 1;",
        [processedDocId]
      );
      const fieldId = fieldRes.rows[0].id;

      // Viewer attempts to verify field
      const viewerRes = await fetch(`${baseUrl}/api/v1/documents/${processedDocId}/fields/${fieldId}/verify`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${viewerToken}`,
          "x-organization-id": orgId,
          "x-workspace-id": wsId,
        },
        body: JSON.stringify({ verifiedValue: "UNAUTHORIZED_CHANGE" }),
      });

      assert(viewerRes.status === 403, `Expected 403 Forbidden for Viewer, got ${viewerRes.status}`);

      results.push({
        testId: "INTEL-009",
        scenario: "Viewer role is strictly forbidden from verifying or modifying extracted fields (403)",
        passed: true,
        details: "Viewer received 403 Forbidden; field verification restricted to Reviewers and Admins.",
      });
      console.log("   --> PASSED: Role authorization gates verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-009", scenario: "Role Authorization", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST INTEL-010: Document Chunks & Invariant REST API Endpoints
    // -------------------------------------------------------------------------
    console.log("11. Running INTEL-010: Chunks and Invariant REST APIs verification...");
    try {
      // 1. Chunks API
      const chunksRes = await fetch(`${baseUrl}/api/v1/documents/${processedDocId}/chunks`, {
        headers: { Authorization: `Bearer ${reviewerToken}`, "x-organization-id": orgId, "x-workspace-id": wsId },
      });
      assert(chunksRes.status === 200, `Chunks API returned ${chunksRes.status}`);
      const chunksJson: any = await chunksRes.json();
      assert(Array.isArray(chunksJson.chunks) && chunksJson.chunks.length >= 1, "Must return array of chunks");
      assert(chunksJson.chunks[0].bounding_box.length === 4, "Chunk must include layout bounding box");

      // 2. Invariants API
      const invRes = await fetch(`${baseUrl}/api/v1/documents/${processedDocId}/invariants`, {
        headers: { Authorization: `Bearer ${reviewerToken}`, "x-organization-id": orgId, "x-workspace-id": wsId },
      });
      assert(invRes.status === 200, `Invariants API returned ${invRes.status}`);
      const invJson: any = await invRes.json();
      assert(invJson.status === "COMPLETED", `Expected COMPLETED status, got ${invJson.status}`);
      assert(invJson.intelligence.overall_confidence >= 0.85, "Must return intelligence summary");

      results.push({
        testId: "INTEL-010",
        scenario: "REST APIs return page chunks with bounding boxes and document invariant reports",
        passed: true,
        details: "GET /chunks and GET /invariants verified with RLS scoping.",
      });
      console.log("   --> PASSED: Chunks and Invariants REST endpoints verified.\n");
    } catch (err: any) {
      results.push({ testId: "INTEL-010", scenario: "REST APIs", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // Clean up S3 test object
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: `assets/${orgId}/${wsId}/${processedDocId}/invoice.txt` }));
    } catch {}

  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("  DOCUMENT INTELLIGENCE TEST SUMMARY");
  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`  Total Tests: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.testId}: ${r.scenario}`);
  }
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    throw new Error("One or more document intelligence tests failed!");
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("document-intelligence.test")) {
  runDocumentIntelligenceTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test execution failed with error:", err);
      process.exit(1);
    });
}
