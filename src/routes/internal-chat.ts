import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import {
  countUnreadInternalMessages,
  createInternalMessage,
  getOrCreateInternalThread,
  listInternalChatContacts,
  listInternalMessages,
  markInternalThreadRead,
} from "../repositories/internal-chat.repository";
import { saveMediaBuffer } from "../services/media.service";

const router = Router();

type AuthRequest = Parameters<typeof requireAuth>[0] & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "ceo" | "administrador" | "operador";
    company_id?: string | null;
  };
};

function getAuthContext(req: AuthRequest) {
  const userId = String(req.authUser?.id || "").trim();
  const companyId = String(req.authUser?.company_id || "").trim();
  return { userId, companyId };
}

function parseBase64(rawValue: string): Buffer {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    throw new Error("EMPTY_FILE");
  }
  const commaIndex = raw.indexOf(",");
  const base64 = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  return Buffer.from(base64, "base64");
}

router.get("/contacts", async (req, res) => {
  const authReq = req as AuthRequest;
  const { userId, companyId } = getAuthContext(authReq);
  if (!userId || !companyId) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }

  const items = await listInternalChatContacts(companyId, userId);
  return res.status(200).json({ items });
});

router.get("/unread-summary", async (req, res) => {
  const authReq = req as AuthRequest;
  const { userId, companyId } = getAuthContext(authReq);
  if (!userId || !companyId) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }

  const unread_count = await countUnreadInternalMessages(companyId, userId);
  return res.status(200).json({ unread_count });
});

router.post("/threads/with/:userId", async (req, res) => {
  const authReq = req as AuthRequest;
  const { userId, companyId } = getAuthContext(authReq);
  const peerUserId = String(req.params?.userId || "").trim();
  if (!userId || !companyId) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  if (!peerUserId || peerUserId === userId) {
    return res.status(400).json({ error: "Atendente invalido." });
  }

  const thread = await getOrCreateInternalThread({ companyId, userId, peerUserId });
  if (!thread) {
    return res.status(404).json({ error: "Atendente nao encontrado nesta empresa." });
  }

  return res.status(200).json({ thread });
});

router.get("/threads/:threadId/messages", async (req, res) => {
  const authReq = req as AuthRequest;
  const { userId, companyId } = getAuthContext(authReq);
  const threadId = String(req.params?.threadId || "").trim();
  const limit = Number(req.query?.limit || 80);
  if (!userId || !companyId) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  if (!threadId) {
    return res.status(400).json({ error: "Chat interno invalido." });
  }

  const items = await listInternalMessages({ threadId, companyId, userId, limit });
  await markInternalThreadRead({ threadId, companyId, userId });
  return res.status(200).json({ items });
});

router.post("/threads/:threadId/messages", async (req, res) => {
  const authReq = req as AuthRequest;
  const { userId, companyId } = getAuthContext(authReq);
  const threadId = String(req.params?.threadId || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!userId || !companyId) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  if (!threadId) {
    return res.status(400).json({ error: "Chat interno invalido." });
  }
  if (!body) {
    return res.status(400).json({ error: "Digite uma mensagem." });
  }

  const message = await createInternalMessage({ threadId, companyId, senderUserId: userId, body });
  if (!message) {
    return res.status(404).json({ error: "Chat interno nao encontrado." });
  }

  return res.status(201).json({ status: "ok", message });
});

router.post("/threads/:threadId/audio", async (req, res) => {
  const authReq = req as AuthRequest;
  const { userId, companyId } = getAuthContext(authReq);
  const threadId = String(req.params?.threadId || "").trim();
  const audioBase64 = String(req.body?.audio_base64 || "").trim();
  const mimeType = String(req.body?.mimetype || "audio/webm").trim();
  const fileName = String(req.body?.file_name || "audio.webm").trim();
  if (!userId || !companyId) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  if (!threadId) {
    return res.status(400).json({ error: "Chat interno invalido." });
  }
  if (!audioBase64) {
    return res.status(400).json({ error: "Audio vazio." });
  }

  const audioBuffer = parseBase64(audioBase64);
  const audioUrl = await saveMediaBuffer({
    buffer: audioBuffer,
    mimeType,
    fileName,
  });
  const message = await createInternalMessage({
    threadId,
    companyId,
    senderUserId: userId,
    body: "[audio]",
    messageType: "audioMessage",
    metadata: {
      media_type: "audio",
      audio_url: audioUrl,
      mime_type: mimeType,
      file_name: fileName,
    },
  });
  if (!message) {
    return res.status(404).json({ error: "Chat interno nao encontrado." });
  }

  return res.status(201).json({ status: "ok", message });
});

export default router;
