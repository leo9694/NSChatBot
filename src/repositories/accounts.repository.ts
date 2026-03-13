import { pool } from "../db/pool";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { jidToPhone, normalizeChatJid } from "../utils/whatsapp";

export interface UpsertWhatsAppAccountInput {
  waJid: string;
  displayName?: string | null;
  sessionPath?: string | null;
}

export interface WhatsAppAccountRow {
  id: string;
  wa_jid: string;
  phone: string;
  display_name: string | null;
}

export interface WhatsAppHistorySyncState {
  id: string;
  baselineAt: Date | null;
}

export interface WhatsAppAccountListItem {
  id: string;
  wa_jid: string;
  phone: string;
  display_name: string | null;
  session_path: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWhatsAppContext {
  user_id: string;
  selected_account_id: string | null;
}

export interface UserSelectedWhatsAppAccountRow extends UserWhatsAppContext {
  wa_jid: string | null;
  phone: string | null;
  display_name: string | null;
  session_path: string | null;
}

let ensureUserWhatsAppContextPromise: Promise<void> | null = null;

async function ensureUserWhatsAppContextSchema(): Promise<void> {
  if (!ensureUserWhatsAppContextPromise) {
    ensureUserWhatsAppContextPromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS app_user_whatsapp_contexts (
          user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
          selected_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        ensureUserWhatsAppContextPromise = null;
        throw error;
      });
  }

  await ensureUserWhatsAppContextPromise;
}

