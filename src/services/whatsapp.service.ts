import makeWASocket, {
  downloadMediaMessage,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import { rm } from "node:fs/promises";
import { env } from "../config/env";
import {
  detectMessageType,
  extractImagePreviewDataUrl,
  extractMessageText,
  getUnwrappedMessage,
  hasConversationContent,
  isDirectChatJid,
  jidToPhone,
  normalizeChatJid,
  phoneToJid,
} from "../utils/whatsapp";
import { getWhatsAppHistorySyncState, setWhatsAppHistorySyncBaseline } from "../repositories/accounts.repository";
import { saveInboundMessage, saveOutboundMessage, updateOutboundMessageStatus } from "../repositories/messages.repository";
import { saveMediaBuffer } from "./media.service";

export interface SendWhatsAppTextInput {
  to: string;
  message: string;
}
export interface SendWhatsAppAudioInput {
  to: string;
  audioBuffer: Buffer;
  mimetype?: string;
  ptt?: boolean;
}
export interface SendWhatsAppMediaInput {
  to: string;
  mediaBuffer: Buffer;
  mimetype?: string;
  fileName?: string;
  caption?: string;
}

interface ExtractedDocumentInfo {
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
}

interface ExtractedVideoInfo {
  url: string | null;
  mimeType: string | null;
}

let sock: ReturnType<typeof makeWASocket> | null = null;
let started = false;
let connected = false;
let selfJid = "";
let latestQr = "";
let latestQrAt: Date | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let activeSessionToken = 0;
let reconnectAttempts = 0;
let reconnectWindowStartedAt = 0;
let historySyncUntil = 0;
let historySyncProgress = 0;
let historySyncImportedCount = 0;
let historySyncMessage = "";
let historySyncWatchdogTimer: NodeJS.Timeout | null = null;
let historySyncLastActivityAt = 0;
let hasOpenedConnection = false;
let historySyncBaselineAt: Date | null = null;
let syncOnNextConnect = false;
const avatarCache = new Map<string, { url: string | null; fetchedAt: number }>();
const AVATAR_TTL_MS = 10 * 60 * 1000;
const downloadLogger = pino({ level: "silent" });

function logUpsert(data: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`[WA_UPSERT ${timestamp}]`, JSON.stringify(data));
}

function logStatus(data: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`[WA_STATUS ${timestamp}]`, JSON.stringify(data));
}

function isHistorySyncActive(): boolean {
  if (historySyncUntil > 0 && historySyncUntil <= Date.now()) {
    finishHistorySync(historySyncImportedCount > 0 ? 100 : 0);
  }
  return historySyncUntil > Date.now();
}

function clearHistorySyncWatchdog(): void {
  if (historySyncWatchdogTimer) {
    clearTimeout(historySyncWatchdogTimer);
    historySyncWatchdogTimer = null;
  }
}

function finishHistorySync(progress = 100, message = ""): void {
  clearHistorySyncWatchdog();
  historySyncUntil = 0;
  historySyncProgress = Math.max(0, Math.min(100, Math.round(progress)));
  historySyncLastActivityAt = 0;
  historySyncBaselineAt = null;
  if (message) {
    historySyncMessage = message;
  }
}

function scheduleHistorySyncWatchdog(timeoutMs = 12_000): void {
  clearHistorySyncWatchdog();
  historySyncWatchdogTimer = setTimeout(() => {
    if (!isHistorySyncActive()) {
      return;
    }

    const idleMs = Date.now() - historySyncLastActivityAt;
    if (idleMs < timeoutMs - 250) {
      scheduleHistorySyncWatchdog(timeoutMs);
      return;
    }

    finishHistorySync(
      0,
      "Nenhuma sincronizacao pendente. Para puxar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.",
    );
    console.log("Sincronizacao encerrada sem novas mensagens pendentes.");
  }, timeoutMs);
}

function beginHistorySync(message?: string): void {
  historySyncUntil = Date.now() + 2 * 60 * 1000;
  historySyncProgress = 5;
  historySyncImportedCount = 0;
  historySyncMessage =
    message ||
    "O app vai importar somente mensagens que ainda nao estao no banco. Para puxar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.";
  historySyncLastActivityAt = Date.now();
  scheduleHistorySyncWatchdog();
}

