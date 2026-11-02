"""
JWT token encoding, decoding, and validation.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import uuid
import jwt
import structlog

from src.config import get_settings
from src.exceptions import AuthenticationError

logger = structlog.get_logger(__name__)


def create_access_token(
    user_id: str,
    email: str,
    org_id: Optional[str] = None,
    role: Optional[str] = None,
    is_platform_admin: bool = False,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "org_id": str(org_id) if org_id else None,
        "role": role,
        "is_platform_admin": is_platform_admin,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": str(uuid.uuid4()),
    }

    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Access token has expired", details={"reason": "token_expired"}) from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Invalid access token", details={"reason": "invalid_signature"}) from exc
