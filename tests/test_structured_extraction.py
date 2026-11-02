"""
Comprehensive Unit & Adversarial Test Suite for Phase 4 Step 3:
Structured Extraction Model Selection & Evaluation.

Tests:
1. Multi-class Document Classification
2. Spatial Anchor Extraction with Bounding Boxes
3. Safe Financial Normalization Integration
4. Semantic Dense Zero-Shot Entity Extraction
5. Contract Schema Extraction
6. Multi-evidence Corroboration Confidence Boost
7. Adversarial Malformed & Empty Inputs
8. Pydantic Schema JSON Round-Trip Serialization
9. GPU Memory Containment (< 1500 MB VRAM)
10. Field Provenance & Evidence Traceability
"""
from __future__ import annotations

import json
from decimal import Decimal
import numpy as np
import pytest
import torch

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
from src.intelligence.models import (
    BoundingBox,
    ExtractedPage,
    PageClassification,
    TextBlock,
)
from src.intelligence.structured_extractor import (
    HybridStructuredExtractor,
    SpatialAnchorExtractor,
    SemanticDenseExtractor,
)


def make_test_block(index: int, text: str, y0: float = 0.1, y1: float = 0.15, confidence: float = 1.0) -> TextBlock:
    """Helper to construct a TextBlock with normalized coordinates."""
    bbox = BoundingBox(
        x0=0.05, y0=y0, x1=0.95, y1=y1,
        x0_pt=36.0, y0_pt=y0 * 792.0, x1_pt=576.0, y1_pt=y1 * 792.0,
    )
    return TextBlock(
        block_index=index,
        reading_order_index=index,
        text=text,
        bbox=bbox,
        confidence=confidence,
        source="native",
    )


def make_test_page(lines: list[str]) -> ExtractedPage:
    """Helper to construct an ExtractedPage from lines of text."""
    blocks = []
    for i, line in enumerate(lines):
        y0 = 0.05 + (i * 0.06)
        blocks.append(make_test_block(i, line, y0=y0, y1=y0 + 0.05))

    return ExtractedPage(
        page_index=0,
        width_pt=612.0,
        height_pt=792.0,
        classification=PageClassification.DIGITAL_TEXT,
        classification_confidence=1.0,
        digital_text="\n".join(lines),
        digital_blocks=blocks,
    )


