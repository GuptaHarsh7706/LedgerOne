import { appPool, adminPool, TenantContext, withTenantTransaction } from "../db/tenant-context.js";

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceRecord {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceMemberRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
  created_at: Date;
}

export class TenantService {
  /**
   * Onboard a new organization for an authenticated user.
   * Atomically provisions organization, default workspace, admin membership, and audit record.
   */
  async createOrganization(
    userId: string,
    input: { name: string; slug: string }
  ): Promise<{ organization: OrganizationRecord; defaultWorkspace: WorkspaceRecord }> {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const name = input.name.trim();

    if (!name || name.length < 2) {
      throw new Error("Organization name must be at least 2 characters");
    }
    if (!slug || slug.length < 2) {
      throw new Error("Organization slug must be at least 2 characters");
    }

    const client = await appPool.connect();
    try {
      await client.query("BEGIN;");

      // Check slug uniqueness
      const existing = await client.query(
        "SELECT id FROM organizations WHERE slug = $1;",
        [slug]
      );
      if (existing.rows.length > 0) {
        throw new Error(`Organization slug '${slug}' is already taken`);
      }

      // 1. Create Organization
      const orgRes = await client.query(
        `INSERT INTO organizations (name, slug)
         VALUES ($1, $2)
         RETURNING id, name, slug, is_active, created_at, updated_at;`,
        [name, slug]
      );
      const organization: OrganizationRecord = orgRes.rows[0];

      // Set tenant context for remaining provisioning inside transaction
      await client.query(
        `SELECT set_config('app.current_org_id', $1, true),
                set_config('app.current_user_id', $2, true),
                set_config('app.current_user_role', 'ORGANIZATION_ADMIN', true);`,
        [organization.id, userId]
      );

      // 2. Add creator as ORGANIZATION_ADMIN
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, 'ORGANIZATION_ADMIN');`,
        [organization.id, userId]
      );

      // 3. Create Default Workspace
      const wsRes = await client.query(
        `INSERT INTO workspaces (organization_id, name, slug)
         VALUES ($1, 'General', 'general')
         RETURNING id, organization_id, name, slug, is_archived, created_at, updated_at;`,
        [organization.id]
      );
      const defaultWorkspace: WorkspaceRecord = wsRes.rows[0];

      // 4. Assign creator to default workspace with DOCUMENT_MANAGER role
      await client.query(
        `INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role)
         VALUES ($1, $2, $3, 'DOCUMENT_MANAGER');`,
        [organization.id, defaultWorkspace.id, userId]
      );

      // 5. Immutable Audit Log Entry
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, tenant_slug_snapshot, workspace_id, user_id, action, entity_type, entity_id
         ) VALUES ($1, $2, $3, $4, 'ORGANIZATION_CREATED', 'ORGANIZATION', $1);`,
        [organization.id, slug, defaultWorkspace.id, userId]
      );

      await client.query("COMMIT;");
      return { organization, defaultWorkspace };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      try {
        await client.query("RESET ALL;");
      } catch {}
      client.release();
    }
  }

  /**
   * List organizations for a user.
   */
  async getUserOrganizations(userId: string): Promise<Array<OrganizationRecord & { role: string }>> {
    const client = await adminPool.connect();
    try {
      const res = await client.query(
        `SELECT o.id, o.name, o.slug, o.is_active, o.created_at, o.updated_at, om.role
         FROM organizations o
         JOIN organization_memberships om ON o.id = om.organization_id
         WHERE om.user_id = $1 AND om.is_active = true AND o.is_active = true
         ORDER BY o.name ASC;`,
        [userId]
      );
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Create a workspace within the active tenant organization.
   * Enforces role requirements and RLS.
   */
  async createWorkspace(
    ctx: TenantContext,
    input: { name: string; slug: string }
  ): Promise<WorkspaceRecord> {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const name = input.name.trim();

    return withTenantTransaction(ctx, async (client) => {
      // Role check: Only ORGANIZATION_ADMIN can create workspaces
      if (ctx.userRole !== "ORGANIZATION_ADMIN") {
        throw new Error("Only organization administrators can create workspaces");
      }

      const res = await client.query(
        `INSERT INTO workspaces (organization_id, name, slug)
         VALUES ($1, $2, $3)
         RETURNING id, organization_id, name, slug, is_archived, created_at, updated_at;`,
        [ctx.organizationId, name, slug]
      );
      const ws = res.rows[0];

      // Add creator to workspace
      if (ctx.userId) {
        await client.query(
          `INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role)
           VALUES ($1, $2, $3, 'DOCUMENT_MANAGER');`,
          [ctx.organizationId, ws.id, ctx.userId]
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, tenant_slug_snapshot, workspace_id, user_id, action, entity_type, entity_id
         ) VALUES ($1, 'snapshot', $2, $3, 'WORKSPACE_CREATED', 'WORKSPACE', $2);`,
        [ctx.organizationId, ws.id, ctx.userId || null]
      );

      return ws;
    });
  }

  /**
   * List workspaces accessible to the user in current organization.
   * PostgreSQL RLS automatically filters this based on role and workspace_memberships!
   */
  async getWorkspaces(ctx: TenantContext): Promise<WorkspaceRecord[]> {
    return withTenantTransaction(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, organization_id, name, slug, is_archived, created_at, updated_at
         FROM workspaces
         WHERE organization_id = $1 AND is_archived = false
         ORDER BY created_at ASC;`,
        [ctx.organizationId]
      );
      return res.rows;
    });
  }

  /**
   * Add a member to a workspace.
   */
  async addWorkspaceMember(
    ctx: TenantContext,
    input: { workspaceId: string; targetUserId: string; role: string }
  ): Promise<WorkspaceMemberRecord> {
    const allowedRoles = ["DOCUMENT_MANAGER", "REVIEWER", "ANALYST", "VIEWER"];
    if (!allowedRoles.includes(input.role)) {
      throw new Error(`Invalid workspace role '${input.role}'. Allowed: ${allowedRoles.join(", ")}`);
    }

    return withTenantTransaction(ctx, async (client) => {
      if (ctx.userRole !== "ORGANIZATION_ADMIN") {
        throw new Error("Only organization administrators can manage workspace memberships");
      }

      const res = await client.query(
        `INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, workspace_id, user_id)
         DO UPDATE SET role = EXCLUDED.role
         RETURNING id, organization_id, workspace_id, user_id, role, created_at;`,
        [ctx.organizationId, input.workspaceId, input.targetUserId, input.role]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, tenant_slug_snapshot, workspace_id, user_id, action, entity_type, entity_id
         ) VALUES ($1, 'snapshot', $2, $3, 'MEMBER_ADDED', 'WORKSPACE_MEMBERSHIP', $4);`,
        [ctx.organizationId, input.workspaceId, ctx.userId || null, res.rows[0].id]
      );

      return res.rows[0];
    });
  }

  /**
   * Remove a member from a workspace.
   */
  async removeWorkspaceMember(
    ctx: TenantContext,
    input: { workspaceId: string; targetUserId: string }
  ): Promise<boolean> {
    return withTenantTransaction(ctx, async (client) => {
      if (ctx.userRole !== "ORGANIZATION_ADMIN") {
        throw new Error("Only organization administrators can manage workspace memberships");
      }

      const res = await client.query(
        `DELETE FROM workspace_memberships
         WHERE organization_id = $1 AND workspace_id = $2 AND user_id = $3;`,
        [ctx.organizationId, input.workspaceId, input.targetUserId]
      );

      return (res.rowCount ?? 0) > 0;
    });
  }
}
