import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MEDIA_DIR = path.resolve(process.cwd(), "storage", "media");

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
  return `/media/${fileName}`;
}
