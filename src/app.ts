import express, { Request, Response } from "express";
import {
  checkDatabaseHealth,
  initDatabase,
  insertTransaction,
  getTransactions,
} from "./db.js";
import {
  checkStorageHealth,
  uploadDocument,
  getDocument,
  listDocuments,
} from "./storage.js";
import { config } from "./config.js";
import { AuthService } from "./auth/auth-service.js";
import { TenantService } from "./tenant/tenant-service.js";
import { UploadService } from "./storage/upload-service.js";
import { TransactionalJobQueue } from "./queue/job-queue.js";
import {
  authenticate,
  requireTenantContext,
  requireRoles,
} from "./middleware/auth-middleware.js";
import { withTenantTransaction } from "./db/tenant-context.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  const authService = new AuthService();
  const tenantService = new TenantService();
  const uploadService = new UploadService();
  const jobQueue = new TransactionalJobQueue();

  // ==========================================================================
  // 1. Health & Services Diagnostics
  // ==========================================================================
  app.get("/health", async (req: Request, res: Response) => {
    try {
      const [dbStatus, storageStatus] = await Promise.all([
        checkDatabaseHealth(),
        checkStorageHealth(),
      ]);

      res.status(200).json({
        status: "healthy",
        neon: {
          branch: config.neon.branch,
          postgres: dbStatus,
          objectStorage: storageStatus,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "unhealthy",
        error: error.message,
      });
    }
  });

  // ==========================================================================
  // 2. Phase 1 Backward-Compatible Routes
  // ==========================================================================
  app.get("/api/transactions", async (req: Request, res: Response) => {
    try {
      const transactions = await getTransactions();
      res.status(200).json({ transactions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transactions", async (req: Request, res: Response) => {
    try {
      const { description, amount, type, document_key } = req.body;
      if (!description || typeof amount !== "number" || !type) {
        return res.status(400).json({
          error: "Invalid payload: description, amount (number), and type ('DEBIT' | 'CREDIT') are required.",
        });
      }

      const transaction = await insertTransaction({
        description,
        amount,
        type,
        document_key,
      });

      res.status(201).json({ transaction });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/documents", async (req: Request, res: Response) => {
    try {
      const { key, content, contentType } = req.body;
      if (!key || typeof content !== "string") {
        return res.status(400).json({
          error: "Invalid payload: 'key' and 'content' string are required.",
        });
      }

      const uploaded = await uploadDocument(key, content, contentType || "text/plain");
      res.status(201).json({ document: uploaded });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/documents/:key", async (req: Request, res: Response) => {
    try {
      const key = req.params.key as string;
      const document = await getDocument(key);
      res.status(200).json({ document });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  app.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
      const keys = await listDocuments(prefix);
      res.status(200).json({ keys });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // 3. Phase 2: Authentication & Identity APIs
  // ==========================================================================
  app.post("/api/v1/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, fullName, isPlatformAdmin } = req.body;
      if (!email || !password || !fullName) {
        return res.status(400).json({ error: "email, password, and fullName are required" });
      }

      const user = await authService.registerUser({
        email,
        password,
        fullName,
        isPlatformAdmin,
      });

      res.status(201).json({ user });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/v1/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }

      const loginResult = await authService.loginUser({ email, password });
      res.status(200).json(loginResult);
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post("/api/v1/auth/refresh", async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: "refreshToken is required" });
      }

      const payload = authService.verifyToken(refreshToken);
      const user = await authService.getUserById(payload.userId);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: "User inactive or not found" });
      }

      const newAccessToken = authService.signAccessToken({
        userId: user.id,
        email: user.email,
        isPlatformAdmin: user.is_platform_admin,
        organizationId: payload.organizationId,
        role: payload.role,
      });

      res.status(200).json({ accessToken: newAccessToken });
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  app.get("/api/v1/auth/me", authenticate, async (req: Request, res: Response) => {
    try {
      const user = await authService.getUserById(req.user!.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const organizations = await tenantService.getUserOrganizations(user.id);
      res.status(200).json({ user, organizations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // 4. Phase 2: Organization & Workspace APIs
  // ==========================================================================
  app.post("/api/v1/organizations", authenticate, async (req: Request, res: Response) => {
    try {
      const { name, slug } = req.body;
      if (!name || !slug) {
        return res.status(400).json({ error: "name and slug are required" });
      }

      const result = await tenantService.createOrganization(req.user!.userId, { name, slug });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/v1/organizations", authenticate, async (req: Request, res: Response) => {
    try {
      const orgs = await tenantService.getUserOrganizations(req.user!.userId);
      res.status(200).json({ organizations: orgs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/v1/workspaces",
    authenticate,
    requireTenantContext,
    requireRoles(["ORGANIZATION_ADMIN"]),
    async (req: Request, res: Response) => {
      try {
        const { name, slug } = req.body;
        if (!name || !slug) {
          return res.status(400).json({ error: "name and slug are required" });
        }

        const workspace = await tenantService.createWorkspace(req.tenantContext!, { name, slug });
        res.status(201).json({ workspace });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/v1/workspaces",
    authenticate,
    requireTenantContext,
    async (req: Request, res: Response) => {
      try {
        const workspaces = await tenantService.getWorkspaces(req.tenantContext!);
        res.status(200).json({ workspaces });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/members",
    authenticate,
    requireTenantContext,
    requireRoles(["ORGANIZATION_ADMIN"]),
    async (req: Request, res: Response) => {
      try {
        const workspaceId = req.params.workspaceId as string;
        const { targetUserId, role } = req.body;

        if (!targetUserId || !role) {
          return res.status(400).json({ error: "targetUserId and role are required" });
        }

        const member = await tenantService.addWorkspaceMember(req.tenantContext!, {
          workspaceId,
          targetUserId,
          role,
        });

        res.status(201).json({ member });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    "/api/v1/workspaces/:workspaceId/members/:userId",
    authenticate,
    requireTenantContext,
    requireRoles(["ORGANIZATION_ADMIN"]),
    async (req: Request, res: Response) => {
      try {
        const workspaceId = req.params.workspaceId as string;
        const targetUserId = req.params.userId as string;

        const removed = await tenantService.removeWorkspaceMember(req.tenantContext!, {
          workspaceId,
          targetUserId,
        });

        res.status(200).json({ success: removed });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ==========================================================================
  // 5. Phase 1 & 2: Document Ingestion Saga & Job Management
  // ==========================================================================
  app.post(
    "/api/v1/documents/upload-intent",
    authenticate,
    requireTenantContext,
    requireRoles(["ORGANIZATION_ADMIN", "DOCUMENT_MANAGER"]),
    async (req: Request, res: Response) => {
      try {
        const { filename, fileSizeBytes, mimeType, sha256Hash, category } = req.body;
        if (!filename || typeof fileSizeBytes !== "number" || !mimeType || !sha256Hash) {
          return res.status(400).json({
            error: "filename, fileSizeBytes (number), mimeType, and sha256Hash are required",
          });
        }

        if (!req.tenantContext!.workspaceId) {
          return res.status(400).json({
            error: "workspace_id is required for document uploads (via 'x-workspace-id' header or body)",
          });
        }

        const result = await uploadService.createUploadIntent(req.tenantContext!, {
          filename,
          fileSizeBytes,
          mimeType,
          sha256Hash,
          category,
        });

        res.status(201).json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/v1/documents/:id/confirm-upload",
    authenticate,
    requireTenantContext,
    requireRoles(["ORGANIZATION_ADMIN", "DOCUMENT_MANAGER"]),
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.id as string;
        const result = await uploadService.confirmUpload(req.tenantContext!, documentId);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/v1/documents",
    authenticate,
    requireTenantContext,
    async (req: Request, res: Response) => {
      try {
        const docs = await withTenantTransaction(req.tenantContext!, async (client) => {
          let query = `
            SELECT id, organization_id, workspace_id, filename, file_size_bytes,
                   mime_type, sha256_hash, status, category, created_at, updated_at
            FROM documents
            WHERE organization_id = $1 AND is_deleted = false
          `;
          const params: any[] = [req.tenantContext!.organizationId];

          if (req.tenantContext!.workspaceId) {
            query += ` AND workspace_id = $2`;
            params.push(req.tenantContext!.workspaceId);
          }

          query += ` ORDER BY created_at DESC;`;
          const result = await client.query(query, params);
          return result.rows;
        });

        res.status(200).json({ documents: docs });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/v1/documents/:id",
    authenticate,
    requireTenantContext,
    async (req: Request, res: Response) => {
      try {
        const documentId = req.params.id as string;
        const doc = await withTenantTransaction(req.tenantContext!, async (client) => {
          const result = await client.query(
            `SELECT id, organization_id, workspace_id, filename, file_size_bytes,
                    mime_type, sha256_hash, s3_key, status, category, metadata, created_at, updated_at
             FROM documents
             WHERE id = $1 AND organization_id = $2;`,
            [documentId, req.tenantContext!.organizationId]
          );
          return result.rows[0] || null;
        });

        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }

        res.status(200).json({ document: doc });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/v1/jobs/:id",
    authenticate,
    requireTenantContext,
    async (req: Request, res: Response) => {
      try {
        const jobId = req.params.id as string;
        const job = await withTenantTransaction(req.tenantContext!, async (client) => {
          const result = await client.query(
            `SELECT id, organization_id, workspace_id, document_id, action,
                    status, priority, attempts, max_attempts, last_error, run_at, created_at
             FROM document_jobs
             WHERE id = $1 AND organization_id = $2;`,
            [jobId, req.tenantContext!.organizationId]
          );
          return result.rows[0] || null;
        });

        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }

        res.status(200).json({ job });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ==========================================================================
  // 6. Phase 3: Background Janitor & Reaper Maintenance APIs
  // ==========================================================================
  app.post("/api/v1/maintenance/janitor", authenticate, async (req: Request, res: Response) => {
    try {
      if (!req.user?.isPlatformAdmin) {
        return res.status(403).json({ error: "Platform admin privileges required" });
      }
      const result = await uploadService.cleanupOrphanedUploads();
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/v1/maintenance/reaper", authenticate, async (req: Request, res: Response) => {
    try {
      if (!req.user?.isPlatformAdmin) {
        return res.status(403).json({ error: "Platform admin privileges required" });
      }
      const result = await jobQueue.reapExpiredLeases();
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
