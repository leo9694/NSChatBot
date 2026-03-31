import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { pool } from "../db/pool";
import { saveOutboundMessage } from "../repositories/messages.repository";
import { upsertWhatsAppAccount } from "../repositories/accounts.repository";
import { requireActiveWhatsAppAccount } from "./whatsapp-account-context.service";
import { saveMediaBuffer } from "./media.service";
import { getCurrentWhatsAppAccount, sendWhatsAppAudio, sendWhatsAppMedia, sendWhatsAppText } from "./whatsapp.service";
import { normalizePhone } from "../utils/whatsapp";

interface ContactInput {
  name?: string;
  phone: string;
}

interface BulkMessageBlockInput {
  type?: string;
  text?: string;
  file_base64?: string;
  mimetype?: string;
  file_name?: string;
  caption?: string;
}

interface CreateBulkJobInput {
  userId?: string | null;
  companyId?: string | null;
  contacts: ContactInput[];
  message: string;
  messages?: string[];
  messageBlocks?: BulkMessageBlockInput[];
  intervalMinSeconds: number;
  intervalMaxSeconds: number;
  enableAiAgent?: boolean;
}

type BulkMessageBlock =
  | { type: "text"; text: string }
  | { type: "image" | "video"; file_base64: string; mimetype: string; file_name: string; caption: string }
  | { type: "audio"; file_base64: string; mimetype: string; file_name: string };

type JobStatus = "queued" | "running" | "completed" | "failed" | "stopped";

const runningJobs = new Set<string>();
let bulkSchemaReady = false;

async function ensureBulkDispatchSchema(): Promise<void> {
  if (bulkSchemaReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_dispatch_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
      account_wa_jid VARCHAR(80) NOT NULL,
      message_text TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL CHECK (interval_seconds >= 30 AND interval_seconds <= 3600),
      status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'stopped')),
      total_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE bulk_dispatch_jobs
    ADD COLUMN IF NOT EXISTS interval_min_seconds INTEGER
  `);
  await pool.query(`
    ALTER TABLE bulk_dispatch_jobs
    ADD COLUMN IF NOT EXISTS interval_max_seconds INTEGER
  `);
  await pool.query(`
    UPDATE bulk_dispatch_jobs
    SET
      interval_min_seconds = COALESCE(interval_min_seconds, interval_seconds),
      interval_max_seconds = COALESCE(interval_max_seconds, interval_seconds)
    WHERE interval_min_seconds IS NULL OR interval_max_seconds IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_dispatch_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES bulk_dispatch_jobs(id) ON DELETE CASCADE,
      phone VARCHAR(30) NOT NULL,
      contact_name VARCHAR(160),
      status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
      error_message TEXT,
      external_message_id VARCHAR(120),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_jobs_status ON bulk_dispatch_jobs(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_jobs_created_at ON bulk_dispatch_jobs(created_at DESC);`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bulk_dispatch_one_active_per_account
    ON bulk_dispatch_jobs(account_wa_jid)
    WHERE status IN ('queued', 'running')
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_items_job_id ON bulk_dispatch_items(job_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_items_status ON bulk_dispatch_items(status);`);

  bulkSchemaReady = true;
}

function normalizeBrazilPhone(rawPhone: string): string {
  const digits = normalizePhone(rawPhone);
  if (!digits) return "";
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const national = withCountry.slice(2);
  if (national.length === 11 && national[2] === "9") {
    return `55${national.slice(0, 2)}${national.slice(3)}`;
  }
  return withCountry;
}

