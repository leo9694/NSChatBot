import { pool } from "../db/pool";
import { phoneToJid } from "../utils/whatsapp";
import { upsertWhatsAppAccount } from "./accounts.repository";
import { upsertConversation } from "./conversations.repository";
import { publishMessageSaved, publishMessageStatus } from "../services/realtime.service";

interface SaveOutboundMessageInput {
  accountJid: string;
  accountDisplayName?: string | null;
  clientId?: string | null;
  campaignId?: string | null;
  phone: string;
  avatarUrl?: string | null;
  body: string;
  messageType?: string;
  externalMessageId?: string | null;
  status?: string;
  payload?: unknown;
  sentAt?: Date | null;
  metadata?: Record<string, unknown>;
  isBulkDispatch?: boolean;
}

interface SaveInboundMessageInput {
  accountJid: string;
  accountDisplayName?: string | null;
  waJid: string;
  avatarUrl?: string | null;
  body: string;
  messageType?: string;
  externalMessageId?: string | null;
  payload?: unknown;
  sentAt?: Date | null;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
}

interface UpdateOutboundMessageStatusInput {
  accountJid: string;
  externalMessageId: string;
  waJid?: string | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  status?: string | null;
}

let ensureMessagesSchemaPromise: Promise<void> | null = null;

interface RealtimeMessageRow {
  id: string;
  conversation_id: string;
  direction: string;
  from_me: boolean;
  message_type: string;
  body: string;
  status: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: Date | null;
  delivered_at?: Date | null;
  read_at?: Date | null;
  failed_at?: Date | null;
  created_at: Date;
  updated_at?: Date;
}

function compactMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata || {}).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
}

function toRealtimeMessage(row: RealtimeMessageRow): Record<string, unknown> {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    from_me: row.from_me,
    message_type: row.message_type,
    body: row.body,
    status: row.status,
    metadata: row.metadata || {},
    sent_at: row.sent_at ? row.sent_at.toISOString() : null,
    delivered_at: row.delivered_at ? row.delivered_at.toISOString() : null,
    read_at: row.read_at ? row.read_at.toISOString() : null,
    failed_at: row.failed_at ? row.failed_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : row.created_at.toISOString(),
  };
}

