"""
Structured Information Extraction Pipeline for LedgerOne Document Intelligence.
Extracts strongly typed entities with exact spatial bounding boxes, confidence calibration,
safe financial normalization, and audit provenance.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from src.intelligence.classifier import DocumentClassifier
from src.intelligence.extraction_schemas import (
    DocumentType,
    FieldDataType,
    ExtractionStatus,
    VerificationStatus,
    ExtractedField,
    InvoiceExtractionSchema,
    ContractExtractionSchema,
    DocumentClassificationResult,
)
from src.intelligence.financial_normalizer import (
    MonetaryEntry,
    ValidationStatus,
    parse_monetary_entry,
)
from src.intelligence.models import BoundingBox, ExtractedPage, TextBlock, WordElement

logger = logging.getLogger(__name__)


# Spatial label anchor patterns for financial and metadata fields
INVOICE_ANCHOR_PATTERNS: Dict[str, Tuple[re.Pattern, FieldDataType]] = {
    "invoice_number": (
        re.compile(r"(?i)\b(?:invoice\s*(?:#|no\.?|num(?:ber)?)|inv\s*(?:#|no\.?)|bill\s*(?:#|no\.?)|receipt\s*(?:#|no\.?)|order\s*(?:#|no\.?)|certificate\s*(?:#|no\.?)|claim\s*(?:#|no\.?))\s*[:.]?"),
        FieldDataType.IDENTIFIER,
    ),
    "po_number": (
        re.compile(r"(?i)\b(?:purchase\s*order\s*(?:#|no\.?|num(?:ber)?)|p\.?o\.?\s*(?:#|no\.?|num(?:ber)?)|procurement\s*order\s*(?:#|no\.?)|#?po[-_#\s]\w+)\s*[:.]?"),
        FieldDataType.IDENTIFIER,
    ),
    "invoice_date": (
        re.compile(r"(?i)\b(?:invoice\s*date|date\s*of\s*issue|issue\s*date|bill\s*date|transaction\s*date|filing\s*date|certification\s*date|report\s*as\s*of\s*date|date)\s*[:.]?"),
        FieldDataType.DATE,
    ),
    "due_date": (
        re.compile(r"(?i)\b(?:due\s*date|payment\s*due|pay\s*by|terms\s*due)\s*[:.]?"),
        FieldDataType.DATE,
    ),
    "vendor_tax_id": (
        re.compile(r"(?i)\b(?:tax\s*id|vat\s*(?:id|no\.?|reg|number)|tin|ein|gstin|vendor\s*tax\s*(?:registration|reg|id)|auditor\s*registration|ust[-_]?idnr)\s*[:.]?"),
        FieldDataType.IDENTIFIER,
    ),
    "customer_tax_id": (
        re.compile(r"(?i)\b(?:customer\s*(?:vat|tax\s*id)|buyer\s*(?:vat|tax\s*id))\s*[:.]?"),
        FieldDataType.IDENTIFIER,
    ),
    "subtotal": (
        re.compile(r"(?i)\b(?:sub\s*total|subtotal|net\s*amount|total\s*before\s*tax|hardware\s*subtotal|gross\s*revenue\s*subtotal|professional\s*services\s*subtotal|subtotal\s*approved\s*funds)\s*[:.]?"),
        FieldDataType.MONETARY,
    ),
    "tax_amount": (
        re.compile(r"(?i)\b(?:tax\s*amount|vat\s*amount|sales\s*tax|total\s*tax|expense\s*deduction|tax(?!\s*(?:period|date|year|id|reg|return)))\s*[:.]?"),
        FieldDataType.MONETARY,
    ),
    "tax_percentage": (
        re.compile(r"(?i)\b(?:tax\s*(?:rate|%|pct)|vat\s*(?:rate|%|pct))\s*[:.]?"),
        FieldDataType.PERCENTAGE,
    ),
    "discount_amount": (
        re.compile(r"(?i)\b(?:discount|less\s*discount|rebate)\s*[:.]?"),
        FieldDataType.MONETARY,
    ),
    "total_amount": (
        re.compile(r"(?i)\b(?:grand\s*total|total\s*amount|total\s*due|balance\s*due|amount\s*due|total\s*payable|total\s*commitment|reimbursement\s*total|total\s*certified|total\s*billed|total\s*operating\s*revenue|total\s*current\s*assets|ending\s*balance|closing\s*balance|total)\s*[:.]?"),
        FieldDataType.MONETARY,
    ),
    "currency": (
        re.compile(r"(?i)\b(?:currency|curr)\s*[:.]?"),
        FieldDataType.CATEGORICAL,
    ),
    "payment_terms": (
        re.compile(r"(?i)\b(?:payment\s*terms|terms)\s*[:.]?"),
        FieldDataType.STRING,
    ),
}

CONTRACT_ANCHOR_PATTERNS: Dict[str, Tuple[re.Pattern, FieldDataType]] = {
    "effective_date": (
        re.compile(r"(?i)\b(?:effective\s*date|commencement\s*date|start\s*date)\s*[:.]?"),
        FieldDataType.DATE,
    ),
    "expiration_date": (
        re.compile(r"(?i)\b(?:expiration\s*date|expiry\s*date|termination\s*date|term\s*end)\s*[:.]?"),
        FieldDataType.DATE,
    ),
    "governing_law": (
        re.compile(r"(?i)\b(?:governing\s*law|jurisdiction|applicable\s*law)\s*[:.]?"),
        FieldDataType.STRING,
    ),
    "total_value": (
        re.compile(r"(?i)\b(?:contract\s*value|total\s*consideration|maximum\s*liability|annual\s*fee)\s*[:.]?"),
        FieldDataType.MONETARY,
    ),
}

# Semantic queries for dense matching
SEMANTIC_PROBES: Dict[str, str] = {
    "vendor_name": "Name of the vendor company seller supplier business organization issuing the invoice",
    "vendor_address": "Physical street address city postal code headquarters of the vendor company",
    "customer_name": "Name of the customer client buyer recipient company receiving the invoice",
    "customer_address": "Billing or shipping address location of the customer buyer",
    "payment_terms": "Payment terms condition such as Net 30 Net 60 due on receipt wire transfer",
    "contract_title": "Title or headline of the legal agreement non-disclosure contract",
    "governing_law": "Governing jurisdiction law of the state country or territory",
    "termination_clauses": "Termination notice period terms conditions for ending agreement",
}


class SpatialAnchorExtractor:
    """
    Deterministic layout-aware entity extractor.
    Locates label anchors across digital and OCR text blocks,
    associates adjacent value blocks horizontally and vertically,
    and applies SafeFinancialNormalizer to financial/date fields.
    """

    def __init__(self, confidence_threshold: float = 0.75):
        self.confidence_threshold = confidence_threshold

    def extract_from_blocks(
        self,
        blocks: List[TextBlock],
        page_index: int = 0,
        patterns: Optional[Dict[str, Tuple[re.Pattern, FieldDataType]]] = None,
    ) -> Dict[str, ExtractedField]:
        """
        Extract key-value fields from a list of TextBlock elements on a page.
        """
        if patterns is None:
            patterns = INVOICE_ANCHOR_PATTERNS

        extracted: Dict[str, ExtractedField] = {}
        matched_field_names: set = set()

        for block in blocks:
            text = block.text.strip()
            if not text:
                continue

            for field_name, (pattern, data_type) in patterns.items():
                if field_name in matched_field_names:
                    # Allow Gross Revenue / Total Subtotal to take precedence over line-level subtotal
                    if field_name == "subtotal" and any(k in text.lower() for k in ["gross", "grand", "total subtotal"]):
                        pass
                    else:
                        continue

                m = pattern.search(text)
                if not m:
                    continue

                # Candidate extraction strategy 1: Inline after label
                post_anchor_text = text[m.end():].strip()
                val_text: Optional[str] = None
                val_bbox: BoundingBox = block.bbox
                evidence_text = text

                if post_anchor_text:
                    # Strip leading colons, hyphens, spaces
                    val_text = re.split(r"[\n|]", post_anchor_text)[0].strip(" :-")
                    # Remove trailing labels if multiple exist on same line
                    for other_name, (other_pat, _) in patterns.items():
                        if other_name != field_name:
                            sub_m = other_pat.search(val_text)
                            if sub_m:
                                val_text = val_text[:sub_m.start()].strip(" :-")

                # Candidate extraction strategy 2: Look at adjacent blocks (horizontally right or vertically below)
                if not val_text:
                    adjacent_candidate = self._find_spatially_adjacent_block(block, blocks)
                    if adjacent_candidate:
                        val_text = adjacent_candidate.text.strip()
                        val_bbox = adjacent_candidate.bbox
                        evidence_text = f"{block.text} -> {adjacent_candidate.text}"

                if not val_text:
                    continue

                # Process value through type-specific normalizer
                extracted_field = self._build_extracted_field(
                    field_name=field_name,
                    raw_text=val_text,
                    data_type=data_type,
                    bbox=val_bbox,
                    source_page=page_index,
                    evidence=evidence_text,
                    block_confidence=block.confidence,
                )

                if extracted_field is not None:
                    extracted[field_name] = extracted_field
                    matched_field_names.add(field_name)

        return extracted

    def _find_spatially_adjacent_block(
        self,
        anchor_block: TextBlock,
        all_blocks: List[TextBlock],
    ) -> Optional[TextBlock]:
        """
        Find block immediately to the right or immediately below within spatial tolerances.
        """
        best_candidate: Optional[TextBlock] = None
        min_dist = float("inf")

        a_x0, a_y0, a_x1, a_y1 = anchor_block.bbox.x0, anchor_block.bbox.y0, anchor_block.bbox.x1, anchor_block.bbox.y1
        a_mid_y = (a_y0 + a_y1) / 2.0
        a_mid_x = (a_x0 + a_x1) / 2.0

        for b in all_blocks:
            if b == anchor_block or not b.text.strip():
                continue

            bx0, by0, bx1, by1 = b.bbox.x0, b.bbox.y0, b.bbox.x1, b.bbox.y1
            b_mid_y = (by0 + by1) / 2.0
            b_mid_x = (bx0 + bx1) / 2.0

            # Right neighbor check: on roughly same horizontal line (within 0.025 normalized height)
            if bx0 >= a_x1 - 0.01 and abs(b_mid_y - a_mid_y) < 0.025:
                dist = bx0 - a_x1
                if dist < 0.25 and dist < min_dist:
                    min_dist = dist
                    best_candidate = b

            # Below neighbor check: directly below in vertical column (within 0.10 normalized width)
            elif by0 >= a_y1 - 0.005 and abs(b_mid_x - a_mid_x) < 0.10:
                dist = by0 - a_y1
                if dist < 0.06 and dist < min_dist:
                    min_dist = dist
                    best_candidate = b

        return best_candidate

    def _build_extracted_field(
        self,
        field_name: str,
        raw_text: str,
        data_type: FieldDataType,
        bbox: BoundingBox,
        source_page: int,
        evidence: str,
        block_confidence: float,
    ) -> Optional[ExtractedField]:
        """
        Normalize and validate raw candidate into a typed ExtractedField.
        """
        raw_clean = raw_text.strip()
        if not raw_clean:
            return None

        normalized_value: Any = raw_clean
        confidence = float(np.clip(block_confidence, 0.1, 0.99))
        status = ExtractionStatus.ACCEPTED
        notes: List[str] = []

        if data_type == FieldDataType.MONETARY:
            if re.search(r"\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b", raw_clean) and not any(c in raw_clean for c in ["$", "€", "£", "USD", "EUR", "GBP"]):
                return None
            entry: MonetaryEntry = parse_monetary_entry(
                raw_text=raw_clean,
                source_confidence=block_confidence,
            )
            normalized_value = float(entry.parsed_decimal) if entry.parsed_decimal is not None else None
            confidence = entry.confidence
            if entry.validation_status == ValidationStatus.VALID:
                status = ExtractionStatus.ACCEPTED if confidence >= self.confidence_threshold else ExtractionStatus.NEEDS_REVIEW
            elif entry.validation_status in (ValidationStatus.AMBIGUOUS, ValidationStatus.INVALID):
                status = ExtractionStatus.ABSTAINED
                notes.append(f"Normalizer abstention ({entry.validation_status.value}): {entry.rejection_reason}")
            else:
                status = ExtractionStatus.NEEDS_REVIEW
                notes.append(f"Normalizer review routing: {entry.rejection_reason or 'uncertain'}")

        elif data_type == FieldDataType.PERCENTAGE:
            pct_m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*%", raw_clean)
            if pct_m:
                normalized_value = float(pct_m.group(1))
                confidence = max(0.90, block_confidence)
                status = ExtractionStatus.ACCEPTED
            else:
                status = ExtractionStatus.NEEDS_REVIEW
                notes.append("Failed percentage regex parse")

        elif data_type == FieldDataType.DATE:
            norm_date = self._normalize_date(raw_clean)
            if norm_date:
                normalized_value = norm_date
                confidence = max(0.85, block_confidence)
                status = ExtractionStatus.ACCEPTED
            else:
                status = ExtractionStatus.NEEDS_REVIEW
                notes.append("Unrecognized date format")

        elif data_type == FieldDataType.IDENTIFIER:
            # Special check for tax ID format
            if field_name == "vendor_tax_id":
                tax_m = re.search(r"\b([A-Z]{2,4}[-_]?[0-9A-Z]{5,15}|[0-9]{2}[-_][0-9]{7})\b", raw_clean)
                if tax_m:
                    normalized_value = tax_m.group(1)
                    confidence = max(0.92, block_confidence)
                    status = ExtractionStatus.ACCEPTED
                else:
                    id_match = re.search(r"([A-Za-z0-9_\-\/]{3,30})", raw_clean)
                    if id_match and not any(w in id_match.group(1).lower() for w in ["preis", "price", "eur", "usd", "subtotal"]):
                        normalized_value = id_match.group(1)
                        confidence = max(0.85, block_confidence)
                        status = ExtractionStatus.ACCEPTED
                    else:
                        status = ExtractionStatus.ABSTAINED
                        notes.append("Tax ID pattern mismatch")
            else:
                id_match = re.search(r"([A-Za-z0-9_\-\/]{3,30})", raw_clean)
                if id_match:
                    normalized_value = id_match.group(1)
                    confidence = max(0.88, block_confidence)
                    status = ExtractionStatus.ACCEPTED
                else:
                    status = ExtractionStatus.NEEDS_REVIEW
                    notes.append("Identifier pattern mismatch")

        elif data_type == FieldDataType.CATEGORICAL and field_name == "currency":
            curr_match = re.search(r"\b(USD|EUR|GBP|CAD|AUD|JPY|CHF|INR)\b|\$|€|£|¥", raw_clean, re.I)
            if curr_match:
                token = curr_match.group(0).upper()
                symbol_map = {"$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY"}
                normalized_value = symbol_map.get(token, token)
                confidence = 0.95
                status = ExtractionStatus.ACCEPTED
            else:
                status = ExtractionStatus.ABSTAINED
                notes.append("No currency code detected")

        if confidence < self.confidence_threshold and status == ExtractionStatus.ACCEPTED:
            status = ExtractionStatus.NEEDS_REVIEW

        return ExtractedField(
            name=field_name,
            value=normalized_value,
            raw_value=raw_clean,
            data_type=data_type,
            confidence=round(confidence, 4),
            source_page=source_page,
            bbox=bbox,
            supporting_evidence=evidence[:200],
            extraction_status=status,
            verification_status=VerificationStatus.UNVERIFIED,
            validation_notes=notes,
        )

    @staticmethod
    def _normalize_date(raw_date: str) -> Optional[str]:
        """Date normalizer for common international formats."""
        m_iso = re.search(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b", raw_date)
        if m_iso:
            return f"{m_iso.group(1)}-{int(m_iso.group(2)):02d}-{int(m_iso.group(3)):02d}"

        m_eu = re.search(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b", raw_date)
        if m_eu:
            return f"{m_eu.group(3)}-{int(m_eu.group(2)):02d}-{int(m_eu.group(1)):02d}"

        m_alpha = re.search(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b", raw_date, re.I)
        if m_alpha:
            return m_alpha.group(0)

        return None


class SemanticDenseExtractor:
    """
    Dense semantic zero-shot field extractor using sentence-transformers (all-MiniLM-L6-v2).
    Discovers unstructured narrative entities (vendor, customer, payment terms, legal clauses)
    by ranking document text blocks against canonical semantic probe vectors.
    """

    def __init__(self, use_gpu: bool = True, similarity_threshold: float = 0.40):
        self.use_gpu = use_gpu
        self.similarity_threshold = similarity_threshold
        self._embedder = None
        self._probe_embeddings: Optional[Dict[str, np.ndarray]] = None

    def _init_embedder(self) -> None:
        """Initialize embedder with local_files_only=True."""
        if self._embedder is not None:
            return

        try:
            import torch
            from sentence_transformers import SentenceTransformer

            device = "cuda" if (self.use_gpu and torch.cuda.is_available()) else "cpu"
            self._embedder = SentenceTransformer("all-MiniLM-L6-v2", device=device, local_files_only=True)
            logger.info("SemanticDenseExtractor initialized on %s", device)

            # Pre-compute probe embeddings
            probe_keys = list(SEMANTIC_PROBES.keys())
            probe_texts = [SEMANTIC_PROBES[k] for k in probe_keys]
            raw_embs = self._embedder.encode(probe_texts, normalize_embeddings=True)
            self._probe_embeddings = {
                k: raw_embs[i] for i, k in enumerate(probe_keys)
            }
        except Exception as exc:
            logger.warning("Failed to initialize SentenceTransformer for semantic extraction: %s", exc)
            self._embedder = None

    def extract_semantic_entities(
        self,
        blocks: List[TextBlock],
        page_index: int = 0,
        fields_to_extract: Optional[List[str]] = None,
    ) -> Dict[str, ExtractedField]:
        """
        Extract target narrative entities from candidate blocks.
        """
        if fields_to_extract is None:
            fields_to_extract = ["vendor_name", "customer_name", "payment_terms"]

        self._init_embedder()
        if self._embedder is None or self._probe_embeddings is None or not blocks:
            return {}

        valid_blocks = [b for b in blocks if len(b.text.strip()) > 3]
        if not valid_blocks:
            return {}

        block_texts = [b.text.strip() for b in valid_blocks]
        block_embs = self._embedder.encode(block_texts, normalize_embeddings=True)

        extracted: Dict[str, ExtractedField] = {}

        for field_name in fields_to_extract:
            if field_name not in self._probe_embeddings:
                continue

            probe_emb = self._probe_embeddings[field_name]
            sims = np.dot(block_embs, probe_emb)
            best_idx = int(np.argmax(sims))
            best_sim = float(sims[best_idx])

            if best_sim >= self.similarity_threshold:
                best_block = valid_blocks[best_idx]
                raw_line = best_block.text.strip().split("\n")[0]
                if re.match(r"(?i)^(?:invoice|bill|receipt|statement|purchase order)$", raw_line):
                    continue

                conf = float(np.clip(best_sim * 1.1, 0.5, 0.95))
                status = ExtractionStatus.ACCEPTED if conf >= 0.75 else ExtractionStatus.NEEDS_REVIEW

                extracted[field_name] = ExtractedField(
                    name=field_name,
                    value=raw_line,
                    raw_value=best_block.text.strip(),
                    data_type=FieldDataType.STRING,
                    confidence=round(conf, 4),
                    source_page=page_index,
                    bbox=best_block.bbox,
                    supporting_evidence=best_block.text.strip()[:200],
                    extraction_status=status,
                    verification_status=VerificationStatus.UNVERIFIED,
                    validation_notes=[f"Dense semantic similarity: {best_sim:.3f}"],
                )

        return extracted


class HybridStructuredExtractor:
    """
    Unified Production Structured Extraction Pipeline.
    Combines Document Classification, Spatial Anchor Extraction with Safe Normalization,
    and Dense Semantic Extraction with cross-field reconciliation.
    """

    def __init__(self, confidence_threshold: float = 0.75, use_gpu: bool = True):
        self.confidence_threshold = confidence_threshold
        self.classifier = DocumentClassifier(use_gpu=use_gpu)
        self.spatial_extractor = SpatialAnchorExtractor(confidence_threshold=confidence_threshold)
        self.semantic_extractor = SemanticDenseExtractor(use_gpu=use_gpu)

    def extract_document(
        self,
        pages: List[ExtractedPage],
    ) -> Union[InvoiceExtractionSchema, ContractExtractionSchema]:
        """
        End-to-end extraction from a list of ExtractedPage objects.
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
            return self._extract_invoice(clf_result, p0_blocks, all_blocks_by_page)

    def _extract_invoice(
        self,
        clf_result: DocumentClassificationResult,
        p0_blocks: List[TextBlock],
        all_blocks_by_page: Dict[int, List[TextBlock]],
    ) -> InvoiceExtractionSchema:
        """
        Extract structured invoice schema.
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

        # B. Semantic extraction for narrative entities (vendor, customer, payment terms)
        semantic_fields = self.semantic_extractor.extract_semantic_entities(
            p0_blocks,
            page_index=0,
            fields_to_extract=["vendor_name", "customer_name", "payment_terms", "vendor_address"],
        )

        # C. Merge and reconcile
        merged: Dict[str, ExtractedField] = dict(spatial_fields)
        for k, v in semantic_fields.items():
            if k not in merged:
                merged[k] = v
            else:
                merged[k].confidence = min(0.99, merged[k].confidence + 0.05)
                merged[k].validation_notes.append("Corroborated by semantic and spatial extractors")

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
            payment_terms=merged.get("payment_terms"),
            line_items=[],
            metadata={"classification_evidence": clf_result.evidence_keywords},
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

        merged: Dict[str, ExtractedField] = dict(spatial_fields)
        for k, v in semantic_fields.items():
            if k not in merged:
                merged[k] = v

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
