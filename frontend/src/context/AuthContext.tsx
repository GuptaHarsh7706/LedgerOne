import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RoleType } from '../types';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_platform_admin: boolean;
  role: RoleType;
  org_id: string;
  org_name: string;
  org_slug: string;
  ws_id: string;
  ws_name: string;
  ws_slug: string;
}

export interface PersonaPreset {
  key: string;
  email: string;
  role: RoleType;
  name: string;
  title: string;
  orgName: string;
  orgId: string;
  wsId: string;
  wsName: string;
  badge: string;
  description: string;
}

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    key: 'ws_admin',
    email: 'ws_admin@apexcapital.internal',
    role: 'WORKSPACE_ADMIN',
    name: 'Sarah Lin',
    title: 'Senior Financial Controller',
    orgName: 'Apex Global Capital',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Controller',
    description: 'Workspace authority. Approves invoices, reconciles 3-way matches, manages workspace members.',
  },
  {
    key: 'reviewer',
    email: 'reviewer@apexcapital.internal',
    role: 'REVIEWER',
    name: 'Dr. Rachel Sterling',
    title: 'Lead Forensic Reviewer & Auditor',
    orgName: 'Apex Global Capital',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Dual-Custody Auditor',
    description: 'Field corrections & invariant overrides. Bound by SoD AUTH_SOD_002 dual-custody rules.',
  },
  {
    key: 'doc_manager',
    email: 'doc_manager@apexcapital.internal',
    role: 'DOCUMENT_MANAGER',
    name: 'Marcus Thorne',
    title: 'Document Operations Manager',
    orgName: 'Apex Global Capital',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Ingestion Ops',
    description: 'Direct ingestion & OCR pipeline manager. Barred from approvals under AUTH_SOD_003.',
  },
  {
    key: 'analyst',
    email: 'analyst@apexcapital.internal',
    role: 'ANALYST',
    name: 'David Chen',
    title: 'Quantitative Spend Analyst',
    orgName: 'Apex Global Capital',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Analytics',
    description: 'Read-only access to commitments, spend trends, and AI telemetry.',
  },
  {
    key: 'viewer',
    email: 'viewer@apexcapital.internal',
    role: 'VIEWER',
    name: 'Jonathan Miller',
    title: 'External Compliance Observer',
    orgName: 'Apex Global Capital',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Observer',
    description: 'Strict read-only document browsing. Barred from upload, review, 3-way matching, and AI.',
  },
  {
    key: 'org_admin',
    email: 'org_admin@apexcapital.internal',
    role: 'ORGANIZATION_ADMIN',
    name: 'Eleanor Vance',
    title: 'VP Finance & Operations',
    orgName: 'Apex Global Capital',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Executive',
    description: 'Organization-wide authority. Manages billing, workspaces, members, and platform integrations.',
  },
  {
    key: 'platform_admin',
    email: 'platform_admin@ledgerone.internal',
    role: 'PLATFORM_ADMIN',
    name: 'Alexander Wright',
    title: 'Platform Infrastructure Superadmin',
    orgName: 'Apex Global Capital (Cross-Tenant)',
    orgId: '6c885eec-bed8-4060-8215-a50eb442bf5d',
    wsId: '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
    wsName: 'Production Financial Core',
    badge: 'Superuser',
    description: 'Unrestricted cross-tenant root access. System diagnostics, cluster metrics, and security audits.',
  },
  {
    key: 'meridian_auditor',
    email: 'auditor@meridiandynamics.internal',
    role: 'WORKSPACE_ADMIN',
    name: 'Valerie Hayes',
    title: 'Chief Risk Officer (Tenant B)',
    orgName: 'Meridian Dynamics',
    orgId: 'e3444aab-3186-48b9-a91a-73bf3326d07f',
    wsId: 'cdeea90f-cc84-4320-b5aa-f68f0345c6d0',
    wsName: 'Meridian Operations',
    badge: 'Tenant B Isolated',
    description: 'Isolated Tenant B environment. Completely segregated from Apex Global Capital by PostgreSQL RLS.',
  },
];

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  switchPersona: (personaKey: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'ledgerone_jwt_token';
const REFRESH_KEY = 'ledgerone_refresh_token';
const USER_KEY = 'ledgerone_authenticated_user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem(USER_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (cached && token) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync state to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem('ledgerone_org_id', user.org_id);
      localStorage.setItem('ledgerone_ws_id', user.ws_id);
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || err?.detail || 'Invalid email or password');
      }

      const data = await res.json();
      const accessToken = data.access_token;
      const refreshToken = data.refresh_token;

      localStorage.setItem(TOKEN_KEY, accessToken);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
      setToken(accessToken);

      // Fetch user profile
      const meRes = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meData = await meRes.json();

      // Fetch user organizations
      const orgsRes = await fetch('/api/v1/organizations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const orgsData = await orgsRes.json();
      const primaryOrg = Array.isArray(orgsData) && orgsData.length > 0 ? orgsData[0] : null;

      let primaryWs = null;
      let activeRole: RoleType = 'VIEWER';

      if (primaryOrg) {
        const wsRes = await fetch(`/api/v1/organizations/${primaryOrg.id}/workspaces`, {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'X-Organization-ID': primaryOrg.id,
          },
        });
        const wsData = await wsRes.json();
        if (Array.isArray(wsData) && wsData.length > 0) {
          primaryWs = wsData[0];
          activeRole = (primaryWs.user_role as RoleType) || 'VIEWER';
        }
      }

      if (meData.is_platform_admin) {
        activeRole = 'PLATFORM_ADMIN';
      }

      const profile: UserProfile = {
        id: meData.id,
        email: meData.email,
        full_name: meData.full_name,
        is_platform_admin: meData.is_platform_admin,
        role: activeRole,
        org_id: primaryOrg ? primaryOrg.id : '6c885eec-bed8-4060-8215-a50eb442bf5d',
        org_name: primaryOrg ? primaryOrg.name : 'Apex Global Capital',
        org_slug: primaryOrg ? primaryOrg.slug : 'apex-capital',
        ws_id: primaryWs ? primaryWs.id : '9b2b92c0-56a0-4568-8d42-9d2681d30fc9',
        ws_name: primaryWs ? primaryWs.name : 'Production Financial Core',
        ws_slug: primaryWs ? primaryWs.slug : 'prod-financial-core',
      };

      setUser(profile);
      window.dispatchEvent(new Event('ledgerone-auth-change'));
    } finally {
      setIsLoading(false);
    }
  };

  const switchPersona = async (personaKey: string): Promise<void> => {
    const preset = PERSONA_PRESETS.find((p) => p.key === personaKey);
    if (!preset) return;

    setIsLoading(true);
    try {
      // Authenticate against FastAPI backend with persona credentials
      await login(preset.email, 'LedgerOne@2026!');
    } catch (err) {
      console.error('Persona authentication failed against backend:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    window.dispatchEvent(new Event('ledgerone-auth-change'));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        switchPersona,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
