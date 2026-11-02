import crypto from "node:crypto";
import pg from "pg";
import { appPool, adminPool, withTenantTransaction, TenantContext } from "../src/db/tenant-context.js";
import "../src/config.js";

async function runAdversarialSecurityTests() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 1: ADVERSARIAL MULTI-TENANT & RLS SECURITY TEST SUITE");
  console.log("  Executing as Unprivileged Database Role: ledgerone_app (NOBYPASSRLS)");
  console.log("================================================================================\n");

  // Setup Test Data using Admin Pool
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const wsA1Id = crypto.randomUUID(); // Org A Workspace 1
  const wsA2Id = crypto.randomUUID(); // Org A Workspace 2
  const wsB1Id = crypto.randomUUID(); // Org B Workspace 1

  const userA1Id = crypto.randomUUID(); // Org A User assigned to WS A1
  const userA2Id = crypto.randomUUID(); // Org A User assigned to WS A2
  const userB1Id = crypto.randomUUID(); // Org B User assigned to WS B1

  const docAId = crypto.randomUUID(); // Document in Org A, WS A1
  const docBId = crypto.randomUUID(); // Document in Org B, WS B1

  console.log("1. Setting up test organizations, workspaces, and users via admin pool...");
  await adminPool.query(`
    INSERT INTO organizations (id, name, slug) VALUES 
      ('${orgAId}', 'Acme Corporation', 'acme-${Date.now()}'),
      ('${orgBId}', 'Beta Industries', 'beta-${Date.now()}');

    INSERT INTO workspaces (id, organization_id, name, slug) VALUES 
      ('${wsA1Id}', '${orgAId}', 'Acme Finance', 'finance'),
      ('${wsA2Id}', '${orgAId}', 'Acme Legal', 'legal'),
      ('${wsB1Id}', '${orgBId}', 'Beta Procurement', 'procurement');

    INSERT INTO users (id, email, password_hash, full_name) VALUES 
      ('${userA1Id}', 'a1-${Date.now()}@acme.com', 'hash', 'Alice Finance'),
      ('${userA2Id}', 'a2-${Date.now()}@acme.com', 'hash', 'Adam Legal'),
      ('${userB1Id}', 'b1-${Date.now()}@beta.com', 'hash', 'Bob Beta');

    INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role) VALUES 
      ('${orgAId}', '${wsA1Id}', '${userA1Id}', 'DOCUMENT_MANAGER'),
      ('${orgAId}', '${wsA2Id}', '${userA2Id}', 'DOCUMENT_MANAGER'),
      ('${orgBId}', '${wsB1Id}', '${userB1Id}', 'DOCUMENT_MANAGER');

    INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status) VALUES 
      ('${docAId}', '${orgAId}', '${wsA1Id}', 'acme-invoice.pdf', 1024, 'application/pdf', 'hashA', 'keyA', 'COMPLETED'),
      ('${docBId}', '${orgBId}', '${wsB1Id}', 'beta-invoice.pdf', 2048, 'application/pdf', 'hashB', 'keyB', 'COMPLETED');
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
  // TEST ADV-SEC-002: Cross-Tenant Isolation (Tenant A cannot see Tenant B's docs)
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
      if ((updateRes.rowCount ?? 0) !== 0) {
        throw new Error(`Tenant A could update Tenant B's document! Rows: ${updateRes.rowCount}`);
      }

      // 3. DELETE Tenant B's doc
      const deleteRes = await client.query("DELETE FROM documents WHERE id = $1;", [docBId]);
      if ((deleteRes.rowCount ?? 0) !== 0) {
        throw new Error(`Tenant A could delete Tenant B's document! Rows: ${deleteRes.rowCount}`);
      }
    });

    results.push({
      testId: "ADV-SEC-002",
      scenario: "Tenant A cannot SELECT, UPDATE, or DELETE Tenant B documents",
      passed: true,
      details: "All cross-tenant read/write operations returned 0 rows affected.",
    });
    console.log("   --> PASSED: Tenant A blocked from all operations on Tenant B document.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-002", scenario: "Cross-Tenant Isolation", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-003: Compound Foreign Key Invariant
  // --------------------------------------------------------------------------
  console.log("4. Running ADV-SEC-003: Compound foreign key consistency...");
  try {
    const ctxA: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA1Id,
      userId: userA1Id,
      userRole: "DOCUMENT_MANAGER",
    };

    let fkBlocked = false;
    try {
      await withTenantTransaction(ctxA, async (client) => {
        // Attempt to insert a chunk with organization_id = orgAId, but pointing to document_id = docBId
        await client.query(`
          INSERT INTO document_chunks (
            organization_id, workspace_id, document_id, chunk_index, page_number, content
          ) VALUES ($1, $2, $3, 0, 1, 'Spoofed cross-tenant chunk');
        `, [orgAId, wsA1Id, docBId]);
      });
    } catch (err: any) {
      if (err.code === "23503") { // foreign_key_violation
        fkBlocked = true;
      } else {
        throw err;
      }
    }

    if (fkBlocked) {
      results.push({
        testId: "ADV-SEC-003",
        scenario: "Compound foreign key prevents child entity linkage to cross-tenant parent",
        passed: true,
        details: "Database rejected insertion with foreign_key_violation (code 23503).",
      });
      console.log("   --> PASSED: Compound foreign key strictly prevented cross-tenant chunk linkage.\n");
    } else {
      throw new Error("Compound foreign key constraint failed to block cross-tenant child insertion!");
    }
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-003", scenario: "Compound Foreign Key", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-004: Workspace Membership Boundary
  // --------------------------------------------------------------------------
  console.log("5. Running ADV-SEC-004: Workspace membership boundary for ordinary user...");
  try {
    // User A1 belongs to Workspace A1, but NOT Workspace A2
    const ctxA1ToWS2: TenantContext = {
      organizationId: orgAId,
      workspaceId: wsA2Id,
      userId: userA1Id,
      userRole: "DOCUMENT_MANAGER", // Ordinary user, not Org Admin
    };

    await withTenantTransaction(ctxA1ToWS2, async (client) => {
      // Create a document in WS A2 via admin to test visibility
      await adminPool.query(`
        INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status)
        VALUES ('${crypto.randomUUID()}', '${orgAId}', '${wsA2Id}', 'legal-confidential.pdf', 500, 'application/pdf', 'hash', 'key', 'COMPLETED');
      `);

      // User A1 tries to list documents in WS A2
      const res = await client.query("SELECT * FROM documents WHERE workspace_id = $1;", [wsA2Id]);
      if (res.rows.length !== 0) {
        throw new Error(`User A1 without membership could see documents in Workspace A2! Count: ${res.rows.length}`);
      }
    });

    results.push({
      testId: "ADV-SEC-004",
      scenario: "Ordinary user cannot access documents in unassigned workspace within same org",
      passed: true,
      details: "Workspace-level RLS policy enforced membership restriction.",
    });
    console.log("   --> PASSED: User without workspace membership denied access to workspace documents.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-004", scenario: "Workspace Membership Boundary", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-005: Pooled Connection Reuse State Bleed
  // --------------------------------------------------------------------------
  console.log("6. Running ADV-SEC-005: Pooled connection state bleed test...");
  try {
    const ctxA: TenantContext = { organizationId: orgAId, workspaceId: wsA1Id, userId: userA1Id, userRole: "DOCUMENT_MANAGER" };
    
    // Request 1 as Tenant A
    await withTenantTransaction(ctxA, async (client) => {
      const res = await client.query("SELECT COUNT(*) FROM documents;");
      console.log(`   Tenant A saw ${res.rows[0].count} documents.`);
    });

    // Request 2 checking out directly from appPool without setting context
    const checkClient = await appPool.connect();
    try {
      const bleedCheck = await checkClient.query("SELECT * FROM documents;");
      if (bleedCheck.rows.length !== 0) {
        throw new Error(`State bleed detected! Pooled connection retained context and returned ${bleedCheck.rows.length} rows.`);
      }
    } finally {
      checkClient.release();
    }

    results.push({
      testId: "ADV-SEC-005",
      scenario: "Pooled connection checkout does not leak tenant context",
      passed: true,
      details: "set_config(..., is_local=true) and RESET ALL successfully purged context on transaction end.",
    });
    console.log("   --> PASSED: Pooled connection returned clean zero-leak state.\n");
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-005", scenario: "Pooled Connection State Bleed", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST ADV-SEC-006: Audit Log Immutability (App role cannot UPDATE or DELETE)
  // --------------------------------------------------------------------------
  console.log("7. Running ADV-SEC-006: Audit log immutability...");
  try {
    // Insert an audit log entry via admin
    const auditId = crypto.randomUUID();
    await adminPool.query(`
      INSERT INTO audit_logs (id, organization_id, tenant_slug_snapshot, action, entity_type, entity_id)
      VALUES ('${auditId}', '${orgAId}', 'acme', 'DOCUMENT_UPLOAD', 'DOCUMENT', '${docAId}');
    `);

    let updateBlocked = false;
    let deleteBlocked = false;

    const ctxA: TenantContext = { organizationId: orgAId, workspaceId: wsA1Id, userId: userA1Id, userRole: "ORGANIZATION_ADMIN" };
    // 1. Try to UPDATE audit log (in dedicated transaction)
    await withTenantTransaction(ctxA, async (client) => {
      try {
        await client.query("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = $1;", [auditId]);
      } catch (err: any) {
        if (err.code === "42501") updateBlocked = true; // permission_denied
      }
    });

    // 2. Try to DELETE audit log (in fresh transaction)
    await withTenantTransaction(ctxA, async (client) => {
      try {
        await client.query("DELETE FROM audit_logs WHERE id = $1;", [auditId]);
      } catch (err: any) {
        if (err.code === "42501") deleteBlocked = true; // permission_denied
      }
    });

    if (updateBlocked && deleteBlocked) {
      results.push({
        testId: "ADV-SEC-006",
        scenario: "Application role ledgerone_app cannot UPDATE or DELETE audit_logs",
        passed: true,
        details: "PostgreSQL rejected both operations with permission_denied (code 42501).",
      });
      console.log("   --> PASSED: Audit log immutability strictly enforced by PostgreSQL permissions.\n");
    } else {
      throw new Error(`Audit immutability failed! UpdateBlocked: ${updateBlocked}, DeleteBlocked: ${deleteBlocked}`);
    }
  } catch (err: any) {
    results.push({ testId: "ADV-SEC-006", scenario: "Audit Log Immutability", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // Summary
  console.log("================================================================================");
  console.log("  ADVERSARIAL SECURITY TEST SUMMARY");
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
    throw new Error("One or more adversarial security tests failed!");
  }
}

// Execute
runAdversarialSecurityTests().catch((err) => {
  console.error("Adversarial security suite failed:", err);
  process.exit(1);
});