function updateHistorySyncProgress(progress?: number | null, isLatest?: boolean): void {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    historySyncProgress = Math.max(historySyncProgress, Math.min(100, Math.round(progress)));
  }
  historySyncLastActivityAt = Date.now();
  scheduleHistorySyncWatchdog();

  if (isLatest) {
    const message =
      historySyncImportedCount > 0
        ? `${historySyncImportedCount} mensagem(ns) importada(s) na ultima sincronizacao.`
        : "Nenhuma sincronizacao pendente. Para puxar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.";
    finishHistorySync(100, message);
  }
}

async function processWhatsAppMessage(message: WAMessage): Promise<boolean> {
  const remoteJid = message.key.remoteJid;
  const remoteJidAlt = (message.key as any).remoteJidAlt;
  const participant = message.key.participant || null;
  const messageType = detectMessageType(message.message);
  const fromMe = Boolean(message.key.fromMe);
  const externalMessageId = message.key.id || null;
  const remoteCandidates = [String(remoteJid || ""), String(remoteJidAlt || "")].filter(Boolean);
  const isGroup = remoteCandidates.some((jid) => jid.endsWith("@g.us"));
  const isStatus = remoteCandidates.some((jid) => jid === "status@broadcast");
  const isBroadcast = remoteCandidates.some((jid) => jid.endsWith("@broadcast"));
  const hasResolvableDirectPeer = remoteCandidates.some((jid) => isDirectChatJid(jid));
  const hasPhoneBasedPeer = remoteCandidates.some((jid) => jid.endsWith("@s.whatsapp.net"));

  logUpsert({
    stage: "message_in",
    remoteJid: remoteJid || null,
    remoteJidAlt: remoteJidAlt || null,
    participant,
    fromMe,
    externalMessageId,
    messageType,
    isGroup,
    isStatus,
    isBroadcast,
    hasResolvableDirectPeer,
    hasPhoneBasedPeer,
  });

  if (isGroup || isStatus || isBroadcast || !hasResolvableDirectPeer || !hasPhoneBasedPeer) {
    logUpsert({
      stage: "ignored_non_direct_context",
      remoteJid: remoteJid || null,
      remoteJidAlt: remoteJidAlt || null,
      participant,
      fromMe,
      messageType,
      isGroup,
      isStatus,
      isBroadcast,
      hasResolvableDirectPeer,
      hasPhoneBasedPeer,
    });
    return false;
  }

  const normalizedRemoteJid = resolvePeerJid(message);
  if (!normalizedRemoteJid) {
    logUpsert({
      stage: "ignored_non_user_jid",
      remoteJid: remoteJid || null,
      remoteJidAlt: remoteJidAlt || null,
      fromMe,
      messageType,
    });
    return false;
  }

  const isSelfChat = selfJid && normalizedRemoteJid === selfJid;
  const inboundDisplayName =
    message.pushName ||
    ((message as any).verifiedBizName as string | undefined) ||
    null;

  if (!hasConversationContent(message.message)) {
    logUpsert({
      stage: "ignored_no_conversation_content",
      normalizedRemoteJid,
      fromMe,
      messageType,
    });
    return false;
  }

  const isInbound = !fromMe;
  if (!isInbound && isSelfChat) {
    logUpsert({
      stage: "ignored_self_chat_outbound",
      normalizedRemoteJid,
      selfJid,
      fromMe,
      messageType,
    });
    return false;
  }

  const body = extractMessageText(message.message);
  const unwrapped = getUnwrappedMessage(message.message);
  const imagePreview = await extractBestImageUrl(message);
  const videoInfo = await extractBestVideoInfo(message);
  const audioUrl = await extractBestAudioUrl(message);
  const documentInfo = await extractBestDocumentInfo(message);
  const mediaType =
    unwrapped?.imageMessage || messageType === "imageMessage"
      ? "image"
      : unwrapped?.videoMessage || messageType === "videoMessage"
        ? "video"
        : unwrapped?.audioMessage || messageType === "audioMessage"
          ? "audio"
          : unwrapped?.documentMessage || messageType === "documentMessage"
            ? "document"
            : null;
  const imageMimeType = unwrapped?.imageMessage?.mimetype || null;
  const videoMimeType = videoInfo.mimeType || unwrapped?.videoMessage?.mimetype || null;
  const documentMimeType = documentInfo.mimeType || unwrapped?.documentMessage?.mimetype || null;
  const sentAt = message.messageTimestamp
    ? new Date(Number(message.messageTimestamp) * 1000)
    : new Date();
  const avatarUrl = await getContactAvatarUrl(normalizedRemoteJid);

  if (normalizedRemoteJid.endsWith("@lid") && !inboundDisplayName && body === "[mensagem sem texto]") {
    logUpsert({
      stage: "ignored_unresolved_lid",
      normalizedRemoteJid,
      fromMe,
      messageType,
    });
    return false;
  }

  const normalizedPhone = jidToPhone(normalizedRemoteJid);
  if (!normalizedPhone || !/^\d{8,20}$/.test(normalizedPhone)) {
    logUpsert({
      stage: "ignored_unresolved_phone",
      normalizedRemoteJid,
      remoteJid: remoteJid || null,
      remoteJidAlt: remoteJidAlt || null,
      participant,
      fromMe,
      messageType,
      normalizedPhone,
    });
    return false;
  }

  logUpsert({
    stage: "message_parsed",
    normalizedRemoteJid,
    fromMe,
    isInbound,
    messageType,
    bodyPreview: body.slice(0, 120),
    sentAt: sentAt.toISOString(),
  });

  if (!selfJid) {
    logUpsert({
      stage: "ignored_missing_connected_account",
      normalizedRemoteJid,
      externalMessageId,
      messageType,
    });
    return false;
  }

  if (historySyncBaselineAt && sentAt <= historySyncBaselineAt) {
    logUpsert({
      stage: "ignored_before_history_sync_baseline",
      normalizedRemoteJid,
      sentAt: sentAt.toISOString(),
      baselineAt: historySyncBaselineAt.toISOString(),
    });
    return false;
  }

  if (isInbound) {
    const inserted = await saveInboundMessage({
      accountJid: selfJid,
      accountDisplayName: currentAccountName() || null,
      waJid: normalizedRemoteJid,
      avatarUrl,
      body,
      messageType,
      externalMessageId: message.key.id || null,
      payload: message,
      sentAt,
      displayName: inboundDisplayName,
      metadata: {
        media_type: mediaType,
        image_preview_url: imagePreview,
        video_url: videoInfo.url,
        video_mime_type: videoMimeType,
        audio_url: audioUrl,
        file_url: documentInfo.url,
        file_name: documentInfo.fileName,
        mime_type: imageMimeType || videoMimeType || documentMimeType,
      },
    });

    logUpsert({
      stage: "saved_inbound",
      normalizedRemoteJid,
      externalMessageId,
      messageType,
    });
    return inserted;
  } else {
    await saveOutboundMessage({
      accountJid: selfJid,
      accountDisplayName: currentAccountName() || null,
      phone: jidToPhone(normalizedRemoteJid),
      avatarUrl,
      body,
      messageType,
      externalMessageId: message.key.id || null,
      status: "sent",
      payload: message,
      sentAt,
      metadata: {
        media_type: mediaType,
        image_preview_url: imagePreview,
        video_url: videoInfo.url,
        video_mime_type: videoMimeType,
        audio_url: audioUrl,
        file_url: documentInfo.url,
        file_name: documentInfo.fileName,
        mime_type: imageMimeType || videoMimeType || documentMimeType,
      },
    });

    logUpsert({
      stage: "saved_outbound",
      normalizedRemoteJid,
      externalMessageId,
      messageType,
    });
    return true;
  }
}

