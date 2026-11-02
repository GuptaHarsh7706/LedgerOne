"""
Integration tests validating connection pool reuse, concurrency, and cross-tenant/workspace isolation.
"""
import asyncio
import uuid
import pytest
from src.db.rls import TenantContext, apply_tenant_rls_context


@pytest.mark.asyncio
async def test_connection_pool_reuse_no_leakage(db_pool):
    """
    Verify that releasing a connection back to the pool leaves NO persistent tenant state.
    Successive acquisitions from the pool must receive completely clean sessions.
    """
    tenant_a = uuid.uuid4()
    context_a = TenantContext(org_id=tenant_a, user_role="ORGANIZATION_ADMIN")

    # 1. Acquire connection, set tenant context in transaction, commit, release
    async with db_pool.acquire() as conn1:
        async with conn1.transaction():
            await apply_tenant_rls_context(conn1, context=context_a, enforce_app_role=True)
            val1 = await conn1.fetchval("SELECT current_setting('app.current_org_id', true)")
            assert val1 == str(tenant_a)

    # 2. Acquire a connection from the pool (might be the same connection reused)
    async with db_pool.acquire() as conn2:
        val2 = await conn2.fetchval("SELECT current_setting('app.current_org_id', true)")
        assert val2 in (None, ""), f"Connection pool leaked tenant setting: '{val2}'"


@pytest.mark.asyncio
async def test_concurrent_requests_tenant_isolation(db_pool):
    """
    Verify that concurrent coroutines executing with different tenant contexts
    remain completely isolated without race conditions or cross-contamination.
    """
    async def worker(tenant_id: uuid.UUID):
        context = TenantContext(org_id=tenant_id, user_role="ORGANIZATION_ADMIN")
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=context, enforce_app_role=True)
                # Sleep briefly to simulate work and allow concurrent interleaving
                await asyncio.sleep(0.02)
                observed_val = await conn.fetchval(
                    "SELECT current_setting('app.current_org_id', true)"
                )
                assert observed_val == str(tenant_id), f"Expected {tenant_id}, got {observed_val}"

    # Launch 10 concurrent tasks with distinct tenant IDs
    tenants = [uuid.uuid4() for _ in range(10)]
    tasks = [worker(t) for t in tenants]
    await asyncio.gather(*tasks)


