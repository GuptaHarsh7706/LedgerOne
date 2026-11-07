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
from typing import Any, Dict, List, Optional, Sequence, Tuple


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


@dataclass(frozen=True)
class StructuredTableRow:
    """Atomic table line-item row with exact cell relationships and source geometry."""

    row_id: str
    table_id: str
    description: str
    quantity: Optional[str] = None
    unit_price: Optional[str] = None
    subtotal: Optional[str] = None
    tax: Optional[str] = None
    total: Optional[str] = None
    sku: Optional[str] = None
    additional_columns: Dict[str, str] = field(default_factory=dict)
    page_number: int = 1
    bounding_box: Optional[Dict[str, float]] = None


@dataclass(frozen=True)
class StructuredTable:
    """
    Strongly typed table representation preserving table identity, column headers,
    multi-page relationships, and source geometry.
    """

    table_id: str
    document_id: str
    document_name: Optional[str] = None
    headers: List[str] = field(default_factory=list)
    rows: List[StructuredTableRow] = field(default_factory=list)
    page_range: Tuple[int, int] = (1, 1)
    continuation_metadata: Dict[str, Any] = field(default_factory=dict)
    source_geometry: Optional[Dict[str, float]] = None

    def to_chunks(self, start_index: int = 0) -> List[DocumentChunk]:
        """Convert table into cohesive, self-contained row chunks preserving column headers and table identity."""
        chunks: List[DocumentChunk] = []
        idx = start_index
        header_str = " | ".join(self.headers) if self.headers else ""
        doc_prefix = f"[{self.document_name} | " if self.document_name else "["

        for row in self.rows:
            parts = [f"{doc_prefix}Table: {self.table_id} | Row #{row.row_id} P.{row.page_number}]"]
            if header_str:
                parts.append(f"Columns: ({header_str})")
            parts.append(f"Description: {row.description}")
            if row.sku:
                parts.append(f"SKU: {row.sku}")
            if row.quantity is not None:
                parts.append(f"Quantity: {row.quantity}")
            if row.unit_price is not None:
                parts.append(f"Unit Price: {row.unit_price}")
            if row.subtotal is not None:
                parts.append(f"Subtotal: {row.subtotal}")
            if row.tax is not None:
                parts.append(f"Tax: {row.tax}")
            if row.total is not None:
                parts.append(f"Total: {row.total}")
            for col_name, col_val in row.additional_columns.items():
                parts.append(f"{col_name}: {col_val}")

            content = " | ".join(parts)
            bbox = row.bounding_box or self.source_geometry

            chunks.append(
                DocumentChunk(
                    chunk_index=idx,
                    page_number=row.page_number,
                    content=content,
                    chunk_type="TABLE_ROW",
                    bounding_box=bbox,
                    metadata={
                        "table_id": self.table_id,
                        "document_id": self.document_id,
                        "row_id": row.row_id,
                        "description": row.description,
                        "quantity": row.quantity,
                        "unit_price": row.unit_price,
                        "total": row.total,
                    },
                )
            )
            idx += 1
        return chunks


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


