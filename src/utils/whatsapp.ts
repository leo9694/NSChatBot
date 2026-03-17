export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizePhoneForWhats(phone: string): string {
  const phoneDigits = normalizePhone(phone);
  if (!phoneDigits.startsWith("55")) {
    return phoneDigits;
  }

  const national = phoneDigits.slice(2);
  // BR celular com nono digito: 55 + DDD(2) + 9 + numero(8)
  if (national.length === 11 && national[2] === "9") {
    return `55${national.slice(0, 2)}${national.slice(3)}`;
  }

  return phoneDigits;
}

export function phoneToJid(phone: string): string {
  if (phone.includes("@")) {
    return normalizeChatJid(phone);
  }

  const clean = normalizePhoneForWhats(phone);
  return clean.includes("@s.whatsapp.net") ? clean : `${clean}@s.whatsapp.net`;
}

export function jidToPhone(jid: string): string {
  return jid.replace(/@(s\.whatsapp\.net|lid)$/, "").replace(/\D/g, "");
}

export function isDirectChatJid(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

export function normalizeChatJid(jid: string): string {
  const [rawUser, rawDomain] = jid.split("@");
  const domain = rawDomain || "s.whatsapp.net";
  const user = (rawUser || "").split(":")[0];
  return `${user}@${domain}`;
}

function unwrapMessage(message: any): any {
  let current = message;

  // Baileys can wrap real content in layered envelopes.
  while (current && typeof current === "object") {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }

    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }

    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }

    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }

    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }

    break;
  }

  return current;
}

export function getUnwrappedMessage(message: any): any {
  return unwrapMessage(message);
}

export function extractImagePreviewDataUrl(message: any): string | null {
  const msg = unwrapMessage(message);
  const thumb = msg?.imageMessage?.jpegThumbnail;
  if (!thumb) return null;

  try {
    const buffer = typeof thumb === "string" ? Buffer.from(thumb, "base64") : Buffer.from(thumb);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export function extractMessageText(message: any): string {
  const msg = unwrapMessage(message);

  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.templateMessage?.hydratedTemplate?.hydratedContentText ||
    msg?.templateMessage?.hydratedTemplate?.hydratedFooterText ||
    msg?.templateMessage?.fourRowTemplate?.content?.text ||
    msg?.templateMessage?.fourRowTemplate?.footer?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.fileName ||
    msg?.documentMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.listResponseMessage?.title ||
    msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg?.contactsArrayMessage?.contacts?.[0]?.displayName ||
    (msg?.reactionMessage ? "[reacao]" : "") ||
    (msg?.audioMessage ? "[audio]" : "") ||
    (msg?.imageMessage ? "[imagem]" : "") ||
    (msg?.videoMessage ? "[video]" : "") ||
    (msg?.documentMessage ? "[documento]" : "") ||
    (msg?.stickerMessage ? "[figurinha]" : "") ||
    (msg?.locationMessage ? "[localizacao]" : "") ||
    (msg?.liveLocationMessage ? "[localizacao ao vivo]" : "") ||
    (msg?.contactMessage ? "[contato]" : "") ||
    (msg?.pollCreationMessage ? "[enquete]" : "") ||
    (msg?.pollUpdateMessage ? "[voto em enquete]" : "") ||
    "[mensagem sem texto]"
  );
}

export function extractQuotedContext(message: any): { stanzaId: string | null; body: string | null } {
  const msg = unwrapMessage(message);
  const contextInfo =
    msg?.extendedTextMessage?.contextInfo ||
    msg?.imageMessage?.contextInfo ||
    msg?.videoMessage?.contextInfo ||
    msg?.documentMessage?.contextInfo ||
    msg?.buttonsResponseMessage?.contextInfo ||
    msg?.listResponseMessage?.contextInfo ||
    null;

  const stanzaId = String(contextInfo?.stanzaId || "").trim() || null;
  const quotedMessage = contextInfo?.quotedMessage || null;
  if (!quotedMessage) {
    return { stanzaId, body: null };
  }

  const body = extractMessageText(quotedMessage);
  return {
    stanzaId,
    body: body && body !== "[mensagem sem texto]" ? body : null,
  };
}

export function detectMessageType(message: any): string {
  const msg = unwrapMessage(message);

  if (!msg || typeof msg !== "object") {
    return "unknown";
  }

  const keys = Object.keys(msg);
  return keys.length > 0 ? keys[0] : "unknown";
}

export function hasConversationContent(message: any): boolean {
  const msg = unwrapMessage(message);
  if (!msg || typeof msg !== "object") {
    return false;
  }

  const ignoredTypes = new Set([
    "protocolMessage",
    "senderKeyDistributionMessage",
    "messageContextInfo",
  ]);

  const type = detectMessageType(msg);
  return !ignoredTypes.has(type);
}
