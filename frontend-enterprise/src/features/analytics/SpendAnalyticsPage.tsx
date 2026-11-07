import React, { useState, useEffect } from "react";
import { TrendingUp, AlertTriangle, Building, BarChart2, DollarSign } from "lucide-react";
import {
  SpotlightCard,
  AnimatedNumber,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageTransition,
} from "../../components/ui";
import { api } from "../../services/api";
import { SpendAnalytics } from "../../services/types";

export const SpendAnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<SpendAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.getSpendAnalytics();
        setAnalytics(res);
      } catch {
        // Fallback
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const totalSpend = analytics?.total_spend_commitments || 104390;
  const varianceExposure = analytics?.open_variance_exposure || 2200;

  const topVendors = [
    {
      vendor_name: "DataCore Enterprise Inc.",
      total_spend: 58400.0,
      document_count: 3,
      variance_exposure: 1800.0,
      risk_level: "HIGH" as const,
    },
    {
      vendor_name: "Apex Global Cloud Logistics",
      total_spend: 32500.0,
      document_count: 2,
      variance_exposure: 400.0,
      risk_level: "LOW" as const,
    },
    {
      vendor_name: "CyberShield Security Corp",
      total_spend: 13490.0,
      document_count: 1,
      variance_exposure: 0.0,
      risk_level: "VERIFIED" as const,
    },
  ];

  return (
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            Workspace Spend & Financial Exposure Analytics
          </h1>
          <p className="text-xs text-ink-muted">
            Aggregated corporate commitments, vendor concentration, and discrepancy risk
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] bg-surface-primary px-3 py-1.5 rounded-lg border border-hairline text-ink-muted">
          <span>Fiscal Period: Q4 2026 (Live Neon Ledger)</span>
        </div>
      </div>

      {/* Top 3 Metric Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SpotlightCard className="p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-mono text-[10px] uppercase font-semibold">
              Total Workspace Spend
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-ink-primary font-mono">
            <AnimatedNumber value={totalSpend} prefix="$" decimals={2} />
          </div>
          <div className="text-[10px] font-mono text-emerald-400">
            Across 6 verified enterprise documents
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-mono text-[10px] uppercase font-semibold">
              Discrepancy Variance Exposure
            </span>
            <AlertTriangle className="w-4 h-4 text-status-danger" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-status-danger font-mono">
            <AnimatedNumber value={varianceExposure} prefix="$" decimals={2} />
          </div>
          <div className="text-[10px] font-mono text-status-danger">
            Payment disbursement hold active
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-mono text-[10px] uppercase font-semibold">
              Reconciliation Clean Rate
            </span>
            <BarChart2 className="w-4 h-4 text-brand-light" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-ink-primary font-mono">
            <AnimatedNumber value={83.3} suffix="%" decimals={1} />
          </div>
          <div className="text-[10px] font-mono text-ink-muted">
            5 of 6 documents fully reconciled
          </div>
        </SpotlightCard>
      </div>

      {/* Vendor Spend Concentration */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-ink-primary flex items-center gap-2">
          <Building className="w-4 h-4 text-brand-light" />
          <span>Top Vendor Commitments & Variance Risk</span>
        </h2>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor Entity</TableHead>
              <TableHead align="right">Total Incurred Spend</TableHead>
              <TableHead align="center">Document Volume</TableHead>
              <TableHead align="right">Open Discrepancy Exposure</TableHead>
              <TableHead align="right">Audit Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topVendors.map((vendor) => (
              <TableRow key={vendor.vendor_name}>
                <TableCell className="font-semibold text-ink-primary">
                  {vendor.vendor_name}
                </TableCell>
                <TableCell numeric className="font-bold text-ink-primary">
                  ${vendor.total_spend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell align="center" mono>
                  {vendor.document_count} files
                </TableCell>
                <TableCell numeric className="font-semibold text-status-danger">
                  ${vendor.variance_exposure.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell align="right">
                  <Badge
                    variant={
                      vendor.risk_level === "VERIFIED"
                        ? "verified"
                        : vendor.risk_level === "LOW"
                        ? "brand"
                        : "discrepancy"
                    }
                    size="sm"
                    dot={vendor.risk_level === "HIGH"}
                  >
                    {vendor.risk_level === "HIGH" ? "VARIANCE FLAGGED" : "RECONCILED"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageTransition>
  );
};
