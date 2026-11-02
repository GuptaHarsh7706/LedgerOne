import "../src/dns-resolver.js";
import { createApp } from "../src/app.js";
import { appPool, adminPool } from "../src/db/tenant-context.js";
import { s3 } from "../src/storage.js";
import { config } from "../src/config.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import http from "node:http";

// Simple test assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 2: IDENTITY, MULTI-TENANCY & RBAC INTEGRATION TEST SUITE");
  console.log("================================================================================");

  const app = createApp();
  let server: http.Server;
  let baseUrl: string;

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      console.log(`Test Express server running at ${baseUrl}`);
      resolve();
    });
  });

  const testSuffix = Date.now().toString(36);
  const adminEmail = `admin-${testSuffix}@example.com`;
  const analystEmail = `analyst-${testSuffix}@example.com`;
  const password = "SuperSecurePassword2026!";

  let adminToken: string;
  let adminRefreshToken: string;
  let adminUserId: string;
  let orgId: string;
  let defaultWsId: string;
  let financeWsId: string;
  let analystUserId: string;
  let analystToken: string;

  try {
    // -------------------------------------------------------------------------
    // 1. AUTH-001: Registration & Duplicate Email Rejection
    // -------------------------------------------------------------------------
    console.log("\n1. Running AUTH-001: Registration & Duplicate Email Rejection...");
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password: password,
        fullName: "Test Admin User",
      }),
    });

    if (regRes.status !== 201) {
      const errBody = await regRes.text();
      console.error("Registration error body:", errBody);
    }
    assert(regRes.status === 201, `Registration returned status ${regRes.status}`);
    const regData = await regRes.json() as any;
    assert(Boolean(regData.user.id), "Registration must return user ID");
    assert(regData.user.email === adminEmail, "Returned email must match");
    assert(regData.user.password_hash === undefined, "Password hash must NEVER be exposed");
    adminUserId = regData.user.id;

    // Test duplicate registration
    const dupRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password: password,
        fullName: "Duplicate User",
      }),
    });
    assert(dupRes.status === 400, `Duplicate registration must be rejected with 400, got ${dupRes.status}`);
    console.log("   --> PASSED: User registered and duplicate email properly rejected.");

    // -------------------------------------------------------------------------
    // 2. AUTH-002: Authentication & JWT Issuance
    // -------------------------------------------------------------------------
    console.log("\n2. Running AUTH-002: Authentication & JWT Issuance...");
    // Invalid password test
    const badLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: "WrongPassword!" }),
    });
    assert(badLogin.status === 401, `Invalid login must return 401, got ${badLogin.status}`);

    // Valid login test
    const goodLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: password }),
    });
    assert(goodLogin.status === 200, `Valid login must return 200, got ${goodLogin.status}`);
    const loginData = await goodLogin.json() as any;
    assert(Boolean(loginData.accessToken), "Access token must be provided");
    assert(Boolean(loginData.refreshToken), "Refresh token must be provided");
    adminToken = loginData.accessToken;
    adminRefreshToken = loginData.refreshToken;
    console.log("   --> PASSED: Valid credentials authenticated; JWT tokens issued.");

    // -------------------------------------------------------------------------
    // 3. AUTH-003: JWT Verification & Refresh Token Flow
    // -------------------------------------------------------------------------
    console.log("\n3. Running AUTH-003: JWT Verification & Refresh Token Flow...");
    // Tampered token test
    const tamperedRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}TAMPERED` },
    });
    assert(tamperedRes.status === 401, `Tampered token must return 401, got ${tamperedRes.status}`);

    // Valid /me check
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(meRes.status === 200, `/api/v1/auth/me must return 200, got ${meRes.status}`);
    const meData = await meRes.json() as any;
    assert(meData.user.id === adminUserId, "Returned user ID must match logged-in user");

    // Refresh token flow
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });
    assert(refreshRes.status === 200, `Refresh must return 200, got ${refreshRes.status}`);
    const refreshData = await refreshRes.json() as any;
    assert(Boolean(refreshData.accessToken), "New access token must be returned");
    console.log("   --> PASSED: Token tamper check passed and refresh flow issued new token.");

    // -------------------------------------------------------------------------
    // 4. TENANT-001: Organization Onboarding & Default Workspace
    // -------------------------------------------------------------------------
    console.log("\n4. Running TENANT-001: Organization Onboarding & Default Workspace...");
    const orgSlug = `test-org-${testSuffix}`;
    const orgRes = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: `Acme Corp ${testSuffix}`,
        slug: orgSlug,
      }),
    });

    if (orgRes.status !== 201) {
      console.error("Org creation error:", await orgRes.text());
    }
    assert(orgRes.status === 201, `Organization creation returned ${orgRes.status}`);
    const orgData = await orgRes.json() as any;
    assert(Boolean(orgData.organization.id), "Must return created organization");
    assert(Boolean(orgData.defaultWorkspace.id), "Must return default workspace");
    assert(orgData.defaultWorkspace.slug === "general", "Default workspace slug must be 'general'");
    orgId = orgData.organization.id;
    defaultWsId = orgData.defaultWorkspace.id;

    // Verify creator is ORGANIZATION_ADMIN in database
    const client = await adminPool.connect();
    try {
      const memberCheck = await client.query(
        "SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2;",
        [orgId, adminUserId]
      );
      assert(memberCheck.rows[0].role === "ORGANIZATION_ADMIN", "Creator must be ORGANIZATION_ADMIN");

      const auditCheck = await client.query(
        "SELECT action, entity_type FROM audit_logs WHERE organization_id = $1 ORDER BY created_at ASC;",
        [orgId]
      );
      assert(auditCheck.rows.length > 0, "Audit logs must record organization creation");
      assert(auditCheck.rows[0].action === "ORGANIZATION_CREATED", "Audit action must be ORGANIZATION_CREATED");
    } finally {
      client.release();
    }
    console.log("   --> PASSED: Organization onboarded with default workspace and admin role.");

    // -------------------------------------------------------------------------
    // 5. TENANT-002: Multi-Workspace Creation & RLS Boundary Verification
    // -------------------------------------------------------------------------
    console.log("\n5. Running TENANT-002: Multi-Workspace Scoping & RLS Boundary Verification...");
    // Create second workspace "Finance"
    const wsRes = await fetch(`${baseUrl}/api/v1/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-organization-id": orgId,
      },
      body: JSON.stringify({
        name: "Finance Department",
        slug: `finance-${testSuffix}`,
      }),
    });
    assert(wsRes.status === 201, `Workspace creation returned ${wsRes.status}`);
    const wsData = await wsRes.json() as any;
    financeWsId = wsData.workspace.id;

    // Register second user: Analyst
    const regAnalyst = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: analystEmail,
        password: password,
        fullName: "Analyst User",
      }),
    });
    const analystRegData = await regAnalyst.json() as any;
    analystUserId = analystRegData.user.id;

    // Add analyst to organization as MEMBER
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(
        "INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'MEMBER');",
        [orgId, analystUserId]
      );
    } finally {
      adminClient.release();
    }

    // Add analyst to "Finance" workspace with role "ANALYST"
    const addMemberRes = await fetch(`${baseUrl}/api/v1/workspaces/${financeWsId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-organization-id": orgId,
      },
      body: JSON.stringify({
        targetUserId: analystUserId,
        role: "ANALYST",
      }),
    });
    assert(addMemberRes.status === 201, `Add member returned ${addMemberRes.status}`);

    // Login as Analyst
    const analystLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: analystEmail, password: password }),
    });
    const analystLoginData = await analystLogin.json() as any;
    analystToken = analystLoginData.accessToken;

    // Analyst lists workspaces: must only see "Finance", NOT "General"!
    const analystWsList = await fetch(`${baseUrl}/api/v1/workspaces`, {
      headers: {
        Authorization: `Bearer ${analystToken}`,
        "x-organization-id": orgId,
      },
    });
    assert(analystWsList.status === 200, `Analyst workspace list returned ${analystWsList.status}`);
    const analystWorkspaces = (await analystWsList.json() as any).workspaces;
    assert(
      analystWorkspaces.length === 1 && analystWorkspaces[0].id === financeWsId,
      `RLS violation: Analyst should only see 1 workspace (Finance), saw ${analystWorkspaces.length}`
    );
    console.log("   --> PASSED: RLS successfully isolated workspaces across ordinary users.");

    // -------------------------------------------------------------------------
    // 6. RBAC-001: 6-Role Permission Enforcement
    // -------------------------------------------------------------------------
    console.log("\n6. Running RBAC-001: Role-Based Permission Enforcement...");
    // Analyst attempts to create a workspace -> Must be 403 Forbidden
    const forbiddenCreateWs = await fetch(`${baseUrl}/api/v1/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${analystToken}`,
        "x-organization-id": orgId,
      },
      body: JSON.stringify({ name: "Unauthorized WS", slug: "unauth" }),
    });
    assert(forbiddenCreateWs.status === 403, `Non-admin workspace create must return 403, got ${forbiddenCreateWs.status}`);

    // Analyst (role ANALYST) attempts to upload document -> Must be 403 Forbidden
    const forbiddenUpload = await fetch(`${baseUrl}/api/v1/documents/upload-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${analystToken}`,
        "x-organization-id": orgId,
        "x-workspace-id": financeWsId,
      },
      body: JSON.stringify({
        filename: "test.pdf",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
        sha256Hash: crypto.createHash("sha256").update("sample").digest("hex"),
      }),
    });
    assert(forbiddenUpload.status === 403, `Analyst upload intent must return 403, got ${forbiddenUpload.status}`);
    console.log("   --> PASSED: 6-role permission gates strictly blocked unauthorized actions.");

    // -------------------------------------------------------------------------
    // 7. E2E-SAGA-001: End-to-End Document Ingestion Saga via HTTP API
    // -------------------------------------------------------------------------
    console.log("\n7. Running E2E-SAGA-001: Document Ingestion Saga via HTTP API...");
    const samplePdfContent = Buffer.from("%PDF-1.4 sample content for E2E integration test\n%%EOF");
    const sampleHash = crypto.createHash("sha256").update(samplePdfContent).digest("hex");

    // Phase 1: Upload Intent by Admin (DOCUMENT_MANAGER / ORG_ADMIN)
    const intentRes = await fetch(`${baseUrl}/api/v1/documents/upload-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-organization-id": orgId,
        "x-workspace-id": defaultWsId,
      },
      body: JSON.stringify({
        filename: "invoice-2026-001.pdf",
        fileSizeBytes: samplePdfContent.length,
        mimeType: "application/pdf",
        sha256Hash: sampleHash,
        category: "INVOICE",
      }),
    });

    assert(intentRes.status === 201, `Upload intent returned ${intentRes.status}`);
    const intentData = await intentRes.json() as any;
    assert(Boolean(intentData.documentId), "Document ID must be returned");
    assert(Boolean(intentData.s3Key), "S3 Key must be returned");
    assert(Boolean(intentData.presignedPutUrl), "Presigned PUT URL must be returned");
    const docId = intentData.documentId;

    // Direct S3 Upload via S3 SDK using provisioned key (emulating client presigned PUT)
    await s3.send(
      new PutObjectCommand({
        Bucket: config.storage.bucket,
        Key: intentData.s3Key,
        Body: samplePdfContent,
        ContentType: "application/pdf",
      })
    );

    // Phase 2: Confirm Upload
    const confirmRes = await fetch(`${baseUrl}/api/v1/documents/${docId}/confirm-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-organization-id": orgId,
        "x-workspace-id": defaultWsId,
      },
    });

    assert(confirmRes.status === 200, `Confirm upload returned ${confirmRes.status}`);
    const confirmData = await confirmRes.json() as any;
    assert(confirmData.status === "QUEUED", `Document status must be QUEUED, got ${confirmData.status}`);
    assert(Boolean(confirmData.jobId), "Document job ID must be generated");

    // Query Document via REST API
    const docGetRes = await fetch(`${baseUrl}/api/v1/documents/${docId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "x-organization-id": orgId,
        "x-workspace-id": defaultWsId,
      },
    });
    assert(docGetRes.status === 200, `Get document returned ${docGetRes.status}`);
    const fetchedDoc = (await docGetRes.json() as any).document;
    assert(fetchedDoc.status === "QUEUED", "Fetched document status must be QUEUED");

    // Query Job Status via REST API
    const jobGetRes = await fetch(`${baseUrl}/api/v1/jobs/${confirmData.jobId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "x-organization-id": orgId,
        "x-workspace-id": defaultWsId,
      },
    });
    assert(jobGetRes.status === 200, `Get job returned ${jobGetRes.status}`);
    const fetchedJob = (await jobGetRes.json() as any).job;
    assert(fetchedJob.status === "QUEUED", "Fetched job status must be QUEUED");
    console.log("   --> PASSED: End-to-end upload saga completed; document & job queued.");

    console.log("\n================================================================================");
    console.log("  PHASE 2 INTEGRATION TEST SUMMARY");
    console.log("================================================================================");
    console.log("  Total Tests: 7 | Passed: 7 | Failed: 0");
    console.log("  [PASS] AUTH-001: User registration and duplicate email rejection");
    console.log("  [PASS] AUTH-002: Password verification and JWT token issuance");
    console.log("  [PASS] AUTH-003: JWT tampering prevention and refresh token flow");
    console.log("  [PASS] TENANT-001: Organization onboarding, default workspace, and admin role");
    console.log("  [PASS] TENANT-002: Multi-workspace creation and RLS isolation across users");
    console.log("  [PASS] RBAC-001: Role-based permission enforcement on documents & workspaces");
    console.log("  [PASS] E2E-SAGA-001: HTTP-driven upload intent, S3 put, confirmation, and job queueing");
    console.log("================================================================================\n");

  } finally {
    server.close();
    await appPool.end();
    await adminPool.end();
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
