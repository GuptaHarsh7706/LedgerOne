import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "../config.js";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL_UNPOOLED or DATABASE_URL in environment");
  }

  console.log("[Migration] Connecting to Neon PostgreSQL via direct connection...");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");

    console.log("[Migration] Executing Phase 1 DDL schema with FORCE RLS & compound keys...");
    await client.query(schemaSql);
    console.log("[Migration] Phase 1 DDL executed successfully.");
  } finally {
    await client.end();
  }
}

// Direct execution support
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch((err) => {
    console.error("[Migration Error]:", err);
    process.exit(1);
  });
}
