"""
Unit tests for Argon2id password hashing, legacy bcrypt verification, and cryptographic tokens.
"""
import pytest
from src.auth.crypto import (
    hash_password,
    verify_password,
    generate_secure_token,
    hash_token,
)


def test_argon2id_hashing_and_verification():
    raw_password = "SecurePassword123!@#"
    hashed = hash_password(raw_password)

    # Must be Argon2id format
    assert hashed.startswith("$argon2id$")
    assert "$m=65536,t=3,p=4$" in hashed

    # Valid password verification
    assert verify_password(raw_password, hashed) is True

    # Invalid password verification
    assert verify_password("WrongPassword123", hashed) is False
    assert verify_password("", hashed) is False


def test_empty_password_rejection():
    with pytest.raises(ValueError):
        hash_password("")


def test_legacy_bcrypt_verification():
    import bcrypt

    raw_password = "LegacyBcryptPassword"
    bcrypt_hash = bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")

    assert bcrypt_hash.startswith(("$2a$", "$2b$"))
    # verify_password must successfully verify legacy bcrypt hashes
    assert verify_password(raw_password, bcrypt_hash) is True
    assert verify_password("WrongPassword", bcrypt_hash) is False


def test_secure_token_generation_and_hashing():
    token1 = generate_secure_token(32)
    token2 = generate_secure_token(32)

    assert len(token1) >= 40
    assert token1 != token2

    hash1 = hash_token(token1)
    hash2 = hash_token(token2)

    assert len(hash1) == 64  # SHA-256 hex digest
    assert hash1 != hash2
    # Deterministic hashing
    assert hash_token(token1) == hash1
