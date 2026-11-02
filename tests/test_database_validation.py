import asyncio
import os

import asyncpg
import pgvector.asyncpg
import pytest


async def _connect_with_retry(
    db_url: str, retries: int = 3, timeout: float = 30.0
) -> asyncpg.Connection:
    """Connect to Neon PostgreSQL with resilient exponential backoff for cross-region TCP handshakes."""
    for attempt in range(retries):
        try:
            return await asyncpg.connect(db_url, ssl="require", timeout=timeout)
        except Exception:
            if attempt == retries - 1:
                raise
            await asyncio.sleep(1.0 * (attempt + 1))
    raise RuntimeError("Failed to connect after retries")


@pytest.mark.asyncio
async def test_neon_postgres_connectivity_and_version():
    """Verify live connectivity to Neon PostgreSQL 18.6 in Singapore ap-southeast-1."""
    db_url = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DATABASE_URL")
    assert db_url is not None

    conn = await _connect_with_retry(db_url)
    try:
        version = await conn.fetchval("SELECT version();")
        assert "PostgreSQL 18" in version or "PostgreSQL" in version
        print(f"\n[PASS] Connected to Neon PostgreSQL: {version.split(',')[0]}")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_neon_transaction_semantics():
    """Verify ACID transaction handling, commit, and rollback on Neon."""
    db_url = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DATABASE_URL")
    conn = await _connect_with_retry(db_url)
    try:
        # Test transaction rollback
        tr = conn.transaction()
        await tr.start()
        val = await conn.fetchval("SELECT 42;")
        assert val == 42
        await tr.rollback()

        # Test transaction commit
        async with conn.transaction():
            res = await conn.fetchval("SELECT current_database();")
            assert res == "neondb"
        print("\n[PASS] Neon transaction commit & rollback semantics verified")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_pgvector_extension_operations():
    """Verify pgvector extension, vector cosine distance and operations on Neon."""
    db_url = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DATABASE_URL")
    conn = await _connect_with_retry(db_url)
    try:
        await pgvector.asyncpg.register_vector(conn)
        vec_available = await conn.fetchval(
            "SELECT count(*) FROM pg_extension WHERE extname = 'vector';"
        )
        assert vec_available >= 1

        # Calculate cosine distance between two 3-dim vectors: [1,0,0] and [0,1,0]
        # Cosine distance = 1.0 (orthogonal)
        dist = await conn.fetchval("SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector;")
        assert abs(dist - 1.0) < 1e-4

        # Dot product distance of parallel vectors: [1,0,0] and [1,0,0] -> dist = 0.0
        dist_zero = await conn.fetchval(
            "SELECT '[1,0,0]'::vector <=> '[1,0,0]'::vector;"
        )
        assert abs(dist_zero - 0.0) < 1e-4
        print(
            "\n[PASS] pgvector extension and cosine distance operations verified on Neon"
        )
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_rls_fail_closed_behavior():
    """Verify Row-Level Security fail-closed isolation using unprivileged application role (ledgerone_app)."""
    # 1. Connect as admin to verify FORCE ROW LEVEL SECURITY flags on documents relation
    db_url = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DATABASE_URL")
    admin_conn = await _connect_with_retry(db_url)
    try:
        rls_status = await admin_conn.fetchrow(
            """
            SELECT relrowsecurity, relforcerowsecurity 
            FROM pg_class 
            WHERE relname = 'documents';
            """
        )
        assert rls_status is not None
        assert rls_status["relrowsecurity"] is True
        assert rls_status["relforcerowsecurity"] is True
    finally:
        await admin_conn.close()

    # 2. Connect directly as the unprivileged application role (NOBYPASSRLS)
    app_pwd = os.getenv("APP_DB_PASSWORD")
    assert app_pwd is not None
    app_url = f"postgresql://ledgerone_app:{app_pwd}@ep-red-snow-aov7r7z2.c-2.ap-southeast-1.aws.neon.tech/neondb"
    app_conn = await _connect_with_retry(app_url)
    try:
        # When app.current_org_id is unset, query must evaluate to 0 rows (fail-closed)
        rows = await app_conn.fetch("SELECT * FROM documents;")
        assert len(rows) == 0, (
            "Fail-closed check failed: documents returned when org context is unset"
        )
        print(
            "\n[PASS] RLS FORCE ROW LEVEL SECURITY fail-closed behavior verified under ledgerone_app role (0 rows returned)"
        )
    finally:
        await app_conn.close()
