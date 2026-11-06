"""
Hybrid Structured Extractor & Database Persistence Engine (Phase 4 Step 4 Wave 4).
Integrates Document Classification, Spatial Anchor Extraction with Safe Normalization,
Dense Semantic Entity Extraction, Table Detection & Multipage Stitching,
Column Header Classification with Collision Resolution, Semantic Row Segmentation,
Pure Decimal Accounting Invariant Evaluation, and Atomic Database Persistence
to Neon PostgreSQL `extracted_fields`.
"""
from __future__ import annotations

import json
import logging
import os
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

import asyncpg
import numpy as np

from src.intelligence.classifier import DocumentClassifier
from src.intelligence.extraction_schemas import (
    DocumentType,
    FieldDataType,
    ExtractionStatus,
    VerificationStatus,
    ExtractedField,
    LineItemSchema,
    InvoiceExtractionSchema,
    ContractExtractionSchema,
    DocumentClassificationResult,
)
from src.intelligence.financial_normalizer import (
    MonetaryEntry,
    ValidationStatus,
    parse_monetary_entry,
)
from src.intelligence.models import (
    BoundingBox,
    ExtractedPage,
    TextBlock,
    WordElement,
    TableRegion,
)
from src.intelligence.structured_extractor import (
    SpatialAnchorExtractor,
    SemanticDenseExtractor,
    INVOICE_ANCHOR_PATTERNS,
    CONTRACT_ANCHOR_PATTERNS,
)
from src.intelligence.table_structure import TableStructureExtractor
from src.intelligence.table_contracts import (
    TableCell as ContractTableCell,
    TableRow as ContractTableRow,
    TableBlock,
    TableRowType,
    TableType,
    LineItemField,
    InvariantEvaluationResult,
    InvariantOutcomeEnum,
)
from src.intelligence.header_classifier import (
    ColumnHeaderClassifier,
    ColumnRole,
    HeaderClassificationResult,
    HeaderClassifier,
)
from src.intelligence.row_segmenter import (
    RowSegmenter,
    parse_monetary_decimal,
    parse_percentage_decimal,
)
from src.intelligence.multipage_table_stitcher import (
    MultiPageTableStitcher,
    StitchedTableResult,
)
from src.intelligence.accounting_invariants import (
    evaluate_all_accounting_invariants,
)

logger = logging.getLogger(__name__)


def table_region_to_table_block(region: TableRegion, page_idx: int = 0) -> TableBlock:
    """
    Convert a layout-detected TableRegion into an immutable, contract-enforced TableBlock.
    """
    contract_rows = []
    for r in region.rows:
        contract_cells = []
        for c in r.cells:
            contract_cells.append(
                ContractTableCell(
                    text=c.text,
                    bbox=c.bbox,
                    row_idx=c.row_index,
                    col_idx=c.col_index,
                    confidence=getattr(c, "confidence", 1.0),
                )
            )
        contract_rows.append(
            ContractTableRow(
                cells=tuple(contract_cells),
                row_type=TableRowType.HEADER if r.is_header else TableRowType.DATA,
                row_index=r.row_index,
                confidence=getattr(r, "confidence", 1.0),
                bbox=r.bbox,
            )
        )
    return TableBlock(
        page_number=page_idx + 1,
        bbox=region.bbox,
        rows=tuple(contract_rows),
        table_type=TableType.STANDARD_GRID,
        confidence=region.confidence,
    )


def extract_tables_from_blocks(
    blocks: List[TextBlock],
    page_idx: int = 0,
    table_extractor: Optional[TableStructureExtractor] = None,
) -> List[TableBlock]:
    """
    Discover and extract TableBlock structures from a list of page text blocks.
    Identifies multi-column aligned rows and converts them to TableBlock.
    """
    if not blocks:
        return []

    extractor = table_extractor or TableStructureExtractor()
    boxes_and_texts = [(b.bbox, b.text) for b in blocks if b.bbox is not None and b.text.strip()]
    if not boxes_and_texts:
        return []

    # Use layout-aware structure extractor to construct TableRegion
    region = extractor.extract_table_region(
        boxes_and_texts,
        region_id=f"page_{page_idx}_table_1",
    )
    if region.row_count == 0 or region.col_count == 0:
        return []

    table_block = table_region_to_table_block(region, page_idx=page_idx)
    return [table_block]


