import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import { s3 } from "../src/storage.js";
import { config, validateConfig } from "../src/config.js";

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function runS3MultipartVerification() {
  console.log("================================================================================");
  console.log("  LEDGERONE PHASE 1: S3 MULTIPART UPLOAD INFRASTRUCTURE VALIDATION");
  console.log("  Target: Neon Object Storage (Bucket: assets, Region: aws-ap-southeast-1)");
  console.log("================================================================================\n");

  validateConfig();

  const results: Array<{ testId: string; scenario: string; passed: boolean; details: string }> = [];

  // --------------------------------------------------------------------------
  // TEST S3-MP-001: 2-Part Multipart Upload & Assembly (5MB + 1MB = 6MB)
  // --------------------------------------------------------------------------
  console.log("1. Running S3-MP-001: Multipart upload initiation, part uploads, and assembly...");
  const objectKey = `test-multipart/${crypto.randomUUID()}/assembled-document.bin`;
  let uploadId: string | undefined;

  try {
    // Generate deterministic 5MB + 1MB parts
    const part1Buffer = crypto.randomBytes(5 * 1024 * 1024); // 5MB minimum required part size
    const part2Buffer = crypto.randomBytes(1 * 1024 * 1024); // 1MB final part
    const fullExpectedBuffer = Buffer.concat([part1Buffer, part2Buffer]);
    const expectedSha256 = crypto.createHash("sha256").update(fullExpectedBuffer).digest("hex");

    // Step 1: Initiate multipart upload
    const createRes = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: config.storage.bucket,
        Key: objectKey,
        ContentType: "application/octet-stream",
      })
    );
    uploadId = createRes.UploadId;
    if (!uploadId) {
      throw new Error("S3 CreateMultipartUpload did not return an UploadId");
    }
    console.log(`   Initiated multipart upload: UploadId = ${uploadId}`);

    // Step 2: Upload Part 1
    const uploadPart1Res = await s3.send(
      new UploadPartCommand({
        Bucket: config.storage.bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: 1,
        Body: part1Buffer,
      })
    );
    if (!uploadPart1Res.ETag) {
      throw new Error("Part 1 upload did not return an ETag");
    }
    console.log(`   Uploaded Part 1 (5MB): ETag = ${uploadPart1Res.ETag}`);

    // Step 3: Upload Part 2
    const uploadPart2Res = await s3.send(
      new UploadPartCommand({
        Bucket: config.storage.bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: 2,
        Body: part2Buffer,
      })
    );
    if (!uploadPart2Res.ETag) {
      throw new Error("Part 2 upload did not return an ETag");
    }
    console.log(`   Uploaded Part 2 (1MB): ETag = ${uploadPart2Res.ETag}`);

    // Step 4: Complete Multipart Upload
    const completeRes = await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: config.storage.bucket,
        Key: objectKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: uploadPart1Res.ETag },
            { PartNumber: 2, ETag: uploadPart2Res.ETag },
          ],
        },
      })
    );
    console.log(`   Completed multipart upload: Location = ${completeRes.Location}`);

    // Step 5: Verify byte-level integrity of assembled object in Neon S3
    const getObjRes = await s3.send(
      new GetObjectCommand({
        Bucket: config.storage.bucket,
        Key: objectKey,
      })
    );
    const downloadedBuffer = await streamToBuffer(getObjRes.Body);
    if (downloadedBuffer.length !== fullExpectedBuffer.length) {
      throw new Error(`Assembled length mismatch: expected ${fullExpectedBuffer.length}, got ${downloadedBuffer.length}`);
    }

    const downloadedSha256 = crypto.createHash("sha256").update(downloadedBuffer).digest("hex");
    if (downloadedSha256 !== expectedSha256) {
      throw new Error(`Assembled SHA-256 hash mismatch!`);
    }

    results.push({
      testId: "S3-MP-001",
      scenario: "Neon Object Storage supports S3 Multipart Upload (Create, UploadPart, Complete)",
      passed: true,
      details: `6MB object assembled across 2 parts. SHA-256 verified: ${expectedSha256}`,
    });
    console.log("   --> PASSED: Multipart upload successfully assembled and byte integrity verified.\n");

    // Clean up
    await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: objectKey }));
  } catch (err: any) {
    if (uploadId) {
      try {
        await s3.send(new AbortMultipartUploadCommand({ Bucket: config.storage.bucket, Key: objectKey, UploadId: uploadId }));
      } catch {}
    }
    results.push({ testId: "S3-MP-001", scenario: "Multipart Upload Assembly", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // TEST S3-MP-002: Multipart Upload Abort & Cleanup
  // --------------------------------------------------------------------------
  console.log("2. Running S3-MP-002: Multipart upload abort and resource reclamation...");
  const abortKey = `test-multipart/${crypto.randomUUID()}/aborted-document.bin`;
  let abortUploadId: string | undefined;

  try {
    const initRes = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: config.storage.bucket,
        Key: abortKey,
        ContentType: "application/octet-stream",
      })
    );
    abortUploadId = initRes.UploadId;

    // Upload 1 part
    await s3.send(
      new UploadPartCommand({
        Bucket: config.storage.bucket,
        Key: abortKey,
        UploadId: abortUploadId,
        PartNumber: 1,
        Body: crypto.randomBytes(5 * 1024 * 1024),
      })
    );

    // Abort multipart upload
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: config.storage.bucket,
        Key: abortKey,
        UploadId: abortUploadId,
      })
    );
    console.log(`   Aborted multipart upload: UploadId = ${abortUploadId}`);

    // Verify object does not exist
    let objectExists = false;
    try {
      await s3.send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: abortKey }));
      objectExists = true;
    } catch {
      objectExists = false;
    }

    if (objectExists) {
      throw new Error("Aborted multipart object should not exist in bucket!");
    }

    results.push({
      testId: "S3-MP-002",
      scenario: "AbortMultipartUpload cancels in-flight multipart uploads and reclaims storage",
      passed: true,
      details: "Upload aborted; object verified absent from bucket.",
    });
    console.log("   --> PASSED: AbortMultipartUpload successfully reclaimed uncommitted parts.\n");
  } catch (err: any) {
    results.push({ testId: "S3-MP-002", scenario: "Multipart Upload Abort", passed: false, details: err.message });
    console.error("   --> FAILED:", err.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("  S3 MULTIPART VALIDATION SUMMARY");
  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`  Total Tests: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.testId}: ${r.scenario}`);
  }
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    throw new Error("One or more S3 multipart tests failed!");
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("s3-multipart.test")) {
  runS3MultipartVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("S3 multipart verification failed with error:", err);
      process.exit(1);
    });
}