function currentAccountName(): string {
  return (
    ((sock?.user as any)?.name as string | undefined) ||
    ((sock?.user as any)?.verifiedName as string | undefined) ||
    ""
  );
}

function resolvePeerJid(message: any): string {
  const remoteJid = String(message?.key?.remoteJid || "");
  const remoteJidAlt = String((message?.key as any)?.remoteJidAlt || "");

  // Always prefer phone-based user jid (@s.whatsapp.net) when available.
  const phoneBasedJids = [remoteJid, remoteJidAlt].filter(
    (jid) => jid && isDirectChatJid(jid) && jid.endsWith("@s.whatsapp.net"),
  );
  if (phoneBasedJids.length > 0) {
    return normalizeChatJid(phoneBasedJids[0]);
  }

  // Fallback to any other direct jid (ex.: @lid).
  const directJids = [remoteJid, remoteJidAlt].filter((jid) => jid && isDirectChatJid(jid));
  if (directJids.length > 0) {
    return normalizeChatJid(directJids[0]);
  }

  return "";
}

function resolveDirectJid(remoteJid: string, remoteJidAlt = ""): string {
  const candidates = [String(remoteJid || ""), String(remoteJidAlt || "")].filter(Boolean);
  const phoneJid = candidates.find((jid) => isDirectChatJid(jid) && jid.endsWith("@s.whatsapp.net"));
  if (phoneJid) {
    return normalizeChatJid(phoneJid);
  }

  const directJid = candidates.find((jid) => isDirectChatJid(jid));
  return directJid ? normalizeChatJid(directJid) : "";
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function resetAuthSessionFiles(): Promise<void> {
  await rm(env.whatsappSessionPath, { recursive: true, force: true }).catch(() => undefined);
}

async function teardownCurrentSocket(logout = false): Promise<void> {
  clearReconnectTimer();
  clearHistorySyncWatchdog();
  const previousSock = sock;
  activeSessionToken += 1;

  try {
    if (logout && previousSock) {
      try {
        await previousSock.logout();
      } catch {
        // ignore logout transport failures
      }
    }
  } finally {
    try {
      (previousSock?.ev as any)?.removeAllListeners?.();
    } catch {
      // no-op
    }
    try {
      previousSock?.ws?.close?.();
    } catch {
      // no-op
    }
  }

  sock = null;
  started = false;
  connected = false;
  hasOpenedConnection = false;
  selfJid = "";
  latestQr = "";
  latestQrAt = null;
}

async function runPendingPostConnectSync(): Promise<void> {
  if (!syncOnNextConnect || !selfJid) {
    return;
  }

  syncOnNextConnect = false;
  const syncState = await getWhatsAppHistorySyncState(selfJid);
  const now = new Date();

  if (!syncState.baselineAt) {
    await setWhatsAppHistorySyncBaseline(selfJid, now);
    historySyncBaselineAt = now;
    finishHistorySync(
      100,
      "Primeira sincronizacao registrada. Historico antigo foi ignorado. Para importar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.",
    );
    console.log("Primeira sincronizacao registrada. Historico antigo foi ignorado.");
    return;
  }

  beginHistorySync("Sincronizacao automatica em andamento apos reconectar o WhatsApp.");
  historySyncBaselineAt = syncState.baselineAt;
  console.log(`Sincronizacao automatica solicitada a partir de ${syncState.baselineAt.toISOString()}.`);

  if (sock?.resyncAppState) {
    await sock.resyncAppState(
      ["critical_block", "critical_unblock_low", "regular_low", "regular_high", "regular"],
      false,
    );
  }

  await setWhatsAppHistorySyncBaseline(selfJid, now);
}

function nextReconnectDelayMs(): number | null {
  const now = Date.now();
  const WINDOW_MS = 60_000;
  const MAX_ATTEMPTS_IN_WINDOW = 8;

  if (!reconnectWindowStartedAt || now - reconnectWindowStartedAt > WINDOW_MS) {
    reconnectWindowStartedAt = now;
    reconnectAttempts = 0;
  }

  reconnectAttempts += 1;
  if (reconnectAttempts > MAX_ATTEMPTS_IN_WINDOW) {
    return null;
  }

  return Math.min(12_000, 1_500 * reconnectAttempts);
}

async function getContactAvatarUrl(waJid: string): Promise<string | null> {
  const normalized = normalizeChatJid(waJid);
  const cached = avatarCache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < AVATAR_TTL_MS) {
    return cached.url;
  }

  if (!sock) {
    return null;
  }

  try {
    const url = await sock.profilePictureUrl(normalized, "image");
    avatarCache.set(normalized, { url: url || null, fetchedAt: Date.now() });
    return url || null;
  } catch {
    avatarCache.set(normalized, { url: null, fetchedAt: Date.now() });
    return null;
  }
}

