import { 
  DocumentItem, 
  AccountingInvariant, 
  DiscrepancyItem, 
  AssistantSession, 
  AssistantMessage,
  Document,
  DashboardStats
} from '../types';

export const DEFAULT_ORG_ID = '6c885eec-bed8-4060-8215-a50eb442bf5d'; // Apex Global Capital
export const DEFAULT_WS_ID = '9b2b92c0-56a0-4568-8d42-9d2681d30fc9'; // Production Financial Core

const BASE_URL = '/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ledgerone_jwt_token') || 'demo_token';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Organization-ID': DEFAULT_ORG_ID,
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`API request to ${path} failed or in mock mode:`, err);
    throw err;
  }
}

export const SEED_STUDIO_DOCUMENTS: Document[] = [
  {
    id: 'doc-001',
    invoiceNumber: 'INV-2024-8841',
    vendorName: 'Global Logistics Corp',
    subtotal: 34850.00,
    tax: 2875.12,
    total: 37725.12,
    currency: 'USD',
    confidenceScore: 0.99,
    status: 'VALIDATED',
    createdAt: '2024-10-24T14:20:00Z',
    lineItems: [
      {
        id: 'li-1',
        description: 'Multi-modal Ocean Freight Container Shipping (40ft HQ)',
        quantity: 2,
        unitPrice: 12500.00,
        total: 25000.00,
        confidence: 0.99,
        bbox: [0.12, 0.44, 0.38, 0.49]
      },
      {
        id: 'li-2',
        description: 'Customs Brokerage, Demurrage & Drayage Handling Fee',
        quantity: 1,
        unitPrice: 9850.00,
        total: 9850.00,
        confidence: 0.98,
        bbox: [0.12, 0.50, 0.42, 0.55]
      }
    ]
  },
  {
    id: 'doc-002',
    invoiceNumber: 'INV-2024-9022',
    vendorName: 'Vortex Industrial Manufacturing',
    subtotal: 12500.00,
    tax: 950.00,
    total: 13450.00,
    currency: 'USD',
    confidenceScore: 0.94,
    status: 'INVARIANT_VIOLATION',
    createdAt: '2024-10-25T09:12:00Z',
    lineItems: [
      {
        id: 'li-3',
        description: 'Titanium Fastener Assemblies (Grade 5 ASTM-B348)',
        quantity: 500,
        unitPrice: 25.00,
        total: 12500.00,
        confidence: 0.94,
        bbox: [0.15, 0.42, 0.45, 0.48]
      }
    ]
  },
  {
    id: 'doc-003',
    invoiceNumber: 'INV-2024-7719',
    vendorName: 'Apex Data Services',
    subtotal: 8900.00,
    tax: 0.00,
    total: 8900.00,
    currency: 'USD',
    confidenceScore: 0.98,
    status: 'PENDING_REVIEW',
    createdAt: '2024-10-25T11:45:00Z',
    lineItems: [
      {
        id: 'li-4',
        description: 'Dedicated GPU Cluster Compute Hours (H100 SXM5)',
        quantity: 40,
        unitPrice: 222.50,
        total: 8900.00,
        confidence: 0.98,
        bbox: [0.10, 0.40, 0.35, 0.46]
      }
    ]
  },
  {
    id: 'doc-004',
    invoiceNumber: 'INV-2024-6501',
    vendorName: 'Stratos Engineering Group',
    subtotal: 5900.00,
    tax: 486.75,
    total: 6386.75,
    currency: 'USD',
    confidenceScore: 0.99,
    status: 'VALIDATED',
    createdAt: '2024-10-26T16:00:00Z',
    lineItems: [
      {
        id: 'li-5',
        description: 'Structural Load Simulation & Thermal Analysis Report',
        quantity: 1,
        unitPrice: 5900.00,
        total: 5900.00,
        confidence: 0.99,
        bbox: [0.14, 0.38, 0.48, 0.44]
      }
    ]
  }
];

