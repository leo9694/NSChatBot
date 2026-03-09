import { pool } from "../db/pool";
import { saveOutboundMessage } from "../repositories/messages.repository";
import { upsertWhatsAppAccount } from "../repositories/accounts.repository";
import { getCurrentWhatsAppAccount, sendWhatsAppText } from "./whatsapp.service";
import { normalizePhone } from "../utils/whatsapp";

interface ContactInput {
  name?: string;
  phone: string;
}

interface CreateBulkJobInput {
  contacts: ContactInput[];
  message: string;
  messages?: string[];
  intervalMinSeconds: number;
  intervalMaxSeconds: number;
}

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
      const messageTemplates = extractMessageTemplates(job.metadata, job.message_text);
      if (!messageTemplates.length) {
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
        const connected = getCurrentWhatsAppAccount();
        if (!connected.waJid || connected.waJid !== job.account_wa_jid) {
          throw new Error("Conta WhatsApp conectada nao corresponde ao disparo.");
        }

        const selectedTemplate = pickRandomMessageTemplate(messageTemplates);
        const renderedMessage = renderTemplateMessage(selectedTemplate, item.contact_name || null, item.phone);
        const waResponse = await sendWhatsAppText({
          to: item.phone,
          message: renderedMessage,
        });

        await saveOutboundMessage({
          accountJid: job.account_wa_jid,
          accountDisplayName: connected.displayName,
          phone: item.phone,
          body: renderedMessage,
          messageType: "text",
          status: "sent",
          externalMessageId: waResponse?.key?.id || null,
          payload: waResponse,
          metadata: {
            bulk_dispatch: true,
            bulk_contact_name: item.contact_name || null,
            bulk_original_phone: item.phone,
            bulk_used_phone: item.phone,
          },
          isBulkDispatch: true,
        });

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
          [item.id, waResponse?.key?.id || null],
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
  const messageTemplates = normalizeMessageTemplates(input.message, input.messages);
  const message = messageTemplates[0] || "";
  const intervalMinSeconds = Math.floor(Number(input.intervalMinSeconds || 0));
  const intervalMaxSeconds = Math.floor(Number(input.intervalMaxSeconds || 0));
  if (!message) {
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

  const connected = getCurrentWhatsAppAccount();
  if (!connected.waJid) {
    throw new Error("WhatsApp nao conectado.");
  }

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
          bulk_messages: messageTemplates,
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

export async function listBulkDispatchJobs(limit: number): Promise<any[]> {
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
    ORDER BY j.created_at DESC
    LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

export async function getBulkDispatchJob(jobId: string): Promise<{ job: any; items: any[] } | null> {
  await ensureBulkDispatchSchema();
  const jobResult = await pool.query(
    `
    SELECT
      id,
      account_wa_jid,
      message_text,
      interval_seconds,
      COALESCE(interval_min_seconds, interval_seconds) AS interval_min_seconds,
      COALESCE(interval_max_seconds, interval_seconds) AS interval_max_seconds,
      status,
      total_count,
      sent_count, failed_count, started_at, finished_at, created_at, updated_at
    FROM bulk_dispatch_jobs
    WHERE id = $1
    `,
    [jobId],
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

export async function stopBulkDispatchJob(jobId: string): Promise<void> {
  await ensureBulkDispatchSchema();
  await updateJobStatus(jobId, "stopped", true);
}

export async function deleteBulkDispatchJob(jobId: string): Promise<boolean> {
  await ensureBulkDispatchSchema();
  const existing = await pool.query<{ status: string }>(
    `
    SELECT status
    FROM bulk_dispatch_jobs
    WHERE id = $1
    LIMIT 1
    `,
    [jobId],
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
