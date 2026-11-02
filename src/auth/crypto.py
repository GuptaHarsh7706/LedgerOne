"""
Cryptographic utility module providing Argon2id password hashing, legacy bcrypt verification,
and secure token generation.
"""
import hashlib
import secrets
import structlog
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

logger = structlog.get_logger(__name__)

# OWASP Recommended Parameters for Argon2id
# Memory: 64 MiB (65536 KiB), Time: 3 iterations, Parallelism: 4 lanes
_argon2_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    if not password:
        raise ValueError("Password cannot be empty")
    return _argon2_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against an Argon2id hash or fallback to bcrypt.
    Constant-time comparison handled by underlying cryptographic libraries.
    """
    if not plain_password or not hashed_password:
        return False

    # Argon2id verification
    if hashed_password.startswith("$argon2"):
        try:
            return _argon2_hasher.verify(hashed_password, plain_password)
        except (VerifyMismatchError, InvalidHashError):
            return False
        except Exception as exc:
            logger.warning("Unexpected error during Argon2 verification", error=str(exc))
            return False

    # Legacy Bcrypt fallback verification
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception as exc:
            logger.warning("Bcrypt verification failed", error=str(exc))
            return False

    logger.warning("Unknown password hash format")
    return False


def generate_secure_token(nbytes: int = 32) -> str:
    """Generate a cryptographically random, URL-safe token."""
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Compute SHA-256 hex digest of a token for secure database indexing."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
