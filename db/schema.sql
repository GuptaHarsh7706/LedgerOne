-- ============================================================================
-- LEDGERONE PRODUCTION DATABASE SCHEMA (PHASE 1: ENGINEERING FOUNDATION v3.2)
-- Relational Integrity: Parent-Child Workspace Matching via Composite Keys
-- Granular RLS: Operation-Specific Policies (SELECT, INSERT, UPDATE, DELETE)
-- Queue Correctness: Fencing Tokens & Lease Generations
-- Defense-in-Depth: Least-Privilege Role & Active Membership Boundaries
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Unprivileged Application Role (No hardcoded credentials; altered dynamically via environment)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerone_app') THEN
    CREATE ROLE ledgerone_app WITH LOGIN;
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
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
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
  role VARCHAR(50) NOT NULL, -- 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER', 'ANALYST', 'VIEWER'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, workspace_id, user_id),
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE CASCADE
);

-- 3. Document Entities with Strict Parent-Child Workspace Matching
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
  cleanup_lease_expires_at TIMESTAMPTZ,
  category VARCHAR(50),
  metadata JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, workspace_id, id),
  FOREIGN KEY (organization_id, workspace_id) REFERENCES workspaces(organization_id, id) ON DELETE RESTRICT
);

-- Compound foreign key ensures workspace_id of chunk matches parent document's workspace_id exactly
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
  UNIQUE (organization_id, workspace_id, document_id, chunk_index),
  FOREIGN KEY (organization_id, workspace_id, document_id) REFERENCES documents(organization_id, workspace_id, id) ON DELETE CASCADE
);

-- Compound foreign key ensures workspace_id of extracted field matches parent document's workspace_id exactly
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
  extraction_metadata JSONB DEFAULT '{}'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_value JSONB,
  verified_by_user_id UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, workspace_id, document_id, field_name),
  FOREIGN KEY (organization_id, workspace_id, document_id) REFERENCES documents(organization_id, workspace_id, id) ON DELETE CASCADE
);

-- 4. Transactional Queue Engine Table with Fencing Token & Lease Generation
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
  lease_generation INT NOT NULL DEFAULT 0,
  fencing_token UUID NOT NULL DEFAULT uuid_generate_v4(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id, document_id) REFERENCES documents(organization_id, workspace_id, id) ON DELETE CASCADE
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

-- Indexes for high-throughput queries
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_jobs_claim ON document_jobs(status, run_at, priority DESC, id ASC) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_doc_chunks_vector ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_tsv ON document_chunks USING gin (tsv_content);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_tenant_lookup ON document_chunks(organization_id, workspace_id, document_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_ws ON documents(organization_id, workspace_id, status);

-- ============================================================================
-- 6. ROW-LEVEL SECURITY ENFORCEMENT (FORCE RLS ACROSS ALL TENANT TABLES)
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

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
-- 7. FINE-GRAINED OPERATION-SPECIFIC RLS POLICIES
-- ============================================================================

-- Drop all legacy broad 'FOR ALL' policies to ensure strict operation-specific enforcement
DROP POLICY IF EXISTS rls_org_memberships ON organization_memberships;
DROP POLICY IF EXISTS rls_workspaces ON workspaces;
DROP POLICY IF EXISTS rls_workspace_memberships ON workspace_memberships;
DROP POLICY IF EXISTS rls_documents ON documents;
DROP POLICY IF EXISTS rls_document_chunks ON document_chunks;
DROP POLICY IF EXISTS rls_extracted_fields ON extracted_fields;
DROP POLICY IF EXISTS rls_document_jobs ON document_jobs;

-- ----------------------------------------------------------------------------
-- 7.1 Users Table Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_users_select ON users;
CREATE POLICY rls_users_select ON users
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    OR id IN (
      SELECT om.user_id FROM organization_memberships om
      WHERE om.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS rls_users_insert ON users;
CREATE POLICY rls_users_insert ON users
  FOR INSERT
  WITH CHECK (TRUE); -- User registration open; authentication verified on token issuance

DROP POLICY IF EXISTS rls_users_update ON users;
CREATE POLICY rls_users_update ON users
  FOR UPDATE
  USING (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
  );

DROP POLICY IF EXISTS rls_users_delete ON users;
CREATE POLICY rls_users_delete ON users
  FOR DELETE
  USING (
    NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
  );

-- ----------------------------------------------------------------------------
-- 7.2 Organizations Table Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_org_select ON organizations;
CREATE POLICY rls_org_select ON organizations
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    OR id IN (
      SELECT om.organization_id FROM organization_memberships om
      WHERE om.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS rls_org_insert ON organizations;
CREATE POLICY rls_org_insert ON organizations
  FOR INSERT
  WITH CHECK (
    NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    OR NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
  );

DROP POLICY IF EXISTS rls_org_update ON organizations;
CREATE POLICY rls_org_update ON organizations
  FOR UPDATE
  USING (
    id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_org_delete ON organizations;
CREATE POLICY rls_org_delete ON organizations
  FOR DELETE
  USING (
    NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
  );

-- ----------------------------------------------------------------------------
-- 7.3 Organization Memberships Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_org_memberships_select ON organization_memberships;
CREATE POLICY rls_org_memberships_select ON organization_memberships
  FOR SELECT
  USING (
    is_active = true
    AND (
      organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
      OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

DROP POLICY IF EXISTS rls_org_memberships_insert ON organization_memberships;
CREATE POLICY rls_org_memberships_insert ON organization_memberships
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NOT EXISTS (
        -- Creator onboarding initial bootstrap
        SELECT 1 FROM organization_memberships om
        WHERE om.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
      )
    )
  );

DROP POLICY IF EXISTS rls_org_memberships_update ON organization_memberships;
CREATE POLICY rls_org_memberships_update ON organization_memberships
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

DROP POLICY IF EXISTS rls_org_memberships_delete ON organization_memberships;
CREATE POLICY rls_org_memberships_delete ON organization_memberships
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

-- ----------------------------------------------------------------------------
-- 7.4 Workspaces Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_workspaces_select ON workspaces;
CREATE POLICY rls_workspaces_select ON workspaces
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR id IN (
        SELECT wm.workspace_id 
        FROM workspace_memberships wm 
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND wm.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS rls_workspaces_insert ON workspaces;
CREATE POLICY rls_workspaces_insert ON workspaces
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

DROP POLICY IF EXISTS rls_workspaces_update ON workspaces;
CREATE POLICY rls_workspaces_update ON workspaces
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

DROP POLICY IF EXISTS rls_workspaces_delete ON workspaces;
CREATE POLICY rls_workspaces_delete ON workspaces
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

-- ----------------------------------------------------------------------------
-- 7.5 Workspace Memberships Policies
-- Ordinary users can view memberships of their assigned workspaces,
-- but only ORGANIZATION_ADMIN / WORKSPACE_ADMIN can insert, update, or delete.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_workspace_memberships_select ON workspace_memberships;
CREATE POLICY rls_workspace_memberships_select ON workspace_memberships
  FOR SELECT
  USING (
    is_active = true
    AND organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      OR workspace_id = NULLIF(current_setting('app.current_ws_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS rls_workspace_memberships_insert ON workspace_memberships;
CREATE POLICY rls_workspace_memberships_insert ON workspace_memberships
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN')
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

DROP POLICY IF EXISTS rls_workspace_memberships_update ON workspace_memberships;
CREATE POLICY rls_workspace_memberships_update ON workspace_memberships
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN')
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

DROP POLICY IF EXISTS rls_workspace_memberships_delete ON workspace_memberships;
CREATE POLICY rls_workspace_memberships_delete ON workspace_memberships
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN')
      OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    )
  );

-- ----------------------------------------------------------------------------
-- 7.6 Documents Policies
-- Viewers and Analysts can only SELECT documents.
-- Document Managers, Workspace Admins, and Org Admins can INSERT and UPDATE.
-- Only Admins can DELETE documents.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_documents_select ON documents;
CREATE POLICY rls_documents_select ON documents
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id FROM workspace_memberships wm
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND wm.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS rls_documents_insert ON documents;
CREATE POLICY rls_documents_insert ON documents
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER')
    )
  );

DROP POLICY IF EXISTS rls_documents_update ON documents;
CREATE POLICY rls_documents_update ON documents
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER')
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_documents_delete ON documents;
CREATE POLICY rls_documents_delete ON documents
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- 7.7 Document Chunks Policies
-- Chunks are read-only for Viewers, Analysts, and Reviewers.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_document_chunks_select ON document_chunks;
CREATE POLICY rls_document_chunks_select ON document_chunks
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id FROM workspace_memberships wm
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND wm.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS rls_document_chunks_insert ON document_chunks;
CREATE POLICY rls_document_chunks_insert ON document_chunks
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER')
    )
  );

DROP POLICY IF EXISTS rls_document_chunks_update ON document_chunks;
CREATE POLICY rls_document_chunks_update ON document_chunks
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER')
    )
  );

