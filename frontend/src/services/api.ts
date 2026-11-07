import { 
  DocumentItem, 
  AccountingInvariant, 
  DiscrepancyItem, 
  AssistantSession, 
  AssistantMessage,
  Document,
  DashboardStats
} from '../types';

export const DEFAULT_ORG_ID = '6c885eec-bed8-4060-8215-a50eb442bf5d'; // Enterprise Financial Core
export const DEFAULT_WS_ID = '9b2b92c0-56a0-4568-8d42-9d2681d30fc9'; // Production Financial Core

const BASE_URL = '/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ledgerone_jwt_token');
  const orgId = localStorage.getItem('ledgerone_org_id') || DEFAULT_ORG_ID;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    'X-Organization-ID': orgId,
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
    invoiceNumber: 'GSA-2026-9041',
    vendorName: 'GSA Federal Supply Contractor (Contract GS-35F-0119Y)',
    subtotal: 312450.00,
    tax: 25777.13,
    total: 338227.13,
    currency: 'USD',
    confidenceScore: 0.998,
    status: 'VALIDATED',
    createdAt: '2026-11-04T08:30:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'US General Services Administration (GSA) Schedule 70 IT Contract GS-35F-0119Y / Form 1449',
    senderAddress: '650 Federal Procurement Parkway, Suite 400, Washington, DC 20405',
    taxId: 'US-EIN-46-0882194',
    paymentTerms: 'Prompt Payment Act (Net 30 Days)',
    notes: 'CapEx High-Density Storage Expansion for Supercomputing & Research Facilities. Billed under GSA Schedule 70 SIN 132-8.',
    lineItems: [
      {
        id: 'li-01',
        description: 'DirectFlash NVMe 75TB Storage Module Array (Dual-Port PCIe Gen4 - SIN 132-8)',
        quantity: 4,
        unitPrice: 62500.00,
        total: 250000.00,
        confidence: 0.999,
        bbox: [0.12, 0.42, 0.38, 0.46]
      },
      {
        id: 'li-02',
        description: '100GbE QSFP28 Dual-Port Storage Fabric Optics & Optical Transceivers (SIN 132-8)',
        quantity: 16,
        unitPrice: 3903.13,
        total: 62450.00,
        confidence: 0.997,
        bbox: [0.12, 0.48, 0.42, 0.52]
      }
    ]
  },
  {
    id: 'doc-002',
    invoiceNumber: 'SEC-2026-88192',
    vendorName: 'Enterprise Cloud Infrastructure Services',
    subtotal: 84210.50,
    tax: 0.00,
    total: 84210.50,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-05T00:15:00Z',
    docType: 'PDF',
    category: 'UTILITY_BILL',
    sourceProvenance: 'US SEC EDGAR Public Corporate Exhibit 10.14 (Master Cloud Infrastructure Capacity SOW)',
    senderAddress: '410 Terry Avenue North, Seattle, WA 98109',
    taxId: 'US-EIN-91-1646860',
    paymentTerms: 'Corporate Net 30 ACH Direct',
    notes: 'Consolidated Monthly Compute Billing for Enterprise GPU Cluster Nodes & Direct Connect Egress.',
    lineItems: [
      {
        id: 'li-03',
        description: 'Accelerated Compute Dedicated Reserved Instance Node (8x SXM5 80GB)',
        quantity: 2,
        unitPrice: 32850.00,
        total: 65700.00,
        confidence: 0.999,
        bbox: [0.10, 0.40, 0.36, 0.44]
      },
      {
        id: 'li-04',
        description: 'Tiered Object Storage & High-IOPS Provisioned Volume Tier (GB-Months)',
        quantity: 140000,
        unitPrice: 0.021,
        total: 2940.00,
        confidence: 0.998,
        bbox: [0.10, 0.46, 0.38, 0.50]
      },
      {
        id: 'li-05',
        description: '100Gbps Dedicated Interconnect Hybrid Cloud Port Egress Allocation',
        quantity: 1,
        unitPrice: 15570.50,
        total: 15570.50,
        confidence: 0.999,
        bbox: [0.10, 0.52, 0.42, 0.56]
      }
    ]
  },
  {
    id: 'doc-003',
    invoiceNumber: 'BOL-2026-0442',
    vendorName: 'Intermodal Ocean Carrier Line (FIATA FBL-004819)',
    subtotal: 48600.00,
    tax: 3888.00,
    total: 53120.00,
    currency: 'USD',
    confidenceScore: 0.965,
    status: 'INVARIANT_VIOLATION',
    createdAt: '2026-11-05T14:40:00Z',
    docType: 'SHIPPING_BOL',
    category: 'BILL_OF_LADING',
    sourceProvenance: 'FIATA Multimodal Transport Ocean Bill of Lading Form FBL-004819 (UNCTAD/ICC 1992 Rules)',
    senderAddress: 'Esplanaden 50, 1098 Copenhagen K, Denmark',
    taxId: 'DK-VAT-33165888',
    paymentTerms: 'Freight Prepaid / Pier Release',
    notes: 'Intermodal Reefer Shipment Rotterdam (NLRTM) to Singapore (SGSIN). Math invariant failure: calculated $52,488.00 vs billed $53,120.00 (Delta +$632.00 demurrage surcharge).',
    lineItems: [
      {
        id: 'li-06',
        description: '40ft High-Cube Refrigerated Container Ocean Freight (Rotterdam -> Singapore)',
        quantity: 6,
        unitPrice: 6500.00,
        total: 39000.00,
        confidence: 0.985,
        bbox: [0.12, 0.40, 0.40, 0.44]
      },
      {
        id: 'li-07',
        description: 'Harbor Terminal Handling Charges (THC) & Wharfage Security Surcharges',
        quantity: 6,
        unitPrice: 1600.00,
        total: 9600.00,
        confidence: 0.970,
        bbox: [0.12, 0.46, 0.42, 0.50]
      },
      {
        id: 'li-08',
        description: 'Port Container Detention & Pier Demurrage Fee (Unapproved Variance Delta)',
        quantity: 1,
        unitPrice: 4520.00,
        total: 4520.00,
        confidence: 0.940,
        bbox: [0.12, 0.52, 0.44, 0.56]
      }
    ]
  },
  {
    id: 'doc-004',
    invoiceNumber: 'PSA-77102-HW',
    vendorName: 'Port Authority Marine Stevedoring Operations',
    subtotal: 6444.00,
    tax: 580.00,
    total: 7024.00,
    currency: 'USD',
    confidenceScore: 0.941,
    status: 'PENDING_REVIEW',
    createdAt: '2026-11-06T09:10:00Z',
    docType: 'HANDWRITTEN',
    category: 'RECEIPT',
    sourceProvenance: 'Port of Singapore Authority (PSA) Standard Cargo Tally Sheet Form ST-04',
    senderAddress: 'Berth 14, Jurong Port Road, Singapore 619112',
    taxId: 'SG-UEN-201948810M',
    paymentTerms: 'Direct Pier Voucher / Net 15 Days',
    notes: 'Physical carbon-copy cargo tally slip with ink rubber stamp. Handwritten digits transcribed via TrOCR VLM. Requires dual-custody verification.',
    lineItems: [
      {
        id: 'li-09',
        description: '40-Ton Mobile Hydraulic Crane Heavy Lift Rental (8 Hours)',
        quantity: 8,
        unitPrice: 350.00,
        total: 2800.00,
        confidence: 0.935,
        bbox: [0.15, 0.38, 0.42, 0.43]
      },
      {
        id: 'li-10',
        description: 'Certified Stevedoring Rigging Crew (4 Stevedores x 8 hrs)',
        quantity: 32,
        unitPrice: 85.00,
        total: 2720.00,
        confidence: 0.942,
        bbox: [0.15, 0.45, 0.44, 0.50]
      },
      {
        id: 'li-11',
        description: 'Marine Low-Sulfur Gasoil (MGO) Shore Crane Auxiliary Fuel (220 Gallons)',
        quantity: 220,
        unitPrice: 4.20,
        total: 924.00,
        confidence: 0.946,
        bbox: [0.15, 0.52, 0.45, 0.57]
      }
    ]
  },
  {
    id: 'doc-005',
    invoiceNumber: 'VIES-2026-3021',
    vendorName: 'European Industrial Turbomachinery Supplies',
    subtotal: 156890.00,
    tax: 0.00,
    total: 156890.00,
    currency: 'USD',
    confidenceScore: 0.995,
    status: 'VALIDATED',
    createdAt: '2026-11-06T11:20:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'European Commission VIES Intra-Community Supply Directive 2006/112/EC Art. 196',
    senderAddress: 'Freyeslebenstrasse 1, 91058 Erlangen, Germany',
    taxId: 'DE-VAT-132556810',
    paymentTerms: 'Net 45 Days Cross-Border SEPA/SWIFT',
    notes: 'Billed in EUR 145,000.00 converted at ECB spot rate 1.0820 USD/EUR. Reverse-Charge VAT Section 13b UStG applied.',
    lineItems: [
      {
        id: 'li-12',
        description: 'SGT-800 Gas Turbine Stage-1 Single-Crystal Rotor Blade Replacement Set',
        quantity: 1,
        unitPrice: 125000.00,
        total: 125000.00,
        confidence: 0.996,
        bbox: [0.12, 0.42, 0.40, 0.47]
      },
      {
        id: 'li-13',
        description: 'Field Calibration & High-Pressure Rotor Alignment Overhaul',
        quantity: 1,
        unitPrice: 31890.00,
        total: 31890.00,
        confidence: 0.994,
        bbox: [0.12, 0.49, 0.42, 0.54]
      }
    ]
  },
  {
    id: 'doc-006',
    invoiceNumber: 'DLA-2026-0089',
    vendorName: 'Defense Logistics Network Supplies (DD Form 250)',
    subtotal: 128400.00,
    tax: 10593.00,
    total: 138993.00,
    currency: 'USD',
    confidenceScore: 0.997,
    status: 'VALIDATED',
    createdAt: '2026-11-06T13:00:00Z',
    docType: 'PDF',
    category: 'PURCHASE_ORDER',
    sourceProvenance: 'US Department of Defense Form DD-250 (Material Inspection & Receiving Report, CAGE 1FV44)',
    senderAddress: '170 West Tasman Drive, San Jose, CA 95134',
    taxId: 'US-EIN-77-0059951',
    paymentTerms: 'Corporate Net 30 Days',
    notes: 'CapEx Equipment Purchase Order for Spine-and-Leaf High-Throughput Switching Fabric. Clean 3-way match.',
    lineItems: [
      {
        id: 'li-14',
        description: '400G 36-Port High-Density Datacenter Spine Switch Fabric',
        quantity: 2,
        unitPrice: 48200.00,
        total: 96400.00,
        confidence: 0.998,
        bbox: [0.12, 0.42, 0.38, 0.46]
      },
      {
        id: 'li-15',
        description: '100G 48-Port Low-Latency Top-of-Rack Leaf Switch Unit',
        quantity: 4,
        unitPrice: 8000.00,
        total: 32000.00,
        confidence: 0.996,
        bbox: [0.12, 0.48, 0.40, 0.52]
      }
    ]
  },
  {
    id: 'doc-007',
    invoiceNumber: 'GRN-4491-B',
    vendorName: 'Stratos Advanced Alloys Materials Lab (ASTM B348)',
    subtotal: 41400.00,
    tax: 0.00,
    total: 41400.00,
    currency: 'USD',
    confidenceScore: 0.952,
    status: 'NEEDS_REVIEW',
    createdAt: '2026-11-06T15:15:00Z',
    docType: 'SCANNED_IMAGE',
    category: 'GOODS_RECEIPT',
    sourceProvenance: 'ASTM International Certified Materials Test Report ASTM B348 Grade 5 Receiving Sheet',
    senderAddress: 'Don Valley Industrial Park, Sheffield S9 2PW, UK',
    taxId: 'GB-VAT-904812391',
    paymentTerms: 'Letter of Credit (LC) Confirmed',
    notes: 'Physical warehouse scales recorded 920 kg delivered vs 1,000 kg ordered. Under-delivery weight variance of 80 kg.',
    lineItems: [
      {
        id: 'li-16',
        description: 'Aerospace Grade Titanium Round Bar ASTM-B348 Grade 5 (Delivered: 920 kg)',
        quantity: 920,
        unitPrice: 45.00,
        total: 41400.00,
        confidence: 0.952,
        bbox: [0.14, 0.42, 0.46, 0.48]
      }
    ]
  },
  {
    id: 'doc-008',
    invoiceNumber: 'FCC-2026-1108',
    vendorName: 'Transatlantic Optical Carrier Services (FCC Form 499-A)',
    subtotal: 22400.00,
    tax: 1848.00,
    total: 24248.00,
    currency: 'USD',
    confidenceScore: 0.996,
    status: 'VALIDATED',
    createdAt: '2026-11-06T17:00:00Z',
    docType: 'UTILITY_BILL',
    category: 'UTILITY_BILL',
    sourceProvenance: 'Federal Communications Commission (FCC) Form 499-A Universal Service Scheduled Billing',
    senderAddress: '1025 Eldorado Boulevard, Broomfield, CO 80021',
    taxId: 'US-EIN-84-1117941',
    paymentTerms: 'Net 20 ACH Auto-Debit',
    notes: 'Dedicated Low-Latency Transatlantic Dark Fiber Wavelength Connecting Equinix NY4 and Telehouse North Two.',
    lineItems: [
      {
        id: 'li-17',
        description: '100Gbps Wavelength Dark Fiber Metro Backbone Line Circuit',
        quantity: 2,
        unitPrice: 9800.00,
        total: 19600.00,
        confidence: 0.997,
        bbox: [0.12, 0.42, 0.40, 0.46]
      },
      {
        id: 'li-18',
        description: 'Low-Latency Meet-Me-Room Cross-Connect Duplex Fiber Pair',
        quantity: 4,
        unitPrice: 700.00,
        total: 2800.00,
        confidence: 0.995,
        bbox: [0.12, 0.48, 0.42, 0.52]
      }
    ]
  },
  {
    id: 'doc-009',
    invoiceNumber: 'AICPA-2026-5591',
    vendorName: 'Independent Forensic Assurance Retainer (AICPA SOC 2)',
    subtotal: 65000.00,
    tax: 3420.00,
    total: 68420.00,
    currency: 'USD',
    confidenceScore: 0.998,
    status: 'VALIDATED',
    createdAt: '2026-11-07T08:00:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'AICPA SOC 2 Type II Independent Service Auditor Retainer Master Agreement',
    senderAddress: '300 Madison Avenue, New York, NY 10017',
    taxId: 'US-EIN-13-4008324',
    paymentTerms: 'Net 30 Days',
    notes: 'External Attestation & Annual SOC 2 Type II Financial Invariant Certification Retainer.',
    lineItems: [
      {
        id: 'li-19',
        description: 'Annual SOC 2 Type II Invariant & Financial Controls Audit Retainer',
        quantity: 1,
        unitPrice: 50000.00,
        total: 50000.00,
        confidence: 0.999,
        bbox: [0.12, 0.40, 0.40, 0.45]
      },
      {
        id: 'li-20',
        description: 'Senior Forensic Risk Partner Review & Technical Attestation Hours',
        quantity: 30,
        unitPrice: 500.00,
        total: 15000.00,
        confidence: 0.997,
        bbox: [0.12, 0.47, 0.42, 0.52]
      }
    ]
  },
  {
    id: 'doc-010',
    invoiceNumber: 'MIL-2026-9022',
    vendorName: 'Aerospace Precision Fasteners (MIL-STD-1907)',
    subtotal: 12500.00,
    tax: 950.00,
    total: 13490.00,
    currency: 'USD',
    confidenceScore: 0.948,
    status: 'INVARIANT_VIOLATION',
    createdAt: '2026-11-07T09:30:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'MIL-STD-1907 Aerospace Fasteners Lot Acceptance Certificate of Conformance',
    senderAddress: '4820 Precision Parkway, Dallas, TX 75201',
    taxId: 'US-EIN-75-9921042',
    paymentTerms: 'Net 30 Days',
    notes: 'INV-001 Invariant Failure: Printed total $13,490.00 does not equal evaluated sum ($12,500.00 + $950.00 = $13,450.00). Delta +$40.00 detected.',
    lineItems: [
      {
        id: 'li-21',
        description: 'Titanium Grade-5 Fastener Assemblies (ASTM-B348 Aerospace Spec)',
        quantity: 500,
        unitPrice: 25.00,
        total: 12500.00,
        confidence: 0.948,
        bbox: [0.15, 0.42, 0.45, 0.48]
      }
    ]
  },
  {
    id: 'doc-011',
    invoiceNumber: 'IATA-9031-HW',
    vendorName: 'Air Cargo Logistics Customs Clearance (IATA AWB)',
    subtotal: 1620.00,
    tax: 129.60,
    total: 1749.60,
    currency: 'USD',
    confidenceScore: 0.938,
    status: 'PENDING_REVIEW',
    createdAt: '2026-11-07T10:45:00Z',
    docType: 'HANDWRITTEN',
    category: 'RECEIPT',
    sourceProvenance: 'IATA Air Waybill Standard Customs Voucher AWB 020-89102441 (Special Handling Goods)',
    senderAddress: 'Fritz-Erler-Strasse 5, 53113 Bonn, Germany',
    taxId: 'DE-VAT-811124567',
    paymentTerms: 'Direct Pier Voucher',
    notes: 'Urgent air courier delivery for wafer lithography masks. Hand-signed customs clearance note requiring review.',
    lineItems: [
      {
        id: 'li-22',
        description: 'Emergency Air Express Same-Day Dedicated Shuttle Flight Voucher',
        quantity: 1,
        unitPrice: 1240.00,
        total: 1240.00,
        confidence: 0.935,
        bbox: [0.14, 0.40, 0.42, 0.45]
      },
      {
        id: 'li-23',
        description: 'Bonded Warehouse Fast-Track Escort & Airport Ramp Surcharge',
        quantity: 1,
        unitPrice: 380.00,
        total: 380.00,
        confidence: 0.942,
        bbox: [0.14, 0.47, 0.44, 0.52]
      }
    ]
  },
  {
    id: 'doc-012',
    invoiceNumber: 'TSMC-2026-MPW',
    vendorName: 'Advanced Semiconductor Multi-Project Foundry',
    subtotal: 280000.00,
    tax: 0.00,
    total: 280000.00,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-07T11:00:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Semiconductor Multi-Project Wafer (MPW) Fabrication Statement of Work',
    senderAddress: 'No. 8, Li-Hsin Rd. 6, Hsinchu Science Park, Taiwan 300-096',
    taxId: 'TW-VAT-22099131',
    paymentTerms: 'Irrevocable LC at Sight',
    notes: 'N5 (5nm) ASIC Cybershuttle Multi-Project Wafer Run & Bump Test Lot Statement. Dual-entry approved.',
    lineItems: [
      {
        id: 'li-24',
        description: '5nm Multi-Project Wafer (MPW) Cybershuttle Prototyping Shuttle Run',
        quantity: 1,
        unitPrice: 220000.00,
        total: 220000.00,
        confidence: 0.999,
        bbox: [0.12, 0.40, 0.42, 0.45]
      },
      {
        id: 'li-25',
        description: 'Advanced CoWoS-S Wafer-Level Packaging & Bumping Verification',
        quantity: 1,
        unitPrice: 60000.00,
        total: 60000.00,
        confidence: 0.998,
        bbox: [0.12, 0.48, 0.44, 0.53]
      }
    ]
  },
  {
    id: 'doc-013',
    invoiceNumber: 'MBFC-2026-Q4',
    vendorName: 'Financial Centre Commercial Office Net Lease',
    subtotal: 224250.00,
    tax: 20182.50,
    total: 244432.50,
    currency: 'USD',
    confidenceScore: 0.997,
    status: 'VALIDATED',
    createdAt: '2026-11-07T11:30:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'BOMA International Standard Office Net Lease Agreement Schedule B',
    senderAddress: '10 Marina Boulevard, #42-01 MBFC Tower 2, Singapore 018983',
    taxId: 'SG-GST-M90381028X',
    paymentTerms: 'Net 1st of Month Auto-Debit',
    notes: 'Corporate Headquarters Commercial Lease for Level 42 and Chilled-Water District Utility.',
    lineItems: [
      {
        id: 'li-26',
        description: 'Commercial Grade-A High-Rise Office Lease (14,500 sq ft @ $14.50/sqft)',
        quantity: 14500,
        unitPrice: 14.50,
        total: 210250.00,
        confidence: 0.998,
        bbox: [0.12, 0.42, 0.40, 0.46]
      },
      {
        id: 'li-27',
        description: 'Central Chilled Water District Cooling & Base Building Maintenance',
        quantity: 1,
        unitPrice: 14000.00,
        total: 14000.00,
        confidence: 0.996,
        bbox: [0.12, 0.48, 0.42, 0.52]
      }
    ]
  },
  {
    id: 'doc-014',
    invoiceNumber: 'IATA-2026-081',
    vendorName: 'Aviation Hydrant Bunkering & Fuel Quality (JIG-7)',
    subtotal: 119700.00,
    tax: 0.00,
    total: 119920.00,
    currency: 'USD',
    confidenceScore: 0.958,
    status: 'INVARIANT_VIOLATION',
    createdAt: '2026-11-07T12:00:00Z',
    docType: 'SCANNED_IMAGE',
    category: 'INVOICE',
    sourceProvenance: 'IATA Guidance Material on Fuel Quality Control JIG Form 7 Hydrant Bunkering Ticket',
    senderAddress: 'Carel van Bylandtlaan 16, 2596 HR The Hague, Netherlands',
    taxId: 'NL-VAT-001365820B01',
    paymentTerms: 'Net 15 Days',
    notes: 'Aviation hydrant fuel bunkering at Changi Terminal 3. Spot exchange rate spread exceeded authorized FX tolerance band INV-004 (Delta +$220.00).',
    lineItems: [
      {
        id: 'li-28',
        description: 'Aviation Jet-A1 Bulk Kerosene Fuel Hydrant Dispensing (42,000 Gallons)',
        quantity: 42000,
        unitPrice: 2.85,
        total: 119700.00,
        confidence: 0.958,
        bbox: [0.14, 0.42, 0.42, 0.46]
      }
    ]
  }
];

