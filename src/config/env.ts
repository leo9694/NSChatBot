import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: false });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  port: Number(optional("PORT", "3000")),
  nodeEnv: optional("NODE_ENV", "development"),
  databaseUrl:
    optional("NODE_ENV", "development") !== "production" && process.env.LOCAL_DATABASE_URL
      ? String(process.env.LOCAL_DATABASE_URL).trim()
      : required("DATABASE_URL"),
  databaseTarget:
    optional("NODE_ENV", "development") !== "production" && process.env.LOCAL_DATABASE_URL
      ? "local-test"
      : "production",
  productionDatabaseUrl: required("DATABASE_URL"),
  localDatabaseUrl: optional("LOCAL_DATABASE_URL", "").trim() || null,
  whatsappSessionPath: optional("WHATSAPP_SESSION_PATH", "./.baileys_auth"),
  mediaFallbackBaseUrl: optional("MEDIA_FALLBACK_BASE_URL", "").replace(/\/+$/, ""),
  openaiApiKey: optional("OPENAI_API_KEY", "").trim(),
  openaiModel: optional("OPENAI_MODEL", "gpt-5-mini").trim(),
};