async function extractBestImageUrl(message: WAMessage): Promise<string | null> {
  const preview = extractImagePreviewDataUrl(message.message);
  const unwrapped = getUnwrappedMessage(message.message);
  const imageMessage = unwrapped?.imageMessage;
  if (!imageMessage || !sock) {
    return preview;
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: sock.updateMediaMessage,
      },
    );

    if (!downloaded) {
      return preview;
    }

    const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded as Uint8Array);
    const mediaUrl = await saveMediaBuffer({
      buffer,
      mimeType: imageMessage.mimetype || "image/jpeg",
      externalMessageId: message.key.id || null,
    });

    return mediaUrl || preview;
  } catch {
    return preview;
  }
}

async function extractBestAudioUrl(message: WAMessage): Promise<string | null> {
  const unwrapped = getUnwrappedMessage(message.message);
  const audioMessage = unwrapped?.audioMessage;
  if (!audioMessage || !sock) {
    return null;
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: sock.updateMediaMessage,
      },
    );

    if (!downloaded) {
      return null;
    }

    const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded as Uint8Array);
    return saveMediaBuffer({
      buffer,
      mimeType: audioMessage.mimetype || "audio/ogg",
      externalMessageId: message.key.id || null,
    });
  } catch {
    return null;
  }
}

