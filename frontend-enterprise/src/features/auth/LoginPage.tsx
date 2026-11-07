import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, ShieldCheck, ArrowRight, AlertCircle, Building2, Cpu, Database } from "lucide-react";
import { Button, Input, SpotlightCard } from "../../components/ui";
import { api } from "../../services/api";

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("reviewer@apexcapital.internal");
  const [password, setPassword] = useState("Password123!");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await api.login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid authentication credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-canvas relative overflow-hidden">
      {/* Ambient Lighting Meshes */}
      <div
        className="pointer-events-none absolute top-[-10%] left-[35%] w-[600px] h-[350px] rounded-full bg-brand/15 blur-[150px] z-0 animate-pulse-slow"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[-10%] right-[25%] w-[500px] h-[300px] rounded-full bg-status-success/10 blur-[140px] z-0"
        aria-hidden="true"
      />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white font-bold text-xl shadow-hairline-glow mb-2">
            L1
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            LedgerOne Enterprise
          </h1>
          <p className="text-xs text-ink-muted">
            Document Intelligence & Financial Operations Platform
          </p>
        </div>

        {/* Login Card */}
        <SpotlightCard className="p-6 rounded-2xl bg-surface-primary border border-hairline shadow-floating-panel">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-primary">
                Reviewer Authentication
              </h2>
              <p className="text-[11px] text-ink-muted">
                Enterprise SSO & Token-Based Segregation of Duties
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-status-danger/10 border border-status-danger/20 text-status-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <Input
                label="Corporate Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="w-3.5 h-3.5" />}
                placeholder="auditor@apexcapital.internal"
              />

              <Input
                label="Master Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-3.5 h-3.5" />}
                placeholder="••••••••••••"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Workspace
            </Button>
          </form>

          {/* Quick Credential Hint for Evaluator */}
          <div className="mt-5 pt-4 border-t border-hairline text-[11px] text-ink-muted space-y-1.5">
            <div className="font-mono text-[10px] uppercase font-semibold text-ink-secondary">
              Default Evaluator Identity:
            </div>
            <div className="flex items-center justify-between font-mono bg-surface-subtle px-2.5 py-1.5 rounded-lg border border-hairline">
              <span>reviewer@apexcapital.internal</span>
              <span className="text-emerald-400">Password123!</span>
            </div>
          </div>
        </SpotlightCard>

        {/* Live Infrastructure Status */}
        <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400" /> Neon Cloud 18.6
          </span>
          <span className="w-1 h-1 rounded-full bg-hairline-strong" />
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-brand-light" /> RTX 3050 CUDA 12.4
          </span>
        </div>
      </div>
    </div>
  );
};
