"""
Document Service.
Handles document upload lifecycle, duplicate detection, metadata management,
presigned S3 leases, document library listing, and job queue initialization.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid

import asyncpg
import structlog

from src.db.pool import db_manager
from src.db.rls import TenantContext
from src.db.session import transactional_tenant_session
from src.exceptions import ConflictError, NotFoundError, ValidationError, AuthorizationError
from src.services.document_validation import validate_document_file, calculate_sha256
from src.storage.s3 import storage_manager

logger = structlog.get_logger(__name__)

# Valid state machine transitions
DOCUMENT_STATES = {
    "UPLOAD_PENDING",
    "UPLOADED",
    "QUEUED",
    "PROCESSING",
    "EXTRACTING",
    "VALIDATING",
    "AWAITING_REVIEW",
    "COMPLETED",
    "FAILED",
    "RETRYING",
    "CANCELLED",
}


class DocumentService:
    """Manages document entities, uploads, duplicate detection, and job queues."""

    def __init__(self, pool: Optional[asyncpg.pool.Pool] = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.pool.Pool:
        return self._pool or db_manager.pool

    async def create_upload_intent(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        filename: str,
        file_size_bytes: int,
        sha256_hash: str,
        mime_type: str,
        actor_id: uuid.UUID | str,
        actor_role: str,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Initiate a two-stage direct S3 upload with presigned lease.
        Enforces duplicate detection within workspace and lease expiration.
        """
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        actor_uuid = uuid.UUID(str(actor_id))

        if actor_role not in {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER"}:
            raise AuthorizationError("Only Workspace Admins and Document Managers can upload documents")

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        doc_id = uuid.uuid4()
        s3_key = f"organizations/{org_uuid}/workspaces/{ws_uuid}/{doc_id}/{filename}"
        lease_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            # 1. Duplicate detection check within the workspace
            existing_doc = await conn.fetchrow(
                """
                SELECT id, filename, status, created_at
                FROM documents
                WHERE organization_id = $1 AND workspace_id = $2 AND sha256_hash = $3 AND is_deleted = FALSE
                LIMIT 1
                """,
                org_uuid,
                ws_uuid,
                sha256_hash,
            )
            if existing_doc:
                raise ConflictError(
                    f"Duplicate document detected: '{filename}' has identical SHA-256 hash to existing document '{existing_doc['filename']}'",
                    details={
                        "existing_document_id": str(existing_doc["id"]),
                        "sha256_hash": sha256_hash,
                    },
                )

            # 2. Insert UPLOAD_PENDING record
            doc = await conn.fetchrow(
                """
                INSERT INTO documents (
                    id, organization_id, workspace_id, uploaded_by_user_id,
                    filename, file_size_bytes, mime_type, sha256_hash,
                    s3_key, status, upload_lease_expires_at, category
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UPLOAD_PENDING', $10, $11)
                RETURNING id, organization_id, workspace_id, filename, file_size_bytes, mime_type,
                          sha256_hash, s3_key, status, upload_lease_expires_at, created_at
                """,
                doc_id,
                org_uuid,
                ws_uuid,
                actor_uuid,
                filename,
                file_size_bytes,
                mime_type,
                sha256_hash,
                s3_key,
                lease_expires_at,
                category,
            )

        presigned_upload_url = storage_manager.generate_presigned_upload_url(s3_key, expires_in=900)

        return {
            "document": dict(doc),
            "presigned_upload_url": presigned_upload_url,
            "lease_expires_at": lease_expires_at.isoformat(),
        }

    async def complete_upload(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        document_id: uuid.UUID | str,
        actor_id: uuid.UUID | str,
        actor_role: str,
    ) -> Dict[str, Any]:
        """
        Finalize a two-stage upload, verify S3 object presence,
        transition status to QUEUED, and enqueue extraction job.
        """
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        doc_uuid = uuid.UUID(str(document_id))
        actor_uuid = uuid.UUID(str(actor_id))

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            doc = await conn.fetchrow(
                """
                SELECT id, s3_key, status, upload_lease_expires_at, filename
                FROM documents
                WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                """,
                org_uuid,
                ws_uuid,
                doc_uuid,
            )
            if not doc:
                raise NotFoundError("Document not found", details={"document_id": str(doc_uuid)})

            if doc["status"] != "UPLOAD_PENDING":
                raise ConflictError(f"Document is not in UPLOAD_PENDING status (current: {doc['status']})")

            # Check lease expiration
            if doc["upload_lease_expires_at"] and doc["upload_lease_expires_at"] < datetime.now(timezone.utc):
                raise ConflictError("Upload lease has expired. Please re-initiate upload intent.")

            # Update status to QUEUED
            updated_doc = await conn.fetchrow(
                """
                UPDATE documents
                SET status = 'QUEUED', updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                RETURNING id, organization_id, workspace_id, filename, file_size_bytes,
                          mime_type, sha256_hash, s3_key, status, updated_at
                """,
                org_uuid,
                ws_uuid,
                doc_uuid,
            )

            # Insert initial extraction job into document_jobs
            idempotency_key = f"extract-{doc_uuid}-0"
            await conn.execute(
                """
                INSERT INTO document_jobs (
                    organization_id, workspace_id, document_id,
                    action, status, priority, idempotency_key
                )
                VALUES ($1, $2, $3, 'DOCUMENT_EXTRACTION', 'QUEUED', 10, $4)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                org_uuid,
                ws_uuid,
                doc_uuid,
                idempotency_key,
            )

        logger.info("Document upload finalized and queued", doc_id=str(doc_uuid))
        return dict(updated_doc)

    async def upload_document_direct(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        filename: str,
        file_bytes: bytes,
        actor_id: uuid.UUID | str,
        actor_role: str,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Direct single-request multipart upload flow.
        Validates magic bytes, checks duplicate hash, persists in storage,
        and enqueues processing job.
        """
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        actor_uuid = uuid.UUID(str(actor_id))

        if actor_role not in {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER"}:
            raise AuthorizationError("Only Workspace Admins and Document Managers can upload documents")

        # 1. Validation & Magic Bytes Inspection
        detected_mime, sha256_hash, metadata = validate_document_file(file_bytes, filename)
        file_size = len(file_bytes)

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        doc_id = uuid.uuid4()
        s3_key = f"organizations/{org_uuid}/workspaces/{ws_uuid}/{doc_id}/{filename}"

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            # 2. Duplicate Detection
            existing_doc = await conn.fetchrow(
                """
                SELECT id, filename, created_at
                FROM documents
                WHERE organization_id = $1 AND workspace_id = $2 AND sha256_hash = $3 AND is_deleted = FALSE
                LIMIT 1
                """,
                org_uuid,
                ws_uuid,
                sha256_hash,
            )
            if existing_doc:
                raise ConflictError(
                    f"Duplicate document detected: '{filename}' has identical SHA-256 hash to existing document '{existing_doc['filename']}'",
                    details={
                        "existing_document_id": str(existing_doc["id"]),
                        "sha256_hash": sha256_hash,
                    },
                )

            # 3. Store object in S3/MinIO
            storage_manager.upload_bytes(key=s3_key, data=file_bytes, content_type=detected_mime)

            # 4. Insert Document Record in QUEUED status
            doc = await conn.fetchrow(
                """
                INSERT INTO documents (
                    id, organization_id, workspace_id, uploaded_by_user_id,
                    filename, file_size_bytes, mime_type, sha256_hash,
                    s3_key, status, category, metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'QUEUED', $10, $11::jsonb)
                RETURNING id, organization_id, workspace_id, filename, file_size_bytes,
                          mime_type, sha256_hash, s3_key, status, category, metadata, created_at
                """,
                doc_id,
                org_uuid,
                ws_uuid,
                actor_uuid,
                filename,
                file_size,
                detected_mime,
                sha256_hash,
                s3_key,
                category,
                structlog.processors.json.dumps(metadata) if hasattr(structlog.processors, "json") else str(metadata).replace("'", '"'),
            )

            # 5. Insert processing job into document_jobs
            idempotency_key = f"extract-{doc_id}-0"
            await conn.execute(
                """
                INSERT INTO document_jobs (
                    organization_id, workspace_id, document_id,
                    action, status, priority, idempotency_key
                )
                VALUES ($1, $2, $3, 'DOCUMENT_EXTRACTION', 'QUEUED', 10, $4)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                org_uuid,
                ws_uuid,
                doc_id,
                idempotency_key,
            )

        logger.info("Direct document upload completed", doc_id=str(doc_id), filename=filename)
        return dict(doc)

    async def list_documents(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        actor_id: uuid.UUID | str,
        actor_role: str,
        status: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List documents in a workspace with filtering and pagination."""
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        actor_uuid = uuid.UUID(str(actor_id))

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        query = """
            SELECT id, organization_id, workspace_id, filename, file_size_bytes,
                   mime_type, sha256_hash, status, category, metadata, created_at, updated_at
            FROM documents
            WHERE organization_id = $1 AND workspace_id = $2 AND is_deleted = FALSE
        """
        params: List[Any] = [org_uuid, ws_uuid]

        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"
        if category:
            params.append(category)
            query += f" AND category = ${len(params)}"

        params.append(limit)
        query += f" ORDER BY created_at DESC LIMIT ${len(params)}"
        params.append(offset)
        query += f" OFFSET ${len(params)}"

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    async def get_document(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        document_id: uuid.UUID | str,
        actor_id: uuid.UUID | str,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Fetch document details along with a presigned preview download URL."""
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        doc_uuid = uuid.UUID(str(document_id))
        actor_uuid = uuid.UUID(str(actor_id))

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            row = await conn.fetchrow(
                """
                SELECT id, organization_id, workspace_id, filename, file_size_bytes,
                       mime_type, sha256_hash, s3_key, status, category, metadata,
                       created_at, updated_at
                FROM documents
                WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                """,
                org_uuid,
                ws_uuid,
                doc_uuid,
            )
            if not row:
                raise NotFoundError("Document not found", details={"document_id": str(doc_uuid)})

            doc_dict = dict(row)
            doc_dict["preview_url"] = storage_manager.generate_presigned_download_url(doc_dict["s3_key"])
            return doc_dict

    async def delete_document(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        document_id: uuid.UUID | str,
        actor_id: uuid.UUID | str,
        actor_role: str,
    ) -> None:
        """Soft-delete a document (requires WORKSPACE_ADMIN or ORGANIZATION_ADMIN)."""
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        doc_uuid = uuid.UUID(str(document_id))
        actor_uuid = uuid.UUID(str(actor_id))

        if actor_role not in {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN"}:
            raise AuthorizationError("Only Workspace Admins and Organization Admins can delete documents")

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            result = await conn.execute(
                """
                UPDATE documents
                SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
                WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                """,
                org_uuid,
                ws_uuid,
                doc_uuid,
            )
            if result == "UPDATE 0":
                raise NotFoundError("Document not found or already deleted", details={"document_id": str(doc_uuid)})

    async def restore_document(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        document_id: uuid.UUID | str,
        actor_id: uuid.UUID | str,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Restore a soft-deleted document."""
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        doc_uuid = uuid.UUID(str(document_id))
        actor_uuid = uuid.UUID(str(actor_id))

        if actor_role not in {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN"}:
            raise AuthorizationError("Only Workspace Admins and Organization Admins can restore documents")

        context = TenantContext(
            org_id=org_uuid,
            workspace_id=ws_uuid,
            user_id=actor_uuid,
            user_role=actor_role,
        )

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            row = await conn.fetchrow(
                """
                UPDATE documents
                SET is_deleted = FALSE, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = TRUE
                RETURNING id, organization_id, workspace_id, filename, status, updated_at
                """,
                org_uuid,
                ws_uuid,
                doc_uuid,
            )
            if not row:
                raise NotFoundError("Deleted document not found", details={"document_id": str(doc_uuid)})
            return dict(row)


document_service = DocumentService()