async function ensureMessagesSchema(): Promise<void> {
  if (!ensureMessagesSchemaPromise) {
    ensureMessagesSchemaPromise = (async () => {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_account_external_message_id
        ON messages(account_id, external_message_id)
        WHERE external_message_id IS NOT NULL
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_created_desc
        ON messages (conversation_id, COALESCE(sent_at, created_at) DESC, created_at DESC)
        WHERE message_type <> 'protocolMessage'
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_from_me_sent_created
        ON messages (conversation_id, from_me, COALESCE(sent_at, created_at) DESC, created_at DESC)
        WHERE message_type <> 'protocolMessage'
      `);
      await pool.query(`DROP INDEX IF EXISTS uq_messages_external_message_id`);
    })().catch((error) => {
      ensureMessagesSchemaPromise = null;
      throw error;
    });
  }

  await ensureMessagesSchemaPromise;
}

export async function saveOutboundMessage(input: SaveOutboundMessageInput): Promise<void> {
  await ensureMessagesSchema();
  const cleanMetadata = compactMetadata(input.metadata);
  const account = await upsertWhatsAppAccount({
    waJid: input.accountJid,
    displayName: input.accountDisplayName || null,
  });

  const markConversationBulkInitiated = async (conversationId: string): Promise<void> => {
    if (!input.isBulkDispatch) return;
    await pool.query(
      `
      UPDATE conversations
      SET
        metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{bulk_initiated}', 'true'::jsonb, true),
          '{bulk_started_at}',
          to_jsonb(NOW()),
          true
        ) - 'bulk_replied' - 'bulk_replied_at',
        updated_at = NOW()
      WHERE id = $1
      `,
      [conversationId],
    );
  };

  if (input.externalMessageId) {
    const existingByExternalId = await pool.query<RealtimeMessageRow>(
      `
      SELECT
        id, conversation_id, direction, from_me, message_type, body, status,
        metadata, sent_at, delivered_at, read_at, failed_at, created_at, updated_at
      FROM messages
      WHERE account_id = $1
        AND external_message_id = $2
      LIMIT 1
      `,
      [account.id, input.externalMessageId],
    );

    if (existingByExternalId.rows.length > 0) {
      await markConversationBulkInitiated(existingByExternalId.rows[0].conversation_id);
      await pool.query(
        `
        UPDATE messages
        SET
          message_type = COALESCE($3::text, message_type),
          body = CASE
            WHEN COALESCE($4::text, '') <> '' THEN $4::text
            ELSE body
          END,
          status = COALESCE($5::text, status),
          provider_payload = CASE
            WHEN $6::jsonb = '{}'::jsonb THEN provider_payload
            ELSE COALESCE(provider_payload, '{}'::jsonb) || $6::jsonb
          END,
          metadata = CASE
            WHEN $7::jsonb = '{}'::jsonb THEN metadata
            ELSE COALESCE(metadata, '{}'::jsonb) || $7::jsonb
          END,
          sent_at = COALESCE($8::timestamptz, sent_at),
          updated_at = NOW()
        WHERE id = $1
          AND conversation_id = $2
        `,
        [
          existingByExternalId.rows[0].id,
          existingByExternalId.rows[0].conversation_id,
          input.messageType || null,
          input.body || null,
          input.status || null,
          JSON.stringify(input.payload || {}),
          JSON.stringify(cleanMetadata),
          input.sentAt || null,
        ],
      );
      return;
    }
  }

  const waJid = phoneToJid(input.phone);
  const conversation = await upsertConversation({
    accountId: account.id,
    phone: input.phone,
    waJid,
    clientId: input.clientId,
    avatarUrl: input.avatarUrl || null,
    lastMessagePreview: input.body,
    incrementUnread: false,
  });

  await markConversationBulkInitiated(conversation.id);

  if (!input.externalMessageId && input.sentAt) {
    const existing = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM messages
      WHERE account_id = $1
        AND from_me = true
        AND wa_jid = $2
        AND body = $3
        AND sent_at = $4
      LIMIT 1
      `,
      [account.id, waJid, input.body, input.sentAt],
    );

    if (existing.rows.length > 0) {
      return;
    }
  }

  const inserted = await pool.query<RealtimeMessageRow>(
    `
    INSERT INTO messages (
      account_id, conversation_id, client_id, campaign_id, phone, wa_jid,
      direction, from_me, message_type, body, status,
      provider, external_message_id, provider_payload, metadata, sent_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      'outbound', true, $7, $8, $9,
      'whatsapp_baileys', $10, $11::jsonb, $12::jsonb, $13
    )
    ON CONFLICT (account_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
    RETURNING
      id, conversation_id, direction, from_me, message_type, body, status,
      metadata, sent_at, delivered_at, read_at, failed_at, created_at, updated_at
    `,
    [
      account.id,
      conversation.id,
      input.clientId || null,
      input.campaignId || null,
      conversation.phone,
      waJid,
      input.messageType || "text",
      input.body,
      input.status || "sent",
      input.externalMessageId || null,
      JSON.stringify(input.payload || {}),
      JSON.stringify(cleanMetadata),
      input.sentAt || new Date(),
    ],
  );

  if (inserted.rows.length > 0) {
    const inboundAt = input.sentAt || new Date();
    // If this conversation came from bulk dispatch, mark that customer has replied.
    await pool.query(
      `
      UPDATE conversations
      SET
        metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{bulk_replied}', 'true'::jsonb, true),
          '{bulk_replied_at}',
          to_jsonb($2::timestamptz),
          true
        ),
        service_status = CASE
          WHEN assigned_user_id IS NULL THEN 'pending'
          ELSE service_status
        END,
        finalized_at = CASE
          WHEN assigned_user_id IS NULL THEN NULL
          ELSE finalized_at
        END,
        updated_at = NOW()
      WHERE id = $1
        AND COALESCE(metadata->>'bulk_initiated', 'false') = 'true'
        AND NULLIF(metadata->>'bulk_started_at', '') IS NOT NULL
        AND $2::timestamptz >= (metadata->>'bulk_started_at')::timestamptz
      `,
      [conversation.id, inboundAt],
    );
    publishMessageSaved({
      accountJid: input.accountJid,
      conversationId: conversation.id,
      messageId: inserted.rows[0].id,
      direction: "outbound",
      createdAt: inserted.rows[0].created_at.toISOString(),
      message: toRealtimeMessage(inserted.rows[0]),
    });
  }
}