async function extractBestVideoInfo(message: WAMessage): Promise<ExtractedVideoInfo> {
  const unwrapped = getUnwrappedMessage(message.message);
  const videoMessage = unwrapped?.videoMessage;
  if (!videoMessage || !sock) {
    return { url: null, mimeType: null };
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: sock.updateMediaMessage,
      },
    );

    if (!downloaded) {
      return {
        url: null,
        mimeType: videoMessage.mimetype || "video/mp4",
      };
    }

    const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded as Uint8Array);
    const mimeType = videoMessage.mimetype || "video/mp4";
    const url = await saveMediaBuffer({
      buffer,
      mimeType,
      externalMessageId: message.key.id || null,
    });

    return {
      url,
      mimeType,
    };
  } catch {
    return {
      url: null,
      mimeType: videoMessage.mimetype || "video/mp4",
    };
  }
}

async function extractBestDocumentInfo(message: WAMessage): Promise<ExtractedDocumentInfo> {
  const unwrapped = getUnwrappedMessage(message.message);
  const documentMessage = unwrapped?.documentMessage;
  if (!documentMessage || !sock) {
    return { url: null, fileName: null, mimeType: null };
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: sock.updateMediaMessage,
      },
    );

    if (!downloaded) {
      return {
        url: null,
        fileName: documentMessage.fileName || null,
        mimeType: documentMessage.mimetype || "application/octet-stream",
      };
    }

    const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded as Uint8Array);
    const mimeType = documentMessage.mimetype || "application/octet-stream";
    const url = await saveMediaBuffer({
      buffer,
      mimeType,
      externalMessageId: message.key.id || null,
      fileName: documentMessage.fileName || null,
    });

    return {
      url,
      fileName: documentMessage.fileName || null,
      mimeType,
    };
  } catch {
    return {
      url: null,
      fileName: documentMessage.fileName || null,
      mimeType: documentMessage.mimetype || "application/octet-stream",
    };
  }
}

