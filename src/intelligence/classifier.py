"""
Document Classification Engine for LedgerOne Document Intelligence.
Classifies multi-format business documents across 8 canonical categories:
- COMMERCIAL_INVOICE
- RECEIPT
- PURCHASE_ORDER
- BANK_STATEMENT
- FINANCIAL_SCHEDULE
- LEGAL_CONTRACT
- MULTI_COLUMN_REPORT
- OTHER

Uses hybrid scoring: high-precision lexical/structural marker matching combined with
dense semantic cosine similarity via sentence-transformers (all-MiniLM-L6-v2).
"""
from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Tuple
import numpy as np

from src.intelligence.extraction_schemas import DocumentType, DocumentClassificationResult
from src.intelligence.models import ExtractedPage

logger = logging.getLogger(__name__)

# Canonical classification marker vocabulary with domain weights
CLASS_MARKERS: Dict[DocumentType, List[Tuple[re.Pattern, float]]] = {
    DocumentType.COMMERCIAL_INVOICE: [
        (re.compile(r"(?i)\b(?:commercial\s+invoice|tax\s+invoice|invoice\b|factura|rechnung|disbursement\s+certificate|expense\s+reimbursement)\b"), 4.0),
        (re.compile(r"(?i)\b(?:invoice\s*(?:#|no\.?|num|number)|certificate\s*#|claim\s*#|certificate\s*#\w+)\b"), 3.5),
        (re.compile(r"(?i)\b(?:bill\s+to|remit\s+to|sold\s+to)\b"), 2.5),
        (re.compile(r"(?i)\b(?:total\s+amount|amount\s+due|balance\s+due|reimbursement\s+total|total\s+certified)\b"), 2.5),
        (re.compile(r"(?i)\b(?:vat\s*(?:#|reg|id)|gstin|ein|ust[-_]?idnr)\b"), 2.0),
        (re.compile(r"(?i)\b(?:due\s+date|payment\s+terms|net\s+\d+)\b"), 2.0),
    ],
    DocumentType.RECEIPT: [
        (re.compile(r"(?i)\b(?:receipt\b|sales\s+receipt|cash\s+receipt|pos\s+receipt|till\s+receipt|store\s+#|bistro|restaurant|cafe|dining)\b"), 4.5),
        (re.compile(r"(?i)\b(?:cashier|register\s+#|terminal\s+#|pump\s+#|lane\s+#|gratuity|tip)\b"), 3.5),
        (re.compile(r"(?i)\b(?:change\s+due|cash\s+tendered|card\s+tend|total\s+billed)\b"), 3.0),
        (re.compile(r"(?i)\b(?:thank\s+you\s+for\s+(?:your\s+)?(?:business|visit|shopping))\b"), 2.5),
    ],
    DocumentType.PURCHASE_ORDER: [
        (re.compile(r"(?i)\b(?:purchase\s+order\b|procurement\s+order|p\.?o\.?\s*(?:#|number|no\.?)|order\s+requisition|#?po[-_#\s]\w+)\b"), 5.0),
        (re.compile(r"(?i)\b(?:vendor\s*(?:name|code|tax)|ship\s+to|delivery\s+address|deliver\s+to|procurement)\b"), 3.5),
        (re.compile(r"(?i)\b(?:requisition|requisitioner|po\s+date|buyer|purchasing\s+dept|total\s+commitment)\b"), 3.0),
        (re.compile(r"(?i)\b(?:fob|shipping\s+method|terms\s+of\s+delivery)\b"), 2.0),
    ],
    DocumentType.BANK_STATEMENT: [
        (re.compile(r"(?i)\b(?:bank\s+statement|account\s+statement|monthly\s+statement|checking\s+account|barclays|chase)\b"), 5.0),
        (re.compile(r"(?i)\b(?:account\s*(?:#|number|no\.?)|routing\s*(?:#|number)|iban|swift)\b"), 3.5),
        (re.compile(r"(?i)\b(?:opening\s+balance|closing\s+balance|beginning\s+balance|ending\s+balance)\b"), 4.0),
        (re.compile(r"(?i)\b(?:deposits\s+and\s+additions|withdrawals\s+and\s+subtractions|daily\s+balance)\b"), 3.5),
    ],
    DocumentType.FINANCIAL_SCHEDULE: [
        (re.compile(r"(?i)\b(?:schedule\b|depreciation|amortization|form\s+\d{3,4}|balance\s+sheet|assets\s+summary|balance\s+sheet\s*-\s*assets)\b"), 5.0),
        (re.compile(r"(?i)\b(?:internal\s+revenue\s+service|department\s+of\s+the\s+treasury|taxable\s+income|irs)\b"), 4.0),
        (re.compile(r"(?i)\b(?:basis\s+for\s+depreciation|recovery\s+period|section\s+179|current\s+assets|fixed\s+assets)\b"), 4.0),
        (re.compile(r"(?i)\b(?:income\s+statement|cash\s+flow\s+statement|general\s+ledger|trial\s+balance)\b"), 3.0),
    ],
    DocumentType.LEGAL_CONTRACT: [
        (re.compile(r"(?i)\b(?:agreement\b|contract\b|service\s+level\s+agreement|master\s+services\s+agreement|sla\b|nda\b)\b"), 5.0),
        (re.compile(r"(?i)\b(?:by\s+and\s+between|hereinafter\s+referred\s+to\s+as|witnesseth|whereas)\b"), 4.0),
        (re.compile(r"(?i)\b(?:indemnification|governing\s+law|jurisdiction|confidentiality|intellectual\s+property)\b"), 3.5),
        (re.compile(r"(?i)\b(?:in\s+witness\s+whereof|severability|term\s+and\s+termination)\b"), 3.0),
    ],
    DocumentType.MULTI_COLUMN_REPORT: [
        (re.compile(r"(?i)\b(?:executive\s+summary|annual\s+report|quarterly\s+report|management\s+discussion|consolidated\s+financial\s+statement|multi-column|ledger|portfolio)\b"), 4.5),
        (re.compile(r"(?i)\b(?:financial\s+overview|market\s+analysis|table\s+of\s+contents|portfolio\s+review|operating\s+revenue|page\s+1\s+of\s+\d+)\b"), 3.5),
        (re.compile(r"(?i)\b(?:key\s+performance\s+indicators|kpi|ebitda|year-over-year|two-column|column\s+ledger)\b"), 3.0),
    ],
}

