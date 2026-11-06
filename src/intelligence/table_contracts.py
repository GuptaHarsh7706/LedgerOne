"""
Table and Line-Item Extraction Data Contracts for LedgerOne.
Defines foundational data contracts, bounding box geometry, tabular representations,
accounting invariant result structures, and lifecycle state models for Phase 4 Step 4.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.intelligence.models import BoundingBox


# ---------------------------------------------------------------------------
# Tabular Structural Enums & Models
# ---------------------------------------------------------------------------

class TableRowType(str, Enum):
    """Semantic classification of table rows."""
    HEADER = "HEADER"
    DATA = "DATA"
    TOTAL = "TOTAL"
    METADATA = "METADATA"
    DISCOUNT = "DISCOUNT"
    TAX = "TAX"
    SUMMARY = "SUMMARY"
    CONTINUATION = "CONTINUATION"


class TableType(str, Enum):
    """Structural layout taxonomy of financial tables."""
    STANDARD_GRID = "STANDARD_GRID"
    BORDERLESS = "BORDERLESS"
    KEY_VALUE_LEDGER = "KEY_VALUE_LEDGER"
    MULTI_TIER_HEADER = "MULTI_TIER_HEADER"


class TableCell(BaseModel):
    """
    Individual cell within an extracted table grid.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    text: str = Field(..., description="Extracted textual content of the cell")
    bbox: BoundingBox = Field(..., description="Spatial bounding box on page")
    row_idx: int = Field(..., ge=0, description="0-based row index")
    col_idx: int = Field(..., ge=0, description="0-based column index")
    row_span: int = Field(default=1, ge=1, description="Number of rows spanned")
    col_span: int = Field(default=1, ge=1, description="Number of columns spanned")
    is_header: bool = Field(default=False, description="Whether this cell is part of column header")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Extraction confidence score")


class TableRow(BaseModel):
    """
    Horizontal slice of an extracted table containing ordered cells.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    cells: Tuple[TableCell, ...] = Field(..., description="Ordered cells in this row")
    row_type: TableRowType = Field(default=TableRowType.DATA, description="Semantic classification")
    row_index: int = Field(..., ge=0, description="0-based row index within table")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Row-level confidence score")
    bbox: Optional[BoundingBox] = Field(default=None, description="Enclosing bounding box of the entire row")


class TableBlock(BaseModel):
    """
    Complete tabular structure extracted from a single document page.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    page_number: int = Field(..., ge=1, description="1-based page number")
    bbox: BoundingBox = Field(..., description="Enclosing bounding box of the table on page")
    rows: Tuple[TableRow, ...] = Field(..., description="Rows comprising the table")
    table_type: TableType = Field(default=TableType.STANDARD_GRID, description="Layout taxonomy")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score")


# ---------------------------------------------------------------------------
# Structured Line-Item Field Model
# ---------------------------------------------------------------------------

