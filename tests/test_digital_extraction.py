"""
Unit and integration tests for digital PDF extraction, XY-cut reading order,
confidence-based page classification, and tabular extraction (XLSX formulas vs cached values, CSV).
"""
import io
import zipfile
import pytest
import PIL.Image
import openpyxl
import polars as pl
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
import ctypes

from src.intelligence.evaluation import (
    build_labeled_classification_benchmark,
    evaluate_page_classifier,
)
from src.intelligence.models import (
    PageClassification,
)
from src.intelligence.pdf_extractor import (
    extract_digital_page,
    extract_pdf_document,
)
from src.intelligence.spreadsheet_extractor import SpreadsheetExtractor
from src.intelligence.xy_cut import sort_text_blocks_reading_order


def _create_synthetic_pdf(
    text_items=None,
    add_image: bool = False,
    image_bbox=(50, 50, 250, 250),
    page_size=(612.0, 792.0),
) -> bytes:
    """Helper to generate in-memory PDF with text objects and optional raster image."""
    doc = pdfium.PdfDocument.new()
    page = doc.new_page(*page_size)
    font = pdfium.PdfFont.load_standard(doc, "Helvetica")

    if text_items:
        for text, x, y, size in text_items:
            raw_obj = pdfium_c.FPDFPageObj_CreateTextObj(doc.raw, font.raw, float(size))
            tb = pdfium.PdfTextObj(raw_obj, None, doc)
            u16 = (ctypes.c_ushort * (len(text) + 1))(*[ord(c) for c in text], 0)
            pdfium_c.FPDFText_SetText(raw_obj, u16)
            tb.transform(pdfium.PdfMatrix(1, 0, 0, 1, x, y))
            page.insert_obj(tb)

    if add_image:
        # Create PIL Image
        img_w = int(image_bbox[2] - image_bbox[0])
        img_h = int(image_bbox[3] - image_bbox[1])
        img = PIL.Image.new("RGB", (img_w, img_h), color=(200, 100, 50))
        bio = io.BytesIO()
        img.save(bio, format="JPEG")
        bio.seek(0)

        img_obj = pdfium.PdfImage.new(doc)
        img_obj.load_jpeg(bio)
        img_obj.transform(pdfium.PdfMatrix(img_w, 0, 0, img_h, image_bbox[0], image_bbox[1]))
        page.insert_obj(img_obj)

    page.gen_content()
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


