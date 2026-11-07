/**
 * LedgerOne Design System Tokens & Financial Formatting Utilities
 */

export const THEME = {
  colors: {
    canvas: "#07080a",
    surfaceSubtle: "#0d0e12",
    surfaceCard: "#12141a",
    surfaceElevated: "#181a22",
    surfaceHover: "#1e212b",
    hairline: "rgba(255, 255, 255, 0.06)",
    hairlineStrong: "rgba(255, 255, 255, 0.12)",
    inkPrimary: "#f8fafc",
    inkSecondary: "#cbd5e1",
    inkMuted: "#64748b",
    inkDisabled: "#334155",
    brand: "#4f46e5",
    brandLight: "#6366f1",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#0ea5e9",
  },
} as const;

export type DocumentCategory =
  | "INVOICE"
  | "PURCHASE_ORDER"
  | "RECEIPT"
  | "CONTRACT"
  | "TAX_SCHEDULE"
  | "BANK_STATEMENT";

export type ProcessingStatus =
  | "UPLOAD_PENDING"
  | "UPLOADED"
  | "QUEUED"
  | "PARSING"
  | "EXTRACTING"
  | "VALIDATING"
  | "READY"
  | "NEEDS_REVIEW"
  | "IN_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "FAILED";

export type DiscrepancyType =
  | "PRICE_VARIANCE"
  | "QUANTITY_MISMATCH"
  | "DUPLICATE_BILLING"
  | "TOTAL_MISMATCH"
  | "VENDOR_MISMATCH";

export interface CategoryMeta {
  label: string;
  badgeClass: string;
}

export const CATEGORY_CONFIG: Record<DocumentCategory, CategoryMeta> = {
  INVOICE: {
    label: "Invoice",
    badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  },
  PURCHASE_ORDER: {
    label: "Purchase Order",
    badgeClass: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  },
  RECEIPT: {
    label: "Goods Receipt",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  },
  CONTRACT: {
    label: "Contract",
    badgeClass: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  },
  TAX_SCHEDULE: {
    label: "Tax Schedule",
    badgeClass: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  },
  BANK_STATEMENT: {
    label: "Bank Statement",
    badgeClass: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  },
};

export const STATUS_CONFIG: Record<
  ProcessingStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  UPLOAD_PENDING: {
    label: "Upload Pending",
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  },
  UPLOADED: {
    label: "Uploaded",
    dotClass: "bg-sky-400",
    badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  QUEUED: {
    label: "Queued",
    dotClass: "bg-indigo-400 animate-pulse",
    badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  PARSING: {
    label: "Parsing OCR",
    dotClass: "bg-indigo-400 animate-pulse",
    badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  EXTRACTING: {
    label: "Extracting Fields",
    dotClass: "bg-indigo-400 animate-pulse",
    badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  VALIDATING: {
    label: "Validating Math",
    dotClass: "bg-amber-400 animate-pulse",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  READY: {
    label: "Ready",
    dotClass: "bg-emerald-400",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  NEEDS_REVIEW: {
    label: "Needs Review",
    dotClass: "bg-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  IN_REVIEW: {
    label: "In Review",
    dotClass: "bg-blue-400",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  VERIFIED: {
    label: "Verified & Approved",
    dotClass: "bg-emerald-400",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  REJECTED: {
    label: "Rejected",
    dotClass: "bg-rose-500",
    badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  FAILED: {
    label: "Processing Failed",
    dotClass: "bg-rose-500",
    badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
};

export const ACCOUNTING_INVARIANTS = [
  { id: "INV-001", name: "Line Items Subtotal", hardStop: false, desc: "Sum(Line Net) == Subtotal" },
  { id: "INV-002", name: "Unit Rate Math", hardStop: true, desc: "Quantity * Unit Price == Line Net" },
  { id: "INV-003", name: "Tax Arithmetic", hardStop: false, desc: "Subtotal + Tax Amount == Total" },
  { id: "INV-004", name: "Tax Rate Concordance", hardStop: false, desc: "Tax % * Subtotal == Tax Amount" },
  { id: "INV-005", name: "Discounts & Allowances", hardStop: false, desc: "Subtotal - Discount + Tax == Total" },
  { id: "INV-006", name: "Currency Uniformity", hardStop: true, desc: "Header currency matches all line currencies" },
  { id: "INV-007", name: "Invoice Date Sequence", hardStop: false, desc: "Invoice Date <= Due Date" },
  { id: "INV-008", name: "Sign Consistency", hardStop: true, desc: "Gross, net, tax have consistent positive/credit signs" },
  { id: "INV-009", name: "Identifier Check", hardStop: true, desc: "Invoice Number and Vendor must not be empty" },
  { id: "INV-010", name: "Auditor Override Gating", hardStop: true, desc: "Mandatory justification required for soft overrides" },
];

/**
 * Format exact monetary amount with currency code.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format decimal numbers with strict tabular formatting.
 */
export function formatNumber(
  val: number | string | null | undefined,
  decimals = 2
): string {
  if (val === null || val === undefined || val === "") return "0.00";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.00";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format confidence percentage badge (0.00 to 1.00 -> 0% to 100%).
 */
export function formatConfidence(score: number | null | undefined): {
  text: string;
  colorClass: string;
} {
  if (score === null || score === undefined) {
    return { text: "N/A", colorClass: "text-ink-muted bg-surface-subtle" };
  }
  const pct = Math.round(score > 1 ? score : score * 100);
  if (pct >= 90) {
    return { text: `${pct}%`, colorClass: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" };
  } else if (pct >= 75) {
    return { text: `${pct}%`, colorClass: "text-amber-400 bg-amber-500/10 border border-amber-500/20" };
  } else {
    return { text: `${pct}%`, colorClass: "text-rose-400 bg-rose-500/10 border border-rose-500/20" };
  }
}
