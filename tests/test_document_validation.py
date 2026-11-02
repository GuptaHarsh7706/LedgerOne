"""
Unit tests for Document Validation and Magic Signature Inspection.
"""
import io
import pytest
from PIL import Image
import pypdfium2

from src.exceptions import ValidationError
from src.services.document_validation import (
    calculate_sha256,
    detect_mime_type,
    validate_document_file,
    MAX_FILE_SIZE_BYTES,
)


def create_minimal_pdf() -> bytes:
    """Generate a valid minimal single-page PDF in memory using pypdfium2."""
    doc = pypdfium2.PdfDocument.new()
    doc.new_page(100, 100)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def create_minimal_png() -> bytes:
    """Generate a valid minimal 1x1 PNG image in memory."""
    img = Image.new("RGB", (10, 10), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_minimal_jpeg() -> bytes:
    """Generate a valid minimal 1x1 JPEG image in memory."""
    img = Image.new("RGB", (10, 10), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_magic_number_detection():
    pdf_bytes = create_minimal_pdf()
    png_bytes = create_minimal_png()
    jpg_bytes = create_minimal_jpeg()
    csv_bytes = b"id,name,amount\n1,Acme,100.50\n"
    txt_bytes = b"Simple document text content"

    assert detect_mime_type(pdf_bytes, "test.pdf") == "application/pdf"
    assert detect_mime_type(png_bytes, "photo.png") == "image/png"
    assert detect_mime_type(jpg_bytes, "photo.jpg") == "image/jpeg"
    assert detect_mime_type(csv_bytes, "data.csv") == "text/csv"
    assert detect_mime_type(txt_bytes, "readme.txt") == "text/plain"


def test_validate_valid_pdf():
    pdf_bytes = create_minimal_pdf()
    mime, sha, meta = validate_document_file(pdf_bytes, "invoice.pdf")
    assert mime == "application/pdf"
    assert len(sha) == 64
    assert meta["page_count"] == 1
    assert meta["file_size_bytes"] == len(pdf_bytes)


def test_validate_valid_image():
    png_bytes = create_minimal_png()
    mime, sha, meta = validate_document_file(png_bytes, "receipt.png")
    assert mime == "image/png"
    assert meta["width"] == 10
    assert meta["height"] == 10
    assert meta["page_count"] == 1


def test_empty_file_rejection():
    with pytest.raises(ValidationError) as exc:
        validate_document_file(b"", "empty.pdf")
    assert "File content is empty" in str(exc.value)


def test_oversized_file_rejection():
    # Test boundary check with small mock max_size
    tiny_max = 100
    oversized_data = b"0" * 200
    with pytest.raises(ValidationError) as exc:
        validate_document_file(oversized_data, "big.pdf", max_size=tiny_max)
    assert "exceeds maximum limit" in str(exc.value)


def test_corrupt_pdf_rejection():
    # Starts with %PDF but rest is corrupt garbage
    corrupt_pdf = b"%PDF-1.4\nCorrupt-binary-payload-not-a-valid-xref-or-catalog"
    with pytest.raises(ValidationError) as exc:
        validate_document_file(corrupt_pdf, "broken.pdf")
    assert "Corrupt or invalid PDF" in str(exc.value)


def test_unsupported_format_rejection():
    random_binary = b"\x00\x01\x02\x03\x04\x05\x06\x07"
    with pytest.raises(ValidationError) as exc:
        validate_document_file(random_binary, "executable.bin")
    assert "Unsupported file format" in str(exc.value)


def test_sha256_deterministic():
    content = b"Financial report quarterly ledger"
    hash1 = calculate_sha256(content)
    hash2 = calculate_sha256(content)
    assert hash1 == hash2
    assert len(hash1) == 64
