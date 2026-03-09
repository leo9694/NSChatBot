import { pool } from "../db/pool";
import { jidToPhone, normalizePhoneForWhats } from "../utils/whatsapp";

interface UpsertConversationInput {
  accountId: string;
  phone?: string;
  waJid: string;
  clientId?: string | null;
  displayName?: string | null;
  appName?: string | null;
  avatarUrl?: string | null;
  lastMessagePreview?: string;
  incrementUnread?: boolean;
}

export interface ConversationRow {
  id: string;
  phone: string;
  wa_jid: string;
}

let ensureConversationWorkflowSchemaPromise: Promise<void> | null = null;

export async function ensureConversationWorkflowSchema(): Promise<void> {
  if (!ensureConversationWorkflowSchemaPromise) {
    ensureConversationWorkflowSchemaPromise = (async () => {
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS service_status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (service_status IN ('pending', 'in_progress', 'finalized'))
      `);

      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL
      `);

      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ
      `);

      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_service_status ON conversations(service_status);
        CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user_id ON conversations(assigned_user_id);
      `);
    })().catch((error) => {
      ensureConversationWorkflowSchemaPromise = null;
      throw error;
    });
  }

  await ensureConversationWorkflowSchemaPromise;
}

export async function upsertConversation(input: UpsertConversationInput): Promise<ConversationRow> {
  await ensureConversationWorkflowSchema();
  const phone = normalizePhoneForWhats(input.phone || jidToPhone(input.waJid));
  const incrementUnread = Boolean(input.incrementUnread);
  const appName = input.appName?.trim() || null;
  const waName = input.displayName?.trim() || null;
  const existingByPhone = await pool.query<ConversationRow>(
    `
    SELECT id, phone, wa_jid
    FROM conversations
    WHERE account_id = $1
      AND (
        phone = $2
        OR regexp_replace(phone, '^55', '') = regexp_replace($2, '^55', '')
      )
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [input.accountId, phone],
  );

  if (existingByPhone.rows.length > 0) {
    const existing = existingByPhone.rows[0];
    const existingJid = existing.wa_jid || input.waJid;

    const updated = await pool.query<ConversationRow>(
      `
      UPDATE conversations
      SET
        phone = $9,
        wa_jid = $2,
        client_id = COALESCE($3, client_id),
        display_name = CASE
          WHEN COALESCE($6::text, metadata->>'app_name') IS NOT NULL
            AND COALESCE($7::text, metadata->>'whatsapp_name') IS NOT NULL
            AND COALESCE($6::text, metadata->>'app_name') <> COALESCE($7::text, metadata->>'whatsapp_name')
            THEN COALESCE($6::text, metadata->>'app_name') || ' (' || COALESCE($7::text, metadata->>'whatsapp_name') || ')'
          WHEN COALESCE($6::text, metadata->>'app_name') IS NOT NULL
            THEN COALESCE($6::text, metadata->>'app_name')
          WHEN COALESCE($7::text, metadata->>'whatsapp_name') IS NOT NULL
            THEN COALESCE($7::text, metadata->>'whatsapp_name')
          ELSE display_name
        END,
        last_message_at = NOW(),
        last_message_preview = $4::text,
        unread_count = CASE WHEN $5 THEN unread_count + 1 ELSE unread_count END,
        service_status = CASE
          WHEN $5 THEN CASE WHEN assigned_user_id IS NULL THEN 'pending' ELSE 'in_progress' END
          ELSE service_status
        END,
        metadata = jsonb_strip_nulls(
          COALESCE(metadata, '{}'::jsonb)
          || CASE WHEN $8::text IS NOT NULL THEN jsonb_build_object('avatar_url', $8::text) ELSE '{}'::jsonb END
          || CASE WHEN $6::text IS NOT NULL THEN jsonb_build_object('app_name', $6::text) ELSE '{}'::jsonb END
          || CASE WHEN $7::text IS NOT NULL THEN jsonb_build_object('whatsapp_name', $7::text) ELSE '{}'::jsonb END
        ),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, phone, wa_jid
      `,
      [
        existing.id,
        existingJid,
        input.clientId || null,
        input.lastMessagePreview || null,
        incrementUnread,
        appName,
        waName,
        input.avatarUrl || null,
        phone,
      ],
    );

    if (updated.rows.length > 0) {
      return updated.rows[0];
    }
  }

  const result = await pool.query<ConversationRow>(
    `
    INSERT INTO conversations (
      account_id, client_id, phone, wa_jid, display_name,
      last_message_at, last_message_preview, unread_count, metadata
    )
    VALUES (
      $1, $2, $3, $4,
      CASE
        WHEN $7::text IS NOT NULL AND $8::text IS NOT NULL AND $7::text <> $8::text
          THEN $7::text || ' (' || $8::text || ')'
        WHEN $7::text IS NOT NULL THEN $7::text
        WHEN $8::text IS NOT NULL THEN $8::text
        ELSE NULL
      END,
      NOW(), $5::text, CASE WHEN $6 THEN 1 ELSE 0 END,
      jsonb_strip_nulls(jsonb_build_object('avatar_url', $9::text, 'app_name', $7::text, 'whatsapp_name', $8::text))
    )
    ON CONFLICT (account_id, wa_jid) DO UPDATE SET
      phone = EXCLUDED.phone,
      client_id = COALESCE(EXCLUDED.client_id, conversations.client_id),
      display_name = CASE
        WHEN COALESCE($7::text, conversations.metadata->>'app_name') IS NOT NULL
          AND COALESCE($8::text, conversations.metadata->>'whatsapp_name') IS NOT NULL
          AND COALESCE($7::text, conversations.metadata->>'app_name') <> COALESCE($8::text, conversations.metadata->>'whatsapp_name')
          THEN COALESCE($7::text, conversations.metadata->>'app_name') || ' (' || COALESCE($8::text, conversations.metadata->>'whatsapp_name') || ')'
        WHEN COALESCE($7::text, conversations.metadata->>'app_name') IS NOT NULL
          THEN COALESCE($7::text, conversations.metadata->>'app_name')
        WHEN COALESCE($8::text, conversations.metadata->>'whatsapp_name') IS NOT NULL
          THEN COALESCE($8::text, conversations.metadata->>'whatsapp_name')
        ELSE COALESCE(EXCLUDED.display_name, conversations.display_name)
      END,
      last_message_at = NOW(),
      last_message_preview = EXCLUDED.last_message_preview,
      unread_count = CASE WHEN $6 THEN conversations.unread_count + 1 ELSE conversations.unread_count END,
      service_status = CASE
        WHEN $6 THEN CASE WHEN conversations.assigned_user_id IS NULL THEN 'pending' ELSE 'in_progress' END
        ELSE conversations.service_status
      END,
      metadata = jsonb_strip_nulls(
        COALESCE(conversations.metadata, '{}'::jsonb)
        || CASE WHEN $9::text IS NOT NULL THEN jsonb_build_object('avatar_url', $9::text) ELSE '{}'::jsonb END
        || CASE WHEN $7::text IS NOT NULL THEN jsonb_build_object('app_name', $7::text) ELSE '{}'::jsonb END
        || CASE WHEN $8::text IS NOT NULL THEN jsonb_build_object('whatsapp_name', $8::text) ELSE '{}'::jsonb END
      ),
      updated_at = NOW()
    RETURNING id, phone, wa_jid
    `,
    [
      input.accountId,
      input.clientId || null,
      phone,
      input.waJid,
      input.lastMessagePreview || null,
      incrementUnread,
      appName,
      waName,
      input.avatarUrl || null,
    ],
  );

  if (result.rows.length === 0) {
    throw new Error("Failed to upsert conversation.");
  }

  return result.rows[0];
}

export async function resetConversationUnread(conversationId: string): Promise<void> {
  await ensureConversationWorkflowSchema();
  await pool.query(
    `UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
    [conversationId],
  );
}