function renderTemplateMessage(template: string, contactName: string | null, phone: string): string {
  const safeName = (contactName || "").trim() || phone;
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, safeName)
    .replace(/\{\{\s*name\s*\}\}/gi, safeName)
    .replace(/\{\{\s*telefone\s*\}\}/gi, phone)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandomIntervalSeconds(minSeconds: number, maxSeconds: number): number {
  const min = Math.floor(Number(minSeconds || 0));
  const max = Math.floor(Number(maxSeconds || 0));
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeMessageTemplates(message: string, messages?: string[]): string[] {
  const normalized = Array.isArray(messages)
    ? messages.map((item) => String(item || "").trim()).filter((item) => item.length > 0)
    : [];

  const fallback = String(message || "").trim();
  if (!normalized.length && fallback) {
    normalized.push(fallback);
  }

  return normalized;
}

function normalizeBulkMessageBlocks(input?: BulkMessageBlockInput[] | null, fallbackMessage?: string, fallbackMessages?: string[]): BulkMessageBlock[] {
  const normalizedBlocks: BulkMessageBlock[] = [];
  for (const raw of Array.isArray(input) ? input : []) {
    const type = String(raw?.type || "").trim().toLowerCase();
    if (type === "text") {
      const text = String(raw?.text || "").trim();
      if (text) {
        normalizedBlocks.push({ type: "text", text });
      }
      continue;
    }

    if (type === "image" || type === "video") {
      const fileBase64 = String(raw?.file_base64 || "").trim();
      const mimetype = String(raw?.mimetype || "").trim();
      if (!fileBase64 || !mimetype) continue;
      normalizedBlocks.push({
        type,
        file_base64: fileBase64,
        mimetype,
        file_name: String(raw?.file_name || "arquivo").trim() || "arquivo",
        caption: String(raw?.caption || "").trim(),
      });
      continue;
    }

    if (type === "audio") {
      const fileBase64 = String(raw?.file_base64 || "").trim();
      const mimetype = String(raw?.mimetype || "").trim() || "audio/ogg";
      if (!fileBase64) continue;
      normalizedBlocks.push({
        type: "audio",
        file_base64: fileBase64,
        mimetype,
        file_name: String(raw?.file_name || "audio").trim() || "audio",
      });
    }
  }

  if (normalizedBlocks.length > 0) {
    return normalizedBlocks;
  }

  return normalizeMessageTemplates(fallbackMessage || "", fallbackMessages || []).map((text) => ({
    type: "text",
    text,
  }));
}

function extractMessageBlocks(metadata: unknown, fallbackMessage: string): BulkMessageBlock[] {
  const payload = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const rawBlocks = Array.isArray(payload.bulk_message_blocks) ? (payload.bulk_message_blocks as BulkMessageBlockInput[]) : [];
  const rawMessages = Array.isArray(payload.bulk_messages) ? (payload.bulk_messages as string[]) : [];
  return normalizeBulkMessageBlocks(rawBlocks, fallbackMessage, rawMessages);
}

function summarizeBulkMessageBlock(block: BulkMessageBlock): string {
  if (block.type === "text") return block.text;
  if (block.type === "audio") return "[audio]";
  if (block.type === "video") return block.caption || "[video]";
  return block.caption || "[imagem]";
}

async function transcodeToOggOpus(inputBuffer: Buffer): Promise<Buffer> {
  const ffmpegBin = ffmpegPath as string | null;
  if (!ffmpegBin) {
    return inputBuffer;
  }

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      ffmpegBin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-c:a",
        "libopus",
        "-b:a",
        "48k",
        "-vbr",
        "on",
        "-compression_level",
        "10",
        "-f",
        "ogg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    ffmpeg.stderr.on("data", (chunk: Buffer) => errChunks.push(Buffer.from(chunk)));
    ffmpeg.on("error", (error: Error) => reject(error));
    ffmpeg.on("close", (code: number | null) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
        return;
      }
      const details = Buffer.concat(errChunks).toString("utf8") || `ffmpeg exit code ${code}`;
      reject(new Error(`Falha ao converter audio: ${details}`));
    });

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

function extractMessageTemplates(metadata: unknown, fallbackMessage: string): string[] {
  const payload = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const fromMetadata = Array.isArray(payload.bulk_messages)
    ? payload.bulk_messages.map((item) => String(item || "").trim()).filter((item) => item.length > 0)
    : [];

  if (fromMetadata.length > 0) {
    return fromMetadata;
  }

  const fallback = String(fallbackMessage || "").trim();
  return fallback ? [fallback] : [];
}

