/**
 * Enterprise Role-Based Access Control (RBAC) & Permission Service.
 * Canonical parity with LedgerOne FastAPI permission engine and PostgreSQL RLS.
 */
import { useEffect, useState } from "react";

export type EnterpriseRole =
  | "PLATFORM_ADMIN"
  | "ORGANIZATION_ADMIN"
  | "WORKSPACE_ADMIN"
  | "DOCUMENT_MANAGER"
  | "REVIEWER"
  | "ANALYST"
  | "VIEWER";

export const ALL_ROLES: EnterpriseRole[] = [
  "PLATFORM_ADMIN",
  "ORGANIZATION_ADMIN",
  "WORKSPACE_ADMIN",
  "DOCUMENT_MANAGER",
  "REVIEWER",
  "ANALYST",
  "VIEWER",
];

export const ROLE_DISPLAY_NAMES: Record<EnterpriseRole, string> = {
  PLATFORM_ADMIN: "Platform Administrator",
  ORGANIZATION_ADMIN: "Organization Admin",
  WORKSPACE_ADMIN: "Workspace Admin",
  DOCUMENT_MANAGER: "Document Manager",
  REVIEWER: "Financial Reviewer",
  ANALYST: "Financial Analyst",
  VIEWER: "Document Viewer (Read Only)",
};

export const ROLE_PERMISSIONS: Record<EnterpriseRole, string[]> = {
  PLATFORM_ADMIN: ["*"],
  ORGANIZATION_ADMIN: [
    "organization.read",
    "organization.update",
    "organization.delete",
    "organization.members.read",
    "organization.members.manage",
    "organization.workspaces.manage",
    "workspace.read",
    "workspace.update",
    "workspace.delete",
    "workspace.members.read",
    "workspace.members.manage",
    "documents.read",
    "documents.upload",
    "documents.delete",
    "documents.export",
    "review.read",
    "review.claim",
    "review.correct",
    "review.override",
    "review.verify",
    "review.approve",
    "review.reject",
    "review.reopen",
    "assistant.use",
    "assistant.read_history",
    "analytics.read",
    "matching.read",
    "matching.create",
    "matching.resolve",
  ],
  WORKSPACE_ADMIN: [
    "organization.read",
    "organization.members.read",
    "workspace.read",
    "workspace.update",
    "workspace.delete",
    "workspace.members.read",
    "workspace.members.manage",
    "documents.read",
    "documents.upload",
    "documents.delete",
    "documents.export",
    "review.read",
    "review.claim",
    "review.correct",
    "review.override",
    "review.verify",
    "review.approve",
    "review.reject",
    "review.reopen",
    "assistant.use",
    "assistant.read_history",
    "analytics.read",
    "matching.read",
    "matching.create",
    "matching.resolve",
  ],
  DOCUMENT_MANAGER: [
    "organization.read",
    "organization.members.read",
    "workspace.read",
    "workspace.members.read",
    "documents.read",
    "documents.upload",
    // Strictly barred from documents.delete (Admins only) and review.correct/override/approve/reject (SoD)
    "documents.export",
    "review.read",
    "assistant.use",
    "assistant.read_history",
    "analytics.read",
    "matching.read",
    "matching.create",
  ],
  REVIEWER: [
    "organization.read",
    "organization.members.read",
    "workspace.read",
    "workspace.members.read",
    "documents.read",
    "documents.export",
    "review.read",
    "review.claim",
    "review.correct",
    "review.override",
    "review.verify",
    "review.approve",
    "review.reject",
    "review.reopen",
    "assistant.use",
    "assistant.read_history",
    "matching.read",
    "matching.resolve",
    // Strictly barred from documents.upload, documents.delete, workspace.members.manage
  ],
  ANALYST: [
    "organization.read",
    "organization.members.read",
    "workspace.read",
    "workspace.members.read",
    "documents.read",
    "documents.export",
    "review.read",
    "assistant.use",
    "assistant.read_history",
    "analytics.read",
    "matching.read",
    // Strictly barred from documents.upload, documents.delete, review edits, matching execution
  ],
  VIEWER: [
    "organization.read",
    "workspace.read",
    "documents.read",
    // Strictly read-only
  ],
};

const STORAGE_ROLE_KEY = "ledgerone_simulated_role";
const ROLE_CHANGE_EVENT = "ledgerone_role_change";

export function getActiveRole(): EnterpriseRole {
  if (typeof window === "undefined") return "ORGANIZATION_ADMIN";
  const stored = localStorage.getItem(STORAGE_ROLE_KEY) as EnterpriseRole | null;
  if (stored && ALL_ROLES.includes(stored)) {
    return stored;
  }
  return "ORGANIZATION_ADMIN";
}

export function setActiveRole(role: EnterpriseRole): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_ROLE_KEY, role);
  window.dispatchEvent(new CustomEvent(ROLE_CHANGE_EVENT, { detail: role }));
}

export function hasPermission(permission: string, explicitRole?: EnterpriseRole): boolean {
  const role = explicitRole || getActiveRole();
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

export function useActiveRole(): {
  role: EnterpriseRole;
  setRole: (role: EnterpriseRole) => void;
  can: (permission: string) => boolean;
} {
  const [role, setRoleState] = useState<EnterpriseRole>(getActiveRole());

  useEffect(() => {
    const handleRoleChange = (e: Event) => {
      const customEvent = e as CustomEvent<EnterpriseRole>;
      if (customEvent.detail) {
        setRoleState(customEvent.detail);
      } else {
        setRoleState(getActiveRole());
      }
    };

    window.addEventListener(ROLE_CHANGE_EVENT, handleRoleChange);
    window.addEventListener("storage", handleRoleChange);
    return () => {
      window.removeEventListener(ROLE_CHANGE_EVENT, handleRoleChange);
      window.removeEventListener("storage", handleRoleChange);
    };
  }, []);

  const setRole = (newRole: EnterpriseRole) => {
    setActiveRole(newRole);
    setRoleState(newRole);
  };

  const can = (permission: string) => {
    return hasPermission(permission, role);
  };

  return { role, setRole, can };
}