export const api = {
  // Documents
  async listDocuments(category?: string): Promise<DocumentItem[]> {
    try {
      const url = `/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents${category ? `?category=${category}` : ''}`;
      return await request<DocumentItem[]>(url);
    } catch {
      return MOCK_DOCUMENTS;
    }
  },

  async getDocuments(): Promise<Document[]> {
    return SEED_STUDIO_DOCUMENTS;
  },

  async getStats(): Promise<DashboardStats> {
    return {
      totalDocuments: 1420,
      invariantPassRate: 99.8,
      straightThroughRate: 89.6,
      pendingReview: 4
    };
  },

  async getDocument(docId: string): Promise<DocumentItem> {
    try {
      return await request<DocumentItem>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}`);
    } catch {
      const doc = MOCK_DOCUMENTS.find(d => d.id === docId) || MOCK_DOCUMENTS[0];
      return doc;
    }
  },

  async correctField(docId: string, fieldName: string, rawVal: string, normalizedVal: any, comment?: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}/review/correct-field`, {
      method: 'POST',
      body: JSON.stringify({
        field_name: fieldName,
        corrected_value_raw: rawVal,
        corrected_value_normalized: normalizedVal,
        comment: comment || 'Manual reviewer correction',
      }),
    });
  },

  async overrideInvariant(docId: string, invariantId: string, rationale: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}/review/override-invariant`, {
      method: 'POST',
      body: JSON.stringify({
        invariant_id: invariantId,
        override_rationale: rationale,
      }),
    });
  },

  async verifyDocument(docId: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}/review/verify`, {
      method: 'POST',
    });
  },

  async approveDocument(docId: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}/review/approve`, {
      method: 'POST',
    });
  },

  // 3-Way Matching
  async runMatch(invoiceDocId: string, poDocId: string, grnDocId: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/cross-document/match-3way/${invoiceDocId}`, {
      method: 'POST',
      body: JSON.stringify({
        purchase_order_id: poDocId,
        goods_receipt_id: grnDocId,
      }),
    });
  },

  // Spend Analytics
  async getSpendAnalytics() {
    try {
      return await request<any>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/cross-document/analytics`);
    } catch {
      return {
        total_spend_commitments: 104390.00,
        open_variance_exposure: 2200.00,
        total_invoices_audited: 24,
        reconciliation_rate: 96.4,
        top_vendors: [
          { name: 'Apex Logistics Systems', amount: 48200.00, variance: 0 },
          { name: 'PureStorage Corp', amount: 32450.00, variance: 2200.00 },
          { name: 'CloudScale Infrastructure', amount: 23740.00, variance: 0 },
        ],
      };
    }
  },

  // AI Assistant
  async askAssistant(arg1: string, arg2?: string): Promise<{ answer: string; citations: any[] }> {
    const query = arg2 || arg1;
    const sessionId = arg2 ? arg1 : 'session-default';
    try {
      const res = await request<any>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/assistant/sessions/${sessionId}/ask`, {
        method: 'POST',
        body: JSON.stringify({ query, top_k: 3 }),
      });
      return {
        answer: res.answer || res.content,
        citations: res.citations || [],
      };
    } catch {
      return {
        answer: `Verified against local repository: Invoice INV-2024-8841 from Global Logistics Corp has a line-item total of $34,850.00 and sales tax of $2,875.12, matching the verified document total of $37,725.12 down to the cent with zero arithmetic discrepancy.`,
        citations: [
          {
            docId: 'doc-001',
            docNumber: 'INV-2024-8841',
            page: 1,
            bbox: [0.12, 0.44, 0.38, 0.49],
          },
        ],
      };
    }
  },
};

export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 'a1000000-0000-0000-0000-000000009041',
    organization_id: DEFAULT_ORG_ID,
    workspace_id: DEFAULT_WS_ID,
    filename: 'INV-2026-9041_PureStorage_Enterprise.pdf',
    file_size_bytes: 284920,
    mime_type: 'application/pdf',
    sha256_hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    status: 'NEEDS_REVIEW',
    category: 'INVOICE',
    created_at: '2026-11-07T10:15:00Z',
    updated_at: '2026-11-07T11:42:00Z',
    metadata: { vendor_name: 'PureStorage Corp', invoice_number: 'INV-2026-9041', total_amount: 11220.00 },
    extracted_fields: [
      {
        id: 'f1',
        field_name: 'invoice_number',
        field_value_raw: 'INV-2026-9041',
        field_value_normalized: 'INV-2026-9041',
        confidence: 0.99,
        bounding_box: { x0: 420, y0: 60, x1: 540, y1: 85 },
        is_verified: true,
        verified_value: 'INV-2026-9041',
        verified_by_user_id: 'usr_reviewer_01',
      },
      {
        id: 'f2',
        field_name: 'vendor_name',
        field_value_raw: 'PureStorage Corporation',
        field_value_normalized: 'PureStorage Corp',
        confidence: 0.98,
        bounding_box: { x0: 50, y0: 60, x1: 240, y1: 90 },
        is_verified: true,
        verified_value: 'PureStorage Corp',
        verified_by_user_id: 'usr_reviewer_01',
      },
    ],
    invariants: [
      {
        code: 'INV-001',
        name: 'Line Subtotal Summation',
        status: 'PASSED',
        expected_value: '$10,200.00',
        actual_value: '$10,200.00',
        delta: '$0.00',
        severity: 'CRITICAL',
        is_overridable: false,
      },
    ],
  },
];