class LineItemField(BaseModel):
    """
    Strongly typed, immutable representation of a line item extracted from
    an invoice, receipt, purchase order, or financial schedule.
    All monetary and tax calculations use Decimal for zero-drift arithmetic.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    line_number: int = Field(..., ge=1, description="1-based line sequence number")
    description: str = Field(..., min_length=1, description="Description or product/service title")
    line_net: Decimal = Field(..., description="Line subtotal before tax (quantity * unit_price - discount)")
    quantity: Optional[Decimal] = Field(default=None, description="Quantity delivered/billed")
    unit_price: Optional[Decimal] = Field(default=None, description="Unit price per item")
    line_discount: Optional[Decimal] = Field(default=None, description="Explicit line-level discount")
    tax_rate: Optional[Decimal] = Field(default=None, description="Tax rate percentage (e.g. Decimal('19.0') for 19%)")
    tax_amount: Optional[Decimal] = Field(default=None, description="Line tax amount")
    line_total: Optional[Decimal] = Field(default=None, description="Extended line gross total (line_net + tax_amount)")
    item_code: Optional[str] = Field(default=None, description="Product SKU, code, or part number")
    raw_tokens: Tuple[str, ...] = Field(default_factory=tuple, description="Exact OCR/text tokens comprising this line")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Extraction confidence score")
    bbox: Optional[BoundingBox] = Field(default=None, description="Bounding box on page")


# ---------------------------------------------------------------------------
# Lifecycle and Invariant Evaluation Enums
# ---------------------------------------------------------------------------

class MachineValidationStatus(str, Enum):
    """Automated evaluation status dimension."""
    NOT_RUN = "NOT_RUN"
    SCHEMA_VALID = "SCHEMA_VALID"
    INVARIANTS_PASSED = "INVARIANTS_PASSED"
    INVARIANTS_FAILED = "INVARIANTS_FAILED"
    INVARIANTS_INCOMPLETE = "INVARIANTS_INCOMPLETE"


class DocumentLifecycleState(str, Enum):
    """Human and operational workflow state dimension."""
    UPLOADED = "UPLOADED"
    EXTRACTED = "EXTRACTED"
    AUTO_VALIDATED = "AUTO_VALIDATED"
    PENDING_REVIEW = "PENDING_REVIEW"
    CORRECTION_SUBMITTED = "CORRECTION_SUBMITTED"
    HUMAN_VERIFIED = "HUMAN_VERIFIED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class InvariantOutcomeEnum(str, Enum):
    """Outcome of an accounting invariant evaluation."""
    PASSED = "PASSED"
    FAILED = "FAILED"
    NOT_EVALUABLE = "NOT_EVALUABLE"


class InvariantSeverityEnum(str, Enum):
    """Failure severity level of an invariant."""
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class InvariantId(str, Enum):
    """The 10 canonical accounting invariants for LedgerOne."""
    INV_001 = "INV-001"  # Line Item Net Subtotal Sum vs Document Subtotal
    INV_002 = "INV-002"  # Line Item Arithmetic Identity (qty * price - discount == line_net)
    INV_003 = "INV-003"  # Line Item Gross Total Identity (line_net + line_tax == line_total)
    INV_004 = "INV-004"  # Line-Level Tax Recalculation & Rounding Consistency
    INV_005 = "INV-005"  # Document Header Arithmetic (subtotal - discount + tax == grand_total)
    INV_006 = "INV-006"  # Tax Component Sub-Aggregation Identity (sum tax components == tax total)
    INV_007 = "INV-007"  # Statutory Tax Identifier Presence & Applicability Gating
    INV_008 = "INV-008"  # Sign Consistency Invariant (Refunds / Credit Notes vs Invoices)
    INV_009 = "INV-009"  # Commercial Discount Allocation Engine (7-step largest remainder)
    INV_010 = "INV-010"  # Auditor Override Evaluation Engine


class InvariantEvaluationResult(BaseModel):
    """
    Immutable evaluation record for an accounting invariant.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    invariant_id: InvariantId = Field(..., description="Canonical invariant identifier")
    outcome: InvariantOutcomeEnum = Field(..., description="Evaluation outcome")
    severity: InvariantSeverityEnum = Field(default=InvariantSeverityEnum.ERROR, description="Failure severity")
    observed_value: Optional[Decimal] = Field(default=None, description="Observed value from document")
    expected_value: Optional[Decimal] = Field(default=None, description="Calculated expected value")
    delta: Optional[Decimal] = Field(default=None, description="Signed delta (observed - expected)")
    tolerance: Decimal = Field(default=Decimal("0.00"), description="Permitted absolute divergence tolerance")
    diagnostic_code: Optional[str] = Field(default=None, description="Error or diagnostic identifier")
    diagnostic_message: Optional[str] = Field(default=None, description="Human-readable explanation")
    context_metadata: Dict[str, Any] = Field(default_factory=dict, description="Diagnostic context metadata")

    @field_validator("delta")
    @classmethod
    def validate_delta_consistency(cls, v: Optional[Decimal], info: Any) -> Optional[Decimal]:
        obs = info.data.get("observed_value")
        exp = info.data.get("expected_value")
        if v is not None:
            if obs is None or exp is None:
                raise ValueError("delta cannot be populated when observed_value or expected_value is missing")
            # Verify delta calculation consistency: delta == observed - expected
            computed = obs - exp
            if abs(v - computed) > Decimal("0.0001"):
                raise ValueError(f"delta {v} inconsistent with observed {obs} - expected {exp} = {computed}")
        return v


