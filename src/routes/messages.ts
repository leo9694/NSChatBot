import { Request, Router } from "express";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { saveOutboundMessage } from "../repositories/messages.repository";
import { getConversationAccess } from "../repositories/conversations.repository";
import { saveMediaBuffer } from "../services/media.service";
import { getCurrentWhatsAppAccount, sendWhatsAppAudio, sendWhatsAppMedia, sendWhatsAppText } from "../services/whatsapp.service";

interface SendMessageBody {
  conversation_id?: string;
  client_id?: string;
  phone: string;
  message: string;
  campaign_id?: string;
}
interface SendAudioBody {
  conversation_id?: string;
  client_id?: string;
  campaign_id?: string;
  phone: string;
  audio_base64: string;
  mimetype?: string;
  file_name?: string;
}
interface SendMediaBody {
  conversation_id?: string;
  client_id?: string;
  campaign_id?: string;
  phone: string;
  file_base64: string;
  mimetype?: string;
  file_name?: string;
  caption?: string;
}

function parseBase64Audio(rawValue: string): Buffer {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    throw new Error("Audio vazio.");
  }

  const commaIndex = raw.indexOf(",");
  const base64 = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  return Buffer.from(base64, "base64");
}

function parseBase64(rawValue: string): Buffer {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    throw new Error("Arquivo vazio.");
  }

  const commaIndex = raw.indexOf(",");
  const base64 = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  return Buffer.from(base64, "base64");
}

function buildSignedTextMessage(message: string, attendantName: string): string {
  const cleanMessage = String(message || "").trim();
  const cleanName = String(attendantName || "").trim() || "Atendente";
  if (!cleanMessage) return cleanMessage;

  // Avoid duplicating signature if it was already added.
  if (/^\[[^\]]+\]\s*\n/.test(cleanMessage) || /^\*[^*]+\*:\s*\n/.test(cleanMessage)) {
    return cleanMessage;
  }

  return `*${cleanName}*:\n${cleanMessage}`;
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

const router = Router();
type AuthRequest = Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "administrador" | "operador";
    sector_id?: string | null;
    sector_name?: string | null;
  };
};

async function ensureCanSend(conversationId: string, userId: string): Promise<void> {
  if (!conversationId) {
    throw new Error("CONVERSATION_REQUIRED");
  }
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const access = await getConversationAccess(conversationId);
  if (!access) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }
  if (access.service_status !== "in_progress" || access.assigned_user_id !== userId) {
    throw new Error("NOT_ASSIGNED");
  }
}

router.post("/send", async (req, res) => {
  const authReq = req as AuthRequest;
  const body = req.body as SendMessageBody;

  if (!body.phone || !body.message) {
    return res.status(400).json({
      error: "Fields 'phone' and 'message' are required.",
    });
  }

  try {
    await ensureCanSend(String(body.conversation_id || "").trim(), String(authReq.authUser?.id || "").trim());
    const signedMessage = buildSignedTextMessage(body.message, authReq.authUser?.name || "");

    const account = getCurrentWhatsAppAccount();
    if (!account.waJid) {
      return res.status(503).json({
        error: "WhatsApp account is not connected yet.",
      });
    }

    const waResponse = await sendWhatsAppText({
      to: body.phone,
      message: signedMessage,
    });

    const externalMessageId = waResponse?.key?.id || null;

    await saveOutboundMessage({
      accountJid: account.waJid,
      accountDisplayName: account.displayName,
      clientId: body.client_id || null,
      campaignId: body.campaign_id || null,
      phone: body.phone,
      body: signedMessage,
      messageType: "text",
      externalMessageId,
      status: "sent",
      payload: waResponse,
    });

    return res.status(201).json({
      status: "sent",
      provider: waResponse,
    });
  } catch (error: any) {
    if (error?.message === "CONVERSATION_REQUIRED") {
      return res.status(400).json({ error: "Informe conversation_id para enviar mensagem." });
    }
    if (error?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "Sessao invalida." });
    }
    if (error?.message === "CONVERSATION_NOT_FOUND") {
      return res.status(404).json({ error: "Conversa nao encontrada." });
    }
    if (error?.message === "NOT_ASSIGNED") {
      return res.status(403).json({ error: "Somente o atendente responsavel pode enviar nesta conversa." });
    }

    const providerError = {
      message: error?.message || "Unknown error",
    };

    if (body.phone && body.message) {
      const account = getCurrentWhatsAppAccount();
      const signedMessage = buildSignedTextMessage(body.message, authReq.authUser?.name || "");
      await saveOutboundMessage({
        accountJid: account.waJid || "unknown@s.whatsapp.net",
        accountDisplayName: account.displayName,
        clientId: body.client_id || null,
        campaignId: body.campaign_id || null,
        phone: body.phone,
        body: signedMessage,
        messageType: "text",
        status: "failed",
        payload: providerError,
      });
    }

    return res.status(502).json({
      error: "Failed to send WhatsApp message.",
      details: providerError,
    });
  }
});

