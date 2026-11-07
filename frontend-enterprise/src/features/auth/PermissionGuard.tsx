import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft, Lock } from "lucide-react";
import { Button, Badge } from "../../components/ui";
import { useActiveRole } from "../../services/permissions";

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  children,
}) => {
  const { can, role } = useActiveRole();

  if (!can(permission)) {
    return (
      <div className="h-full flex items-center justify-center p-8 select-none">
        <div className="max-w-md w-full p-8 rounded-2xl bg-surface-elevated border border-hairline shadow-enterprise-card text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-status-danger/10 border border-status-danger/20 flex items-center justify-center text-status-danger">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-status-danger/10 text-status-danger border border-status-danger/20 text-[10px] font-mono uppercase tracking-wider font-semibold">
              <Lock className="w-3 h-3" /> 403 Forbidden
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-ink-primary">
              Access Denied by Enterprise RBAC
            </h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Your active role <span className="font-mono font-bold text-ink-primary">({role})</span> does not possess the required permission:
            </p>
            <div className="py-1 px-3 rounded-lg bg-surface-subtle border border-hairline font-mono text-xs text-brand-light inline-block">
              {permission}
            </div>
          </div>

          <p className="text-[11px] text-ink-muted">
            To view this module, switch your simulated role using the header role selector or request role elevation from your Organization Administrator.
          </p>

          <div className="pt-2">
            <Link to="/documents">
              <Button variant="outline" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
                Return to Document Library
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