export async function startWhatsAppSession(force = false): Promise<void> {
  if (started && !force) {
    return;
  }

  if (force) {
    clearReconnectTimer();
    clearHistorySyncWatchdog();
    const previousSock = sock;
    activeSessionToken += 1;
    try {
      (previousSock?.ev as any)?.removeAllListeners?.();
    } catch {
      // no-op
    }
    try {
      previousSock?.ws?.close?.();
    } catch {
      // no-op
    }
    started = false;
    connected = false;
    selfJid = "";
    sock = null;
  }

  started = true;
  const sessionToken = ++activeSessionToken;

  const { state, saveCreds } = await useMultiFileAuthState(env.whatsappSessionPath);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    syncFullHistory: syncOnNextConnect,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("messages.upsert", async (event) => {
    if (sessionToken !== activeSessionToken) {
      return;
    }

    logUpsert({
      stage: "event_received",
      eventType: event.type,
      count: event.messages?.length || 0,
    });

    if (!event.messages || event.messages.length === 0) {
      return;
    }

    if (event.type === "append" && !isHistorySyncActive()) {
      logUpsert({
        stage: "ignored_append_without_manual_sync",
        count: event.messages.length,
      });
      return;
    }

    for (const message of event.messages) {
      try {
        await processWhatsAppMessage(message);
      } catch (error) {
        logUpsert({
          stage: "save_error",
          remoteJid: message.key.remoteJid || null,
          externalMessageId: message.key.id || null,
          messageType: detectMessageType(message.message),
          error: error instanceof Error ? error.message : "unknown",
        });
        console.error("Erro ao salvar mensagem do WhatsApp:", error);
      }
    }
  });

  sock.ev.on("messaging-history.set", async (history) => {
    if (sessionToken !== activeSessionToken) {
      return;
    }

    if (!isHistorySyncActive()) {
      logUpsert({
        stage: "ignored_history_sync_without_manual_trigger",
        messageCount: history.messages?.length || 0,
      });
      return;
    }

    updateHistorySyncProgress(history.progress, history.isLatest);
    logUpsert({
      stage: "history_sync_chunk",
      messageCount: history.messages?.length || 0,
      progress: historySyncProgress,
      isLatest: Boolean(history.isLatest),
    });

    for (const message of history.messages || []) {
      try {
        const saved = await processWhatsAppMessage(message);
        if (saved) {
          historySyncImportedCount += 1;
        }
      } catch (error) {
        console.error("Erro ao salvar mensagem do historico:", error);
      }
    }

    updateHistorySyncProgress(history.progress, history.isLatest);
  });

  sock.ev.on("messages.update", async (updates: any[]) => {
    if (sessionToken !== activeSessionToken) {
      return;
    }

    if (!updates || updates.length === 0 || !selfJid) {
      return;
    }

    for (const update of updates) {
      const externalMessageId = String(update?.key?.id || "");
      if (!externalMessageId) continue;
      const remoteJid = String(update?.key?.remoteJid || "");
      const remoteJidAlt = String(update?.key?.remoteJidAlt || "");
      const waJid = resolveDirectJid(remoteJid, remoteJidAlt);

      const rawStatus = update?.update?.status;
      const statusCode = Number(rawStatus ?? NaN);
      const statusText = String(rawStatus || "").toLowerCase();
      const now = new Date();

      try {
        if (
          (Number.isFinite(statusCode) && statusCode >= 4) ||
          statusText.includes("read") ||
          statusText.includes("played")
        ) {
          await updateOutboundMessageStatus({
            accountJid: selfJid,
            externalMessageId,
            waJid,
            deliveredAt: now,
            readAt: now,
            status: "read",
          });
          logStatus({ source: "messages.update", externalMessageId, waJid, status: "read" });
        } else if (
          (Number.isFinite(statusCode) && statusCode >= 3) ||
          statusText.includes("delivery") ||
          statusText.includes("deliver")
        ) {
          await updateOutboundMessageStatus({
            accountJid: selfJid,
            externalMessageId,
            waJid,
            deliveredAt: now,
            status: "delivered",
          });
          logStatus({ source: "messages.update", externalMessageId, waJid, status: "delivered" });
        } else if (Number.isFinite(statusCode) && statusCode >= 2) {
          await updateOutboundMessageStatus({
            accountJid: selfJid,
            status: "sent",
            externalMessageId,
            waJid,
          });
          logStatus({ source: "messages.update", externalMessageId, waJid, status: "sent" });
        }
      } catch (error) {
        console.error("Erro ao atualizar status da mensagem:", error);
      }
    }
  });

  sock.ev.on("message-receipt.update", async (updates: any[]) => {
    if (sessionToken !== activeSessionToken) {
      return;
    }

    if (!updates || updates.length === 0 || !selfJid) {
      return;
    }

    for (const receipt of updates) {
      const keyId = String(receipt?.key?.id || "");
      const messageIds = [
        keyId,
        ...(Array.isArray(receipt?.messageIds) ? receipt.messageIds : []),
        ...(Array.isArray(receipt?.keys) ? receipt.keys.map((item: any) => item?.id) : []),
      ]
        .map((value) => String(value || ""))
        .filter(Boolean);
      if (messageIds.length === 0) continue;

      const type = String(receipt?.receipt?.type || receipt?.receipt?.status || "").toLowerCase();
      const remoteJid = String(receipt?.key?.remoteJid || "");
      const remoteJidAlt = String(receipt?.key?.remoteJidAlt || "");
      const waJid = resolveDirectJid(remoteJid, remoteJidAlt);
      const now = new Date();

      try {
        for (const externalMessageId of messageIds) {
          if (type === "read" || type === "played") {
            await updateOutboundMessageStatus({
              accountJid: selfJid,
              externalMessageId,
              waJid,
              deliveredAt: now,
              readAt: now,
              status: "read",
            });
            logStatus({ source: "message-receipt.update", externalMessageId, waJid, type, status: "read" });
          } else if (type === "delivery" || type === "delivered") {
            await updateOutboundMessageStatus({
              accountJid: selfJid,
              externalMessageId,
              waJid,
              deliveredAt: now,
              status: "delivered",
            });
            logStatus({ source: "message-receipt.update", externalMessageId, waJid, type, status: "delivered" });
          }
        }
      } catch (error) {
        console.error("Erro ao atualizar receipt da mensagem:", error);
      }
    }
  });

  sock.ev.on("connection.update", async (update) => {
    if (sessionToken !== activeSessionToken) {
      return;
    }

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      latestQrAt = new Date();
      console.log("Escaneie o QR abaixo com o WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      clearReconnectTimer();
      if (!syncOnNextConnect) {
        finishHistorySync(0, historySyncMessage || "Para puxar historico antigo, desconecte este dispositivo no WhatsApp do celular e conecte novamente no app.");
      } else {
        clearHistorySyncWatchdog();
      }
      reconnectAttempts = 0;
      reconnectWindowStartedAt = 0;
      connected = true;
      hasOpenedConnection = true;
      selfJid = sock?.user?.id ? normalizeChatJid(sock.user.id) : "";
      latestQr = "";
      latestQrAt = null;
      console.log("WhatsApp conectado via Baileys.");
      runPendingPostConnectSync().catch((error) => {
        finishHistorySync(0, "Falha ao sincronizar apos reconectar. Tente novamente.");
        console.error("Erro ao iniciar sincronizacao automatica:", error);
      });
    }

    if (connection === "close") {
      connected = false;
      clearHistorySyncWatchdog();

      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.connectionReplaced;

      console.log(`WhatsApp desconectado. status=${statusCode ?? "unknown"}`);

      if (shouldReconnect) {
        if (reconnectTimer) {
          return;
        }

        const delayMs = nextReconnectDelayMs();
        if (delayMs === null || (!hasOpenedConnection && reconnectAttempts >= 3)) {
          clearReconnectTimer();
          started = false;
          selfJid = "";
          latestQr = "";
          latestQrAt = null;
          console.log("Reconexao pausada. Clique em Conectar para gerar novo QR.");
          return;
        }

        console.log(`WhatsApp desconectado. Reconectando em ${delayMs}ms...`);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (sessionToken !== activeSessionToken) {
            return;
          }
          started = false;
          startWhatsAppSession().catch((error) => {
            console.error("Erro ao reconectar WhatsApp:", error);
          });
        }, delayMs);
      } else {
        clearReconnectTimer();
        reconnectAttempts = 0;
        reconnectWindowStartedAt = 0;
        started = false;
        connected = false;
        hasOpenedConnection = false;
        selfJid = "";
        sock = null;
        latestQr = "";
        latestQrAt = null;
        finishHistorySync(0, "Sessao desconectada. Conecte novamente para continuar.");
        await resetAuthSessionFiles();
        console.log("Sessao encerrada (logged out). Remova a pasta de sessao e conecte novamente.");
      }
    }
  });
}

