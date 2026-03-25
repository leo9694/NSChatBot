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
import { rm } from "fs/promises";
import { env } from "../config/env";
import {
  detectMessageType,
  extractQuotedContext,
  extractImagePreviewDataUrl,
  extractMessageText,
  getUnwrappedMessage,
  hasConversationContent,
  isDirectChatJid,
  jidToPhone,
  normalizeChatJid,
  phoneToJid,
} from "../utils/whatsapp";
import { getWhatsAppHistorySyncState, listWhatsAppAccounts, setWhatsAppHistorySyncBaseline, upsertWhatsAppAccount } from "../repositories/accounts.repository";
import { saveInboundMessage, saveOutboundMessage, updateOutboundMessageStatus } from "../repositories/messages.repository";
import { handleInboundAiAutomation, registerCustomerMessageActivity, registerCustomerTypingActivity, registerCustomerTypingStopped, scheduleInboundAiAutomation } from "./ai-agent.service";
import { saveMediaBuffer } from "./media.service";
import { pool } from "../db/pool";
import { publishConversationTyping } from "./realtime.service";

export interface SendWhatsAppTextInput {
  to: string;
  message: string;
  accountJid?: string | null;
}
export interface SendWhatsAppAudioInput {
  to: string;
  audioBuffer: Buffer;
  mimetype?: string;
  ptt?: boolean;
  accountJid?: string | null;
}
export interface SendWhatsAppMediaInput {
  to: string;
  mediaBuffer: Buffer;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  accountJid?: string | null;
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

let activeSessionPath = env.whatsappSessionPath;
interface WhatsAppSessionState {
  sessionPath: string;
  sock: ReturnType<typeof makeWASocket> | null;
  started: boolean;
  allowQrOnCurrentStart: boolean;
  connected: boolean;
  selfJid: string;
  latestQr: string;
  latestQrAt: Date | null;
  reconnectTimer: NodeJS.Timeout | null;
  activeSessionToken: number;
  reconnectAttempts: number;
  reconnectWindowStartedAt: number;
  historySyncUntil: number;
  historySyncProgress: number;
  historySyncImportedCount: number;
  historySyncMessage: string;
  historySyncWatchdogTimer: NodeJS.Timeout | null;
  historySyncLastActivityAt: number;
  hasOpenedConnection: boolean;
  historySyncBaselineAt: Date | null;
  syncOnNextConnect: boolean;
}

const sessions = new Map<string, WhatsAppSessionState>();
const avatarCache = new Map<string, { url: string | null; fetchedAt: number }>();
const AVATAR_TTL_MS = 10 * 60 * 1000;
const downloadLogger = pino({ level: "silent" });

function normalizeSessionPath(sessionPath?: string | null): string {
  return String(sessionPath || activeSessionPath || env.whatsappSessionPath).trim() || env.whatsappSessionPath;
}

function createSessionState(sessionPath: string): WhatsAppSessionState {
  return {
    sessionPath,
    sock: null,
    started: false,
    allowQrOnCurrentStart: false,
    connected: false,
    selfJid: "",
    latestQr: "",
    latestQrAt: null,
    reconnectTimer: null,
    activeSessionToken: 0,
    reconnectAttempts: 0,
    reconnectWindowStartedAt: 0,
    historySyncUntil: 0,
    historySyncProgress: 0,
    historySyncImportedCount: 0,
    historySyncMessage: "",
    historySyncWatchdogTimer: null,
    historySyncLastActivityAt: 0,
    hasOpenedConnection: false,
    historySyncBaselineAt: null,
    syncOnNextConnect: false,
  };
}

function getOrCreateSession(sessionPath?: string | null): WhatsAppSessionState {
  const normalizedPath = normalizeSessionPath(sessionPath);
  let session = sessions.get(normalizedPath);
  if (!session) {
    session = createSessionState(normalizedPath);
    sessions.set(normalizedPath, session);
  }
  return session;
}

function getActiveSession(): WhatsAppSessionState {
  return getOrCreateSession(activeSessionPath);
}

function listSessionStates(): WhatsAppSessionState[] {
  return Array.from(sessions.values());
}

function getSessionByAccountJid(accountJid?: string | null): WhatsAppSessionState | null {
  const normalizedJid = normalizeChatJid(String(accountJid || ""));
  if (!normalizedJid) return null;
  return listSessionStates().find((session) => session.selfJid === normalizedJid) || null;
}

function resolveSessionForAccount(accountJid?: string | null, sessionPath?: string | null): WhatsAppSessionState {
  if (accountJid) {
    const byJid = getSessionByAccountJid(accountJid);
    if (byJid) return byJid;
  }
  if (sessionPath) {
    return getOrCreateSession(sessionPath);
  }
  return getActiveSession();
}

function logUpsert(data: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`[WA_UPSERT ${timestamp}]`, JSON.stringify(data));
}

