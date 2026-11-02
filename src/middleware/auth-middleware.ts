import { Request, Response, NextFunction } from "express";
import { AuthService, AuthTokenPayload } from "../auth/auth-service.js";
import { TenantContext, withTenantTransaction } from "../db/tenant-context.js";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      tenantContext?: TenantContext;
    }
  }
}

const authService = new AuthService();

/**
 * Middleware: Verifies Bearer JWT token in Authorization header.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: err.message });
  }
}

/**
 * Middleware: Resolves and validates tenant context (organization & workspace) for the authenticated user.
 * Runs inside a scoped transaction so PostgreSQL RLS evaluates against current tenant context.
 */
export async function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const orgId =
    (req.headers["x-organization-id"] as string) ||
    req.user.organizationId ||
    (req.query.org_id as string) ||
    req.body?.organization_id;

  if (!orgId) {
    return res.status(400).json({ error: "Organization context required (via header 'x-organization-id' or token)" });
  }

  const workspaceId =
    (req.headers["x-workspace-id"] as string) ||
    (req.query.workspace_id as string) ||
    req.body?.workspace_id ||
    req.params?.workspaceId;

  try {
    const result = await withTenantTransaction(
      { organizationId: orgId, userId: req.user.userId, isPlatformAdmin: req.user.isPlatformAdmin },
      async (client) => {
        // 1. Verify organization membership & determine role
        const orgMemberRes = await client.query(
          `SELECT role FROM organization_memberships
           WHERE organization_id = $1 AND user_id = $2 AND is_active = true;`,
          [orgId, req.user!.userId]
        );

        let role: string | null = null;
        if (req.user!.isPlatformAdmin) {
          role = "ORGANIZATION_ADMIN";
        } else if (orgMemberRes.rows.length > 0) {
          role = orgMemberRes.rows[0].role;
        } else {
          return { errorStatus: 403, errorMessage: "You are not a member of this organization" };
        }

        // 2. If workspaceId provided and user is not ORG_ADMIN, check workspace membership
        if (workspaceId && role !== "ORGANIZATION_ADMIN") {
          const wsMemberRes = await client.query(
            `SELECT role FROM workspace_memberships
             WHERE organization_id = $1 AND workspace_id = $2 AND user_id = $3 AND is_active = true;`,
            [orgId, workspaceId, req.user!.userId]
          );
          if (wsMemberRes.rows.length === 0) {
            return { errorStatus: 403, errorMessage: "You do not have access to this workspace" };
          }
          role = wsMemberRes.rows[0].role;
        }

        return { role };
      }
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    req.tenantContext = {
      organizationId: orgId,
      workspaceId: workspaceId || undefined,
      userId: req.user.userId,
      userRole: result.role!,
      isPlatformAdmin: req.user.isPlatformAdmin,
    };

    next();
  } catch (err: any) {
    return res.status(500).json({ error: `Tenant context error: ${err.message}` });
  }
}

/**
 * Middleware Factory: Enforces that the user has at least one of the specified roles.
 */
export function requireRoles(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantContext) {
      return res.status(500).json({ error: "Tenant context not initialized" });
    }

    const userRole = req.tenantContext.userRole || "VIEWER";
    if (req.user?.isPlatformAdmin || userRole === "ORGANIZATION_ADMIN") {
      return next(); // Admins bypass lower role restrictions
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: `Insufficient permissions: role '${userRole}' is not authorized. Required: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
}
