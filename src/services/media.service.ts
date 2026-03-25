import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { pool } from "../db/pool";

const MEDIA_DIR = path.resolve(process.cwd(), "storage", "media");
let ensureMediaStoragePromise: Promise<void> | null = null;

async function ensureMediaStorageSchema(): Promise<void> {
  if (!ensureMediaStoragePromise) {
    ensureMediaStoragePromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS media_files (
          file_name TEXT PRIMARY KEY,
          mime_type TEXT,
          content BYTEA NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        ensureMediaStoragePromise = null;
        throw error;
      });
  }

  await ensureMediaStoragePromise;
}

function extFromFileName(fileName: string): string {
  const ext = path.extname(String(fileName || "")).replace(".", "").toLowerCase();
  return ext || "";
}

function extFromMime(mimeType: string): string {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("officedocument.wordprocessingml")) return "docx";
  if (mime.includes("vnd.ms-excel")) return "xls";
  if (mime.includes("officedocument.spreadsheetml")) return "xlsx";
  if (mime.includes("vnd.ms-powerpoint")) return "ppt";
  if (mime.includes("officedocument.presentationml")) return "pptx";
  if (mime.includes("zip")) return "zip";
  if (mime.includes("rar")) return "rar";
  if (mime.includes("7z")) return "7z";
  if (mime.includes("csv")) return "csv";
  if (mime.includes("plain")) return "txt";
  if (mime.includes("json")) return "json";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "";
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function persistMediaBlob(fileName: string, mimeType: string | null | undefined, buffer: Buffer): Promise<void> {
  await ensureMediaStorageSchema();
  await pool.query(
    `
    INSERT INTO media_files (file_name, mime_type, content)
    VALUES ($1, $2, $3)
    ON CONFLICT (file_name) DO UPDATE
      SET mime_type = COALESCE(EXCLUDED.mime_type, media_files.mime_type),
          content = EXCLUDED.content
    `,
    [fileName, mimeType || null, buffer],
  );
}

export async function saveImageBuffer(input: {
  buffer: Buffer;
  mimeType?: string | null;
  externalMessageId?: string | null;
  fileName?: string | null;
}): Promise<string> {
  return saveMediaBuffer(input);
}

export async function saveMediaBuffer(input: {
  buffer: Buffer;
  mimeType?: string | null;
  externalMessageId?: string | null;
  fileName?: string | null;
}): Promise<string> {
  await mkdir(MEDIA_DIR, { recursive: true });

  const extByMime = extFromMime(input.mimeType || "");
  const extByName = extFromFileName(input.fileName || "");
  const ext = extByMime || extByName || "bin";
  const id = safeId(input.externalMessageId || `${Date.now()}`);
  const fileName = `${Date.now()}-${id}.${ext}`;
  const fullPath = path.join(MEDIA_DIR, fileName);

  await writeFile(fullPath, input.buffer);
  await persistMediaBlob(fileName, input.mimeType || null, input.buffer);
  return `/media/${fileName}`;
}

export async function getMediaBlob(fileName: string): Promise<{ mimeType: string | null; content: Buffer } | null> {
  await ensureMediaStorageSchema();
  const result = await pool.query<{ mime_type: string | null; content: Buffer }>(
    `
    SELECT mime_type, content
    FROM media_files
    WHERE file_name = $1
    LIMIT 1
    `,
    [fileName],
  );
  if (!result.rows.length) {
    return null;
  }
  return {
    mimeType: result.rows[0].mime_type || null,
    content: result.rows[0].content,
  };
}

export async function syncLocalMediaDirectoryToDatabase(): Promise<{ synced: number }> {
  await ensureMediaStorageSchema();
  await mkdir(MEDIA_DIR, { recursive: true });
  const entries = await readdir(MEDIA_DIR, { withFileTypes: true });
  let synced = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    const existing = await pool.query(`SELECT 1 FROM media_files WHERE file_name = $1 LIMIT 1`, [fileName]);
    if (existing.rows.length > 0) continue;

    const fullPath = path.join(MEDIA_DIR, fileName);
    const buffer = await readFile(fullPath);
    const ext = path.extname(fileName).replace(".", "").toLowerCase();
    const mimeType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : ext === "mp4"
                ? "video/mp4"
                : ext === "ogg"
                  ? "audio/ogg"
                  : ext === "mp3"
                    ? "audio/mpeg"
                    : ext === "pdf"
                      ? "application/pdf"
                      : "application/octet-stream";

    await persistMediaBlob(fileName, mimeType, buffer);
    synced += 1;
  }

  return { synced };
}

export async function loadMediaBufferFromUrl(
  mediaUrl: string,
): Promise<{ buffer: Buffer; mimeType: string | null; fileName: string | null } | null> {
  const url = String(mediaUrl || "").trim();
  if (!url) return null;

  if (url.startsWith("/media/")) {
    const fileName = path.basename(url);
    const localPath = path.join(MEDIA_DIR, fileName);
    try {
      const buffer = await readFile(localPath);
      const ext = path.extname(fileName).replace(".", "").toLowerCase();
      const mimeType =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : ext === "mp4"
                  ? "video/mp4"
                  : "application/octet-stream";
      if (mimeType === "image/webp") {
        const convertedBuffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
        const convertedName = fileName.replace(/\.webp$/i, ".jpg");
        return { buffer: convertedBuffer, mimeType: "image/jpeg", fileName: convertedName };
      }
      return { buffer, mimeType, fileName };
    } catch {
      const blob = await getMediaBlob(fileName);
      if (!blob) return null;
      if (String(blob.mimeType || "").toLowerCase() === "image/webp") {
        const convertedBuffer = await sharp(blob.content).jpeg({ quality: 92 }).toBuffer();
        const convertedName = fileName.replace(/\.webp$/i, ".jpg");
        return { buffer: convertedBuffer, mimeType: "image/jpeg", fileName: convertedName };
      }
      return { buffer: blob.content, mimeType: blob.mimeType, fileName };
    }
  }

  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type");
    const fileName = path.basename(new URL(url).pathname || "");
    if (String(mimeType || "").toLowerCase() === "image/webp") {
      const convertedBuffer = await sharp(Buffer.from(arrayBuffer)).jpeg({ quality: 92 }).toBuffer();
      const convertedName = fileName.replace(/\.webp$/i, ".jpg") || "imagem.jpg";
      return {
        buffer: convertedBuffer,
        mimeType: "image/jpeg",
        fileName: convertedName,
      };
    }
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
      fileName: fileName || null,
    };
  }

  return null;
}
