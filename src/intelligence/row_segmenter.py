"""
Row Segmentation and Line-Item Extraction Engine for LedgerOne.
Phase 4 Step 4 Wave 3 Implementation.

Segments table cells and visual rows, performs multi-line description cell wrapping,
classifies semantic row types, and constructs strongly typed, immutable LineItemField
instances with pure Decimal arithmetic.
"""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel, ConfigDict, Field

from src.intelligence.header_classifier import (
    ColumnHeaderClassifier,
    ColumnRole,
    HeaderClassificationResult,
)
from src.intelligence.models import BoundingBox
from src.intelligence.table_contracts import (
    LineItemField,
    TableCell,
    TableBlock,
    TableRow,
    TableRowType,
    TableType,
)


# ---------------------------------------------------------------------------
# Numeric and Financial Parsing Helpers
# ---------------------------------------------------------------------------

MONEY_REGEX = re.compile(r"[-+]?[$€£]?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+)")
PERCENT_REGEX = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*%")


def parse_monetary_decimal(text: str) -> Optional[Decimal]:
    """Parse monetary string to Decimal, removing symbols, commas, and whitespace."""
    if not text:
        return None
    cleaned = text.strip()
    match = MONEY_REGEX.search(cleaned.replace(" ", ""))
    if not match:
        return None
    num_str = match.group(1).replace(",", "").replace(" ", "")
    try:
        # Check negative indication via parentheses, e.g. ($100.00) or -$100.00
        val = Decimal(num_str)
        if "(" in cleaned and ")" in cleaned:
            val = -abs(val)
        elif "-" in cleaned and not cleaned.startswith("-"):
            # Check if negative sign is somewhere in string
            if "-" in cleaned.split(num_str)[0]:
                val = -abs(val)
        elif cleaned.startswith("-"):
            val = -abs(val)
        return val
    except Exception:
        return None


def parse_percentage_decimal(text: str) -> Optional[Decimal]:
    """Parse percentage string to Decimal (e.g. '19%' -> Decimal('19.0'))."""
    if not text:
        return None
    match = PERCENT_REGEX.search(text)
    if not match:
        return None
    try:
        return Decimal(match.group(1))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Row Segmenter Engine
# ---------------------------------------------------------------------------

