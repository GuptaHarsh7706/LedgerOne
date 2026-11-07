import { useState, useEffect } from 'react';
import { RoleType } from '../types';

export const ALL_ROLES: RoleType[] = [
  'PLATFORM_ADMIN',
  'ORGANIZATION_ADMIN',
  'WORKSPACE_ADMIN',
  'DOCUMENT_MANAGER',
  'REVIEWER',
  'ANALYST',
  'VIEWER',
];

export const ROLE_LABELS: Record<RoleType, { label: string; badge: string; description: string }> = {
  PLATFORM_ADMIN: {
    label: 'Platform Admin',
    badge: 'Superuser',
    description: 'Full unconstrained platform and tenant administration.',
  },
  ORGANIZATION_ADMIN: {
    label: 'Org Admin',
    badge: 'Executive',
    description: 'Full administrative authority across all organization workspaces.',
  },
  WORKSPACE_ADMIN: {
    label: 'Workspace Admin',
    badge: 'Controller',
    description: 'Manages workspace membership, settings, and final document approvals.',
  },
  DOCUMENT_MANAGER: {
    label: 'Doc Manager',
    badge: 'Operations',
    description: 'Ingestion, cataloging, and 3-way matching initiator. Barred from approvals.',
  },
  REVIEWER: {
    label: 'Forensic Reviewer',
    badge: 'Auditor',
    description: 'Field corrections, invariant overrides (INV-010), and verification.',
  },
  ANALYST: {
    label: 'Financial Analyst',
    badge: 'Analytics',
    description: 'Read-only access to documents, spend analytics, and match insights.',
  },
  VIEWER: {
    label: 'Read-Only Viewer',
    badge: 'Observer',
    description: 'Strictly read-only document browsing. No upload or AI compute access.',
  },
};

export const ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  PLATFORM_ADMIN: ['*'],
  ORGANIZATION_ADMIN: [
    'organization.read', 'organization.update', 'organization.members.manage', 'organization.workspaces.manage',
    'workspace.read', 'workspace.update', 'workspace.delete', 'workspace.members.manage',
    'documents.read', 'documents.upload', 'documents.delete', 'documents.export',
    'review.read', 'review.claim', 'review.correct', 'review.override', 'review.verify', 'review.approve', 'review.reject', 'review.reopen',
    'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read', 'matching.create', 'matching.resolve',
    'APPROVE_INVARIANTS', 'UPLOAD_DOCUMENTS', 'EDIT_EXTRACTIONS', 'EXECUTE_SETTLEMENT', 'MANAGE_USERS', 'VIEW_ANALYTICS',
  ],
  WORKSPACE_ADMIN: [
    'organization.read', 'organization.members.read',
    'workspace.read', 'workspace.update', 'workspace.members.manage',
    'documents.read', 'documents.upload', 'documents.delete', 'documents.export',
    'review.read', 'review.claim', 'review.correct', 'review.override', 'review.verify', 'review.approve', 'review.reject', 'review.reopen',
    'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read', 'matching.create', 'matching.resolve',
    'APPROVE_INVARIANTS', 'UPLOAD_DOCUMENTS', 'EDIT_EXTRACTIONS', 'EXECUTE_SETTLEMENT', 'MANAGE_USERS', 'VIEW_ANALYTICS',
  ],
  DOCUMENT_MANAGER: [
    'organization.read', 'workspace.read', 'documents.read', 'documents.upload', 'documents.export',
    'review.read', 'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read', 'matching.create',
    'UPLOAD_DOCUMENTS', 'VIEW_ANALYTICS',
  ],
  REVIEWER: [
    'organization.read', 'workspace.read', 'documents.read', 'documents.export',
    'review.read', 'review.claim', 'review.correct', 'review.override', 'review.verify', 'review.approve', 'review.reject', 'review.reopen',
    'assistant.use', 'assistant.read_history', 'matching.read', 'matching.resolve',
    'APPROVE_INVARIANTS', 'EDIT_EXTRACTIONS', 'EXECUTE_SETTLEMENT',
  ],
  ANALYST: [
    'organization.read', 'workspace.read', 'documents.read', 'documents.export',
    'review.read', 'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read',
    'VIEW_ANALYTICS',
  ],
  VIEWER: [
    'organization.read', 'workspace.read', 'documents.read',
  ],
};

/**
 * Canonical bidirectional mapping between UI macro action tokens and granular permissions.
 */
export const PERMISSION_ALIASES: Record<string, string[]> = {
  APPROVE_INVARIANTS: ['review.approve', 'review.override'],
  OVERRIDE_INVARIANTS: ['review.override'],
  VERIFY_INVARIANTS: ['review.verify'],
  UPLOAD_DOCUMENTS: ['documents.upload'],
  EDIT_EXTRACTIONS: ['review.correct', 'review.override'],
  EXECUTE_SETTLEMENT: ['matching.resolve'],
  MANAGE_USERS: ['workspace.members.manage', 'organization.members.manage'],
  VIEW_ANALYTICS: ['analytics.read'],
  USE_ASSISTANT: ['assistant.use'],
};

export function hasPermission(role: RoleType, permission: string): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes('*') || perms.includes(permission)) return true;

  // Check alias mappings: if queried permission is a macro key (e.g. 'APPROVE_INVARIANTS')
  const mappedGranulars = PERMISSION_ALIASES[permission];
  if (mappedGranulars && mappedGranulars.some((p) => perms.includes(p))) {
    return true;
  }

  // Reverse check: if queried permission is granular and a macro in perms provides it
  for (const [macro, granulars] of Object.entries(PERMISSION_ALIASES)) {
    if (granulars.includes(permission) && perms.includes(macro)) {
      return true;
    }
  }

  return false;
}

import { useAuth } from '../context/AuthContext';

export type ActiveRoleReturn = [RoleType, (newRole: RoleType) => void] & {
  currentRole: RoleType;
  role: RoleType;
  setRole: (newRole: RoleType) => void;
};

/**
 * Production RBAC hook: reads role strictly from the authenticated JWT session.
 * Client-side arbitrary role tampering is permanently barred.
 */
export function useActiveRole(): ActiveRoleReturn {
  const { user } = useAuth();
  const currentRole: RoleType = user?.role || 'VIEWER';

  const setRole = (newRole: RoleType) => {
    console.warn(
      `[SECURITY BARRIER] Direct client-side role elevation to '${newRole}' is blocked. ` +
      `User role is determined exclusively by server PostgreSQL 18.6 RLS and active workspace membership.`
    );
  };

  const result = [currentRole, setRole] as any;
  result.currentRole = currentRole;
  result.role = currentRole;
  result.setRole = setRole;
  return result;
}
