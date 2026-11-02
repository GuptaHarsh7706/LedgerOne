import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { config } from "./config.js";

// Best practice per neon-object-storage skill:
// forcePathStyle: true is strictly required as Neon Object Storage uses path-style addressing
export const s3 = new S3Client({
  forcePathStyle: true,
  endpoint: config.storage.endpoint,
  region: config.storage.region,
  credentials: {
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
  },
});

export async function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function checkStorageHealth(): Promise<{ ok: boolean; bucket: string; objectCount: number }> {
  const command = new ListObjectsV2Command({
    Bucket: config.storage.bucket,
    MaxKeys: 10,
  });

  const response = await s3.send(command);
  return {
    ok: true,
    bucket: config.storage.bucket,
    objectCount: response.KeyCount || 0,
  };
}

export async function uploadDocument(
  key: string,
  content: string | Buffer | Uint8Array,
  contentType: string = "text/plain"
): Promise<{ key: string; bucket: string; size: number }> {
  const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const command = new PutObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3.send(command);
  return {
    key,
    bucket: config.storage.bucket,
    size: body.length,
  };
}

export async function getDocument(key: string): Promise<{ key: string; content: string; contentType?: string }> {
  const command = new GetObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
  });

  const response = await s3.send(command);
  const streamToString = async (stream: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on("data", (chunk: any) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
  };

  const content = await streamToString(response.Body);
  return {
    key,
    content,
    contentType: response.ContentType,
  };
}

export async function deleteDocument(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
  });
  await s3.send(command);
}

export async function listDocuments(prefix?: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: config.storage.bucket,
    Prefix: prefix,
  });

  const response = await s3.send(command);
  return (response.Contents || []).map((item) => item.Key || "").filter(Boolean);
}
