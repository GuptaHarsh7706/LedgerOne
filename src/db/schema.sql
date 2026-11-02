-- ============================================================================
-- LEDGERONE PRODUCTION DATABASE SCHEMA (PHASE 1: ENGINEERING FOUNDATION)
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Unprivileged Application Role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerone_app') THEN
    CREATE ROLE ledgerone_app WITH LOGIN PASSWORD 'ledgerone_app_secure_pass_2026';
  END IF;
END $$;

ALTER ROLE ledgerone_app NOBYPASSRLS;

-- 2. Identity & Tenant Root Tables
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'ORGANIZATION_ADMIN', 'MEMBER'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'DOCUMENT_MANAGER', 'REVIEWER', 'ANALYST', 'VIEWER'
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, workspace_id, user_id),
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE CASCADE
);

-- 3. Document Entities with Compound Integrity
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  uploaded_by_user_id UUID REFERENCES users(id),
  filename VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  s3_key VARCHAR(1024) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'UPLOAD_PENDING',
  upload_lease_expires_at TIMESTAMPTZ,
  category VARCHAR(50),
  metadata JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  chunk_index INT NOT NULL,
  page_number INT NOT NULL,
  bounding_box JSONB,
  content TEXT NOT NULL,
  embedding vector(384),
  tsv_content tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS extracted_fields (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_value_raw TEXT,
  field_value_normalized JSONB,
  confidence NUMERIC(5, 4) NOT NULL,
  page_number INT,
  bounding_box JSONB,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_value JSONB,
  verified_by_user_id UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE CASCADE
);

-- 4. Transactional Queue Engine Table
CREATE TABLE IF NOT EXISTS document_jobs (
  id UUID DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
  priority INT NOT NULL DEFAULT 10,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  locked_by VARCHAR(255),
  locked_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE CASCADE
);

-- 5. Immutable Audit Log (Decoupled from Cascade Deletion)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tenant_slug_snapshot VARCHAR(100) NOT NULL,
  workspace_id UUID,
  user_id UUID,
  user_email_snapshot VARCHAR(255),
  user_role_snapshot VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_jobs_claim ON document_jobs(status, run_at, priority DESC, id ASC) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_doc_chunks_vector ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- 6. ROW-LEVEL SECURITY ENFORCEMENT
-- ============================================================================

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;

ALTER TABLE extracted_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_fields FORCE ROW LEVEL SECURITY;

ALTER TABLE document_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. RLS POLICIES (DROP EXISTING & RECREATE SYMMETRIC POLICIES)
-- ============================================================================

DROP POLICY IF EXISTS rls_org_memberships ON organization_memberships;
CREATE POLICY rls_org_memberships ON organization_memberships
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_workspaces ON workspaces;
CREATE POLICY rls_workspaces ON workspaces
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR id IN (
        SELECT wm.workspace_id 
        FROM workspace_memberships wm 
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
  );

DROP POLICY IF EXISTS rls_workspace_memberships ON workspace_memberships;
CREATE POLICY rls_workspace_memberships ON workspace_memberships
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
  );

DROP POLICY IF EXISTS rls_documents ON documents;
CREATE POLICY rls_documents ON documents
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id 
        FROM workspace_memberships wm 
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id 
        FROM workspace_memberships wm 
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND wm.role IN ('DOCUMENT_MANAGER', 'ORGANIZATION_ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS rls_document_chunks ON document_chunks;
CREATE POLICY rls_document_chunks ON document_chunks
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id 
        FROM workspace_memberships wm 
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_extracted_fields ON extracted_fields;
CREATE POLICY rls_extracted_fields ON extracted_fields
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id 
        FROM workspace_memberships wm 
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_document_jobs ON document_jobs;
CREATE POLICY rls_document_jobs ON document_jobs
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_audit_logs_select ON audit_logs;
CREATE POLICY rls_audit_logs_select ON audit_logs
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
  );

DROP POLICY IF EXISTS rls_audit_logs_insert ON audit_logs;
CREATE POLICY rls_audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

-- ============================================================================
-- 8. GRANT LEAST-PRIVILEGE PERMISSIONS TO APPLICATION ROLE
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON 
  organizations, workspaces, users, organization_memberships, 
  workspace_memberships, documents, document_chunks, extracted_fields, document_jobs 
TO ledgerone_app;

GRANT SELECT, INSERT ON audit_logs TO ledgerone_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM ledgerone_app;
