"""
Unit tests for LedgerOne typed configuration.
"""
import pytest
from ledgerone.config import Settings, get_settings


def test_settings_initialization():
    settings = get_settings()
    assert settings.ENV in {"development", "staging", "production", "test"}
    assert settings.API_PORT > 0
    assert settings.DATABASE_URL is not None
    assert "postgresql://" in settings.DATABASE_URL or "postgres://" in settings.DATABASE_URL
    assert settings.DB_POOL_MIN_SIZE >= 1
    assert settings.DB_POOL_MAX_SIZE >= settings.DB_POOL_MIN_SIZE


def test_log_level_validation():
    # Valid log levels
    s1 = Settings(LOG_LEVEL="DEBUG")
    assert s1.LOG_LEVEL == "DEBUG"
    s2 = Settings(LOG_LEVEL="error")
    assert s2.LOG_LEVEL == "ERROR"

    # Invalid log level
    with pytest.raises(ValueError):
        Settings(LOG_LEVEL="INVALID_LEVEL")
