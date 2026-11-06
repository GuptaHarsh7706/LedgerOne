"""
Pydantic schemas and data transfer objects for Human-in-the-Loop (HITL) Verification & Reviewer Workflows (Phase 5).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field


class FieldCorrectionRequest(BaseModel):
    """Payload for correcting an individual extracted scalar field."""
    field_name: str = Field(..., min_length=1, max_length=100, description="Canonical field identifier")
    corrected_value_raw: Optional[str] = Field(None, description="Raw OCR or textual string value")
    corrected_value_normalized: Optional[Any] = Field(None, description="Normalized typed value (e.g. Decimal, string, ISO date)")
    bounding_box: Optional[Dict[str, float]] = Field(None, description="Optional refined spatial bounding box")
    comment: Optional[str] = Field(None, max_length=500, description="Reviewer justification or note for the correction")


class LineItemCorrectionRequest(BaseModel):
    """Payload for correcting a cell or field within the extracted line items table."""
    line_item_index: int = Field(..., ge=0, description="Zero-based index of the target line item")
    field_name: str = Field(..., min_length=1, max_length=100, description="Column identifier (e.g. quantity, unit_price, subtotal, description)")
    corrected_value: Any = Field(..., description="Corrected value for the specified line item field")
    comment: Optional[str] = Field(None, max_length=500, description="Reviewer rationale for tabular adjustment")


class InvariantOverrideRequest(BaseModel):
    """Payload for applying an auditor override to an allowable failing accounting invariant."""
    invariant_id: str = Field(..., min_length=3, max_length=50, description="Target invariant code (e.g. INV-001, INV-004, INV-006)")
    override_rationale: str = Field(
        ...,
        min_length=10,
        max_length=1000,
        description="Mandatory compliance justification explaining why the arithmetic discrepancy is permitted",
    )


class DocumentRejectRequest(BaseModel):
    """Payload for formally rejecting an ingested document."""
    rejection_reason: str = Field(
        ...,
        min_length=5,
        max_length=1000,
        description="Mandatory explanation for document rejection (e.g. unreadable scan, fraudulent document)",
    )


class DocumentReopenRequest(BaseModel):
    """Payload for reopening a rejected or archived document for re-review."""
    reason: Optional[str] = Field(None, max_length=500, description="Operational justification for reopening")


class ExtractedFieldReviewItem(BaseModel):
    """Representation of an extracted scalar field in the reviewer workspace."""
    id: uuid.UUID
    field_name: str
    field_value_raw: Optional[str] = None
    field_value_normalized: Optional[Any] = None
    confidence: float
    page_number: Optional[int] = None
    bounding_box: Optional[Dict[str, Any]] = None
    is_verified: bool = False
    verified_value: Optional[Any] = None
    verified_by_user_id: Optional[uuid.UUID] = None
    verified_at: Optional[datetime] = None


class InvariantReviewItem(BaseModel):
    """Status of an individual accounting invariant rule on the document."""
    invariant_id: str
    name: str
    outcome: str  # PASSED, FAILED, NOT_EVALUABLE, WARNING
    message: Optional[str] = None
    discrepancy: Optional[str] = None
    is_overridable: bool = True
    is_overridden: bool = False
    override_rationale: Optional[str] = None
    overridden_by: Optional[str] = None
    overridden_at: Optional[datetime] = None


class ReviewQueueItemResponse(BaseModel):
    """Compact summary of a document pending human verification."""
    id: uuid.UUID
    organization_id: uuid.UUID
    workspace_id: uuid.UUID
    filename: str
    status: str
    category: Optional[str] = None
    created_at: datetime
    mean_confidence: Optional[float] = None
    has_failed_invariants: bool = False
    failed_invariants_count: int = 0
    assigned_reviewer_id: Optional[uuid.UUID] = None


class DocumentReviewDetailResponse(BaseModel):
    """Complete document verification and review package."""
    document: Dict[str, Any]
    preview_url: Optional[str] = None
    scalar_fields: List[ExtractedFieldReviewItem]
    line_items_bundle: Optional[Dict[str, Any]] = None
    invariants: List[InvariantReviewItem]
    sod_metadata: Dict[str, Any]
    recent_audit_events: List[Dict[str, Any]]
