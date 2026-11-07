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
  ],
  WORKSPACE_ADMIN: [
    'organization.read', 'organization.members.read',
    'workspace.read', 'workspace.update', 'workspace.members.manage',
    'documents.read', 'documents.upload', 'documents.delete', 'documents.export',
    'review.read', 'review.claim', 'review.correct', 'review.override', 'review.verify', 'review.approve', 'review.reject', 'review.reopen',
    'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read', 'matching.create', 'matching.resolve',
  ],
  DOCUMENT_MANAGER: [
    'organization.read', 'workspace.read', 'documents.read', 'documents.upload', 'documents.export',
    'review.read', 'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read', 'matching.create',
  ],
  REVIEWER: [
    'organization.read', 'workspace.read', 'documents.read', 'documents.export',
    'review.read', 'review.claim', 'review.correct', 'review.override', 'review.verify', 'review.reject', 'review.reopen',
    'assistant.use', 'assistant.read_history', 'matching.read', 'matching.resolve',
  ],
  ANALYST: [
    'organization.read', 'workspace.read', 'documents.read', 'documents.export',
    'review.read', 'assistant.use', 'assistant.read_history', 'analytics.read', 'matching.read',
  ],
  VIEWER: [
    'organization.read', 'workspace.read', 'documents.read',
  ],
};

export function hasPermission(role: RoleType, permission: string): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

const STORAGE_KEY = 'ledgerone_simulated_role';

export type ActiveRoleReturn = [RoleType, (newRole: RoleType) => void] & {
  currentRole: RoleType;
  role: RoleType;
  setRole: (newRole: RoleType) => void;
};

export function useActiveRole(): ActiveRoleReturn {
  const [role, setRoleState] = useState<RoleType>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ALL_ROLES.includes(saved as RoleType)) {
      return saved as RoleType;
    }
    return 'WORKSPACE_ADMIN'; // Default to controller
  });

  const setRole = (newRole: RoleType) => {
    setRoleState(newRole);
    localStorage.setItem(STORAGE_KEY, newRole);
    window.dispatchEvent(new Event('ledgerone-role-change'));
  };

  useEffect(() => {
    const onRoleChange = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && ALL_ROLES.includes(saved as RoleType)) {
        setRoleState(saved as RoleType);
      }
    };
    window.addEventListener('ledgerone-role-change', onRoleChange);
    return () => window.removeEventListener('ledgerone-role-change', onRoleChange);
  }, []);

  const result = [role, setRole] as any;
  result.currentRole = role;
  result.role = role;
  result.setRole = setRole;
  return result;
}
