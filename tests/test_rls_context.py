"""
Integration tests validating transaction-scoped PostgreSQL Row-Level Security (RLS) enforcement.
"""
import uuid
import pytest
from ledgerone.db.rls import TenantContext, apply_tenant_rls_context


@pytest.mark.asyncio
async def test_unprivileged_execution_role(db_pool):
    """Verify that ledgerone_app role executes with rolbypassrls=False."""
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SET LOCAL ROLE ledgerone_app")
            current_user = await conn.fetchval("SELECT current_user")
            assert current_user == "ledgerone_app"

            bypass_rls = await conn.fetchval(
                "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user"
            )
            assert bypass_rls is False, "Application role must NOT bypass RLS"


@pytest.mark.asyncio
async def test_missing_tenant_context_fails_closed(db_pool):
    """Verify that querying tenant tables without tenant context returns 0 rows (fail-closed)."""
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # Enforce unprivileged role and clear tenant settings
            await apply_tenant_rls_context(conn, context=None, enforce_app_role=True)

            # Query tenant tables
            docs = await conn.fetch("SELECT * FROM documents")
            assert len(docs) == 0, "Query without tenant context must return 0 documents"

            orgs = await conn.fetch("SELECT * FROM organizations")
            assert len(orgs) == 0, "Query without tenant context must return 0 organizations"

            workspaces = await conn.fetch("SELECT * FROM workspaces")
            assert len(workspaces) == 0, "Query without tenant context must return 0 workspaces"


@pytest.mark.asyncio
async def test_transaction_scoped_setting_lifecycle(db_pool):
    """Verify transaction-local settings revert automatically upon transaction completion."""
    test_org_id = uuid.uuid4()
    context = TenantContext(org_id=test_org_id)

    async with db_pool.acquire() as conn:
        # Pre-transaction state
        initial_val = await conn.fetchval("SELECT current_setting('app.current_org_id', true)")
        assert initial_val in (None, "")

        # Inside transaction
        async with conn.transaction():
            await apply_tenant_rls_context(conn, context=context, enforce_app_role=True)
            active_val = await conn.fetchval("SELECT current_setting('app.current_org_id', true)")
            assert active_val == str(test_org_id)

        # Post-transaction state (committed): setting must be completely reverted
        post_val = await conn.fetchval("SELECT current_setting('app.current_org_id', true)")
        assert post_val in (None, ""), "Transaction-scoped setting did not revert after commit"


@pytest.mark.asyncio
async def test_transaction_rollback_reversion(db_pool):
    """Verify that settings revert cleanly even when an exception triggers a transaction rollback."""
    test_org_id = uuid.uuid4()
    context = TenantContext(org_id=test_org_id)

    async with db_pool.acquire() as conn:
        try:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=context, enforce_app_role=True)
                val_during = await conn.fetchval("SELECT current_setting('app.current_org_id', true)")
                assert val_during == str(test_org_id)
                raise RuntimeError("Simulated transaction failure to force rollback")
        except RuntimeError:
            pass

        # Post-rollback state: setting must be completely reverted
        post_val = await conn.fetchval("SELECT current_setting('app.current_org_id', true)")
        assert post_val in (None, ""), "Transaction-scoped setting did not revert after rollback"