class HybridStructuredExtractor:
    """
    Unified Production Structured Extraction Pipeline (Phase 4 Step 4 Wave 4).
    Combines Document Classification, Spatial Anchor Extraction with Safe Normalization,
    Dense Semantic Extraction, Table Detection & Multipage Stitching,
    Column Header Classification with Collision Resolution, Semantic Row Segmentation,
    and Pure Decimal Accounting Invariant Evaluation.
    """

    def __init__(
        self,
        confidence_threshold: float = 0.75,
        use_gpu: bool = True,
        config_path: Optional[str] = None,
    ):
        self.confidence_threshold = confidence_threshold
        self.classifier = DocumentClassifier(use_gpu=use_gpu)
        self.spatial_extractor = SpatialAnchorExtractor(confidence_threshold=confidence_threshold)
        self.semantic_extractor = SemanticDenseExtractor(use_gpu=use_gpu)
        self.table_extractor = TableStructureExtractor()
        self.table_stitcher = MultiPageTableStitcher()

        # Load tuned header classifier configuration if available
        tau = 0.80
        delta = 0.05
        cfg_file = config_path or os.path.join(
            os.path.dirname(__file__), "..", "..", "config", "table_extraction_config.json"
        )
        if os.path.exists(cfg_file):
            try:
                with open(cfg_file, "r", encoding="utf-8") as f:
                    cfg_data = json.load(f)
                    tau = float(cfg_data.get("primary_threshold", 0.80))
                    delta = float(cfg_data.get("margin_threshold", 0.05))
                    logger.info("Loaded frozen table extraction config: tau=%s, delta=%s", tau, delta)
            except Exception as e:
                logger.warning("Failed to load table extraction config (%s), using defaults", e)

        self.header_classifier = ColumnHeaderClassifier(primary_threshold=tau, margin_threshold=delta)
        self.row_segmenter = RowSegmenter(header_classifier=self.header_classifier)

    def extract_document(
        self,
        pages: List[ExtractedPage],
        tables: Optional[List[TableBlock]] = None,
    ) -> Union[InvoiceExtractionSchema, ContractExtractionSchema]:
        """
        End-to-end extraction from a list of ExtractedPage objects.
        Integrates table detection, multipage continuation, row segmentation,
        line-item extraction, and accounting invariant verification.
        """
        # 1. Document Classification
        clf_result: DocumentClassificationResult = self.classifier.classify_document_pages(pages)

        # Gather all text blocks across pages (page 0 takes precedence)
        all_blocks_by_page: Dict[int, List[TextBlock]] = {}
        for p in pages:
            blocks = p.digital_blocks if p.digital_blocks else p.ocr_blocks
            all_blocks_by_page[p.page_index] = blocks

        p0_blocks = all_blocks_by_page.get(0, [])

        # 2. Route based on classified document type
        if clf_result.predicted_type == DocumentType.LEGAL_CONTRACT:
            return self._extract_contract(clf_result, p0_blocks, all_blocks_by_page)
        else:
            return self._extract_invoice(clf_result, p0_blocks, all_blocks_by_page, tables=tables)

    @staticmethod
    def _check_values_agree(val_A: Any, val_B: Any, data_type: FieldDataType) -> bool:
        """Evaluate semantic equivalence between two extracted field candidates."""
        if val_A is None or val_B is None:
            return False
        if data_type == FieldDataType.MONETARY:
            try:
                dec_A = val_A if isinstance(val_A, Decimal) else Decimal(str(val_A))
                dec_B = val_B if isinstance(val_B, Decimal) else Decimal(str(val_B))
                return abs(dec_A - dec_B) <= Decimal("0.02")
            except Exception:
                return str(val_A).strip() == str(val_B).strip()
        elif data_type in (FieldDataType.PERCENTAGE, FieldDataType.QUANTITY):
            try:
                num_A = float(val_A)
                num_B = float(val_B)
                return abs(num_A - num_B) <= 0.01
            except Exception:
                return str(val_A).strip() == str(val_B).strip()
        else:
            str_A = str(val_A).strip().upper()
            str_B = str(val_B).strip().upper()
            return (str_A == str_B) or (str_A in str_B) or (str_B in str_A)

    def _reconcile_fields(
        self,
        spatial_fields: Dict[str, ExtractedField],
        semantic_fields: Dict[str, ExtractedField],
    ) -> Dict[str, ExtractedField]:
        """
        Merge spatial anchor and dense semantic extractions with strict corroboration
        and conflict detection. Disagreement between candidates forces NEEDS_REVIEW.
        """
        merged: Dict[str, ExtractedField] = {}
        all_field_names = set(spatial_fields.keys()) | set(semantic_fields.keys())

        for name in all_field_names:
            in_spatial = name in spatial_fields
            in_semantic = name in semantic_fields

            if in_spatial and not in_semantic:
                merged[name] = spatial_fields[name]
            elif in_semantic and not in_spatial:
                merged[name] = semantic_fields[name]
            else:
                f_A = spatial_fields[name]
                f_B = semantic_fields[name]
                values_agree = self._check_values_agree(f_A.value, f_B.value, f_A.data_type)

                if values_agree:
                    corroborated_conf = min(0.99, max(f_A.confidence, f_B.confidence) + 0.05)
                    merged[name] = ExtractedField(
                        name=name,
                        value=f_A.value,
                        raw_value=f_A.raw_value or f_B.raw_value,
                        data_type=f_A.data_type,
                        confidence=round(corroborated_conf, 4),
                        source_page=f_A.source_page,
                        bbox=f_A.bbox or f_B.bbox,
                        supporting_evidence=f_A.supporting_evidence,
                        extraction_status=ExtractionStatus.ACCEPTED if corroborated_conf >= self.confidence_threshold else ExtractionStatus.NEEDS_REVIEW,
                        verification_status=VerificationStatus.UNVERIFIED,
                        validation_notes=[
                            "Corroborated: spatial layout anchor and semantic dense probe agree on value",
                            f"Spatial confidence: {f_A.confidence:.3f}, Semantic confidence: {f_B.confidence:.3f}",
                            "Note: Both extractors share the same underlying OCR/text block evidence",
                        ],
                    )
                else:
                    conflict_conf = min(f_A.confidence, 0.60)
                    merged[name] = ExtractedField(
                        name=name,
                        value=f_A.value,
                        raw_value=f_A.raw_value,
                        data_type=f_A.data_type,
                        confidence=round(conflict_conf, 4),
                        source_page=f_A.source_page,
                        bbox=f_A.bbox,
                        supporting_evidence=f"Spatial: '{f_A.supporting_evidence}' vs Semantic: '{f_B.supporting_evidence}'",
                        extraction_status=ExtractionStatus.NEEDS_REVIEW,
                        verification_status=VerificationStatus.UNVERIFIED,
                        validation_notes=[
                            f"Corroboration conflict: spatial candidate='{f_A.value}' vs semantic candidate='{f_B.value}'",
                            "Gated to NEEDS_REVIEW due to cross-model disagreement",
                            "Note: Both extractors share the same underlying OCR/text block evidence",
                        ],
                    )
        return merged

    def _extract_invoice(
        self,
        clf_result: DocumentClassificationResult,
        p0_blocks: List[TextBlock],
        all_blocks_by_page: Dict[int, List[TextBlock]],
        tables: Optional[List[TableBlock]] = None,
    ) -> InvoiceExtractionSchema:
        """
        Extract structured invoice schema with table line items and accounting invariants.
        """
        # Special handling for bank statements to prioritize Ending/Closing balance
        active_patterns = dict(INVOICE_ANCHOR_PATTERNS)
        if clf_result.predicted_type == DocumentType.BANK_STATEMENT:
            active_patterns["total_amount"] = (
                re.compile(r"(?i)\b(?:ending\s*balance|closing\s*balance|final\s*balance|total\s*balance|balance\s*due)\s*[:.]?"),
                FieldDataType.MONETARY,
            )

        # A. Spatial extraction for financial amounts and identifiers
        spatial_fields: Dict[str, ExtractedField] = {}
        for page_idx, blocks in all_blocks_by_page.items():
            page_extracted = self.spatial_extractor.extract_from_blocks(
                blocks,
                page_index=page_idx,
                patterns=active_patterns,
            )
            for k, v in page_extracted.items():
                if k not in spatial_fields:
                    spatial_fields[k] = v

        # B. Semantic extraction for narrative and cross-validation entities
        semantic_fields = self.semantic_extractor.extract_semantic_entities(
            p0_blocks,
            page_index=0,
            fields_to_extract=[
                "vendor_name", "customer_name", "payment_terms", "vendor_address",
                "invoice_number", "invoice_date", "vendor_tax_id", "total_amount",
                "subtotal", "tax_amount", "tax_percentage", "currency",
            ],
        )

        # C. Merge and reconcile with strict corroboration and conflict gating
        merged = self._reconcile_fields(spatial_fields, semantic_fields)

        # Fallback currency deduction from total_amount if currency field was not explicitly labeled
        if "currency" not in merged and "total_amount" in merged:
            raw_tot = merged["total_amount"].raw_value or ""
            curr_match = re.search(r"\b(USD|EUR|GBP|CAD|AUD|JPY|CHF|INR)\b|\$|€|£|¥", raw_tot, re.I)
            if curr_match:
                token = curr_match.group(0).upper()
                symbol_map = {"$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY"}
                curr_code = symbol_map.get(token, token)
                merged["currency"] = ExtractedField(
                    name="currency",
                    value=curr_code,
                    raw_value=token,
                    data_type=FieldDataType.CATEGORICAL,
                    confidence=merged["total_amount"].confidence,
                    source_page=merged["total_amount"].source_page,
                    bbox=merged["total_amount"].bbox,
                    supporting_evidence=merged["total_amount"].supporting_evidence,
                    extraction_status=ExtractionStatus.ACCEPTED,
                    verification_status=VerificationStatus.UNVERIFIED,
                    validation_notes=["Inferred from total_amount currency symbol"],
                )

        # D. Table Extraction & Processing
        all_raw_tables: List[TableBlock] = []
        if tables is not None:
            all_raw_tables = list(tables)
        else:
            for p_idx, p_blocks in all_blocks_by_page.items():
                p_tables = extract_tables_from_blocks(p_blocks, page_idx=p_idx, table_extractor=self.table_extractor)
                all_raw_tables.extend(p_tables)

        # Multi-page table stitching
        final_tables: List[TableBlock] = []
        stitched_count = 0
        if len(all_raw_tables) > 1:
            tables_by_page = [(t.page_number, t) for t in all_raw_tables]
            stitched_results: List[StitchedTableResult] = self.table_stitcher.stitch_tables(tables_by_page)
            for res in stitched_results:
                final_tables.append(res.table)
                if res.is_stitched:
                    stitched_count += 1
        else:
            final_tables = all_raw_tables

        # E. Header Classification, Row Segmentation & Line Item Generation
        all_line_item_fields: List[LineItemField] = []
        enriched_tables: List[TableBlock] = []
        for table in final_tables:
            if not table.rows:
                continue
            enriched_tbl, items = self.row_segmenter.segment_table_rows(table)
            enriched_tables.append(enriched_tbl)
            all_line_item_fields.extend(items)

        # Convert LineItemField to LineItemSchema
        line_item_schemas = [LineItemSchema.from_line_item_field(lif) for lif in all_line_item_fields]

        # F. Accounting Invariant Evaluation
        def _get_dec(field_name: str) -> Optional[Decimal]:
            if field_name in merged and merged[field_name].value is not None:
                val = merged[field_name].value
                if isinstance(val, Decimal):
                    return val
                try:
                    return Decimal(str(val))
                except Exception:
                    return None
            return None

        subtotal_dec = _get_dec("subtotal")
        tax_amt_dec = _get_dec("tax_amount")
        tax_pct_dec = _get_dec("tax_percentage")
        disc_amt_dec = _get_dec("discount_amount")
        tot_amt_dec = _get_dec("total_amount")
        curr_str = str(merged.get("currency", ExtractedField(name="currency", value="USD", confidence=1.0)).value or "USD")
        sup_tax_id = str(merged["vendor_tax_id"].value) if "vendor_tax_id" in merged and merged["vendor_tax_id"].value else None
        cust_tax_id = str(merged["customer_tax_id"].value) if "customer_tax_id" in merged and merged["customer_tax_id"].value else None

        invariant_results: List[InvariantEvaluationResult] = []
        if all_line_item_fields or tot_amt_dec is not None or subtotal_dec is not None:
            invariant_results = evaluate_all_accounting_invariants(
                line_items=all_line_item_fields,
                subtotal=subtotal_dec,
                tax_amount=tax_amt_dec,
                tax_percentage=tax_pct_dec,
                discount_amount=disc_amt_dec,
                total_amount=tot_amt_dec,
                currency_code=curr_str,
                supplier_tax_id=sup_tax_id,
                customer_tax_id=cust_tax_id,
            )

        metadata = {
            "classification_evidence": clf_result.evidence_keywords,
            "table_count": len(enriched_tables),
            "stitched_table_count": stitched_count,
            "line_item_count": len(line_item_schemas),
            "invariant_evaluations": [inv.model_dump(mode="json") for inv in invariant_results],
        }

        return InvoiceExtractionSchema(
            document_type=clf_result.predicted_type,
            classification_confidence=clf_result.confidence,
            invoice_number=merged.get("invoice_number"),
            invoice_date=merged.get("invoice_date"),
            due_date=merged.get("due_date"),
            po_number=merged.get("po_number"),
            currency=merged.get("currency"),
            vendor_name=merged.get("vendor_name"),
            vendor_tax_id=merged.get("vendor_tax_id"),
            vendor_address=merged.get("vendor_address"),
            customer_name=merged.get("customer_name"),
            customer_tax_id=merged.get("customer_tax_id"),
            customer_address=merged.get("customer_address"),
            subtotal=merged.get("subtotal"),
            tax_amount=merged.get("tax_amount"),
            tax_percentage=merged.get("tax_percentage"),
            discount_amount=merged.get("discount_amount"),
            total_amount=merged.get("total_amount"),
            quantity=merged.get("quantity"),
            unit_price=merged.get("unit_price"),
            payment_terms=merged.get("payment_terms"),
            line_items=line_item_schemas,
            table_blocks=enriched_tables,
            invariant_evaluations=invariant_results,
            metadata=metadata,
        )

    def _extract_contract(
        self,
        clf_result: DocumentClassificationResult,
        p0_blocks: List[TextBlock],
        all_blocks_by_page: Dict[int, List[TextBlock]],
    ) -> ContractExtractionSchema:
        """
        Extract structured contract schema.
        """
        spatial_fields: Dict[str, ExtractedField] = {}
        for page_idx, blocks in all_blocks_by_page.items():
            page_extracted = self.spatial_extractor.extract_from_blocks(
                blocks,
                page_index=page_idx,
                patterns=CONTRACT_ANCHOR_PATTERNS,
            )
            for k, v in page_extracted.items():
                if k not in spatial_fields:
                    spatial_fields[k] = v

        semantic_fields = self.semantic_extractor.extract_semantic_entities(
            p0_blocks,
            page_index=0,
            fields_to_extract=["contract_title", "governing_law", "termination_clauses", "payment_terms"],
        )

        merged = self._reconcile_fields(spatial_fields, semantic_fields)

        return ContractExtractionSchema(
            document_type=clf_result.predicted_type,
            classification_confidence=clf_result.confidence,
            contract_title=merged.get("contract_title"),
            parties=[],
            effective_date=merged.get("effective_date"),
            expiration_date=merged.get("expiration_date"),
            governing_law=merged.get("governing_law"),
            total_value=merged.get("total_value"),
            termination_clauses=merged.get("termination_clauses"),
            payment_terms=merged.get("payment_terms"),
            metadata={"classification_evidence": clf_result.evidence_keywords},
        )


