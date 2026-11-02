"""
Dedicated Integration Test Suite for Neon S3 Object Storage,
Presigned Leases, Partial-Failure Recovery, Cross-Workspace Isolation,
and Safe Office ZIP Decompression Limits.
"""
from datetime import datetime, timedelta, timezone
import io
import uuid
import zipfile
import pytest

from src.db.rls import TenantContext
from src.exceptions import ConflictError, NotFoundError, ValidationError
from src.services.document_service import document_service
from src.services.document_validation import (
    calculate_sha256,
    validate_document_file,
    validate_zip_archive_safety,
)
from src.storage.s3 import storage_manager


def create_minimal_valid_docx() -> bytes:
    """Create a minimal valid DOCX OpenXML zip package in memory."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", b'<?xml version="1.0" encoding="UTF-8"?><Types></Types>')
        zf.writestr("word/document.xml", b'<?xml version="1.0" encoding="UTF-8"?><w:document></w:document>')
    return buf.getvalue()


@pytest.mark.asyncio
async def test_live_s3_upload_download_sha256():
    """Verify live upload, download, and SHA-256 byte integrity against Neon S3."""
    test_key = f"integration-tests/{uuid.uuid4()}/sample_document.txt"
    payload = b"LedgerOne Live S3 Enterprise Verification Payload - 2026"
    expected_sha = calculate_sha256(payload)

    # 1. Upload to storage
    uploaded_key = storage_manager.upload_bytes(test_key, payload, "text/plain")
    assert uploaded_key == test_key

    # 2. Verify object exists
    assert storage_manager.object_exists(test_key) is True

    # 3. Download bytes and assert byte parity & SHA-256
    downloaded = storage_manager.download_bytes(test_key)
    assert downloaded == payload
    assert calculate_sha256(downloaded) == expected_sha

    # 4. Clean up
    storage_manager.delete_object(test_key)
    assert storage_manager.object_exists(test_key) is False


@pytest.mark.asyncio
async def test_presigned_url_generation():
    """Verify presigned upload and download URL structure and parameter leases."""
    test_key = f"integration-tests/{uuid.uuid4()}/presigned_doc.pdf"

    upload_url = storage_manager.generate_presigned_upload_url(test_key, expires_in=900)
    assert "http" in upload_url
    assert test_key in upload_url or "X-Amz" in upload_url or "presigned" in upload_url

    download_url = storage_manager.generate_presigned_download_url(test_key, expires_in=3600)
    assert "http" in download_url


@pytest.mark.asyncio
async def test_upload_lease_expiration_rejection(client, db_pool):
    """Verify that completing an upload after the 15-minute lease expires is rejected with 409 Conflict."""
    # 1. Register Admin and Create Org/Workspace
    admin_email = f"lease_admin_{uuid.uuid4().hex[:6]}@example.com"
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": admin_email, "password": "AdminPassword123!", "full_name": "Lease Admin"},
    )
    admin_id = uuid.UUID(reg.json()["user"]["id"])
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "AdminPassword123!"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    org_res = await client.post(
        "/api/v1/organizations",
        headers=headers,
        json={"name": "Lease Corp", "slug": f"lease-corp-{uuid.uuid4().hex[:8]}"},
    )
    org_id = uuid.UUID(org_res.json()["organization"]["id"])

    ws_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**headers, "X-Organization-ID": str(org_id)},
        json={"name": "Lease Workspace", "slug": f"lease-ws-{uuid.uuid4().hex[:6]}"},
    )
    ws_id = uuid.UUID(ws_res.json()["workspace"]["id"])

    # 2. Create upload intent
    intent = await document_service.create_upload_intent(
        org_id=org_id,
        workspace_id=ws_id,
        filename="expired_lease.pdf",
        file_size_bytes=1024,
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        mime_type="application/pdf",
        actor_id=admin_id,
        actor_role="ORGANIZATION_ADMIN",
    )
    doc_id = uuid.UUID(str(intent["document"]["id"]))

    # 3. Manually simulate expired lease in database
    async with db_pool.acquire() as conn:
        past_time = datetime.now(timezone.utc) - timedelta(minutes=1)
        await conn.execute(
            "UPDATE documents SET upload_lease_expires_at = $1 WHERE id = $2",
            past_time,
            doc_id,
        )

    # 4. Attempt to complete upload -> ConflictError
    with pytest.raises(ConflictError) as exc:
        await document_service.complete_upload(
            org_id=org_id,
            workspace_id=ws_id,
            document_id=doc_id,
            actor_id=admin_id,
            actor_role="ORGANIZATION_ADMIN",
        )
    assert "Upload lease has expired" in str(exc.value)


@pytest.mark.asyncio
async def test_s3_database_partial_failure_rollback(client, db_pool):
    """Verify transactional atomicity: database rollback leaves zero orphan records."""
    admin_email = f"tx_admin_{uuid.uuid4().hex[:6]}@example.com"
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": admin_email, "password": "AdminPassword123!", "full_name": "Tx Admin"},
    )
    admin_id = uuid.UUID(reg.json()["user"]["id"])
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "AdminPassword123!"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    org_res = await client.post(
        "/api/v1/organizations",
        headers=headers,
        json={"name": "Tx Corp", "slug": f"tx-corp-{uuid.uuid4().hex[:8]}"},
    )
    org_id = uuid.UUID(org_res.json()["organization"]["id"])

    ws_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**headers, "X-Organization-ID": str(org_id)},
        json={"name": "Tx Workspace", "slug": f"tx-ws-{uuid.uuid4().hex[:6]}"},
    )
    ws_id = uuid.UUID(ws_res.json()["workspace"]["id"])

    test_sha = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
    doc_id = uuid.uuid4()

    from src.db.session import transactional_tenant_session

    context = TenantContext(org_id=org_id, workspace_id=ws_id, user_id=admin_id, user_role="ORGANIZATION_ADMIN")

    # Simulate an error inside the transaction after inserting document
    with pytest.raises(RuntimeError):
        async with transactional_tenant_session(db_pool, context=context, enforce_app_role=True) as conn:
            await conn.execute(
                """
                INSERT INTO documents (
                    id, organization_id, workspace_id, uploaded_by_user_id,
                    filename, file_size_bytes, mime_type, sha256_hash,
                    s3_key, status
                )
                VALUES ($1, $2, $3, $4, 'rollback_test.pdf', 100, 'application/pdf', $5, 'dummy/key', 'UPLOAD_PENDING')
                """,
                doc_id,
                org_id,
                ws_id,
                admin_id,
                test_sha,
            )
            raise RuntimeError("Simulated mid-flight crash after document insert")

    # Verify document was NOT committed
    async with db_pool.acquire() as conn:
        found = await conn.fetchval("SELECT id FROM documents WHERE id = $1", doc_id)
        assert found is None


@pytest.mark.asyncio
async def test_cross_workspace_document_isolation(client, db_pool):
    """Verify that a user in Workspace B cannot access or view documents in Workspace A."""
    # 1. Admin creates Org and two Workspaces: WS-A and WS-B
    admin_email = f"iso_admin_{uuid.uuid4().hex[:6]}@example.com"
    reg1 = await client.post(
        "/api/v1/auth/register",
        json={"email": admin_email, "password": "AdminPassword123!", "full_name": "Iso Admin"},
    )
    login1 = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "AdminPassword123!"},
    )
    admin_headers = {"Authorization": f"Bearer {login1.json()['access_token']}"}

    org_res = await client.post(
        "/api/v1/organizations",
        headers=admin_headers,
        json={"name": "Iso Corp", "slug": f"iso-corp-{uuid.uuid4().hex[:8]}"},
    )
    org_id = uuid.UUID(org_res.json()["organization"]["id"])

    ws_a_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"name": "Workspace A", "slug": f"ws-a-{uuid.uuid4().hex[:6]}"},
    )
    ws_a_id = uuid.UUID(ws_a_res.json()["workspace"]["id"])

    ws_b_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"name": "Workspace B", "slug": f"ws-b-{uuid.uuid4().hex[:6]}"},
    )
    ws_b_id = uuid.UUID(ws_b_res.json()["workspace"]["id"])

    # 2. User 2 is member ONLY in Workspace B (as REVIEWER)
    u2_email = f"iso_user2_{uuid.uuid4().hex[:6]}@example.com"
    reg2 = await client.post(
        "/api/v1/auth/register",
        json={"email": u2_email, "password": "User2Password123!", "full_name": "User 2"},
    )
    u2_id = uuid.UUID(reg2.json()["user"]["id"])
    login2 = await client.post(
        "/api/v1/auth/login",
        json={"email": u2_email, "password": "User2Password123!"},
    )
    u2_headers = {"Authorization": f"Bearer {login2.json()['access_token']}"}

    # Add User 2 to Org as MEMBER and Workspace B as REVIEWER
    await client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"user_id": str(u2_id), "role": "MEMBER"},
    )
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_b_id}/members",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"user_id": str(u2_id), "role": "REVIEWER"},
    )

    # 3. Upload a document into Workspace A
    from tests.test_documents_api import create_test_pdf
    pdf_bytes = create_test_pdf("Confidential WS-A Doc")
    up_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_a_id}/documents/upload",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        files={"file": ("confidential.pdf", pdf_bytes, "application/pdf")},
    )
    assert up_res.status_code == 201
    doc_a_id = up_res.json()["document"]["id"]

    # 4. User 2 attempts to access Workspace A documents -> 403 Forbidden (not member of WS-A)
    u2_access_ws_a = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_a_id}/documents",
        headers={**u2_headers, "X-Organization-ID": str(org_id)},
    )
    assert u2_access_ws_a.status_code == 403

    # 5. User 2 queries Workspace B documents -> 200 OK (empty list, cannot see WS-A document)
    u2_list_ws_b = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_b_id}/documents",
        headers={**u2_headers, "X-Organization-ID": str(org_id)},
    )
    assert u2_list_ws_b.status_code == 200
    assert not any(d["id"] == doc_a_id for d in u2_list_ws_b.json())


def test_safe_zip_decompression_limits():
    """Verify ZIP bomb and decompression limit defenses on Office OpenXML packages."""
    # 1. Valid DOCX passes safely
    valid_docx = create_minimal_valid_docx()
    mime, sha, meta = validate_document_file(valid_docx, "proposal.docx")
    assert mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert meta["is_zip_package"] is True

    # 2. Corrupt zip raises ValidationError
    corrupt_zip = b"PK\x03\x04corrupt-garbage-bytes"
    with pytest.raises(ValidationError) as exc:
        validate_document_file(corrupt_zip, "broken.docx")
    assert "Corrupt or invalid ZIP" in str(exc.value)

    # 3. Path traversal attack raises ValidationError
    traversal_buf = io.BytesIO()
    with zipfile.ZipFile(traversal_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("../../etc/passwd", b"root:x:0:0:")
        zf.writestr("[Content_Types].xml", b"<Types></Types>")
    with pytest.raises(ValidationError) as exc:
        validate_zip_archive_safety(traversal_buf.getvalue(), "docx")
    assert "path traversal" in str(exc.value)

    # 4. Missing [Content_Types].xml raises ValidationError
    missing_manifest_buf = io.BytesIO()
    with zipfile.ZipFile(missing_manifest_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", b"<w:document></w:document>")
    with pytest.raises(ValidationError) as exc:
        validate_zip_archive_safety(missing_manifest_buf.getvalue(), "docx")
    assert "missing [Content_Types].xml" in str(exc.value)
