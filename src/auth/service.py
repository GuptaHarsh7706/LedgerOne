"""
Authentication business logic: user registration, credential validation,
token pair issuance, refresh token family rotation, and reuse detection.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import uuid
import asyncpg
import structlog

from src.auth.crypto import hash_password, verify_password, generate_secure_token, hash_token
from src.auth.jwt import create_access_token
from src.config import get_settings
from src.db.pool import db_manager
from src.exceptions import AuthenticationError, ConflictError, NotFoundError

logger = structlog.get_logger(__name__)


class AuthService:
    """Service managing authentication, credential verification, and token lifecycles."""

    def __init__(self, pool: Optional[asyncpg.Pool] = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def register_user(
        self,
        email: str,
        password: str,
        full_name: str,
        is_platform_admin: bool = False,
    ) -> Dict[str, Any]:
        """Register a new user account with Argon2id password hashing."""
        email_clean = email.strip().lower()
        full_name_clean = full_name.strip()

        async with self.pool.acquire() as conn:
            # Check existing user
            existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", email_clean)
            if existing:
                raise ConflictError(
                    "User with this email already exists",
                    details={"email": email_clean},
                )

            # Hash password with Argon2id
            pw_hash = hash_password(password)
            user_id = uuid.uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO users (id, email, password_hash, full_name, is_platform_admin, is_active)
                VALUES ($1, $2, $3, $4, $5, TRUE)
                RETURNING id, email, full_name, is_platform_admin, is_active, created_at
                """,
                user_id,
                email_clean,
                pw_hash,
                full_name_clean,
                is_platform_admin,
            )
            logger.info("User registered successfully", user_id=str(user_id), email=email_clean)
            return dict(row)

    async def authenticate_user(self, email: str, password: str) -> Dict[str, Any]:
        """Verify user credentials and return user record if valid."""
        email_clean = email.strip().lower()
        async with self.pool.acquire() as conn:
            user = await conn.fetchrow(
                """
                SELECT id, email, password_hash, full_name, is_platform_admin, is_active
                FROM users WHERE email = $1
                """,
                email_clean,
            )

            if not user or not user["is_active"]:
                logger.warning("Authentication failed: user not found or inactive", email=email_clean)
                raise AuthenticationError("Invalid email or password")

            if not verify_password(password, user["password_hash"]):
                logger.warning("Authentication failed: password mismatch", email=email_clean)
                raise AuthenticationError("Invalid email or password")

            return dict(user)

    async def issue_token_pair(
        self,
        user_id: uuid.UUID | str,
        email: str,
        org_id: Optional[uuid.UUID | str] = None,
        role: Optional[str] = None,
        is_platform_admin: bool = False,
        family_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        """
        Issue a new JWT access token and an opaque refresh token.
        Stores hashed refresh token in database associated with a family_id.
        """
        settings = get_settings()
        user_uuid = uuid.UUID(str(user_id))
        token_family = family_id or uuid.uuid4()

        # Access token
        access_token = create_access_token(
            user_id=str(user_uuid),
            email=email,
            org_id=str(org_id) if org_id else None,
            role=role,
            is_platform_admin=is_platform_admin,
        )

        # Refresh token
        plain_refresh_token = generate_secure_token(32)
        token_digest = hash_token(plain_refresh_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, is_revoked)
                VALUES ($1, $2, $3, $4, FALSE)
                """,
                user_uuid,
                token_digest,
                token_family,
                expires_at,
            )

        return {
            "access_token": access_token,
            "refresh_token": plain_refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }

    async def rotate_refresh_token(self, refresh_token_plain: str) -> Dict[str, Any]:
        """
        Rotate refresh token with automatic reuse detection.
        If a revoked/consumed token is presented, the entire family is immediately invalidated.
        """
        token_digest = hash_token(refresh_token_plain)
        now = datetime.now(timezone.utc)

        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                SELECT id, user_id, token_hash, family_id, is_revoked, expires_at
                FROM refresh_tokens WHERE token_hash = $1
                """,
                token_digest,
            )

            if not record:
                raise AuthenticationError("Invalid refresh token")

            family_id = record["family_id"]
            user_id = record["user_id"]

            # Token Reuse Detection: If this token was already revoked, someone is replaying it!
            if record["is_revoked"]:
                logger.error(
                    "SECURITY ALERT: Refresh token reuse detected! Invalidating entire token family.",
                    user_id=str(user_id),
                    family_id=str(family_id),
                )
                await conn.execute(
                    """
                    UPDATE refresh_tokens
                    SET is_revoked = TRUE, revoked_at = NOW()
                    WHERE family_id = $1
                    """,
                    family_id,
                )
                raise AuthenticationError(
                    "Token reuse detected. All associated sessions have been revoked for security."
                )

            # Check expiration
            if record["expires_at"] < now:
                raise AuthenticationError("Refresh token has expired")

            # Invalidate the consumed refresh token
            await conn.execute(
                "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE id = $1",
                record["id"],
            )

            # Fetch user info for new access token
            user = await conn.fetchrow(
                "SELECT id, email, is_platform_admin, is_active FROM users WHERE id = $1",
                user_id,
            )
            if not user or not user["is_active"]:
                raise AuthenticationError("User account is inactive or disabled")

            # Check default/active organization membership if any
            membership = await conn.fetchrow(
                """
                SELECT organization_id, role FROM organization_memberships
                WHERE user_id = $1 AND is_active = TRUE
                ORDER BY created_at ASC LIMIT 1
                """,
                user_id,
            )
            org_id = membership["organization_id"] if membership else None
            role = membership["role"] if membership else None

            # Issue new pair within the SAME family_id
            return await self.issue_token_pair(
                user_id=user["id"],
                email=user["email"],
                org_id=org_id,
                role=role,
                is_platform_admin=user["is_platform_admin"],
                family_id=family_id,
            )

    async def revoke_refresh_token(self, refresh_token_plain: str) -> None:
        """Revoke a refresh token upon user logout."""
        token_digest = hash_token(refresh_token_plain)
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1",
                token_digest,
            )

    async def revoke_all_user_sessions(self, user_id: uuid.UUID | str) -> None:
        """Revoke all active sessions for a user (e.g. after password reset)."""
        user_uuid = uuid.UUID(str(user_id))
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1",
                user_uuid,
            )


auth_service = AuthService()
