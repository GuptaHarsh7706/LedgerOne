import React from "react";
import { Files, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { SpotlightCard, AnimatedNumber } from "../../components/ui";

interface MetricCardsProps {
  docCount: number;
  totalCommitments: number;
  reviewQueueCount: number;
  discrepancyExposure: number;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  docCount,
  totalCommitments,
  reviewQueueCount,
  discrepancyExposure,
}) => {
  const cards = [
    {
      title: "Total Workspace Assets",
      value: docCount,
      prefix: "",
      suffix: " Docs",
      decimals: 0,
      icon: Files,
      color: "text-brand-light",
      meta: "Neon PostgreSQL RLS Enforced",
    },
    {
      title: "Financial Commitments",
      value: totalCommitments,
      prefix: "$",
      suffix: "",
      decimals: 2,
      icon: TrendingUp,
      color: "text-emerald-400",
      meta: "Live Q4 2026 Commitments",
    },
    {
      title: "Pending Human Review",
      value: reviewQueueCount,
      prefix: "",
      suffix: " Items",
      decimals: 0,
      icon: Clock,
      color: "text-amber-400",
      meta: "Dual-Custody Gated (SoD)",
    },
    {
      title: "Active Variance Exposure",
      value: discrepancyExposure,
      prefix: "$",
      suffix: "",
      decimals: 2,
      icon: AlertTriangle,
      color: "text-status-danger",
      meta: "Disbursement Holds Active",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <SpotlightCard
            key={c.title}
            className="p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card space-y-2"
          >
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">
                {c.title}
              </span>
              <Icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-xl font-bold tracking-tight text-ink-primary font-mono">
              <AnimatedNumber
                value={c.value}
                prefix={c.prefix}
                suffix={c.suffix}
                decimals={c.decimals}
              />
            </div>
            <div className="text-[10px] font-mono text-ink-muted pt-1 border-t border-hairline/60">
              {c.meta}
            </div>
          </SpotlightCard>
        );
      })}
    </div>
  );
};
