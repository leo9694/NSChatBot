import dotenv from "dotenv";

dotenv.config();

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
  databaseUrl: required("DATABASE_URL"),
  whatsappSessionPath: optional("WHATSAPP_SESSION_PATH", "./.baileys_auth"),
  mediaFallbackBaseUrl: optional("MEDIA_FALLBACK_BASE_URL", "").replace(/\/+$/, ""),
};