function pickRandomMessageTemplate(templates: string[]): string {
  if (!templates.length) return "";
  if (templates.length === 1) return templates[0];
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

async function updateJobStatus(jobId: string, status: JobStatus, finished = false): Promise<void> {
  await ensureBulkDispatchSchema();
  await pool.query(
    `
    UPDATE bulk_dispatch_jobs
    SET
      status = $2,
      finished_at = CASE WHEN $3 THEN NOW() ELSE finished_at END,
      updated_at = NOW()
    WHERE id = $1
    `,
    [jobId, status, finished],
  );
}

async function processJob(jobId: string): Promise<void> {
  if (runningJobs.has(jobId)) {
    return;
  }
  runningJobs.add(jobId);

  try {
    await pool.query(
      `
      UPDATE bulk_dispatch_jobs
      SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = $1
      `,
      [jobId],
    );

    while (true) {
      const jobResult = await pool.query(
        `
        SELECT
          id,
          account_id,
          account_wa_jid,
          message_text,
          metadata,
          interval_seconds,
          interval_min_seconds,
          interval_max_seconds,
          status
        FROM bulk_dispatch_jobs
        WHERE id = $1
        `,
        [jobId],
      );
      if (jobResult.rows.length === 0) {
        break;
      }

      const job = jobResult.rows[0];
      if (job.status === "stopped" || job.status === "failed" || job.status === "completed") {
        break;
      }
      const messageBlocks = extractMessageBlocks(job.metadata, job.message_text);
      if (!messageBlocks.length) {
        throw new Error("Nenhuma mensagem valida encontrada para o disparo.");
      }

      const itemResult = await pool.query(
        `
        SELECT id, phone, contact_name
        FROM bulk_dispatch_items
        WHERE job_id = $1
          AND status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        `,
        [jobId],
      );

      if (itemResult.rows.length === 0) {
        await updateJobStatus(jobId, "completed", true);
        break;
      }

      const item = itemResult.rows[0];

      try {
        const connected = getCurrentWhatsAppAccount(job.account_wa_jid);
        if (!connected.waJid || connected.waJid !== job.account_wa_jid) {
          throw new Error("Conta WhatsApp conectada nao corresponde ao disparo.");
        }

        let lastExternalMessageId: string | null = null;
        for (let index = 0; index < messageBlocks.length; index += 1) {
          const block = messageBlocks[index];
          if (block.type === "text") {
            const renderedMessage = renderTemplateMessage(block.text, item.contact_name || null, item.phone);
            const waResponse = await sendWhatsAppText({
              to: item.phone,
              message: renderedMessage,
              accountJid: job.account_wa_jid,
            });
            lastExternalMessageId = waResponse?.key?.id || null;
            await saveOutboundMessage({
              accountJid: job.account_wa_jid,
              accountDisplayName: connected.displayName,
              phone: item.phone,
              body: renderedMessage,
              messageType: "text",
              status: "sent",
              externalMessageId: lastExternalMessageId,
              payload: waResponse,
              metadata: {
                bulk_dispatch: true,
                bulk_contact_name: item.contact_name || null,
                bulk_original_phone: item.phone,
                bulk_used_phone: item.phone,
                bulk_enable_ai_agent: Boolean(job.metadata?.bulk_enable_ai_agent),
                bulk_campaign_context: String(job.metadata?.bulk_campaign_context || "").trim() || renderedMessage,
                bulk_message_index: index,
                bulk_message_type: "text",
              },
              isBulkDispatch: true,
            });
          } else if (block.type === "audio") {
            const commaIndex = block.file_base64.indexOf(",");
            const base64 = commaIndex >= 0 ? block.file_base64.slice(commaIndex + 1) : block.file_base64;
            const sourceBuffer = Buffer.from(base64, "base64");
            const audioBuffer = await transcodeToOggOpus(sourceBuffer);
            const mimetype = "audio/ogg; codecs=opus";
            const waResponse = await sendWhatsAppAudio({
              to: item.phone,
              audioBuffer,
              mimetype,
              ptt: true,
              accountJid: job.account_wa_jid,
            });
            lastExternalMessageId = waResponse?.key?.id || null;
            const audioUrl = await saveMediaBuffer({
              buffer: audioBuffer,
              mimeType: mimetype,
              externalMessageId: lastExternalMessageId,
              fileName: block.file_name || "audio",
            });
            await saveOutboundMessage({
              accountJid: job.account_wa_jid,
              accountDisplayName: connected.displayName,
              phone: item.phone,
              body: "[audio]",
              messageType: "audioMessage",
              status: "sent",
              externalMessageId: lastExternalMessageId,
              payload: waResponse,
              metadata: {
                bulk_dispatch: true,
                bulk_contact_name: item.contact_name || null,
                bulk_original_phone: item.phone,
                bulk_used_phone: item.phone,
                bulk_enable_ai_agent: Boolean(job.metadata?.bulk_enable_ai_agent),
                bulk_campaign_context: String(job.metadata?.bulk_campaign_context || "").trim() || "[audio]",
                bulk_message_index: index,
                bulk_message_type: "audio",
                audio_url: audioUrl,
                file_name: block.file_name || null,
              },
              isBulkDispatch: true,
            });
          } else {
            const commaIndex = block.file_base64.indexOf(",");
            const base64 = commaIndex >= 0 ? block.file_base64.slice(commaIndex + 1) : block.file_base64;
            const mediaBuffer = Buffer.from(base64, "base64");
            const renderedCaption = renderTemplateMessage(block.caption || "", item.contact_name || null, item.phone);
            const waResponse = await sendWhatsAppMedia({
              to: item.phone,
              mediaBuffer,
              mimetype: block.mimetype,
              fileName: block.file_name,
              caption: renderedCaption,
              accountJid: job.account_wa_jid,
            });
            lastExternalMessageId = waResponse?.key?.id || null;
            const mediaUrl = await saveMediaBuffer({
              buffer: mediaBuffer,
              mimeType: block.mimetype,
              externalMessageId: lastExternalMessageId,
              fileName: block.file_name,
            });
            const bodyText = block.type === "video" ? renderedCaption || "[video]" : renderedCaption || "[imagem]";
            await saveOutboundMessage({
              accountJid: job.account_wa_jid,
              accountDisplayName: connected.displayName,
              phone: item.phone,
              body: bodyText,
              messageType: block.type === "video" ? "videoMessage" : "imageMessage",
              status: "sent",
              externalMessageId: lastExternalMessageId,
              payload: waResponse,
              metadata: {
                bulk_dispatch: true,
                bulk_contact_name: item.contact_name || null,
                bulk_original_phone: item.phone,
                bulk_used_phone: item.phone,
                bulk_enable_ai_agent: Boolean(job.metadata?.bulk_enable_ai_agent),
                bulk_campaign_context: String(job.metadata?.bulk_campaign_context || "").trim() || bodyText,
                bulk_message_index: index,
                bulk_message_type: block.type,
                image_preview_url: block.type === "image" ? mediaUrl : null,
                video_url: block.type === "video" ? mediaUrl : null,
                file_url: mediaUrl,
                file_name: block.file_name || null,
                mime_type: block.mimetype || null,
              },
              isBulkDispatch: true,
            });
          }

          if (index < messageBlocks.length - 1) {
            await delay(1200);
          }
        }

        await pool.query(
          `
          UPDATE bulk_dispatch_items
          SET
            status = 'sent',
            error_message = NULL,
            external_message_id = $2,
            attempt_count = attempt_count + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          `,
          [item.id, lastExternalMessageId],
        );

        await pool.query(
          `
          UPDATE bulk_dispatch_jobs
          SET
            sent_count = sent_count + 1,
            updated_at = NOW()
          WHERE id = $1
          `,
          [jobId],
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Falha ao enviar";
        await pool.query(
          `
          UPDATE bulk_dispatch_items
          SET
            status = 'failed',
            error_message = $2,
            attempt_count = attempt_count + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          `,
          [item.id, errorMessage],
        );
        await pool.query(
          `
          UPDATE bulk_dispatch_jobs
          SET
            failed_count = failed_count + 1,
            updated_at = NOW()
          WHERE id = $1
          `,
          [jobId],
        );
      }

      const intervalMin = Math.max(40, Number(job.interval_min_seconds || job.interval_seconds || 40));
      const intervalMax = Math.max(intervalMin, Number(job.interval_max_seconds || job.interval_seconds || intervalMin));
      const waitSeconds = pickRandomIntervalSeconds(intervalMin, intervalMax);
      await delay(waitSeconds * 1000);
    }
  } catch {
    await updateJobStatus(jobId, "failed", true);
  } finally {
    runningJobs.delete(jobId);
  }
}

export async function createBulkDispatchJob(input: CreateBulkJobInput): Promise<{ jobId: string; total: number }> {
  await ensureBulkDispatchSchema();
  const messageBlocks = normalizeBulkMessageBlocks(input.messageBlocks, input.message, input.messages);
  const message = summarizeBulkMessageBlock(messageBlocks[0]) || "";
  const intervalMinSeconds = Math.floor(Number(input.intervalMinSeconds || 0));
  const intervalMaxSeconds = Math.floor(Number(input.intervalMaxSeconds || 0));
  if (!messageBlocks.length) {
    throw new Error("Ao menos 1 mensagem obrigatoria.");
  }
  if (
    !Number.isFinite(intervalMinSeconds) ||
    !Number.isFinite(intervalMaxSeconds) ||
    intervalMinSeconds < 40
  ) {
    throw new Error("Intervalo menor que 40 segundos tem alto risco de ban. Ajuste para 40s ou mais.");
  }
  const safeIntervalMaxSeconds = Math.max(intervalMinSeconds, intervalMaxSeconds);
  if (safeIntervalMaxSeconds > 3600) {
    throw new Error("Intervalo maximo permitido: 3600 segundos.");
  }

  const accountContext = await requireActiveWhatsAppAccount(input.userId, input.companyId || null);
  const connected = accountContext.effective!;

  const account = await upsertWhatsAppAccount({
    waJid: connected.waJid,
    displayName: connected.displayName,
  });

  const existingActive = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM bulk_dispatch_jobs
    WHERE account_wa_jid = $1
      AND status IN ('queued', 'running')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [connected.waJid],
  );
  if (existingActive.rows.length > 0) {
    const activeJobId = existingActive.rows[0].id;
    setImmediate(() => {
      processJob(activeJobId).catch(() => undefined);
    });
    throw new Error("Ja existe um disparo em massa ativo para este telefone. Aguarde finalizar ou pare o disparo atual.");
  }

  const deduped = new Map<string, { name: string | null; phone: string }>();
  for (const raw of input.contacts || []) {
    const normalized = normalizeBrazilPhone(raw.phone || "");
    if (!normalized) continue;
    if (!deduped.has(normalized)) {
      deduped.set(normalized, {
        phone: normalized,
        name: String(raw.name || "").trim() || null,
      });
    }
  }

  const contacts = Array.from(deduped.values());
  if (contacts.length === 0) {
    throw new Error("Nenhum contato valido encontrado.");
  }

  await pool.query("BEGIN");
  try {
    const jobResult = await pool.query(
      `
      INSERT INTO bulk_dispatch_jobs (
        account_id, account_wa_jid, message_text, interval_seconds, interval_min_seconds, interval_max_seconds, metadata, status, total_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'queued', $8)
      RETURNING id
      `,
      [
        account.id,
        connected.waJid,
        message,
        intervalMinSeconds,
        intervalMinSeconds,
        safeIntervalMaxSeconds,
        JSON.stringify({
          bulk_messages: messageBlocks.filter((item) => item.type === "text").map((item: any) => item.text).filter(Boolean),
          bulk_message_blocks: messageBlocks,
          bulk_enable_ai_agent: Boolean(input.enableAiAgent),
          bulk_campaign_context: messageBlocks.map((item) => summarizeBulkMessageBlock(item)).join("\n\n---\n\n"),
        }),
        contacts.length,
      ],
    );

    const jobId = jobResult.rows[0].id as string;

    for (const contact of contacts) {
      await pool.query(
        `
        INSERT INTO bulk_dispatch_items (job_id, phone, contact_name, status)
        VALUES ($1, $2, $3, 'queued')
        `,
        [jobId, contact.phone, contact.name],
      );
    }

    await pool.query("COMMIT");
    setImmediate(() => {
      processJob(jobId).catch(() => undefined);
    });
    return { jobId, total: contacts.length };
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    if ((error as any)?.code === "23505") {
      throw new Error("Ja existe um disparo em massa ativo para este telefone. Aguarde finalizar ou pare o disparo atual.");
    }
    throw error;
  }
}

export async function listBulkDispatchJobs(limit: number, companyId?: string | null): Promise<any[]> {
  await ensureBulkDispatchSchema();
  const result = await pool.query(
    `
    SELECT
      j.id,
      j.account_wa_jid,
      j.message_text,
      j.interval_seconds,
      COALESCE(j.interval_min_seconds, j.interval_seconds) AS interval_min_seconds,
      COALESCE(j.interval_max_seconds, j.interval_seconds) AS interval_max_seconds,
      j.status,
      j.total_count,
      j.sent_count,
      j.failed_count,
      j.started_at,
      j.finished_at,
      j.created_at,
      j.updated_at
    FROM bulk_dispatch_jobs j
    LEFT JOIN whatsapp_accounts wa ON wa.id = j.account_id
    WHERE ($2::uuid IS NULL OR wa.company_id = $2)
    ORDER BY j.created_at DESC
    LIMIT $1
    `,
    [limit, companyId || null],
  );
  return result.rows;
}

export async function getBulkDispatchJob(jobId: string, companyId?: string | null): Promise<{ job: any; items: any[] } | null> {
  await ensureBulkDispatchSchema();
  const jobResult = await pool.query(
    `
    SELECT
      j.id,
      j.account_wa_jid,
      j.message_text,
      j.interval_seconds,
      COALESCE(j.interval_min_seconds, j.interval_seconds) AS interval_min_seconds,
      COALESCE(j.interval_max_seconds, j.interval_seconds) AS interval_max_seconds,
      j.status,
      j.total_count,
      j.sent_count,
      j.failed_count,
      j.started_at,
      j.finished_at,
      j.created_at,
      j.updated_at
    FROM bulk_dispatch_jobs j
    LEFT JOIN whatsapp_accounts wa ON wa.id = j.account_id
    WHERE j.id = $1
      AND ($2::uuid IS NULL OR wa.company_id = $2)
    `,
    [jobId, companyId || null],
  );
  if (jobResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await pool.query(
    `
    SELECT id, phone, contact_name, status, error_message, external_message_id, attempt_count, last_attempt_at
    FROM bulk_dispatch_items
    WHERE job_id = $1
    ORDER BY created_at ASC
    `,
    [jobId],
  );

  return { job: jobResult.rows[0], items: itemsResult.rows };
}

export async function stopBulkDispatchJob(jobId: string, companyId?: string | null): Promise<void> {
  await ensureBulkDispatchSchema();
  if (companyId) {
    const allowed = await pool.query(
      `
      SELECT 1
      FROM bulk_dispatch_jobs j
      LEFT JOIN whatsapp_accounts wa ON wa.id = j.account_id
      WHERE j.id = $1
        AND wa.company_id = $2
      LIMIT 1
      `,
      [jobId, companyId],
    );
    if (!allowed.rows.length) {
      throw new Error("DISPATCH_NOT_FOUND");
    }
  }
  await updateJobStatus(jobId, "stopped", true);
}

export async function deleteBulkDispatchJob(jobId: string, companyId?: string | null): Promise<boolean> {
  await ensureBulkDispatchSchema();
  const existing = await pool.query<{ status: string }>(
    `
    SELECT j.status
    FROM bulk_dispatch_jobs j
    LEFT JOIN whatsapp_accounts wa ON wa.id = j.account_id
    WHERE j.id = $1
      AND ($2::uuid IS NULL OR wa.company_id = $2)
    LIMIT 1
    `,
    [jobId, companyId || null],
  );
  if (!existing.rows.length) {
    return false;
  }

  const status = String(existing.rows[0].status || "");
  if (status === "queued" || status === "running") {
    throw new Error("Interrompa o disparo em andamento antes de excluir.");
  }

  await pool.query(`DELETE FROM bulk_dispatch_jobs WHERE id = $1`, [jobId]);
  return true;
}

export async function resumePendingBulkDispatchJobs(): Promise<void> {
  await ensureBulkDispatchSchema();
  const result = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM bulk_dispatch_jobs
    WHERE status IN ('queued', 'running')
    ORDER BY created_at ASC
    `,
  );

  for (const row of result.rows) {
    setImmediate(() => {
      processJob(row.id).catch(() => undefined);
    });
  }
}