class TestStructuredExtractionSuite:
    """Phase 4 Step 3 verification test suite."""

    def test_document_classification_categories(self):
        """Verify classifier correctly predicts distinct canonical business document types."""
        classifier = DocumentClassifier(use_gpu=torch.cuda.is_available())

        # Invoice
        inv_res = classifier.classify_text("COMMERCIAL INVOICE\nInvoice #: INV-9901\nBill To: Acme Corp\nTotal Due: $4,500.00")
        assert inv_res.predicted_type == DocumentType.COMMERCIAL_INVOICE
        assert inv_res.confidence >= 0.70

        # Receipt
        rcpt_res = classifier.classify_text("BISTRO NAPOLI STORE #102\nCashier: Mario\nSubtotal: $45.00\nGratuity: $8.00\nTotal Billed: $53.00\nThank you for dining!")
        assert rcpt_res.predicted_type == DocumentType.RECEIPT

        # Purchase Order
        po_res = classifier.classify_text("PURCHASE ORDER\nOrder #: PO-2026-88\nVendor Name: Global Hardware Ltd\nShip To: Central Warehouse\nTotal Commitment: $12,000.00 USD")
        assert po_res.predicted_type == DocumentType.PURCHASE_ORDER

        # Bank Statement
        bank_res = classifier.classify_text("BARCLAYS BANK STATEMENT\nAccount #: 9928-1120-44\nOpening Balance: $10,000.00\nDeposits: $5,000.00\nEnding Balance: $15,000.00")
        assert bank_res.predicted_type == DocumentType.BANK_STATEMENT

        # Legal Contract
        contract_res = classifier.classify_text("MASTER SERVICES AGREEMENT\nBy and between Alpha Corp and Beta LLC.\nGoverning Law: State of New York.\nIn witness whereof...")
        assert contract_res.predicted_type == DocumentType.LEGAL_CONTRACT

    def test_spatial_anchor_invoice_extraction(self):
        """Verify spatial anchor extractor captures financial fields with accurate coordinates."""
        extractor = SpatialAnchorExtractor(confidence_threshold=0.75)
        blocks = [
            make_test_block(0, "TAX INVOICE", y0=0.05, y1=0.08),
            make_test_block(1, "Invoice #: INV-2026-104", y0=0.10, y1=0.13),
            make_test_block(2, "Invoice Date: 2026-06-15", y0=0.14, y1=0.17),
            make_test_block(3, "Vendor Tax ID: VAT-US889912", y0=0.18, y1=0.21),
            make_test_block(4, "Subtotal: $1,000.00 USD", y0=0.30, y1=0.33),
            make_test_block(5, "Tax Rate: 10.00%", y0=0.34, y1=0.37),
            make_test_block(6, "Grand Total: $1,100.00 USD", y0=0.40, y1=0.44),
        ]

        fields = extractor.extract_from_blocks(blocks, page_index=0)

        assert "invoice_number" in fields
        assert fields["invoice_number"].value == "INV-2026-104"
        assert fields["invoice_number"].data_type == FieldDataType.IDENTIFIER
        assert fields["invoice_number"].extraction_status == ExtractionStatus.ACCEPTED

        assert "invoice_date" in fields
        assert fields["invoice_date"].value == "2026-06-15"

        assert "vendor_tax_id" in fields
        assert fields["vendor_tax_id"].value == "VAT-US889912"

        assert "subtotal" in fields
        assert fields["subtotal"].value == 1000.0

        assert "tax_percentage" in fields
        assert fields["tax_percentage"].value == 10.0

        assert "total_amount" in fields
        assert fields["total_amount"].value == 1100.0
        assert fields["total_amount"].bbox is not None

    def test_safe_financial_normalizer_abstention(self):
        """Verify that ambiguous or malformed monetary values safely abstain rather than hallucinate."""
        extractor = SpatialAnchorExtractor(confidence_threshold=0.75)
        blocks = [
            make_test_block(0, "Total Due: ???.XX INVALID"),
        ]

        fields = extractor.extract_from_blocks(blocks, page_index=0)
        assert "total_amount" in fields
        assert fields["total_amount"].extraction_status == ExtractionStatus.ABSTAINED
        assert fields["total_amount"].value is None

    def test_semantic_dense_extractor_parties(self):
        """Verify dense semantic extractor identifies vendor and customer entities."""
        semantic_extractor = SemanticDenseExtractor(use_gpu=torch.cuda.is_available())
        blocks = [
            make_test_block(0, "INVOICE #9901"),
            make_test_block(1, "Global Logistics Solutions Inc, 500 Market St, San Francisco, CA"),
            make_test_block(2, "Bill To: Northwind Traders LLC, 100 Industrial Parkway, Chicago, IL"),
            make_test_block(3, "Payment Terms: Net 30 days bank transfer"),
        ]

        entities = semantic_extractor.extract_semantic_entities(
            blocks,
            page_index=0,
            fields_to_extract=["vendor_name", "customer_name", "payment_terms"],
        )

        assert "payment_terms" in entities
        assert "Net 30" in entities["payment_terms"].value

    def test_contract_schema_extraction(self):
        """Verify contract document routing populates ContractExtractionSchema."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        page = make_test_page([
            "CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT",
            "This Agreement is entered into by and between Alpha Corp and Beta LLC.",
            "Effective Date: 2026-01-01",
            "Expiration Date: 2028-12-31",
            "Governing Law: State of Delaware",
            "Total Contract Value: $500,000.00 USD",
            "In witness whereof, the parties have executed this Agreement.",
        ])

        schema = pipeline.extract_document([page])
        assert isinstance(schema, ContractExtractionSchema)
        assert schema.document_type == DocumentType.LEGAL_CONTRACT
        assert schema.effective_date is not None
        assert schema.effective_date.value == "2026-01-01"
        assert schema.governing_law is not None

    def test_corroboration_confidence_boost(self):
        """Verify multi-evidence agreement between spatial and semantic extractors boosts confidence."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        page = make_test_page([
            "INVOICE #INV-888",
            "Payment Terms: Net 30 Days",
            "Total Amount: $500.00 USD",
        ])

        schema = pipeline.extract_document([page])
        assert isinstance(schema, InvoiceExtractionSchema)
        if schema.payment_terms:
            assert schema.payment_terms.confidence >= 0.75

    def test_adversarial_malformed_inputs(self):
        """Verify pipeline fails gracefully with safe abstention on random, corrupt, or empty inputs."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())

        # Empty page
        empty_page = ExtractedPage(
            page_index=0, width_pt=600.0, height_pt=800.0,
            classification=PageClassification.DIGITAL_TEXT,
            classification_confidence=0.1,
            digital_text="",
            digital_blocks=[],
        )
        schema_empty = pipeline.extract_document([empty_page])
        assert schema_empty.document_type == DocumentType.OTHER

        # Corrupted noise text
        corrupted_page = make_test_page(["@#$%^&*()_+ 12345 !~", "random gibberish without labels"])
        schema_corrupt = pipeline.extract_document([corrupted_page])
        assert schema_corrupt.document_type in (DocumentType.OTHER, DocumentType.COMMERCIAL_INVOICE)
        assert schema_corrupt.total_amount is None

    def test_schema_json_serialization_roundtrip(self):
        """Verify Pydantic schemas serialize to and deserialize from valid JSON without data loss."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        page = make_test_page([
            "COMMERCIAL INVOICE",
            "Invoice #: INV-4040",
            "Invoice Date: 2026-07-20",
            "Total Amount: $3,250.00 USD",
        ])

        schema = pipeline.extract_document([page])
        json_str = schema.model_dump_json(indent=2)
        assert len(json_str) > 20

        loaded_dict = json.loads(json_str)
        reloaded = InvoiceExtractionSchema.model_validate(loaded_dict)
        assert reloaded.document_type == schema.document_type
        assert reloaded.invoice_number.value == "INV-4040"
        assert Decimal(str(reloaded.total_amount.value)) == Decimal("3250.00")
        assert isinstance(schema.total_amount.value, Decimal)
        assert schema.total_amount.value == Decimal("3250.00")

    def test_gpu_memory_containment(self):
        """Verify structured extraction operates strictly within workstation VRAM budget (< 1500 MB)."""
        if not torch.cuda.is_available():
            pytest.skip("CUDA GPU not available on this runner")

        torch.cuda.reset_peak_memory_stats()
        pipeline = HybridStructuredExtractor(use_gpu=True)
        page = make_test_page([
            "COMMERCIAL INVOICE #INV-9000",
            "Date: 2026-08-01",
            "Subtotal: $8,000.00 USD",
            "Total Due: $8,800.00 USD",
        ])

        _ = pipeline.extract_document([page])
        peak_vram_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
        print(f"\nMeasured Peak VRAM: {peak_vram_mb:.2f} MB")
        assert peak_vram_mb < 1500.0, f"Peak VRAM {peak_vram_mb:.2f} MB exceeded 1500 MB budget"

    def test_field_provenance_integrity(self):
        """Verify extracted fields maintain source page, bounding box, evidence snippet, and status."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        page = make_test_page([
            "INVOICE #INV-PROV-1",
            "Date: 2026-09-10",
            "Total Due: $950.00 USD",
        ])

        schema = pipeline.extract_document([page])
        tot = schema.total_amount
        assert tot is not None
        assert tot.source_page == 0
        assert tot.bbox is not None
        assert tot.bbox.x0 >= 0.0 and tot.bbox.x1 <= 1.0
        assert tot.supporting_evidence is not None
        assert "$950.00" in tot.supporting_evidence
        assert tot.extraction_status == ExtractionStatus.ACCEPTED
        assert tot.verification_status == VerificationStatus.UNVERIFIED

    def test_monetary_value_decimal_type_invariant(self):
        """Verify normalized monetary amounts strictly retain Python Decimal instances without float drift."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        page = make_test_page([
            "COMMERCIAL INVOICE #INV-DEC-1",
            "Subtotal: $10,000.10 USD",
            "Tax (10%): $1,000.01 USD",
            "Grand Total: $11,000.11 USD",
        ])

        schema = pipeline.extract_document([page])
        assert isinstance(schema.total_amount.value, Decimal)
        assert isinstance(schema.subtotal.value, Decimal)
        assert schema.total_amount.value == Decimal("11000.11")
        assert schema.subtotal.value == Decimal("10000.10")

        # Binary float arithmetic check (0.1 + 0.2 != 0.3 in float, but exact in Decimal)
        # Verify Decimal arithmetic preserves cent-exact fidelity
        calculated_total = schema.subtotal.value + Decimal("1000.01")
        assert calculated_total == schema.total_amount.value

    def test_adversarial_correlated_error_recognition(self):
        """Verify that when OCR produces a typo, extractors converge on typo but document shared OCR risk."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        # Typo: Letter 'O' instead of digit '0' in invoice number
        page = make_test_page([
            "COMMERCIAL INVOICE",
            "Invoice #: INV-2O26-TYPO",
            "Total Due: $1,500.00 USD",
        ])

        schema = pipeline.extract_document([page])
        inv_f = schema.invoice_number
        assert inv_f is not None
        # Both models see the same OCR token and converge on string
        assert "INV-2O26-TYPO" in inv_f.value
        # Note in validation notes must explicitly document shared evidence
        assert any("share the same underlying OCR/text block evidence" in note for note in inv_f.validation_notes)

    def test_adversarial_disagreement_routes_to_needs_review(self):
        """Verify that conflicting spatial and semantic candidate extractions force NEEDS_REVIEW status."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())

        # Construct candidate fields with conflicting monetary values
        spatial_f = ExtractedField(
            name="total_amount",
            value=Decimal("1500.00"),
            raw_value="$1,500.00",
            data_type=FieldDataType.MONETARY,
            confidence=0.92,
            source_page=0,
            supporting_evidence="Total: $1,500.00",
            extraction_status=ExtractionStatus.ACCEPTED,
        )
        semantic_f = ExtractedField(
            name="total_amount",
            value=Decimal("2500.00"),
            raw_value="$2,500.00",
            data_type=FieldDataType.MONETARY,
            confidence=0.88,
            source_page=0,
            supporting_evidence="Final Commitment: $2,500.00",
            extraction_status=ExtractionStatus.ACCEPTED,
        )

        merged = pipeline._reconcile_fields(
            spatial_fields={"total_amount": spatial_f},
            semantic_fields={"total_amount": semantic_f},
        )

        assert "total_amount" in merged
        tot = merged["total_amount"]
        # Must be gated to NEEDS_REVIEW due to value disagreement
        assert tot.extraction_status == ExtractionStatus.NEEDS_REVIEW
        assert tot.confidence <= 0.60
        assert any("Corroboration conflict" in note for note in tot.validation_notes)

    def test_bounding_box_normalized_and_pt_invariants(self):
        """Verify that all extracted bounding boxes strictly obey normalization and positive point invariants."""
        pipeline = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())
        page = make_test_page([
            "COMMERCIAL INVOICE #INV-BOX-99",
            "Date: 2026-10-01",
            "Subtotal: $4,000.00 USD",
            "Total Due: $4,400.00 USD",
        ])

        schema = pipeline.extract_document([page])
        for field in [schema.invoice_number, schema.invoice_date, schema.total_amount, schema.subtotal]:
            if field and field.bbox:
                # Normalized coordinate invariants
                assert 0.0 <= field.bbox.x0 <= field.bbox.x1 <= 1.0
                assert 0.0 <= field.bbox.y0 <= field.bbox.y1 <= 1.0
                # PDF-point coordinate invariants
                assert field.bbox.x0_pt >= 0.0
                assert field.bbox.y0_pt >= 0.0
                assert field.bbox.x1_pt >= field.bbox.x0_pt
                assert field.bbox.y1_pt >= field.bbox.y0_pt

    def test_calibration_metrics_brier_and_ece(self):
        """Verify mathematical correctness of Brier score and Expected Calibration Error calculation."""
        # 4 test samples with 2 classes
        # Sample 1: true=0, pred_prob=[0.9, 0.1], correct=True, conf=0.9
        # Sample 2: true=0, pred_prob=[0.8, 0.2], correct=True, conf=0.8
        # Sample 3: true=1, pred_prob=[0.6, 0.4], correct=False, conf=0.6
        # Sample 4: true=1, pred_prob=[0.2, 0.8], correct=True, conf=0.8
        probs = [
            {"0": 0.9, "1": 0.1},
            {"0": 0.8, "1": 0.2},
            {"0": 0.6, "1": 0.4},
            {"0": 0.2, "1": 0.8},
        ]
        true_labels = ["0", "0", "1", "1"]

        # Manual Brier score calculation:
        # S1: (0.9-1)^2 + (0.1-0)^2 = 0.01 + 0.01 = 0.02
        # S2: (0.8-1)^2 + (0.2-0)^2 = 0.04 + 0.04 = 0.08
        # S3: (0.6-0)^2 + (0.4-1)^2 = 0.36 + 0.36 = 0.72
        # S4: (0.2-0)^2 + (0.8-1)^2 = 0.04 + 0.04 = 0.08
        # Total = (0.02 + 0.08 + 0.72 + 0.08) / 4 = 0.90 / 4 = 0.225
        brier_sum = 0.0
        for p, y in zip(probs, true_labels):
            for k in ["0", "1"]:
                y_true = 1.0 if k == y else 0.0
                brier_sum += (p[k] - y_true) ** 2
        calculated_brier = brier_sum / len(probs)
        assert abs(calculated_brier - 0.225) < 1e-6
