import { Router } from "express";
import { onMessageSaved, onMessageStatus } from "../services/realtime.service";

const router = Router();

router.get("/stream", (req, res) => {
  const accountJid = String(req.query.account_jid || "").trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
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

export default router;
