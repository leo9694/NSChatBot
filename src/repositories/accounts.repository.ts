import { pool } from "../db/pool";
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

export async function upsertWhatsAppAccount(input: UpsertWhatsAppAccountInput): Promise<WhatsAppAccountRow> {
  const normalizedJid = normalizeChatJid(input.waJid);
  const phone = jidToPhone(normalizedJid);

  const result = await pool.query<WhatsAppAccountRow>(
    `
    INSERT INTO whatsapp_accounts (wa_jid, phone, display_name, session_path, last_seen_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (wa_jid) DO UPDATE SET
      phone = EXCLUDED.phone,
      display_name = COALESCE(EXCLUDED.display_name, whatsapp_accounts.display_name),
      session_path = COALESCE(EXCLUDED.session_path, whatsapp_accounts.session_path),
      last_seen_at = NOW(),
      updated_at = NOW()
    RETURNING id, wa_jid, phone, display_name
    `,
    [normalizedJid, phone, input.displayName || null, input.sessionPath || null],
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