# Semantic class anchor prototype descriptions for dense embedding comparison
CLASS_PROTOTYPES: Dict[DocumentType, str] = {
    DocumentType.COMMERCIAL_INVOICE: "A commercial sales invoice, tax bill, expense claim, or disbursement certificate detailing products, VAT, and balance due.",
    DocumentType.RECEIPT: "A point-of-sale thermal till receipt or restaurant dining check showing cashier, register, gratuity, and total billed.",
    DocumentType.PURCHASE_ORDER: "A commercial procurement purchase order requisition issued by buyer purchasing department authorizing equipment and shipment.",
    DocumentType.BANK_STATEMENT: "A monthly banking account statement summarizing transactions, deposits, withdrawals, opening balance, and ending balance.",
    DocumentType.FINANCIAL_SCHEDULE: "An official financial tax depreciation schedule, IRS Form 4562, or corporate balance sheet assets summary ledger.",
    DocumentType.LEGAL_CONTRACT: "A formal binding legal contract, non-disclosure agreement, service level agreement, with parties, terms, and governing law.",
    DocumentType.MULTI_COLUMN_REPORT: "A consolidated multi-column financial statement, corporate annual review, or multi-column ledger report.",
    DocumentType.OTHER: "An unclassified miscellaneous document or form.",
}


