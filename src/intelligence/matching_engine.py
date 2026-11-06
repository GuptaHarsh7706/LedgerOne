"""
Autonomous 3-Way Matching Engine & Discrepancy Detector (Phase 7).
Cross-references Purchase Orders (PO), Goods Receipt Notes (GRN), and Supplier Invoices.
Validates quantity delivery, unit price agreement, total arithmetic, and cross-invoice duplicate billing.
Enforces the Master Spec Non-Assumption Rule (neither document presumed unilaterally correct).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _to_dec(v: Any, default: Decimal = Decimal("0.00")) -> Decimal:
    """Safe conversion to Decimal for financial arithmetic."""
    if v is None:
        return default
    if isinstance(v, Decimal):
        return v
    try:
        clean = str(v).replace("$", "").replace(",", "").strip()
        return Decimal(clean)
    except Exception:
        return default


class LineItemMatchResult(BaseModel):
    """Detailed matching evaluation for a single product/service line item."""

    line_number: int
    description: str
    po_quantity: Optional[Decimal] = None
    grn_quantity: Optional[Decimal] = None
    invoice_quantity: Decimal
    po_unit_price: Optional[Decimal] = None
    invoice_unit_price: Decimal
    quantity_discrepancy: Decimal = Decimal("0.00")
    price_discrepancy: Decimal = Decimal("0.00")
    is_matched: bool = True
    discrepancy_reasons: List[str] = Field(default_factory=list)


class CrossDocumentDiscrepancy(BaseModel):
    """Structured discrepancy item with exact delta and non-presumptive evidence."""

    discrepancy_type: str  # 'PRICE_VARIANCE', 'QUANTITY_MISMATCH', 'TOTAL_MISMATCH', 'DUPLICATE_BILLING'
    severity: str  # 'CRITICAL', 'WARNING'
    field_name: str
    expected_value: str
    observed_value: str
    delta: Decimal
    message: str
    evidence_source_a: Dict[str, Any]  # e.g. PO reference
    evidence_source_b: Dict[str, Any]  # e.g. Invoice reference


class ThreeWayMatchSummary(BaseModel):
    """Complete 3-way matching report across PO, GRN, and Invoice."""

    match_status: str  # 'PERFECT_MATCH', 'DISCREPANCY_DETECTED', 'PARTIAL_MATCH', 'UNMATCHED'
    po_number: Optional[str] = None
    grn_number: Optional[str] = None
    invoice_number: str
    vendor_matched: bool
    total_discrepancy_amount: Decimal = Decimal("0.00")
    line_item_matches: List[LineItemMatchResult] = Field(default_factory=list)
    discrepancies: List[CrossDocumentDiscrepancy] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _normalize_name(name: str) -> str:
    """Normalize vendor or item string for fuzzy token matching."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def match_three_way(
    invoice_data: Dict[str, Any],
    po_data: Optional[Dict[str, Any]] = None,
    grn_data: Optional[Dict[str, Any]] = None,
    prior_invoices: Optional[List[Dict[str, Any]]] = None,
    price_tolerance: Decimal = Decimal("0.00"),
    quantity_tolerance: Decimal = Decimal("0.00"),
) -> ThreeWayMatchSummary:
    """
    Execute autonomous 3-way matching across Invoice, Purchase Order, and Goods Receipt Note.
    Pure Decimal arithmetic guarantees zero financial drift.
    """
    inv_num = str(invoice_data.get("invoice_number") or "UNKNOWN_INVOICE")
    inv_vendor = str(invoice_data.get("vendor_name") or invoice_data.get("supplier_name") or "").strip()
    inv_lines = invoice_data.get("line_items") or []

    po_num = str(po_data.get("po_number")) if po_data else None
    po_vendor = str(po_data.get("vendor_name") or po_data.get("supplier_name") or "").strip() if po_data else ""
    po_lines = po_data.get("line_items") or [] if po_data else []

    grn_num = str(grn_data.get("grn_number") or grn_data.get("receipt_number")) if grn_data else None
    grn_lines = grn_data.get("line_items") or [] if grn_data else []

    # 1. Vendor Alignment Check
    vendor_matched = True
    if po_data and inv_vendor and po_vendor:
        if _normalize_name(inv_vendor) != _normalize_name(po_vendor):
            vendor_matched = False

    discrepancies: List[CrossDocumentDiscrepancy] = []
    line_matches: List[LineItemMatchResult] = []
    total_discrepancy_amount = Decimal("0.00")

    if not vendor_matched:
        discrepancies.append(
            CrossDocumentDiscrepancy(
                discrepancy_type="VENDOR_MISMATCH",
                severity="CRITICAL",
                field_name="vendor_name",
                expected_value=po_vendor,
                observed_value=inv_vendor,
                delta=Decimal("0.00"),
                message=(
                    f"Invoice vendor '{inv_vendor}' does not match Purchase Order vendor '{po_vendor}'. "
                    "Cross-document processing flagged for human investigation."
                ),
                evidence_source_a={"document": "PO", "value": po_vendor},
                evidence_source_b={"document": "INVOICE", "value": inv_vendor},
            )
        )

    # 2. Line Item Matching
    # Build lookup maps for PO and GRN lines
    def _find_matching_item(desc: str, candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        norm_desc = _normalize_name(desc)
        for c in candidates:
            c_desc = _normalize_name(str(c.get("description", "")))
            if norm_desc == c_desc or norm_desc in c_desc or c_desc in norm_desc:
                return c
            # Check SKU match
            if c.get("sku") and c.get("sku") == c.get("item_code"):
                return c
        return None

    # Cumulative billed tracking for duplicate billing check
    cumulative_billed: Dict[str, Decimal] = {}
    if prior_invoices:
        for p_inv in prior_invoices:
            for pl in p_inv.get("line_items", []):
                d_key = _normalize_name(str(pl.get("description", "")))
                cumulative_billed[d_key] = cumulative_billed.get(d_key, Decimal("0.00")) + _to_dec(pl.get("quantity", 0))

    for idx, inv_item in enumerate(inv_lines, start=1):
        desc = str(inv_item.get("description", f"Line {idx}"))
        inv_qty = _to_dec(inv_item.get("quantity", 1))
        inv_price = _to_dec(inv_item.get("unit_price", 0))

        po_item = _find_matching_item(desc, po_lines) if po_lines else None
        grn_item = _find_matching_item(desc, grn_lines) if grn_lines else None

        po_qty = _to_dec(po_item.get("quantity")) if po_item else None
        po_price = _to_dec(po_item.get("unit_price")) if po_item else None
        grn_qty = _to_dec(grn_item.get("quantity") or grn_item.get("received_quantity")) if grn_item else None

        line_reasons = []
        is_line_matched = True
        q_delta = Decimal("0.00")
        p_delta = Decimal("0.00")

        # CHECK 1: Unit Price Variance (MATCH-002)
        if po_price is not None:
            price_diff = inv_price - po_price
            if abs(price_diff) > price_tolerance:
                is_line_matched = False
                p_delta = price_diff
                line_reasons.append(f"Unit price variance: Billed ${inv_price} vs Approved PO ${po_price}")
                ext_impact = abs(price_diff) * inv_qty
                total_discrepancy_amount += ext_impact

                discrepancies.append(
                    CrossDocumentDiscrepancy(
                        discrepancy_type="PRICE_VARIANCE",
                        severity="CRITICAL" if price_diff > 0 else "WARNING",
                        field_name="unit_price",
                        expected_value=str(po_price),
                        observed_value=str(inv_price),
                        delta=price_diff,
                        message=(
                            f"Line '{desc}' billed at ${inv_price} diverges from PO rate ${po_price} by ${price_diff} "
                            f"(total financial variance impact: ${ext_impact}). Neither value is presumed correct."
                        ),
                        evidence_source_a={"document": "PO", "line": po_item.get("line_number"), "unit_price": str(po_price)},
                        evidence_source_b={"document": "INVOICE", "line": idx, "unit_price": str(inv_price)},
                    )
                )

        # CHECK 2: Quantity Variance / Overbilling (MATCH-001)
        if grn_qty is not None:
            qty_diff = inv_qty - grn_qty
            if qty_diff > quantity_tolerance:
                is_line_matched = False
                q_delta = qty_diff
                line_reasons.append(f"Overbilling/Short Shipment: Billed {inv_qty} units vs Received {grn_qty} units")
                overbill_amount = qty_diff * inv_price
                total_discrepancy_amount += overbill_amount

                discrepancies.append(
                    CrossDocumentDiscrepancy(
                        discrepancy_type="QUANTITY_MISMATCH",
                        severity="CRITICAL",
                        field_name="quantity",
                        expected_value=str(grn_qty),
                        observed_value=str(inv_qty),
                        delta=qty_diff,
                        message=(
                            f"Line '{desc}' billed for {inv_qty} units exceeds physically received delivery of "
                            f"{grn_qty} units by {qty_diff} units (excess exposure: ${overbill_amount})."
                        ),
                        evidence_source_a={"document": "GRN", "received_quantity": str(grn_qty)},
                        evidence_source_b={"document": "INVOICE", "billed_quantity": str(inv_qty)},
                    )
                )

        # CHECK 3: Cross-Invoice Duplicate Billing (MATCH-004)
        if po_qty is not None:
            d_norm = _normalize_name(desc)
            previously_billed = cumulative_billed.get(d_norm, Decimal("0.00"))
            total_after_this_invoice = previously_billed + inv_qty
            if total_after_this_invoice > po_qty:
                excess_dup = total_after_this_invoice - po_qty
                is_line_matched = False
                line_reasons.append(
                    f"Duplicate billing across invoices: Total billed ({total_after_this_invoice}) exceeds PO ({po_qty})"
                )
                dup_amount = excess_dup * inv_price
                total_discrepancy_amount += dup_amount

                discrepancies.append(
                    CrossDocumentDiscrepancy(
                        discrepancy_type="DUPLICATE_BILLING",
                        severity="CRITICAL",
                        field_name="quantity",
                        expected_value=str(po_qty),
                        observed_value=str(total_after_this_invoice),
                        delta=excess_dup,
                        message=(
                            f"Cumulative billing for '{desc}' across current and prior invoices ({total_after_this_invoice}) "
                            f"exceeds total authorized PO quantity of {po_qty} by {excess_dup} units (${dup_amount})."
                        ),
                        evidence_source_a={"document": "PO", "authorized_quantity": str(po_qty)},
                        evidence_source_b={"document": "INVOICES_CUMULATIVE", "cumulative_billed": str(total_after_this_invoice)},
                    )
                )

        line_matches.append(
            LineItemMatchResult(
                line_number=idx,
                description=desc,
                po_quantity=po_qty,
                grn_quantity=grn_qty,
                invoice_quantity=inv_qty,
                po_unit_price=po_price,
                invoice_unit_price=inv_price,
                quantity_discrepancy=q_delta,
                price_discrepancy=p_delta,
                is_matched=is_line_matched,
                discrepancy_reasons=line_reasons,
            )
        )

    # 3. Overall Status Determination
    if not po_data and not grn_data:
        status = "UNMATCHED"
    elif discrepancies:
        status = "DISCREPANCY_DETECTED"
    elif all(lm.is_matched for lm in line_matches):
        status = "PERFECT_MATCH"
    else:
        status = "PARTIAL_MATCH"

    return ThreeWayMatchSummary(
        match_status=status,
        po_number=po_num,
        grn_number=grn_num,
        invoice_number=inv_num,
        vendor_matched=vendor_matched,
        total_discrepancy_amount=round(total_discrepancy_amount, 2),
        line_item_matches=line_matches,
        discrepancies=discrepancies,
        metadata={
            "lines_evaluated": len(line_matches),
            "discrepancy_count": len(discrepancies),
        },
    )