export async function saveInboundMessage(input: SaveInboundMessageInput): Promise<{ inserted: boolean; conversationId: string | null }> {
  await ensureMessagesSchema();
  const cleanMetadata = compactMetadata(input.metadata);
  const account = await upsertWhatsAppAccount({
    waJid: input.accountJid,
    displayName: input.accountDisplayName || null,
  });

  if (input.externalMessageId) {
    const existingByExternalId = await pool.query<RealtimeMessageRow>(
      `
      SELECT
        id, conversation_id, direction, from_me, message_type, body, status,
        metadata, sent_at, delivered_at, read_at, failed_at, created_at, updated_at
      FROM messages
      WHERE account_id = $1
        AND external_message_id = $2
      LIMIT 1
      `,
      [account.id, input.externalMessageId],
    );

    if (existingByExternalId.rows.length > 0) {
      await pool.query(
        `
        UPDATE messages
        SET
          message_type = COALESCE($3::text, message_type),
          body = CASE
            WHEN COALESCE($4::text, '') <> '' THEN $4::text
            ELSE body
          END,
          provider_payload = CASE
            WHEN $5::jsonb = '{}'::jsonb THEN provider_payload
            ELSE COALESCE(provider_payload, '{}'::jsonb) || $5::jsonb
          END,
          metadata = CASE
            WHEN $6::jsonb = '{}'::jsonb THEN metadata
            ELSE COALESCE(metadata, '{}'::jsonb) || $6::jsonb
          END,
          sent_at = COALESCE($7::timestamptz, sent_at),
          updated_at = NOW()
        WHERE id = $1
          AND conversation_id = $2
        `,
        [
          existingByExternalId.rows[0].id,
          existingByExternalId.rows[0].conversation_id,
          input.messageType || null,
          input.body || null,
          JSON.stringify(input.payload || {}),
          JSON.stringify(cleanMetadata),
          input.sentAt || null,
        ],
      );
      publishMessageSaved({
        accountJid: input.accountJid,
        conversationId: existingByExternalId.rows[0].conversation_id,
        messageId: existingByExternalId.rows[0].id,
        direction: "inbound",
        createdAt: existingByExternalId.rows[0].created_at.toISOString(),
        message: toRealtimeMessage(existingByExternalId.rows[0]),
      });
      return { inserted: false, conversationId: existingByExternalId.rows[0].conversation_id };
    }
  }

  const conversation = await upsertConversation({
    accountId: account.id,
    waJid: input.waJid,
    displayName: input.displayName || null,
    avatarUrl: input.avatarUrl || null,
    lastMessagePreview: input.body,
    incrementUnread: true,
  });

  if (!input.externalMessageId && input.sentAt) {
    const existing = await pool.query<RealtimeMessageRow>(
      `
      SELECT
        id, conversation_id, direction, from_me, message_type, body, status,
        metadata, sent_at, delivered_at, read_at, failed_at, created_at, updated_at
      FROM messages
      WHERE account_id = $1
        AND from_me = false
        AND wa_jid = $2
        AND body = $3
        AND sent_at = $4
      LIMIT 1
      `,
      [account.id, input.waJid, input.body, input.sentAt],
    );

    if (existing.rows.length > 0) {
      publishMessageSaved({
        accountJid: input.accountJid,
        conversationId: existing.rows[0].conversation_id,
        messageId: existing.rows[0].id,
        direction: "inbound",
        createdAt: existing.rows[0].created_at.toISOString(),
        message: toRealtimeMessage(existing.rows[0]),
      });
      return { inserted: false, conversationId: existing.rows[0].conversation_id };
    }
  }

  const inserted = await pool.query<RealtimeMessageRow>(
    `
    INSERT INTO messages (
      account_id, conversation_id, phone, wa_jid, direction, from_me,
      message_type, body, status, provider, external_message_id,
      provider_payload, metadata, sent_at
    )
    VALUES (
      $1, $2, $3, $4, 'inbound', false,
      $5, $6, 'received', 'whatsapp_baileys', $7,
      $8::jsonb, $9::jsonb, $10
    )
    ON CONFLICT (account_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
    RETURNING
      id, conversation_id, direction, from_me, message_type, body, status,
      metadata, sent_at, delivered_at, read_at, failed_at, created_at, updated_at
    `,
    [
      account.id,
      conversation.id,
      conversation.phone,
      conversation.wa_jid,
      input.messageType || "text",
      input.body,
      input.externalMessageId || null,
      JSON.stringify(input.payload || {}),
      JSON.stringify(cleanMetadata),
      input.sentAt || new Date(),
    ],
  );

  if (inserted.rows.length > 0) {
    publishMessageSaved({
      accountJid: input.accountJid,
      conversationId: conversation.id,
      messageId: inserted.rows[0].id,
      direction: "inbound",
      createdAt: inserted.rows[0].created_at.toISOString(),
      message: toRealtimeMessage(inserted.rows[0]),
    });
    return { inserted: true, conversationId: conversation.id };
  }

  return { inserted: false, conversationId: conversation.id };
}

