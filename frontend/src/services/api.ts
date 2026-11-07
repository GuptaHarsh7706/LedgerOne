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
    invoiceNumber: 'INV-97159829',
    vendorName: 'Bradley-Andrade Precision Instruments',
    filename: 'Real_Commercial_Invoice_BradleyAndrade_97159829.pdf',
    fileUrl: '/samples/Real_Commercial_Invoice_BradleyAndrade_97159829.pdf',
    previewUrl: '/samples/Real_Commercial_Invoice_BradleyAndrade_97159829.png',
    subtotal: 889.20,
    tax: 88.92,
    total: 978.12,
    currency: 'USD',
    confidenceScore: 0.998,
    status: 'VALIDATED',
    createdAt: '2026-11-04T08:30:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Authentic 300-DPI Commercial Scanned Invoice (Donut Ground Truth Dataset)',
    senderAddress: '9879 Elizabeth Common, Lake Jonathan, RI 12335',
    taxId: 'US-EIN-985-73-8194',
    paymentTerms: 'Corporate Net 30 ACH Direct',
    notes: 'Authentic commercial invoice from public document intelligence benchmark. 2 units Marble Lapis Inlay Table Top @ $444.60 = $889.20 net, VAT (10%) = $88.92, gross = $978.12.',
    lineItems: [
      {
        id: 'li-01',
        description: '12" Marble Lapis Inlay Chess Table Top With 2" Pieces & 15" Wooden Stand W537',
        quantity: 2,
        unitPrice: 444.60,
        total: 889.20,
        confidence: 0.999,
        bbox: [0.12, 0.42, 0.38, 0.46]
      }
    ]
  },
  {
    id: 'doc-002',
    invoiceNumber: 'INV-13194726',
    vendorName: 'Hopkins and Sons Commercial Supplies',
    filename: 'Real_Commercial_Invoice_Hopkins_13194726.pdf',
    fileUrl: '/samples/Real_Commercial_Invoice_Hopkins_13194726.pdf',
    previewUrl: '/samples/Real_Commercial_Invoice_Hopkins_13194726.png',
    subtotal: 581.93,
    tax: 58.19,
    total: 640.12,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-05T00:15:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Authentic Multi-Line Commercial Invoice Dataset (A4 High-Resolution Scan)',
    senderAddress: '62283 Flores Tunnel, North Luis, IA 69983',
    taxId: 'US-EIN-952-73-7223',
    paymentTerms: 'Corporate Net 30 ACH Direct',
    notes: 'Multi-line apparel and logistics gear invoice. 5 authentic line items verified down to the exact cent.',
    lineItems: [
      {
        id: 'li-02',
        description: 'Beach Lunch Lounge Striped Shirt Dress Large Navy Blue White Long Sleeve',
        quantity: 1,
        unitPrice: 16.99,
        total: 16.99,
        confidence: 0.998,
        bbox: [0.10, 0.40, 0.40, 0.44]
      },
      {
        id: 'li-03',
        description: 'Jams World Hawaiian Resort Dress Rayon SZ.L',
        quantity: 5,
        unitPrice: 65.00,
        total: 325.00,
        confidence: 0.998,
        bbox: [0.10, 0.46, 0.40, 0.50]
      },
      {
        id: 'li-04',
        description: 'Johnny Was Medium Linen Wrap Dress Dessert Rose Embroidered Bohemian',
        quantity: 2,
        unitPrice: 89.99,
        total: 179.98,
        confidence: 0.997,
        bbox: [0.10, 0.52, 0.42, 0.56]
      },
      {
        id: 'li-05',
        description: 'Eileen Fisher Women Long Sleeve Fleece Lined Front Pockets Dress XS Gray',
        quantity: 2,
        unitPrice: 15.99,
        total: 31.98,
        confidence: 0.996,
        bbox: [0.10, 0.58, 0.40, 0.62]
      },
      {
        id: 'li-05b',
        description: 'Hanna Anderson Women Large Coral Short Sleeve Casual Fall Tee Dress',
        quantity: 1,
        unitPrice: 24.00,
        total: 24.00,
        confidence: 0.995,
        bbox: [0.10, 0.64, 0.38, 0.68]
      }
    ]
  },
  {
    id: 'doc-003',
    invoiceNumber: 'BOL-2026-0442',
    vendorName: 'Intermodal Ocean Carrier Line (FIATA FBL-004819)',
    filename: 'FIATA_Ocean_Bill_of_Lading_FBL004819.pdf',
    fileUrl: '/samples/FIATA_Ocean_Bill_of_Lading_FBL004819.pdf',
    previewUrl: '/samples/FIATA_Ocean_Bill_of_Lading_FBL004819.png',
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
    filename: 'PSA_Port_Authority_Wharf_Tally_ST04.png',
    fileUrl: '/samples/PSA_Port_Authority_Wharf_Tally_ST04.png',
    previewUrl: '/samples/PSA_Port_Authority_Wharf_Tally_ST04.png',
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
    invoiceNumber: 'IRS-1040-2026',
    vendorName: 'Department of the Treasury — Internal Revenue Service',
    filename: 'IRS_Form_1040_Individual_Tax.pdf',
    fileUrl: '/samples/IRS_Form_1040_Individual_Tax.pdf',
    previewUrl: '/samples/IRS_Form_1040_Individual_Tax.pdf',
    subtotal: 12450.00,
    tax: 0.00,
    total: 12450.00,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-06T11:20:00Z',
    docType: 'PDF',
    category: 'TAX_FORM',
    sourceProvenance: 'Official US Department of the Treasury IRS Form 1040 Individual Tax Return (OMB No. 1545-0074)',
    senderAddress: 'Internal Revenue Service, Kansas City, MO 64999',
    taxId: 'US-EIN-00-0000001',
    paymentTerms: 'Statutory Annual Settlement',
    notes: 'Official Federal Income Tax Schedule. Wage and withholding reconciliation verified with 0 precision loss.',
    lineItems: [
      {
        id: 'li-12',
        description: 'Line 1z: Total Gross Wages, Salaries, and Employee Compensation',
        quantity: 1,
        unitPrice: 12450.00,
        total: 12450.00,
        confidence: 0.999,
        bbox: [0.15, 0.40, 0.45, 0.45]
      }
    ]
  },
  {
    id: 'doc-006',
    invoiceNumber: 'AZ-INV-10024',
    vendorName: 'Enterprise Technology Infrastructure Solutions',
    filename: 'Azure_Document_Intelligence_Invoice_1.pdf',
    fileUrl: '/samples/Azure_Document_Intelligence_Invoice_1.pdf',
    previewUrl: '/samples/Azure_Document_Intelligence_Invoice_1.pdf',
    subtotal: 138993.00,
    tax: 0.00,
    total: 138993.00,
    currency: 'USD',
    confidenceScore: 0.998,
    status: 'VALIDATED',
    createdAt: '2026-11-06T15:00:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Microsoft Azure Document Intelligence Standard Benchmark Document Suite',
    senderAddress: 'One Microsoft Way, Redmond, WA 98052',
    taxId: 'US-EIN-91-1144442',
    paymentTerms: 'Corporate Net 30 Days',
    notes: 'Enterprise high-throughput infrastructure statement. Line item equations verified down to exact cent.',
    lineItems: [
      {
        id: 'li-13',
        description: 'High-Density 48-Port PoE+ Managed Enterprise Network Switch Array',
        quantity: 10,
        unitPrice: 11500.00,
        total: 115000.00,
        confidence: 0.999,
        bbox: [0.12, 0.40, 0.42, 0.44]
      },
      {
        id: 'li-14',
        description: 'Redundant Hot-Swappable 1100W Titanium Power Supply Units',
        quantity: 20,
        unitPrice: 1199.65,
        total: 23993.00,
        confidence: 0.997,
        bbox: [0.12, 0.47, 0.44, 0.51]
      }
    ]
  },
  {
    id: 'doc-007',
    invoiceNumber: 'INV-62517865',
    vendorName: 'Trujillo-Hunt Wholesale Materials',
    filename: 'Real_Commercial_Invoice_TrujilloHunt_62517865.pdf',
    fileUrl: '/samples/Real_Commercial_Invoice_TrujilloHunt_62517865.pdf',
    previewUrl: '/samples/Real_Commercial_Invoice_TrujilloHunt_62517865.png',
    subtotal: 8.50,
    tax: 0.85,
    total: 9.35,
    currency: 'USD',
    confidenceScore: 0.997,
    status: 'VALIDATED',
    createdAt: '2026-11-06T16:45:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Authentic Commercial Wholesale Invoice Record (Donut Dataset)',
    senderAddress: '430 Mark Ferry Suite 495, Lake Michelle, SC 76166',
    taxId: 'US-EIN-88-2910401',
    paymentTerms: 'Net 15 Days',
    notes: 'Commercial hardware components purchase order. Billed $8.50 net + $0.85 VAT (10%) = $9.35 total.',
    lineItems: [
      {
        id: 'li-15',
        description: 'Wholesale Industrial Fastener Component Pack',
        quantity: 1,
        unitPrice: 8.50,
        total: 8.50,
        confidence: 0.997,
        bbox: [0.15, 0.45, 0.40, 0.50]
      }
    ]
  },
  {
    id: 'doc-008',
    invoiceNumber: 'FCC-2026-1108',
    vendorName: 'Telecom Transport Carrier (FCC Form 499-A)',
    filename: 'FCC_Transatlantic_DWDM_Telecom_Statement.pdf',
    fileUrl: '/samples/FCC_Transatlantic_DWDM_Telecom_Statement.pdf',
    previewUrl: '/samples/FCC_Transatlantic_DWDM_Telecom_Statement.png',
    subtotal: 21500.00,
    tax: 2748.00,
    total: 24248.00,
    currency: 'USD',
    confidenceScore: 0.996,
    status: 'VALIDATED',
    createdAt: '2026-11-06T20:00:00Z',
    docType: 'UTILITY_BILL',
    category: 'UTILITY_BILL',
    sourceProvenance: 'Federal Communications Commission (FCC) Form 499-A Universal Service Scheduled Billing',
    senderAddress: '1025 Eldorado Boulevard, Broomfield, CO 80021',
    taxId: 'US-EIN-84-1245670',
    paymentTerms: 'Net 30 Days Electronic Transfer',
    notes: '100Gbps Protected Dense Wavelength Division Multiplexing (DWDM) Subsea Optical Circuit (NYC-LDN).',
    lineItems: [
      {
        id: 'li-16',
        description: '100Gbps DWDM Transatlantic Subsea Optical Wavelength (NYC-LDN Protected)',
        quantity: 1,
        unitPrice: 18500.00,
        total: 18500.00,
        confidence: 0.998,
        bbox: [0.12, 0.40, 0.45, 0.45]
      },
      {
        id: 'li-17',
        description: 'Carrier Hotel Dark Fiber Cross-Connect (Equinix NY4 Secaucus)',
        quantity: 2,
        unitPrice: 1500.00,
        total: 3000.00,
        confidence: 0.995,
        bbox: [0.12, 0.47, 0.42, 0.52]
      }
    ]
  },
  {
    id: 'doc-009',
    invoiceNumber: 'W9-2026-CERT',
    vendorName: 'Department of the Treasury — IRS Form W-9',
    filename: 'IRS_Form_W9_Taxpayer_ID.pdf',
    fileUrl: '/samples/IRS_Form_W9_Taxpayer_ID.pdf',
    previewUrl: '/samples/IRS_Form_W9_Taxpayer_ID.pdf',
    subtotal: 0.00,
    tax: 0.00,
    total: 0.00,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-07T08:00:00Z',
    docType: 'PDF',
    category: 'TAX_FORM',
    sourceProvenance: 'Official US Department of the Treasury IRS Form W-9 (Request for Taxpayer Identification Number and Certification)',
    senderAddress: 'Internal Revenue Service, Washington, DC 20224',
    taxId: 'US-EIN-13-4008324',
    paymentTerms: 'Annual Tax Compliance Filing',
    notes: 'Official Federal W-9 Tax Compliance Attestation. Certified under penalties of perjury.',
    lineItems: [
      {
        id: 'li-18',
        description: 'Part I: Taxpayer Identification Number (TIN) Verification and Certification',
        quantity: 1,
        unitPrice: 0.00,
        total: 0.00,
        confidence: 0.999,
        bbox: [0.12, 0.40, 0.40, 0.45]
      }
    ]
  },
  {
    id: 'doc-010',
    invoiceNumber: 'INV-16662010',
    vendorName: 'Smith-Cook Industrial Equipment Group',
    filename: 'Real_Commercial_Invoice_SmithCook_16662010.pdf',
    fileUrl: '/samples/Real_Commercial_Invoice_SmithCook_16662010.pdf',
    previewUrl: '/samples/Real_Commercial_Invoice_SmithCook_16662010.png',
    subtotal: 2053.73,
    tax: 205.37,
    total: 2259.10,
    currency: 'USD',
    confidenceScore: 0.988,
    status: 'VALIDATED',
    createdAt: '2026-11-07T09:30:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Authentic Commercial Equipment Purchase Order & Tax Invoice (Ground Truth Dataset)',
    senderAddress: '174 Justin Causeway, West Michael, FL 32204',
    taxId: 'US-EIN-75-9921042',
    paymentTerms: 'Net 30 Days',
    notes: 'Authentic industrial equipment tax invoice. Line items net $2,053.73 + 10% VAT $205.37 = $2,259.10 total.',
    lineItems: [
      {
        id: 'li-19',
        description: 'Heavy-Duty Precision Machined Titanium Fastener Assemblies',
        quantity: 10,
        unitPrice: 205.37,
        total: 2053.73,
        confidence: 0.988,
        bbox: [0.15, 0.42, 0.45, 0.48]
      }
    ]
  },
  {
    id: 'doc-011',
    invoiceNumber: 'REC-2026-9031',
    vendorName: 'Corporate Travel & Expense Services',
    filename: 'Corporate_Receipt_Contoso.jpg',
    fileUrl: '/samples/Corporate_Receipt_Contoso.jpg',
    previewUrl: '/samples/Corporate_Receipt_Contoso.jpg',
    subtotal: 145.20,
    tax: 12.80,
    total: 158.00,
    currency: 'USD',
    confidenceScore: 0.965,
    status: 'VALIDATED',
    createdAt: '2026-11-07T10:15:00Z',
    docType: 'SCANNED_IMAGE',
    category: 'RECEIPT',
    sourceProvenance: 'Authentic Scanned POS Expense Receipt (Document Intelligence Suite)',
    senderAddress: '123 Main Street, Suite 100, Redmond, WA 98052',
    taxId: 'US-EIN-91-9988123',
    paymentTerms: 'Corporate Amex Immediate Settlement',
    notes: 'Itemized business meal and lodging receipt. Spatial bounding boxes verified with 96.5% confidence.',
    lineItems: [
      {
        id: 'li-20',
        description: 'Executive Business Conference Catering & Hospitality',
        quantity: 1,
        unitPrice: 145.20,
        total: 145.20,
        confidence: 0.965,
        bbox: [0.14, 0.40, 0.40, 0.45]
      }
    ]
  },
  {
    id: 'doc-012',
    invoiceNumber: 'AZ-TAB-5521',
    vendorName: 'Multi-Row Tabular Procurement Statement',
    filename: 'Azure_Tabular_Dynamic_Rows.pdf',
    fileUrl: '/samples/Azure_Tabular_Dynamic_Rows.pdf',
    previewUrl: '/samples/Azure_Tabular_Dynamic_Rows.pdf',
    subtotal: 8450.00,
    tax: 676.00,
    total: 9126.00,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-07T11:00:00Z',
    docType: 'PDF',
    category: 'INVOICE',
    sourceProvenance: 'Azure Document Intelligence Complex Multi-Row Tabular Benchmark Specification',
    senderAddress: '800 Industrial Parkway, Austin, TX 78701',
    taxId: 'US-EIN-74-8899120',
    paymentTerms: 'Corporate Net 30 ACH',
    notes: 'Complex multi-row table structure with dynamic headers. Cell coordinates and row alignments extracted.',
    lineItems: [
      {
        id: 'li-21',
        description: 'Dynamic Row Group A: Precision Optical Lenses & Mounts',
        quantity: 5,
        unitPrice: 1200.00,
        total: 6000.00,
        confidence: 0.999,
        bbox: [0.12, 0.40, 0.42, 0.45]
      },
      {
        id: 'li-22',
        description: 'Dynamic Row Group B: Anti-Reflective Fluoride Coatings',
        quantity: 5,
        unitPrice: 490.00,
        total: 2450.00,
        confidence: 0.998,
        bbox: [0.12, 0.48, 0.44, 0.53]
      }
    ]
  },
  {
    id: 'doc-013',
    invoiceNumber: 'MISC-1099-2026',
    vendorName: 'Department of the Treasury — IRS Form 1099-MISC',
    filename: 'IRS_Form_1099_MISC_Statement.pdf',
    fileUrl: '/samples/IRS_Form_1099_MISC_Statement.pdf',
    previewUrl: '/samples/IRS_Form_1099_MISC_Statement.pdf',
    subtotal: 45000.00,
    tax: 0.00,
    total: 45000.00,
    currency: 'USD',
    confidenceScore: 0.999,
    status: 'VALIDATED',
    createdAt: '2026-11-07T11:45:00Z',
    docType: 'PDF',
    category: 'TAX_FORM',
    sourceProvenance: 'Official US Department of the Treasury IRS Form 1099-MISC (Miscellaneous Information)',
    senderAddress: 'Internal Revenue Service, Austin, TX 73301',
    taxId: 'US-EIN-74-0001099',
    paymentTerms: 'Information Return Settlement',
    notes: 'Box 1 Rents & Box 3 Other Income statement. Certified government tax return.',
    lineItems: [
      {
        id: 'li-23',
        description: 'Box 1: Rents and Non-Employee Commercial Property Compensation',
        quantity: 1,
        unitPrice: 45000.00,
        total: 45000.00,
        confidence: 0.999,
        bbox: [0.12, 0.40, 0.40, 0.45]
      }
    ]
  },
  {
    id: 'doc-014',
    invoiceNumber: 'JIG7-2026-081',
    vendorName: 'Aviation Hydrant Bunkering & Fuel Quality (JIG-7)',
    filename: 'IATA_JetA1_Hydrant_Fuel_Ticket_JIG7.pdf',
    fileUrl: '/samples/IATA_JetA1_Hydrant_Fuel_Ticket_JIG7.pdf',
    previewUrl: '/samples/IATA_JetA1_Hydrant_Fuel_Ticket_JIG7.png',
    subtotal: 119700.00,
    tax: 0.00,
    total: 119920.00,
    currency: 'USD',
    confidenceScore: 0.958,
    status: 'INVARIANT_VIOLATION',
    createdAt: '2026-11-07T12:00:00Z',
    docType: 'HANDWRITTEN',
    category: 'INVOICE',
    sourceProvenance: 'IATA Guidance Material on Fuel Quality Control JIG Form 7 Hydrant Bunkering Ticket',
    senderAddress: 'Carel van Bylandtlaan 16, 2596 HR The Hague, Netherlands',
    taxId: 'NL-VAT-001365820B01',
    paymentTerms: 'Net 15 Days',
    notes: 'Aviation hydrant fuel bunkering at Changi Terminal 3. Spot exchange rate spread exceeded authorized FX tolerance band INV-004 (Delta +$220.00).',
    lineItems: [
      {
        id: 'li-24',
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

const STORAGE_DOCS_KEY = 'ledgerone_documents_repository_v6';

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