class TestDigitalExtractionAndClassification:
    """Test suite for PDF extraction, classification, and tabular parsing."""

    def test_page_classification_digital_text(self):
        """Verify page with rich native text and no raster images is classified as DIGITAL_TEXT."""
        text_content = [
            ("INVOICE #INV-2026-0042", 50.0, 720.0, 16.0),
            ("Billed To: Global Logistics Inc", 50.0, 680.0, 12.0),
            ("Payment Terms: Net 30 Days from invoice date", 50.0, 650.0, 12.0),
            ("Item 1: Enterprise Platform Annual Subscription", 50.0, 600.0, 11.0),
            ("Subtotal: $24,500.00  Tax: $2,450.00  Total: $26,950.00", 50.0, 550.0, 12.0),
        ]
        pdf_bytes = _create_synthetic_pdf(text_items=text_content, add_image=False)
        result = extract_pdf_document(pdf_bytes)

        assert result.page_count == 1
        page = result.pages[0]
        assert page.classification == PageClassification.DIGITAL_TEXT
        assert page.classification_confidence >= 0.85
        assert not page.is_hybrid
        assert "INVOICE #INV-2026-0042" in page.digital_text
        assert page.metadata["image_objects_count"] == 0

    def test_page_classification_scanned_image(self):
        """Verify page with large raster image and 0 digital characters is classified as SCANNED_IMAGE."""
        # Raster image occupying large portion of page (400 x 600 pt)
        pdf_bytes = _create_synthetic_pdf(
            text_items=None,
            add_image=True,
            image_bbox=(50.0, 50.0, 550.0, 700.0),
        )
        result = extract_pdf_document(pdf_bytes)

        assert result.page_count == 1
        page = result.pages[0]
        assert page.classification == PageClassification.SCANNED_IMAGE
        assert page.classification_confidence >= 0.90
        assert page.digital_text == ""
        assert len(page.digital_blocks) == 0
        assert page.metadata["image_objects_count"] == 1
        assert page.metadata["image_area_ratio"] > 0.40

    def test_page_classification_hybrid(self):
        """Verify page with digital text AND significant raster image is classified as HYBRID."""
        text_content = [
            ("Official Purchase Order - Approved with Seal", 50.0, 720.0, 14.0),
            ("Vendor: Apex Industrial Supplies", 50.0, 680.0, 11.0),
            ("Authorized Total: $8,420.00", 50.0, 640.0, 12.0),
        ]
        # Embedded stamp image (250 x 250 pt on 612 x 792 pt page = ~13% to 20% area)
        pdf_bytes = _create_synthetic_pdf(
            text_items=text_content,
            add_image=True,
            image_bbox=(200.0, 200.0, 500.0, 500.0),
        )
        result = extract_pdf_document(pdf_bytes)

        assert result.page_count == 1
        page = result.pages[0]
        assert page.classification == PageClassification.HYBRID
        assert page.is_hybrid is True
        assert page.classification_confidence >= 0.85
        assert "Purchase Order" in page.digital_text
        assert page.metadata["image_objects_count"] == 1
        assert page.metadata["image_area_ratio"] > 0.15

    def test_xy_cut_reading_order_preservation(self):
        """Verify XY-cut prevents interleaving across multi-column layout."""
        # Construct two side-by-side columns:
        # Left column: (Bill To, Acme Corp) at x = 50 pt
        # Right column: (Ship To, Beta LLC) at x = 350 pt
        text_content = [
            ("Bill To:", 50.0, 680.0, 12.0),
            ("Ship To:", 350.0, 680.0, 12.0),
            ("Acme Corporation", 50.0, 650.0, 11.0),
            ("Beta Logistics LLC", 350.0, 650.0, 11.0),
            ("100 Industrial Parkway", 50.0, 620.0, 10.0),
            ("500 Harbor Boulevard", 350.0, 620.0, 10.0),
        ]
        pdf_bytes = _create_synthetic_pdf(text_items=text_content)
        result = extract_pdf_document(pdf_bytes)

        page = result.pages[0]
        extracted_text = page.digital_text

        # Verify left column block is ordered before right column block
        bill_to_pos = extracted_text.find("Bill To:")
        acme_pos = extracted_text.find("Acme Corporation")
        ship_to_pos = extracted_text.find("Ship To:")
        beta_pos = extracted_text.find("Beta Logistics LLC")

        assert bill_to_pos != -1
        assert acme_pos != -1
        assert ship_to_pos != -1
        assert beta_pos != -1

        # Left column items must appear before right column items
        assert acme_pos < ship_to_pos, "XY-Cut failed: Right column interleaved before Left column completed!"

    def test_multi_page_document_aggregation(self):
        """Verify multi-page document aggregates page results and assigns overall classification."""
        doc = pdfium.PdfDocument.new()
        font = pdfium.PdfFont.load_standard(doc, "Helvetica")

        # Page 1: Digital text
        p1 = doc.new_page(612, 792)
        raw_obj = pdfium_c.FPDFPageObj_CreateTextObj(doc.raw, font.raw, 14.0)
        tb1 = pdfium.PdfTextObj(raw_obj, None, doc)
        u16_1 = (ctypes.c_ushort * 15)(*[ord(c) for c in "Page 1 Digital"], 0)
        pdfium_c.FPDFText_SetText(raw_obj, u16_1)
        tb1.transform(pdfium.PdfMatrix(1, 0, 0, 1, 50, 700))
        p1.insert_obj(tb1)
        p1.gen_content()
        p1.close()

        # Page 2: Scanned image
        p2 = doc.new_page(612, 792)
        img = PIL.Image.new("RGB", (300, 300), color=(128, 128, 128))
        bio = io.BytesIO()
        img.save(bio, format="JPEG")
        bio.seek(0)
        img_obj = pdfium.PdfImage.new(doc)
        img_obj.load_jpeg(bio)
        img_obj.transform(pdfium.PdfMatrix(400, 0, 0, 400, 50, 200))
        p2.insert_obj(img_obj)
        p2.gen_content()
        p2.close()

        out_bio = io.BytesIO()
        doc.save(out_bio)
        doc.close()

        result = extract_pdf_document(out_bio.getvalue())
        assert result.page_count == 2
        assert result.pages[0].classification == PageClassification.DIGITAL_TEXT
        assert result.pages[1].classification == PageClassification.SCANNED_IMAGE
        assert result.overall_classification == PageClassification.HYBRID
        assert "--- Page 1 (DIGITAL_TEXT) ---" in result.full_text
        assert "--- Page 2 (SCANNED_IMAGE) ---" in result.full_text

    def test_xlsx_formula_cached_value_separation(self):
        """
        Verify XLSX extraction preserves formulas and cached values separately,
        and correctly flags formula_cached_value_missing = True when cached value is absent.
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Financials"

        ws["A1"] = 100.0
        ws["A2"] = 200.0
        # Formula 1: will have missing cached value
        ws["A3"] = "=A1+A2"
        # Formula 2: will have injected cached value
        ws["B1"] = 50.0
        ws["B2"] = 50.0
        ws["B3"] = "=B1+B2"

        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)

        # Inject cached value for B3 in the XML (<f>B1+B2</f><v>100</v>)
        in_zf = zipfile.ZipFile(bio, "r")
        out_bio = io.BytesIO()
        out_zf = zipfile.ZipFile(out_bio, "w", compression=zipfile.ZIP_DEFLATED)
        for item in in_zf.infolist():
            data = in_zf.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                data = data.replace(b"<f>B1+B2</f>", b"<f>B1+B2</f><v>100</v>")
            out_zf.writestr(item, data)
        in_zf.close()
        out_zf.close()

        out_bio.seek(0)
        res = SpreadsheetExtractor.extract_xlsx(out_bio)

        assert len(res.sheets) == 1
        sheet = res.sheets[0]
        assert sheet.sheet_name == "Financials"
        assert res.total_formulas == 2
        assert res.total_missing_cached_formulas == 1

        cells_by_coord = {c.coordinate: c for c in sheet.cells}

        # Check A3 (formula without cached value)
        cell_a3 = cells_by_coord["A3"]
        assert cell_a3.is_formula is True
        assert cell_a3.formula == "=A1+A2"
        assert cell_a3.cached_value is None
        assert cell_a3.formula_cached_value_missing is True

        # Check B3 (formula WITH cached value)
        cell_b3 = cells_by_coord["B3"]
        assert cell_b3.is_formula is True
        assert cell_b3.formula == "=B1+B2"
        assert cell_b3.cached_value == 100
        assert cell_b3.formula_cached_value_missing is False

        # Check A1 (plain numerical value)
        cell_a1 = cells_by_coord["A1"]
        assert cell_a1.is_formula is False
        assert cell_a1.raw_value == 100.0
        assert cell_a1.cached_value == 100.0
        assert cell_a1.formula_cached_value_missing is False

    def test_csv_extraction_with_polars(self):
        """Verify CSV extraction via Polars produces typed schema, row counts, null counts, and markdown."""
        csv_data = (
            "InvoiceNumber,Vendor,Amount,TaxRate,PaymentDate,Notes\n"
            "INV-1001,Acme Corp,1500.50,0.10,2026-05-01,Paid in full\n"
            "INV-1002,Beta LLC,3200.00,0.08,2026-05-03,\n"
            "INV-1003,Gamma Inc,850.75,0.05,,Overdue\n"
        ).encode("utf-8")

        res = SpreadsheetExtractor.extract_csv(csv_data)

        assert res.row_count == 3
        assert res.column_count == 6
        assert "InvoiceNumber" in res.headers
        assert "Amount" in res.headers
        assert res.null_counts["PaymentDate"] == 1
        assert res.null_counts["Notes"] == 1
        assert len(res.records) == 3
        assert res.records[0]["InvoiceNumber"] == "INV-1001"
        assert res.records[0]["Amount"] == 1500.50

        # Verify Markdown table contains headers and content
        assert "| InvoiceNumber | Vendor | Amount |" in res.markdown_table
        assert "INV-1001" in res.markdown_table
        assert "Acme Corp" in res.markdown_table

    def test_labeled_dataset_classification_metrics(self):
        """
        Verify page classifier on labeled empirical dataset.
        Computes accuracy, per-class Precision, Recall, F1, and Confusion Matrix.
        """
        dataset = build_labeled_classification_benchmark()
        assert len(dataset) >= 9

        report = evaluate_page_classifier(dataset)

        assert report.total_samples == len(dataset)
        assert report.accuracy >= 0.90, f"Classification accuracy {report.accuracy} below 90% threshold"
        assert report.average_heuristic_confidence >= 0.80

        # Verify all 3 classes are evaluated in confusion matrix
        for cls_name in ["DIGITAL_TEXT", "SCANNED_IMAGE", "HYBRID"]:
            assert cls_name in report.confusion_matrix
            assert report.per_class_precision[cls_name] >= 0.80
            assert report.per_class_recall[cls_name] >= 0.80
            assert report.per_class_f1[cls_name] >= 0.80

        assert len(report.misclassified_samples) == 0
