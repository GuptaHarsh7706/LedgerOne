import { neon, Pool } from "@neondatabase/serverless";
import { config } from "./config.js";

// Best practice per neon-postgres skill:
// Use @neondatabase/serverless with pooled connection for app transactions
export const sql = neon(config.neon.databaseUrl);
export const pool = new Pool({ connectionString: config.neon.databaseUrl });

export interface LedgerTransaction {
  id: number;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  document_key?: string | null;
  created_at: Date;
}

export async function initDatabase(): Promise<void> {
  // Direct / DDL statement to initialize the ledger table schema
  await sql`
    CREATE TABLE IF NOT EXISTS ledger_transactions (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount NUMERIC(14, 2) NOT NULL,
      type VARCHAR(20) NOT NULL,
      document_key TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

export async function checkDatabaseHealth(): Promise<{ ok: boolean; database: string; branch: string; version: string }> {
  const result = await sql`SELECT 1 AS ok, current_database() AS db, version() AS version`;
  const row = result[0] as { ok: number; db: string; version: string };
  return {
    ok: row.ok === 1,
    database: row.db,
    branch: config.neon.branch,
    version: row.version,
  };
}

export async function insertTransaction(data: {
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  document_key?: string | null;
}): Promise<LedgerTransaction> {
  const result = await sql`
    INSERT INTO ledger_transactions (description, amount, type, document_key)
    VALUES (${data.description}, ${data.amount}, ${data.type}, ${data.document_key || null})
    RETURNING id, description, amount, type, document_key, created_at;
  `;
  return result[0] as unknown as LedgerTransaction;
}

export async function getTransactions(): Promise<LedgerTransaction[]> {
  const rows = await sql`
    SELECT id, description, amount, type, document_key, created_at
    FROM ledger_transactions
    ORDER BY created_at DESC
    LIMIT 100;
  `;
  return rows as unknown as LedgerTransaction[];
}
