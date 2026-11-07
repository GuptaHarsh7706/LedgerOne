"""
Centralized Enterprise RBAC Permission Architecture & Separation of Duties (SoD) Service.

Defines the 6 canonical roles (+ WORKSPACE_ADMIN extension), granular permission identifiers,
role-to-permission matrices, runtime authorization assertions, and dual-custody SoD validators.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Set
import uuid
import structlog
from fastapi import Depends, Header, Path, Query

from src.exceptions import AuthorizationError

logger = structlog.get_logger(__name__)


class Role(str, Enum):
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    ORGANIZATION_ADMIN = "ORGANIZATION_ADMIN"
    WORKSPACE_ADMIN = "WORKSPACE_ADMIN"
    DOCUMENT_MANAGER = "DOCUMENT_MANAGER"
    REVIEWER = "REVIEWER"
    ANALYST = "ANALYST"
    VIEWER = "VIEWER"
    # Legacy compatibility alias
    MEMBER = "MEMBER"


class Permission(str, Enum):
    # Platform Domain
    PLATFORM_ADMIN = "platform.admin"

    # Organization Domain
    ORG_READ = "organization.read"
    ORG_UPDATE = "organization.update"
    ORG_DELETE = "organization.delete"
    ORG_MEMBERS_READ = "organization.members.read"
    ORG_MEMBERS_MANAGE = "organization.members.manage"
    ORG_WORKSPACES_MANAGE = "organization.workspaces.manage"

    # Workspace Domain
    WS_READ = "workspace.read"
    WS_UPDATE = "workspace.update"
    WS_DELETE = "workspace.delete"
    WS_MEMBERS_READ = "workspace.members.read"
    WS_MEMBERS_MANAGE = "workspace.members.manage"

    # Document Domain
    DOC_READ = "documents.read"
    DOC_UPLOAD = "documents.upload"
    DOC_DELETE = "documents.delete"
    DOC_EXPORT = "documents.export"

    # Review & HITL Verification Domain
    REVIEW_READ = "review.read"
    REVIEW_CLAIM = "review.claim"
    REVIEW_CORRECT = "review.correct"
    REVIEW_OVERRIDE = "review.override"
    REVIEW_VERIFY = "review.verify"
    REVIEW_APPROVE = "review.approve"
    REVIEW_REJECT = "review.reject"
    REVIEW_REOPEN = "review.reopen"

    # AI Assistant Domain
    ASSISTANT_USE = "assistant.use"
    ASSISTANT_READ_HISTORY = "assistant.read_history"

    # Financial Spend Analytics Domain
    ANALYTICS_READ = "analytics.read"

    # 3-Way Matching & Cross-Document Domain
    MATCHING_READ = "matching.read"
    MATCHING_CREATE = "matching.create"
    MATCHING_RESOLVE = "matching.resolve"


# Canonical Granular Role-Permission Matrix
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    Role.PLATFORM_ADMIN.value: {
        "*",  # Platform superuser has all permissions
    },
    Role.ORGANIZATION_ADMIN.value: {
        Permission.ORG_READ.value,
        Permission.ORG_UPDATE.value,
        Permission.ORG_MEMBERS_READ.value,
        Permission.ORG_MEMBERS_MANAGE.value,
        Permission.ORG_WORKSPACES_MANAGE.value,
        Permission.WS_READ.value,
        Permission.WS_UPDATE.value,
        Permission.WS_DELETE.value,
        Permission.WS_MEMBERS_READ.value,
        Permission.WS_MEMBERS_MANAGE.value,
        Permission.DOC_READ.value,
        Permission.DOC_UPLOAD.value,
        Permission.DOC_DELETE.value,
        Permission.DOC_EXPORT.value,
        Permission.REVIEW_READ.value,
        Permission.REVIEW_CLAIM.value,
        Permission.REVIEW_CORRECT.value,
        Permission.REVIEW_OVERRIDE.value,
        Permission.REVIEW_VERIFY.value,
        Permission.REVIEW_APPROVE.value,
        Permission.REVIEW_REJECT.value,
        Permission.REVIEW_REOPEN.value,
        Permission.ASSISTANT_USE.value,
        Permission.ASSISTANT_READ_HISTORY.value,
        Permission.ANALYTICS_READ.value,
        Permission.MATCHING_READ.value,
        Permission.MATCHING_CREATE.value,
        Permission.MATCHING_RESOLVE.value,
    },
    Role.WORKSPACE_ADMIN.value: {
        Permission.ORG_READ.value,
        Permission.ORG_MEMBERS_READ.value,
        Permission.WS_READ.value,
        Permission.WS_UPDATE.value,
        Permission.WS_MEMBERS_READ.value,
        Permission.WS_MEMBERS_MANAGE.value,
        Permission.DOC_READ.value,
        Permission.DOC_UPLOAD.value,
        Permission.DOC_DELETE.value,
        Permission.DOC_EXPORT.value,
        Permission.REVIEW_READ.value,
        Permission.REVIEW_CLAIM.value,
        Permission.REVIEW_CORRECT.value,
        Permission.REVIEW_OVERRIDE.value,
        Permission.REVIEW_VERIFY.value,
        Permission.REVIEW_APPROVE.value,
        Permission.REVIEW_REJECT.value,
        Permission.REVIEW_REOPEN.value,
        Permission.ASSISTANT_USE.value,
        Permission.ASSISTANT_READ_HISTORY.value,
        Permission.ANALYTICS_READ.value,
        Permission.MATCHING_READ.value,
        Permission.MATCHING_CREATE.value,
        Permission.MATCHING_RESOLVE.value,
    },
    Role.DOCUMENT_MANAGER.value: {
        Permission.ORG_READ.value,
        Permission.ORG_MEMBERS_READ.value,
        Permission.WS_READ.value,
        Permission.WS_MEMBERS_READ.value,
        Permission.DOC_READ.value,
        Permission.DOC_UPLOAD.value,
        # Strictly excluded: documents.delete (only Admins delete), review.correct/override/approve/reject (SoD)
        Permission.DOC_EXPORT.value,
        Permission.REVIEW_READ.value,
        Permission.ASSISTANT_USE.value,
        Permission.ASSISTANT_READ_HISTORY.value,
        Permission.ANALYTICS_READ.value,
        Permission.MATCHING_READ.value,
        Permission.MATCHING_CREATE.value,
    },
    Role.REVIEWER.value: {
        Permission.ORG_READ.value,
        Permission.ORG_MEMBERS_READ.value,
        Permission.WS_READ.value,
        Permission.WS_MEMBERS_READ.value,
        Permission.DOC_READ.value,
        Permission.DOC_EXPORT.value,
        # Full review workflow authority
        Permission.REVIEW_READ.value,
        Permission.REVIEW_CLAIM.value,
        Permission.REVIEW_CORRECT.value,
        Permission.REVIEW_OVERRIDE.value,
        Permission.REVIEW_VERIFY.value,
        Permission.REVIEW_APPROVE.value,
        Permission.REVIEW_REJECT.value,
        Permission.REVIEW_REOPEN.value,
        Permission.ASSISTANT_USE.value,
        Permission.ASSISTANT_READ_HISTORY.value,
        Permission.MATCHING_READ.value,
        Permission.MATCHING_RESOLVE.value,
        # Strictly excluded: documents.upload, documents.delete, workspace.members.manage
    },
    Role.ANALYST.value: {
        Permission.ORG_READ.value,
        Permission.ORG_MEMBERS_READ.value,
        Permission.WS_READ.value,
        Permission.WS_MEMBERS_READ.value,
        Permission.DOC_READ.value,
        Permission.DOC_EXPORT.value,
        Permission.REVIEW_READ.value,
        Permission.ASSISTANT_USE.value,
        Permission.ASSISTANT_READ_HISTORY.value,
        Permission.ANALYTICS_READ.value,
        Permission.MATCHING_READ.value,
        # Strictly excluded: documents.upload, documents.delete, review corrections/approvals, matching execution
    },
    Role.VIEWER.value: {
        Permission.ORG_READ.value,
        Permission.WS_READ.value,
        Permission.DOC_READ.value,
        # Strictly read-only for documents and workspace presence
    },
    # Backward compatibility for legacy MEMBER role
    Role.MEMBER.value: {
        Permission.ORG_READ.value,
        Permission.WS_READ.value,
        Permission.DOC_READ.value,
        Permission.DOC_EXPORT.value,
        Permission.ASSISTANT_USE.value,
        Permission.ASSISTANT_READ_HISTORY.value,
    },
}


def has_permission(role: Optional[str], permission: str, is_platform_admin: bool = False) -> bool:
    """Check if a given role possesses a granular permission."""
    if is_platform_admin:
        return True
    if not role:
        return False
    perms = ROLE_PERMISSIONS.get(role, set())
    if "*" in perms or permission in perms:
        return True
    return False


def assert_permission(role: Optional[str], permission: str, is_platform_admin: bool = False) -> None:
    """Assert that a role possesses a permission, raising 403 AuthorizationError if not."""
    if not has_permission(role=role, permission=permission, is_platform_admin=is_platform_admin):
        raise AuthorizationError(
            f"Action denied: Role '{role or 'UNKNOWN'}' lacks required permission '{permission}'"
        )


def check_sod_approval_permission(
    uploader_id: Optional[uuid.UUID],
    corrector_ids: List[uuid.UUID],
    actor_id: uuid.UUID,
    actor_role: str,
) -> None:
    """
    Enforce Segregation of Duties (SoD) dual-custody verification barriers.
    AUTH_SOD_001: The user who uploaded the document cannot approve it.
    AUTH_SOD_002: A user who manually corrected extracted fields cannot approve it.
    AUTH_SOD_003: Role DOCUMENT_MANAGER is strictly barred from approving documents.
    """
    if actor_role == Role.DOCUMENT_MANAGER.value:
        raise AuthorizationError(
            "Separation of Duties violation: Role 'DOCUMENT_MANAGER' is barred from approving documents (AUTH_SOD_003)"
        )

    if uploader_id and uploader_id == actor_id:
        raise AuthorizationError(
            "Separation of Duties violation: The user who uploaded this document cannot approve it (AUTH_SOD_001)"
        )

    if actor_id in corrector_ids:
        raise AuthorizationError(
            "Separation of Duties violation: A user who corrected fields on this document cannot approve it (AUTH_SOD_002)"
        )
