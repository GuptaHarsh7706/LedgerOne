"""
Layout-Aware & Tabular Document Chunking Engine (Phase 6).
Generates high-precision, evidence-grounded chunks from extracted document text,
scalar key-value metadata, and hierarchical tabular line items.
Preserves spatial coordinates (bounding boxes), page numbers, and column headers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
import json
import re
from typing import Any, Dict, List, Optional, Sequence


@dataclass(frozen=True)
class DocumentChunk:
    """Strongly typed document chunk with exact spatial and evidence provenance."""

    chunk_index: int
    page_number: int
    content: str
    chunk_type: str  # "HEADER", "TEXT", "TABLE_ROW", "SUMMARY"
    bounding_box: Optional[Dict[str, float]] = None  # Normalized {x0, y0, x1, y1}
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_index": self.chunk_index,
            "page_number": self.page_number,
            "content": self.content,
            "chunk_type": self.chunk_type,
            "bounding_box": self.bounding_box,
            "metadata": self.metadata,
        }


def _merge_bounding_boxes(boxes: Sequence[Optional[Dict[str, float]]]) -> Optional[Dict[str, float]]:
    """Union a collection of normalized bounding boxes into a single bounding rectangle."""
    valid_boxes = [b for b in boxes if b and all(k in b for k in ("x0", "y0", "x1", "y1"))]
    if not valid_boxes:
        return None
    return {
        "x0": min(b["x0"] for b in valid_boxes),
        "y0": min(b["y0"] for b in valid_boxes),
        "x1": max(b["x1"] for b in valid_boxes),
        "y1": max(b["y1"] for b in valid_boxes),
    }


def chunk_scalar_fields(
    fields: Dict[str, Any],
    page_number: int = 1,
    start_index: int = 0,
) -> List[DocumentChunk]:
    """
    Generate high-density metadata chunks from extracted scalar fields.
    Formats key-value pairs into structured sentences ideal for both dense embeddings and BM25.
    """
    if not fields:
        return []

    chunks: List[DocumentChunk] = []
    lines: List[str] = []
    boxes: List[Optional[Dict[str, float]]] = []

    for fname, fval in fields.items():
        if fname in ("line_items", "invariants", "table", "raw_text"):
            continue
        val_str = ""
        box = None
        if isinstance(fval, dict):
            val_str = str(fval.get("value") or fval.get("normalized_value") or fval.get("raw_value") or "")
            box = fval.get("bounding_box")
        else:
            val_str = str(fval)

        clean_val = val_str.strip()
        if clean_val and clean_val != "None":
            clean_name = fname.replace("_", " ").title()
            lines.append(f"{clean_name}: {clean_val}")
            if box:
                boxes.append(box)

    if lines:
        content = f"[DOCUMENT HEADER & FINANCIAL SUMMARY P.{page_number}]\n" + "\n".join(lines)
        chunks.append(
            DocumentChunk(
                chunk_index=start_index,
                page_number=page_number,
                content=content,
                chunk_type="HEADER",
                bounding_box=_merge_bounding_boxes(boxes),
                metadata={"field_count": len(lines), "fields": list(fields.keys())},
            )
        )

    return chunks


def chunk_tabular_rows(
    line_items: List[Dict[str, Any]],
    page_number: int = 1,
    start_index: int = 0,
) -> List[DocumentChunk]:
    """
    Convert tabular line items into self-contained semantic row chunks.
    Crucially prepends column headers to cell values so that financial amounts
    retain their exact semantic context (e.g. unit price vs line subtotal).
    """
    chunks: List[DocumentChunk] = []
    idx = start_index

    for i, row in enumerate(line_items):
        if not isinstance(row, dict):
            continue

        ln = row.get("line_number") or (i + 1)
        desc = row.get("description") or f"Item {ln}"
        qty = row.get("quantity")
        up = row.get("unit_price")
        sub = row.get("subtotal") or row.get("line_net")
        tax = row.get("tax_amount")
        total = row.get("gross_total") or row.get("line_total")
        sku = row.get("item_code") or row.get("sku")

        parts = [f"[LINE ITEM #{ln} P.{page_number}]", f"Description: {desc}"]
        if sku:
            parts.append(f"SKU/Code: {sku}")
        if qty is not None:
            parts.append(f"Quantity: {qty}")
        if up is not None:
            parts.append(f"Unit Price: ${up}" if not str(up).startswith("$") else f"Unit Price: {up}")
        if sub is not None:
            parts.append(f"Line Subtotal: ${sub}" if not str(sub).startswith("$") else f"Line Subtotal: {sub}")
        if tax is not None:
            parts.append(f"Line Tax: ${tax}" if not str(tax).startswith("$") else f"Line Tax: {tax}")
        if total is not None:
            parts.append(f"Line Total: ${total}" if not str(total).startswith("$") else f"Line Total: {total}")

        content = " | ".join(parts)
        bbox = row.get("bbox") or row.get("bounding_box")

        chunks.append(
            DocumentChunk(
                chunk_index=idx,
                page_number=page_number,
                content=content,
                chunk_type="TABLE_ROW",
                bounding_box=bbox,
                metadata={
                    "line_number": ln,
                    "description": desc,
                    "subtotal": str(sub) if sub is not None else None,
                    "total": str(total) if total is not None else None,
                },
            )
        )
        idx += 1

    return chunks


def chunk_document_text(
    text: str,
    page_number: int = 1,
    start_index: int = 0,
    target_chunk_chars: int = 600,
    overlap_chars: int = 100,
    bounding_box: Optional[Dict[str, float]] = None,
) -> List[DocumentChunk]:
    """
    Split unstructured or raw document text into overlapping semantic passages.
    Breaks gracefully along sentence boundaries and paragraph breaks.
    """
    clean_text = text.strip()
    if not clean_text:
        return []

    # If text is already compact, return single chunk
    if len(clean_text) <= target_chunk_chars:
        return [
            DocumentChunk(
                chunk_index=start_index,
                page_number=page_number,
                content=f"[PAGE {page_number} TEXT]\n{clean_text}",
                chunk_type="TEXT",
                bounding_box=bounding_box,
                metadata={"length": len(clean_text)},
            )
        ]

    # Split into paragraphs or sentences
    paragraphs = [p.strip() for p in clean_text.split("\n\n") if p.strip()]
    if len(paragraphs) <= 1:
        # Fallback to sentence split
        paragraphs = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean_text) if s.strip()]

    chunks: List[DocumentChunk] = []
    current_tokens: List[str] = []
    current_len = 0
    idx = start_index

    for p in paragraphs:
        p_len = len(p)
        if current_len + p_len > target_chunk_chars and current_tokens:
            chunk_body = " ".join(current_tokens)
            chunks.append(
                DocumentChunk(
                    chunk_index=idx,
                    page_number=page_number,
                    content=f"[PAGE {page_number} TEXT]\n{chunk_body}",
                    chunk_type="TEXT",
                    bounding_box=bounding_box,
                    metadata={"length": len(chunk_body)},
                )
            )
            idx += 1

            # Preserve overlap from tail of current tokens
            overlap_acc = []
            overlap_len = 0
            for t in reversed(current_tokens):
                if overlap_len + len(t) <= overlap_chars:
                    overlap_acc.insert(0, t)
                    overlap_len += len(t)
                else:
                    break
            current_tokens = overlap_acc
            current_len = sum(len(t) for t in current_tokens)

        current_tokens.append(p)
        current_len += p_len

    if current_tokens:
        chunk_body = " ".join(current_tokens)
        chunks.append(
            DocumentChunk(
                chunk_index=idx,
                page_number=page_number,
                content=f"[PAGE {page_number} TEXT]\n{chunk_body}",
                chunk_type="TEXT",
                bounding_box=bounding_box,
                metadata={"length": len(chunk_body)},
            )
        )

    return chunks


def build_document_chunks_hierarchy(
    raw_text: Optional[str] = None,
    scalar_fields: Optional[Dict[str, Any]] = None,
    line_items: Optional[List[Dict[str, Any]]] = None,
    page_count: int = 1,
) -> List[DocumentChunk]:
    """
    Comprehensive document chunking orchestrator.
    Consolidates:
    1. Header & scalar financial fields
    2. Structured tabular line item rows
    3. Narrative / unstructured body text
    Produces a unified sequence of searchable chunks with strictly monotonic indices.
    """
    all_chunks: List[DocumentChunk] = []
    current_index = 0

    # 1. Scalar Header Chunks
    if scalar_fields:
        header_chunks = chunk_scalar_fields(scalar_fields, page_number=1, start_index=current_index)
        all_chunks.extend(header_chunks)
        current_index += len(header_chunks)

    # 2. Structured Tabular Row Chunks
    if line_items:
        table_chunks = chunk_tabular_rows(line_items, page_number=1, start_index=current_index)
        all_chunks.extend(table_chunks)
        current_index += len(table_chunks)

    # 3. Unstructured Page Text Chunks
    if raw_text:
        text_chunks = chunk_document_text(raw_text, page_number=1, start_index=current_index)
        all_chunks.extend(text_chunks)
        current_index += len(text_chunks)

    return all_chunks