export async function upsertWhatsAppAccount(input: UpsertWhatsAppAccountInput): Promise<WhatsAppAccountRow> {
  const normalizedJid = normalizeChatJid(input.waJid);
  const phone = jidToPhone(normalizedJid);
  const sessionPath = input.sessionPath || null;

  if (sessionPath) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const pendingRow = await client.query<{ id: string; display_name: string | null }>(
        `
        SELECT id, display_name
        FROM whatsapp_accounts
        WHERE session_path = $1
          AND wa_jid LIKE 'pending:%'
        LIMIT 1
        `,
        [sessionPath],
      );

      if (pendingRow.rows.length > 0) {
        const pending = pendingRow.rows[0];
        const existingRealRow = await client.query<WhatsAppAccountRow>(
          `
          SELECT id, wa_jid, phone, display_name
          FROM whatsapp_accounts
          WHERE wa_jid = $1
          LIMIT 1
          `,
          [normalizedJid],
        );

        if (existingRealRow.rows.length > 0) {
          const existing = existingRealRow.rows[0];

          await client.query(
            `
            UPDATE whatsapp_accounts
            SET
              phone = $2,
              display_name = COALESCE(display_name, $3, display_name),
              session_path = $4,
              last_seen_at = NOW(),
              updated_at = NOW(),
              metadata = (COALESCE(metadata, '{}'::jsonb) - 'pending') - 'detached'
            WHERE id = $1
            `,
            [existing.id, phone, input.displayName || pending.display_name || null, sessionPath],
          );

          await client.query(
            `
            UPDATE app_user_whatsapp_contexts
            SET
              selected_account_id = $2,
              updated_at = NOW()
            WHERE selected_account_id = $1
            `,
            [pending.id, existing.id],
          );

          await client.query(`DELETE FROM whatsapp_accounts WHERE id = $1`, [pending.id]);
          await client.query("COMMIT");

          return {
            id: existing.id,
            wa_jid: normalizedJid,
            phone,
            display_name: existing.display_name || input.displayName || pending.display_name || null,
          };
        }

        const pendingResult = await client.query<WhatsAppAccountRow>(
          `
          UPDATE whatsapp_accounts
          SET
            wa_jid = $2,
            phone = $3,
            display_name = COALESCE($4, display_name),
            session_path = $5,
            last_seen_at = NOW(),
            updated_at = NOW(),
            metadata = (COALESCE(metadata, '{}'::jsonb) - 'pending') - 'detached'
          WHERE id = $1
          RETURNING id, wa_jid, phone, display_name
          `,
          [pending.id, normalizedJid, phone, input.displayName || null, sessionPath],
        );

        await client.query("COMMIT");
        if (pendingResult.rows.length > 0) {
          return pendingResult.rows[0];
        }
      } else {
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const result = await pool.query<WhatsAppAccountRow>(
    `
    INSERT INTO whatsapp_accounts (wa_jid, phone, display_name, session_path, last_seen_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (wa_jid) DO UPDATE SET
      phone = EXCLUDED.phone,
      display_name = COALESCE(EXCLUDED.display_name, whatsapp_accounts.display_name),
      session_path = COALESCE(EXCLUDED.session_path, whatsapp_accounts.session_path),
      last_seen_at = NOW(),
      updated_at = NOW(),
      metadata = (COALESCE(whatsapp_accounts.metadata, '{}'::jsonb) - 'detached') - 'pending'
    RETURNING id, wa_jid, phone, display_name
    `,
    [normalizedJid, phone, input.displayName || null, sessionPath],
  );

  if (result.rows.length === 0) {
    throw new Error("Failed to upsert WhatsApp account.");
  }

  return result.rows[0];
}

export async function getWhatsAppHistorySyncState(waJid: string): Promise<WhatsAppHistorySyncState> {
  const normalizedJid = normalizeChatJid(waJid);
  const account = await upsertWhatsAppAccount({ waJid: normalizedJid });

  const result = await pool.query<{ id: string; baseline_at: Date | null }>(
    `
    SELECT
      id,
      CASE
        WHEN COALESCE(metadata->>'history_sync_baseline_at', '') = '' THEN NULL
        ELSE (metadata->>'history_sync_baseline_at')::timestamptz
      END AS baseline_at
    FROM whatsapp_accounts
    WHERE id = $1
    `,
    [account.id],
  );

  return {
    id: result.rows[0].id,
    baselineAt: result.rows[0].baseline_at || null,
  };
}

export async function setWhatsAppHistorySyncBaseline(waJid: string, baselineAt: Date): Promise<void> {
  const normalizedJid = normalizeChatJid(waJid);
  const account = await upsertWhatsAppAccount({ waJid: normalizedJid });

  await pool.query(
    `
    UPDATE whatsapp_accounts
    SET
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{history_sync_baseline_at}',
        to_jsonb($2::text),
        true
      ),
      updated_at = NOW()
    WHERE id = $1
    `,
    [account.id, baselineAt.toISOString()],
  );
}

export async function listWhatsAppAccounts(): Promise<WhatsAppAccountListItem[]> {
  const result = await pool.query<WhatsAppAccountListItem>(
    `
    SELECT
      id,
      wa_jid,
      phone,
      display_name,
      session_path,
      last_seen_at::text,
      created_at::text,
      updated_at::text
    FROM whatsapp_accounts
    WHERE COALESCE(metadata->>'detached', 'false') <> 'true'
    ORDER BY COALESCE(last_seen_at, updated_at, created_at) DESC, created_at DESC
    `,
  );

  return result.rows;
}


export async function getWhatsAppAccountById(accountId: string): Promise<WhatsAppAccountListItem | null> {
  const normalizedId = String(accountId || "").trim();
  if (!normalizedId) return null;

  const result = await pool.query<WhatsAppAccountListItem>(
    `
    SELECT
      id,
      wa_jid,
      phone,
      display_name,
      session_path,
      last_seen_at::text,
      created_at::text,
      updated_at::text
    FROM whatsapp_accounts
    WHERE id = $1
    LIMIT 1
    `,
    [normalizedId],
  );

  return result.rows[0] || null;
}

export async function getWhatsAppAccountByJid(waJid: string): Promise<WhatsAppAccountListItem | null> {
  const normalizedJid = normalizeChatJid(waJid);
  if (!normalizedJid) return null;

  const result = await pool.query<WhatsAppAccountListItem>(
    `
    SELECT
      id,
      wa_jid,
      phone,
      display_name,
      session_path,
      last_seen_at::text,
      created_at::text,
      updated_at::text
    FROM whatsapp_accounts
    WHERE wa_jid = $1
    LIMIT 1
    `,
    [normalizedJid],
  );

  return result.rows[0] || null;
}

export async function getUserSelectedWhatsAppAccount(userId: string): Promise<UserWhatsAppContext | null> {
  await ensureUserWhatsAppContextSchema();

  const result = await pool.query<UserWhatsAppContext>(
    `
    SELECT user_id, selected_account_id
    FROM app_user_whatsapp_contexts
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

export async function setUserSelectedWhatsAppAccount(userId: string, accountId: string | null): Promise<UserWhatsAppContext> {
  await ensureUserWhatsAppContextSchema();

  if (accountId) {
    const account = await pool.query(`SELECT id FROM whatsapp_accounts WHERE id = $1 LIMIT 1`, [accountId]);
    if (!account.rows.length) {
      throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    }
  }

  const result = await pool.query<UserWhatsAppContext>(
    `
    INSERT INTO app_user_whatsapp_contexts (user_id, selected_account_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE
      SET selected_account_id = EXCLUDED.selected_account_id,
          updated_at = NOW()
    RETURNING user_id, selected_account_id
    `,
    [userId, accountId],
  );

  return result.rows[0];
}

export async function getUserSelectedWhatsAppAccountWithDetails(userId: string): Promise<UserSelectedWhatsAppAccountRow | null> {
  await ensureUserWhatsAppContextSchema();

  const result = await pool.query<UserSelectedWhatsAppAccountRow>(
    `
    SELECT
      ctx.user_id,
      ctx.selected_account_id,
      wa.wa_jid,
      wa.phone,
      wa.display_name,
      wa.session_path
    FROM app_user_whatsapp_contexts ctx
    LEFT JOIN whatsapp_accounts wa ON wa.id = ctx.selected_account_id
    WHERE ctx.user_id = $1
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

function sanitizeSessionSegment(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function buildWhatsAppAccountSessionPath(accountId: string): string {
  const base = path.resolve(env.whatsappSessionPath);
  const segment = sanitizeSessionSegment(accountId) || "default";
  return path.join(base, segment);
}

export async function ensureWhatsAppAccountSessionPath(accountId: string): Promise<string> {
  const account = await getWhatsAppAccountById(accountId);
  if (!account) {
    throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
  }

  const currentPath = String(account.session_path || "").trim();
  if (currentPath) {
    return currentPath;
  }

  const sessionPath = buildWhatsAppAccountSessionPath(account.id);
  await pool.query(
    `
    UPDATE whatsapp_accounts
    SET session_path = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [account.id, sessionPath],
  );

  return sessionPath;
}

export async function createPendingWhatsAppAccount(displayName = "Novo numero"): Promise<WhatsAppAccountListItem> {
  const placeholderId = randomUUID();
  const sessionPath = buildWhatsAppAccountSessionPath(placeholderId);
  const placeholderJid = `pending:${placeholderId}`;
  const placeholderPhone = placeholderId.replace(/-/g, "").slice(0, 30);

  const result = await pool.query<WhatsAppAccountListItem>(
    `
    INSERT INTO whatsapp_accounts (wa_jid, phone, display_name, session_path, metadata)
    VALUES ($1, $2, $3, $4, jsonb_build_object('pending', true))
    RETURNING
      id,
      wa_jid,
      phone,
      display_name,
      session_path,
      last_seen_at::text,
      created_at::text,
      updated_at::text
    `,
    [placeholderJid, placeholderPhone, displayName, sessionPath],
  );

  return result.rows[0];
}

export async function deleteWhatsAppAccount(accountId: string): Promise<WhatsAppAccountListItem | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<WhatsAppAccountListItem>(
      `
      UPDATE whatsapp_accounts
      SET
        session_path = NULL,
        updated_at = NOW(),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{detached}', 'true'::jsonb, true)
      WHERE id = $1
      RETURNING
        id,
        wa_jid,
        phone,
        display_name,
        session_path,
        last_seen_at::text,
        created_at::text,
        updated_at::text
      `,
      [accountId],
    );

    if (result.rows.length > 0) {
      await client.query(
        `
        UPDATE app_user_whatsapp_contexts
        SET
          selected_account_id = NULL,
          updated_at = NOW()
        WHERE selected_account_id = $1
        `,
        [accountId],
      );
    }

    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