# ---------------------------------------------------------------------------
# Financial Policy Contracts
# ---------------------------------------------------------------------------

class ThresholdCombinationRule(str, Enum):
    """Logical combination rule for absolute and percentage thresholds."""
    AND = "AND"   # Hard block iff (pct_delta > pct_thresh) AND (|delta| > abs_thresh)
    OR = "OR"     # Hard block iff (pct_delta > pct_thresh) OR (|delta| > abs_thresh)


class FinancialOverrideThresholdPolicy(BaseModel):
    """
    Versioned financial override threshold policy governing auditor discretion.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    policy_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    organization_id: uuid.UUID = Field(...)
    workspace_id: Optional[uuid.UUID] = Field(default=None, description="None = Org-wide default")
    document_type: str = Field(default="ALL", description="COMMERCIAL_INVOICE, CREDIT_NOTE, etc.")
    invariant_id: str = Field(default="ALL_MONETARY", description="INV-001, INV-003, or ALL_MONETARY")
    severity: InvariantSeverityEnum = Field(default=InvariantSeverityEnum.ERROR)
    currency_code: str = Field(description="ISO 4217 currency code, e.g. USD, EUR, GBP")
    absolute_threshold: Decimal = Field(gt=Decimal("0.00"), description="Currency major units")
    percentage_threshold: Decimal = Field(gt=Decimal("0.00"), description="Percentage, e.g. Decimal('5.0') for 5.0%")
    combination_rule: ThresholdCombinationRule = Field(default=ThresholdCombinationRule.AND)
    version_tag: str = Field(default="v2026.1")
    effective_from: datetime = Field(...)
    effective_to: Optional[datetime] = Field(default=None)
    approved_by: uuid.UUID = Field(description="User ID with ORGANIZATION_ADMIN or CFO role")
    approval_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OverrideExceptionRecord(BaseModel):
    """
    Audit record unlocking document approval eligibility for an invariant failure
    without modifying underlying mathematical invariant truth.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    exception_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    document_id: uuid.UUID = Field(...)
    invariant_id: InvariantId = Field(...)
    initiator_id: uuid.UUID = Field(description="Principal 1: WORKSPACE_ADMIN")
    approver_id: Optional[uuid.UUID] = Field(default=None, description="Principal 2: ORGANIZATION_ADMIN")
    initiated_at: datetime = Field(...)
    approved_at: Optional[datetime] = Field(default=None)
    expires_at: datetime = Field(description="Initiated_at + 48h signature window")
    exception_lifetime_expires_at: Optional[datetime] = Field(default=None, description="Approved_at + 30 days")
    is_active: bool = Field(default=False)
    justification_notes: str = Field(..., min_length=10)
    revoked_at: Optional[datetime] = Field(default=None)
    invalidation_reason: Optional[str] = Field(default=None)


class RetentionJurisdiction(str, Enum):
    """Authoritative legal jurisdictions for regulatory document retention."""
    GERMANY_HGB_GOBD = "GERMANY_HGB_GOBD"       # 10 years (HGB §257, AO §147)
    FRANCE_CGI = "FRANCE_CGI"                   # 10 years (Code de commerce L123-22)
    SWITZERLAND_CO = "SWITZERLAND_CO"           # 10 years (Code of Obligations Art 958f)
    UNITED_STATES_IRS = "UNITED_STATES_IRS"     # 7 years (IRC §6001, 26 CFR 1.6001-1)
    UNITED_KINGDOM_HMRC = "UNITED_KINGDOM_HMRC" # 6 years (VAT Act 1994 s 58)
    AUSTRALIA_ATO = "AUSTRALIA_ATO"             # 5 years (TAA 1953)
    SINGAPORE_IRAS = "SINGAPORE_IRAS"           # 5 years (GST Act s 87)
    CUSTOM = "CUSTOM"


