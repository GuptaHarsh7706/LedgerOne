import hashlib
import os
import urllib.request
import uuid

import boto3
import pytest
from botocore.client import Config


@pytest.fixture
def s3_client():
    client = boto3.client(
        "s3",
        endpoint_url=os.getenv("AWS_ENDPOINT_URL_S3"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    return client


def test_s3_upload_download_byte_integrity(s3_client):
    """Verify S3 upload, download, and SHA-256 byte integrity against Neon S3."""
    bucket = "assets"
    test_key = f"validation-tests/{uuid.uuid4()}/invoice-sample.txt"
    payload = (
        b"LEDGERONE ENTERPRISE DOCUMENT VALIDATION PAYLOAD -- S3 BYTE INTEGRITY TEST"
    )
    expected_hash = hashlib.sha256(payload).hexdigest()

    try:
        # 1. Upload Object
        put_res = s3_client.put_object(
            Bucket=bucket,
            Key=test_key,
            Body=payload,
            ContentType="text/plain",
            Metadata={"sha256": expected_hash},
        )
        assert put_res["ResponseMetadata"]["HTTPStatusCode"] == 200

        # 2. Download Object
        get_res = s3_client.get_object(Bucket=bucket, Key=test_key)
        downloaded = get_res["Body"].read()
        assert downloaded == payload

        # 3. Verify SHA-256 Integrity
        actual_hash = hashlib.sha256(downloaded).hexdigest()
        assert actual_hash == expected_hash
        print(
            f"\n[PASS] Neon S3 upload & download verified: SHA-256 {actual_hash[:16]}... matched exactly"
        )

    finally:
        # 4. Clean up test object
        s3_client.delete_object(Bucket=bucket, Key=test_key)


def test_s3_presigned_url_generation_and_access(s3_client):
    """Verify presigned download URL generation and direct HTTP retrieval."""
    bucket = "assets"
    test_key = f"validation-tests-presigned-{uuid.uuid4().hex[:8]}.bin"
    payload = b"CONFIDENTIAL FINANCIAL RECORD -- PRESIGNED ACCESS VALIDATION"

    try:
        s3_client.put_object(Bucket=bucket, Key=test_key, Body=payload)

        # Generate presigned GET URL (15 minutes validity)
        presigned_url = s3_client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": test_key}, ExpiresIn=900
        )
        assert presigned_url.startswith("https://")

        # Fetch using HTTP client
        with urllib.request.urlopen(presigned_url, timeout=10.0) as resp:  # nosec B310
            assert resp.status == 200
            content = resp.read()
            assert content == payload
        print("\n[PASS] S3 presigned URL generation and HTTP retrieval verified")

    finally:
        s3_client.delete_object(Bucket=bucket, Key=test_key)