function logStatus(data: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`[WA_STATUS ${timestamp}]`, JSON.stringify(data));
}

async function findConversationIdForPresence(accountJid: string, waJid: string): Promise<string | null> {
  const normalizedAccountJid = normalizeChatJid(String(accountJid || ""));
  const normalizedWaJid = normalizeChatJid(String(waJid || ""));
  if (!normalizedAccountJid || !normalizedWaJid) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT c.id
      FROM conversations c
      JOIN whatsapp_accounts a ON a.id = c.account_id
      WHERE a.wa_jid = $1
        AND c.wa_jid = $2
      LIMIT 1
    `,
    [normalizedAccountJid, normalizedWaJid],
  );

  return result.rows[0]?.id || null;
}

function isHistorySyncActive(session: WhatsAppSessionState): boolean {
  if (session.historySyncUntil > 0 && session.historySyncUntil <= Date.now()) {
    finishHistorySync(session, session.historySyncImportedCount > 0 ? 100 : 0);
  }
  return session.historySyncUntil > Date.now();
}

function clearHistorySyncWatchdog(session: WhatsAppSessionState): void {
  if (session.historySyncWatchdogTimer) {
    clearTimeout(session.historySyncWatchdogTimer);
    session.historySyncWatchdogTimer = null;
  }
}

function finishHistorySync(session: WhatsAppSessionState, progress = 100, message = ""): void {
  clearHistorySyncWatchdog(session);
  session.historySyncUntil = 0;
  session.historySyncProgress = Math.max(0, Math.min(100, Math.round(progress)));
  session.historySyncLastActivityAt = 0;
  session.historySyncBaselineAt = null;
  if (message) {
    session.historySyncMessage = message;
  }
}

function scheduleHistorySyncWatchdog(session: WhatsAppSessionState, timeoutMs = 12_000): void {
  clearHistorySyncWatchdog(session);
  session.historySyncWatchdogTimer = setTimeout(() => {
    if (!isHistorySyncActive(session)) {
      return;
    }

    const idleMs = Date.now() - session.historySyncLastActivityAt;
    if (idleMs < timeoutMs - 250) {
      scheduleHistorySyncWatchdog(session, timeoutMs);
      return;
    }

    finishHistorySync(
      session,
      0,
      "Nenhuma sincronizacao pendente. Para puxar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.",
    );
    console.log("Sincronizacao encerrada sem novas mensagens pendentes.");
  }, timeoutMs);
}

function beginHistorySync(session: WhatsAppSessionState, message?: string): void {
  session.historySyncUntil = Date.now() + 2 * 60 * 1000;
  session.historySyncProgress = 5;
  session.historySyncImportedCount = 0;
  session.historySyncMessage =
    message ||
    "O app vai importar somente mensagens que ainda nao estao no banco. Para puxar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.";
  session.historySyncLastActivityAt = Date.now();
  scheduleHistorySyncWatchdog(session);
}

function updateHistorySyncProgress(session: WhatsAppSessionState, progress?: number | null, isLatest?: boolean): void {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    session.historySyncProgress = Math.max(session.historySyncProgress, Math.min(100, Math.round(progress)));
  }
  session.historySyncLastActivityAt = Date.now();
  scheduleHistorySyncWatchdog(session);

  if (isLatest) {
    const message =
      session.historySyncImportedCount > 0
        ? `${session.historySyncImportedCount} mensagem(ns) importada(s) na ultima sincronizacao.`
        : "Nenhuma sincronizacao pendente. Para puxar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.";
    finishHistorySync(session, 100, message);
  }
}

async function processWhatsAppMessage(session: WhatsAppSessionState, message: WAMessage): Promise<boolean> {
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

  const isSelfChat = session.selfJid && normalizedRemoteJid === session.selfJid;
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
      selfJid: session.selfJid,
      fromMe,
      messageType,
    });
    return false;
  }

  const body = extractMessageText(message.message);
  const quotedContext = extractQuotedContext(message.message);
  const unwrapped = getUnwrappedMessage(message.message);
  const imagePreview = await extractBestImageUrl(session, message);
  const videoInfo = await extractBestVideoInfo(session, message);
  const audioUrl = await extractBestAudioUrl(session, message);
  const documentInfo = await extractBestDocumentInfo(session, message);
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
  const avatarUrl = await getContactAvatarUrl(session, normalizedRemoteJid);

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

  if (!session.selfJid) {
    logUpsert({
      stage: "ignored_missing_connected_account",
      normalizedRemoteJid,
      externalMessageId,
      messageType,
    });
    return false;
  }

  if (session.historySyncBaselineAt && sentAt <= session.historySyncBaselineAt) {
    logUpsert({
      stage: "ignored_before_history_sync_baseline",
      normalizedRemoteJid,
      sentAt: sentAt.toISOString(),
      baselineAt: session.historySyncBaselineAt.toISOString(),
    });
    return false;
  }

  if (isInbound) {
    const inboundResult = await saveInboundMessage({
      accountJid: session.selfJid,
      accountDisplayName: currentAccountName(session) || null,
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
        quoted_message_id: quotedContext.stanzaId,
        quoted_body: quotedContext.body,
        image_preview_url: imagePreview,
        video_url: videoInfo.url,
        video_mime_type: videoMimeType,
        audio_url: audioUrl,
        file_url: documentInfo.url,
        file_name: documentInfo.fileName,
        mime_type: imageMimeType || videoMimeType || documentMimeType,
      },
    });

    if (inboundResult.conversationId) {
      registerCustomerMessageActivity(inboundResult.conversationId);
    }

    logUpsert({
      stage: "saved_inbound",
      normalizedRemoteJid,
      externalMessageId,
      messageType,
    });
    return inboundResult.inserted;
  } else {
    await saveOutboundMessage({
      accountJid: session.selfJid,
      accountDisplayName: currentAccountName(session) || null,
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

function currentAccountName(session: WhatsAppSessionState): string {
  return (
    ((session.sock?.user as any)?.name as string | undefined) ||
    ((session.sock?.user as any)?.verifiedName as string | undefined) ||
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

function clearReconnectTimer(session: WhatsAppSessionState): void {
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

async function resetAuthSessionFiles(sessionPath = activeSessionPath): Promise<void> {
  await rm(sessionPath, { recursive: true, force: true }).catch(() => undefined);
}

async function teardownCurrentSocket(session: WhatsAppSessionState, logout = false): Promise<void> {
  clearReconnectTimer(session);
  clearHistorySyncWatchdog(session);
  const previousSock = session.sock;
  session.activeSessionToken += 1;

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

  session.sock = null;
  session.started = false;
  session.allowQrOnCurrentStart = false;
  session.connected = false;
  session.hasOpenedConnection = false;
  session.selfJid = "";
  session.latestQr = "";
  session.latestQrAt = null;
}

async function runPendingPostConnectSync(session: WhatsAppSessionState): Promise<void> {
  if (!session.syncOnNextConnect || !session.selfJid) {
    return;
  }

  const syncState = await getWhatsAppHistorySyncState(session.selfJid);
  const now = new Date();

  if (!syncState.baselineAt) {
    session.syncOnNextConnect = false;
    await setWhatsAppHistorySyncBaseline(session.selfJid, now);
    session.historySyncBaselineAt = now;
    finishHistorySync(
      session,
      100,
      "Primeira sincronizacao registrada. Historico antigo foi ignorado. Para importar historico antigo, desconecte este dispositivo no WhatsApp e conecte novamente no app.",
    );
    console.log("Primeira sincronizacao registrada. Historico antigo foi ignorado.");
    return;
  }

  session.syncOnNextConnect = false;
  beginHistorySync(session, "Sincronizacao automatica em andamento apos reconectar o WhatsApp.");
  session.historySyncBaselineAt = syncState.baselineAt;
  console.log(`Sincronizacao automatica solicitada a partir de ${syncState.baselineAt.toISOString()}.`);

  if (session.sock?.resyncAppState) {
    await session.sock.resyncAppState(
      ["critical_block", "critical_unblock_low", "regular_low", "regular_high", "regular"],
      false,
    );
  }

  await setWhatsAppHistorySyncBaseline(session.selfJid, now);
}

async function ensureHistoryBaselineOnConnect(session: WhatsAppSessionState): Promise<void> {
  if (!session.selfJid) {
    return;
  }

  const syncState = await getWhatsAppHistorySyncState(session.selfJid);
  if (syncState.baselineAt) {
    session.historySyncBaselineAt = syncState.baselineAt;
    return;
  }

  const now = new Date();
  await setWhatsAppHistorySyncBaseline(session.selfJid, now);
  session.historySyncBaselineAt = now;
}

async function ensureHistorySyncReady(session: WhatsAppSessionState): Promise<boolean> {
  if (isHistorySyncActive(session)) {
    return true;
  }

  if (!session.syncOnNextConnect || !session.selfJid) {
    return false;
  }

  await runPendingPostConnectSync(session);
  return isHistorySyncActive(session);
}

function nextReconnectDelayMs(session: WhatsAppSessionState): number | null {
  const now = Date.now();
  const WINDOW_MS = 60_000;
  const MAX_ATTEMPTS_IN_WINDOW = 8;

  if (!session.reconnectWindowStartedAt || now - session.reconnectWindowStartedAt > WINDOW_MS) {
    session.reconnectWindowStartedAt = now;
    session.reconnectAttempts = 0;
  }

  session.reconnectAttempts += 1;
  if (session.reconnectAttempts > MAX_ATTEMPTS_IN_WINDOW) {
    return null;
  }

  return Math.min(12_000, 1_500 * session.reconnectAttempts);
}

async function getContactAvatarUrl(session: WhatsAppSessionState, waJid: string): Promise<string | null> {
  const normalized = normalizeChatJid(waJid);
  const cached = avatarCache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < AVATAR_TTL_MS) {
    return cached.url;
  }

  if (!session.sock) {
    return null;
  }

  try {
    const url = await session.sock.profilePictureUrl(normalized, "image");
    avatarCache.set(normalized, { url: url || null, fetchedAt: Date.now() });
    return url || null;
  } catch {
    avatarCache.set(normalized, { url: null, fetchedAt: Date.now() });
    return null;
  }
}

async function extractBestImageUrl(session: WhatsAppSessionState, message: WAMessage): Promise<string | null> {
  const preview = extractImagePreviewDataUrl(message.message);
  const unwrapped = getUnwrappedMessage(message.message);
  const imageMessage = unwrapped?.imageMessage;
  if (!imageMessage || !session.sock) {
    return preview;
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: session.sock.updateMediaMessage,
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

async function extractBestAudioUrl(session: WhatsAppSessionState, message: WAMessage): Promise<string | null> {
  const unwrapped = getUnwrappedMessage(message.message);
  const audioMessage = unwrapped?.audioMessage;
  if (!audioMessage || !session.sock) {
    return null;
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: session.sock.updateMediaMessage,
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

async function extractBestVideoInfo(session: WhatsAppSessionState, message: WAMessage): Promise<ExtractedVideoInfo> {
  const unwrapped = getUnwrappedMessage(message.message);
  const videoMessage = unwrapped?.videoMessage;
  if (!videoMessage || !session.sock) {
    return { url: null, mimeType: null };
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: session.sock.updateMediaMessage,
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

async function extractBestDocumentInfo(session: WhatsAppSessionState, message: WAMessage): Promise<ExtractedDocumentInfo> {
  const unwrapped = getUnwrappedMessage(message.message);
  const documentMessage = unwrapped?.documentMessage;
  if (!documentMessage || !session.sock) {
    return { url: null, fileName: null, mimeType: null };
  }

  try {
    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: downloadLogger,
        reuploadRequest: session.sock.updateMediaMessage,
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

export async function startWhatsAppSession(
  force = false,
  options?: {
    sessionPath?: string;
    allowQr?: boolean;
  },
): Promise<void> {
  const nextSessionPath = normalizeSessionPath(options?.sessionPath);
  const session = getOrCreateSession(nextSessionPath);
  if (session.started && !force) {
    return;
  }

  if (force) {
    await teardownCurrentSocket(session, false);
  }

  activeSessionPath = nextSessionPath;
  session.started = true;
  session.allowQrOnCurrentStart = Boolean(options?.allowQr);
  const sessionToken = ++session.activeSessionToken;

  const { state, saveCreds } = await useMultiFileAuthState(session.sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  session.sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    syncFullHistory: session.syncOnNextConnect,
  });

  session.sock.ev.on("creds.update", saveCreds);
  session.sock.ev.on("messages.upsert", async (event: any) => {
    if (sessionToken != session.activeSessionToken) {
      return;
    }

    logUpsert({
      stage: "event_received",
      eventType: event.type,
      count: event.messages?.length || 0,
      accountJid: session.selfJid || null,
      sessionPath: session.sessionPath,
    });

    if (!event.messages || event.messages.length === 0) {
      return;
    }

    if (event.type === "append" && !isHistorySyncActive(session)) {
      logUpsert({
        stage: "ignored_append_without_manual_sync",
        count: event.messages.length,
        sessionPath: session.sessionPath,
      });
      return;
    }

    for (const message of event.messages) {
      try {
        await processWhatsAppMessage(session, message);
      } catch (error) {
        logUpsert({
          stage: "save_error",
          remoteJid: message.key.remoteJid || null,
          externalMessageId: message.key.id || null,
          messageType: detectMessageType(message.message),
          error: error instanceof Error ? error.message : "unknown",
          accountJid: session.selfJid || null,
          sessionPath: session.sessionPath,
        });
        console.error("Erro ao salvar mensagem do WhatsApp:", error);
      }
    }
  });

  session.sock.ev.on("presence.update", async (event: any) => {
    if (sessionToken !== session.activeSessionToken) {
      return;
    }

    try {
      const remoteJid = normalizeChatJid(String(event?.id || ""));
      if (!remoteJid || !isDirectChatJid(remoteJid)) {
        return;
      }

      const presences = event?.presences && typeof event.presences === "object" ? Object.values(event.presences) : [];
      const states = presences
        .map((presence: any) => String(presence?.lastKnownPresence || presence?.presence || "").toLowerCase())
        .filter(Boolean);
      const hasTypingSignal = states.some((state) => state === "composing" || state === "recording");
      const hasTypingStoppedSignal = states.some(
        (state) => state === "paused" || state === "available" || state === "unavailable",
      );

      if ((!hasTypingSignal && !hasTypingStoppedSignal) || !session.selfJid) {
        return;
      }

      const conversationId = await findConversationIdForPresence(session.selfJid, remoteJid).catch(() => null);
      if (!conversationId) {
        return;
      }

      if (hasTypingSignal) {
        registerCustomerTypingActivity(conversationId);
        publishConversationTyping({
          accountJid: session.selfJid,
          conversationId,
          active: true,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (hasTypingStoppedSignal) {
        registerCustomerTypingStopped(conversationId);
        publishConversationTyping({
          accountJid: session.selfJid,
          conversationId,
          active: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore presence parsing failures; fallback debounce by message still works.
    }
  });

  session.sock.ev.on("messaging-history.set", async (history: any) => {
    if (sessionToken !== session.activeSessionToken) {
      return;
    }

    if (!(await ensureHistorySyncReady(session))) {
      return;
    }

    updateHistorySyncProgress(session, history.progress, history.isLatest);
    logUpsert({
      stage: "history_sync_chunk",
      messageCount: history.messages?.length || 0,
      progress: session.historySyncProgress,
      isLatest: Boolean(history.isLatest),
      accountJid: session.selfJid || null,
      sessionPath: session.sessionPath,
    });

    for (const message of history.messages || []) {
      try {
        const saved = await processWhatsAppMessage(session, message);
        if (saved) {
          session.historySyncImportedCount += 1;
        }
      } catch (error) {
        console.error("Erro ao salvar mensagem do historico:", error);
      }
    }

    updateHistorySyncProgress(session, history.progress, history.isLatest);
  });

  session.sock.ev.on("messages.update", async (updates: any[]) => {
    if (sessionToken !== session.activeSessionToken) {
      return;
    }

    if (!updates || updates.length === 0 || !session.selfJid) {
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
        if ((Number.isFinite(statusCode) && statusCode >= 4) || statusText.includes("read") || statusText.includes("played")) {
          await updateOutboundMessageStatus({
            accountJid: session.selfJid,
            externalMessageId,
            waJid,
            deliveredAt: now,
            readAt: now,
            status: "read",
          });
          logStatus({ source: "messages.update", externalMessageId, waJid, status: "read", accountJid: session.selfJid });
        } else if ((Number.isFinite(statusCode) && statusCode >= 3) || statusText.includes("delivery") || statusText.includes("deliver")) {
          await updateOutboundMessageStatus({
            accountJid: session.selfJid,
            externalMessageId,
            waJid,
            deliveredAt: now,
            status: "delivered",
          });
          logStatus({ source: "messages.update", externalMessageId, waJid, status: "delivered", accountJid: session.selfJid });
        } else if (Number.isFinite(statusCode) && statusCode >= 2) {
          await updateOutboundMessageStatus({
            accountJid: session.selfJid,
            status: "sent",
            externalMessageId,
            waJid,
          });
          logStatus({ source: "messages.update", externalMessageId, waJid, status: "sent", accountJid: session.selfJid });
        }
      } catch (error) {
        console.error("Erro ao atualizar status da mensagem:", error);
      }
    }
  });

  session.sock.ev.on("message-receipt.update", async (updates: any[]) => {
    if (sessionToken !== session.activeSessionToken) {
      return;
    }

    if (!updates || updates.length === 0 || !session.selfJid) {
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
              accountJid: session.selfJid,
              externalMessageId,
              waJid,
              deliveredAt: now,
              readAt: now,
              status: "read",
            });
            logStatus({ source: "message-receipt.update", externalMessageId, waJid, type, status: "read", accountJid: session.selfJid });
          } else if (type === "delivery" || type === "delivered") {
            await updateOutboundMessageStatus({
              accountJid: session.selfJid,
              externalMessageId,
              waJid,
              deliveredAt: now,
              status: "delivered",
            });
            logStatus({ source: "message-receipt.update", externalMessageId, waJid, type, status: "delivered", accountJid: session.selfJid });
          }
        }
      } catch (error) {
        console.error("Erro ao atualizar receipt da mensagem:", error);
      }
    }
  });

  session.sock.ev.on("connection.update", async (update: any) => {
    if (sessionToken !== session.activeSessionToken) {
      return;
    }

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (!session.allowQrOnCurrentStart) {
        session.latestQr = "";
        session.latestQrAt = null;
        session.historySyncMessage = "Esta sessao precisa de novo QR. Clique em Conectar para gerar um novo QR code.";
        console.log(`Sessao ${session.sessionPath} precisa de QR. Reconexao automatica pausada.`);
        await teardownCurrentSocket(session, false);
        return;
      }
      session.latestQr = qr;
      session.latestQrAt = new Date();
      console.log(`Escaneie o QR abaixo com o WhatsApp (${session.sessionPath}):`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      clearReconnectTimer(session);
      if (!session.syncOnNextConnect) {
        finishHistorySync(
          session,
          0,
          session.historySyncMessage || "Para puxar historico antigo, desconecte este dispositivo no WhatsApp do celular e conecte novamente no app.",
        );
      } else {
        clearHistorySyncWatchdog(session);
      }
      session.reconnectAttempts = 0;
      session.reconnectWindowStartedAt = 0;
      session.connected = true;
      session.hasOpenedConnection = true;
      session.selfJid = session.sock?.user?.id ? normalizeChatJid(session.sock.user.id) : "";
      session.latestQr = "";
      session.latestQrAt = null;
      if (session.selfJid) {
        try {
          await upsertWhatsAppAccount({
            waJid: session.selfJid,
            displayName: currentAccountName(session) || null,
            sessionPath: session.sessionPath,
          });
        } catch (error: any) {
          if (error?.code === "WHATSAPP_ACCOUNT_ASSIGNED_TO_OTHER_COMPANY") {
            session.connected = false;
            session.started = false;
            session.historySyncProgress = 0;
            session.historySyncImportedCount = 0;
            session.historySyncMessage = error.companyName
              ? `Este numero ja esta vinculado a outra empresa: ${error.companyName}. Remova-o da empresa atual antes de conectar aqui.`
              : "Este numero ja esta vinculado a outra empresa. Remova-o da empresa atual antes de conectar aqui.";
            await disconnectWhatsAppSession(session.sessionPath).catch(() => undefined);
            console.warn(`Numero ${session.selfJid} bloqueado por estar vinculado a outra empresa.`);
            return;
          }
          throw error;
        }
        await ensureHistoryBaselineOnConnect(session).catch((error) => {
          console.error("Erro ao registrar baseline de historico:", error);
        });
      }
      console.log(`WhatsApp conectado via Baileys (${session.selfJid || session.sessionPath}).`);
      runPendingPostConnectSync(session).catch((error) => {
        finishHistorySync(session, 0, "Falha ao sincronizar apos reconectar. Tente novamente.");
        console.error("Erro ao iniciar sincronizacao automatica:", error);
      });
    }

    if (connection === "close") {
      session.connected = false;
      clearHistorySyncWatchdog(session);

      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.connectionReplaced;

      console.log(`WhatsApp desconectado. status=${statusCode ?? "unknown"} session=${session.sessionPath}`);

      if (shouldReconnect) {
        if (session.reconnectTimer) {
          return;
        }

        const delayMs = nextReconnectDelayMs(session);
        if (delayMs === null || (!session.hasOpenedConnection && session.reconnectAttempts >= 3)) {
          clearReconnectTimer(session);
          session.started = false;
          session.selfJid = "";
          session.latestQr = "";
          session.latestQrAt = null;
          console.log("Reconexao pausada. Clique em Conectar para gerar novo QR.");
          return;
        }

        console.log(`WhatsApp desconectado. Reconectando em ${delayMs}ms... session=${session.sessionPath}`);
        session.reconnectTimer = setTimeout(() => {
          session.reconnectTimer = null;
          if (sessionToken !== session.activeSessionToken) {
            return;
          }
          session.started = false;
          startWhatsAppSession(false, { sessionPath: session.sessionPath }).catch((error) => {
            console.error("Erro ao reconectar WhatsApp:", error);
          });
        }, delayMs);
      } else {
        clearReconnectTimer(session);
        session.reconnectAttempts = 0;
        session.reconnectWindowStartedAt = 0;
        session.started = false;
        session.connected = false;
        session.hasOpenedConnection = false;
        session.selfJid = "";
        session.sock = null;
        session.latestQr = "";
        session.latestQrAt = null;
        finishHistorySync(session, 0, "Sessao desconectada. Conecte novamente para continuar.");
        await resetAuthSessionFiles(session.sessionPath);
        console.log("Sessao encerrada (logged out). Remova a pasta de sessao e conecte novamente.");
      }
    }
  });
}

export async function startKnownWhatsAppSessions(): Promise<void> {
  const accounts = await listWhatsAppAccounts();
  const sessionPaths = new Set<string>();

  for (const account of accounts) {
    if (String(account.wa_jid || "").startsWith("pending:")) {
      continue;
    }
    const sessionPath = String(account.session_path || "").trim();
    if (!sessionPath || sessionPaths.has(sessionPath)) {
      continue;
    }
    sessionPaths.add(sessionPath);
    await startWhatsAppSession(false, { sessionPath, allowQr: false }).catch((error) => {
      console.error(`Falha ao iniciar sessao WhatsApp ${sessionPath}:`, error);
    });
  }
}

export function getWhatsAppConnectionStatus(accountJid?: string | null, sessionPath?: string | null) {
  const session = resolveSessionForAccount(accountJid, sessionPath || (accountJid ? null : activeSessionPath));
  const currentUserId = session.connected && session.sock?.user?.id ? normalizeChatJid(session.sock.user.id) : "";
  const currentUserPhone = currentUserId ? jidToPhone(currentUserId) : "";
  const currentUserName = currentAccountName(session);

  return {
    connected: session.connected,
    started: session.started,
    sessionPath: session.sessionPath,
    userId: currentUserId || null,
    userPhone: currentUserPhone || null,
    userName: currentUserName || null,
    historySyncActive: isHistorySyncActive(session),
    historySyncProgress: session.historySyncProgress,
    historySyncImportedCount: session.historySyncImportedCount,
    historySyncMessage: session.historySyncMessage,
    qrAvailable: Boolean(session.latestQr),
    qrUpdatedAt: session.latestQrAt ? session.latestQrAt.toISOString() : null,
  };
}

export function listConnectedWhatsAppAccounts() {
  return listSessionStates()
    .filter((session) => session.connected && session.selfJid)
    .map((session) => ({
      waJid: session.selfJid,
      displayName: currentAccountName(session) || null,
      sessionPath: session.sessionPath,
    }));
}

export function getCurrentWhatsAppAccount(accountJid?: string | null, sessionPath?: string | null) {
  const session = resolveSessionForAccount(accountJid, sessionPath || (accountJid ? null : activeSessionPath));
  const currentUserId = session.sock?.user?.id ? normalizeChatJid(session.sock.user.id) : "";
  return {
    waJid: currentUserId || "",
    displayName: currentAccountName(session) || null,
    sessionPath: session.sessionPath,
  };
}

export async function getProfilePictureUrl(waJid: string, accountJid?: string | null, sessionPath?: string | null): Promise<string | null> {
  const session = resolveSessionForAccount(accountJid, sessionPath || (accountJid ? null : activeSessionPath));
  return getContactAvatarUrl(session, waJid);
}

export async function getConnectedAccountAvatarUrl(accountJid?: string | null, sessionPath?: string | null): Promise<string | null> {
  const session = resolveSessionForAccount(accountJid, sessionPath || (accountJid ? null : activeSessionPath));
  const currentUserId = session.sock?.user?.id ? normalizeChatJid(session.sock.user.id) : "";
  if (!currentUserId) {
    return null;
  }

  return getContactAvatarUrl(session, currentUserId);
}

export function getLatestQr(accountJid?: string | null, sessionPath?: string | null) {
  const session = resolveSessionForAccount(accountJid, sessionPath);
  return {
    qr: session.latestQr || null,
    updatedAt: session.latestQrAt ? session.latestQrAt.toISOString() : null,
  };
}

export async function sendWhatsAppText({ to, message, accountJid }: SendWhatsAppTextInput): Promise<WAMessage> {
  const session = resolveSessionForAccount(accountJid, accountJid ? null : activeSessionPath);
  if (!session.sock || !session.connected) {
    throw new Error("WhatsApp nao conectado. Escaneie o QR no terminal primeiro.");
  }

  const jid = phoneToJid(to);
  const response = await session.sock.sendMessage(jid, { text: message });
  if (!response) {
    throw new Error("Falha ao enviar mensagem no Baileys.");
  }

  return response;
}

export async function setWhatsAppTypingPresence(input: {
  to: string;
  accountJid?: string | null;
  active: boolean;
}): Promise<() => Promise<void>> {
  const session = resolveSessionForAccount(input.accountJid, input.accountJid ? null : activeSessionPath);
  if (!session.sock || !session.connected) {
    return async () => undefined;
  }

  const jid = phoneToJid(input.to);
  let stopped = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const sendPresence = async (state: "composing" | "paused"): Promise<void> => {
    if (!session.sock || !session.connected) return;
    await session.sock.sendPresenceUpdate(state, jid);
  };

  if (input.active) {
    await sendPresence("composing").catch(() => undefined);
    heartbeatTimer = setInterval(() => {
      if (stopped || !session.sock || !session.connected) return;
      void sendPresence("composing").catch(() => undefined);
    }, 4_000);
  } else {
    await sendPresence("paused").catch(() => undefined);
  }

  return async () => {
    if (stopped) return;
    stopped = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    await sendPresence("paused").catch(() => undefined);
  };
}

export async function subscribeWhatsAppPresence(input: {
  chatJid: string;
  accountJid?: string | null;
}): Promise<boolean> {
  const session = resolveSessionForAccount(input.accountJid, input.accountJid ? null : activeSessionPath);
  if (!session.sock || !session.connected) {
    return false;
  }

  const jid = normalizeChatJid(String(input.chatJid || ""));
  if (!jid || !isDirectChatJid(jid)) {
    return false;
  }

  await session.sock.presenceSubscribe(jid).catch(() => undefined);
  await session.sock.sendPresenceUpdate("available").catch(() => undefined);
  return true;
}

export async function sendWhatsAppAudio(input: SendWhatsAppAudioInput): Promise<WAMessage> {
  const session = resolveSessionForAccount(input.accountJid, input.accountJid ? null : activeSessionPath);
  if (!session.sock || !session.connected) {
    throw new Error("WhatsApp nao conectado. Escaneie o QR no terminal primeiro.");
  }

  const jid = phoneToJid(input.to);
  const response = await session.sock.sendMessage(jid, {
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
  const session = resolveSessionForAccount(input.accountJid, input.accountJid ? null : activeSessionPath);
  if (!session.sock || !session.connected) {
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

  const response = await session.sock.sendMessage(jid, payload as any);
  if (!response) {
    throw new Error("Falha ao enviar midia no Baileys.");
  }

  return response;
}

export async function disconnectWhatsAppSession(sessionPath?: string): Promise<void> {
  const session = resolveSessionForAccount(null, sessionPath || activeSessionPath);
  try {
    session.syncOnNextConnect = false;
    await teardownCurrentSocket(session, true);
  } finally {
    finishHistorySync(session, 0, "Sessao desconectada. Conecte novamente para continuar.");
    await resetAuthSessionFiles(session.sessionPath);
  }
}

export async function requestWhatsAppConnect(sessionPath?: string): Promise<void> {
  const session = getOrCreateSession(sessionPath || activeSessionPath);
  activeSessionPath = session.sessionPath;
  session.syncOnNextConnect = false;
  await teardownCurrentSocket(session, true);
  session.reconnectAttempts = 0;
  session.reconnectWindowStartedAt = 0;
  session.hasOpenedConnection = false;
  session.historySyncMessage =
    "Leia o novo QR code. O app vai mostrar apenas as conversas ja salvas no banco e as novas mensagens recebidas daqui para frente.";
  await resetAuthSessionFiles(session.sessionPath);
  await startWhatsAppSession(true, { sessionPath: session.sessionPath, allowQr: true });
}

export async function requestWhatsAppHistorySync(sessionPath?: string): Promise<void> {
  const session = getOrCreateSession(sessionPath || activeSessionPath);
  session.historySyncMessage =
    "Sincronizacao solicitada. O app vai remover a conexao atual, gerar um novo QR code e sincronizar automaticamente apos a leitura.";
  session.syncOnNextConnect = true;
  await teardownCurrentSocket(session, true);
  session.reconnectAttempts = 0;
  session.reconnectWindowStartedAt = 0;
  session.hasOpenedConnection = false;
  await resetAuthSessionFiles(session.sessionPath);
  await startWhatsAppSession(true, { sessionPath: session.sessionPath, allowQr: true });
}
