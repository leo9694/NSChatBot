import { Router } from "express";
import { pool } from "../db/pool";
import { onMessageSaved, onMessageStatus, waitForRealtimeEvent } from "../services/realtime.service";

const router = Router();

async function getRealtimeCheckpoint(accountJid: string, selectedConversationId = "") {
  const latestMessageResult = await pool.query<{
    checkpoint: string | null;
    conversation_id: string | null;
    message_id: string | null;
  }>(
    `
    SELECT
      COALESCE(to_char(COALESCE(m.updated_at, m.created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') AS checkpoint,
      m.conversation_id,
      m.id AS message_id
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN whatsapp_accounts wa ON wa.id = c.account_id
    WHERE ($1::text = '' OR wa.wa_jid = $1)
      AND m.message_type <> 'protocolMessage'
    ORDER BY COALESCE(m.updated_at, m.created_at) DESC, m.created_at DESC
    LIMIT 1
    `,
    [accountJid],
  );

  const latestConversationResult = await pool.query<{ checkpoint: string | null }>(
    `
    SELECT COALESCE(to_char(MAX(c.updated_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') AS checkpoint
    FROM conversations c
    JOIN whatsapp_accounts wa ON wa.id = c.account_id
    WHERE ($1::text = '' OR wa.wa_jid = $1)
    `,
    [accountJid],
  );

  let selectedConversationCheckpoint = "";
  if (selectedConversationId) {
    const selectedResult = await pool.query<{ checkpoint: string | null }>(
      `
      SELECT COALESCE(to_char(MAX(COALESCE(updated_at, created_at)), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') AS checkpoint
      FROM messages
      WHERE conversation_id = $1
        AND message_type <> 'protocolMessage'
      `,
      [selectedConversationId],
    );
    selectedConversationCheckpoint = String(selectedResult.rows[0]?.checkpoint || "");
  }

  const latestMessageCheckpoint = String(latestMessageResult.rows[0]?.checkpoint || "");
  const latestConversationCheckpoint = String(latestConversationResult.rows[0]?.checkpoint || "");

  return {
    token: `${latestMessageCheckpoint}|${latestConversationCheckpoint}|${selectedConversationCheckpoint}`,
    latestMessageAt: latestMessageCheckpoint,
    latestConversationAt: latestConversationCheckpoint,
    selectedConversationAt: selectedConversationCheckpoint,
    latestConversationId: String(latestMessageResult.rows[0]?.conversation_id || ""),
    latestMessageId: String(latestMessageResult.rows[0]?.message_id || ""),
  };
}

router.get("/stream", (req, res) => {
  const accountJid = String(req.query.account_jid || "").trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send("connected", { ok: true, ts: new Date().toISOString() });

  const unsubscribe = onMessageSaved((event) => {
    if (accountJid && event.accountJid !== accountJid) {
      return;
    }
    send("message_saved", event);
  });
  const unsubscribeStatus = onMessageStatus((event) => {
    if (accountJid && event.accountJid !== accountJid) {
      return;
    }
    send("message_status", event);
  });

  const heartbeat = setInterval(() => {
    send("ping", { ts: new Date().toISOString() });
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    unsubscribeStatus();
    res.end();
  });
});

router.get("/poll", async (req, res) => {
  const accountJid = String(req.query.account_jid || "").trim();
  const sinceSeq = Number(req.query.since || 0) || 0;
  const checkpoint = String(req.query.checkpoint || "").trim();
  const selectedConversationId = String(req.query.selected_conversation_id || "").trim();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const initialCheckpoint = await getRealtimeCheckpoint(accountJid, selectedConversationId);
  if (checkpoint && initialCheckpoint.token && checkpoint !== initialCheckpoint.token) {
    return res.status(200).json({
      ok: true,
      event: {
        type: "checkpoint_changed",
        payload: initialCheckpoint,
        seq: sinceSeq,
      },
      timeout: false,
      ts: new Date().toISOString(),
    });
  }

  const event = await waitForRealtimeEvent(accountJid, sinceSeq, 25_000);
  if (!event) {
    const finalCheckpoint = await getRealtimeCheckpoint(accountJid, selectedConversationId);
    if (checkpoint && finalCheckpoint.token && checkpoint !== finalCheckpoint.token) {
      return res.status(200).json({
        ok: true,
        event: {
          type: "checkpoint_changed",
          payload: finalCheckpoint,
          seq: sinceSeq,
        },
        timeout: false,
        ts: new Date().toISOString(),
      });
    }
  }
  return res.status(200).json({
    ok: true,
    event,
    timeout: !event,
    ts: new Date().toISOString(),
  });
});

router.get("/checkpoint", async (req, res) => {
  const accountJid = String(req.query.account_jid || "").trim();
  const selectedConversationId = String(req.query.selected_conversation_id || "").trim();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const checkpoint = await getRealtimeCheckpoint(accountJid, selectedConversationId);
  return res.status(200).json({
    ok: true,
    checkpoint,
    ts: new Date().toISOString(),
  });
});

export default router;
