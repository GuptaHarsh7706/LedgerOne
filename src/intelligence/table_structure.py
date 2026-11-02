"""
Table Structure Extraction Engine.

Extracts table regions, table rows, columns, and individual cells
from bounding boxes and text lines independently of text recognition.
Supports borderless ledgers, multi-column financial schedules,
irregular row heights, and wrapped description cells.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from src.intelligence.models import (
    BoundingBox,
    TableCell,
    TableRow,
    TableColumn,
    TableRegion,
    ReadingOrderRelation,
    TextBlock,
)


class TableStructureExtractor:
    """
    Layout-aware table structure analyzer.
    Groups text elements into discrete rows and columns based on
    geometric projection intervals, vertical overlap, and column gutters.
    """

    def __init__(
        self,
        vertical_overlap_threshold: float = 0.40,
        column_gutter_threshold_pt: float = 8.0,
    ):
        self.vertical_overlap_threshold = vertical_overlap_threshold
        self.column_gutter_threshold_pt = column_gutter_threshold_pt

    def extract_table_region(
        self,
        boxes_and_texts: List[Tuple[BoundingBox, str]],
        region_id: str = "table_1",
        is_borderless: bool = False,
    ) -> TableRegion:
        """
        Analyze a set of bounding boxes and texts to construct a TableRegion
        with explicit rows, columns, and grid cells.
        """
        if not boxes_and_texts:
            zero_bbox = BoundingBox(
                x0=0.0, y0=0.0, x1=1.0, y1=1.0,
                x0_pt=0.0, y0_pt=0.0, x1_pt=612.0, y1_pt=792.0
            )
            return TableRegion(region_id=region_id, bbox=zero_bbox, is_borderless=is_borderless)

        # 1. Compute table region bounding box
        overall_bbox = boxes_and_texts[0][0]
        for bbox, _ in boxes_and_texts[1:]:
            overall_bbox = overall_bbox.union(bbox)

        # 2. Sort items by top coordinate (y0)
        sorted_items = sorted(boxes_and_texts, key=lambda item: (item[0].y0_pt, item[0].x0_pt))

        # 3. Group into visual rows based on vertical overlap
        raw_rows: List[List[Tuple[BoundingBox, str]]] = []
        for bbox, text in sorted_items:
            placed = False
            for row in raw_rows:
                # Check overlap with existing row bounding envelope
                row_y0 = min(b.y0_pt for b, _ in row)
                row_y1 = max(b.y1_pt for b, _ in row)
                row_height = row_y1 - row_y0

                # Compute 1D vertical overlap
                overlap_y0 = max(bbox.y0_pt, row_y0)
                overlap_y1 = min(bbox.y1_pt, row_y1)
                overlap_len = max(0.0, overlap_y1 - overlap_y0)

                min_h = min(bbox.height_pt if hasattr(bbox, "height_pt") else (bbox.y1_pt - bbox.y0_pt), row_height)
                if min_h > 0 and (overlap_len / min_h) >= self.vertical_overlap_threshold:
                    row.append((bbox, text))
                    placed = True
                    break

            if not placed:
                raw_rows.append([(bbox, text)])

        # 4. Sort each row left-to-right (x0)
        for row in raw_rows:
            row.sort(key=lambda item: item[0].x0_pt)

        # 5. Column discovery via horizontal projection / cluster intervals
        # Collect all unique x-ranges across all rows
        col_intervals: List[Tuple[float, float]] = []  # list of (x0_pt, x1_pt)
        for row in raw_rows:
            for bbox, _ in row:
                merged = False
                for idx, (cx0, cx1) in enumerate(col_intervals):
                    # Check horizontal overlap or proximity
                    if not (bbox.x1_pt < cx0 - self.column_gutter_threshold_pt or bbox.x0_pt > cx1 + self.column_gutter_threshold_pt):
                        col_intervals[idx] = (min(cx0, bbox.x0_pt), max(cx1, bbox.x1_pt))
                        merged = True
                        break
                if not merged:
                    col_intervals.append((bbox.x0_pt, bbox.x1_pt))

        # Sort columns left-to-right and merge overlapping intervals
        col_intervals.sort(key=lambda c: c[0])
        final_cols: List[Tuple[float, float]] = []
        for c0, c1 in col_intervals:
            if not final_cols:
                final_cols.append((c0, c1))
            else:
                prev0, prev1 = final_cols[-1]
                if c0 <= prev1 + self.column_gutter_threshold_pt:
                    final_cols[-1] = (prev0, max(prev1, c1))
                else:
                    final_cols.append((c0, c1))

        # Build TableColumn models
        table_columns: List[TableColumn] = []
        for col_idx, (cx0, cx1) in enumerate(final_cols):
            col_bbox = BoundingBox(
                x0=cx0 / max(1.0, overall_bbox.x1_pt),
                y0=overall_bbox.y0,
                x1=cx1 / max(1.0, overall_bbox.x1_pt),
                y1=overall_bbox.y1,
                x0_pt=cx0,
                y0_pt=overall_bbox.y0_pt,
                x1_pt=cx1,
                y1_pt=overall_bbox.y1_pt,
            )
            table_columns.append(TableColumn(col_index=col_idx, bbox=col_bbox))

        # 6. Build TableRow and TableCell models
        table_rows: List[TableRow] = []
        all_cells: List[TableCell] = []

        for r_idx, row_items in enumerate(raw_rows):
            row_bbox = row_items[0][0]
            for b, _ in row_items[1:]:
                row_bbox = row_bbox.union(b)

            is_hdr = (r_idx == 0)  # first row as candidate header
            row_cells: List[TableCell] = []

            for bbox, text in row_items:
                # Find best matching column by horizontal overlap
                best_col_idx = 0
                best_overlap = -1.0
                for c_idx, (cx0, cx1) in enumerate(final_cols):
                    ox0 = max(bbox.x0_pt, cx0)
                    ox1 = min(bbox.x1_pt, cx1)
                    ov = max(0.0, ox1 - ox0)
                    if ov > best_overlap:
                        best_overlap = ov
                        best_col_idx = c_idx

                cell = TableCell(
                    cell_id=f"{region_id}_r{r_idx}_c{best_col_idx}",
                    row_index=r_idx,
                    col_index=best_col_idx,
                    bbox=bbox,
                    text=text,
                    is_header=is_hdr,
                )
                row_cells.append(cell)
                all_cells.append(cell)

            table_rows.append(
                TableRow(
                    row_index=r_idx,
                    bbox=row_bbox,
                    cells=row_cells,
                    is_header=is_hdr,
                )
            )

        return TableRegion(
            region_id=region_id,
            bbox=overall_bbox,
            rows=table_rows,
            columns=table_columns,
            cells=all_cells,
            is_borderless=is_borderless,
            confidence=1.0,
            metadata={"row_count": len(table_rows), "col_count": len(table_columns)},
        )

    def generate_reading_order_relations(
        self,
        table: TableRegion,
    ) -> List[ReadingOrderRelation]:
        """
        Generate explicit topological reading-order relations for a table:
        Row precedence (row_i -> row_{i+1}) and left-to-right cell traversal.
        """
        relations: List[ReadingOrderRelation] = []

        # Inter-row precedence: elements in row r precede elements in row r+1
        for r_idx in range(len(table.rows) - 1):
            curr_row = table.rows[r_idx]
            next_row = table.rows[r_idx + 1]
            if curr_row.cells and next_row.cells:
                relations.append(
                    ReadingOrderRelation(
                        source_id=curr_row.cells[-1].cell_id,
                        target_id=next_row.cells[0].cell_id,
                        relation_type="precedes",
                    )
                )

        # Intra-row precedence: cell c_j precedes c_{j+1}
        for row in table.rows:
            for c_idx in range(len(row.cells) - 1):
                relations.append(
                    ReadingOrderRelation(
                        source_id=row.cells[c_idx].cell_id,
                        target_id=row.cells[c_idx + 1].cell_id,
                        relation_type="same_row",
                    )
                )

        return relations