export async function updateOutboundMessageStatus(input: UpdateOutboundMessageStatusInput): Promise<void> {
  let result = await pool.query<{ id: string; conversation_id: string; created_at: Date }>(
    `
    UPDATE messages
    SET
      delivered_at = COALESCE($3::timestamptz, delivered_at),
      read_at = COALESCE($4::timestamptz, read_at),
      status = COALESCE($5::text, status),
      updated_at = NOW()
    WHERE external_message_id = $1
      AND from_me = true
      AND account_id = (
        SELECT id
        FROM whatsapp_accounts
        WHERE wa_jid = $2
        LIMIT 1
      )
    RETURNING id, conversation_id, created_at
    `,
    [
      input.externalMessageId,
      input.accountJid,
      input.deliveredAt || null,
      input.readAt || null,
      input.status || null,
    ],
  );

  // Fallback: some provider events may miss/mismatch external id after reconnect.
  if (result.rows.length === 0 && input.waJid) {
    result = await pool.query<{ id: string; conversation_id: string; created_at: Date }>(
      `
      WITH candidate AS (
        SELECT id
        FROM messages
        WHERE from_me = true
          AND account_id = (
            SELECT id
            FROM whatsapp_accounts
            WHERE wa_jid = $1
            LIMIT 1
          )
          AND wa_jid = $2
          AND created_at >= NOW() - INTERVAL '2 days'
        ORDER BY created_at DESC
        LIMIT 1
      )
      UPDATE messages m
      SET
        delivered_at = COALESCE($3::timestamptz, m.delivered_at),
        read_at = COALESCE($4::timestamptz, m.read_at),
        status = COALESCE($5::text, m.status),
        updated_at = NOW()
      FROM candidate c
      WHERE m.id = c.id
      RETURNING m.id, m.conversation_id, m.created_at
      `,
      [
        input.accountJid,
        input.waJid,
        input.deliveredAt || null,
        input.readAt || null,
        input.status || null,
      ],
    );
  }

  if (result.rows.length > 0) {
    publishMessageStatus({
      accountJid: input.accountJid,
      conversationId: result.rows[0].conversation_id,
      messageId: result.rows[0].id,
      direction: "outbound",
      createdAt: result.rows[0].created_at.toISOString(),
    });
  }
}
