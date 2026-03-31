import { Request, Router } from "express";
import { pool } from "../db/pool";
import { upsertWhatsAppAccount } from "../repositories/accounts.repository";
import {
  claimConversation,
  ensureConversationWorkflowSchema,
  finalizeConversation,
  getConversationAccess,
  resetConversationUnread,
  transferConversationToUser,
  updateConversationAiEnabled,
  updateConversationAvatar,
  upsertConversation,
} from "../repositories/conversations.repository";
import { saveOutboundMessage } from "../repositories/messages.repository";
import { requireActiveWhatsAppAccount, WhatsAppAccountContextError } from "../services/whatsapp-account-context.service";
import { handleInboundAiAutomation } from "../services/ai-agent.service";
import { getProfilePictureUrl, sendWhatsAppText, subscribeWhatsAppPresence } from "../services/whatsapp.service";
import { normalizePhone, phoneToJid } from "../utils/whatsapp";

const router = Router();
type AuthRequest = Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "ceo" | "administrador" | "operador";
    company_id?: string | null;
    sector_id?: string | null;
    sector_name?: string | null;
  };
};
router.use((_, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

router.use(async (_req, _res, next) => {
  try {
    await ensureConversationWorkflowSchema();
    next();
  } catch (error) {
    next(error);
  }
});

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
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

function buildSignedTextMessage(message: string, attendantName: string): string {
  const cleanMessage = String(message || "").trim();
  const cleanName = String(attendantName || "").trim() || "Atendente";
  if (!cleanMessage) return cleanMessage;
  if (/^\[[^\]]+\]\s*\n/.test(cleanMessage) || /^\*[^*]+\*:\s*\n/.test(cleanMessage)) {
    return cleanMessage;
  }
  return `*${cleanName}*:\n${cleanMessage}`;
}

async function conversationBelongsToCompany(conversationId: string, companyId?: string | null) {
  const result = await pool.query<{ id: string }>(
    `
    SELECT c.id
    FROM conversations c
    JOIN whatsapp_accounts wa ON wa.id = c.account_id
    WHERE c.id = $1
      AND ($2::uuid IS NULL OR wa.company_id = $2)
    LIMIT 1
    `,
    [conversationId, companyId || null],
  );
  return result.rows.length > 0;
}

router.get("/", async (req, res) => {
  const authReq = req as AuthRequest;
  const search = (req.query.search as string | undefined)?.trim() || "";
  const accountJid = (req.query.account_jid as string | undefined)?.trim() || "";
  const serviceStatus = (req.query.service_status as string | undefined)?.trim() || "";
  const bulkOnly = String(req.query.bulk_only || "false") === "true";
  const limit = Math.min(parsePositiveInt(req.query.limit, 30), 100);
  const offset = Math.max(parsePositiveInt(req.query.offset, 0), 0);

  const hasSearch = search.length > 0;

  const query = `
    SELECT
      c.id,
      c.account_id,
      c.client_id,
      c.phone,
      c.wa_jid,
      c.display_name,
      c.service_status,
      c.assigned_user_id,
      c.assigned_at,
      c.finalized_at,
      au.name AS assigned_user_name,
      COALESCE(c.metadata->>'avatar_url', '') AS avatar_url,
      COALESCE(last_msg.sent_at, last_msg.created_at, c.last_message_at, c.updated_at) AS last_message_at,
      COALESCE(last_msg.body, c.last_message_preview) AS last_message_preview,
      (COALESCE(c.metadata->>'bulk_initiated', 'false') = 'true') AS bulk_initiated,
      EXISTS(
        SELECT 1
        FROM messages bm
        WHERE bm.conversation_id = c.id
          AND bm.from_me = false
          AND NULLIF(c.metadata->>'bulk_started_at', '') IS NOT NULL
          AND COALESCE(bm.sent_at, bm.created_at) >= (c.metadata->>'bulk_started_at')::timestamptz
      ) AS bulk_has_reply,
      COALESCE((c.metadata->>'ai_agent_enabled')::boolean, false) AS ai_agent_enabled,
      COALESCE((c.metadata->>'ai_transfer_pending')::boolean, false) AS ai_transfer_pending,
      COALESCE(c.metadata->>'ai_transfer_reason', '') AS ai_transfer_reason,
      c.unread_count,
      c.created_at,
      c.updated_at,
      wa.wa_jid AS account_wa_jid,
      wa.phone AS account_phone,
      COALESCE(msg_stats.total_messages, 0) AS total_messages
    FROM conversations c
    LEFT JOIN whatsapp_accounts wa ON wa.id = c.account_id
    LEFT JOIN app_users au ON au.id = c.assigned_user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total_messages
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.message_type <> 'protocolMessage'
    ) msg_stats ON true
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at, m.sent_at
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.message_type <> 'protocolMessage'
      ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.created_at DESC
      LIMIT 1
    ) last_msg ON true
    WHERE ($1::text = '' OR c.phone ILIKE $2 OR COALESCE(c.display_name, '') ILIKE $2)
      AND ($5::text = '' OR wa.wa_jid = $5)
      AND ($6::text = '' OR c.service_status = $6)
      AND ($8::uuid IS NULL OR wa.company_id = $8)
      AND (
        (
          $7::boolean = true
          AND COALESCE(c.metadata->>'bulk_initiated', 'false') = 'true'
          AND NOT EXISTS(
            SELECT 1
            FROM messages bm
            WHERE bm.conversation_id = c.id
              AND bm.from_me = false
              AND NULLIF(c.metadata->>'bulk_started_at', '') IS NOT NULL
              AND COALESCE(bm.sent_at, bm.created_at) >= (c.metadata->>'bulk_started_at')::timestamptz
          )
        )
        OR (
          $7::boolean = false
          AND (
            COALESCE(c.metadata->>'bulk_initiated', 'false') <> 'true'
            OR EXISTS(
              SELECT 1
              FROM messages bm
              WHERE bm.conversation_id = c.id
                AND bm.from_me = false
                AND NULLIF(c.metadata->>'bulk_started_at', '') IS NOT NULL
                AND COALESCE(bm.sent_at, bm.created_at) >= (c.metadata->>'bulk_started_at')::timestamptz
            )
          )
        )
      )
      AND (
        COALESCE(msg_stats.total_messages, 0) > 0
        OR c.client_id IS NOT NULL
        OR COALESCE(c.metadata->>'app_name', '') <> ''
      )
    ORDER BY COALESCE(last_msg.sent_at, last_msg.created_at, c.last_message_at, c.updated_at) DESC NULLS LAST, c.created_at DESC
    LIMIT $3 OFFSET $4
  `;

  const result = await pool.query(query, [
    search,
    `%${search}%`,
    limit,
    offset,
    accountJid,
    serviceStatus,
    bulkOnly,
    authReq.authUser?.company_id || null,
  ]);
  return res.status(200).json({
    items: result.rows,
    pagination: { limit, offset, hasSearch },
  });
});

router.get("/open-for-bulk", async (req, res) => {
  const authReq = req as AuthRequest;
  const limit = Math.min(parsePositiveInt(req.query.limit, 200), 500);

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.phone,
      c.display_name,
      c.service_status,
      COALESCE(last_msg.sent_at, last_msg.created_at, c.last_message_at, c.updated_at) AS last_message_at
    FROM conversations c
    LEFT JOIN whatsapp_accounts wa ON wa.id = c.account_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at, m.sent_at
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.message_type <> 'protocolMessage'
      ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.created_at DESC
      LIMIT 1
    ) last_msg ON true
    WHERE ($1::uuid IS NULL OR wa.company_id = $1)
      AND COALESCE(c.phone, '') <> ''
    ORDER BY COALESCE(last_msg.sent_at, last_msg.created_at, c.last_message_at, c.updated_at) DESC NULLS LAST, c.created_at DESC
    LIMIT $2
    `,
    [authReq.authUser?.company_id || null, limit],
  );

  return res.status(200).json({ items: result.rows });
});

router.get("/summary", async (req, res) => {
  const authReq = req as AuthRequest;
  const accountJid = (req.query.account_jid as string | undefined)?.trim() || "";
  const query = `
    WITH base AS (
      SELECT
        c.id,
        c.service_status,
        COALESCE(c.metadata->>'bulk_initiated', 'false') AS bulk_initiated,
        EXISTS(
          SELECT 1
          FROM messages bm
          WHERE bm.conversation_id = c.id
            AND bm.from_me = false
            AND NULLIF(c.metadata->>'bulk_started_at', '') IS NOT NULL
            AND COALESCE(bm.sent_at, bm.created_at) >= (c.metadata->>'bulk_started_at')::timestamptz
        ) AS bulk_has_reply
      FROM conversations c
      LEFT JOIN whatsapp_accounts wa ON wa.id = c.account_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS total_messages
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.message_type <> 'protocolMessage'
      ) msg_stats ON true
      WHERE ($1::text = '' OR wa.wa_jid = $1)
        AND ($2::uuid IS NULL OR wa.company_id = $2)
        AND (
          COALESCE(msg_stats.total_messages, 0) > 0
          OR c.client_id IS NOT NULL
          OR COALESCE(c.metadata->>'app_name', '') <> ''
        )
    )
    SELECT
      COUNT(*) FILTER (
        WHERE service_status = 'pending'
          AND (bulk_initiated <> 'true' OR bulk_has_reply = true)
      )::int AS pending_count,
      COUNT(*) FILTER (
        WHERE service_status = 'in_progress'
          AND (bulk_initiated <> 'true' OR bulk_has_reply = true)
      )::int AS in_progress_count,
      COUNT(*) FILTER (
        WHERE service_status = 'finalized'
          AND (bulk_initiated <> 'true' OR bulk_has_reply = true)
      )::int AS finalized_count,
      COUNT(*) FILTER (
        WHERE bulk_initiated = 'true'
          AND bulk_has_reply <> true
      )::int AS bulk_count
    FROM base
  `;

  const result = await pool.query<{
    pending_count: number;
    in_progress_count: number;
    finalized_count: number;
    bulk_count: number;
  }>(query, [accountJid, authReq.authUser?.company_id || null]);

  const row = result.rows[0] || { pending_count: 0, in_progress_count: 0, finalized_count: 0, bulk_count: 0 };
  return res.status(200).json({
    pending_count: Number(row.pending_count || 0),
    in_progress_count: Number(row.in_progress_count || 0),
    finalized_count: Number(row.finalized_count || 0),
    bulk_count: Number(row.bulk_count || 0),
  });
});

router.post("/finalize-pending-all", async (req, res) => {
  const authReq = req as AuthRequest;
  const role = String(authReq.authUser?.role || "");
  if (role !== "administrador") {
    return res.status(403).json({ error: "Somente administrador pode executar esta acao." });
  }

  const accountJid = String(req.body?.account_jid || req.query.account_jid || "").trim();

  const result = await pool.query(
    `
    UPDATE conversations c
    SET
      service_status = 'finalized',
      assigned_user_id = NULL,
      finalized_at = NOW(),
      updated_at = NOW()
    FROM whatsapp_accounts wa
    WHERE wa.id = c.account_id
      AND c.service_status = 'pending'
      AND ($1::text = '' OR wa.wa_jid = $1)
      AND ($2::uuid IS NULL OR wa.company_id = $2)
    `,
    [accountJid, authReq.authUser?.company_id || null],
  );

  return res.status(200).json({
    status: "ok",
    finalized_count: Number(result.rowCount || 0),
  });
});

router.get("/:conversationId/messages", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }
  const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
  const before = req.query.before as string | undefined;

  const values: any[] = [conversationId, limit];
  let beforeClause = "";

  if (before) {
    values.push(before);
    beforeClause = `AND COALESCE(m.sent_at, m.created_at) < $3::timestamptz`;
  }

  const query = `
    SELECT
      m.id,
      m.conversation_id,
      m.client_id,
      m.campaign_id,
      m.phone,
      m.wa_jid,
      m.direction,
      m.from_me,
      m.message_type,
      m.body,
      m.status,
      m.external_message_id,
      m.metadata,
      m.sent_at,
      m.delivered_at,
      m.read_at,
      m.failed_at,
      m.created_at,
      m.updated_at
    FROM messages m
    WHERE m.conversation_id = $1
      AND m.message_type <> 'protocolMessage'
      ${beforeClause}
    ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.created_at DESC
    LIMIT $2
  `;

  const result = await pool.query(query, values);

  const presenceTarget = await pool
    .query<{ chat_jid: string | null; account_jid: string | null }>(
      `
      SELECT
        c.wa_jid AS chat_jid,
        wa.wa_jid AS account_jid
      FROM conversations c
      JOIN whatsapp_accounts wa ON wa.id = c.account_id
      WHERE c.id = $1
      LIMIT 1
      `,
      [conversationId],
    )
    .then((response) => response.rows[0] || null)
    .catch(() => null);

  if (presenceTarget?.chat_jid && presenceTarget?.account_jid) {
    void subscribeWhatsAppPresence({
      chatJid: presenceTarget.chat_jid,
      accountJid: presenceTarget.account_jid,
    }).catch(() => undefined);
  }

  return res.status(200).json({
    items: result.rows.reverse(),
    pagination: { limit, before: before || null },
  });
});

router.patch("/:conversationId/read", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }
  await resetConversationUnread(conversationId);

  return res.status(200).json({
    status: "ok",
    conversation_id: conversationId,
    unread_count: 0,
  });
});

router.patch("/:conversationId/ai-agent", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }
  const enabled = Boolean(req.body?.enabled);
  const ok = await updateConversationAiEnabled(conversationId, enabled);
  if (!ok) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }

  let automationResult: { ok: boolean; replied: boolean; reason?: string } | null = null;
  if (enabled) {
    automationResult = await handleInboundAiAutomation(conversationId);
  }

  return res.status(200).json({
    status: "ok",
    conversation_id: conversationId,
    ai_agent_enabled: enabled,
    automation: automationResult,
  });
});

router.patch("/:conversationId/claim", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  const userId = String(authReq.authUser?.id || "").trim();
  if (!userId) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }

  const ok = await claimConversation(conversationId, userId);
  if (!ok) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }

  return res.status(200).json({ status: "ok", conversation_id: conversationId });
});

router.patch("/:conversationId/finalize", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  const userId = String(authReq.authUser?.id || "").trim();
  if (!userId) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }

  const access = await getConversationAccess(conversationId);
  if (!access) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }
  if (access.assigned_user_id && access.assigned_user_id !== userId) {
    return res.status(403).json({ error: "Somente o atendente atual pode finalizar esta conversa." });
  }

  const ok = await finalizeConversation(conversationId, userId);
  if (!ok) {
    return res.status(400).json({ error: "Nao foi possivel finalizar a conversa." });
  }

  return res.status(200).json({ status: "ok", conversation_id: conversationId });
});

router.patch("/:conversationId/transfer", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  const userId = String(authReq.authUser?.id || "").trim();
  const userRole = String(authReq.authUser?.role || "");
  const targetUserId = String(req.body?.target_user_id || "").trim();

  if (!userId) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!targetUserId) {
    return res.status(400).json({ error: "Informe o atendente de destino." });
  }
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }

  const access = await getConversationAccess(conversationId);
  if (!access) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }

  const canTransfer =
    userRole === "administrador" ||
    access.assigned_user_id === userId ||
    access.service_status === "pending" ||
    access.service_status === "finalized";
  if (!canTransfer) {
    return res.status(403).json({ error: "Voce nao pode transferir este atendimento." });
  }

  const targetResult = await pool.query(
    `
    SELECT id
    FROM app_users
    WHERE id = $1
      AND is_active = true
      AND ($2::uuid IS NULL OR company_id = $2)
    LIMIT 1
    `,
    [targetUserId, authReq.authUser?.company_id || null],
  );
  if (!targetResult.rows.length) {
    return res.status(400).json({ error: "Atendente de destino invalido." });
  }

  const ok = await transferConversationToUser(conversationId, targetUserId);
  if (!ok) {
    return res.status(400).json({ error: "Nao foi possivel transferir o atendimento." });
  }

  return res.status(200).json({ status: "ok", conversation_id: conversationId });
});

router.delete("/:conversationId", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }
  const deleteContact = String(req.query.delete_contact || "true") === "true";

  try {
    await pool.query("BEGIN");

    const convResult = await pool.query(
      `
      SELECT id, client_id
      FROM conversations
      WHERE id = $1
      `,
      [conversationId],
    );

    if (convResult.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Conversation not found." });
    }

    const conversation = convResult.rows[0];
    const clientId = conversation.client_id as string | null;

    const deletedMessages = await pool.query(
      `DELETE FROM messages WHERE conversation_id = $1`,
      [conversationId],
    );

    await pool.query(`DELETE FROM conversations WHERE id = $1`, [conversationId]);

    let deletedClient = false;
    if (deleteContact && clientId) {
      const linked = await pool.query(
        `SELECT 1 FROM conversations WHERE client_id = $1 LIMIT 1`,
        [clientId],
      );

      if (linked.rows.length === 0) {
        const dc = await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
        deletedClient = (dc.rowCount || 0) > 0;
      }
    }

    await pool.query("COMMIT");
    return res.status(200).json({
      status: "ok",
      conversation_id: conversationId,
      deleted_messages: deletedMessages.rowCount,
      deleted_contact: deletedClient,
    });
  } catch (error: any) {
    await pool.query("ROLLBACK").catch(() => undefined);
    return res.status(500).json({
      error: "Failed to delete conversation.",
      details: error?.message || "Unknown error",
    });
  }
});

router.patch("/:conversationId/contact", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  if (!(await conversationBelongsToCompany(conversationId, authReq.authUser?.company_id || null))) {
    return res.status(404).json({ error: "Conversa nao encontrada." });
  }
  const name = String(req.body?.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Field 'name' is required." });
  }

  try {
    await pool.query("BEGIN");

    const convResult = await pool.query(
      `
      SELECT id, client_id, COALESCE(metadata->>'whatsapp_name','') AS whatsapp_name
      FROM conversations
      WHERE id = $1
      `,
      [conversationId],
    );

    if (convResult.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Conversation not found." });
    }

    const conversation = convResult.rows[0];
    const whatsappName = String(conversation.whatsapp_name || "").trim();
    const finalDisplayName =
      whatsappName && whatsappName !== name ? `${name} (${whatsappName})` : name;

    if (conversation.client_id) {
      await pool.query(
        `
        UPDATE clients
        SET name = $2, updated_at = NOW()
        WHERE id = $1
        `,
        [conversation.client_id, name],
      );
    }

    const updated = await pool.query(
      `
      UPDATE conversations
      SET
        display_name = $2,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{app_name}', to_jsonb($3::text), true),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, display_name, phone, wa_jid
      `,
      [conversationId, finalDisplayName, name],
    );

    await pool.query("COMMIT");
    return res.status(200).json({
      status: "ok",
      conversation: updated.rows[0],
    });
  } catch (error: any) {
    await pool.query("ROLLBACK").catch(() => undefined);
    return res.status(500).json({
      error: "Failed to update contact.",
      details: error?.message || "Unknown error",
    });
  }
});

router.get("/:conversationId/avatar", async (req, res) => {
  const authReq = req as AuthRequest;
  const { conversationId } = req.params;
  const result = await pool.query(
    `
    SELECT
      c.id,
      c.wa_jid,
      COALESCE(c.metadata->>'avatar_url', '') AS avatar_url,
      wa.wa_jid AS account_wa_jid
    FROM conversations c
    JOIN whatsapp_accounts wa ON wa.id = c.account_id
    WHERE c.id = $1
      AND ($2::uuid IS NULL OR wa.company_id = $2)
    `,
    [conversationId, authReq.authUser?.company_id || null],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const conversation = result.rows[0];
  let avatarUrl = conversation.avatar_url || "";

  if (!avatarUrl) {
    avatarUrl = (await getProfilePictureUrl(conversation.wa_jid, result.rows[0].account_wa_jid || null)) || "";
    if (avatarUrl) {
      await updateConversationAvatar(conversation.id, avatarUrl);
    }
  }

  return res.status(200).json({
    conversation_id: conversation.id,
    avatar_url: avatarUrl || null,
  });
});

router.post("/start", async (req, res) => {
  const authReq = req as AuthRequest;
  const name = String(req.body?.name || "").trim();
  const rawPhone = String(req.body?.phone || "").trim();
  const firstMessage = String(req.body?.message || "").trim();

  if (!name || !rawPhone) {
    return res.status(400).json({
      error: "Fields 'name' and 'phone' are required.",
    });
  }

  const phone = normalizeBrazilPhone(rawPhone);
  if (!phone) {
    return res.status(400).json({
      error: "Invalid phone format.",
    });
  }

  try {
    const accountContext = await requireActiveWhatsAppAccount(authReq.authUser?.id, authReq.authUser?.company_id || null);
    const currentAccount = accountContext.effective!;
    const targetJid = phoneToJid(phone);
    const avatarUrl = (await getProfilePictureUrl(targetJid, currentAccount.waJid)) || "";
    const localPhone = phone.startsWith("55") ? phone.slice(2) : phone;

    const account = await upsertWhatsAppAccount({
      waJid: currentAccount.waJid,
      displayName: currentAccount.displayName,
      companyId: authReq.authUser?.company_id || null,
    });

    const clientResult = await pool.query(
      `
      INSERT INTO clients (name, phone)
      VALUES ($1, $2)
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id, name, phone
      `,
      [name, phone],
    );

    const client = clientResult.rows[0];
    await pool.query("BEGIN");

    const candidates = await pool.query(
      `
      SELECT id, display_name
      FROM conversations
      WHERE account_id = $1
        AND (
          phone = $2
          OR phone = $3
          OR phone LIKE '%' || $3
          OR wa_jid = $4
          OR ($5::text <> '' AND COALESCE(metadata->>'avatar_url', '') = $5)
        )
      ORDER BY
        CASE WHEN wa_jid = $4 THEN 0 ELSE 1 END,
        CASE WHEN phone = $2 THEN 0 WHEN phone = $3 THEN 1 ELSE 2 END,
        updated_at DESC
      `,
      [account.id, phone, localPhone, targetJid, avatarUrl],
    );

    let conversationId: string;
    if (candidates.rows.length > 0) {
      const keepId = candidates.rows[0].id as string;
      const dropIds = candidates.rows.slice(1).map((r) => r.id as string);

      if (dropIds.length > 0) {
        await pool.query(
          `UPDATE messages SET conversation_id = $1 WHERE conversation_id = ANY($2::uuid[])`,
          [keepId, dropIds],
        );
        await pool.query(`DELETE FROM conversations WHERE id = ANY($1::uuid[])`, [dropIds]);
      }

      await pool.query(
        `
        UPDATE conversations
        SET
          phone = $2,
          wa_jid = $3,
          client_id = COALESCE($4, client_id),
          display_name = CASE
            WHEN $5::text IS NOT NULL AND COALESCE(metadata->>'whatsapp_name', display_name) IS NOT NULL
              AND $5::text <> COALESCE(metadata->>'whatsapp_name', display_name)
              THEN $5::text || ' (' || COALESCE(metadata->>'whatsapp_name', display_name) || ')'
            WHEN $5::text IS NOT NULL THEN $5::text
            ELSE display_name
          END,
          last_message_at = NOW(),
          last_message_preview = COALESCE($6, last_message_preview),
          metadata = jsonb_strip_nulls(
            COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object('app_name', $5::text)
            || CASE WHEN $7::text <> '' THEN jsonb_build_object('avatar_url', $7::text) ELSE '{}'::jsonb END
          ),
          updated_at = NOW()
        WHERE id = $1
        `,
        [keepId, phone, targetJid, client.id, name, firstMessage || null, avatarUrl],
      );

      conversationId = keepId;
    } else {
      const conversation = await upsertConversation({
        accountId: account.id,
        clientId: client.id,
        phone,
        waJid: targetJid,
        appName: name,
        avatarUrl: avatarUrl || null,
        lastMessagePreview: firstMessage || undefined,
        incrementUnread: false,
      });
      conversationId = conversation.id;
    }

    await pool.query("COMMIT");
    if (authReq.authUser?.id) {
      await claimConversation(conversationId, authReq.authUser.id);
    }

    if (firstMessage) {
      const signedFirstMessage = buildSignedTextMessage(firstMessage, authReq.authUser?.name || "");
      const waResponse = await sendWhatsAppText({
        to: phone,
        message: signedFirstMessage,
        accountJid: currentAccount.waJid,
      });

      await saveOutboundMessage({
        accountJid: currentAccount.waJid,
        accountDisplayName: currentAccount.displayName,
        clientId: client.id,
        phone,
        avatarUrl: avatarUrl || null,
        body: signedFirstMessage,
        messageType: "text",
        status: "sent",
        externalMessageId: waResponse?.key?.id || null,
        payload: waResponse,
      });
    }

    return res.status(201).json({
      status: "ok",
      conversation_id: conversationId,
      client,
    });
  } catch (error: any) {
    if (error instanceof WhatsAppAccountContextError) {
      return res.status(error.code === "WHATSAPP_NOT_CONNECTED" ? 503 : 409).json({
        error: error.message,
      });
    }
    await pool.query("ROLLBACK").catch(() => undefined);
    return res.status(500).json({
      error: "Failed to start conversation.",
      details: error?.message || "Unknown error",
    });
  }
});

export default router;