def chunk_structured_document(
    name: str,
    content: str,
    document_id: Optional[str] = None,
    bounding_box: Optional[Dict[str, float]] = None,
    page_number: int = 1,
    start_index: int = 0,
) -> List[DocumentChunk]:
    """
    Table-aware and layout-preserving chunker for structured financial documents.
    Preserves:
    1. Document identity and header metadata across all chunks.
    2. Atomic table line items: Keeps item description and corresponding quantities/prices together in the SAME chunk.
    3. Accounting and tax summaries: Preserves VAT, subtotal, gross totals, and payment terms.
    4. Exact bounding box geometry across all child chunks so spatial provenance is never lost.
    """
    lines = [l.strip() for l in content.split("\n") if l.strip()]
    if not lines:
        return []

    chunks: List[DocumentChunk] = []
    idx = start_index

    # Identify document header line
    header_line = lines[0]

    # Extract order / invoice / PO identifier from header or content
    id_match = re.search(
        r"(INV-[\w\-]+|PO-[\w\-]+|ORD-[\w\-]+|FBL-[\w\-]+|GS-[\w\-]+|FCC-[\w\-]+|JIG7-[\w\-]+|SETTL-[\w\-]+|REC-[\w\-]+|ST-[\w\-]+)",
        content,
    )
    doc_ref = id_match.group(1) if id_match else name

    # Classify lines
    item_lines = []
    qty_lines = []
    summary_lines = []
    terms_lines = []
    other_lines = []

    for l in lines[1:]:
        l_lower = l.lower()
        if l_lower.startswith("item:"):
            item_lines.append(l)
        elif "quantity:" in l_lower or "unit price:" in l_lower:
            qty_lines.append(l)
        elif any(
            k in l_lower
            for k in [
                "vat",
                "tax",
                "gross total",
                "total amount due",
                "total due",
                "subtotal",
                "total freight",
                "total wharfage",
                "total paid",
                "clearance volume",
                "regulatory contribution",
                "total value",
            ]
        ):
            summary_lines.append(l)
        elif any(k in l_lower for k in ["payment terms", "signatory", "exemption", "stamp", "berth"]):
            terms_lines.append(l)
        else:
            other_lines.append(l)

    # 1. Document Header Chunk
    hdr_parts = [f"[{name} | Document Header P.{page_number}]", header_line]
    if terms_lines:
        hdr_parts.extend(terms_lines)
    chunks.append(
        DocumentChunk(
            chunk_index=idx,
            page_number=page_number,
            content=" | ".join(hdr_parts),
            chunk_type="HEADER",
            bounding_box=bounding_box,
            metadata={"document_id": document_id, "doc_ref": doc_ref, "type": "header"},
        )
    )
    idx += 1

    # 2. Table Line Item Chunks (Pairing Item descriptions with quantities/prices)
    if item_lines or qty_lines:
        max_rows = max(len(item_lines), len(qty_lines), 1)
        for r_i in range(max_rows):
            row_parts = [f"[{name} | {doc_ref} | Line Item #{r_i + 1} P.{page_number}]"]
            if r_i < len(item_lines):
                row_parts.append(item_lines[r_i])
            if r_i < len(qty_lines):
                row_parts.append(qty_lines[r_i])
            chunks.append(
                DocumentChunk(
                    chunk_index=idx,
                    page_number=page_number,
                    content=" | ".join(row_parts),
                    chunk_type="TABLE_ROW",
                    bounding_box=bounding_box,
                    metadata={"document_id": document_id, "doc_ref": doc_ref, "line_number": r_i + 1},
                )
            )
            idx += 1

    # 3. Other narrative or line items (e.g. freight, services)
    if other_lines:
        for o_i, ol in enumerate(other_lines):
            chunks.append(
                DocumentChunk(
                    chunk_index=idx,
                    page_number=page_number,
                    content=f"[{name} | {doc_ref} | Line #{o_i + 1} P.{page_number}] {ol}",
                    chunk_type="TEXT",
                    bounding_box=bounding_box,
                    metadata={"document_id": document_id, "doc_ref": doc_ref},
                )
            )
            idx += 1

    # 4. Financial Summary & Tax Chunk
    if summary_lines:
        sum_parts = [f"[{name} | {doc_ref} | Financial Summary & Tax P.{page_number}]"]
        sum_parts.extend(summary_lines)
        if terms_lines:
            sum_parts.extend(terms_lines)
        chunks.append(
            DocumentChunk(
                chunk_index=idx,
                page_number=page_number,
                content=" | ".join(sum_parts),
                chunk_type="SUMMARY",
                bounding_box=bounding_box,
                metadata={"document_id": document_id, "doc_ref": doc_ref, "type": "summary"},
            )
        )
        idx += 1

    return chunks


def build_document_chunks_hierarchy(
    raw_text: Optional[str] = None,
    scalar_fields: Optional[Dict[str, Any]] = None,
    line_items: Optional[List[Dict[str, Any]]] = None,
    document_name: Optional[str] = None,
    document_id: Optional[str] = None,
    bounding_box: Optional[Dict[str, float]] = None,
    structured_table: Optional[StructuredTable] = None,
    page_count: int = 1,
) -> List[DocumentChunk]:
    """
    Comprehensive document chunking orchestrator.
    Consolidates:
    1. Header & scalar financial fields
    2. Structured tabular line item rows (or StructuredTable)
    3. Layout-aware structured or narrative body text
    Produces a unified sequence of searchable chunks with strictly monotonic indices.
    """
    all_chunks: List[DocumentChunk] = []
    current_index = 0

    # 1. Structured Table Chunks (if provided)
    if structured_table:
        table_chunks = structured_table.to_chunks(start_index=current_index)
        all_chunks.extend(table_chunks)
        current_index += len(table_chunks)

    # 2. Scalar Header Chunks
    if scalar_fields:
        header_chunks = chunk_scalar_fields(scalar_fields, page_number=1, start_index=current_index)
        all_chunks.extend(header_chunks)
        current_index += len(header_chunks)

    # 3. Structured Tabular Row Chunks
    if line_items:
        table_chunks = chunk_tabular_rows(line_items, page_number=1, start_index=current_index)
        all_chunks.extend(table_chunks)
        current_index += len(table_chunks)

    # 4. Structured or Unstructured Page Text Chunks
    if raw_text:
        # Check if text is structured invoice/document text with lines
        if "\n" in raw_text and any(k in raw_text.lower() for k in ["item:", "quantity:", "invoice:", "order:", "vat", "subtotal", "total"]):
            struct_chunks = chunk_structured_document(
                name=document_name or "Document",
                content=raw_text,
                document_id=document_id,
                bounding_box=bounding_box,
                page_number=1,
                start_index=current_index,
            )
            all_chunks.extend(struct_chunks)
            current_index += len(struct_chunks)
        else:
            text_chunks = chunk_document_text(raw_text, page_number=1, start_index=current_index, bounding_box=bounding_box)
            all_chunks.extend(text_chunks)
            current_index += len(text_chunks)

    return all_chunks
