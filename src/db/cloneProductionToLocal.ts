import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: false });
}

function requireEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function spawnCommand(command: string, args: string[]) {
  return spawn(command, args, {
    stdio: ["pipe", "pipe", "inherit"],
    shell: false,
  });
}

function resolvePgBinary(binaryName: string): string {
  const fromEnv = String(process.env.PG_BIN_DIR || "").trim();
  const candidates = [
    fromEnv ? path.join(fromEnv, binaryName) : "",
    path.join("C:\\Program Files\\PostgreSQL\\18\\bin", binaryName),
    path.join("C:\\Program Files\\PostgreSQL\\17\\bin", binaryName),
    path.join("C:\\Program Files\\PostgreSQL\\16\\bin", binaryName),
    binaryName,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === binaryName || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return binaryName;
}

async function main() {
  const source = String(process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  const target = requireEnv("LOCAL_DATABASE_URL");

  if (!source) {
    throw new Error("Missing required environment variable: PRODUCTION_DATABASE_URL or DATABASE_URL");
  }

  if (source === target) {
    throw new Error("Production and local database URLs are the same. Aborting for safety.");
  }

  console.log("Cloning production database into local test database...");

  const dump = spawnCommand(resolvePgBinary("pg_dump.exe"), [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    "--dbname",
    source,
  ]);

  const restore = spawnCommand(resolvePgBinary("psql.exe"), ["--dbname", target]);

  dump.stdout.pipe(restore.stdin);

  const dumpExitCode = await new Promise<number>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", resolve);
  });

  const restoreExitCode = await new Promise<number>((resolve, reject) => {
    restore.on("error", reject);
    restore.on("close", resolve);
  });

  if (dumpExitCode !== 0) {
    throw new Error(`pg_dump exited with code ${dumpExitCode}`);
  }

  if (restoreExitCode !== 0) {
    throw new Error(`psql exited with code ${restoreExitCode}`);
  }

  console.log("Local test database refreshed successfully.");
}

main().catch((error) => {
  console.error("Failed to clone production database into local test database:", error instanceof Error ? error.message : error);
  console.error("Make sure pg_dump and psql are installed and available in PATH.");
  process.exit(1);
});
