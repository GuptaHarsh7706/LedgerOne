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
    Monetary values MUST be stored as Decimal instances to avoid floating-point drift.
    """
    name: str = Field(..., description="Canonical field identifier, e.g. total_amount")
    value: Optional[Any] = Field(default=None, description="Normalized typed value (Decimal, str, date, float, int)")
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

    @classmethod
    def from_line_item_field(cls, field: Any) -> LineItemSchema:
        """Convert an immutable LineItemField or dictionary into a LineItemSchema."""
        from src.intelligence.table_contracts import LineItemField
        if isinstance(field, LineItemField):
            desc_val = field.description
            qty_val = field.quantity
            up_val = field.unit_price
            tot_val = field.line_total
            tax_val = field.tax_rate
            code_val = field.item_code
            conf = field.confidence
            page = getattr(field, "source_page", getattr(field, "page_number", 0))
            bbox = field.bbox
            line_no = field.line_number
        elif isinstance(field, dict):
            desc_val = field.get("description", "")
            qty_val = field.get("quantity")
            up_val = field.get("unit_price")
            tot_val = field.get("line_total") or field.get("total_price")
            tax_val = field.get("tax_rate")
            code_val = field.get("item_code")
            conf = float(field.get("confidence", 1.0))
            page = int(field.get("source_page", 0))
            bbox = field.get("bbox")
            line_no = int(field.get("line_number", 1))
        else:
            raise TypeError(f"Unsupported type for from_line_item_field: {type(field)}")

        return cls(
            line_number=line_no,
            description=ExtractedField(
                name="description",
                value=desc_val,
                raw_value=str(desc_val),
                data_type=FieldDataType.STRING,
                confidence=conf,
                source_page=page,
                bbox=bbox,
                extraction_status=ExtractionStatus.ACCEPTED if conf >= 0.75 else ExtractionStatus.NEEDS_REVIEW,
            ),
            quantity=ExtractedField(
                name="quantity",
                value=qty_val,
                raw_value=str(qty_val) if qty_val is not None else None,
                data_type=FieldDataType.QUANTITY,
                confidence=conf,
                source_page=page,
                bbox=bbox,
                extraction_status=ExtractionStatus.ACCEPTED if conf >= 0.75 else ExtractionStatus.NEEDS_REVIEW,
            ) if qty_val is not None else None,
            unit_price=ExtractedField(
                name="unit_price",
                value=up_val,
                raw_value=str(up_val) if up_val is not None else None,
                data_type=FieldDataType.MONETARY,
                confidence=conf,
                source_page=page,
                bbox=bbox,
                extraction_status=ExtractionStatus.ACCEPTED if conf >= 0.75 else ExtractionStatus.NEEDS_REVIEW,
            ) if up_val is not None else None,
            total_price=ExtractedField(
                name="total_price",
                value=tot_val,
                raw_value=str(tot_val) if tot_val is not None else None,
                data_type=FieldDataType.MONETARY,
                confidence=conf,
                source_page=page,
                bbox=bbox,
                extraction_status=ExtractionStatus.ACCEPTED if conf >= 0.75 else ExtractionStatus.NEEDS_REVIEW,
            ) if tot_val is not None else None,
            tax_rate=ExtractedField(
                name="tax_rate",
                value=tax_val,
                raw_value=str(tax_val) if tax_val is not None else None,
                data_type=FieldDataType.PERCENTAGE,
                confidence=conf,
                source_page=page,
                bbox=bbox,
                extraction_status=ExtractionStatus.ACCEPTED if conf >= 0.75 else ExtractionStatus.NEEDS_REVIEW,
            ) if tax_val is not None else None,
            item_code=ExtractedField(
                name="item_code",
                value=code_val,
                raw_value=code_val,
                data_type=FieldDataType.IDENTIFIER,
                confidence=conf,
                source_page=page,
                bbox=bbox,
                extraction_status=ExtractionStatus.ACCEPTED,
            ) if code_val is not None else None,
        )

    def to_line_item_field(self) -> Any:
        """Convert this LineItemSchema back to an immutable LineItemField."""
        from decimal import Decimal
        from src.intelligence.table_contracts import LineItemField

        def _to_dec(val: Any) -> Decimal:
            if isinstance(val, Decimal):
                return val
            if val is None or val == "":
                return Decimal("0.00")
            return Decimal(str(val).replace("$", "").replace("€", "").replace("£", "").replace(",", "").strip())

        qty = _to_dec(self.quantity.value if self.quantity else 0)
        up = _to_dec(self.unit_price.value if self.unit_price else 0)
        tot = _to_dec(self.total_price.value if self.total_price else 0)
        net = tot if tot > Decimal("0.00") else (qty * up)

        return LineItemField(
            line_number=self.line_number,
            description=str(self.description.value or ""),
            line_net=net,
            quantity=qty,
            unit_price=up,
            line_total=tot,
            tax_rate=_to_dec(self.tax_rate.value) if (self.tax_rate and self.tax_rate.value is not None) else None,
            item_code=str(self.item_code.value) if (self.item_code and self.item_code.value) else None,
            confidence=self.description.confidence,
            bbox=self.description.bbox,
        )


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
    
    # Monetary Totals & Items
    subtotal: Optional[ExtractedField] = Field(default=None, description="Net amount before tax/discount")
    tax_amount: Optional[ExtractedField] = Field(default=None, description="Total tax / VAT amount")
    tax_percentage: Optional[ExtractedField] = Field(default=None, description="Applicable tax percentage")
    discount_amount: Optional[ExtractedField] = Field(default=None, description="Total discount applied")
    total_amount: Optional[ExtractedField] = Field(default=None, description="Grand total payable")
    quantity: Optional[ExtractedField] = Field(default=None, description="Primary item quantity or summary count")
    unit_price: Optional[ExtractedField] = Field(default=None, description="Primary item unit price")
    
    # Terms & Line Items
    payment_terms: Optional[ExtractedField] = Field(default=None, description="Payment terms, e.g. Net 30")
    line_items: List[LineItemSchema] = Field(default_factory=list, description="Extracted line item records")
    table_blocks: List[Any] = Field(default_factory=list, description="Extracted table blocks")
    invariant_evaluations: List[Any] = Field(default_factory=list, description="Evaluated accounting invariant results")
    
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
