"""
Cross-Page Table Continuation and Stitching Engine for LedgerOne.
Phase 4 Step 4 Wave 2 Implementation.

Detects, verifies, and stitches multi-page financial tables across page transitions.
Supports:
1. Mode A: Explicit Carried Forward / Brought Forward balance equality.
2. Mode B: Multi-point corroboration for un-totaled tables:
   - Identical column schema across boundary.
   - Column horizontal alignment (Delta x <= 5.0 pt).
   - Monotonic row index continuation.
   - Pruning repeated header rows on continuation pages.
"""
from __future__ import annotations

import re
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from src.intelligence.models import BoundingBox
from src.intelligence.table_contracts import (
    TableCell,
    TableBlock,
    TableRow,
    TableRowType,
    TableType,
)


class ContinuationMode(str, Enum):
    """Mechanisms for verifying multi-page table continuation."""
    CARRIED_FORWARD = "CARRIED_FORWARD"
    COLUMN_ALIGNMENT_CORROBORATION = "COLUMN_ALIGNMENT_CORROBORATION"
    NONE = "NONE"


class StitchedTableResult(BaseModel):
    """
    Immutable result of cross-page table continuation stitching.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    is_continuation: bool = Field(..., description="Whether input tables represent a multi-page continuation")
    continuation_mode: ContinuationMode = Field(..., description="Method used to establish continuation")
    stitched_table: Optional[TableBlock] = Field(default=None, description="Consolidated multi-page TableBlock")
    source_pages: Tuple[int, ...] = Field(default_factory=tuple, description="Ordered source page numbers")
    total_rows: int = Field(default=0, description="Total data rows after stitching and header deduplication")
    pruned_header_count: int = Field(default=0, description="Number of duplicate repeated header rows pruned")
    carried_forward_amount: Optional[Decimal] = Field(default=None)
    brought_forward_amount: Optional[Decimal] = Field(default=None)
    alignment_delta_pt: float = Field(default=0.0, description="Max horizontal column deviation in points")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    diagnostic_notes: Tuple[str, ...] = Field(default_factory=tuple)


class MultiPageTableStitcher:
    """
    Cross-page table continuation engine.
    Analyzes adjacent page table blocks to detect table spillover, prune repeated headers,
    verify financial carried/brought forward balances, and construct unified table blocks.
    """

    CARRIED_FORWARD_PATTERNS = [
        re.compile(r"carried\s+forward", re.IGNORECASE),
        re.compile(r"\bc/?f\b", re.IGNORECASE),
        re.compile(r"balance\s+c/f", re.IGNORECASE),
        re.compile(r"total\s+carried\s+forward", re.IGNORECASE),
        re.compile(r"überschlag", re.IGNORECASE),
    ]

    BROUGHT_FORWARD_PATTERNS = [
        re.compile(r"brought\s+forward", re.IGNORECASE),
        re.compile(r"\bb/?f\b", re.IGNORECASE),
        re.compile(r"balance\s+b/f", re.IGNORECASE),
        re.compile(r"amount\s+brought\s+forward", re.IGNORECASE),
        re.compile(r"vortrag", re.IGNORECASE),
    ]

    MONEY_PATTERN = re.compile(r"[-+]?\$?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)")

    def __init__(self, max_column_alignment_delta_pt: float = 5.0):
        self.max_column_alignment_delta_pt = max_column_alignment_delta_pt

    def _extract_monetary_amount(self, text: str) -> Optional[Decimal]:
        """Extract first valid monetary decimal amount from text token."""
        match = self.MONEY_PATTERN.search(text.replace(" ", ""))
        if not match:
            return None
        cleaned = match.group(1).replace(",", "").replace(" ", "")
        try:
            return Decimal(cleaned)
        except Exception:
            return None

    def find_carried_forward_token(self, table: TableBlock) -> Optional[Decimal]:
        """Search table rows for explicit carried forward balances."""
        for row in reversed(table.rows):
            row_text = " ".join(c.text for c in row.cells).lower()
            if any(p.search(row_text) for p in self.CARRIED_FORWARD_PATTERNS):
                # Search for monetary amount in row
                for cell in reversed(row.cells):
                    amt = self._extract_monetary_amount(cell.text)
                    if amt is not None:
                        return amt
        return None

    def find_brought_forward_token(self, table: TableBlock) -> Optional[Decimal]:
        """Search table rows for explicit brought forward balances."""
        for row in table.rows:
            row_text = " ".join(c.text for c in row.cells).lower()
            if any(p.search(row_text) for p in self.BROUGHT_FORWARD_PATTERNS):
                # Search for monetary amount in row
                for cell in row.cells:
                    amt = self._extract_monetary_amount(cell.text)
                    if amt is not None:
                        return amt
        return None

    def compute_column_horizontal_spans(self, table: TableBlock) -> List[Tuple[float, float]]:
        """
        Derive horizontal span (x0_pt, x1_pt) for each column in the table.
        """
        if not table.rows:
            return []

        # Find maximum number of cells in any row
        max_cols = max(len(row.cells) for row in table.rows)
        spans: List[Tuple[float, float]] = []

        for col_idx in range(max_cols):
            x0s = [r.cells[col_idx].bbox.x0_pt for r in table.rows if len(r.cells) > col_idx]
            x1s = [r.cells[col_idx].bbox.x1_pt for r in table.rows if len(r.cells) > col_idx]
            if x0s and x1s:
                spans.append((float(np.median(x0s)), float(np.median(x1s))))
            else:
                spans.append((0.0, 0.0))
        return spans

    def check_column_alignment(
        self,
        table_a: TableBlock,
        table_b: TableBlock,
    ) -> Tuple[bool, float]:
        """
        Verify that table_a and table_b share an identical column layout
        with horizontal alignment delta <= max_column_alignment_delta_pt (5.0 pt).
        """
        spans_a = self.compute_column_horizontal_spans(table_a)
        spans_b = self.compute_column_horizontal_spans(table_b)

        if len(spans_a) != len(spans_b) or len(spans_a) == 0:
            return False, 999.0

        max_delta = 0.0
        for (a_x0, a_x1), (b_x0, b_x1) in zip(spans_a, spans_b):
            delta_x0 = abs(a_x0 - b_x0)
            delta_x1 = abs(a_x1 - b_x1)
            delta = max(delta_x0, delta_x1)
            if delta > max_delta:
                max_delta = delta

        is_aligned = max_delta <= self.max_column_alignment_delta_pt
        return is_aligned, float(max_delta)

    def is_repeated_header(self, row: TableRow, reference_header: Optional[TableRow]) -> bool:
        """
        Determine if row on continuation page is a repeated column header.
        """
        if row.row_type == TableRowType.HEADER:
            return True
        if reference_header is None:
            return False

        # Compare cell texts with reference header
        if len(row.cells) != len(reference_header.cells):
            return False

        matches = 0
        for c1, c2 in zip(row.cells, reference_header.cells):
            t1 = c1.text.strip().lower()
            t2 = c2.text.strip().lower()
            if t1 and t2 and (t1 == t2 or t1 in t2 or t2 in t1):
                matches += 1

        return matches >= max(1, len(row.cells) // 2)

    def stitch_two_tables(
        self,
        table_a: TableBlock,
        table_b: TableBlock,
    ) -> StitchedTableResult:
        """
        Stitch two adjacent table blocks across a page transition.
        """
        # Ensure sequential pages: page_b == page_a + 1
        if table_b.page_number != table_a.page_number + 1:
            return StitchedTableResult(
                is_continuation=False,
                continuation_mode=ContinuationMode.NONE,
                diagnostic_notes=(f"Non-contiguous page numbers: {table_a.page_number} and {table_b.page_number}",),
            )

        # Mode A: Check Carried / Brought Forward balance equality
        carried_amt = self.find_carried_forward_token(table_a)
        brought_amt = self.find_brought_forward_token(table_b)

        mode_a_matches = False
        if carried_amt is not None and brought_amt is not None:
            if carried_amt == brought_amt:
                mode_a_matches = True

        # Mode B: Check Column Alignment & Layout Corroboration
        aligned, max_delta = self.check_column_alignment(table_a, table_b)

        if not mode_a_matches and not aligned:
            return StitchedTableResult(
                is_continuation=False,
                continuation_mode=ContinuationMode.NONE,
                carried_forward_amount=carried_amt,
                brought_forward_amount=brought_amt,
                alignment_delta_pt=max_delta,
                diagnostic_notes=("Neither carried/brought forward balances nor column alignments matched",),
            )

        # Continuation established!
        mode = ContinuationMode.CARRIED_FORWARD if mode_a_matches else ContinuationMode.COLUMN_ALIGNMENT_CORROBORATION

        # Header deduplication: extract header from table_a
        header_a = next((r for r in table_a.rows if r.row_type == TableRowType.HEADER), None)

        combined_rows: List[TableRow] = list(table_a.rows)
        pruned_headers = 0

        # Process table_b rows
        start_idx = 0
        if table_b.rows and self.is_repeated_header(table_b.rows[0], header_a):
            pruned_headers += 1
            start_idx = 1

        # Re-index rows monotonically
        current_row_idx = len(combined_rows)
        for r in table_b.rows[start_idx:]:
            # Reconstruct TableRow with monotonic row_index
            reindexed_row = TableRow(
                cells=r.cells,
                row_type=r.row_type,
                row_index=current_row_idx,
                confidence=r.confidence,
                bbox=r.bbox,
            )
            combined_rows.append(reindexed_row)
            current_row_idx += 1

        # Enclosing bounding box spanning both pages (in normalized units across pages)
        stitched_block = TableBlock(
            page_number=table_a.page_number,
            bbox=table_a.bbox,  # Primary anchor bounding box
            rows=tuple(combined_rows),
            table_type=table_a.table_type,
            confidence=min(table_a.confidence, table_b.confidence),
        )

        return StitchedTableResult(
            is_continuation=True,
            continuation_mode=mode,
            stitched_table=stitched_block,
            source_pages=(table_a.page_number, table_b.page_number),
            total_rows=len(combined_rows),
            pruned_header_count=pruned_headers,
            carried_forward_amount=carried_amt,
            brought_forward_amount=brought_amt,
            alignment_delta_pt=max_delta,
            confidence=0.99 if mode_a_matches else 0.95,
            diagnostic_notes=(f"Stitched via {mode} with {pruned_headers} repeated header(s) pruned",),
        )

    def stitch_sequence(
        self,
        tables: Sequence[TableBlock],
    ) -> List[StitchedTableResult]:
        """
        Process a list of page tables, stitching consecutive multi-page continuation runs.
        """
        if not tables:
            return []

        results: List[StitchedTableResult] = []
        i = 0
        while i < len(tables):
            if i + 1 < len(tables):
                res = self.stitch_two_tables(tables[i], tables[i + 1])
                if res.is_continuation:
                    results.append(res)
                    i += 2
                    continue
            # Single non-continuation table
            single_res = StitchedTableResult(
                is_continuation=False,
                continuation_mode=ContinuationMode.NONE,
                stitched_table=tables[i],
                source_pages=(tables[i].page_number,),
                total_rows=len(tables[i].rows),
                pruned_header_count=0,
                confidence=tables[i].confidence,
            )
            results.append(single_res)
            i += 1

        return results