@pytest.mark.asyncio
async def test_cross_organization_rls_isolation(db_pool):
    """
    Verify strict cross-organization isolation:
    Entities created under Org A must NOT be visible or accessible to Org B.
    """
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()
    ws_a_id = uuid.uuid4()
    doc_a_id = uuid.uuid4()

    # Setup: Create Org A, Workspace A, and Document A inside an isolated test block
    async with db_pool.acquire() as setup_conn:
        async with setup_conn.transaction():
            # Use platform admin privilege to provision test fixtures
            await setup_conn.execute("SELECT set_config('app.is_platform_admin', 'true', true)")
            await setup_conn.execute(
                "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
                org_a_id, f"Org A {org_a_id.hex[:6]}", f"slug-a-{org_a_id.hex[:8]}"
            )
            await setup_conn.execute(
                "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
                org_b_id, f"Org B {org_b_id.hex[:6]}", f"slug-b-{org_b_id.hex[:8]}"
            )
            await setup_conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws_a_id, org_a_id, "Workspace A", f"ws-a-{ws_a_id.hex[:8]}"
            )
            await setup_conn.execute(
                """
                INSERT INTO documents (
                    id, organization_id, workspace_id, filename, file_size_bytes, 
                    mime_type, sha256_hash, s3_key, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                doc_a_id, org_a_id, ws_a_id, "invoice_a.pdf", 1024,
                "application/pdf", "0" * 64, f"keys/{doc_a_id}.pdf", "COMPLETED"
            )

    try:
        # Step 1: Query as Org A (Org Admin) -> Should see Document A
        async with db_pool.acquire() as conn_a:
            async with conn_a.transaction():
                context_a = TenantContext(org_id=org_a_id, user_role="ORGANIZATION_ADMIN")
                await apply_tenant_rls_context(conn_a, context=context_a, enforce_app_role=True)
                docs_a = await conn_a.fetch("SELECT id FROM documents WHERE id = $1", doc_a_id)
                assert len(docs_a) == 1, "Org A must be able to view its own document"

        # Step 2: Query as Org B (Org Admin) -> Must NOT see Document A (0 rows returned)
        async with db_pool.acquire() as conn_b:
            async with conn_b.transaction():
                context_b = TenantContext(org_id=org_b_id, user_role="ORGANIZATION_ADMIN")
                await apply_tenant_rls_context(conn_b, context=context_b, enforce_app_role=True)
                docs_b = await conn_b.fetch("SELECT id FROM documents WHERE id = $1", doc_a_id)
                assert len(docs_b) == 0, "Org B must NOT see documents belonging to Org A"

                # Step 3: Attempt to UPDATE or DELETE Document A as Org B -> 0 rows affected
                result = await conn_b.execute(
                    "UPDATE documents SET filename = 'hacked.pdf' WHERE id = $1", doc_a_id
                )
                assert result == "UPDATE 0", "Org B must NOT be able to update Org A's document"

                del_result = await conn_b.execute(
                    "DELETE FROM documents WHERE id = $1", doc_a_id
                )
                assert del_result == "DELETE 0", "Org B must NOT be able to delete Org A's document"

    finally:
        # Cleanup test entities
        async with db_pool.acquire() as clean_conn:
            async with clean_conn.transaction():
                await clean_conn.execute("SELECT set_config('app.is_platform_admin', 'true', true)")
                await clean_conn.execute("DELETE FROM documents WHERE id = $1", doc_a_id)
                await clean_conn.execute("DELETE FROM workspaces WHERE id = $1", ws_a_id)
                await clean_conn.execute("DELETE FROM organizations WHERE id IN ($1, $2)", org_a_id, org_b_id)


@pytest.mark.asyncio
async def test_cross_workspace_rls_isolation(db_pool):
    """
    Verify cross-workspace isolation within the same organization:
    Non-admin member assigned only to Workspace 1 cannot view documents in Workspace 2.
    """
    org_id = uuid.uuid4()
    ws_1_id = uuid.uuid4()
    ws_2_id = uuid.uuid4()
    user_1_id = uuid.uuid4()
    doc_1_id = uuid.uuid4()
    doc_2_id = uuid.uuid4()

    async with db_pool.acquire() as setup_conn:
        async with setup_conn.transaction():
            await setup_conn.execute("SELECT set_config('app.is_platform_admin', 'true', true)")
            # Create user & org
            await setup_conn.execute(
                "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)",
                user_1_id, f"user_{user_1_id.hex[:6]}@example.com", "hash", "User 1"
            )
            await setup_conn.execute(
                "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
                org_id, f"Org {org_id.hex[:6]}", f"slug-ws-{org_id.hex[:8]}"
            )
            # Create workspaces 1 and 2
            await setup_conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws_1_id, org_id, "Workspace 1", f"ws-1-{ws_1_id.hex[:8]}"
            )
            await setup_conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws_2_id, org_id, "Workspace 2", f"ws-2-{ws_2_id.hex[:8]}"
            )
            # Grant User 1 membership ONLY to Workspace 1 (role REVIEWER)
            await setup_conn.execute(
                """
                INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role)
                VALUES ($1, $2, $3, 'REVIEWER')
                """,
                org_id, ws_1_id, user_1_id
            )
            # Add Document 1 to Workspace 1, Document 2 to Workspace 2
            await setup_conn.execute(
                """
                INSERT INTO documents (
                    id, organization_id, workspace_id, filename, file_size_bytes, 
                    mime_type, sha256_hash, s3_key, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                doc_1_id, org_id, ws_1_id, "doc1.pdf", 1024, "application/pdf", "1" * 64, f"keys/{doc_1_id}.pdf", "COMPLETED"
            )
            await setup_conn.execute(
                """
                INSERT INTO documents (
                    id, organization_id, workspace_id, filename, file_size_bytes, 
                    mime_type, sha256_hash, s3_key, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                doc_2_id, org_id, ws_2_id, "doc2.pdf", 1024, "application/pdf", "2" * 64, f"keys/{doc_2_id}.pdf", "COMPLETED"
            )

    try:
        # Query as User 1 in Org (Member of Workspace 1 only)
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                context = TenantContext(org_id=org_id, user_id=user_1_id, user_role="REVIEWER")
                await apply_tenant_rls_context(conn, context=context, enforce_app_role=True)

                # Should see Document 1 (in Workspace 1)
                visible_1 = await conn.fetch("SELECT id FROM documents WHERE id = $1", doc_1_id)
                assert len(visible_1) == 1, "User must see document in their assigned workspace"

                # Must NOT see Document 2 (in Workspace 2)
                visible_2 = await conn.fetch("SELECT id FROM documents WHERE id = $1", doc_2_id)
                assert len(visible_2) == 0, "User must NOT see document in unassigned workspace"

    finally:
        # Cleanup
        async with db_pool.acquire() as clean_conn:
            async with clean_conn.transaction():
                await clean_conn.execute("SELECT set_config('app.is_platform_admin', 'true', true)")
                await clean_conn.execute("DELETE FROM documents WHERE id IN ($1, $2)", doc_1_id, doc_2_id)
                await clean_conn.execute("DELETE FROM workspace_memberships WHERE organization_id = $1", org_id)
                await clean_conn.execute("DELETE FROM workspaces WHERE organization_id = $1", org_id)
                await clean_conn.execute("DELETE FROM users WHERE id = $1", user_1_id)
                await clean_conn.execute("DELETE FROM organizations WHERE id = $1", org_id)