class RegulatoryRetentionPolicy(BaseModel):
    """
    Jurisdiction-aware regulatory retention policy governing WORM storage.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    policy_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    organization_id: uuid.UUID = Field(...)
    jurisdiction: RetentionJurisdiction = Field(...)
    document_classification: str = Field(description="TAX_INVOICE, COMMERCIAL_CONTRACT, TRANSIENT_LOG")
    retention_period_years: int = Field(ge=1, le=50)
    legal_hold_active: bool = Field(default=False)
    legal_hold_identifier: Optional[str] = Field(default=None)
    gdpr_data_minimization_purged: bool = Field(default=False)
    version_tag: str = Field(default="v2026.1")
    effective_from: date = Field(...)
    approved_by: uuid.UUID = Field(description="Authorized CFO or General Counsel User ID")
    approved_authority: str = Field(description="Resolution or compliance document ref")


# ---------------------------------------------------------------------------
# Statutory Jurisdiction and Tax Contracts
# ---------------------------------------------------------------------------

class TaxRegimeType(str, Enum):
    """Statutory tax regime classifications."""
    EU_VAT = "EU_VAT"
    UK_VAT = "UK_VAT"
    US_SALES_TAX = "US_SALES_TAX"
    CANADIAN_GST_HST = "CANADIAN_GST_HST"
    SWISS_MWST = "SWISS_MWST"
    AUSTRALIAN_GST = "AUSTRALIAN_GST"
    GULF_GCC_VAT = "GULF_GCC_VAT"
    UNKNOWN = "UNKNOWN"


class TransactionClassification(str, Enum):
    """Transaction typology determining tax liability and ID requirements."""
    DOMESTIC_B2B = "DOMESTIC_B2B"
    DOMESTIC_B2C = "DOMESTIC_B2C"
    INTRA_COMMUNITY_SUPPLY = "INTRA_COMMUNITY_SUPPLY"
    CROSS_BORDER_EXPORT = "CROSS_BORDER_EXPORT"
    REVERSE_CHARGE = "REVERSE_CHARGE"
    EXEMPT_FINANCIAL = "EXEMPT_FINANCIAL"
    UNKNOWN = "UNKNOWN"


class TaxIdRequirementStatus(str, Enum):
    """Statutory mandate status for supplier and customer tax registration IDs."""
    MANDATORY_SUPPLIER_ONLY = "MANDATORY_SUPPLIER_ONLY"
    MANDATORY_CUSTOMER_ONLY = "MANDATORY_CUSTOMER_ONLY"
    MANDATORY_BOTH = "MANDATORY_BOTH"
    CONDITIONAL_REVERSE_CHARGE = "CONDITIONAL_REVERSE_CHARGE"
    EXEMPT_BELOW_THRESHOLD = "EXEMPT_BELOW_THRESHOLD"
    NOT_REQUIRED_IN_JURISDICTION = "NOT_REQUIRED_IN_JURISDICTION"
    UNRESOLVED = "UNRESOLVED"


class TaxJurisdictionResolutionResult(BaseModel):
    """
    Contract resolving applicable statutory tax regime and rounding constraints.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    jurisdiction_code: str = Field(description="ISO 3166-1 alpha-2 country code, e.g. DE, GB, US")
    tax_regime: TaxRegimeType = Field(...)
    transaction_classification: TransactionClassification = Field(...)
    place_of_supply: Optional[str] = Field(default=None)
    rule_identifier: Optional[str] = Field(default=None, description="e.g. DE-GoBD-VAT-2024v1")
    statutory_rule_version: Optional[str] = Field(default=None)
    tax_point_date: Optional[date] = Field(default=None)
    effective_statute_date: Optional[date] = Field(default=None)
    tax_id_requirement_status: TaxIdRequirementStatus = Field(default=TaxIdRequirementStatus.UNRESOLVED)
    supplier_tax_id_mandatory: bool = Field(default=False)
    customer_tax_id_mandatory: bool = Field(default=False)
    statutory_discretion_permitted: bool = Field(default=False)
    supporting_evidence_references: Tuple[str, ...] = Field(default_factory=tuple)
    resolution_status: str = Field(description="RESOLVED or UNRESOLVED")
    unresolved_reasons: Tuple[str, ...] = Field(default_factory=tuple)
