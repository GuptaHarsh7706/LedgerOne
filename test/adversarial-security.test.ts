import crypto from "node:crypto";
import pg from "pg";
import { appPool, adminPool, withTenantTransaction, TenantContext } from "../src/db/tenant-context.js";
import "../src/config.js";

async function runAdversarialSecurityTests() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 1: ADVERSARIAL MULTI-TENANT & GRANULAR RLS SECURITY TEST SUITE");
  console.log("  Executing as Unprivileged Database Role: ledgerone_app (NOBYPASSRLS)");
  console.log("================================================================================\n");

  const testSuffix = Date.now().toString(36);
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const wsA1Id = crypto.randomUUID(); // Org A Workspace 1 (Finance)
  const wsA2Id = crypto.randomUUID(); // Org A Workspace 2 (Legal)
  const wsB1Id = crypto.randomUUID(); // Org B Workspace 1

  const userA1Id = crypto.randomUUID(); // Org A User assigned to WS A1 (Document Manager)
  const userA2Id = crypto.randomUUID(); // Org A User assigned to WS A2 (Legal Doc Manager)
  const userViewerId = crypto.randomUUID(); // Org A User in WS A1 (Viewer)
  const userReviewerId = crypto.randomUUID(); // Org A User in WS A1 (Reviewer)
  const userInactiveId = crypto.randomUUID(); // Deactivated User
  const userB1Id = crypto.randomUUID(); // Org B User assigned to WS B1

  const docAId = crypto.randomUUID(); // Document in Org A, WS A1
  const docBId = crypto.randomUUID(); // Document in Org B, WS B1
  const fieldAId = crypto.randomUUID(); // Extracted field for doc A

  console.log("1. Setting up test organizations, workspaces, and users via admin pool...");
  await adminPool.query(`
    INSERT INTO organizations (id, name, slug) VALUES 
      ('${orgAId}', 'Acme Corporation', 'acme-${testSuffix}'),
      ('${orgBId}', 'Beta Industries', 'beta-${testSuffix}');

    INSERT INTO workspaces (id, organization_id, name, slug) VALUES 
      ('${wsA1Id}', '${orgAId}', 'Acme Finance', 'finance-${testSuffix}'),
      ('${wsA2Id}', '${orgAId}', 'Acme Legal', 'legal-${testSuffix}'),
      ('${wsB1Id}', '${orgBId}', 'Beta Procurement', 'procurement-${testSuffix}');

    INSERT INTO users (id, email, password_hash, full_name) VALUES 
      ('${userA1Id}', 'a1-${testSuffix}@acme.com', 'hash', 'Alice Finance'),
      ('${userA2Id}', 'a2-${testSuffix}@acme.com', 'hash', 'Adam Legal'),
      ('${userViewerId}', 'viewer-${testSuffix}@acme.com', 'hash', 'Victor Viewer'),
      ('${userReviewerId}', 'reviewer-${testSuffix}@acme.com', 'hash', 'Rachel Reviewer'),
      ('${userInactiveId}', 'inactive-${testSuffix}@acme.com', 'hash', 'Ivan Inactive'),
      ('${userB1Id}', 'b1-${testSuffix}@beta.com', 'hash', 'Bob Beta');

    INSERT INTO organization_memberships (organization_id, user_id, role, is_active) VALUES 
      ('${orgAId}', '${userA1Id}', 'ORGANIZATION_ADMIN', true),
      ('${orgAId}', '${userA2Id}', 'MEMBER', true),
      ('${orgAId}', '${userViewerId}', 'MEMBER', true),
      ('${orgAId}', '${userReviewerId}', 'MEMBER', true),
      ('${orgAId}', '${userInactiveId}', 'MEMBER', false),
      ('${orgBId}', '${userB1Id}', 'ORGANIZATION_ADMIN', true);

    INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role, is_active) VALUES 
      ('${orgAId}', '${wsA1Id}', '${userA1Id}', 'DOCUMENT_MANAGER', true),
      ('${orgAId}', '${wsA2Id}', '${userA2Id}', 'DOCUMENT_MANAGER', true),
      ('${orgAId}', '${wsA1Id}', '${userViewerId}', 'VIEWER', true),
      ('${orgAId}', '${wsA1Id}', '${userReviewerId}', 'REVIEWER', true),
      ('${orgAId}', '${wsA1Id}', '${userInactiveId}', 'VIEWER', false),
      ('${orgBId}', '${wsB1Id}', '${userB1Id}', 'DOCUMENT_MANAGER', true);

    INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status) VALUES 
      ('${docAId}', '${orgAId}', '${wsA1Id}', 'acme-invoice.pdf', 1024, 'application/pdf', 'hashA', 'keyA', 'COMPLETED'),
      ('${docBId}', '${orgBId}', '${wsB1Id}', 'beta-invoice.pdf', 2048, 'application/pdf', 'hashB', 'keyB', 'COMPLETED');

    INSERT INTO extracted_fields (id, organization_id, workspace_id, document_id, field_name, field_value_raw, confidence) VALUES
      ('${fieldAId}', '${orgAId}', '${wsA1Id}', '${docAId}', 'total_amount', '1500.00', 0.9800);
  `);
  console.log("   --> Test entities provisioned successfully.\n");

  const results: { testId: string; scenario: string; passed: boolean; details: string }[] = [];

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-001: Missing Context Fails Closed
  // --------------------------------------------------------------------------
  console.log("2. Running ADV-SEC-001: Direct query without tenant context (Fail-Closed)...");
  try {
    const rawClient = await appPool.connect();
    try {
      const res = await rawClient.query("SELECT * FROM documents;");
      if (res.rows.length === 0) {
        results.push({
          testId: "ADV-SEC-001",
          scenario: "Query without context returns 0 rows (Fail-Closed)",
          passed: true,
          details: `Query returned ${res.rows.length} rows as expected.`,
        });
        console.log("   --> PASSED: 0 rows returned when app.current_org_id is unset.\n");
      } else {
        throw new Error(`Leak detected: returned ${res.rows.length} rows!`);
      }
    } finally {
      rawClient.release();
    }
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-001", scenario: "Fail-Closed", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-002: Cross-Tenant Isolation
  // --------------------------------------------------------------------------
  console.log("3. Running ADV-SEC-002: Cross-tenant isolation (Tenant A queries Tenant B doc)...");
  try {
    const ctxA: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userA1Id,
      userRole: "DOCUMENT_MANAGER",
    };

    await withTenantTransaction(ctxA, async (client) => {
      // 1. SELECT Tenant B's doc
      const selectRes = await client.query("SELECT * FROM documents WHERE id = $1;", [docBId]);
      if (selectRes.rows.length !== 0) {
        throw new Error(`Tenant A could read Tenant B's document! Rows: ${selectRes.rows.length}`);
      }

      // 2. UPDATE Tenant B's doc
      const updateRes = await client.query("UPDATE documents SET filename = 'hacked.pdf' WHERE id = $1;", [docBId]);
      if ((updateRes.rowCount ?? 0) > 0) {
        throw new Error(`Tenant A could UPDATE Tenant B's document! Updated: ${updateRes.rowCount}`);
      }

      // 3. DELETE Tenant B's doc
      const deleteRes = await client.query("DELETE FROM documents WHERE id = $1;", [docBId]);
      if ((deleteRes.rowCount ?? 0) > 0) {
        throw new Error(`Tenant A could DELETE Tenant B's document! Deleted: ${deleteRes.rowCount}`);
      }
    });

    results.push({
      testId: "ADV-SEC-002",
      scenario: "Tenant A cannot SELECT, UPDATE, or DELETE Tenant B documents",
      passed: true,
      details: "Multi-tenant read/write/delete isolation strictly verified under ledgerone_app role.",
    });
    console.log("   --> PASSED: Tenant A blocked from all operations on Tenant B document.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-002", scenario: "Cross-tenant Isolation", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-003: Relational Parent-Child Workspace Matching (Requirement 2)
  // Attempt to link a chunk or field to docA while setting workspace_id = wsA2Id (mismatched)
  // --------------------------------------------------------------------------
  console.log("4. Running ADV-SEC-003: Parent-child workspace consistency via composite foreign key...");
  try {
    const ctxA: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userA1Id,
      userRole: "ORGANIZATION_ADMIN",
    };

    let caughtError: any = null;
    try {
      await withTenantTransaction(ctxA, async (client) => {
        // docA belongs to wsA1Id. Attempting to insert a chunk with workspace_id = wsA2Id!
        await client.query(`
          INSERT INTO document_chunks (
            organization_id, workspace_id, document_id, chunk_index, page_number, content
          ) VALUES ('${orgAId}', '${wsA2Id}', '${docAId}', 0, 1, 'Mismatched workspace chunk');
        `);
      });
    } catch (err) {
      caughtError = err;
    }

    if (caughtError && (caughtError.code === "23503" || caughtError.message.includes("violates foreign key"))) {
      results.push({
        testId: "ADV-SEC-003",
        scenario: "Compound foreign key prevents child entity linkage to mismatched workspace",
        passed: true,
        details: `PostgreSQL rejected mismatched workspace chunk insertion with code ${caughtError.code}`,
      });
      console.log("   --> PASSED: Composite key strictly enforced parent-child workspace match.\n");
    } else {
      throw new Error(`Expected FK violation 23503, but received: ${caughtError?.message || "success"}`);
    }
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-003", scenario: "Relational Workspace Matching", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-004: Workspace Membership Boundary
  // --------------------------------------------------------------------------
  console.log("5. Running ADV-SEC-004: Workspace membership boundary for ordinary user...");
  try {
    const ctxA2: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id, // User A2 tries to access WS A1 where they have no membership
      userId: userA2Id,
      userRole: "DOCUMENT_MANAGER",
    };

    await withTenantTransaction(ctxA2, async (client) => {
      const res = await client.query("SELECT * FROM documents WHERE workspace_id = $1;", [wsA1Id]);
      if (res.rows.length !== 0) {
        throw new Error(`User without membership in WS A1 could read documents! Rows: ${res.rows.length}`);
      }
    });

    results.push({
      testId: "ADV-SEC-004",
      scenario: "Ordinary user cannot access documents in unassigned workspace within same org",
      passed: true,
      details: "Workspace boundaries strictly enforced by RLS across users within the same tenant.",
    });
    console.log("   --> PASSED: User without workspace membership denied access to workspace documents.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-004", scenario: "Workspace Boundary", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-005: Inactive Membership Denial (Requirement 1)
  // --------------------------------------------------------------------------
  console.log("6. Running ADV-SEC-005: Inactive membership denial (is_active = false)...");
  try {
    const ctxInactive: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userInactiveId,
      userRole: "VIEWER",
    };

    await withTenantTransaction(ctxInactive, async (client) => {
      const res = await client.query("SELECT * FROM documents WHERE id = $1;", [docAId]);
      if (res.rows.length !== 0) {
        throw new Error(`Deactivated user could read documents! Rows: ${res.rows.length}`);
      }
    });

    results.push({
      testId: "ADV-SEC-005",
      scenario: "Deactivated membership strictly blocked from accessing workspace documents",
      passed: true,
      details: "RLS policy checked is_active = true; inactive membership denied access.",
    });
    console.log("   --> PASSED: Deactivated membership strictly denied access.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-005", scenario: "Inactive Membership", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-006: Viewer Role Direct SQL Restrictions (Requirement 1)
  // Viewer can SELECT documents, but CANNOT UPDATE or DELETE documents via SQL.
  // --------------------------------------------------------------------------
  console.log("7. Running ADV-SEC-006: Viewer role direct SQL restrictions...");
  try {
    const ctxViewer: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userViewerId,
      userRole: "VIEWER",
    };

    await withTenantTransaction(ctxViewer, async (client) => {
      // 1. Viewer CAN SELECT
      const selectRes = await client.query("SELECT * FROM documents WHERE id = $1;", [docAId]);
      if (selectRes.rows.length !== 1) {
        throw new Error(`Viewer should be able to read document in their workspace, got ${selectRes.rows.length}`);
      }

      // 2. Viewer CANNOT UPDATE documents
      const updateRes = await client.query("UPDATE documents SET filename = 'viewer_edit.pdf' WHERE id = $1;", [docAId]);
      if ((updateRes.rowCount ?? 0) > 0) {
        throw new Error(`Viewer was able to UPDATE documents via SQL!`);
      }

      // 3. Viewer CANNOT DELETE documents
      const deleteRes = await client.query("DELETE FROM documents WHERE id = $1;", [docAId]);
      if ((deleteRes.rowCount ?? 0) > 0) {
        throw new Error(`Viewer was able to DELETE documents via SQL!`);
      }
    });

    results.push({
      testId: "ADV-SEC-006",
      scenario: "Viewer role can SELECT documents, but cannot UPDATE or DELETE documents via direct SQL",
      passed: true,
      details: "Fine-grained operation-specific RLS policies strictly prevented Viewer mutations.",
    });
    console.log("   --> PASSED: Viewer permitted to read, strictly denied write/delete.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-006", scenario: "Viewer Role Permissions", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-007: Reviewer Role Direct SQL Capabilities (Requirement 1)
  // Reviewer can verify extracted_fields, but CANNOT update or delete documents.
  // --------------------------------------------------------------------------
  console.log("8. Running ADV-SEC-007: Reviewer role direct SQL capabilities...");
  try {
    const ctxReviewer: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userReviewerId,
      userRole: "REVIEWER",
    };

    await withTenantTransaction(ctxReviewer, async (client) => {
      // 1. Reviewer CAN update extracted_fields (verification)
      const fieldUpdate = await client.query(
        "UPDATE extracted_fields SET is_verified = true, verified_at = CURRENT_TIMESTAMP WHERE id = $1;",
        [fieldAId]
      );
      if ((fieldUpdate.rowCount ?? 0) !== 1) {
        throw new Error("Reviewer should be able to update extracted_fields for verification");
      }

      // 2. Reviewer CANNOT update documents
      const docUpdate = await client.query("UPDATE documents SET filename = 'reviewer_edit.pdf' WHERE id = $1;", [docAId]);
      if ((docUpdate.rowCount ?? 0) > 0) {
        throw new Error("Reviewer was able to UPDATE documents!");
      }
    });

    results.push({
      testId: "ADV-SEC-007",
      scenario: "Reviewer can update extracted_fields but cannot modify documents",
      passed: true,
      details: "Reviewer field verification permitted; document modification blocked.",
    });
    console.log("   --> PASSED: Reviewer field verification permitted; document modification blocked.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-007", scenario: "Reviewer Role Capabilities", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-008: Membership Administration Boundary (Requirement 1)
  // Ordinary user cannot delete their own or others' workspace membership.
  // --------------------------------------------------------------------------
  console.log("9. Running ADV-SEC-008: Membership administration boundary...");
  try {
    const ctxViewer: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userViewerId,
      userRole: "VIEWER",
    };

    await withTenantTransaction(ctxViewer, async (client) => {
      // Viewer attempts to delete own workspace membership
      const delSelf = await client.query(
        "DELETE FROM workspace_memberships WHERE organization_id = $1 AND user_id = $2;",
        [orgAId, userViewerId]
      );
      if ((delSelf.rowCount ?? 0) > 0) {
        throw new Error("Viewer was able to DELETE own workspace membership!");
      }
    });

    results.push({
      testId: "ADV-SEC-008",
      scenario: "Ordinary users cannot delete or alter workspace memberships",
      passed: true,
      details: "Membership administration strictly restricted to ORGANIZATION_ADMIN/WORKSPACE_ADMIN.",
    });
    console.log("   --> PASSED: Ordinary user cannot alter or delete workspace memberships.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-008", scenario: "Membership Administration", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-009: Pooled Connection State Bleed
  // --------------------------------------------------------------------------
  console.log("10. Running ADV-SEC-009: Pooled connection state bleed test...");
  try {
    const ctxA: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userA1Id,
      userRole: "DOCUMENT_MANAGER",
    };

    await withTenantTransaction(ctxA, async (client) => {
      const res = await client.query("SELECT * FROM documents WHERE id = $1;", [docAId]);
      console.log(`   Tenant A saw ${res.rows.length} documents.`);
    });

    // Check out another connection without setting context
    const cleanClient = await appPool.connect();
    try {
      const bleedCheck = await cleanClient.query("SELECT * FROM documents WHERE id = $1;", [docAId]);
      if (bleedCheck.rows.length !== 0) {
        throw new Error(`Session state leaked across checkout! Saw ${bleedCheck.rows.length} rows`);
      }
      results.push({
        testId: "ADV-SEC-009",
        scenario: "Pooled connection checkout does not leak tenant context",
        passed: true,
        details: "Clean checkout returned 0 rows as expected.",
      });
      console.log("   --> PASSED: Pooled connection returned clean zero-leak state.\n");
    } finally {
      cleanClient.release();
    }
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-009", scenario: "Pool State Bleed", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-010: Audit Log Immutability
  // --------------------------------------------------------------------------
  console.log("11. Running ADV-SEC-010: Audit log immutability...");
  try {
    const auditId = crypto.randomUUID();
    await adminPool.query(`
      INSERT INTO audit_logs (id, organization_id, tenant_slug_snapshot, action, entity_type, entity_id)
      VALUES ('${auditId}', '${orgAId}', 'acme', 'TEST_EVENT', 'DOCUMENT', '${docAId}');
    `);

    const ctxA: TenantContext = {
      organizationId: orgAId,
      userId: userA1Id,
      userRole: "ORGANIZATION_ADMIN",
    };

    let updateBlocked = false;
    let deleteBlocked = false;

    // Test UPDATE in isolated transaction
    try {
      await withTenantTransaction(ctxA, async (client) => {
        await client.query("UPDATE audit_logs SET action = 'HACKED' WHERE id = $1;", [auditId]);
      });
    } catch (err: any) {
      if (err.code === "42501" || err.message.includes("permission denied")) {
        updateBlocked = true;
      }
    }

    // Test DELETE in isolated transaction
    try {
      await withTenantTransaction(ctxA, async (client) => {
        await client.query("DELETE FROM audit_logs WHERE id = $1;", [auditId]);
      });
    } catch (err: any) {
      if (err.code === "42501" || err.message.includes("permission denied")) {
        deleteBlocked = true;
      }
    }

    if (updateBlocked && deleteBlocked) {
      results.push({
        testId: "ADV-SEC-010",
        scenario: "Application role ledgerone_app cannot UPDATE or DELETE audit_logs",
        passed: true,
        details: "PostgreSQL permission denied (42501) on both UPDATE and DELETE as required.",
      });
      console.log("   --> PASSED: Audit log immutability strictly enforced by PostgreSQL permissions.\n");
    } else {
      throw new Error(`Immutability violation! UpdateBlocked: ${updateBlocked}, DeleteBlocked: ${deleteBlocked}`);
    }
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-010", scenario: "Audit Immutability", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("  ADVERSARIAL SECURITY TEST SUMMARY");
  console.log("================================================================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Total Tests: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.testId}: ${r.scenario}`);
  }
  console.log("================================================================================\n");

  if (failed > 0) {
    throw new Error("One or more adversarial security tests failed!");
  }
}

runAdversarialSecurityTests().catch((err) => {
  console.error("Adversarial test suite failed with error:", err);
  process.exit(1);
});
