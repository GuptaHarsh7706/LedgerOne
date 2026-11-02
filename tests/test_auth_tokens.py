"""
Unit tests for JWT access token issuance, claims validation, and tampering rejection.
"""
from datetime import timedelta
import uuid
import pytest
from src.auth.jwt import create_access_token, decode_access_token
from src.exceptions import AuthenticationError


def test_jwt_token_creation_and_decoding():
    user_id = str(uuid.uuid4())
    email = "user@example.com"
    org_id = str(uuid.uuid4())

    token = create_access_token(
        user_id=user_id,
        email=email,
        org_id=org_id,
        role="ORGANIZATION_ADMIN",
        is_platform_admin=False,
    )

    payload = decode_access_token(token)
    assert payload["sub"] == user_id
    assert payload["email"] == email
    assert payload["org_id"] == org_id
    assert payload["role"] == "ORGANIZATION_ADMIN"
    assert payload["is_platform_admin"] is False
    assert "exp" in payload
    assert "jti" in payload


def test_jwt_expired_token():
    user_id = str(uuid.uuid4())
    # Create token already expired in the past
    token = create_access_token(
        user_id=user_id,
        email="expired@example.com",
        expires_delta=timedelta(seconds=-10),
    )

    with pytest.raises(AuthenticationError) as exc_info:
        decode_access_token(token)
    assert exc_info.value.details.get("reason") == "token_expired"


def test_jwt_tampered_token_rejection():
    token = create_access_token(user_id=str(uuid.uuid4()), email="test@example.com")
    tampered_token = token[:-5] + "XXXXX"

    with pytest.raises(AuthenticationError) as exc_info:
        decode_access_token(tampered_token)
    assert exc_info.value.details.get("reason") == "invalid_signature"