class TablePersistenceService:
    """
    Persistence Service for Document Intelligence Extractions (Phase 4 Step 4 Wave 4).
    Persists structured fields, line-item table bundles, and invariant evaluations
    atomically to Neon PostgreSQL `extracted_fields` adhering to transaction RLS.
    """

    UPSERT_EXTRACTED_FIELD_SQL = """
    INSERT INTO extracted_fields (
        organization_id, workspace_id, document_id, field_name,
        field_value_raw, field_value_normalized, confidence,
        page_number, bounding_box, extraction_metadata, is_verified, created_at
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
    )
    ON CONFLICT (organization_id, workspace_id, document_id, field_name)
    DO UPDATE SET
        field_value_raw = EXCLUDED.field_value_raw,
        field_value_normalized = EXCLUDED.field_value_normalized,
        confidence = EXCLUDED.confidence,
        page_number = EXCLUDED.page_number,
        bounding_box = EXCLUDED.bounding_box,
        extraction_metadata = EXCLUDED.extraction_metadata,
        is_verified = EXCLUDED.is_verified
    RETURNING id, field_name;
    """

    @classmethod
    async def persist_table_extraction_bundle(
        cls,
        conn: asyncpg.Connection,
        org_id: Union[uuid.UUID, str],
        workspace_id: Union[uuid.UUID, str],
        document_id: Union[uuid.UUID, str],
        schema: InvoiceExtractionSchema,
        actor_id: Optional[Union[uuid.UUID, str]] = None,
    ) -> Dict[str, Any]:
        """
        Atomically persist all extracted header fields and the consolidated table
        line-item bundle to `extracted_fields`.
        """
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        doc_uuid = uuid.UUID(str(document_id))

        persisted_records: List[Dict[str, Any]] = []

        # 1. Persist individual scalar header fields
        header_field_names = [
            "invoice_number", "invoice_date", "due_date", "po_number", "currency",
            "vendor_name", "vendor_tax_id", "vendor_address",
            "customer_name", "customer_tax_id", "customer_address",
            "subtotal", "tax_amount", "tax_percentage", "discount_amount",
            "total_amount", "quantity", "unit_price", "payment_terms",
        ]

        for fname in header_field_names:
            field: Optional[ExtractedField] = getattr(schema, fname, None)
            if field is None:
                continue

            # Serialize normalized value to JSON-compatible structure
            norm_val = field.value
            if isinstance(norm_val, Decimal):
                val_json = str(norm_val)
            elif hasattr(norm_val, "isoformat"):
                val_json = norm_val.isoformat()
            else:
                val_json = norm_val

            bbox_json = json.dumps(field.bbox.model_dump(mode="json")) if field.bbox else None
            meta_json = json.dumps({
                "extraction_status": field.extraction_status.value if hasattr(field.extraction_status, "value") else str(field.extraction_status),
                "data_type": field.data_type.value if hasattr(field.data_type, "value") else str(field.data_type),
                "validation_notes": field.validation_notes,
                "supporting_evidence": field.supporting_evidence,
            })

            res = await conn.fetchrow(
                cls.UPSERT_EXTRACTED_FIELD_SQL,
                org_uuid,
                ws_uuid,
                doc_uuid,
                fname,
                field.raw_value or str(norm_val),
                json.dumps(val_json),
                round(float(field.confidence), 4),
                int(field.source_page),
                bbox_json,
                meta_json,
                field.verification_status == VerificationStatus.VERIFIED,
            )
            if res:
                persisted_records.append({"id": str(res["id"]), "field_name": res["field_name"]})

        # 2. Persist consolidated 'line_items' table bundle
        line_items_data = []
        conf_sum = 0.0
        primary_page = 0
        bbox_union = None

        for item in schema.line_items:
            # item is LineItemSchema
            desc_bbox = item.description.bbox.model_dump(mode="json") if item.description.bbox else None
            item_dict = {
                "line_number": item.line_number,
                "description": str(item.description.value or ""),
                "quantity": str(item.quantity.value) if item.quantity and item.quantity.value is not None else None,
                "unit_price": str(item.unit_price.value) if item.unit_price and item.unit_price.value is not None else None,
                "total_price": str(item.total_price.value) if item.total_price and item.total_price.value is not None else None,
                "tax_rate": str(item.tax_rate.value) if item.tax_rate and item.tax_rate.value is not None else None,
                "item_code": str(item.item_code.value) if item.item_code and item.item_code.value is not None else None,
                "confidence": item.description.confidence,
                "source_page": item.description.source_page,
                "bbox": desc_bbox,
            }
            line_items_data.append(item_dict)
            conf_sum += item.description.confidence
            primary_page = item.description.source_page
            if item.description.bbox:
                bbox_union = item.description.bbox if bbox_union is None else bbox_union.union(item.description.bbox)

        avg_conf = round(conf_sum / len(schema.line_items), 4) if schema.line_items else 1.0
        raw_summary = f"{len(schema.line_items)} line items extracted"

        # Serialize invariant evaluations
        inv_json_list = []
        for inv in schema.invariant_evaluations:
            if hasattr(inv, "model_dump"):
                inv_json_list.append(inv.model_dump(mode="json"))
            elif isinstance(inv, dict):
                inv_json_list.append(inv)

        line_items_meta = json.dumps({
            "line_item_count": len(schema.line_items),
            "table_count": len(schema.table_blocks),
            "invariant_evaluations": inv_json_list,
            "all_invariants_passed": all(
                (inv.outcome == InvariantOutcomeEnum.PASSED if hasattr(inv, "outcome") else inv.get("outcome") == "PASSED")
                for inv in schema.invariant_evaluations
            ) if schema.invariant_evaluations else True,
            "classification_evidence": schema.metadata.get("classification_evidence", []),
        })

        bbox_json = json.dumps(bbox_union.model_dump(mode="json")) if bbox_union else None

        res_li = await conn.fetchrow(
            cls.UPSERT_EXTRACTED_FIELD_SQL,
            org_uuid,
            ws_uuid,
            doc_uuid,
            "line_items",
            raw_summary,
            json.dumps(line_items_data),
            avg_conf,
            primary_page,
            bbox_json,
            line_items_meta,
            False,
        )
        if res_li:
            persisted_records.append({"id": str(res_li["id"]), "field_name": res_li["field_name"]})

        return {
            "status": "SUCCESS",
            "document_id": str(doc_uuid),
            "persisted_fields_count": len(persisted_records),
            "persisted_fields": [r["field_name"] for r in persisted_records],
            "line_item_count": len(schema.line_items),
            "invariant_count": len(schema.invariant_evaluations),
        }

    @classmethod
    async def fetch_extracted_table_bundle(
        cls,
        conn: asyncpg.Connection,
        org_id: Union[uuid.UUID, str],
        workspace_id: Union[uuid.UUID, str],
        document_id: Union[uuid.UUID, str],
    ) -> Dict[str, Any]:
        """
        Fetch all persisted extracted fields for a document, including header fields
        and the line_items table bundle.
        """
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        doc_uuid = uuid.UUID(str(document_id))

        rows = await conn.fetch(
            """
            SELECT id, field_name, field_value_raw, field_value_normalized,
                   confidence, page_number, bounding_box, extraction_metadata,
                   is_verified, verified_value, created_at
            FROM extracted_fields
            WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
            ORDER BY field_name;
            """,
            org_uuid,
            ws_uuid,
            doc_uuid,
        )

        fields: Dict[str, Any] = {}
        line_items_record: Optional[Dict[str, Any]] = None

        for row in rows:
            fname = row["field_name"]
            norm_val = json.loads(row["field_value_normalized"]) if row["field_value_normalized"] else None
            meta = json.loads(row["extraction_metadata"]) if row["extraction_metadata"] else {}
            bbox = json.loads(row["bounding_box"]) if row["bounding_box"] else None

            record = {
                "id": str(row["id"]),
                "field_name": fname,
                "field_value_raw": row["field_value_raw"],
                "field_value_normalized": norm_val,
                "confidence": float(row["confidence"]),
                "page_number": row["page_number"],
                "bounding_box": bbox,
                "extraction_metadata": meta,
                "is_verified": row["is_verified"],
            }
            if fname == "line_items":
                line_items_record = record
            else:
                fields[fname] = record

        return {
            "document_id": str(doc_uuid),
            "fields": fields,
            "line_items": line_items_record,
        }
