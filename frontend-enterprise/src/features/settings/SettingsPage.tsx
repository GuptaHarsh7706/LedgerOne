import React, { useState } from "react";
import {
  ShieldCheck,
  Users,
  Database,
  Key,
  Check,
  UserPlus,
  Copy,
  RefreshCw,
  Download,
  AlertCircle,
  X,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  Modal,
  Input,
  PageTransition,
  SpotlightCard,
} from "../../components/ui";

interface Member {
  name: string;
  email: string;
  role: string;
  isSelf?: boolean;
}

export const SettingsPage: React.FC = () => {
  const roles = [
    {
      name: "WORKSPACE_ADMIN",
      desc: "Full administrative governance, dual-custody document approval, user management",
      badge: "Highest Authority",
      variant: "brand" as const,
    },
    {
      name: "DOCUMENT_MANAGER",
      desc: "Upload documents, manage metadata, manage jobs (strictly barred from approval)",
      badge: "Ingestion Lead",
      variant: "neutral" as const,
    },
    {
      name: "REVIEWER",
      desc: "Inspect extractions, correct cell values, request overrides (SoD gated from approval)",
      badge: "Verification Specialist",
      variant: "review" as const,
    },
    {
      name: "ANALYST",
      desc: "Execute hybrid search, converse with AI assistant, view spend analytics",
      badge: "Read & Query",
      variant: "verified" as const,
    },
    {
      name: "VIEWER",
      desc: "Read-only document access, cannot initiate matches or edits (HTTP 403 barred)",
      badge: "Auditor Read-Only",
      variant: "neutral" as const,
    },
  ];

  const [members, setMembers] = useState<Member[]>([
    {
      name: "Senior Reviewer (You)",
      email: "reviewer@apexcapital.internal",
      role: "WORKSPACE_ADMIN",
      isSelf: true,
    },
    {
      name: "Alex Morgan",
      email: "alex.m@apexcapital.internal",
      role: "DOCUMENT_MANAGER",
    },
    {
      name: "Sarah Jenkins",
      email: "sarah.j@apexcapital.internal",
      role: "REVIEWER",
    },
    {
      name: "David Chen",
      email: "david.c@apexcapital.internal",
      role: "ANALYST",
    },
  ]);

  const [apiKey, setApiKey] = useState("l1_live_948f2a1b660e48dfa2e99d12a9bc21a4");
  const [copiedKey, setCopiedKey] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("REVIEWER");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyKey = () => {
    navigator.clipboard?.writeText(apiKey);
    setCopiedKey(true);
    showToast("API secret copied to clipboard.");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRotateKey = () => {
    const chars = "abcdef0123456789";
    let newPart = "";
    for (let i = 0; i < 32; i++) {
      newPart += chars[Math.floor(Math.random() * chars.length)];
    }
    setApiKey(`l1_live_${newPart}`);
    setShowRotateConfirm(false);
    showToast("API key rotated. All active workers re-authenticated.");
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setMembers((prev) => [
      ...prev,
      {
        name: inviteName || inviteEmail.split("@")[0],
        email: inviteEmail,
        role: inviteRole,
      },
    ]);
    setShowInviteModal(false);
    setInviteName("");
    setInviteEmail("");
    showToast(`Invitation sent to ${inviteEmail}.`);
  };

  const handleExportAuditTrail = () => {
    const auditData = {
      tenant_id: "6c885eec-bed8-4060-8215-a50eb442bf5d",
      tenant_name: "Apex Global Capital",
      workspace_id: "9b2b92c0-56a0-4568-8d42-9d2681d30fc9",
      workspace_name: "Production Financial Core",
      exported_at: new Date().toISOString(),
      standards_conformance: ["SOC2_TYPE_II", "ISO_27001", "EU_AI_ACT_HIGH_RISK"],
      events_count: 1420,
      active_members: members.map((m) => ({ email: m.email, role: m.role })),
      dual_custody_enforcement: "AUTH_SOD_002_ACTIVE",
      rls_mode: "FORCE_ROW_LEVEL_SECURITY",
    };

    const blob = new Blob([JSON.stringify(auditData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LedgerOne-Compliance-Audit-Trail-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Compliance audit trail exported (.json).");
  };

  return (
    <PageTransition className="p-6 max-w-5xl mx-auto space-y-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface-elevated border border-hairline-strong shadow-floating-panel text-xs text-ink-primary">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="pb-4 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            Workspace Governance & Access Control
          </h1>
          <p className="text-xs text-ink-muted">
            5-Tier Canonical Role-Based Access Control (RBAC) & PostgreSQL Row-Level Security
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportAuditTrail}
          icon={<Download className="w-3.5 h-3.5 text-brand-light" />}
        >
          Export Audit Trail (.json)
        </Button>
      </div>

      {/* Tenancy Security Card */}
      <SpotlightCard className="p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-ink-primary">
              Neon PostgreSQL Tenancy Enforcement
            </span>
          </div>
          <Badge variant="verified" size="sm" dot>
            FORCE ROW LEVEL SECURITY
          </Badge>
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          All document relations, extracted fields, chunks, and discrepancies enforce compound foreign keys{" "}
          <code className="font-mono text-brand-light bg-surface-subtle px-1.5 py-0.5 rounded border border-hairline">
            (organization_id, workspace_id, id)
          </code>{" "}
          ensuring zero cross-tenant data leakage.
        </p>
      </SpotlightCard>

      {/* API Keys Card */}
      <SpotlightCard className="p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-brand-light" />
            <span className="font-semibold text-ink-primary">
              Production Workspace API Credentials
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-ink-muted bg-surface-subtle border border-hairline">
            Lease: 365 Days
          </span>
        </div>

        <p className="text-xs text-ink-muted">
          Use this secret key to authenticate ETL pipelines, S3 upload workers, and webhook integrations.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <div className="flex-1 font-mono text-xs bg-surface-subtle px-3 py-2 rounded-lg border border-hairline text-ink-secondary truncate">
            {apiKey.slice(0, 12)}••••••••••••••••••••{apiKey.slice(-4)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyKey}
              icon={
                copiedKey ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-ink-muted" />
                )
              }
            >
              {copiedKey ? "Copied!" : "Copy Key"}
            </Button>

            <Button
              variant="subtle"
              size="sm"
              onClick={() => setShowRotateConfirm(true)}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Rotate Key
            </Button>
          </div>
        </div>
      </SpotlightCard>

      {/* Role Hierarchy Matrix */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-ink-primary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-light" />
          <span>Canonical RBAC Role Hierarchy</span>
        </h2>

        <div className="grid grid-cols-1 gap-2">
          {roles.map((r) => (
            <div
              key={r.name}
              className="p-3 rounded-xl bg-surface-subtle border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono font-medium text-ink-primary">
                    {r.name}
                  </span>
                  <Badge variant={r.variant} size="sm">
                    {r.badge}
                  </Badge>
                </div>
                <p className="text-[11px] text-ink-muted leading-relaxed">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Members Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-light" />
            <h2 className="text-xs font-semibold text-ink-primary">
              Active Workspace Members ({members.length})
            </h2>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowInviteModal(true)}
            icon={<UserPlus className="w-3.5 h-3.5" />}
          >
            Invite Member
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Assigned Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.email}>
                <TableCell className="font-medium text-ink-primary">
                  {m.name}
                </TableCell>
                <TableCell mono className="text-ink-secondary">
                  {m.email}
                </TableCell>
                <TableCell>
                  <Badge variant="brand" size="sm">
                    {m.role}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Rotate Key Confirmation Modal */}
      <Modal
        isOpen={showRotateConfirm}
        onClose={() => setShowRotateConfirm(false)}
        title="Rotate Production API Key?"
        description="This action will invalidate the active key immediately"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRotateConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleRotateKey}>
              Confirm Rotation
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-status-warning/10 border border-status-warning/20 text-status-warning flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Any background ETL workers or webhooks using the current key will receive HTTP 401 Unauthorized until reconfigured.
            </p>
          </div>
        </div>
      </Modal>

      {/* Invite Member Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite Workspace Member"
        description="Assign a canonical RBAC role and grant workspace access"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowInviteModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleInvite}>
              Send Invite
            </Button>
          </div>
        }
      >
        <form onSubmit={handleInvite} className="space-y-3 text-xs">
          <Input
            label="Full Name"
            placeholder="Jane Doe"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="jane@apexcapital.internal"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </form>
      </Modal>
    </PageTransition>
  );
};
