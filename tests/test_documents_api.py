"""
Integration tests for Document Management API, two-stage upload, duplicate detection,
and RBAC permissions on live Neon PostgreSQL.
"""
import io
import uuid
import pytest
import pypdfium2

from src.services.document_validation import calculate_sha256


def create_test_pdf(title: str = "Test Ledger") -> bytes:
    """Generate a valid minimal PDF with specific title content for testing."""
    doc = pypdfium2.PdfDocument.new()
    doc.new_page(100, 100)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


@pytest.mark.asyncio
async def test_document_lifecycle_and_rbac(client, db_pool):
    # 1. Setup Admin User
    admin_email = f"doc_admin_{uuid.uuid4().hex[:6]}@example.com"
    u1_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": admin_email, "password": "AdminPassword123!", "full_name": "Doc Admin"},
    )
    admin_id = uuid.UUID(u1_reg.json()["user"]["id"])
    u1_login = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "AdminPassword123!"},
    )
    admin_token = u1_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Setup Viewer User
    viewer_email = f"doc_viewer_{uuid.uuid4().hex[:6]}@example.com"
    u2_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": viewer_email, "password": "ViewerPassword123!", "full_name": "Doc Viewer"},
    )
    viewer_id = uuid.UUID(u2_reg.json()["user"]["id"])
    u2_login = await client.post(
        "/api/v1/auth/login",
        json={"email": viewer_email, "password": "ViewerPassword123!"},
    )
    viewer_token = u2_login.json()["access_token"]
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    # 3. Create Org and Workspace
    org_res = await client.post(
        "/api/v1/organizations",
        headers=admin_headers,
        json={"name": "Document Corp", "slug": f"doc-corp-{uuid.uuid4().hex[:8]}"},
    )
    assert org_res.status_code == 201
    org_id = uuid.UUID(org_res.json()["organization"]["id"])

    ws_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"name": "Financial Workspace", "slug": f"fin-ws-{uuid.uuid4().hex[:6]}"},
    )
    assert ws_res.status_code == 201
    ws_id = uuid.UUID(ws_res.json()["workspace"]["id"])

    # Add viewer to org and workspace with VIEWER role
    await client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"user_id": str(viewer_id), "role": "MEMBER"},
    )
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/members",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"user_id": str(viewer_id), "role": "VIEWER"},
    )

    pdf_bytes = create_test_pdf("Invoice #1001")
    pdf_sha = calculate_sha256(pdf_bytes)

    # 4. Direct Upload of valid PDF by Admin -> 201 Created
    upload_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/upload",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        files={"file": ("invoice_1001.pdf", pdf_bytes, "application/pdf")},
        data={"category": "INVOICE"},
    )
    assert upload_res.status_code == 201
    doc_data = upload_res.json()["document"]
    doc_id = doc_data["id"]
    assert doc_data["filename"] == "invoice_1001.pdf"
    assert doc_data["status"] == "QUEUED"
    assert doc_data["sha256_hash"] == pdf_sha

    # Verify document_jobs record was inserted
    async with db_pool.acquire() as conn:
        job = await conn.fetchrow(
            "SELECT * FROM document_jobs WHERE document_id = $1",
            uuid.UUID(doc_id),
        )
        assert job is not None
        assert job["action"] == "DOCUMENT_EXTRACTION"
        assert job["status"] == "QUEUED"

    # 5. Duplicate Detection in Same Workspace -> 409 Conflict
    dup_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/upload",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        files={"file": ("invoice_duplicate.pdf", pdf_bytes, "application/pdf")},
    )
    assert dup_res.status_code == 409
    assert "Duplicate document detected" in dup_res.json()["error"]["message"]

    # 6. Presigned Upload Intent Workflow
    intent_pdf = create_test_pdf("Contract #2002")
    # Add a slight unique suffix to bytes so hash differs
    intent_pdf = intent_pdf + b"\n%extra-comment"
    intent_sha = calculate_sha256(intent_pdf)

    intent_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/upload-intent",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={
            "filename": "contract_2002.pdf",
            "file_size_bytes": len(intent_pdf),
            "sha256_hash": intent_sha,
            "mime_type": "application/pdf",
            "category": "CONTRACT",
        },
    )
    assert intent_res.status_code == 201
    intent_data = intent_res.json()
    assert "presigned_upload_url" in intent_data
    intent_doc_id = intent_data["document"]["id"]
    assert intent_data["document"]["status"] == "UPLOAD_PENDING"

    # 6b. Attempt complete upload before file is uploaded to storage -> 404 Not Found
    unuploaded_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{intent_doc_id}/complete-upload",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert unuploaded_res.status_code == 404
    assert "Uploaded object not found in storage" in unuploaded_res.json()["error"]["message"]

    # Simulate client uploading the file to S3 via presigned URL
    from src.storage.s3 import storage_manager
    storage_manager.upload_bytes(key=intent_data["document"]["s3_key"], data=intent_pdf)

    # Complete upload succeeds now that object exists in storage
    complete_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{intent_doc_id}/complete-upload",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert complete_res.status_code == 200
    assert complete_res.json()["document"]["status"] == "QUEUED"

    # 7. List Documents in Workspace
    list_res = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert list_res.status_code == 200
    docs_list = list_res.json()
    assert len(docs_list) >= 2
    assert any(d["id"] == doc_id for d in docs_list)
    assert any(d["id"] == intent_doc_id for d in docs_list)

    # 8. Get Single Document with Preview Presigned URL
    get_res = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert get_res.status_code == 200
    assert get_res.json()["id"] == doc_id
    assert "preview_url" in get_res.json()

    # 9. RBAC Enforcement: VIEWER Role Restrictions
    # Viewer tries to upload -> 403 Forbidden
    viewer_upload = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/upload",
        headers={**viewer_headers, "X-Organization-ID": str(org_id)},
        files={"file": ("viewer_test.pdf", create_test_pdf(), "application/pdf")},
    )
    assert viewer_upload.status_code == 403

    # Viewer can read / list -> 200 OK
    viewer_list = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents",
        headers={**viewer_headers, "X-Organization-ID": str(org_id)},
    )
    assert viewer_list.status_code == 200

    # Viewer tries to delete -> 403 Forbidden
    viewer_del = await client.delete(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}",
        headers={**viewer_headers, "X-Organization-ID": str(org_id)},
    )
    assert viewer_del.status_code == 403

    # 10. Soft-delete and Restore Lifecycle
    del_res = await client.delete(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert del_res.status_code == 204

    # Document now excluded from list
    post_del_list = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert not any(d["id"] == doc_id for d in post_del_list.json())

    # Restore Document
    restore_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/restore",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["document"]["id"] == doc_id

    # Document appears again in list
    restored_list = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
    )
    assert any(d["id"] == doc_id for d in restored_list.json())
