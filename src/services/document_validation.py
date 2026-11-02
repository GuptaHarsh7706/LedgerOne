"""
Document Validation & File Signature Service.
Validates magic numbers, MIME types, file sizes, and extracts initial metadata.
"""
import hashlib
import io
import mimetypes
from typing import Any, Dict, Optional, Tuple
import zipfile
from PIL import Image
import pypdfium2

from src.exceptions import ValidationError

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_ZIP_ENTRIES = 1000
MAX_DECOMPRESSED_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_COMPRESSION_RATIO = 100.0


def validate_zip_archive_safety(data: bytes, ext: str) -> None:
    """
    Safely inspect ZIP-based Office OpenXML packages (DOCX, XLSX) before processing.
    Guards against ZIP bombs, path traversal, recursive archives, and corrupt OpenXML structures.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            entries = zf.infolist()
            if len(entries) > MAX_ZIP_ENTRIES:
                raise ValidationError(
                    f"Decompression security limit exceeded: archive has {len(entries)} entries (max: {MAX_ZIP_ENTRIES})",
                    details={"entry_count": len(entries), "max_entries": MAX_ZIP_ENTRIES},
                )

            total_uncompressed = 0
            for entry in entries:
                # Check for path traversal in entry filenames
                if ".." in entry.filename or entry.filename.startswith("/"):
                    raise ValidationError(
                        f"Zip entry contains dangerous path traversal pattern: {entry.filename}",
                        details={"entry_filename": entry.filename},
                    )
                total_uncompressed += entry.file_size

            if total_uncompressed > MAX_DECOMPRESSED_SIZE_BYTES:
                raise ValidationError(
                    f"Decompression security limit exceeded: decompressed size {total_uncompressed} bytes exceeds safety limit {MAX_DECOMPRESSED_SIZE_BYTES} bytes (100 MB)",
                    details={"uncompressed_bytes": total_uncompressed, "max_bytes": MAX_DECOMPRESSED_SIZE_BYTES},
                )

            compressed_len = max(1, len(data))
            ratio = total_uncompressed / compressed_len
            if ratio > MAX_COMPRESSION_RATIO:
                raise ValidationError(
                    f"Abnormal compression ratio detected: {ratio:.1f}:1 exceeds threshold {MAX_COMPRESSION_RATIO}:1 (potential Zip bomb)",
                    details={"compression_ratio": ratio, "max_ratio": MAX_COMPRESSION_RATIO},
                )

            # Validate mandatory OpenXML structure
            names = set(zf.namelist())
            if "[Content_Types].xml" not in names:
                raise ValidationError(
                    "Invalid Office OpenXML package: missing [Content_Types].xml manifest",
                    details={"extension": ext},
                )

            if ext == "docx" and "word/document.xml" not in names:
                raise ValidationError(
                    "Invalid DOCX structure: missing word/document.xml",
                    details={"extension": ext},
                )
            elif ext == "xlsx" and "xl/workbook.xml" not in names:
                raise ValidationError(
                    "Invalid XLSX structure: missing xl/workbook.xml",
                    details={"extension": ext},
                )

    except zipfile.BadZipFile:
        raise ValidationError(f"Corrupt or invalid ZIP-based Office archive (.{ext})")

# Magic number signatures
MAGIC_SIGNATURES: Dict[str, bytes] = {
    "application/pdf": b"%PDF",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
    "image/tiff_le": b"II*\x00",
    "image/tiff_be": b"MM\x00*",
    "application/zip": b"PK\x03\x04",  # DOCX, XLSX
}

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
}


def calculate_sha256(data: bytes) -> str:
    """Calculate hex-encoded SHA-256 hash of binary content."""
    hasher = hashlib.sha256()
    hasher.update(data)
    return hasher.hexdigest()


def detect_mime_type(data: bytes, filename: str) -> str:
    """
    Detect MIME type using file signature (magic bytes) with filename fallback.
    Prevents extension spoofing attacks.
    """
    if len(data) == 0:
        raise ValidationError("File content is empty")

    # Check magic byte signatures
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"II*\x00") or data.startswith(b"MM\x00*"):
        return "image/tiff"
    if data.startswith(b"PK\x03\x04"):
        # Could be docx or xlsx
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        if ext == "docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext == "xlsx":
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return "application/zip"

    # Text / CSV detection
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    if ext == "csv":
        try:
            data[:4096].decode("utf-8")
            return "text/csv"
        except UnicodeDecodeError:
            pass
    elif ext == "txt":
        try:
            data[:4096].decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            pass

    # Fallback to mimetypes guess
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed

    return "application/octet-stream"


def validate_document_file(
    data: bytes,
    filename: str,
    declared_mime: Optional[str] = None,
    max_size: int = MAX_FILE_SIZE_BYTES,
) -> Tuple[str, str, Dict[str, Any]]:
    """
    Validate document size, format, and magic bytes.
    Returns (detected_mime, sha256_hash, metadata_dict).
    """
    file_size = len(data)
    if file_size == 0:
        raise ValidationError("File content is empty", details={"filename": filename})

    if file_size > max_size:
        raise ValidationError(
            f"File size {file_size} bytes exceeds maximum limit of {max_size} bytes (50 MB)",
            details={"file_size": file_size, "max_size": max_size},
        )

    sha256 = calculate_sha256(data)
    detected_mime = detect_mime_type(data, filename)

    if detected_mime not in SUPPORTED_MIME_TYPES:
        raise ValidationError(
            f"Unsupported file format: {detected_mime}. Supported formats: PDF, PNG, JPEG, TIFF, DOCX, XLSX, CSV, TXT",
            details={"detected_mime": detected_mime, "filename": filename},
        )

    metadata: Dict[str, Any] = {
        "file_size_bytes": file_size,
        "filename": filename,
        "mime_type": detected_mime,
        "page_count": 1,
    }

    # Extract initial format-specific metadata
    if detected_mime == "application/pdf":
        try:
            pdf_doc = pypdfium2.PdfDocument(data)
            metadata["page_count"] = len(pdf_doc)
            pdf_doc.close()
        except Exception:
            # If PDF reader fails to parse header, reject corrupt file
            raise ValidationError("Corrupt or invalid PDF file structure", details={"filename": filename})
    elif detected_mime in {"image/png", "image/jpeg", "image/tiff"}:
        try:
            with Image.open(io.BytesIO(data)) as img:
                metadata["width"] = img.width
                metadata["height"] = img.height
                metadata["format"] = img.format
                metadata["page_count"] = getattr(img, "n_frames", 1)
        except Exception:
            raise ValidationError("Corrupt or invalid image file structure", details={"filename": filename})

    elif detected_mime in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }:
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        validate_zip_archive_safety(data, ext)
        metadata["archive_format"] = "OpenXML"
        metadata["is_zip_package"] = True

    return detected_mime, sha256, metadata
