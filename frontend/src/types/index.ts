export type DocumentStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'VALIDATED'
  | 'INVARIANT_VIOLATION'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'FAILED';

export type DocumentCategory =
  | 'INVOICE'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'UTILITY_BILL'
  | 'TAX_FORM'
  | 'RECEIPT'
  | 'CONTRACT';

export interface ExtractedField {
  id: string;
  field_name: string;
  field_value_raw: string | null;
  field_value_normalized: any;
  confidence: number;
  bounding_box: { x0: number; y0: number; x1: number; y1: number } | null;
  is_verified: boolean;
  verified_value: any;
  verified_by_user_id: string | null;
}

export interface LineItem {
  id: string;
  line_index?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number;
  bbox: number[];
}

export interface AccountingInvariant {
  code: string;
  name: string;
  status: 'PASSED' | 'FAILED' | 'OVERRIDDEN';
  expected_value: string;
  actual_value: string;
  delta: string;
  severity: 'CRITICAL' | 'WARNING';
  is_overridable: boolean;
  override_rationale?: string;
  overridden_by?: string;
}

export interface DocumentItem {
  id: string;
  organization_id: string;
  workspace_id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  sha256_hash: string;
  status: DocumentStatus;
  category: DocumentCategory;
  created_at: string;
  updated_at: string;
  s3_preview_url?: string;
  metadata?: Record<string, any>;
  extracted_fields?: ExtractedField[];
  invariants?: AccountingInvariant[];
}

export interface Document {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  confidenceScore: number;
  status: DocumentStatus;
  createdAt: string;
  lineItems: LineItem[];
}

export interface DashboardStats {
  totalDocuments: number;
  invariantPassRate: number;
  straightThroughRate: number;
  pendingReview: number;
}

export interface DiscrepancyItem {
  id: string;
  discrepancy_type: 'QUANTITY_MISMATCH' | 'PRICE_VARIANCE' | 'ARITHMETIC_ERROR' | 'DUPLICATE_INVOICE';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  invoice_doc_id: string;
  related_doc_id?: string;
  variance_amount?: number;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED_AS_CREDIT';
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  citations?: Array<{
    document_id: string;
    filename: string;
    page_number: number;
    bounding_box: { x0: number; y0: number; x1: number; y1: number };
    snippet: string;
    relevance_score: number;
  }>;
}

export interface AssistantSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AssistantMessage[];
}

export type RoleType =
  | 'PLATFORM_ADMIN'
  | 'ORGANIZATION_ADMIN'
  | 'WORKSPACE_ADMIN'
  | 'DOCUMENT_MANAGER'
  | 'REVIEWER'
  | 'ANALYST'
  | 'VIEWER';

export type Role = RoleType;
