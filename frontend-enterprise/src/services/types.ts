/**
 * Canonical TypeScript Interfaces for LedgerOne Enterprise Platform.
 * Strict parity with FastAPI Pydantic Models and Neon PostgreSQL schema.
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "WORKSPACE_ADMIN" | "DOCUMENT_MANAGER" | "REVIEWER" | "ANALYST" | "VIEWER";
  organization_id: string;
  workspace_id: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export type DocumentLifecycleStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "PROCESSING"
  | "EXTRACTION_COMPLETE"
  | "NEEDS_REVIEW"
  | "IN_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "FAILED";

export interface DocumentMetadata {
  id: string;
  organization_id: string;
  workspace_id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  s3_key: string;
  lifecycle_status: DocumentLifecycleStatus;
  processing_error?: string | null;
  uploaded_by?: string | null;
  created_at: string;
  updated_at: string;
  vendor_name?: string | null;
  invoice_number?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  assigned_reviewer?: string | null;
}

export interface BoundingBox {
  page_number: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  confidence?: number;
}

export interface ExtractedField {
  id: string;
  field_name: string;
  raw_value: string;
  normalized_value: any;
  confidence_score: number;
  validation_status: "VALID" | "AMBIGUOUS" | "NEEDS_REVIEW" | "CORRECTED" | "OVERRIDDEN";
  bounding_box?: BoundingBox | null;
  is_human_corrected?: boolean;
  correction_rationale?: string | null;
}

export interface TableLineItem {
  id: string;
  line_index: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  part_number?: string | null;
  confidence_score: number;
  is_human_corrected?: boolean;
}

export interface DocumentInvariant {
  id: string;
  code: string;
  description: string;
  is_satisfied: boolean;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  is_overridden?: boolean;
  override_rationale?: string | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
}

export interface ReviewBundle {
  document: DocumentMetadata;
  fields: ExtractedField[];
  line_items: TableLineItem[];
  invariants: DocumentInvariant[];
  audit_events?: any[];
}

export interface ThreeWayMatchResult {
  invoice_id: string;
  po_id?: string | null;
  grn_id?: string | null;
  match_status: "FULL_MATCH" | "DISCREPANCY_DETECTED" | "UNMATCHED";
  vendor_matched: boolean;
  total_variance: number;
  discrepancies: Array<{
    code: string;
    description: string;
    po_value: string | number;
    invoice_value: string | number;
    difference: string | number;
    tolerance_exceeded: boolean;
  }>;
  matched_at?: string;
}

export interface SpendAnalytics {
  total_spend_commitments: number;
  open_variance_exposure: number;
  processed_count: number;
  exception_count: number;
  top_vendors: Array<{
    vendor_name: string;
    total_spend: number;
    document_count: number;
    variance_exposure: number;
  }>;
}

export interface AssistantCitation {
  id: number;
  document_id: string;
  filename: string;
  page_number: number;
  text_snippet: string;
  bounding_box?: BoundingBox | null;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: AssistantCitation[];
  grounded?: boolean;
}
