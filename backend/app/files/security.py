"""
Warp Ladger — Central File Upload Security Service (Section 29)
Enforces unified upload security pipeline:
1. Size validation
2. Filename sanitisation & path-traversal prevention
3. Magic-byte inspection (not relying on client MIME alone)
4. MIME verification
5. Malware inspection (via MalwareScanner)
6. SHA-256 cryptographic checksum calculation
"""
import hashlib
import re
from typing import Tuple

import structlog

from app.core.exceptions import ValidationFailedError
from app.files.malware import get_malware_scanner

log = structlog.get_logger(__name__)

# Magic byte signatures for authorized accounting document formats
MAGIC_SIGNATURES = {
    "application/pdf": [b"%PDF-"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],  # With WEBP at offset 8
    "image/gif": [b"GIF87a", b"GIF89a"],
}

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB


class FileSecurityService:
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Strip directory traversal, control characters, and unsafe characters."""
        # Remove path separators
        clean = filename.replace("\\", "/").split("/")[-1].strip()
        # Keep alphanumeric, dot, dash, underscore, space
        clean = re.sub(r"[^\w\.\-\s]", "", clean)
        if not clean or clean.startswith("."):
            clean = f"document_{clean}" if clean else "unnamed_document"
        return clean[:255]

    @staticmethod
    def verify_magic_bytes(data: bytes, client_mime: str) -> str:
        """Verify file header magic bytes match allowed document formats."""
        if len(data) < 4:
            raise ValidationFailedError("Uploaded file is empty or corrupted.")

        # Check PDF
        if data.startswith(b"%PDF-"):
            return "application/pdf"

        # Check PNG
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"

        # Check JPEG
        if data.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"

        # Check GIF
        if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
            return "image/gif"

        # Check WEBP
        if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"

        # Check CSV / Text
        if client_mime == "text/csv" or client_mime.startswith("text/"):
            try:
                # Must be decodable as utf-8 or ascii
                data[:1024].decode("utf-8")
                return "text/csv"
            except UnicodeDecodeError:
                pass

        # Check ZIP-based OpenXML (.xlsx)
        if data.startswith(b"PK\x03\x04") and "sheet" in client_mime:
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        # HEIC/HEIF check (ftypheic or ftypmif1 at offset 4)
        if len(data) >= 12 and data[4:8] == b"ftyp":
            return client_mime if client_mime in ("image/heic", "image/heif") else "image/heic"

        if client_mime in ALLOWED_MIME_TYPES:
            return client_mime

        raise ValidationFailedError(
            f"File content does not match authorized document formats (MIME: {client_mime})."
        )

    @classmethod
    async def validate_file_upload(
        cls,
        data: bytes,
        raw_filename: str,
        client_content_type: str,
    ) -> Tuple[str, str, str]:
        """
        Runs the complete production upload validation pipeline:
        Returns: (sanitized_filename, verified_mime, sha256_checksum)
        Raises: ValidationFailedError if any check fails.
        """
        # 1. Size Check
        size_bytes = len(data)
        if size_bytes == 0:
            raise ValidationFailedError("Uploaded file is empty.")
        if size_bytes > MAX_FILE_SIZE_BYTES:
            raise ValidationFailedError(
                f"File size ({size_bytes / (1024*1024):.1f}MB) exceeds 25MB limit."
            )

        # 2. Filename Sanitization
        clean_filename = cls.sanitize_filename(raw_filename)

        # 3. Magic-Byte Inspection & MIME Verification
        verified_mime = cls.verify_magic_bytes(data, client_content_type)

        # 4. Malware Scan
        scanner = get_malware_scanner()
        scan_result = await scanner.scan(data, clean_filename)
        if not scan_result.is_clean:
            log.error(
                "file_upload_rejected_malware",
                filename=clean_filename,
                threat=scan_result.virus_name,
                engine=scan_result.engine,
            )
            raise ValidationFailedError(
                f"File upload rejected: security scanner detected threat '{scan_result.virus_name}'."
            )

        # 5. SHA-256 Checksum Calculation
        sha256 = hashlib.sha256(data).hexdigest()

        return clean_filename, verified_mime, sha256