class DocumentClassifier:
    """
    Hybrid Document Classifier combining rule-based structural cues with
    dense semantic embeddings via sentence-transformers (all-MiniLM-L6-v2).
    """

    def __init__(self, use_gpu: bool = True, semantic_weight: float = 0.30):
        self.semantic_weight = semantic_weight
        self.lexical_weight = 1.0 - semantic_weight
        self._embedder = None
        self._prototype_embeddings: Optional[Dict[DocumentType, np.ndarray]] = None
        self._use_gpu = use_gpu

    def _init_embedder(self) -> None:
        """Lazily initialize the sentence transformer model with local files."""
        if self._embedder is not None:
            return

        try:
            import torch
            from sentence_transformers import SentenceTransformer

            device = "cuda" if (self._use_gpu and torch.cuda.is_available()) else "cpu"
            self._embedder = SentenceTransformer("all-MiniLM-L6-v2", device=device, local_files_only=True)
            logger.info("SentenceTransformer initialized for classifier on %s", device)

            prototypes = [CLASS_PROTOTYPES[dt] for dt in CLASS_PROTOTYPES]
            raw_embs = self._embedder.encode(prototypes, normalize_embeddings=True)
            self._prototype_embeddings = {
                dt: raw_embs[i] for i, dt in enumerate(CLASS_PROTOTYPES)
            }
        except Exception as exc:
            logger.warning("Failed to initialize SentenceTransformer for classifier (%s); falling back to lexical-only", exc)
            self._embedder = None

    def classify_text(self, text: str) -> DocumentClassificationResult:
        """
        Classify document from extracted text representation.
        """
        if not text or not text.strip():
            return DocumentClassificationResult(
                predicted_type=DocumentType.OTHER,
                confidence=0.1,
                class_probabilities={dt.value: 0.125 for dt in DocumentType},
                evidence_keywords=["EMPTY_DOCUMENT"],
            )

        # 1. Lexical and structural scoring
        lexical_scores: Dict[DocumentType, float] = {dt: 0.05 for dt in DocumentType}
        matched_keywords: List[str] = []

        header_text = text[:3000]
        full_sample = header_text + "\n" + (text[-1000:] if len(text) > 4000 else "")

        for doc_type, markers in CLASS_MARKERS.items():
            for pattern, weight in markers:
                matches = pattern.findall(full_sample)
                if matches:
                    lexical_scores[doc_type] += weight * min(len(matches), 4)
                    matched_keywords.append(f"{doc_type.value}:{matches[0]}")

        total_lex = sum(lexical_scores.values())
        lex_probs = {dt: s / total_lex for dt, s in lexical_scores.items()}

        # 2. Semantic embedding scoring
        sem_probs: Dict[DocumentType, float] = {dt: 1.0 / len(DocumentType) for dt in DocumentType}
        self._init_embedder()
        if self._embedder is not None and self._prototype_embeddings is not None:
            try:
                doc_snippet = text[:1000].strip()
                doc_emb = self._embedder.encode([doc_snippet], normalize_embeddings=True)[0]

                sims: Dict[DocumentType, float] = {}
                for dt, proto_emb in self._prototype_embeddings.items():
                    sim = float(np.dot(doc_emb, proto_emb))
                    sims[dt] = max(0.001, sim)

                temp = 0.10
                exp_sims = {dt: np.exp(sims[dt] / temp) for dt in DocumentType}
                total_exp = sum(exp_sims.values())
                sem_probs = {dt: exp_sims[dt] / total_exp for dt in DocumentType}
            except Exception as exc:
                logger.debug("Semantic classification scoring failed: %s", exc)

        # 3. Hybrid fusion
        final_probs: Dict[DocumentType, float] = {}
        for dt in DocumentType:
            prob = (self.lexical_weight * lex_probs[dt]) + (self.semantic_weight * sem_probs[dt])
            final_probs[dt] = prob

        total_p = sum(final_probs.values())
        final_probs = {dt: p / total_p for dt, p in final_probs.items()}

        best_type, best_prob = max(final_probs.items(), key=lambda item: item[1])

        sorted_probs = sorted(final_probs.values(), reverse=True)
        margin = sorted_probs[0] - sorted_probs[1] if len(sorted_probs) > 1 else sorted_probs[0]
        calibrated_confidence = float(np.clip(best_prob * 0.7 + margin * 0.3, 0.1, 0.99))

        if best_prob < 0.20 and margin < 0.05:
            best_type = DocumentType.OTHER
            calibrated_confidence = 0.30

        return DocumentClassificationResult(
            predicted_type=best_type,
            confidence=round(calibrated_confidence, 4),
            class_probabilities={dt.value: round(final_probs[dt], 4) for dt in DocumentType},
            evidence_keywords=matched_keywords[:10],
        )

    def classify_document_pages(self, pages: List[ExtractedPage]) -> DocumentClassificationResult:
        """
        Classify document from a list of ExtractedPage objects.
        """
        if not pages:
            return DocumentClassificationResult(
                predicted_type=DocumentType.OTHER,
                confidence=0.1,
                class_probabilities={dt.value: 0.125 for dt in DocumentType},
                evidence_keywords=["NO_PAGES"],
            )

        p0_text = pages[0].digital_text or pages[0].ocr_text or ""
        remaining_text = "\n".join(
            (p.digital_text or p.ocr_text or "") for p in pages[1:5]
        )
        combined = (p0_text + "\n" + p0_text + "\n" + remaining_text).strip()
        return self.classify_text(combined)
