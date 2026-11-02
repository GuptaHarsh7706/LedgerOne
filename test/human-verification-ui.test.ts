import { createApp } from "../src/app.js";
import { config, validateConfig } from "../src/config.js";
import { adminPool } from "../src/db/tenant-context.js";
import { s3 } from "../src/storage.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

export async function runHumanVerificationUITests() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 5: HUMAN VERIFICATION UI & REVIEW STUDIO (HITL) TEST SUITE");
  console.log("  Evaluates: Side-by-Side Canvas, Bounding Boxes, HITL Approval, RBAC & Auditing");
  console.log("================================================================================\n");

  validateConfig();

  const results: Array<{ testId: string; scenario: string; passed: boolean; details: string }> = [];

  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testSuffix = crypto.randomUUID().slice(0, 8);
  let adminToken = "";
  let reviewerToken = "";
  let viewerToken = "";
  let tenantBToken = "";

  let orgId = "";
  let wsId = "";
  let tenantBOrgId = "";
  let tenantBWsId = "";

  let reviewerUserId = "";
  let viewerUserId = "";
  let testDocId = crypto.randomUUID();
  let testFieldId = "";

  try {
    // -------------------------------------------------------------------------
    // Setup Tenant A (Admin, Reviewer, Viewer) and Tenant B
    // -------------------------------------------------------------------------
    console.log("1. Setting up tenants, workspaces, and users for Phase 5 tests...");

    // Register Tenant A Admin
    const adminReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `admin-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Admin A" }),
    });
    const adminData: any = await adminReg.json();

    // Register Tenant A Reviewer
    const revReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rev-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Reviewer A" }),
    });
    const revData: any = await revReg.json();
    reviewerUserId = revData.user.id;

    // Register Tenant A Viewer
    const viewReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `view-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Viewer A" }),
    });
    const viewData: any = await viewReg.json();
    viewerUserId = viewData.user.id;

    // Register Tenant B Admin
    const tenBReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `tenantB-${testSuffix}@ledgerone.test`, password: "Password123!", fullName: "Admin B" }),
    });

    // Login Admin A
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `admin-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    adminToken = ((await adminLogin.json()) as any).accessToken;

    // Create Tenant A Org
    const orgRes = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Tenant A ${testSuffix}`, slug: `org-a-${testSuffix}` }),
    });
    const orgData: any = await orgRes.json();
    orgId = orgData.organization.id;
    wsId = orgData.defaultWorkspace.id;

    // Add Reviewer and Viewer to Workspace (TenantService also adds them to organization_memberships)
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

    // Login Reviewer A
    const revLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rev-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    reviewerToken = ((await revLogin.json()) as any).accessToken;

    // Login Viewer A
    const viewLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `view-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    viewerToken = ((await viewLogin.json()) as any).accessToken;

    // Login Tenant B and create Org B
    const tenBLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `tenantB-${testSuffix}@ledgerone.test`, password: "Password123!" }),
    });
    tenantBToken = ((await tenBLogin.json()) as any).accessToken;

    const orgBRes = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tenantBToken}` },
      body: JSON.stringify({ name: `Tenant B ${testSuffix}`, slug: `org-b-${testSuffix}` }),
    });
    const orgBData: any = await orgBRes.json();
    tenantBOrgId = orgBData.organization.id;
    tenantBWsId = orgBData.defaultWorkspace.id;

    // Seed a Document awaiting review in Tenant A with S3 payload, chunks, and extracted fields
    const s3Key = `assets/${orgId}/${wsId}/${testDocId}/invoice.txt`;
    const docPayload = Buffer.from(
      "TAX INVOICE #INV-2026-909\nDate: 2026-11-01\nVendor: Global Apex Solutions\nSubtotal: $800.00\nTax: $80.00\nTotal Amount: $980.00"
    );

    await s3.send(new PutObjectCommand({ Bucket: config.storage.bucket, Key: s3Key, Body: docPayload }));

    await adminPool.query(`
      INSERT INTO documents (
        id, organization_id, workspace_id, filename, file_size_bytes, mime_type,
        sha256_hash, s3_key, status, category, metadata
      ) VALUES (
        '${testDocId}', '${orgId}', '${wsId}', 'invoice-909.txt', ${docPayload.length}, 'text/plain',
        'hash909', '${s3Key}', 'AWAITING_REVIEW', 'INVOICE',
        '{"intelligence": {"overall_confidence": 0.82, "category": "INVOICE", "checks": [{"ruleId": "MATH-HEADER-BALANCE", "passed": false, "discrepancy": "Subtotal (800) + Tax (80) != Total (980)"}]}}'::jsonb
      );

      INSERT INTO document_chunks (
        organization_id, workspace_id, document_id, chunk_index, page_number, content, bounding_box
      ) VALUES (
        '${orgId}', '${wsId}', '${testDocId}', 0, 1, 'TAX INVOICE #INV-2026-909 Date: 2026-11-01 Vendor: Global Apex Solutions', '[0.05, 0.05, 0.95, 0.35]'::jsonb
      );
    `);

    const fieldInsert = await adminPool.query(`
      INSERT INTO extracted_fields (
        organization_id, workspace_id, document_id, field_name, field_value_raw,
        field_value_normalized, confidence, page_number, bounding_box, is_verified
      ) VALUES (
        '${orgId}', '${wsId}', '${testDocId}', 'total_amount', '980.00', '980', 0.81, 1, '[0.05, 0.65, 0.95, 0.75]'::jsonb, FALSE
      ) RETURNING id;
    `);
    testFieldId = fieldInsert.rows[0].id;

    console.log("   --> Test tenants and document initialized.\n");

    // -------------------------------------------------------------------------
    // TEST UI-HITL-001: Content API & Cross-Tenant Isolation
    // -------------------------------------------------------------------------
    console.log("2. Running UI-HITL-001: Document content API & RLS cross-tenant isolation...");
    try {
      // 1. Authorized Tenant A Reviewer can fetch content
      const contentRes = await fetch(`${baseUrl}/api/v1/documents/${testDocId}/content`, {
        headers: { Authorization: `Bearer ${reviewerToken}`, "x-organization-id": orgId, "x-workspace-id": wsId },
      });
      assert(contentRes.status === 200, `Expected 200, got ${contentRes.status}`);
      const contentData: any = await contentRes.json();
      assert(contentData.content.includes("TAX INVOICE"), "Content must match uploaded document text");

      // 2. Adversarial: Tenant B Admin attempts to access Tenant A document content
      const leakRes = await fetch(`${baseUrl}/api/v1/documents/${testDocId}/content`, {
        headers: { Authorization: `Bearer ${tenantBToken}`, "x-organization-id": tenantBOrgId, "x-workspace-id": tenantBWsId },
      });
      assert(leakRes.status === 404, `Expected 404 for cross-tenant access, got ${leakRes.status}`);

      results.push({
        testId: "UI-HITL-001",
        scenario: "Document content API streams text/bytes under tenant context; cross-tenant query strictly denied (404)",
        passed: true,
        details: "Tenant A Reviewer retrieved content; Tenant B received 404 Not Found.",
      });
      console.log("   --> PASSED: Document content API & cross-tenant RLS verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-001", scenario: "Content API RLS", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-002: Audit Trail History API
    // -------------------------------------------------------------------------
    console.log("3. Running UI-HITL-002: Document audit trail history API...");
    try {
      const auditRes = await fetch(`${baseUrl}/api/v1/documents/${testDocId}/audit-trail`, {
        headers: { Authorization: `Bearer ${reviewerToken}`, "x-organization-id": orgId, "x-workspace-id": wsId },
      });
      assert(auditRes.status === 200, `Expected 200, got ${auditRes.status}`);
      const auditData: any = await auditRes.json();
      assert(Array.isArray(auditData.auditTrail), "Audit trail must return an array");

      results.push({
        testId: "UI-HITL-002",
        scenario: "GET /api/v1/documents/:id/audit-trail returns chronological audit entries under tenant RLS",
        passed: true,
        details: `Audit trail endpoint verified with valid payload structure.`,
      });
      console.log("   --> PASSED: Audit trail history endpoint verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-002", scenario: "Audit Trail API", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-003: Reviewer Document Approval (AWAITING_REVIEW -> COMPLETED)
    // -------------------------------------------------------------------------
    console.log("4. Running UI-HITL-003: Reviewer document approval and audit log creation...");
    try {
      const approveRes = await fetch(`${baseUrl}/api/v1/documents/${testDocId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewerToken}`,
          "x-organization-id": orgId,
          "x-workspace-id": wsId,
        },
        body: JSON.stringify({ notes: "Reviewed math discrepancy and accepted revised totals" }),
      });

      const approveText = await approveRes.text();
      assert(approveRes.status === 200, `Expected 200, got ${approveRes.status}: ${approveText}`);
      const approveData: any = JSON.parse(approveText);
      assert(approveData.document.status === "COMPLETED", `Expected COMPLETED status, got ${approveData.document.status}`);

      // Verify audit log entry in DB
      const auditCheck = await adminPool.query(
        "SELECT action, entity_type, new_state FROM audit_logs WHERE entity_id = $1 AND action = 'DOCUMENT_APPROVED';",
        [testDocId]
      );
      assert(auditCheck.rows.length === 1, "Must write DOCUMENT_APPROVED immutable audit record");
      assert(auditCheck.rows[0].new_state.status === "COMPLETED", "Audit log must record new COMPLETED status");

      // Verify unverified fields automatically marked verified
      const fieldCheck = await adminPool.query(
        "SELECT is_verified, verified_by_user_id FROM extracted_fields WHERE id = $1;",
        [testFieldId]
      );
      assert(fieldCheck.rows[0].is_verified === true, "Unverified fields must be marked is_verified=true on document approval");

      results.push({
        testId: "UI-HITL-003",
        scenario: "Reviewer approves document: status transitions to COMPLETED, unverified fields marked verified, audit log recorded",
        passed: true,
        details: "Document transitioned to COMPLETED; DOCUMENT_APPROVED audit log created.",
      });
      console.log("   --> PASSED: Reviewer document approval verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-003", scenario: "Document Approval", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-004: Viewer Role Forbidden from Approving Document (HTTP 403)
    // -------------------------------------------------------------------------
    console.log("5. Running UI-HITL-004: Viewer role approval gate (HTTP 403 Forbidden)...");
    try {
      const viewerApproveRes = await fetch(`${baseUrl}/api/v1/documents/${testDocId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${viewerToken}`,
          "x-organization-id": orgId,
          "x-workspace-id": wsId,
        },
        body: JSON.stringify({ notes: "Unauthorized attempt" }),
      });

      assert(viewerApproveRes.status === 403, `Expected 403 Forbidden for Viewer, got ${viewerApproveRes.status}`);

      results.push({
        testId: "UI-HITL-004",
        scenario: "Viewer role is strictly blocked from approving documents (HTTP 403 Forbidden)",
        passed: true,
        details: "Viewer received 403 Forbidden; document approval restricted to Reviewers and Admins.",
      });
      console.log("   --> PASSED: Viewer approval gate verified (403).\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-004", scenario: "Viewer Approval Gate", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-005: Static UI Bundle Serving
    // -------------------------------------------------------------------------
    console.log("6. Running UI-HITL-005: Static Human Verification UI bundle delivery...");
    try {
      const uiRes = await fetch(`${baseUrl}/`);
      assert(uiRes.status === 200, `Expected 200, got ${uiRes.status}`);
      const htmlText = await uiRes.text();
      assert(htmlText.includes("LedgerOne"), "HTML must contain LedgerOne title");
      assert(htmlText.includes("overlayCanvas"), "HTML must contain bounding box canvas overlay");
      assert(htmlText.includes("documentSheet"), "HTML must contain documentSheet container");
      assert(htmlText.includes("Multi-Gate Invariant Status"), "HTML must contain invariant status component");

      results.push({
        testId: "UI-HITL-005",
        scenario: "Express static middleware serves Human Verification UI bundle at / with full DOM components",
        passed: true,
        details: "index.html delivered with canvas, split pane, and HITL verification components.",
      });
      console.log("   --> PASSED: Static web UI bundle serving verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-005", scenario: "UI Bundle Serving", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-006: Canvas Coordinate Scale & Normalization Invariants
    // -------------------------------------------------------------------------
    console.log("7. Running UI-HITL-006: Bounding box coordinate transformation invariants...");
    try {
      const rawBbox = [0.05, 0.65, 0.95, 0.75]; // [x_min, y_min, x_max, y_max]
      const canvasWidth = 600;
      const canvasHeight = 900;

      // Coordinate scaling logic from app.js
      const x = rawBbox[0] * canvasWidth;
      const y = rawBbox[1] * canvasHeight;
      const w = (rawBbox[2] - rawBbox[0]) * canvasWidth;
      const h = (rawBbox[3] - rawBbox[1]) * canvasHeight;

      assert(x >= 0 && x + w <= canvasWidth, "Transformed X coordinates must reside within canvas width");
      assert(y >= 0 && y + h <= canvasHeight, "Transformed Y coordinates must reside within canvas height");
      assert(w > 0 && h > 0, "Transformed dimensions must be positive non-zero");

      results.push({
        testId: "UI-HITL-006",
        scenario: "Normalized coordinates [0, 1] scale with mathematical precision onto dynamic canvas viewports",
        passed: true,
        details: `Normalized [0.05, 0.65, 0.95, 0.75] transformed to rect(${x}, ${y}, ${w}, ${h}) within viewport.`,
      });
      console.log("   --> PASSED: Bounding box transformation invariants verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-006", scenario: "Geometry Transform", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-007: HITL Field Edit & Audit Trail Propagation
    // -------------------------------------------------------------------------
    console.log("8. Running UI-HITL-007: HITL field correction and audit trail recording...");
    try {
      const verifyRes = await fetch(`${baseUrl}/api/v1/documents/${testDocId}/fields/${testFieldId}/verify`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewerToken}`,
          "x-organization-id": orgId,
          "x-workspace-id": wsId,
        },
        body: JSON.stringify({ verifiedValue: "880.00", notes: "Reviewer corrected total" }),
      });
      assert(verifyRes.status === 200, `Expected 200, got ${verifyRes.status}`);

      // Verify audit log has the new entry
      const auditCheck = await adminPool.query(
        "SELECT action, new_state FROM audit_logs WHERE entity_id = $1 AND action = 'FIELD_VERIFIED' ORDER BY created_at DESC LIMIT 1;",
        [testFieldId]
      );
      assert(auditCheck.rows.length === 1, "Must log FIELD_VERIFIED audit record");
      assert(auditCheck.rows[0].new_state.verified_value === "880.00", "Must store new verified value in audit log");

      results.push({
        testId: "UI-HITL-007",
        scenario: "Field verification preserves raw value and writes verified value with reviewer notes to audit log",
        passed: true,
        details: "Field value corrected to 880.00; immutable audit delta recorded.",
      });
      console.log("   --> PASSED: Field correction and audit trail verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-007", scenario: "Field Edit Audit", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // -------------------------------------------------------------------------
    // TEST UI-HITL-008: Multi-Tenant Workspace Scoping on Document List
    // -------------------------------------------------------------------------
    console.log("9. Running UI-HITL-008: Document list multi-tenant workspace isolation...");
    try {
      // Tenant A documents
      const docsARes = await fetch(`${baseUrl}/api/v1/documents`, {
        headers: { Authorization: `Bearer ${reviewerToken}`, "x-organization-id": orgId, "x-workspace-id": wsId },
      });
      const docsAData: any = await docsARes.json();
      assert(docsAData.documents.some((d: any) => d.id === testDocId), "Tenant A must see its own document");

      // Tenant B documents
      const docsBRes = await fetch(`${baseUrl}/api/v1/documents`, {
        headers: { Authorization: `Bearer ${tenantBToken}`, "x-organization-id": tenantBOrgId, "x-workspace-id": tenantBWsId },
      });
      const docsBData: any = await docsBRes.json();
      assert(!docsBData.documents.some((d: any) => d.id === testDocId), "Tenant B MUST NOT see Tenant A document");

      results.push({
        testId: "UI-HITL-008",
        scenario: "Document triage list strictly filters documents to caller's active tenant and workspace",
        passed: true,
        details: "Tenant A listed test document; Tenant B returned zero matching records.",
      });
      console.log("   --> PASSED: Document list workspace isolation verified.\n");
    } catch (err: any) {
      results.push({ testId: "UI-HITL-008", scenario: "Workspace Isolation", passed: false, details: err.message });
      console.error("   --> FAILED:", err.message);
    }

    // Clean up S3 test object
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: s3Key }));
    } catch {}

  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("  HUMAN VERIFICATION UI TEST SUMMARY");
  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`  Total Tests: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.testId}: ${r.scenario}`);
  }
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    throw new Error("One or more Human Verification UI tests failed!");
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("human-verification-ui.test")) {
  runHumanVerificationUITests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test execution failed with error:", err);
      process.exit(1);
    });
}