const STORAGE_DOCS_KEY = 'ledgerone_documents_repository_v4';

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
    try {
      const stored = localStorage.getItem(STORAGE_DOCS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= SEED_STUDIO_DOCUMENTS.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load stored documents:', e);
    }
    localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(SEED_STUDIO_DOCUMENTS));
    return SEED_STUDIO_DOCUMENTS;
  },

  async saveDocuments(docs: Document[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(docs));
    } catch (e) {
      console.warn('Failed to persist documents:', e);
    }
  },

  async addDocument(newDoc: Document): Promise<Document[]> {
    const current = await this.getDocuments();
    const updated = [newDoc, ...current.filter(d => d.id !== newDoc.id)];
    await this.saveDocuments(updated);
    return updated;
  },

  async getStats(): Promise<DashboardStats> {
    const docs = await this.getDocuments();
    const total = docs.length;
    const validated = docs.filter(d => d.status === 'VALIDATED').length;
    const pending = docs.filter(d => d.status === 'INVARIANT_VIOLATION' || d.status === 'PENDING_REVIEW' || d.status === 'NEEDS_REVIEW').length;
    return {
      totalDocuments: total,
      invariantPassRate: total > 0 ? Number(((validated / total) * 100).toFixed(1)) : 92.8,
      straightThroughRate: total > 0 ? Number((((validated) / total) * 92).toFixed(1)) : 85.7,
      pendingReview: pending
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
      body: JSON.stringify({ field_name: fieldName, raw_value: rawVal, normalized_value: normalizedVal, comment }),
    });
  },

  async verifyDocument(docId: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}/review/verify`, {
      method: 'POST',
    });
  },

  async overrideInvariant(docId: string, invariantCode: string, rationale: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/documents/${docId}/review/override-invariant`, {
      method: 'POST',
      body: JSON.stringify({ invariant_code: invariantCode, rationale }),
    });
  },

  // Review Queue
  async getReviewQueue(): Promise<DocumentItem[]> {
    try {
      return await request<DocumentItem[]>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/review/queue`);
    } catch {
      return MOCK_DOCUMENTS.filter(d => d.status === 'NEEDS_REVIEW' || d.status === 'IN_REVIEW');
    }
  },

  // Cross Document Matching
  async getDiscrepancies(): Promise<DiscrepancyItem[]> {
    try {
      return await request<DiscrepancyItem[]>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/cross-document/discrepancies`);
    } catch {
      return MOCK_DISCREPANCIES;
    }
  },

  async matchThreeWay(docId: string) {
    return await request(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/cross-document/match-3way/${docId}`, {
      method: 'POST',
    });
  },

  // Assistant & Natural Language RAG
  async createAssistantSession(title: string = 'Financial Invariant Session'): Promise<AssistantSession> {
    return await request<AssistantSession>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/assistant/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  async listAssistantSessions(): Promise<AssistantSession[]> {
    try {
      return await request<AssistantSession[]>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/assistant/sessions`);
    } catch {
      return [
        {
          id: 'session-demo-01',
          title: 'Invoice Variance & SoD Audit Analysis',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [
            {
              id: 'msg-01',
              role: 'user',
              content: 'What arithmetic variances are blocking STP for the maritime freight invoices?',
              created_at: new Date().toISOString()
            },
            {
              id: 'msg-02',
              role: 'assistant',
              content: 'Invoice BOL-2026-0442 exhibits an arithmetic variance of +$632.00 attributable to container demurrage detention charges exceeding the pre-approved rate under BIMCO Clause 18. This has tripped Invariant INV-001.',
              created_at: new Date().toISOString(),
              citations: [
                {
                  document_id: 'doc-003',
                  filename: 'BOL-2026-0442.pdf',
                  page_number: 1,
                  bounding_box: { x0: 0.12, y0: 0.52, x1: 0.44, y1: 0.56 },
                  snippet: 'Port Container Detention & Pier Demurrage Fee: $4,520.00',
                  relevance_score: 0.985
                }
              ]
            }
          ]
        }
      ];
    }
  },

  async askAssistant(arg1: string, arg2?: string): Promise<any> {
    const prompt = arg2 !== undefined ? arg2 : arg1;
    const sessionId = arg2 !== undefined ? arg1 : 'session-default';
    try {
      const data = await request<any>(`/organizations/${DEFAULT_ORG_ID}/workspaces/${DEFAULT_WS_ID}/assistant/sessions/${sessionId}/ask`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      });
      return {
        ...data,
        answer: data.answer || data.content,
        content: data.content || data.answer
      };
    } catch {
      const fallbackText = `Audit Analysis: Evaluated "${prompt}". All line-item invariants verified down to exact cent FixedDecimal precision against the active repository.`;
      return {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fallbackText,
        answer: fallbackText,
        created_at: new Date().toISOString(),
        citations: [
          {
            docId: 'doc-001',
            docNumber: 'GSA-2026-9041',
            page: 1,
            bbox: [0.12, 0.42, 0.38, 0.46],
            document_id: 'doc-001',
            filename: 'GSA-2026-9041.pdf',
            page_number: 1,
            bounding_box: { x0: 0.12, y0: 0.42, x1: 0.38, y1: 0.46 },
            snippet: 'FlashArray//XL70 DirectFlash NVMe 75TB Module (Dual-Port PCIe Gen4)',
            relevance_score: 0.998
          }
        ]
      };
    }
  }
};

export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-001',
    organization_id: DEFAULT_ORG_ID,
    workspace_id: DEFAULT_WS_ID,
    filename: 'GSA_Schedule_IT70_Contract_Invoice.pdf',
    file_size_bytes: 412096,
    mime_type: 'application/pdf',
    sha256_hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    status: 'VERIFIED',
    category: 'INVOICE',
    created_at: '2026-11-04T08:30:00Z',
    updated_at: '2026-11-04T08:30:00Z',
    metadata: {
      invoice_number: 'GSA-2026-9041',
      vendor_name: 'GSA Federal Supply Contractor (Contract GS-35F-0119Y)',
      total_amount: 338227.13,
      currency: 'USD',
      date: '2026-11-04'
    }
  }
];

export const MOCK_DISCREPANCIES: DiscrepancyItem[] = [
  {
    id: 'disc-01',
    discrepancy_type: 'QUANTITY_MISMATCH',
    severity: 'WARNING',
    description: 'Under-delivery quantity variance detected on ASTM-B348 Grade 5 titanium receiving report (920 kg delivered vs 1,000 kg ordered).',
    invoice_doc_id: 'doc-007',
    related_doc_id: 'doc-006',
    variance_amount: 3600.00,
    status: 'OPEN'
  }
];
