"""
Structured Extraction Schemas and Entity Models for Document Intelligence.
Preserves field-level provenance, bounding boxes, data types, confidence scores,
and verification lifecycles as specified in LedgerOne Master Document Sections 9, 10, and 24.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field

from src.intelligence.models import BoundingBox


class DocumentType(str, Enum):
    """Canonical document classification categories."""
    COMMERCIAL_INVOICE = "COMMERCIAL_INVOICE"
    RECEIPT = "RECEIPT"
    PURCHASE_ORDER = "PURCHASE_ORDER"
    BANK_STATEMENT = "BANK_STATEMENT"
    FINANCIAL_SCHEDULE = "FINANCIAL_SCHEDULE"
    LEGAL_CONTRACT = "LEGAL_CONTRACT"
    MULTI_COLUMN_REPORT = "MULTI_COLUMN_REPORT"
    OTHER = "OTHER"


class FieldDataType(str, Enum):
    """Data types for extracted fields."""
    STRING = "string"
    MONETARY = "monetary"
    DATE = "date"
    IDENTIFIER = "identifier"
    PERCENTAGE = "percentage"
    QUANTITY = "quantity"
    CATEGORICAL = "categorical"
    BOOLEAN = "boolean"


class ExtractionStatus(str, Enum):
    """
    Automated extraction acceptance status.
    - ACCEPTED: Passes confidence threshold, data type validation, and business rule invariants.
    - NEEDS_REVIEW: Uncertain extraction, low confidence, or failed cross-field reconciliation.
    - ABSTAINED: Field is explicitly not present or unextractable without fabricating data.
    """
    ACCEPTED = "ACCEPTED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    ABSTAINED = "ABSTAINED"


class VerificationStatus(str, Enum):
    """
    Human verification lifecycle status.
    """
    UNVERIFIED = "UNVERIFIED"
    VERIFIED = "VERIFIED"
    CORRECTED = "CORRECTED"
    REJECTED = "REJECTED"


class ExtractedField(BaseModel):
    """
    Standardized extracted field representation preserving full data lineage,
    geometry, supporting evidence, confidence score, and review status.
    """
    name: str = Field(..., description="Canonical field identifier, e.g. total_amount")
    value: Optional[Any] = Field(default=None, description="Normalized typed value (float, str, date)")
    raw_value: Optional[str] = Field(default=None, description="Exact textual span from document")
    data_type: FieldDataType = Field(default=FieldDataType.STRING, description="Semantic data type")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Calibrated field-level confidence score")
    source_page: int = Field(default=0, ge=0, description="0-based source page index")
    bbox: Optional[BoundingBox] = Field(default=None, description="Spatial bounding box on page")
    supporting_evidence: Optional[str] = Field(default=None, description="Surrounding context snippet / line span")
    extraction_status: ExtractionStatus = Field(default=ExtractionStatus.NEEDS_REVIEW, description="Acceptance status")
    verification_status: VerificationStatus = Field(default=VerificationStatus.UNVERIFIED, description="Human review status")
    validation_notes: List[str] = Field(default_factory=list, description="Parser or validation engine diagnostics")


class LineItemSchema(BaseModel):
    """A single structured line item from a table or ledger."""
    line_number: int = Field(..., description="1-based line sequence number")
    description: ExtractedField = Field(..., description="Line description / item name")
    quantity: Optional[ExtractedField] = Field(default=None, description="Quantity ordered/delivered")
    unit_price: Optional[ExtractedField] = Field(default=None, description="Unit price per item")
    total_price: Optional[ExtractedField] = Field(default=None, description="Extended line total")
    tax_rate: Optional[ExtractedField] = Field(default=None, description="Line-level tax percentage")
    item_code: Optional[ExtractedField] = Field(default=None, description="SKU or product code")


class InvoiceExtractionSchema(BaseModel):
    """
    Schema for Commercial Invoices, Receipts, and Purchase Orders.
    Validates completeness, amounts, dates, and accounting invariants.
    """
    document_type: DocumentType = Field(default=DocumentType.COMMERCIAL_INVOICE)
    classification_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    
    # Metadata & Identifiers
    invoice_number: Optional[ExtractedField] = Field(default=None, description="Invoice / Receipt / PO reference #")
    invoice_date: Optional[ExtractedField] = Field(default=None, description="Issue date")
    due_date: Optional[ExtractedField] = Field(default=None, description="Payment due date")
    po_number: Optional[ExtractedField] = Field(default=None, description="Associated Purchase Order reference")
    currency: Optional[ExtractedField] = Field(default=None, description="ISO currency code (USD, EUR, GBP, etc.)")
    
    # Entities / Parties
    vendor_name: Optional[ExtractedField] = Field(default=None, description="Issuer / Vendor entity name")
    vendor_tax_id: Optional[ExtractedField] = Field(default=None, description="Vendor Tax ID / VAT / EIN")
    vendor_address: Optional[ExtractedField] = Field(default=None, description="Vendor physical / billing address")
    customer_name: Optional[ExtractedField] = Field(default=None, description="Recipient / Customer entity name")
    customer_tax_id: Optional[ExtractedField] = Field(default=None, description="Customer Tax ID / VAT / EIN")
    customer_address: Optional[ExtractedField] = Field(default=None, description="Customer physical / shipping address")
    
    # Monetary Totals
    subtotal: Optional[ExtractedField] = Field(default=None, description="Net amount before tax/discount")
    tax_amount: Optional[ExtractedField] = Field(default=None, description="Total tax / VAT amount")
    tax_percentage: Optional[ExtractedField] = Field(default=None, description="Applicable tax percentage")
    discount_amount: Optional[ExtractedField] = Field(default=None, description="Total discount applied")
    total_amount: Optional[ExtractedField] = Field(default=None, description="Grand total payable")
    
    # Terms & Line Items
    payment_terms: Optional[ExtractedField] = Field(default=None, description="Payment terms, e.g. Net 30")
    line_items: List[LineItemSchema] = Field(default_factory=list, description="Extracted line item records")
    
    # Schema Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Extraction engine metadata")


class ContractExtractionSchema(BaseModel):
    """
    Schema for Legal Contracts, Service Level Agreements (SLAs), and NDAs.
    """
    document_type: DocumentType = Field(default=DocumentType.LEGAL_CONTRACT)
    classification_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    
    contract_title: Optional[ExtractedField] = Field(default=None, description="Contract or agreement title")
    parties: List[ExtractedField] = Field(default_factory=list, description="Contracting entities/parties")
    effective_date: Optional[ExtractedField] = Field(default=None, description="Date agreement takes effect")
    expiration_date: Optional[ExtractedField] = Field(default=None, description="Contract expiration or term end date")
    governing_law: Optional[ExtractedField] = Field(default=None, description="Jurisdiction or governing law clause")
    total_value: Optional[ExtractedField] = Field(default=None, description="Total agreement monetary commitment")
    termination_clauses: Optional[ExtractedField] = Field(default=None, description="Notice period / termination rights")
    payment_terms: Optional[ExtractedField] = Field(default=None, description="Billing frequency and payment terms")
    
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DocumentClassificationResult(BaseModel):
    """
    Output of Document Classification Engine.
    """
    predicted_type: DocumentType = Field(..., description="Classified document type")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Calibrated classification confidence")
    class_probabilities: Dict[str, float] = Field(default_factory=dict, description="Softmax / normalized score per class")
    evidence_keywords: List[str] = Field(default_factory=list, description="Keywords or structural markers triggering class")
