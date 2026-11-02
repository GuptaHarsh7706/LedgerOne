import os
import sys


def test_python_runtime_version():
    """Verify target environment is CPython 3.11.x."""
    assert sys.version_info.major == 3
    assert sys.version_info.minor == 11
    print(f"\n[PASS] Verified Python version: {sys.version.split()[0]}")


def test_core_package_imports():
    """Verify that all core production packages can be imported without conflict."""
    import asyncpg
    import faiss
    import fastapi
    import pydantic
    import pypdfium2
    import transformers

    assert fastapi.__version__ is not None
    assert pydantic.__version__ is not None
    assert asyncpg.__file__ is not None
    assert faiss.__file__ is not None
    assert pypdfium2.__file__ is not None
    assert transformers.__version__ is not None
    print(
        f"\n[PASS] Successfully imported core runtime packages (FastAPI {fastapi.__version__}, Pydantic {pydantic.__version__})"
    )


def test_environment_configuration_present():
    """Verify that required Neon PostgreSQL and S3 configuration keys are set."""
    db_url = os.getenv("DATABASE_URL")
    s3_endpoint = os.getenv("AWS_ENDPOINT_URL_S3")
    s3_key = os.getenv("AWS_ACCESS_KEY_ID")
    s3_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    s3_region = os.getenv("AWS_REGION")

    assert db_url is not None and "neon.tech" in db_url
    assert s3_endpoint is not None and "neon.tech" in s3_endpoint
    assert s3_key is not None
    assert s3_secret is not None
    assert s3_region == "ap-southeast-1"
    print("\n[PASS] Neon PostgreSQL and S3 environment configuration verified")
