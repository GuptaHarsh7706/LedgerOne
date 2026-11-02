import pg from "pg";
import "../config.js";

const { Pool } = pg;

export interface TenantContext {
  organizationId: string;
  workspaceId?: string;
  userId?: string;
  userRole?: string;
}

// 1. Admin Pool (used for migrations and system setup)
export const adminPool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 2. Application Unprivileged Pool (used for runtime tenant queries)
// Derives connection string replacing credentials with ledgerone_app
function getAppConnectionString(): string {
  const base = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
  // Match standard postgres://user:pass@host/db
  return base.replace(
    /postgres(ql)?:\/\/([^:]+):([^@]+)@/,
    "postgres://ledgerone_app:ledgerone_app_secure_pass_2026@"
  );
}

export const appPool = new Pool({
  connectionString: getAppConnectionString(),
  ssl: { rejectUnauthorized: false },
});

/**
 * Execute an operation within a tenant-scoped transaction.
 * Uses transaction-local `set_config(..., true)` so parameters are automatically
 * purged on COMMIT or ROLLBACK, completely eliminating pooled context state bleed.
 */
export async function withTenantTransaction<T>(
  ctx: TenantContext,
  operation: (client: pg.PoolClient) => Promise<T>,
  pool: pg.Pool = appPool
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // Standard parameterized transaction-local context injection (is_local = true)
    await client.query(
      `SELECT 
        set_config('app.current_org_id', $1, true),
        set_config('app.current_ws_id', $2, true),
        set_config('app.current_user_id', $3, true),
        set_config('app.current_user_role', $4, true);`,
      [
        ctx.organizationId,
        ctx.workspaceId || "",
        ctx.userId || "",
        ctx.userRole || "VIEWER",
      ]
    );

    const result = await operation(client);
    await client.query("COMMIT;");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // Ignore rollback failure if connection was lost
    }
    throw err;
  } finally {
    // Sanity reset before releasing connection back to pool
    try {
      await client.query("RESET ALL;");
    } catch {
      // Ignore reset failure during cleanup
    }
    client.release();
  }
}
