"""
Document Version Comparison & Diffing Engine (Phase 7).
Compares two documents or versions (e.g. revision v1.0 vs v2.0 or Invoice vs Credit Note).
Computes scalar field variances, line item additions/modifications, and net financial drift.
"""
from __future__ import annotations

from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _to_dec(v: Any) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        clean = str(v).replace("$", "").replace(",", "").strip()
        return Decimal(clean)
    except Exception:
        return None


class ScalarFieldDiff(BaseModel):
    """Variance evaluation between two versions of a scalar field."""

    field_name: str
    doc_a_value: Optional[str] = None
    doc_b_value: Optional[str] = None
    diff_type: str  # 'ADDED', 'REMOVED', 'MODIFIED', 'IDENTICAL'
    delta: Optional[Decimal] = None


class LineItemDiff(BaseModel):
    """Variance evaluation between two versions of a tabular row item."""

    line_number: int
    description: str
    doc_a_data: Optional[Dict[str, Any]] = None
    doc_b_data: Optional[Dict[str, Any]] = None
    diff_type: str  # 'ADDED', 'REMOVED', 'MODIFIED', 'IDENTICAL'
    variance_details: List[str] = Field(default_factory=list)


class DocumentComparisonResult(BaseModel):
    """Comprehensive comparison report across two documents or contract versions."""

    doc_a_id: str
    doc_b_id: str
    has_differences: bool
    net_financial_variance: Decimal = Decimal("0.00")
    scalar_diffs: List[ScalarFieldDiff] = Field(default_factory=list)
    line_item_diffs: List[LineItemDiff] = Field(default_factory=list)
    summary: str = ""


def compare_documents(
    doc_a_id: str,
    doc_a_fields: Dict[str, Any],
    doc_a_lines: List[Dict[str, Any]],
    doc_b_id: str,
    doc_b_fields: Dict[str, Any],
    doc_b_lines: List[Dict[str, Any]],
) -> DocumentComparisonResult:
    """Compare two documents or versions and produce a granular variance ledger."""
    scalar_diffs: List[ScalarFieldDiff] = []
    has_diff = False
    net_variance = Decimal("0.00")

    # 1. Compare Scalar Fields
    all_keys = sorted(set(doc_a_fields.keys()) | set(doc_b_fields.keys()))
    for k in all_keys:
        if k in ("line_items", "invariants", "table", "raw_text"):
            continue

        val_a = str(doc_a_fields.get(k)) if k in doc_a_fields and doc_a_fields[k] is not None else None
        val_b = str(doc_b_fields.get(k)) if k in doc_b_fields and doc_b_fields[k] is not None else None

        if val_a is None and val_b is not None:
            has_diff = True
            scalar_diffs.append(ScalarFieldDiff(field_name=k, doc_a_value=None, doc_b_value=val_b, diff_type="ADDED"))
        elif val_a is not None and val_b is None:
            has_diff = True
            scalar_diffs.append(ScalarFieldDiff(field_name=k, doc_a_value=val_a, doc_b_value=None, diff_type="REMOVED"))
        elif val_a != val_b:
            has_diff = True
            dec_a = _to_dec(val_a)
            dec_b = _to_dec(val_b)
            delta = (dec_b - dec_a) if dec_a is not None and dec_b is not None else None
            if k in ("total_amount", "gross_total", "subtotal") and delta is not None:
                net_variance += delta
            scalar_diffs.append(
                ScalarFieldDiff(
                    field_name=k,
                    doc_a_value=val_a,
                    doc_b_value=val_b,
                    diff_type="MODIFIED",
                    delta=delta,
                )
            )
        else:
            scalar_diffs.append(
                ScalarFieldDiff(field_name=k, doc_a_value=val_a, doc_b_value=val_b, diff_type="IDENTICAL")
            )

    # 2. Compare Line Items Table
    line_item_diffs: List[LineItemDiff] = []
    max_lines = max(len(doc_a_lines), len(doc_b_lines))

    for idx in range(max_lines):
        item_a = doc_a_lines[idx] if idx < len(doc_a_lines) else None
        item_b = doc_b_lines[idx] if idx < len(doc_b_lines) else None

        if item_a is None and item_b is not None:
            has_diff = True
            desc = str(item_b.get("description", f"Line {idx+1}"))
            line_item_diffs.append(
                LineItemDiff(
                    line_number=idx + 1,
                    description=desc,
                    doc_a_data=None,
                    doc_b_data=item_b,
                    diff_type="ADDED",
                    variance_details=["Row added in document B"],
                )
            )
        elif item_a is not None and item_b is None:
            has_diff = True
            desc = str(item_a.get("description", f"Line {idx+1}"))
            line_item_diffs.append(
                LineItemDiff(
                    line_number=idx + 1,
                    description=desc,
                    doc_a_data=item_a,
                    doc_b_data=None,
                    diff_type="REMOVED",
                    variance_details=["Row removed in document B"],
                )
            )
        elif item_a is not None and item_b is not None:
            desc = str(item_b.get("description") or item_a.get("description", f"Line {idx+1}"))
            variances = []
            for check_col in ("quantity", "unit_price", "subtotal", "tax_amount", "gross_total"):
                va = _to_dec(item_a.get(check_col))
                vb = _to_dec(item_b.get(check_col))
                if va != vb:
                    variances.append(f"{check_col}: {va} -> {vb}")

            if variances:
                has_diff = True
                line_item_diffs.append(
                    LineItemDiff(
                        line_number=idx + 1,
                        description=desc,
                        doc_a_data=item_a,
                        doc_b_data=item_b,
                        diff_type="MODIFIED",
                        variance_details=variances,
                    )
                )
            else:
                line_item_diffs.append(
                    LineItemDiff(
                        line_number=idx + 1,
                        description=desc,
                        doc_a_data=item_a,
                        doc_b_data=item_b,
                        diff_type="IDENTICAL",
                    )
                )

    summary_msg = (
        f"Comparison complete between Doc A ({doc_a_id}) and Doc B ({doc_b_id}). "
        f"Identified {len([s for s in scalar_diffs if s.diff_type != 'IDENTICAL'])} scalar modifications "
        f"and {len([l for l in line_item_diffs if l.diff_type != 'IDENTICAL'])} line item variances. "
        f"Net financial variance: ${net_variance}."
        if has_diff
        else "Both documents are mathematically and semantically identical across all extracted fields."
    )

    return DocumentComparisonResult(
        doc_a_id=doc_a_id,
        doc_b_id=doc_b_id,
        has_differences=has_diff,
        net_financial_variance=round(net_variance, 2),
        scalar_diffs=scalar_diffs,
        line_item_diffs=line_item_diffs,
        summary=summary_msg,
    )