export function getWhatsAppConnectionStatus() {
  const currentUserId = connected && sock?.user?.id ? normalizeChatJid(sock.user.id) : "";
  const currentUserPhone = currentUserId ? jidToPhone(currentUserId) : "";
  const currentUserName = currentAccountName();

  return {
    connected,
    started,
    sessionPath: env.whatsappSessionPath,
    userId: currentUserId || null,
    userPhone: currentUserPhone || null,
    userName: currentUserName || null,
    historySyncActive: isHistorySyncActive(),
    historySyncProgress,
    historySyncImportedCount,
    historySyncMessage,
    qrAvailable: Boolean(latestQr),
    qrUpdatedAt: latestQrAt ? latestQrAt.toISOString() : null,
  };
}

export function getCurrentWhatsAppAccount() {
  const currentUserId = sock?.user?.id ? normalizeChatJid(sock.user.id) : "";
  return {
    waJid: currentUserId || "",
    displayName: currentAccountName() || null,
  };
}

export async function getProfilePictureUrl(waJid: string): Promise<string | null> {
  return getContactAvatarUrl(waJid);
}

export async function getConnectedAccountAvatarUrl(): Promise<string | null> {
  const currentUserId = sock?.user?.id ? normalizeChatJid(sock.user.id) : "";
  if (!currentUserId) {
    return null;
  }

  return getContactAvatarUrl(currentUserId);
}