class RowSegmenter:
    """
    Layout-aware financial table row segmenter.
    Groups cells into rows, resolves column roles, detects multi-line description wrapping,
    classifies semantic row types, and outputs structured LineItemField records.
    """

    TOTAL_KEYWORDS = [
        re.compile(r"\b(?:grand\s*)?total\b", re.IGNORECASE),
        re.compile(r"\bsubtotal\b", re.IGNORECASE),
        re.compile(r"\bgesamt(?:betrag)?\b", re.IGNORECASE),
        re.compile(r"\bmontant\s*total\b", re.IGNORECASE),
        re.compile(r"\bamount\s*due\b", re.IGNORECASE),
        re.compile(r"\bbalance\s*due\b", re.IGNORECASE),
    ]

    CONTINUATION_KEYWORDS = [
        re.compile(r"carried\s+forward", re.IGNORECASE),
        re.compile(r"brought\s+forward", re.IGNORECASE),
        re.compile(r"\bc/?f\b", re.IGNORECASE),
        re.compile(r"\bb/?f\b", re.IGNORECASE),
        re.compile(r"überschlag", re.IGNORECASE),
        re.compile(r"vortrag", re.IGNORECASE),
    ]

    DISCOUNT_KEYWORDS = [
        re.compile(r"\bdiscount\b", re.IGNORECASE),
        re.compile(r"\brabatt\b", re.IGNORECASE),
        re.compile(r"\bremise\b", re.IGNORECASE),
    ]

    TAX_KEYWORDS = [
        re.compile(r"\bvat\b", re.IGNORECASE),
        re.compile(r"\bmwst\b", re.IGNORECASE),
        re.compile(r"\btva\b", re.IGNORECASE),
        re.compile(r"\btax\s*total\b", re.IGNORECASE),
    ]

    def __init__(
        self,
        vertical_overlap_threshold: float = 0.40,
        header_classifier: Optional[ColumnHeaderClassifier] = None,
    ):
        self.vertical_overlap_threshold = vertical_overlap_threshold
        self.header_classifier = header_classifier or ColumnHeaderClassifier()

    def segment_table_rows(
        self,
        table_block: TableBlock,
    ) -> Tuple[TableBlock, List[LineItemField]]:
        """
        Segment, classify, and extract structured line items from an extracted TableBlock.
        Returns the enriched TableBlock and the list of extracted LineItemField models.
        """
        if not table_block.rows:
            return table_block, []

        raw_rows = list(table_block.rows)

        # 1. Identify Header Row & Classify Columns
        header_row_idx = -1
        col_classifications: List[HeaderClassificationResult] = []

        for idx, row in enumerate(raw_rows):
            # Check if row has header elements
            classifications = self.header_classifier.classify_header_row([c.text for c in row.cells])
            recognized_roles = sum(1 for c in classifications if c.role != ColumnRole.UNKNOWN)
            if recognized_roles >= 2:
                header_row_idx = idx
                col_classifications = classifications
                break

        # If no explicit header recognized, default to first row
        if header_row_idx == -1 and raw_rows:
            header_row_idx = 0
            col_classifications = self.header_classifier.classify_header_row([c.text for c in raw_rows[0].cells])

        # Map column index to recognized ColumnRole
        col_to_role: Dict[int, ColumnRole] = {
            c.col_idx: c.role for c in col_classifications
        }

        # Find column index for DESCRIPTION, QUANTITY, UNIT_PRICE, LINE_TOTAL
        desc_col = next((c for c, r in col_to_role.items() if r == ColumnRole.DESCRIPTION), 1 if len(col_to_role) > 1 else 0)
        qty_col = next((c for c, r in col_to_role.items() if r == ColumnRole.QUANTITY), None)
        price_col = next((c for c, r in col_to_role.items() if r == ColumnRole.UNIT_PRICE), None)
        total_col = next((c for c, r in col_to_role.items() if r == ColumnRole.LINE_TOTAL), None)
        item_code_col = next((c for c, r in col_to_role.items() if r == ColumnRole.ITEM_CODE), None)
        tax_rate_col = next((c for c, r in col_to_role.items() if r == ColumnRole.TAX_RATE), None)

        # 2. Semantic Row Classification & Multi-Line Description Merging
        enriched_rows: List[TableRow] = []
        line_items: List[LineItemField] = []
        line_seq = 1

        for r_idx, row in enumerate(raw_rows):
            if r_idx == header_row_idx:
                # Mark as HEADER
                hdr_row = TableRow(
                    cells=row.cells,
                    row_type=TableRowType.HEADER,
                    row_index=len(enriched_rows),
                    confidence=row.confidence,
                    bbox=row.bbox,
                )
                enriched_rows.append(hdr_row)
                continue

            row_text = " ".join(c.text for c in row.cells)

            # Check special row types
            if any(p.search(row_text) for p in self.CONTINUATION_KEYWORDS):
                row_type = TableRowType.CONTINUATION
            elif any(p.search(row_text) for p in self.TOTAL_KEYWORDS):
                row_type = TableRowType.TOTAL
            elif any(p.search(row_text) for p in self.DISCOUNT_KEYWORDS):
                row_type = TableRowType.DISCOUNT
            elif any(p.search(row_text) for p in self.TAX_KEYWORDS):
                row_type = TableRowType.TAX
            else:
                row_type = TableRowType.DATA

            # Check Multi-Line Wrapped Description Continuation:
            # If current row is classified as DATA or METADATA, but has NO quantity, price, or total,
            # and previous row was a DATA row, merge this row's text into previous row's description!
            has_numeric_financials = False
            for c in row.cells:
                if c.col_idx in (qty_col, price_col, total_col) and parse_monetary_decimal(c.text) is not None:
                    has_numeric_financials = True
                    break

            if (
                not has_numeric_financials
                and row_type == TableRowType.DATA
                and enriched_rows
                and enriched_rows[-1].row_type == TableRowType.DATA
                and line_items
            ):
                # Multi-line wrapped description detected!
                wrapped_text = row_text.strip()
                if wrapped_text:
                    # Update previous line item description
                    prev_item = line_items[-1]
                    new_desc = f"{prev_item.description} {wrapped_text}"
                    merged_tokens = prev_item.raw_tokens + tuple(c.text for c in row.cells)

                    # Reconstruct LineItemField with merged description
                    line_items[-1] = LineItemField(
                        line_number=prev_item.line_number,
                        description=new_desc,
                        line_net=prev_item.line_net,
                        quantity=prev_item.quantity,
                        unit_price=prev_item.unit_price,
                        line_discount=prev_item.line_discount,
                        tax_rate=prev_item.tax_rate,
                        tax_amount=prev_item.tax_amount,
                        line_total=prev_item.line_total,
                        item_code=prev_item.item_code,
                        raw_tokens=merged_tokens,
                        confidence=min(prev_item.confidence, row.confidence),
                        bbox=prev_item.bbox,
                    )
                    # Skip adding as independent row; it was merged into the previous row
                    continue

            # Add as independent row
            table_row = TableRow(
                cells=row.cells,
                row_type=row_type,
                row_index=len(enriched_rows),
                confidence=row.confidence,
                bbox=row.bbox,
            )
            enriched_rows.append(table_row)

            # If row is a DATA row, extract structured LineItemField
            if row_type == TableRowType.DATA:
                # Extract text for description
                desc_text = ""
                for c in row.cells:
                    if c.col_idx == desc_col:
                        desc_text = c.text.strip()
                        break
                if not desc_text and row.cells:
                    desc_text = row.cells[0].text.strip()

                # Extract financials
                qty_val: Optional[Decimal] = None
                price_val: Optional[Decimal] = None
                total_val: Optional[Decimal] = None
                tax_rate_val: Optional[Decimal] = None
                code_val: Optional[str] = None

                for c in row.cells:
                    if qty_col is not None and c.col_idx == qty_col:
                        qty_val = parse_monetary_decimal(c.text)
                    elif price_col is not None and c.col_idx == price_col:
                        price_val = parse_monetary_decimal(c.text)
                    elif total_col is not None and c.col_idx == total_col:
                        total_val = parse_monetary_decimal(c.text)
                    elif tax_rate_col is not None and c.col_idx == tax_rate_col:
                        tax_rate_val = parse_percentage_decimal(c.text)
                    elif item_code_col is not None and c.col_idx == item_code_col:
                        code_val = c.text.strip()

                # Compute line net
                if total_val is not None:
                    line_net = total_val
                elif qty_val is not None and price_val is not None:
                    line_net = qty_val * price_val
                else:
                    line_net = Decimal("0.00")

                item_field = LineItemField(
                    line_number=line_seq,
                    description=desc_text if desc_text else f"Line Item {line_seq}",
                    line_net=line_net,
                    quantity=qty_val,
                    unit_price=price_val,
                    line_discount=Decimal("0.00"),
                    tax_rate=tax_rate_val,
                    tax_amount=None,
                    line_total=total_val,
                    item_code=code_val,
                    raw_tokens=tuple(c.text for c in row.cells),
                    confidence=row.confidence,
                    bbox=row.bbox,
                )
                line_items.append(item_field)
                line_seq += 1

        # Construct updated TableBlock
        enriched_block = TableBlock(
            page_number=table_block.page_number,
            bbox=table_block.bbox,
            rows=tuple(enriched_rows),
            table_type=table_block.table_type,
            confidence=table_block.confidence,
        )

        return enriched_block, line_items