router.post("/send-audio", async (req, res) => {
  const authReq = req as AuthRequest;
  const body = req.body as SendAudioBody;
  if (!body.phone || !body.audio_base64) {
    return res.status(400).json({
      error: "Fields 'phone' and 'audio_base64' are required.",
    });
  }

  try {
    await ensureCanSend(String(body.conversation_id || "").trim(), String(authReq.authUser?.id || "").trim());

    const account = getCurrentWhatsAppAccount();
    if (!account.waJid) {
      return res.status(503).json({
        error: "WhatsApp account is not connected yet.",
      });
    }

    const sourceBuffer = parseBase64Audio(body.audio_base64);
    const audioBuffer = await transcodeToOggOpus(sourceBuffer);
    const mimetype = "audio/ogg; codecs=opus";

    const waResponse = await sendWhatsAppAudio({
      to: body.phone,
      audioBuffer,
      mimetype,
      ptt: true,
    });

    const externalMessageId = waResponse?.key?.id || null;
    const audioUrl = await saveMediaBuffer({
      buffer: audioBuffer,
      mimeType: mimetype,
      externalMessageId,
    });

    await saveOutboundMessage({
      accountJid: account.waJid,
      accountDisplayName: account.displayName,
      clientId: body.client_id || null,
      campaignId: body.campaign_id || null,
      phone: body.phone,
      body: "[audio]",
      messageType: "audioMessage",
      externalMessageId,
      status: "sent",
      payload: waResponse,
      metadata: {
        media_type: "audio",
        audio_url: audioUrl,
        file_name: body.file_name || null,
      },
    });

    return res.status(201).json({
      status: "sent",
      provider: waResponse,
    });
  } catch (error: any) {
    if (error?.message === "CONVERSATION_REQUIRED") {
      return res.status(400).json({ error: "Informe conversation_id para enviar audio." });
    }
    if (error?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "Sessao invalida." });
    }
    if (error?.message === "CONVERSATION_NOT_FOUND") {
      return res.status(404).json({ error: "Conversa nao encontrada." });
    }
    if (error?.message === "NOT_ASSIGNED") {
      return res.status(403).json({ error: "Somente o atendente responsavel pode enviar nesta conversa." });
    }

    return res.status(502).json({
      error: "Failed to send WhatsApp audio.",
      details: { message: error?.message || "Unknown error" },
    });
  }
});

router.post("/send-media", async (req, res) => {
  const authReq = req as AuthRequest;
  const body = req.body as SendMediaBody;
  if (!body.phone || !body.file_base64) {
    return res.status(400).json({
      error: "Fields 'phone' and 'file_base64' are required.",
    });
  }

  try {
    await ensureCanSend(String(body.conversation_id || "").trim(), String(authReq.authUser?.id || "").trim());

    const account = getCurrentWhatsAppAccount();
    if (!account.waJid) {
      return res.status(503).json({
        error: "WhatsApp account is not connected yet.",
      });
    }

    const mediaBuffer = parseBase64(body.file_base64);
    const mimetype = String(body.mimetype || "application/octet-stream");
    const fileName = String(body.file_name || "arquivo");
    const caption = String(body.caption || "");

    const waResponse = await sendWhatsAppMedia({
      to: body.phone,
      mediaBuffer,
      mimetype,
      fileName,
      caption,
    });

    const externalMessageId = waResponse?.key?.id || null;
    const mediaUrl = await saveMediaBuffer({
      buffer: mediaBuffer,
      mimeType: mimetype,
      externalMessageId,
      fileName,
    });

    const mediaType = mimetype.startsWith("image/")
      ? "image"
      : mimetype.startsWith("video/")
        ? "video"
        : "document";
    const messageType = mediaType === "image" ? "imageMessage" : mediaType === "video" ? "videoMessage" : "documentMessage";
    const bodyText =
      mediaType === "document"
        ? `[arquivo] ${fileName}`
        : mediaType === "video"
          ? caption || "[video]"
          : caption || "[imagem]";

    await saveOutboundMessage({
      accountJid: account.waJid,
      accountDisplayName: account.displayName,
      clientId: body.client_id || null,
      campaignId: body.campaign_id || null,
      phone: body.phone,
      body: bodyText,
      messageType,
      externalMessageId,
      status: "sent",
      payload: waResponse,
      metadata: {
        media_type: mediaType,
        image_preview_url: mediaType === "image" ? mediaUrl : null,
        video_url: mediaType === "video" ? mediaUrl : null,
        video_mime_type: mediaType === "video" ? mimetype : null,
        file_url: mediaUrl,
        file_name: fileName,
        mime_type: mimetype,
      },
    });

    return res.status(201).json({
      status: "sent",
      provider: waResponse,
    });
  } catch (error: any) {
    if (error?.message === "CONVERSATION_REQUIRED") {
      return res.status(400).json({ error: "Informe conversation_id para enviar arquivo." });
    }
    if (error?.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "Sessao invalida." });
    }
    if (error?.message === "CONVERSATION_NOT_FOUND") {
      return res.status(404).json({ error: "Conversa nao encontrada." });
    }
    if (error?.message === "NOT_ASSIGNED") {
      return res.status(403).json({ error: "Somente o atendente responsavel pode enviar nesta conversa." });
    }

    return res.status(502).json({
      error: "Failed to send WhatsApp media.",
      details: { message: error?.message || "Unknown error" },
    });
  }
});

export default router;