export async function sendWhatsAppText({ to, message }: SendWhatsAppTextInput): Promise<WAMessage> {
  if (!sock || !connected) {
    throw new Error("WhatsApp nao conectado. Escaneie o QR no terminal primeiro.");
  }

  const jid = phoneToJid(to);
  const response = await sock.sendMessage(jid, { text: message });
  if (!response) {
    throw new Error("Falha ao enviar mensagem no Baileys.");
  }

  return response;
}

export async function sendWhatsAppAudio(input: SendWhatsAppAudioInput): Promise<WAMessage> {
  if (!sock || !connected) {
    throw new Error("WhatsApp nao conectado. Escaneie o QR no terminal primeiro.");
  }

  const jid = phoneToJid(input.to);
  const response = await sock.sendMessage(jid, {
    audio: input.audioBuffer,
    mimetype: input.mimetype || "audio/ogg",
    ptt: Boolean(input.ptt),
  });

  if (!response) {
    throw new Error("Falha ao enviar audio no Baileys.");
  }

  return response;
}

export async function sendWhatsAppMedia(input: SendWhatsAppMediaInput): Promise<WAMessage> {
  if (!sock || !connected) {
    throw new Error("WhatsApp nao conectado. Escaneie o QR no terminal primeiro.");
  }

  const jid = phoneToJid(input.to);
  const mime = String(input.mimetype || "").toLowerCase();
  let payload: Record<string, unknown>;

  if (mime.startsWith("image/")) {
    payload = {
      image: input.mediaBuffer,
      caption: input.caption || "",
      mimetype: input.mimetype || "image/jpeg",
    };
  } else if (mime.startsWith("video/")) {
    payload = {
      video: input.mediaBuffer,
      caption: input.caption || "",
      mimetype: input.mimetype || "video/mp4",
    };
  } else {
    payload = {
      document: input.mediaBuffer,
      fileName: input.fileName || "arquivo",
      caption: input.caption || "",
      mimetype: input.mimetype || "application/octet-stream",
    };
  }

  const response = await sock.sendMessage(jid, payload as any);
  if (!response) {
    throw new Error("Falha ao enviar midia no Baileys.");
  }

  return response;
}

export function getLatestQr() {
  return {
    qr: latestQr || null,
    updatedAt: latestQrAt ? latestQrAt.toISOString() : null,
  };
}

export async function disconnectWhatsAppSession(): Promise<void> {
  try {
    syncOnNextConnect = false;
    await teardownCurrentSocket(true);
  } finally {
    finishHistorySync(0, "Sessao desconectada. Conecte novamente para continuar.");
    await resetAuthSessionFiles();
  }
}

export async function requestWhatsAppConnect(): Promise<void> {
  syncOnNextConnect = true;
  await teardownCurrentSocket(true);
  reconnectAttempts = 0;
  reconnectWindowStartedAt = 0;
  hasOpenedConnection = false;
  historySyncMessage =
    "Leia o novo QR code. Depois da conexao, o app vai sincronizar automaticamente as mensagens pendentes.";
  await resetAuthSessionFiles();
  await startWhatsAppSession(true);
}

export async function requestWhatsAppHistorySync(): Promise<void> {
  historySyncMessage =
    "Sincronizacao solicitada. O app vai remover a conexao atual, gerar um novo QR code e sincronizar automaticamente apos a leitura.";
  await requestWhatsAppConnect();
}
