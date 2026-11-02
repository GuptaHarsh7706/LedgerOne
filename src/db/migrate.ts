import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config.js";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const connectionString = config.neon.databaseUrlUnpooled || config.neon.databaseUrl;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL_UNPOOLED or DATABASE_URL in environment");
  }

  console.log("[Migration] Connecting to Neon PostgreSQL via direct unpooled connection...");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // 1. Rotate ledgerone_app password securely from environment
    if (config.neon.appPassword) {
      console.log("[Migration] Synchronizing ledgerone_app password from environment secret...");
      await client.query(`ALTER ROLE ledgerone_app WITH PASSWORD '${config.neon.appPassword}';`);
    }

    // 2. Incremental column migrations for existing tables
    console.log("[Migration] Applying schema alterations (columns, constraints, fencing tokens)...");
    await client.query(`
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE workspace_memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS cleanup_lease_expires_at TIMESTAMPTZ;
      ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS lease_generation INT NOT NULL DEFAULT 0;
      ALTER TABLE document_jobs ADD COLUMN IF NOT EXISTS fencing_token UUID NOT NULL DEFAULT uuid_generate_v4();
    `);

    // 3. Composite unique constraint on documents (organization_id, workspace_id, id)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_documents_org_ws_id'
        ) THEN
          ALTER TABLE documents ADD CONSTRAINT uq_documents_org_ws_id UNIQUE (organization_id, workspace_id, id);
        END IF;
      END $$;
    `);

    // 4. Update foreign keys on document_chunks, extracted_fields, document_jobs to enforce parent-child workspace matching
    await client.query(`
      DO $$
      BEGIN
        -- document_chunks
        ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS document_chunks_organization_id_document_id_fkey;
        ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_doc_chunks_doc_parent;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_doc_chunks_doc_parent') THEN
          ALTER TABLE document_chunks ADD CONSTRAINT fk_doc_chunks_doc_parent
            FOREIGN KEY (organization_id, workspace_id, document_id)
            REFERENCES documents(organization_id, workspace_id, id) ON DELETE CASCADE;
        END IF;

        -- extracted_fields
        ALTER TABLE extracted_fields DROP CONSTRAINT IF EXISTS extracted_fields_organization_id_document_id_fkey;
        ALTER TABLE extracted_fields DROP CONSTRAINT IF EXISTS fk_extracted_fields_doc_parent;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_extracted_fields_doc_parent') THEN
          ALTER TABLE extracted_fields ADD CONSTRAINT fk_extracted_fields_doc_parent
            FOREIGN KEY (organization_id, workspace_id, document_id)
            REFERENCES documents(organization_id, workspace_id, id) ON DELETE CASCADE;
        END IF;

        -- Phase 4: Unique constraints for idempotent upserts and extraction metadata
        ALTER TABLE extracted_fields ADD COLUMN IF NOT EXISTS extraction_metadata JSONB DEFAULT '{}'::jsonb;
        
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_extracted_fields_name') THEN
          ALTER TABLE extracted_fields ADD CONSTRAINT uq_extracted_fields_name
            UNIQUE (organization_id, workspace_id, document_id, field_name);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_document_chunks_index') THEN
          ALTER TABLE document_chunks ADD CONSTRAINT uq_document_chunks_index
            UNIQUE (organization_id, workspace_id, document_id, chunk_index);
        END IF;

        -- document_jobs
        ALTER TABLE document_jobs DROP CONSTRAINT IF EXISTS document_jobs_organization_id_document_id_fkey;
        ALTER TABLE document_jobs DROP CONSTRAINT IF EXISTS fk_document_jobs_doc_parent;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_jobs_doc_parent') THEN
          ALTER TABLE document_jobs ADD CONSTRAINT fk_document_jobs_doc_parent
            FOREIGN KEY (organization_id, workspace_id, document_id)
            REFERENCES documents(organization_id, workspace_id, id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // 5. Execute updated DDL schema with granular RLS policies
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");

    console.log("[Migration] Executing fine-grained RLS policies and table definitions...");
    await client.query(schemaSql);
    console.log("[Migration] Migration completed successfully.");
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
