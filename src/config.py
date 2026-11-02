"""
Typed configuration module for LedgerOne using Pydantic Settings.
"""
from functools import lru_cache
from pathlib import Path
from typing import List
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_env_file() -> str:
    """Find the most relevant .env file location."""
    candidates = [
        Path(__file__).resolve().parent.parent / ".env",
        Path.cwd() / "LedgerOne" / ".env",
        Path.cwd() / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return ".env"


class Settings(BaseSettings):
    """LedgerOne application settings."""

    model_config = SettingsConfigDict(
        env_file=find_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment & Server
    ENV: str = Field(default="development", description="Environment: development, staging, production")
    DEBUG: bool = Field(default=False, description="Debug mode")
    API_HOST: str = Field(default="0.0.0.0", description="API listen host")
    API_PORT: int = Field(default=8000, description="API listen port")
    LOG_LEVEL: str = Field(default="INFO", description="Log level: DEBUG, INFO, WARNING, ERROR")

    # Neon PostgreSQL
    DATABASE_URL: str = Field(
        default="postgresql://localhost:5432/ledgerone",
        description="Neon pooled or primary database connection string",
    )
    DATABASE_URL_UNPOOLED: str | None = Field(
        default=None,
        description="Direct unpooled database connection string for migrations/admin",
    )
    APP_DB_ROLE: str = Field(default="ledgerone_app", description="Unprivileged application role")
    APP_DB_PASSWORD: str | None = Field(default=None, description="Password for application role if used directly")
    DB_POOL_MIN_SIZE: int = Field(default=2, description="Minimum asyncpg pool connections")
    DB_POOL_MAX_SIZE: int = Field(default=10, description="Maximum asyncpg pool connections")
    DB_POOL_TIMEOUT: float = Field(default=30.0, description="Connection acquire timeout in seconds")
    DB_POOL_MAX_INACTIVE_LIFETIME: float = Field(default=300.0, description="Max inactive connection lifetime")

    # S3 Object Storage (Neon / AWS S3)
    AWS_ENDPOINT_URL_S3: str | None = Field(default=None, description="S3-compatible endpoint URL")
    AWS_ACCESS_KEY_ID: str | None = Field(default=None, description="S3 Access Key")
    AWS_SECRET_ACCESS_KEY: str | None = Field(default=None, description="S3 Secret Access Key")
    AWS_REGION: str = Field(default="ap-southeast-1", description="S3 AWS Region")
    S3_BUCKET_ASSETS: str = Field(default="assets", description="Primary document assets bucket")

    # CORS
    CORS_ORIGINS: List[str] = Field(default=["*"], description="Allowed CORS origins")

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        val_upper = v.upper()
        if val_upper not in valid:
            raise ValueError(f"LOG_LEVEL must be one of {valid}")
        return val_upper


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton settings instance."""
    return Settings()