DROP POLICY IF EXISTS rls_document_chunks_delete ON document_chunks;
CREATE POLICY rls_document_chunks_delete ON document_chunks
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- 7.8 Extracted Fields Policies
-- Reviewers, Document Managers, and Admins can update fields (field verification).
-- Viewers and Analysts cannot update or delete extracted fields.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_extracted_fields_select ON extracted_fields;
CREATE POLICY rls_extracted_fields_select ON extracted_fields
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id FROM workspace_memberships wm
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND wm.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS rls_extracted_fields_insert ON extracted_fields;
CREATE POLICY rls_extracted_fields_insert ON extracted_fields
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER')
    )
  );

DROP POLICY IF EXISTS rls_extracted_fields_update ON extracted_fields;
CREATE POLICY rls_extracted_fields_update ON extracted_fields
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER')
    )
  );

DROP POLICY IF EXISTS rls_extracted_fields_delete ON extracted_fields;
CREATE POLICY rls_extracted_fields_delete ON extracted_fields
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- 7.9 Document Jobs Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_document_jobs_select ON document_jobs;
CREATE POLICY rls_document_jobs_select ON document_jobs
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id FROM workspace_memberships wm
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND wm.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS rls_document_jobs_insert ON document_jobs;
CREATE POLICY rls_document_jobs_insert ON document_jobs
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN ('ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER')
    )
  );

DROP POLICY IF EXISTS rls_document_jobs_update ON document_jobs;
CREATE POLICY rls_document_jobs_update ON document_jobs
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_document_jobs_delete ON document_jobs;
CREATE POLICY rls_document_jobs_delete ON document_jobs
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
    )
  );

-- ----------------------------------------------------------------------------
-- 7.10 Audit Logs Policies (SELECT restricted to Admin; INSERT permitted; UPDATE & DELETE denied)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_audit_logs_select ON audit_logs;
CREATE POLICY rls_audit_logs_select ON audit_logs
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
    )
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
REVOKE UPDATE, DELETE ON audit_logs FROM ledgerone_app;


-- ============================================================================
-- 9. REFRESH TOKENS & SESSION MANAGEMENT (PHASE 2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  family_id UUID NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_refresh_tokens_all ON refresh_tokens;
CREATE POLICY rls_refresh_tokens_all ON refresh_tokens
  FOR ALL
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
    OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO ledgerone_app;
