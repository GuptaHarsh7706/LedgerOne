"""
Recursive XY-Cut Algorithm for Document Reading Order Reconstruction.

Analyzes horizontal and vertical spatial projection histograms to preserve
multi-column layouts (e.g. side-by-side 'Bill To' / 'Ship To' and financial tables)
without interleaving columnar text streams.
"""
from __future__ import annotations

from typing import List, Sequence, Tuple
from src.intelligence.models import BoundingBox, TextBlock


def _find_horizontal_cuts(
    boxes: Sequence[Tuple[int, BoundingBox]],
    min_gap: float = 0.015,
) -> List[Tuple[float, float]]:
    """
    Project bounding boxes onto y-axis to find vertical gaps (horizontal dividing lines).
    Returns list of gap intervals (gap_top, gap_bottom).
    """
    if len(boxes) <= 1:
        return []

    # Sort by y0
    sorted_y = sorted(boxes, key=lambda b: (b[1].y0, b[1].y1))
    cuts: List[Tuple[float, float]] = []

    current_max_y1 = sorted_y[0][1].y1

    for _, box in sorted_y[1:]:
        if box.y0 > current_max_y1 + min_gap:
            # Significant vertical gap found
            cuts.append((current_max_y1, box.y0))
        current_max_y1 = max(current_max_y1, box.y1)

    return cuts


def _find_vertical_cuts(
    boxes: Sequence[Tuple[int, BoundingBox]],
    min_gap: float = 0.02,
) -> List[Tuple[float, float]]:
    """
    Project bounding boxes onto x-axis to find horizontal gaps (vertical dividing gutters).
    Returns list of gap intervals (gap_left, gap_right).
    """
    if len(boxes) <= 1:
        return []

    # Sort by x0
    sorted_x = sorted(boxes, key=lambda b: (b[1].x0, b[1].x1))
    cuts: List[Tuple[float, float]] = []

    current_max_x1 = sorted_x[0][1].x1

    for _, box in sorted_x[1:]:
        if box.x0 > current_max_x1 + min_gap:
            # Significant horizontal gutter found
            cuts.append((current_max_x1, box.x0))
        current_max_x1 = max(current_max_x1, box.x1)

    return cuts


def recursive_xy_cut(
    items: List[Tuple[int, BoundingBox]],
    min_horizontal_gap: float = 0.012,
    min_vertical_gap: float = 0.025,
) -> List[int]:
    """
    Recursive XY-cut implementation returning ordered list of item original indices.
    
    1. First seeks horizontal cuts (dividing paragraphs/sections top-to-bottom).
    2. If no horizontal cut, seeks vertical cuts (dividing columns left-to-right).
    3. If neither cut is found, sorts remaining items top-to-bottom, left-to-right.
    """
    if not items:
        return []
    if len(items) == 1:
        return [items[0][0]]

    # Step 1: Look for horizontal cuts (separating sections vertically)
    h_cuts = _find_horizontal_cuts(items, min_gap=min_horizontal_gap)
    if h_cuts:
        # Partition items across horizontal cuts
        # Cut at the largest horizontal gap
        best_cut = max(h_cuts, key=lambda c: c[1] - c[0])
        cut_point = (best_cut[0] + best_cut[1]) / 2.0

        top_group = [it for it in items if (it[1].y0 + it[1].y1) / 2.0 <= cut_point]
        bottom_group = [it for it in items if (it[1].y0 + it[1].y1) / 2.0 > cut_point]

        if top_group and bottom_group:
            ordered_top = recursive_xy_cut(top_group, min_horizontal_gap, min_vertical_gap)
            ordered_bottom = recursive_xy_cut(bottom_group, min_horizontal_gap, min_vertical_gap)
            return ordered_top + ordered_bottom

    # Step 2: Look for vertical cuts (separating columns horizontally)
    v_cuts = _find_vertical_cuts(items, min_gap=min_vertical_gap)
    if v_cuts:
        # Cut at the largest vertical gutter
        best_v_cut = max(v_cuts, key=lambda c: c[1] - c[0])
        cut_point = (best_v_cut[0] + best_v_cut[1]) / 2.0

        left_group = [it for it in items if (it[1].x0 + it[1].x1) / 2.0 <= cut_point]
        right_group = [it for it in items if (it[1].x0 + it[1].x1) / 2.0 > cut_point]

        if left_group and right_group:
            ordered_left = recursive_xy_cut(left_group, min_horizontal_gap, min_vertical_gap)
            ordered_right = recursive_xy_cut(right_group, min_horizontal_gap, min_vertical_gap)
            return ordered_left + ordered_right

    # Step 3: Base case - sort by (y0, x0) with slight tolerance for line alignment
    def _sort_key(it: Tuple[int, BoundingBox]):
        # Group within ~0.8% vertical band to treat as same line
        y_band = round(it[1].y0 / 0.008)
        return (y_band, it[1].x0)

    sorted_items = sorted(items, key=_sort_key)
    return [it[0] for it in sorted_items]


def sort_text_blocks_reading_order(
    blocks: List[TextBlock],
    min_horizontal_gap: float = 0.012,
    min_vertical_gap: float = 0.025,
) -> List[TextBlock]:
    """
    Sort a list of TextBlock objects in natural reading order using XY-cut
    and assign sequential reading_order_index values.
    """
    if not blocks:
        return []

    items = [(i, b.bbox) for i, b in enumerate(blocks)]
    ordered_indices = recursive_xy_cut(
        items,
        min_horizontal_gap=min_horizontal_gap,
        min_vertical_gap=min_vertical_gap,
    )

    ordered_blocks: List[TextBlock] = []
    for ro_idx, orig_idx in enumerate(ordered_indices):
        block = blocks[orig_idx]
        # Create updated block copy with reading_order_index
        ordered_block = block.model_copy(update={"reading_order_index": ro_idx})
        ordered_blocks.append(ordered_block)

    return ordered_blocks