export async function updateConversationAvatar(conversationId: string, avatarUrl: string): Promise<void> {
  await ensureConversationWorkflowSchema();
  await pool.query(
    `
    UPDATE conversations
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{avatar_url}', to_jsonb($2::text), true),
        updated_at = NOW()
    WHERE id = $1
    `,
    [conversationId, avatarUrl],
  );
}

export async function clearConversationBulkInitiated(conversationId: string): Promise<void> {
  await ensureConversationWorkflowSchema();
  await pool.query(
    `
    UPDATE conversations
    SET
      metadata = CASE
        WHEN metadata IS NULL THEN '{}'::jsonb
        ELSE metadata - 'bulk_initiated'
      END,
      updated_at = NOW()
    WHERE id = $1
    `,
    [conversationId],
  );
}

export async function claimConversation(conversationId: string, userId: string): Promise<boolean> {
  await ensureConversationWorkflowSchema();
  const result = await pool.query(
    `
    UPDATE conversations
    SET
      service_status = 'in_progress',
      assigned_user_id = $2,
      assigned_at = NOW(),
      finalized_at = NULL,
      metadata = CASE
        WHEN metadata IS NULL THEN '{}'::jsonb
        ELSE metadata - 'bulk_initiated' - 'bulk_replied' - 'bulk_started_at' - 'bulk_replied_at'
      END,
      updated_at = NOW()
    WHERE id = $1
      AND (
        assigned_user_id IS NULL
        OR assigned_user_id = $2
        OR service_status IN ('pending', 'finalized')
      )
    `,
    [conversationId, userId],
  );

  return (result.rowCount || 0) > 0;
}

export async function finalizeConversation(conversationId: string, userId: string): Promise<boolean> {
  await ensureConversationWorkflowSchema();
  const result = await pool.query(
    `
    UPDATE conversations
    SET
      service_status = 'finalized',
      assigned_user_id = NULL,
      finalized_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
      AND (assigned_user_id IS NULL OR assigned_user_id = $2)
    `,
    [conversationId, userId],
  );

  return (result.rowCount || 0) > 0;
}

export async function getConversationAccess(conversationId: string): Promise<{
  id: string;
  service_status: "pending" | "in_progress" | "finalized";
  assigned_user_id: string | null;
} | null> {
  await ensureConversationWorkflowSchema();
  const result = await pool.query<{
    id: string;
    service_status: "pending" | "in_progress" | "finalized";
    assigned_user_id: string | null;
  }>(
    `
    SELECT id, service_status, assigned_user_id
    FROM conversations
    WHERE id = $1
    LIMIT 1
    `,
    [conversationId],
  );

  return result.rows[0] || null;
}

export async function transferConversationToUser(conversationId: string, targetUserId: string): Promise<boolean> {
  await ensureConversationWorkflowSchema();
  const result = await pool.query(
    `
    UPDATE conversations
    SET
      service_status = 'in_progress',
      assigned_user_id = $2,
      assigned_at = NOW(),
      finalized_at = NULL,
      metadata = CASE
        WHEN metadata IS NULL THEN '{}'::jsonb
        ELSE metadata - 'bulk_initiated' - 'bulk_replied' - 'bulk_started_at' - 'bulk_replied_at'
      END,
      updated_at = NOW()
    WHERE id = $1
    `,
    [conversationId, targetUserId],
  );

  return (result.rowCount || 0) > 0;
}
