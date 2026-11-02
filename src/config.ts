import "./dns-resolver.js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local first (standard for Neon deploy), then .env as fallback
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  jwt: {
    secret: process.env.JWT_SECRET || "ledgerone_enterprise_jwt_secret_92594726_secure",
    accessExpiresIn: "1h",
    refreshExpiresIn: "7d",
  },
  neon: {
    databaseUrl: process.env.DATABASE_URL || "",
    databaseUrlUnpooled: process.env.DATABASE_URL_UNPOOLED || "",
    branch: process.env.NEON_BRANCH || "production",
    appPassword: process.env.APP_DB_PASSWORD || "",
    appDatabaseUrl: process.env.DATABASE_APP_URL || (
      (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").replace(
        /postgres(ql)?:\/\/([^:]+):([^@]+)@/,
        `postgres://ledgerone_app:${encodeURIComponent(process.env.APP_DB_PASSWORD || "")}@`
      )
    ),
  },
  storage: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || "",
    region: process.env.AWS_REGION || "aws-ap-southeast-1",
    bucket: process.env.NEON_BUCKET || "assets",
  },
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.neon.databaseUrl) missing.push("DATABASE_URL");
  if (!config.storage.accessKeyId) missing.push("AWS_ACCESS_KEY_ID");
  if (!config.storage.secretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");
  if (!config.storage.endpoint) missing.push("AWS_ENDPOINT_URL_S3");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
