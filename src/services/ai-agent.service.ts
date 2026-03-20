import { saveOutboundMessage } from "../repositories/messages.repository";
import {
  createAiOrder,
  createAiSchedule,
  findAiScheduleConflict,
  getAiAccountSettings,
  getConversationAiContext,
  listActiveAiSchedulesForConversation,
  listAiSchedulesForDate,
  listConversationMessagesForAi,
  rescheduleAiSchedule,
  updatePendingAiSchedule,
  updatePendingAiOrder,
  upsertConversationAiMemory,
} from "../repositories/ai.repository";
import { clearConversationAiRescheduleContext, setConversationAiRescheduleContext } from "../repositories/conversations.repository";
import { getWhatsAppAccountById } from "../repositories/accounts.repository";
import { listProductsForAgentDetailedContext } from "../repositories/products.repository";
import { generateAiSalesReply } from "./openai.service";
import { loadMediaBufferFromUrl } from "./media.service";
import { sendWhatsAppMedia, sendWhatsAppText, setWhatsAppTypingPresence } from "./whatsapp.service";

const processingConversations = new Set<string>();
const queuedConversations = new Set<string>();
const recentAiReplies = new Map<string, { body: string; at: number }>();
const customerTurnTimers = new Map<string, NodeJS.Timeout>();
const customerTurnDeadlines = new Map<string, number>();
const customerTypingActive = new Map<string, boolean>();
const customerTypingLastActivityAt = new Map<string, number>();
const customerTypingLastStoppedAt = new Map<string, number>();
const customerLastActivityAt = new Map<string, number>();
const GENERIC_PRODUCT_NAME_PARTS = new Set(["semente", "sementes", "produto", "produtos", "servico", "servicos"]);
const CUSTOMER_TURN_WAIT_MS = 5_000;
const CUSTOMER_TYPING_STALE_MS = 12_000;

interface HandleInboundAiAutomationOptions {
  forceLatestCustomerMessage?: boolean;
}

let inboundAiAutomationRunner: (
  conversationId: string,
  options?: HandleInboundAiAutomationOptions,
) => Promise<{ ok: boolean; replied: boolean; reason?: string }> = handleInboundAiAutomation;

function clearCustomerTurnTimer(conversationId: string): void {
  const existing = customerTurnTimers.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    customerTurnTimers.delete(conversationId);
  }
  customerTurnDeadlines.delete(conversationId);
}

export function scheduleInboundAiAutomation(
  conversationId: string,
  options?: { delayMs?: number; reason?: string },
): void {
  const delayMs = Math.max(500, Number(options?.delayMs || CUSTOMER_TURN_WAIT_MS));
  clearCustomerTurnTimer(conversationId);
  customerTurnDeadlines.set(conversationId, Date.now() + delayMs);

  const timer = setTimeout(() => {
    const now = Date.now();
    const typingActive = customerTypingActive.get(conversationId) === true;
    const lastTypingActivityAt = customerTypingLastActivityAt.get(conversationId) || 0;
    const lastTypingStoppedAt = customerTypingLastStoppedAt.get(conversationId) || 0;
    const lastCustomerActivityAt = customerLastActivityAt.get(conversationId) || 0;

    if (typingActive) {
      if (lastTypingActivityAt > 0 && now - lastTypingActivityAt > CUSTOMER_TYPING_STALE_MS) {
        customerTypingActive.set(conversationId, false);
        customerTypingLastStoppedAt.set(conversationId, now);
        customerLastActivityAt.set(conversationId, now);
      } else {
        scheduleInboundAiAutomation(conversationId, {
          delayMs: 1_000,
          reason: "customer_still_typing",
        });
        return;
      }
    }

    const turnAnchorAt = Math.max(lastCustomerActivityAt, lastTypingStoppedAt, lastTypingActivityAt);
    if (turnAnchorAt > 0) {
      const remainingWait = CUSTOMER_TURN_WAIT_MS - (now - turnAnchorAt);
      if (remainingWait > 0) {
        scheduleInboundAiAutomation(conversationId, {
          delayMs: remainingWait,
          reason: "waiting_for_customer_turn_end",
        });
        return;
      }
    }

    customerTurnTimers.delete(conversationId);
    customerTurnDeadlines.delete(conversationId);
    void inboundAiAutomationRunner(conversationId, { forceLatestCustomerMessage: true }).catch(() => undefined);
  }, delayMs);

  customerTurnTimers.set(conversationId, timer);
}

export function registerCustomerMessageActivity(conversationId: string): void {
  const now = Date.now();
  customerLastActivityAt.set(conversationId, now);
  scheduleInboundAiAutomation(conversationId, { delayMs: CUSTOMER_TURN_WAIT_MS, reason: "customer_message" });
}

export function registerCustomerTypingActivity(conversationId: string): void {
  const now = Date.now();
  customerTypingActive.set(conversationId, true);
  customerTypingLastActivityAt.set(conversationId, now);
  customerLastActivityAt.set(conversationId, now);
  scheduleInboundAiAutomation(conversationId, { delayMs: CUSTOMER_TURN_WAIT_MS, reason: "customer_typing" });
}

export function registerCustomerTypingStopped(conversationId: string): void {
  const now = Date.now();
  customerTypingActive.set(conversationId, false);
  customerTypingLastStoppedAt.set(conversationId, now);
  customerLastActivityAt.set(conversationId, now);
  scheduleInboundAiAutomation(conversationId, { delayMs: CUSTOMER_TURN_WAIT_MS, reason: "customer_typing_stopped" });
}

export function __setInboundAiAutomationRunnerForTests(
  runner: (
    conversationId: string,
    options?: HandleInboundAiAutomationOptions,
  ) => Promise<{ ok: boolean; replied: boolean; reason?: string }>,
): void {
  inboundAiAutomationRunner = runner;
}

export function __resetInboundAiAutomationRunnerForTests(): void {
  inboundAiAutomationRunner = handleInboundAiAutomation;
}

export function __resetCustomerTurnStateForTests(): void {
  for (const timer of customerTurnTimers.values()) {
    clearTimeout(timer);
  }
  customerTurnTimers.clear();
  customerTurnDeadlines.clear();
  customerTypingActive.clear();
  customerTypingLastActivityAt.clear();
  customerTypingLastStoppedAt.clear();
  customerLastActivityAt.clear();
  processingConversations.clear();
  queuedConversations.clear();
}

function normalizeName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSignificantNameParts(value: string): string[] {
  return normalizeName(value)
    .split(/\s+/)
    .filter((part) => part.length >= 4 && !GENERIC_PRODUCT_NAME_PARTS.has(part));
}

function getTrailingCustomerMessages(messages: any[]): any[] {
  const trailing: any[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.from_me) {
      break;
    }
    trailing.unshift(message);
    if (trailing.length >= 6) {
      break;
    }
  }
  return trailing;
}

function buildCustomerTurnContext(messages: any[]): {
  turnMessages: any[];
  combinedBody: string;
  combinedQuotedBody: string;
} {
  const turnMessages = getTrailingCustomerMessages(messages);
  const combinedBody = turnMessages
    .map((item) => String(item?.body || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  const combinedQuotedBody = turnMessages
    .map((item) => (typeof item?.metadata?.quoted_body === "string" ? item.metadata.quoted_body.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    turnMessages,
    combinedBody,
    combinedQuotedBody,
  };
}

function wasAwaitingOrderConfirmation(messages: any[]): boolean {
  const recentOutbound = messages
    .filter((item) => item?.from_me)
    .slice(-4)
    .map((item) => normalizeText(String(item?.body || "")));

  return recentOutbound.some((body) =>
    /(quer que eu confirme|posso confirmar|se estiver certo[, ]*posso confirmar|se voce confirmar[, ]*eu gero|se você confirmar[, ]*eu gero|confirma que eu gero|pode confirmar o pedido|quer confirmar o pedido|preciso da sua confirmacao final|me responda com uma confirmacao)/.test(
      body,
    ),
  );
}

function hasDirectOrderConfirmation(body: string, quotedBody?: string | null, awaitingConfirmation = false): boolean {
  const text = normalizeText(body);
  const quoted = normalizeText(quotedBody || "");
  const combined = [text, quoted].filter(Boolean).join(" ");
  if (!combined) return false;

  const strongConfirmation =
    /\b(pode confirmar|pode gerar|pode registrar|pode fechar|pode prosseguir|pode seguir|pode agendar|gera o pedido|gerar o pedido|gera o agendamento|gerar o agendamento|confirmo|confirma|confirmar pedido|confirmar agendamento|fechar pedido|agendamento confirmado|pedido confirmado|fechado)\b/.test(
      combined,
    );
  if (strongConfirmation) return true;

  if (!awaitingConfirmation) {
    return false;
  }

  return /^(sim|isso|isso mesmo|pode ser|ok|okay|beleza|blz|certo|fechado|confirmo|confirmado|pode|ta|show|joia|aham|uhum)$/.test(text);
}

function hasDirectScheduleSelection(body: string, quotedBody?: string | null): boolean {
  const rawCombined = [String(body || ""), String(quotedBody || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const combined = normalizeText(rawCombined);
  if (!combined) return false;
  if (/^\s*(as|às)?\s*(?:[01]?\d|2[0-3]):[0-5]\d(?:h)?\s*$/.test(rawCombined)) {
    return true;
  }
  if (/^\s*(?:[01]?\d|2[0-3])h[0-5]\d\s*$/.test(rawCombined)) {
    return true;
  }

  const hasTimeReference =
    /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:h)?\b/.test(rawCombined) ||
    /\b(?:[01]?\d|2[0-3])h[0-5]\d\b/.test(rawCombined) ||
    /\b(?:[01]?\d|2[0-3])h\b/.test(rawCombined);
  const hasDateReference =
    /\b\d{4}-\d{2}-\d{2}\b/.test(combined) ||
    /\b(hoje|amanha|amanhã|depois de amanha|depois de amanhã|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|proxima semana|próxima semana)\b/.test(
      combined,
    );
  const hasAcceptance = [
    "vou querer",
    "quero esse",
    "quero este",
    "esse de",
    "esse as",
    "esse às",
    "pode ser",
    "pode agendar",
    "fechado",
    "confirmo",
    "confirmado",
    "pode confirmar",
  ].some((snippet) => combined.includes(normalizeText(snippet)));
  const hasBareTimeSelection =
    hasTimeReference &&
    (/^\s*(as|às)\s*\d/.test(rawCombined) ||
      /^\s*(?:[01]?\d|2[0-3]):[0-5]\d(?:h)?\s*$/.test(rawCombined) ||
      /^\s*(?:[01]?\d|2[0-3])h[0-5]\d\s*$/.test(rawCombined));

  return (hasAcceptance || hasBareTimeSelection) && (hasTimeReference || hasDateReference || hasBareTimeSelection);
}

function isScheduleRescheduleRequest(body: string, quotedBody?: string | null, previousCompanyBody?: string | null): boolean {
  const text = normalizeText([body, quotedBody, previousCompanyBody].filter(Boolean).join(" "));
  const rawText = [String(body || ""), String(quotedBody || ""), String(previousCompanyBody || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text && !rawText) {
    return false;
  }

  return (
    /\b(reagendar|reagendamento|remarcar|mudar horario|mudar data|mudar agendamento|alterar horario|alterar data|alterar agendamento|trocar horario|trocar data|outro horario|outro dia|antecipar|adiar)\b/.test(
      text,
    ) ||
    rawText.includes("reagendar") ||
    rawText.includes("reagendamento") ||
    rawText.includes("remarcar") ||
    rawText.includes("mudar horário") ||
    rawText.includes("mudar meu agendamento") ||
    rawText.includes("mudar o agendamento") ||
    rawText.includes("alterar o agendamento") ||
    rawText.includes("trocar horário") ||
    rawText.includes("outro horário")
  );
}

function buildOrderConfirmationPrompt(params: {
  items: Array<{ name?: string; quantity?: number | null }>;
  summary?: string | null;
  totalEstimate?: number | null;
  fulfillmentType?: string | null;
  paymentMethod?: string | null;
}): string {
  const lines: string[] = ["Antes de gerar o pedido, preciso da sua confirmação final."];
  const itemLines = Array.isArray(params.items)
    ? params.items
        .map((item) => {
          const name = String(item?.name || "").trim();
          const quantity = Number(item?.quantity || 0);
          if (!name) return "";
          if (quantity > 0) return `- ${quantity}x ${name}`;
          return `- ${name}`;
        })
        .filter(Boolean)
    : [];

  if (itemLines.length) {
    lines.push("", "Resumo do pedido:");
    lines.push(...itemLines);
  } else if (String(params.summary || "").trim()) {
    lines.push("", `Resumo: ${String(params.summary || "").trim()}`);
  }

  if (params.totalEstimate !== null && params.totalEstimate !== undefined) {
    lines.push(`Total estimado: R$ ${Number(params.totalEstimate).toFixed(2).replace(".", ",")}`);
  }
  if (String(params.fulfillmentType || "").trim()) {
    lines.push(`Entrega/retirada: ${String(params.fulfillmentType || "").trim()}`);
  }
  if (String(params.paymentMethod || "").trim()) {
    lines.push(`Pagamento: ${String(params.paymentMethod || "").trim()}`);
  }

  lines.push("", "Se estiver tudo certo, me responda com uma confirmação, por exemplo: \"sim\", \"pode confirmar\" ou \"pode gerar\".");
  return lines.join("\n");
}

function buildScheduleConfirmationPrompt(params: {
  serviceName?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  durationMinutes?: number | null;
}): string {
  const lines: string[] = ["Antes de confirmar o agendamento, preciso da sua confirmação final."];
  if (String(params.serviceName || "").trim()) {
    lines.push("", `Serviço: ${String(params.serviceName || "").trim()}`);
  }
  if (String(params.scheduledDate || "").trim() || String(params.scheduledTime || "").trim()) {
    const when = [formatShortBrDate(params.scheduledDate), String(params.scheduledTime || "").trim()].filter(Boolean).join(" às ");
    lines.push(`Data e horário: ${when}`);
  }
  if (Number.isFinite(Number(params.durationMinutes))) {
    lines.push(`Duração média: ${Math.max(1, Math.round(Number(params.durationMinutes)))} min`);
  }
  lines.push("", "Se estiver tudo certo, me responda com uma confirmação para eu gerar o agendamento pendente.");
  return lines.join("\n");
}

function indicatesQuotedOrderIntent(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;
  return (
    /(quero|queria|vou querer|pode colocar|coloca|inclui|incluir|adiciona|adicionar|separa|reservar)/.test(text) &&
    /\b(desse|desses|desse ai|desse aí|esse|essa|esses|essas)\b/.test(text)
  );
}

function isQuotedSelectionIntent(body: string, quotedBody?: string | null): boolean {
  const text = normalizeText(body);
  const quoted = normalizeText(quotedBody || "");
  if (!text || !quoted) return false;

  return (
    indicatesQuotedOrderIntent(text) ||
    /^(esse|essa|esse mesmo|essa mesma|quero esse|quero essa|vou querer esse|vou querer essa|quero dois desses|quero duas dessas|mais desse|mais dessa)$/.test(text)
  );
}

function isShortContextReply(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;
  return (
    /^(sim|isso|isso mesmo|pode ser|pode|ok|okay|beleza|blz|certo|fechado|confirmo|confirmado|ta|show|joia|aham|uhum|nao|quero|tenho interesse)$/.test(text) ||
    /^(e esse|e essa|esse|essa|sobre isso|mais desse|mais dessa)$/i.test(text)
  );
}

function findLastCompanyMessageBeforeTurn(messages: any[], turnMessages: any[]): any | null {
  const firstTurnMessageId = turnMessages[0]?.id || null;
  const searchPool = firstTurnMessageId
    ? messages.slice(0, Math.max(0, messages.findIndex((item) => item?.id === firstTurnMessageId)))
    : messages;

  for (let index = searchPool.length - 1; index >= 0; index -= 1) {
    const item = searchPool[index];
    if (item?.from_me) {
      return item;
    }
  }

  return null;
}

function buildAiTurnBody(body: string, quotedBody?: string | null, previousCompanyBody?: string | null): string {
  const cleanBody = String(body || "").trim();
  const cleanQuoted = String(quotedBody || "").trim();
  const cleanPreviousCompany = String(previousCompanyBody || "").trim();
  if (!cleanQuoted) {
    if (isShortContextReply(cleanBody) && cleanPreviousCompany) {
      return `${cleanBody}\n[Última mensagem da empresa: ${cleanPreviousCompany}]`;
    }
    return cleanBody;
  }

  if (isQuotedSelectionIntent(cleanBody, cleanQuoted)) {
    return `${cleanBody}\n[Item citado pelo cliente: ${cleanQuoted}]`;
  }

  if (isShortQuotedFollowup(cleanBody)) {
    return `${cleanBody}\n[Referência citada: ${cleanQuoted}]`;
  }

  if (isShortContextReply(cleanBody) && cleanPreviousCompany) {
    return `${cleanBody}\n[Referência citada: ${cleanQuoted}]\n[Última mensagem da empresa: ${cleanPreviousCompany}]`;
  }

  return cleanBody;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldSuppressDuplicateReply(conversationId: string, body: string): boolean {
  const normalizedBody = String(body || "").trim();
  if (!normalizedBody) return false;

  const existing = recentAiReplies.get(conversationId);
  const now = Date.now();
  if (existing && existing.body === normalizedBody && now - existing.at <= 5000) {
    return true;
  }

  recentAiReplies.set(conversationId, { body: normalizedBody, at: now });
  return false;
}

function pickFirstFilled<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function hasCompleteDeliveryAddress(value: string | null | undefined): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = normalizeText(text);
  const hasCity =
    /\bcidade\b/.test(normalized) ||
    /\bcep\b/.test(normalized) ||
    /-\s*[a-z]{2}\b/.test(normalized);
  const hasStreet =
    /\brua\b/.test(normalized) ||
    /\bavenida\b/.test(normalized) ||
    /\bav\b/.test(normalized) ||
    /\btravessa\b/.test(normalized) ||
    /\balameda\b/.test(normalized) ||
    /\brodovia\b/.test(normalized);
  const hasNoNumber =
    /\bsem numero\b/.test(normalized) ||
    /\bsem numero definido\b/.test(normalized) ||
    /\bsem n[ºo°]?\b/.test(normalized) ||
    /\bs\/n\b/.test(normalized) ||
    /\bsn\b/.test(normalized) ||
    /\bnao tem numero\b/.test(normalized) ||
    /\bnão tem numero\b/.test(normalized) ||
    /\bnao sei o numero\b/.test(normalized) ||
    /\bnão sei o numero\b/.test(normalized) ||
    /\bo numero da casa eu nao sei\b/.test(normalized) ||
    /\bo numero da casa eu não sei\b/.test(normalized) ||
    /\bnumero da casa nao sei\b/.test(normalized) ||
    /\bnumero da casa não sei\b/.test(normalized);
  const hasNumber =
    /\b(?:n[ºo°]?|numero)\s*[:\-]?\s*\d+\b/.test(normalized) ||
    /\b(?:rua|avenida|av|travessa|alameda|rodovia)[^,\n]{0,80},\s*\d+\b/.test(normalized) ||
    /\b(?:rua|avenida|av|travessa|alameda|rodovia)[^,\n]{0,80}\s+\d+\b/.test(normalized);
  const hasDistrict = /\bbairro\b/.test(normalized) || /\bjd\b/.test(normalized) || /\bjardim\b/.test(normalized);
  const hasReference =
    /\breferencia\b/.test(normalized) ||
    /\breferência\b/.test(normalized) ||
    /\bponto de referencia\b/.test(normalized) ||
    /\bponto de referência\b/.test(normalized) ||
    /\bem frente\b/.test(normalized) ||
    /\bde frente\b/.test(normalized) ||
    /\bquase em frente\b/.test(normalized) ||
    /\bquase de frente\b/.test(normalized) ||
    /\bao lado\b/.test(normalized) ||
    /\bdo lado\b/.test(normalized) ||
    /\bproximo\b/.test(normalized) ||
    /\bpróximo\b/.test(normalized) ||
    /\bperto\b/.test(normalized) ||
    /\bperto do\b/.test(normalized) ||
    /\bperto da\b/.test(normalized) ||
    /\bantes do\b/.test(normalized) ||
    /\bantes da\b/.test(normalized) ||
    /\bdepois do\b/.test(normalized) ||
    /\bdepois da\b/.test(normalized) ||
    /\besquina\b/.test(normalized) ||
    /\bcasa verde\b/.test(normalized) ||
    /\bcasa azul\b/.test(normalized) ||
    /\bportao verde\b/.test(normalized) ||
    /\bportao azul\b/.test(normalized) ||
    /\bnao tem erro\b/.test(normalized) ||
    /\bnão tem erro\b/.test(normalized) ||
    /\bfacil de achar\b/.test(normalized) ||
    /\bfácil de achar\b/.test(normalized);
  return hasCity && hasStreet && (hasNumber || hasNoNumber) && hasDistrict && hasReference;
}

function textIndicatesNoNumber(value: string | null | undefined): boolean {
  const normalized = normalizeText(String(value || ""));
  if (!normalized) return false;
  return (
    /\bsem numero\b/.test(normalized) ||
    /\bsem numero definido\b/.test(normalized) ||
    /\bsem n[ºo°]?\b/.test(normalized) ||
    /\bs\/n\b/.test(normalized) ||
    /\bsn\b/.test(normalized) ||
    /\bnao tem numero\b/.test(normalized) ||
    /\bnão tem numero\b/.test(normalized) ||
    /\bnao sei o numero\b/.test(normalized) ||
    /\bnão sei o numero\b/.test(normalized) ||
    /\bo numero da casa eu nao sei\b/.test(normalized) ||
    /\bo numero da casa eu não sei\b/.test(normalized) ||
    /\bnumero da casa nao sei\b/.test(normalized) ||
    /\bnumero da casa não sei\b/.test(normalized)
  );
}

function buildDeliveryAddressForm() {
  return [
    "Para entrega, me envie estes dados assim:",
    "",
    "Cidade:",
    "Rua:",
    "Número: (se não tiver, informe: sem número)",
    "Bairro:",
    "Ponto de referência:",
  ].join("\n");
}

function parseStructuredDeliveryAddress(value: string | null | undefined) {
  const source = String(value || "").trim();
  const parts: {
    city: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    reference: string | null;
  } = {
    city: null,
    street: null,
    number: null,
    neighborhood: null,
    reference: null,
  };

  if (!source) {
    return parts;
  }

  const segments = source
    .split(/[\n;|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^(cidade|rua|numero|número|bairro|ponto de referencia|ponto de referência|referencia|referência)\s*:\s*(.+)$/i);
    if (!match) continue;
    const label = normalizeText(match[1]);
    const valuePart = String(match[2] || "").trim();
    if (!valuePart) continue;
    if (label === "cidade") parts.city = valuePart;
    if (label === "rua") parts.street = valuePart;
    if (label === "numero" || label === "número") parts.number = valuePart;
    if (label === "bairro") parts.neighborhood = valuePart;
    if (label.includes("referencia")) parts.reference = valuePart;
  }

  return parts;
}

function extractDeliveryReferenceFromText(value: string | null | undefined): string | null {
  const source = String(value || "").trim();
  if (!source) return null;

  const explicitMatch = source.match(
    /(?:ponto de refer(?:e|ê)n(?:c|ç)ia|refer(?:e|ê)n(?:c|ç)ia)\s*[:\-]\s*([^\n.;]+)/iu,
  );
  let reference = explicitMatch?.[1]?.trim() || "";

  if (!reference) {
    const contextualMatch = source.match(
      /((?:quase em frente|quase de frente|em frente|de frente|ao lado|do lado|perto do|perto da|antes do|antes da|depois do|depois da)[^\n.;]*)/iu,
    );
    reference = contextualMatch?.[1]?.trim() || "";
  }

  const colorMatch = source.match(/((?:casa|port[aã]o)\s+(?:verde|azul|amarelo|branco|branca|preto|preta|rosa))/iu);
  if (colorMatch?.[1]) {
    const colorText = colorMatch[1].trim();
    if (!reference) {
      reference = colorText;
    } else if (!normalizeText(reference).includes(normalizeText(colorText))) {
      reference = `${reference}, ${colorText}`;
    }
  }

  if (!reference) return null;
  return reference.replace(/\s+/g, " ").trim();
}

function enrichDeliveryAddressWithCustomerText(
  currentAddress: string | null | undefined,
  customerText: string | null | undefined,
): string | null {
  const current = parseStructuredDeliveryAddress(currentAddress);
  const sourceText = String(customerText || "").trim();
  if (!sourceText) {
    return String(currentAddress || "").trim() || null;
  }

  if (!current.number) {
    if (textIndicatesNoNumber(sourceText)) {
      current.number = "sem número";
    }
  }

  if (!current.reference) {
    current.reference = extractDeliveryReferenceFromText(sourceText);
  }

  const orderedLines = [
    current.city ? `Cidade: ${current.city}` : "",
    current.street ? `Rua: ${current.street}` : "",
    current.number ? `Número: ${current.number}` : "",
    current.neighborhood ? `Bairro: ${current.neighborhood}` : "",
    current.reference ? `Ponto de referência: ${current.reference}` : "",
  ].filter(Boolean);

  if (!orderedLines.length) {
    return String(currentAddress || "").trim() || null;
  }

  return orderedLines.join("\n");
}

function buildMissingReferenceReply(
  deliveryAddress: string | null | undefined,
  customerText: string | null | undefined,
): string {
  const parsed = parseStructuredDeliveryAddress(deliveryAddress);
  const noNumber = textIndicatesNoNumber(customerText) || normalizeText(String(parsed.number || "")).includes("sem numero");
  const city = parsed.city || "";
  const street = parsed.street || "";
  const number = noNumber ? "sem número" : parsed.number || "";
  const neighborhood = parsed.neighborhood || "";

  return [
    "Falta só o ponto de referência para eu gerar o pedido.",
    "",
    "Confirma assim:",
    city ? `Cidade: ${city}` : "Cidade:",
    street ? `Rua: ${street}` : "Rua:",
    number ? `Número: ${number}` : "Número:",
    neighborhood ? `Bairro: ${neighborhood}` : "Bairro:",
    "Ponto de referência:",
    "",
    "Assim que você me enviar o ponto de referência, eu gero o pedido e deixo pendente de confirmação interna.",
  ].join("\n");
}

function hasDeliveryAddressForm(value: string | null | undefined): boolean {
  const normalized = normalizeText(String(value || ""));
  return (
    normalized.includes("cidade:") &&
    normalized.includes("rua:") &&
    normalized.includes("numero:") &&
    normalized.includes("bairro:") &&
    normalized.includes("ponto de referencia:")
  );
}

function isClosingMessage(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;

  const closingPatterns = [
    /^ok bot$/,
    /^ok[, ]*bot$/,
    /^beleza[, ]*bot$/,
    /^valeu[, ]*bot$/,
    /^fechou[, ]*bot$/,
    /^blz[, ]*bot$/,
    /^nao[, ]*obrigado/,
    /^nao precisa/,
    /^so isso$/,
    /^somente isso$/,
    /^vou deixar para depois$/,
    /^vou ver depois$/,
    /^vejo depois$/,
    /^depois eu vejo$/,
    /^depois eu te chamo$/,
    /^depois eu volto$/,
    /^depois eu falo$/,
    /^vou pensar$/,
    /^vou analisar$/,
    /^ok[, ]*obrigado/,
    /^beleza[, ]*obrigado/,
    /^ta bom[, ]*obrigado/,
    /^ja resolveu/,
    /^ja resolvi/,
    /^obrigado$/,
    /^muito obrigado$/,
    /^agradeco$/,
    /^agradeco[, ]*obrigado/,
  ];

  return closingPatterns.some((pattern) => pattern.test(text));
}

function isShortAcknowledgeMessage(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;
  return /^(ok|ok bot|beleza|beleza bot|valeu|valeu bot|fechou|fechou bot|blz|blz bot|certo|tudo certo)$/i.test(
    String(body || "").trim(),
  ) || /^(ok|ok bot|beleza|beleza bot|valeu|valeu bot|fechou|fechou bot|blz|blz bot|certo|tudo certo)$/.test(text);
}

function isStandaloneAgentMention(body: string, agentName?: string | null): boolean {
  const normalizedBody = normalizeText(body).replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const normalizedAgentName = normalizeText(String(agentName || "")).replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (!normalizedBody || !normalizedAgentName) return false;

  return (
    normalizedBody === normalizedAgentName ||
    normalizedBody === `ok ${normalizedAgentName}` ||
    normalizedBody === `beleza ${normalizedAgentName}` ||
    normalizedBody === `valeu ${normalizedAgentName}` ||
    normalizedBody === `fechou ${normalizedAgentName}` ||
    normalizedBody === `blz ${normalizedAgentName}`
  );
}

function isGreetingMessage(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;
  return /^(oi|ola|olá|bom dia|boa tarde|boa noite|opa|e ai|e aí|tudo bem)/.test(text);
}

function isDiscountQuestion(body: string): boolean {
  const text = normalizeText(body);
  return (
    text.includes("desconto") ||
    text.includes("promocao") ||
    text.includes("promocao") ||
    text.includes("valor menor") ||
    text.includes("preco melhor") ||
    text.includes("abaixa o valor")
  );
}

function detectUnrealisticSalesRequest(input: {
  body: string;
  catalog: Array<{ name: string; stock: number | string | null; type: string }>;
}) {
  const text = normalizeText(input.body);
  const requestedQuantityMatch = text.match(/\b(\d{4,})\b/);
  const requestedQuantity = requestedQuantityMatch ? Number(requestedQuantityMatch[1]) : null;
  const asksFreeShipping = text.includes("frete gratis") || text.includes("frete grátis");
  const asksUnsupportedDestination = text.includes("japao") || text.includes("japão") || text.includes("lua");
  const maxStock = input.catalog.reduce((highest, item) => {
    if (item.type === "service") return highest;
    const stock = Number(item.stock || 0);
    return stock > highest ? stock : highest;
  }, 0);

  if (!requestedQuantity && !asksFreeShipping && !asksUnsupportedDestination) {
    return null;
  }

  return { requestedQuantity, asksFreeShipping, asksUnsupportedDestination, maxStock };
}

function buildUnrealisticSalesReply(
  mood: "amigavel" | "informal" | "formal",
  details: { requestedQuantity: number | null; asksFreeShipping: boolean; asksUnsupportedDestination: boolean; maxStock: number },
) {
  const lines: string[] = [];
  if (details.requestedQuantity && details.maxStock > 0 && details.requestedQuantity > details.maxStock) {
    lines.push(`No momento eu não consigo fechar essa quantidade. Hoje temos até ${details.maxStock} unidade(s) disponível(is) para esse item.`);
  }
  if (details.asksFreeShipping) {
    lines.push("Também não tenho permissão para oferecer frete grátis por aqui.");
  }
  if (details.asksUnsupportedDestination) {
    lines.push("Também não consigo confirmar esse destino por aqui sem validar a entrega com a equipe.");
  }
  if (mood === "formal") {
    lines.push("Se desejar, informe uma quantidade viável e os dados corretos de entrega para eu seguir com o pedido.");
  } else if (mood === "amigavel") {
    lines.push("Se quiser, me passa uma quantidade viável e os dados corretos de entrega que eu sigo com você 😊");
  } else {
    lines.push("Se quiser, me diga uma quantidade viável e os dados corretos de entrega que eu sigo com o pedido.");
  }
  return lines.join("\n\n");
}

function isShortQuotedFollowup(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;
  return (
    /^sobre isso\??$/.test(text) ||
    /^e esse\??$/.test(text) ||
    /^e essa\??$/.test(text) ||
    /^esse\??$/.test(text) ||
    /^essa\??$/.test(text) ||
    /^sobre ele\??$/.test(text) ||
    /^sobre ela\??$/.test(text)
  );
}

function getAgentMood(value: string | null | undefined): "amigavel" | "informal" | "formal" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "amigavel" || normalized === "formal") return normalized;
  return "informal";
}

function buildClosingReply(mood: "amigavel" | "informal" | "formal") {
  if (mood === "amigavel") {
    return "Tudo certo. Fico por aqui 😊";
  }
  if (mood === "formal") {
    return "Tudo certo. Fico à disposição.";
  }
  return "Tudo certo. Fico por aqui.";
}

function buildOrderFallbackReply(input: {
  mood: "amigavel" | "informal" | "formal";
  updatedPendingOrder: boolean;
}) {
  if (input.updatedPendingOrder) {
    if (input.mood === "amigavel") {
      return "Perfeito. Ajustei seu pedido pendente e ele continua aguardando confirmação interna. Assim que for confirmado, eu te aviso por aqui 😊";
    }
    if (input.mood === "formal") {
      return "Perfeito. Seu pedido pendente foi ajustado e permanece aguardando confirmação interna. Assim que houver a confirmação, informarei por aqui.";
    }
    return "Perfeito. Ajustei seu pedido pendente e ele continua aguardando confirmação interna. Assim que for confirmado, eu te aviso por aqui.";
  }

  if (input.mood === "amigavel") {
    return "Perfeito. Registrei seu pedido e ele ficou pendente de confirmação interna. Assim que for confirmado, eu te aviso por aqui 😊";
  }
  if (input.mood === "formal") {
    return "Perfeito. Seu pedido foi registrado e ficou pendente de confirmação interna. Assim que houver a confirmação, informarei por aqui.";
  }
  return "Perfeito. Registrei seu pedido e ele ficou pendente de confirmação interna. Assim que for confirmado, eu te aviso por aqui.";
}

function buildScheduleFallbackReply(input: {
  mood: "amigavel" | "informal" | "formal";
  updatedPendingSchedule: boolean;
  reopenedConfirmedSchedule?: boolean;
}) {
  if (input.reopenedConfirmedSchedule) {
    if (input.mood === "amigavel") {
      return "Perfeito. Ajustei seu agendamento confirmado com o novo horário e ele voltou para pendente de confirmação interna. Assim que for confirmado de novo, eu te aviso por aqui 😊";
    }
    if (input.mood === "formal") {
      return "Perfeito. O agendamento confirmado foi ajustado com o novo horário e voltou para pendente de confirmação interna. Assim que houver a nova confirmação, informarei por aqui.";
    }
    return "Perfeito. Ajustei seu agendamento confirmado com o novo horário e ele voltou para pendente de confirmação interna. Assim que for confirmado de novo, eu te aviso por aqui.";
  }

  if (input.updatedPendingSchedule) {
    if (input.mood === "amigavel") {
      return "Perfeito. Ajustei seu agendamento pendente e ele continua aguardando confirmação interna. Assim que for confirmado, eu te aviso por aqui 😊";
    }
    if (input.mood === "formal") {
      return "Perfeito. Seu agendamento pendente foi ajustado e permanece aguardando confirmação interna. Assim que houver a confirmação, informarei por aqui.";
    }
    return "Perfeito. Ajustei seu agendamento pendente e ele continua aguardando confirmação interna. Assim que for confirmado, eu te aviso por aqui.";
  }

  if (input.mood === "amigavel") {
    return "Perfeito. Registrei seu agendamento e ele ficou pendente de confirmação interna. Assim que for confirmado, eu te aviso por aqui 😊";
  }
  if (input.mood === "formal") {
    return "Perfeito. Seu agendamento foi registrado e ficou pendente de confirmação interna. Assim que houver a confirmação, informarei por aqui.";
  }
  return "Perfeito. Registrei seu agendamento e ele ficou pendente de confirmação interna. Assim que for confirmado, eu te aviso por aqui.";
}

function wasAwaitingScheduleConfirmation(messages: any[]): boolean {
  const recentOutbound = messages
    .filter((item) => item?.from_me)
    .slice(-4)
    .map((item) => normalizeText(String(item?.body || "")));

  return recentOutbound.some((body) =>
    /(quer que eu confirme o agendamento|posso confirmar o agendamento|se voce confirmar[, ]*eu agendo|se você confirmar[, ]*eu agendo|pode confirmar o agendamento|quer confirmar o agendamento|preciso da sua confirmacao final do agendamento|me responda com uma confirmacao para agendar)/.test(
      body,
    ),
  );
}

function isValidScheduleDate(value: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function isValidScheduleTime(value: string | null | undefined): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

function getCurrentCuiabaDateIso(baseDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);
  const year = parts.find((item) => item.type === "year")?.value || "1970";
  const month = parts.find((item) => item.type === "month")?.value || "01";
  const day = parts.find((item) => item.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function getCurrentCuiabaTimeMinutes(baseDate = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Cuiaba",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(baseDate);
  const hour = Number(parts.find((item) => item.type === "hour")?.value || "0");
  const minute = Number(parts.find((item) => item.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

function addDaysToIsoDate(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortBrDate(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1].slice(-2)}`;
}

function formatIsoDatesInText(value: string | null | undefined): string {
  return String(value || "").replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year, month, day) => `${day}/${month}/${year.slice(-2)}`);
}

function parseBrScheduleDate(value: string | null | undefined, baseDate = new Date()): string | null {
  const raw = String(value || "").trim();
  const match = raw.match(/\b(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?\b/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (!Number.isFinite(day) || !Number.isFinite(month)) {
    return null;
  }

  if (!match[3]) {
    year = Number(getCurrentCuiabaDateIso(baseDate).slice(0, 4));
  } else if (String(match[3]).length === 2) {
    year = 2000 + year;
  }

  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (date.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

function formatWeekdayBr(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    weekday: "long",
  }).format(date);
}

function getNextWeekdayIso(baseDateIso: string, targetWeekday: number, forceNextWeek = false): string {
  const date = new Date(`${baseDateIso}T12:00:00Z`);
  const currentWeekday = date.getUTCDay();
  let delta = (targetWeekday - currentWeekday + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  if (forceNextWeek) {
    delta += 7;
  }
  return addDaysToIsoDate(baseDateIso, delta);
}

function resolveRelativeScheduleDate(rawValue: string | null | undefined, sourceText: string, baseDate = new Date()): string | null {
  if (isValidScheduleDate(rawValue)) {
    return String(rawValue || "").trim();
  }

  const explicitBrDate = parseBrScheduleDate(rawValue, baseDate) || parseBrScheduleDate(sourceText, baseDate);
  if (explicitBrDate) {
    return explicitBrDate;
  }

  const normalized = normalizeText([rawValue, sourceText].filter(Boolean).join(" "));
  const rawText = [String(rawValue || ""), String(sourceText || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!normalized) {
    return null;
  }

  const todayIso = getCurrentCuiabaDateIso(baseDate);
  if (/\bdepois de amanha\b/.test(normalized) || rawText.includes("depois de amanh?")) {
    return addDaysToIsoDate(todayIso, 2);
  }
  if (/\bamanha\b/.test(normalized) || rawText.includes("amanh?")) {
    return addDaysToIsoDate(todayIso, 1);
  }
  if (/\bhoje\b/.test(normalized)) {
    return todayIso;
  }

  const wantsNextWeek = /\b(proxima semana|semana que vem)\b/.test(normalized) || rawText.includes("pr?xima semana");
  const weekdays: Array<{ pattern: RegExp; index: number }> = [
    { pattern: /\bsegunda(?:-feira)?\b/, index: 1 },
    { pattern: /\bterca(?:-feira)?\b|\bterça(?:-feira)?\b/, index: 2 },
    { pattern: /\bquarta(?:-feira)?\b/, index: 3 },
    { pattern: /\bquinta(?:-feira)?\b/, index: 4 },
    { pattern: /\bsexta(?:-feira)?\b/, index: 5 },
    { pattern: /\bsabado\b|\bsábado\b/, index: 6 },
    { pattern: /\bdomingo\b/, index: 0 },
  ];

  for (const weekday of weekdays) {
    if (
      weekday.pattern.test(normalized) ||
      (weekday.index === 2 && rawText.includes("ter?a")) ||
      (weekday.index === 6 && rawText.includes("s?bado"))
    ) {
      return getNextWeekdayIso(todayIso, weekday.index, wantsNextWeek);
    }
  }

  return null;
}

export function __resolveRelativeScheduleDateForTests(
  rawValue: string | null | undefined,
  sourceText: string,
  baseDate = new Date(),
): string | null {
  return resolveRelativeScheduleDate(rawValue, sourceText, baseDate);
}

function buildScheduleSummary(input: {
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
}) {
  const durationPart = Number.isFinite(input.durationMinutes)
    ? ` | duração média: ${Math.round(Number(input.durationMinutes))} min`
    : "";
  return `${input.serviceName} | ${formatShortBrDate(input.scheduledDate)} às ${input.scheduledTime}${durationPart}`;
}

function buildScheduleConflictReply(input: {
  mood: "amigavel" | "informal" | "formal";
  conflict: { scheduled_date: string; scheduled_time: string; service_name?: string | null };
}) {
  const whenLabel = `${formatShortBrDate(String(input.conflict.scheduled_date || "").trim())} às ${String(input.conflict.scheduled_time || "").trim()}`;
  if (input.mood === "amigavel") {
    return `Nesse horário eu já tenho um agendamento registrado (${whenLabel}). Me passa outro horário que eu sigo com você 😊`;
  }
  if (input.mood === "formal") {
    return `Já existe um agendamento registrado para ${whenLabel}. Por favor, informe outro horário para que eu possa seguir com o agendamento.`;
  }
  return `Já existe um agendamento registrado para ${whenLabel}. Me passa outro horário que eu sigo com você.`;
}

function findSchedulableServiceMatch(
  catalog: Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    price: string;
    stock: number;
    image_url: string | null;
    schedule_enabled?: boolean;
    service_duration_minutes?: number | null;
  }>,
  preferredName: string | null | undefined,
  fallbackText: string,
) {
  const schedulableServices = catalog.filter(
    (item) => String(item.type || "").trim() === "service" && Boolean(item.schedule_enabled),
  );
  const targets = [String(preferredName || "").trim(), String(fallbackText || "").trim()].filter(Boolean);
  for (const target of targets) {
    const normalizedTarget = normalizeName(target);
    const direct = schedulableServices.find((item) => normalizeName(item.name) === normalizedTarget);
    if (direct) return direct;

    const partial = schedulableServices.find((item) => {
      const normalizedName = normalizeName(item.name);
      return normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
    });
    if (partial) return partial;

    const targetParts = getSignificantNameParts(target);
    if (targetParts.length) {
      const byParts = schedulableServices.find((item) => {
        const nameParts = getSignificantNameParts(item.name);
        return targetParts.every((part) => nameParts.includes(part));
      });
      if (byParts) return byParts;
    }
  }
  return null;
}

function findSchedulableServiceInConversationText(
  catalog: Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    price: string;
    stock: number;
    image_url: string | null;
    schedule_enabled?: boolean;
    service_duration_minutes?: number | null;
  }>,
  text: string,
) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return null;
  }

  const schedulableServices = catalog.filter(
    (item) => String(item.type || "").trim() === "service" && Boolean(item.schedule_enabled),
  );

  let bestMatch: (typeof schedulableServices)[number] | null = null;
  let bestScore = 0;
  for (const item of schedulableServices) {
    const normalizedName = normalizeName(item.name);
    const nameParts = getSignificantNameParts(item.name);
    let score = 0;

    if (normalizedText.includes(normalizedName)) {
      score += 100;
    }
    for (const part of nameParts) {
      if (normalizedText.includes(part)) {
        score += 20;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

function buildMissingImageReply(input: {
  mood: "amigavel" | "informal" | "formal";
  requestedName?: string | null;
}) {
  const itemName = String(input.requestedName || "").trim();
  const itemLabel = itemName ? ` de ${itemName}` : "";

  if (input.mood === "amigavel") {
    return `Ainda não tenho a imagem${itemLabel} cadastrada aqui no momento. Se quiser, posso te passar os detalhes do item por texto 😊`;
  }
  if (input.mood === "formal") {
    return `No momento, não há imagem${itemLabel} cadastrada no sistema. Se desejar, posso informar os detalhes do item por mensagem.`;
  }
  return `Ainda não tenho a imagem${itemLabel} cadastrada aqui no momento. Se quiser, posso te passar os detalhes do item por texto.`;
}

function buildOffTopicReply(mood: "amigavel" | "informal" | "formal") {
  if (mood === "amigavel") {
    return "Não consigo responder isso por aqui. Se quiser, posso seguir com produtos, pedidos ou suporte de venda 😊";
  }
  if (mood === "formal") {
    return "Não consigo responder isso por aqui. Se desejar, posso seguir com atendimento sobre produtos, pedidos ou suporte comercial.";
  }
  return "Não consigo responder isso por aqui. Se quiser, posso seguir com produtos, pedidos ou suporte de venda.";
}

function buildUnknownSalesReply(mood: "amigavel" | "informal" | "formal") {
  if (mood === "amigavel") {
    return "Não tenho essa informação no sistema no momento. Se você preferir, posso encaminhar para um agente humano 😊";
  }
  if (mood === "formal") {
    return "Não tenho essa informação disponível no sistema no momento. Se desejar, posso direcionar o atendimento para um agente humano.";
  }
  return "Não tenho essa informação no sistema no momento. Se preferir, posso encaminhar para um agente humano.";
}

function isCustomerScheduleInquiry(body: string, quotedBody?: string | null, previousCompanyBody?: string | null): boolean {
  const combined = normalizeText([body, quotedBody || "", previousCompanyBody || ""].filter(Boolean).join(" "));
  if (!combined) return false;

  const asksAboutOwnSchedules =
    /\b(quais|qual|quero saber|me fala|me diga|tenho|tem|possuo|mostrar|mostra)\b/.test(combined) &&
    /\b(agendamento|agendamentos|atendimento|atendimentos|horario marcado|horarios marcados|marcado|marcados|pendente|pendentes)\b/.test(combined);
  const directOwnScheduleQuestion =
    /\b(meus agendamentos|meus atendimentos|meu agendamento|meu atendimento|tenho agendamento|tenho atendimento|atendimentos eu tenho|agendamentos eu tenho|proximo atendimento|próximo atendimento|proximo agendamento|próximo agendamento)\b/.test(
      combined,
    );
  const pendingOnly =
    /\b(agendamento|agendamentos|atendimento|atendimentos)\b/.test(combined) && /\b(pendente|pendentes)\b/.test(combined);
  const markedOnly =
    /\b(marcado|marcados|confirmado|confirmados)\b/.test(combined) &&
    /\b(agendamento|agendamentos|atendimento|atendimentos)\b/.test(combined);

  if (!(asksAboutOwnSchedules || directOwnScheduleQuestion || pendingOnly || markedOnly)) {
    return false;
  }

  if (isScheduleRescheduleRequest(body, quotedBody, previousCompanyBody)) {
    return false;
  }

  return true;
}

function buildCustomerSchedulesReply(input: {
  mood: "amigavel" | "informal" | "formal";
  body: string;
  schedules: Array<{
    service_name: string | null;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
  }>;
}): string {
  const normalizedBody = normalizeText(input.body);
  const rawBody = String(input.body || "").toLowerCase();
  const onlyPending = /\bpendente|pendentes\b/.test(normalizedBody);
  const asksSingularOwnAppointment =
    /\b(qual|quando)\b/.test(normalizedBody) &&
    /\b(meu|minha)\b/.test(normalizedBody) &&
    /\b(agendamento|atendimento)\b/.test(normalizedBody) &&
    !/\b(quais|meus|minhas)\b/.test(normalizedBody);
  const wantsNext =
    /\b(proximo|próximo)\b/.test(normalizedBody) ||
    asksSingularOwnAppointment ||
    rawBody.includes("pr?ximo") ||
    rawBody.includes("pr�ximo");
  const baseSchedules = input.schedules.filter((item) => {
    if (onlyPending) {
      return String(item.status || "").trim() === "pending_confirmation";
    }
    return true;
  });

  if (!baseSchedules.length) {
    if (onlyPending) {
      return input.mood === "formal"
        ? "No momento, não encontrei agendamentos pendentes em seu nome por aqui."
        : "No momento eu não encontrei agendamentos pendentes seus por aqui.";
    }
    return input.mood === "formal"
      ? "No momento, não encontrei agendamentos ativos em seu nome por aqui."
      : "No momento eu não encontrei agendamentos seus em aberto por aqui.";
  }

  const targetSchedules = wantsNext ? baseSchedules.slice(0, 1) : baseSchedules.slice(0, 5);
  const lines = targetSchedules.map((item) => {
    const statusLabel = String(item.status || "").trim() === "confirmed" ? "Confirmado" : "Pendente";
    return `- ${String(item.service_name || "Atendimento").trim()} — ${formatShortBrDate(item.scheduled_date)} às ${String(item.scheduled_time || "").trim()} (${statusLabel})`;
  });

  if (wantsNext) {
    return [`Seu próximo atendimento é:`, ...lines].join("\n");
  }

  return [`Encontrei estes atendimentos seus:`, ...lines].join("\n");
}

function findRescheduleTargetSchedule(
  schedules: Array<{
    id: string;
    service_name: string | null;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
  }>,
  body: string,
  quotedBody?: string | null,
  preferredScheduleId?: string | null,
) {
  const preferredId = String(preferredScheduleId || "").trim();
  if (preferredId) {
    const exact = schedules.find((item) => String(item.id || "").trim() === preferredId);
    if (exact) return exact;
  }

  if (schedules.length === 1) {
    return schedules[0];
  }

  const combined = normalizeText([body, quotedBody || ""].filter(Boolean).join(" "));
  const directDate = resolveRelativeScheduleDate(null, [body, quotedBody].filter(Boolean).join(" "));
  const directTimes = extractScheduleTimesFromText([body, quotedBody].filter(Boolean).join(" "));
  const matched = schedules.filter((item) => {
    const normalizedName = normalizeName(String(item.service_name || ""));
    const nameParts = getSignificantNameParts(String(item.service_name || ""));
    const matchesName = combined.includes(normalizedName) || nameParts.some((part) => combined.includes(part));
    const matchesDate = directDate ? String(item.scheduled_date || "").trim() === directDate : false;
    const matchesTime = directTimes.length ? directTimes.includes(String(item.scheduled_time || "").trim()) : false;
    return matchesName || matchesDate || matchesTime;
  });

  if (matched.length === 1) {
    return matched[0];
  }

  return null;
}

function buildScheduleDisambiguationReply(input: {
  schedules: Array<{
    service_name: string | null;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
  }>;
}) {
  const lines = ["Encontrei mais de um atendimento seu. Me diga qual você quer remarcar:"];
  for (const item of input.schedules.slice(0, 5)) {
    const statusLabel = String(item.status || "").trim() === "confirmed" ? "Confirmado" : "Pendente";
    lines.push(`- ${String(item.service_name || "Atendimento").trim()} — ${formatShortBrDate(item.scheduled_date)} às ${String(item.scheduled_time || "").trim()} (${statusLabel})`);
  }
  return lines.join("\n");
}

function buildNoDiscountPermissionReply(mood: "amigavel" | "informal" | "formal") {
  if (mood === "amigavel") {
    return "No momento, não tenho permissão para oferecer desconto por aqui. Se quiser, posso seguir com os produtos e o pedido 😊";
  }
  if (mood === "formal") {
    return "No momento, não tenho permissão para oferecer desconto por este atendimento. Se desejar, posso seguir com as informações dos produtos e do pedido.";
  }
  return "No momento, não tenho permissão para oferecer desconto por aqui. Se quiser, posso seguir com os produtos e o pedido.";
}

function getDiscountAwareProducts(
  catalog: Array<{ name: string; description: string | null; type: string; discount_enabled?: boolean; discount_price?: string | null }>,
  body: string,
) {
  const text = normalizeText(body);
  const discountedProducts = catalog.filter((product) => Boolean(product.discount_enabled && String(product.discount_price || "").trim()));
  if (!discountedProducts.length) {
    return [];
  }

  const asksForAllDiscounts =
    /\bquais\b/.test(text) ||
    /\btem desconto\b/.test(text) ||
    /\bproduto.*desconto\b/.test(text) ||
    /\bprodutos.*desconto\b/.test(text) ||
    /\balgum desconto\b/.test(text);

  const matchedDiscountedProducts = discountedProducts.filter((product) => {
    const productName = normalizeName(product.name);
    const nameParts = getSignificantNameParts(product.name);
    return text.includes(productName) || nameParts.some((part) => text.includes(part));
  });

  if (matchedDiscountedProducts.length) {
    return matchedDiscountedProducts;
  }

  return asksForAllDiscounts ? discountedProducts : [];
}

function buildQuotedContextFallbackReply(input: {
  body: string;
  quotedBody?: string | null;
  catalog: Array<{ name: string; price: string; image_url: string | null }>;
}): string {
  const quotedBody = String(input.quotedBody || "").trim();
  if (!quotedBody || !isShortQuotedFollowup(input.body)) {
    return "";
  }

  const normalizedQuoted = normalizeText(quotedBody);
  const matchedProduct = input.catalog.find((product) => {
    const productName = normalizeName(product.name);
    const nameParts = getSignificantNameParts(product.name);
    return normalizedQuoted.includes(productName) || nameParts.some((part) => normalizedQuoted.includes(part));
  });

  if (matchedProduct) {
    return `${matchedProduct.name} â€” R$ ${Number(matchedProduct.price || 0).toFixed(2).replace(".", ",")} por unidade.`;
  }

  return quotedBody;
}

function isPriceQuestion(body: string, quotedBody?: string | null): boolean {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  return text.includes("preco") || text.includes("valor") || text.includes("custa") || text.includes("quanto");
}

function findCatalogMatches(
  catalog: Array<{ name: string; price: string; type: string }>,
  body: string,
  quotedBody?: string | null,
) {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  return catalog.filter((product) => {
    const productName = normalizeName(product.name);
    const nameParts = getSignificantNameParts(product.name);
    return text.includes(productName) || nameParts.some((part) => text.includes(part));
  });
}

function buildDeterministicCatalogReply(input: {
  body: string;
  quotedBody?: string | null;
  catalog: Array<{ name: string; price: string; type: string }>;
}): string {
  if (isQuotedSelectionIntent(input.body, input.quotedBody)) {
    return "";
  }

  const matches = findCatalogMatches(input.catalog, input.body, input.quotedBody);
  if (!matches.length) {
    return "";
  }

  if (isQuotedSelectionIntent(input.body, input.quotedBody)) {
    return "";
  }

  if (isPriceQuestion(input.body, input.quotedBody) || isShortQuotedFollowup(input.body)) {
    if (matches.length === 1) {
      const item = matches[0];
      return `${item.name} — R$ ${Number(item.price || 0).toFixed(2).replace(".", ",")}${item.type === "service" ? "" : " por unidade"}.`;
    }

    return matches
      .map((item) => `${item.name}: R$ ${Number(item.price || 0).toFixed(2).replace(".", ",")}`)
      .join("\n");
  }

  return "";
}

function parseStoreInfo(settings: any) {
  const rawAddress = String(settings?.store_address || "").trim();
  const addressParts = {
    city: "",
    street: "",
    number: "",
    neighborhood: "",
    complement: "",
  };

  if (rawAddress) {
    rawAddress
      .split("|")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .forEach((part) => {
        const [label, ...rest] = part.split(":");
        const value = rest.join(":").trim();
        const normalizedLabel = normalizeText(label);
        if (normalizedLabel === "cidade") addressParts.city = value;
        if (normalizedLabel === "rua") addressParts.street = value;
        if (normalizedLabel === "numero" || normalizedLabel === "número") addressParts.number = value;
        if (normalizedLabel === "bairro") addressParts.neighborhood = value;
        if (normalizedLabel === "complemento") addressParts.complement = value;
      });
  }

  const paymentMethods = Array.isArray(settings?.store_payment_methods)
    ? settings.store_payment_methods.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const deliveryFees = Array.isArray(settings?.store_delivery_fees)
    ? settings.store_delivery_fees
        .map((item: any) => ({
          label: String(item?.label || "").trim(),
          price: String(item?.price || "").trim(),
        }))
        .filter((item: { label: string; price: string }) => item.label || item.price)
    : [];

  return {
    name: String(settings?.store_name || "").trim(),
    description: String(settings?.store_description || "").trim(),
    cnpj: String(settings?.store_cnpj || "").trim(),
    rawAddress,
    addressParts,
    paymentMethods,
    deliveryFees,
  };
}

function parseScheduleSettings(settings: any) {
  const workingDays = Array.isArray(settings?.schedule_working_days)
    ? settings.schedule_working_days
        .map((item: any) => ({
          dayOfWeek: Number(item?.day_of_week),
          enabled: Boolean(item?.enabled),
          startTime: String(item?.start_time || "").trim(),
          endTime: String(item?.end_time || "").trim(),
          morningEnabled: item?.morning_enabled === undefined ? undefined : Boolean(item?.morning_enabled),
          morningStart: String(item?.morning_start || "").trim(),
          morningEnd: String(item?.morning_end || "").trim(),
          afternoonEnabled: item?.afternoon_enabled === undefined ? undefined : Boolean(item?.afternoon_enabled),
          afternoonStart: String(item?.afternoon_start || "").trim(),
          afternoonEnd: String(item?.afternoon_end || "").trim(),
          nightEnabled: item?.night_enabled === undefined ? undefined : Boolean(item?.night_enabled),
          nightStart: String(item?.night_start || "").trim(),
          nightEnd: String(item?.night_end || "").trim(),
          lunchBreakEnabled: item?.lunch_break_enabled === undefined ? undefined : Boolean(item?.lunch_break_enabled),
          lunchStart: String(item?.lunch_start || "").trim(),
          lunchEnd: String(item?.lunch_end || "").trim(),
        }))
        .filter((item: { dayOfWeek: number; enabled: boolean; startTime: string; endTime: string }) =>
          Number.isInteger(item.dayOfWeek) && item.dayOfWeek >= 0 && item.dayOfWeek <= 6,
        )
    : [];

  return {
    workingDays,
    intervalMinutes: Number.isFinite(Number(settings?.schedule_interval_minutes))
      ? Math.max(0, Math.round(Number(settings.schedule_interval_minutes)))
      : 0,
    reminderEnabled: Boolean(settings?.schedule_reminder_enabled),
    reminderRules: Array.isArray(settings?.schedule_reminder_rules)
      ? settings.schedule_reminder_rules
          .map((item: any) => {
            const unit = String(item?.unit || "minutes").trim().toLowerCase();
            const value = Number(item?.value);
            if (!Number.isFinite(value) || value <= 0) return null;
            return {
              unit: unit === "days" || unit === "hours" || unit === "minutes" ? unit : "minutes",
              value: Math.max(1, Math.round(value)),
            };
          })
          .filter(Boolean)
      : [],
    reminderMinutes:
      Boolean(settings?.schedule_reminder_enabled) && Number.isFinite(Number(settings?.schedule_reminder_minutes))
        ? Math.max(1, Math.round(Number(settings.schedule_reminder_minutes)))
        : null,
  };
}

function timeToMinutes(timeText: string | null | undefined): number | null {
  const raw = String(timeText || "").trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    return null;
  }
  const [hours, minutes] = raw.split(":").map((value) => Number(value));
  return hours * 60 + minutes;
}

function buildSchedulePeriods(dayConfig: any): Array<{ label: string; startTime: string; endTime: string }> {
  const periods = [
    dayConfig?.morningEnabled && dayConfig?.morningStart && dayConfig?.morningEnd
      ? { label: "manhã", startTime: dayConfig.morningStart, endTime: dayConfig.morningEnd }
      : null,
    dayConfig?.afternoonEnabled && dayConfig?.afternoonStart && dayConfig?.afternoonEnd
      ? { label: "tarde", startTime: dayConfig.afternoonStart, endTime: dayConfig.afternoonEnd }
      : null,
    dayConfig?.nightEnabled && dayConfig?.nightStart && dayConfig?.nightEnd
      ? { label: "noite", startTime: dayConfig.nightStart, endTime: dayConfig.nightEnd }
      : null,
  ].filter(Boolean) as Array<{ label: string; startTime: string; endTime: string }>;

  if (!periods.length && dayConfig?.startTime && dayConfig?.endTime) {
    periods.push({
      label: "atendimento",
      startTime: dayConfig.startTime,
      endTime: dayConfig.endTime,
    });
  }

  return periods;
}

function getAutomaticLunchBreak(dayConfig: any): { startTime: string; endTime: string } | null {
  if (
    dayConfig?.morningEnabled &&
    dayConfig?.afternoonEnabled &&
    dayConfig?.morningEnd &&
    dayConfig?.afternoonStart &&
    dayConfig.morningEnd < dayConfig.afternoonStart
  ) {
    return {
      startTime: String(dayConfig.morningEnd).trim(),
      endTime: String(dayConfig.afternoonStart).trim(),
    };
  }
  return null;
}

function validateScheduleWithinWorkingHours(input: {
  settings: any;
  scheduledDate: string | null | undefined;
  scheduledTime: string | null | undefined;
  durationMinutes?: number | null;
  now?: Date;
}) {
  const parsedSettings = parseScheduleSettings(input.settings);
  const enabledDays = parsedSettings.workingDays.filter((item: any) => item.enabled);
  if (!enabledDays.length || !isValidScheduleDate(input.scheduledDate) || !isValidScheduleTime(input.scheduledTime)) {
    return { ok: true, intervalMinutes: parsedSettings.intervalMinutes };
  }

  const date = new Date(`${String(input.scheduledDate).trim()}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const dayConfig = enabledDays.find((item: any) => item.dayOfWeek === weekday);
  if (!dayConfig) {
    return { ok: false, reason: "day_unavailable", intervalMinutes: parsedSettings.intervalMinutes };
  }

  const appointmentStart = timeToMinutes(input.scheduledTime);
  const durationMinutes = Number.isFinite(Number(input.durationMinutes)) ? Math.max(1, Math.round(Number(input.durationMinutes))) : 60;
  if (appointmentStart === null) {
    return { ok: true, intervalMinutes: parsedSettings.intervalMinutes };
  }
  const todayIso = getCurrentCuiabaDateIso(input.now || new Date());
  const currentMinutes = getCurrentCuiabaTimeMinutes(input.now || new Date());
  const minimumLeadMinutes = 15;
  if (String(input.scheduledDate || "").trim() < todayIso) {
    return { ok: false, reason: "time_already_passed", intervalMinutes: parsedSettings.intervalMinutes };
  }
  if (String(input.scheduledDate || "").trim() === todayIso && appointmentStart < currentMinutes + minimumLeadMinutes) {
    return { ok: false, reason: "time_already_passed", intervalMinutes: parsedSettings.intervalMinutes };
  }

  const appointmentEnd = appointmentStart + durationMinutes;
  const periods = buildSchedulePeriods(dayConfig);
  const automaticLunchBreak = getAutomaticLunchBreak(dayConfig);
  const lunchStartMinutes = automaticLunchBreak?.startTime ? timeToMinutes(automaticLunchBreak.startTime) : null;
  const lunchEndMinutes = automaticLunchBreak?.endTime ? timeToMinutes(automaticLunchBreak.endTime) : null;

  if (
    lunchStartMinutes !== null &&
    lunchEndMinutes !== null &&
    appointmentStart < lunchEndMinutes &&
    appointmentEnd > lunchStartMinutes
  ) {
    return {
      ok: false,
      reason: "inside_lunch_break",
      intervalMinutes: parsedSettings.intervalMinutes,
      dayConfig,
      periods,
    };
  }

  const fitsPeriod = periods.find((period) => {
    const startMinutes = timeToMinutes(period.startTime);
    const endMinutes = timeToMinutes(period.endTime);
    if (startMinutes === null || endMinutes === null) return false;
    return appointmentStart >= startMinutes && appointmentEnd <= endMinutes;
  });

  if (!fitsPeriod && periods.length) {
    return {
      ok: false,
      reason: "outside_working_hours",
      intervalMinutes: parsedSettings.intervalMinutes,
      dayConfig,
      periods,
    };
  }

  if (!fitsPeriod && !periods.length) {
    return { ok: true, intervalMinutes: parsedSettings.intervalMinutes, dayConfig };
  }

  return { ok: true, intervalMinutes: parsedSettings.intervalMinutes, dayConfig, periods, period: fitsPeriod };
}

export function __validateScheduleWithinWorkingHoursForTests(input: {
  settings: any;
  scheduledDate: string | null | undefined;
  scheduledTime: string | null | undefined;
  durationMinutes?: number | null;
}) {
  return validateScheduleWithinWorkingHours(input);
}

function buildScheduleOutsideWorkingHoursReply(input: {
  mood: "amigavel" | "informal" | "formal";
  dayConfig?: {
    startTime?: string;
    endTime?: string;
    morningEnabled?: boolean;
    morningStart?: string;
    morningEnd?: string;
    afternoonEnabled?: boolean;
    afternoonStart?: string;
    afternoonEnd?: string;
    nightEnabled?: boolean;
    nightStart?: string;
    nightEnd?: string;
  } | null;
  dayUnavailable?: boolean;
  insideLunchBreak?: boolean;
  timeAlreadyPassed?: boolean;
}) {
  const periods = buildSchedulePeriods(input.dayConfig);
  const automaticLunchBreak = getAutomaticLunchBreak(input.dayConfig);
  const lunchText = automaticLunchBreak
    ? ` O intervalo de almoço é das ${automaticLunchBreak.startTime} às ${automaticLunchBreak.endTime}.`
    : "";
  const windowText = periods.length
    ? `Nesse dia eu consigo agendar nos períodos de ${periods.map((period) => `${period.label} ${period.startTime} às ${period.endTime}`).join(", ")}.${lunchText}`
    : input.dayConfig?.startTime && input.dayConfig?.endTime
      ? `Nesse dia eu consigo agendar entre ${input.dayConfig.startTime} e ${input.dayConfig.endTime}.${lunchText}`
      : "Me passa outro dia ou horário dentro da escala cadastrada.";

  if (input.dayUnavailable) {
    if (input.mood === "amigavel") {
      return "Nesse dia eu não tenho atendimento disponível na agenda. Me passa outro dia ou horário que eu sigo com você 😊";
    }
    if (input.mood === "formal") {
      return "Não há atendimento disponível para esse dia na agenda cadastrada. Por favor, informe outro dia ou horário.";
    }
    return "Nesse dia eu não tenho atendimento disponível na agenda. Me passa outro dia ou horário que eu sigo com você.";
  }

  if (input.timeAlreadyPassed) {
    if (input.mood === "amigavel") {
      return "Esse horário já passou ou está muito em cima. Me manda um horário com pelo menos 15 minutos de antecedência que eu sigo com você 😊";
    }
    if (input.mood === "formal") {
      return "Esse horário já passou ou não respeita a antecedência mínima de 15 minutos. Por favor, informe outro horário disponível.";
    }
    return "Esse horário já passou ou está muito em cima. Me manda outro com pelo menos 15 minutos de antecedência.";
  }

  if (input.insideLunchBreak) {
    if (input.mood === "amigavel") {
      return `${windowText} Me manda outro horário e eu ajusto pra você 😊`;
    }
    if (input.mood === "formal") {
      return `${windowText} Por favor, informe outro horário disponível.`;
    }
    return `${windowText} Me manda outro horário e eu ajusto pra você.`;
  }

  if (input.mood === "amigavel") {
    return `${windowText} Se quiser, me manda outro horário e eu sigo por aqui 😊`;
  }
  if (input.mood === "formal") {
    return `${windowText} Por favor, informe outro horário dentro da escala disponível.`;
  }
  return `${windowText} Me passa outro horário e eu sigo por aqui.`;
}

function isScheduleAvailabilityQuestion(body: string, quotedBody?: string | null): boolean {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  const rawText = [String(body || ""), String(quotedBody || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return false;
  return (
    /\bhorario\b/.test(text) ||
    /\bhorarios\b/.test(text) ||
    /\bhorário\b/.test(text) ||
    /\bhorários\b/.test(text) ||
    /\bdisponivel\b/.test(text) ||
    /\bdisponiveis\b/.test(text) ||
    /\bdisponível\b/.test(text) ||
    /\bdisponíveis\b/.test(text) ||
    /\bagenda\b/.test(text) ||
    rawText.includes("hor?rio") ||
    rawText.includes("hor?rios")
  );
}

function getTargetScheduleDateForAvailability(body: string, quotedBody?: string | null, baseDate = new Date()): string | null {
  return resolveRelativeScheduleDate(null, [body, quotedBody].filter(Boolean).join(" "), baseDate);
}

function asksForNextWeekWithoutDay(body: string, quotedBody?: string | null): boolean {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  if (!/\b(proxima semana|próxima semana|semana que vem)\b/.test(text)) {
    return false;
  }
  return !/\b(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b/.test(text) && !/\b\d{2}\/\d{2}(?:\/\d{2,4})?\b/.test(text) && !/\b\d{4}-\d{2}-\d{2}\b/.test(text);
}

function formatPeriodWindow(periods: Array<{ label: string; startTime: string; endTime: string }>): string {
  if (!periods.length) {
    return "";
  }
  return periods.map((period) => `${period.label} ${period.startTime} às ${period.endTime}`).join(", ");
}

function detectRequestedSchedulePeriod(body: string, quotedBody?: string | null): "manha" | "tarde" | "noite" | null {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  const rawText = [String(body || ""), String(quotedBody || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("manha") || rawText.includes("manhã")) return "manha";
  if (text.includes("tarde") || rawText.includes("tarde")) return "tarde";
  if (text.includes("noite") || rawText.includes("noite")) return "noite";
  return null;
}

function buildScheduleCandidateSlots(input: {
  dayConfig: any;
  durationMinutes: number;
  intervalMinutes: number;
}): string[] {
  const periods = buildSchedulePeriods(input.dayConfig);
  const slots: string[] = [];
  const stepMinutes = Math.max(1, Number(input.durationMinutes || 0) + Math.max(0, Number(input.intervalMinutes || 0)));

  for (const period of periods) {
    const startMinutes = timeToMinutes(period.startTime);
    const endMinutes = timeToMinutes(period.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      continue;
    }

    for (let current = startMinutes; current + input.durationMinutes <= endMinutes; current += stepMinutes) {
      const hours = Math.floor(current / 60);
      const minutes = current % 60;
      slots.push(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
    }
  }

  return slots;
}

function findNextEnabledScheduleDate(settings: any, baseDate = new Date(), maxDaysAhead = 14): string | null {
  const parsedSettings = parseScheduleSettings(settings);
  const enabledDays = parsedSettings.workingDays.filter((item: any) => item.enabled);
  if (!enabledDays.length) {
    return null;
  }

  const todayIso = getCurrentCuiabaDateIso(baseDate);
  for (let offset = 0; offset <= maxDaysAhead; offset += 1) {
    const candidateIso = addDaysToIsoDate(todayIso, offset);
    const weekday = new Date(`${candidateIso}T12:00:00Z`).getUTCDay();
    if (enabledDays.some((item: any) => item.dayOfWeek === weekday)) {
      return candidateIso;
    }
  }

  return null;
}

async function buildAvailableSlotsForDate(input: {
  settings: any;
  accountId?: string | null;
  scheduledDate: string;
  durationMinutes: number;
  excludeScheduleId?: string | null;
  excludeCurrentSlot?: { scheduledDate: string; scheduledTime: string } | null;
}) {
  const parsedSettings = parseScheduleSettings(input.settings);
  const enabledDays = parsedSettings.workingDays.filter((item: any) => item.enabled);
  const weekday = new Date(`${String(input.scheduledDate).trim()}T12:00:00Z`).getUTCDay();
  const dayConfig = enabledDays.find((item: any) => item.dayOfWeek === weekday) || null;
  const periods = buildSchedulePeriods(dayConfig);
  const automaticLunchBreak = getAutomaticLunchBreak(dayConfig);
  const rawSlots = dayConfig
    ? buildScheduleCandidateSlots({
        dayConfig,
        durationMinutes: input.durationMinutes,
        intervalMinutes: parsedSettings.intervalMinutes,
      })
    : [];
  const existingSchedules =
    input.accountId && input.scheduledDate
      ? await listAiSchedulesForDate(input.accountId, input.scheduledDate, input.excludeScheduleId || null).catch(() => [])
      : [];

  const validSlots = rawSlots.filter((slot) => {
    if (
      input.excludeCurrentSlot &&
      String(input.excludeCurrentSlot.scheduledDate || "").trim() === String(input.scheduledDate || "").trim() &&
      String(input.excludeCurrentSlot.scheduledTime || "").trim() === String(slot || "").trim()
    ) {
      return false;
    }
    const withinHours = validateScheduleWithinWorkingHours({
      settings: input.settings,
      scheduledDate: input.scheduledDate,
      scheduledTime: slot,
      durationMinutes: input.durationMinutes,
    });
    if (!withinHours.ok) {
      return false;
    }
    return !hasScheduleConflictAtTime(existingSchedules, slot, input.durationMinutes, parsedSettings.intervalMinutes);
  });

  return {
    dayConfig,
    periods,
    automaticLunchBreak,
    intervalMinutes: parsedSettings.intervalMinutes,
    validSlots,
  };
}

function extractScheduleTimesFromText(text: string | null | undefined): string[] {
  const raw = String(text || "");
  const matches = raw.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h[0-5]\d|h)\b/gi) || [];
  const normalized = matches
    .map((item) => {
      const value = String(item || "").trim().toLowerCase();
      if (/^\d{1,2}:\d{2}$/.test(value)) {
        const [hours, minutes] = value.split(":").map(Number);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
      if (/^\d{1,2}h\d{2}$/.test(value)) {
        const [hours, minutes] = value.split("h").map(Number);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
      if (/^\d{1,2}h$/.test(value)) {
        const hours = Number(value.replace("h", ""));
        return `${String(hours).padStart(2, "0")}:00`;
      }
      return "";
    })
    .filter((item) => isValidScheduleTime(item));

  return Array.from(new Set(normalized));
}

function inferScheduleTimeFromNaturalSelection(input: {
  body: string;
  quotedBody?: string | null;
  previousCompanyBody?: string | null;
  dayConfig?: any;
  durationMinutes?: number | null;
  intervalMinutes?: number | null;
}): string | null {
  const directTimes = extractScheduleTimesFromText([input.body, input.quotedBody].filter(Boolean).join(" "));
  if (directTimes.length) {
    return directTimes[0];
  }

  const text = normalizeText([input.body, input.quotedBody].filter(Boolean).join(" "));
  const rawText = [String(input.body || ""), String(input.quotedBody || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) {
    return null;
  }

  const normalizedDayConfig = input.dayConfig
    ? parseScheduleSettings({
        schedule_working_days: [input.dayConfig],
        schedule_interval_minutes: input.intervalMinutes ?? null,
      }).workingDays[0] || input.dayConfig
    : null;
  const periods = buildSchedulePeriods(normalizedDayConfig);
  const allSuggestedTimes = extractScheduleTimesFromText(input.previousCompanyBody);
  const fallbackTimes =
    !allSuggestedTimes.length && normalizedDayConfig
      ? buildScheduleCandidateSlots({
          dayConfig: normalizedDayConfig,
          durationMinutes: Number.isFinite(Number(input.durationMinutes)) ? Math.max(1, Math.round(Number(input.durationMinutes))) : 60,
          intervalMinutes: Number.isFinite(Number(input.intervalMinutes)) ? Math.max(0, Math.round(Number(input.intervalMinutes))) : 0,
        })
      : [];
  const candidateTimes = allSuggestedTimes.length ? allSuggestedTimes : fallbackTimes;
  if (!candidateTimes.length) {
    return null;
  }

  const afternoon = periods.find((period) => period.label === "tarde");
  const lunchMatch = String(input.previousCompanyBody || "").match(/(\d{2}:\d{2})\s+e\s+(\d{2}:\d{2})/);
  const lunchEndMinutes = lunchMatch ? timeToMinutes(lunchMatch[2]) : null;
  const afternoonStartMinutes = timeToMinutes(afternoon?.startTime || null) ?? lunchEndMinutes ?? 13 * 60;

  const asksForAfterLunch =
    text.includes("primeiro horario da tarde") ||
    text.includes("primeiro da tarde") ||
    text.includes("depois do almoco") ||
    text.includes("apos o almoco") ||
    rawText.includes("depois do almoço") ||
    rawText.includes("após o almoço") ||
    rawText.includes("depois do almo?o") ||
    rawText.includes("ap?s o almo?o");

  if (asksForAfterLunch) {
    const match = candidateTimes.find((slot) => {
      const minutes = timeToMinutes(slot);
      return minutes !== null && minutes >= afternoonStartMinutes;
    });
    return match || null;
  }

  if (/\b(primeiro horario|primeiro horário|primeiro)\b/.test(text)) {
    return candidateTimes[0] || null;
  }

  if (/\b(ultimo horario|último horário|ultimo|último)\b/.test(text)) {
    return candidateTimes[candidateTimes.length - 1] || null;
  }

  return null;
}

export function __inferScheduleTimeFromNaturalSelectionForTests(input: {
  body: string;
  quotedBody?: string | null;
  previousCompanyBody?: string | null;
  dayConfig?: any;
  durationMinutes?: number | null;
  intervalMinutes?: number | null;
}) {
  return inferScheduleTimeFromNaturalSelection(input);
}

function hasScheduleConflictAtTime(
  existingSchedules: Array<{ scheduled_time: string; duration_minutes?: number | null }>,
  scheduledTime: string,
  durationMinutes: number,
  bufferMinutes: number,
): boolean {
  const targetStart = timeToMinutes(scheduledTime);
  if (targetStart === null) return false;
  const targetEnd = targetStart + Math.max(1, durationMinutes);

  return existingSchedules.some((item) => {
    const existingStart = timeToMinutes(item.scheduled_time);
    if (existingStart === null) return false;
    const existingEnd = existingStart + Math.max(1, Number(item.duration_minutes || 60));
    return (
      existingStart < targetEnd + Math.max(0, bufferMinutes) &&
      targetStart < existingEnd + Math.max(0, bufferMinutes)
    );
  });
}

async function buildDeterministicScheduleAvailabilityReply(input: {
  body: string;
  quotedBody?: string | null;
  previousCompanyBody?: string | null;
  settings: any;
  accountId?: string | null;
  catalog: Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    price: string;
    stock: number;
    image_url: string | null;
    schedule_enabled?: boolean;
    service_duration_minutes?: number | null;
  }>;
  openScheduleServiceName?: string | null;
  baseDate?: Date;
}): Promise<string> {
  if (!isScheduleAvailabilityQuestion(input.body, input.quotedBody)) {
    return "";
  }

  const baseDate = input.baseDate || new Date();
  const referenceText = [input.body, input.quotedBody, input.previousCompanyBody, input.openScheduleServiceName]
    .filter(Boolean)
    .join(" ");
  const service =
    findSchedulableServiceMatch(input.catalog, input.openScheduleServiceName, referenceText) ||
    findSchedulableServiceInConversationText(input.catalog, referenceText);
  if (!service) {
    return "";
  }

  const parsedSettings = parseScheduleSettings(input.settings);
  const enabledDays = parsedSettings.workingDays.filter((item: any) => item.enabled);
  if (!enabledDays.length) {
    return "No momento a agenda desse serviço não está configurada. Se quiser, me diga o serviço e eu posso seguir com um agente humano.";
  }

  if (asksForNextWeekWithoutDay(input.body, input.quotedBody)) {
    return `Para ${service.name}, me fala o dia da próxima semana que você prefere ou a data em dd/mm/aa (ex.: 24/03/26) que eu verifico os horários certinhos.`;
  }

  const targetDate =
    getTargetScheduleDateForAvailability(input.body, input.quotedBody, baseDate) ||
    getCurrentCuiabaDateIso(baseDate);

  const targetWeekday = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
  const dayConfig = enabledDays.find((item: any) => item.dayOfWeek === targetWeekday);
  if (!dayConfig) {
    return buildScheduleOutsideWorkingHoursReply({
      mood: "informal",
      dayUnavailable: true,
    });
  }

  const durationMinutes = Number.isFinite(Number(service.service_duration_minutes))
    ? Math.max(1, Math.round(Number(service.service_duration_minutes)))
    : 60;
  const intervalMinutes = parsedSettings.intervalMinutes;
  const rawSlots = buildScheduleCandidateSlots({
    dayConfig,
    durationMinutes,
    intervalMinutes,
  });

  const monthSchedules = input.accountId ? await listAiSchedulesForDate(input.accountId, targetDate).catch(() => []) : [];
  let validSlots = rawSlots.filter((slot) => {
    const withinHours = validateScheduleWithinWorkingHours({
      settings: input.settings,
      scheduledDate: targetDate,
      scheduledTime: slot,
      durationMinutes,
    });
    if (!withinHours.ok) {
      return false;
    }
    return !hasScheduleConflictAtTime(monthSchedules, slot, durationMinutes, intervalMinutes);
  });

  const periods = buildSchedulePeriods(dayConfig);
  const automaticLunchBreak = getAutomaticLunchBreak(dayConfig);
  const durationLabel = intervalMinutes > 0 ? `${durationMinutes} min + intervalo de ${intervalMinutes} min` : `${durationMinutes} min`;
  const dateLabel = formatShortBrDate(targetDate);
  const weekdayLabel = formatWeekdayBr(targetDate);
  const requestedPeriod = detectRequestedSchedulePeriod(input.body, input.quotedBody);
  const filteredPeriods =
    requestedPeriod === "manha"
      ? periods.filter((period) => period.label === "manhã")
      : requestedPeriod === "tarde"
        ? periods.filter((period) => period.label === "tarde")
        : requestedPeriod === "noite"
          ? periods.filter((period) => period.label === "noite")
          : periods;
  const windowLabel = formatPeriodWindow(filteredPeriods.length ? filteredPeriods : periods);
  const lunchLabel = automaticLunchBreak
    ? ` O almoço fica entre ${automaticLunchBreak.startTime} e ${automaticLunchBreak.endTime}.`
    : "";

  if (filteredPeriods.length && requestedPeriod) {
    validSlots = validSlots.filter((slot) => {
      const slotMinutes = timeToMinutes(slot);
      return filteredPeriods.some((period) => {
        const start = timeToMinutes(period.startTime);
        const end = timeToMinutes(period.endTime);
        return slotMinutes !== null && start !== null && end !== null && slotMinutes >= start && slotMinutes < end;
      });
    });
  }

  if (requestedPeriod && !filteredPeriods.length) {
    return `Nesse dia eu não tenho horário disponível na ${requestedPeriod === "manha" ? "manhã" : requestedPeriod}. Consigo te atender em ${formatPeriodWindow(periods)}. Se quiser, me fala outro horário dentro desses períodos.`;
  }

  if (!validSlots.length) {
    return `Para ${service.name}, atendo em ${windowLabel || "horários configurados na agenda"}.${lunchLabel} No momento não tenho horário livre em ${weekdayLabel}, ${dateLabel}. Se quiser, me fala outro dia em dd/mm/aa ou o dia da semana.`;
  }

  return [
    `Para ${service.name} (${durationLabel}), em ${weekdayLabel}, ${dateLabel}, atendo em ${windowLabel || "horários configurados na agenda"}.${lunchLabel}`,
    "Horários disponíveis:",
    ...validSlots.map((slot) => `- ${slot}`),
    "",
    "Qual dia você prefere? Pode falar o dia (ex.: terça) ou a data (ex.: 24/03/26).",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function __buildDeterministicScheduleAvailabilityReplyForTests(input: {
  body: string;
  quotedBody?: string | null;
  previousCompanyBody?: string | null;
  settings: any;
  accountId?: string | null;
  catalog: Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    price: string;
    stock: number;
    image_url: string | null;
    schedule_enabled?: boolean;
    service_duration_minutes?: number | null;
  }>;
  openScheduleServiceName?: string | null;
  baseDate?: Date;
}) {
  return buildDeterministicScheduleAvailabilityReply(input);
}

async function buildDeterministicCustomerRescheduleReply(input: {
  body: string;
  quotedBody?: string | null;
  previousCompanyBody?: string | null;
  settings: any;
  accountId?: string | null;
  targetSchedule: {
    id: string;
    service_name: string | null;
    scheduled_date: string;
    scheduled_time: string;
    duration_minutes?: number | null;
  };
  baseDate?: Date;
}) {
  const baseDate = input.baseDate || new Date();
  const referenceText = buildAiTurnBody(input.body, input.quotedBody, input.previousCompanyBody);
  const requestedDate =
    resolveRelativeScheduleDate(null, referenceText, baseDate) ||
    (String(input.targetSchedule.scheduled_date || "").trim() >= getCurrentCuiabaDateIso(baseDate)
      ? String(input.targetSchedule.scheduled_date || "").trim()
      : findNextEnabledScheduleDate(input.settings, baseDate));
  if (!requestedDate) {
    return "No momento eu não consegui localizar um dia disponível para esse reagendamento. Me fala a data em dd/mm/aa ou o dia da semana que você prefere.";
  }

  const durationMinutes = Number.isFinite(Number(input.targetSchedule.duration_minutes))
    ? Math.max(1, Math.round(Number(input.targetSchedule.duration_minutes)))
    : 60;
  const slotsData = await buildAvailableSlotsForDate({
    settings: input.settings,
    accountId: input.accountId || null,
    scheduledDate: requestedDate,
    durationMinutes,
    excludeScheduleId: input.targetSchedule.id,
    excludeCurrentSlot: {
      scheduledDate: String(input.targetSchedule.scheduled_date || "").trim(),
      scheduledTime: String(input.targetSchedule.scheduled_time || "").trim(),
    },
  });

  if (!slotsData.dayConfig) {
    return buildScheduleOutsideWorkingHoursReply({
      mood: "informal",
      dayUnavailable: true,
    });
  }

  let validSlots = slotsData.validSlots;
  const requestedPeriod = detectRequestedSchedulePeriod(input.body, input.quotedBody);
  if (requestedPeriod) {
    const filteredPeriods = slotsData.periods.filter((period) =>
      requestedPeriod === "manha"
        ? period.label === "manhã"
        : requestedPeriod === "tarde"
          ? period.label === "tarde"
          : period.label === "noite",
    );
    if (!filteredPeriods.length) {
      return `Para ${String(input.targetSchedule.service_name || "esse atendimento").trim()}, eu consigo remarcar em ${formatPeriodWindow(slotsData.periods)}. Me fala um horário dentro desses períodos ou outro dia.`;
    }
    validSlots = validSlots.filter((slot) => {
      const slotMinutes = timeToMinutes(slot);
      return filteredPeriods.some((period) => {
        const start = timeToMinutes(period.startTime);
        const end = timeToMinutes(period.endTime);
        return slotMinutes !== null && start !== null && end !== null && slotMinutes >= start && slotMinutes < end;
      });
    });
  }

  const dateLabel = formatShortBrDate(requestedDate);
  const weekdayLabel = formatWeekdayBr(requestedDate);
  const lunchLabel = slotsData.automaticLunchBreak
    ? ` O almoço fica entre ${slotsData.automaticLunchBreak.startTime} e ${slotsData.automaticLunchBreak.endTime}.`
    : "";
  const currentWhen = `${formatShortBrDate(input.targetSchedule.scheduled_date)} às ${String(input.targetSchedule.scheduled_time || "").trim()}`;

  if (!validSlots.length) {
    return [
      `Encontrei seu agendamento de ${String(input.targetSchedule.service_name || "atendimento").trim()} em ${currentWhen}.`,
      `Para remarcar, em ${weekdayLabel}, ${dateLabel}, atendo em ${formatPeriodWindow(slotsData.periods)}.${lunchLabel}`,
      "No momento não tenho horário livre nesse dia.",
      "Se quiser, me fala outro dia em dd/mm/aa ou o dia da semana que eu verifico na hora.",
    ].join("\n");
  }

  return [
    `Encontrei seu agendamento de ${String(input.targetSchedule.service_name || "atendimento").trim()} em ${currentWhen}.`,
    `Posso remarcar. Para ${weekdayLabel}, ${dateLabel}, estes horários estão livres:${lunchLabel}`,
    ...validSlots.slice(0, 8).map((slot) => `- ${slot}`),
    "",
    "Me fala qual horário você prefere. Se quiser outro dia, pode mandar a data em dd/mm/aa ou o dia da semana.",
  ].join("\n");
}

function buildDeterministicStoreReply(input: {
  body: string;
  quotedBody?: string | null;
  settings: any;
}) {
  const text = normalizeText([input.body, input.quotedBody].filter(Boolean).join(" "));
  if (!text) return "";

  const store = parseStoreInfo(input.settings);

  const asksStoreName = /\bnome da loja\b/.test(text) || /\bqual o nome\b/.test(text);
  const asksCnpj = /\bcnpj\b/.test(text);
  const asksAddress =
    /\bendereco\b/.test(text) ||
    /\bendereço\b/.test(text) ||
    /\bonde fica\b/.test(text) ||
    /\blocalizacao\b/.test(text) ||
    /\blocalização\b/.test(text);
  const asksPaymentMethods =
    /\bforma de pagamento\b/.test(text) ||
    /\bformas de pagamento\b/.test(text) ||
    /\baceita\b/.test(text) ||
    /\baceitam\b/.test(text) ||
    /\bpagamento\b/.test(text) ||
    /\bpix\b/.test(text) ||
    /\bcartao\b/.test(text) ||
    /\bcartão\b/.test(text) ||
    /\bdinheiro\b/.test(text);
  const asksDeliveryFee =
    /\btaxa de entrega\b/.test(text) ||
    /\bfrete\b/.test(text) ||
    /\bentregam\b/.test(text) ||
    /\bentrega\b/.test(text);
  const asksAboutStore =
    /\bsobre a loja\b/.test(text) ||
    /\bme fala sobre a loja\b/.test(text) ||
    /\bquais informacoes da loja\b/.test(text) ||
    /\bquais informações da loja\b/.test(text);

  if (asksStoreName && store.name) {
    return `O nome da loja é ${store.name}.`;
  }

  if (asksCnpj && store.cnpj) {
    return `O CNPJ da loja é ${store.cnpj}.`;
  }

  if (asksAddress && store.rawAddress) {
    const lines = [
      store.name ? `Endereço da ${store.name}:` : "Endereço da loja:",
      store.addressParts.city ? `Cidade: ${store.addressParts.city}` : "",
      store.addressParts.street ? `Rua: ${store.addressParts.street}` : "",
      store.addressParts.number ? `Número: ${store.addressParts.number}` : "",
      store.addressParts.neighborhood ? `Bairro: ${store.addressParts.neighborhood}` : "",
      store.addressParts.complement ? `Complemento: ${store.addressParts.complement}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  if (asksPaymentMethods && store.paymentMethods.length) {
    if (/\bdinheiro\b/.test(text)) {
      return store.paymentMethods.some((item: string) => normalizeText(item).includes("dinheiro"))
        ? "Sim, aceitamos dinheiro."
        : "No momento, dinheiro não está cadastrado como forma de pagamento.";
    }
    return `Aceitamos:\n- ${store.paymentMethods.join("\n- ")}`;
  }

  if (asksDeliveryFee && store.deliveryFees.length) {
    const matchedFee = store.deliveryFees.find((item: { label: string; price: string }) => {
      const label = normalizeText(item.label);
      return label && text.includes(label);
    });

    if (matchedFee) {
      return `A taxa de entrega para ${matchedFee.label} é ${matchedFee.price}.`;
    }

    if (/\bentregam\b/.test(text) || /\bentrega\b/.test(text)) {
      return `Sim, fazemos entregas.\nPreços:\n- ${store.deliveryFees.map((item: { label: string; price: string }) => `${item.label}: ${item.price}`).join("\n- ")}`;
    }
  }

  if (asksAboutStore) {
    const blocks = [
      store.name || "",
      store.description || "",
      store.cnpj ? `CNPJ: ${store.cnpj}` : "",
      store.rawAddress
        ? [
            "Endereço:",
            store.addressParts.city ? `- Cidade: ${store.addressParts.city}` : "",
            store.addressParts.street ? `- Rua: ${store.addressParts.street}` : "",
            store.addressParts.number ? `- Número: ${store.addressParts.number}` : "",
            store.addressParts.neighborhood ? `- Bairro: ${store.addressParts.neighborhood}` : "",
            store.addressParts.complement ? `- Complemento: ${store.addressParts.complement}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "",
      store.paymentMethods.length ? `Formas de pagamento:\n- ${store.paymentMethods.join("\n- ")}` : "",
      store.deliveryFees.length
        ? `Preços de entrega:\n- ${store.deliveryFees.map((item: { label: string; price: string }) => `${item.label}: ${item.price}`).join("\n- ")}`
        : "",
    ].filter(Boolean);
    return blocks.join("\n\n");
  }

  return "";
}

function isSalesScopeMessage(
  body: string,
  catalog: Array<{ name: string; description: string | null; type: string }>,
  quotedBody?: string | null,
): boolean {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  if (!text) return true;
  if (isGreetingMessage(body) || isClosingMessage(body)) return true;

  const salesKeywords = [
    "loja",
    "endereco",
    "endereço",
    "cnpj",
    "bairro",
    "rua",
    "avenida",
    "numero",
    "número",
    "cidade",
    "forma de pagamento",
    "formas de pagamento",
    "taxa de entrega",
    "frete",
    "localizacao",
    "localização",
    "onde fica",
    "produto",
    "produtos",
    "servico",
    "servicos",
    "preco",
    "valor",
    "custa",
    "pedido",
    "comprar",
    "compra",
    "entrega",
    "retirada",
    "retirar",
    "pagamento",
    "pix",
    "cartao",
    "cartão",
    "estoque",
    "disponivel",
    "disponível",
    "foto",
    "imagem",
    "catalogo",
    "catálogo",
    "item",
    "itens",
    "unidade",
    "unidades",
    "quantidade",
    "orcamento",
    "orçamento",
    "suporte",
    "venda",
    "semente",
    "emenda",
    "malathion",
  ];

  if (salesKeywords.some((keyword) => text.includes(normalizeText(keyword)))) {
    return true;
  }

  return catalog.some((product) => {
    const productName = normalizeName(product.name);
    const nameParts = getSignificantNameParts(product.name);
    return text.includes(productName) || nameParts.some((part) => text.includes(part));
  });
}

function hasUnsupportedCapabilityClaim(replyText: string, discountAllowed: boolean): boolean {
  const text = normalizeText(replyText);
  const unsupportedPatterns = [
    /\bvou enviar o link de pagamento\b/,
    /\bja vou enviar o link de pagamento\b/,
    /\bgerar o link de pagamento\b/,
    /\bgerar um link de pagamento\b/,
    /\blink de pagamento do cartao\b/,
    /\benviar o link do pix\b/,
    /\bgerar boleto\b/,
    /\bcupom\b/,
  ];

  if (unsupportedPatterns.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (!discountAllowed) {
    const discountPatterns = [/\bdesconto aplicado\b/, /\bapliquei desconto\b/, /\bdesconto de\b/, /\bcom desconto\b/];
    return discountPatterns.some((pattern) => pattern.test(text));
  }

  return false;
}

function shouldSendMultipleImages(lastCustomerMessage: string, productNames: string[]): boolean {
  const text = normalizeText(lastCustomerMessage);
  if (!text) return productNames.length > 1;

  if (productNames.length > 1) return true;

  return (
    /\btodos\b/.test(text) ||
    /\btodas\b/.test(text) ||
    /\btodos os produtos\b/.test(text) ||
    /\btodas as imagens\b/.test(text) ||
    /\btodas as fotos\b/.test(text) ||
    /\btodos os itens\b/.test(text) ||
    /\bcatalogo\b/.test(text) ||
    /\bmostra (todos|todas)\b/.test(text) ||
    /\bme envie (todos|todas)\b/.test(text)
  );
}

function extractRequestedProductNames(input: {
  catalog: Array<{ name: string; image_url: string | null; price: string; type: string; description: string | null; id: string; stock: number }>;
  productNames: string[];
  lastCustomerMessage: string;
}) {
  const requestedNames = input.productNames.map((item) => normalizeName(item)).filter(Boolean);
  const customerText = normalizeText(input.lastCustomerMessage);
  const rankedMatches = input.catalog
    .map((product) => {
    if (!String(product.image_url || "").trim()) return false;

    const productName = normalizeName(product.name);
    const nameParts = getSignificantNameParts(product.name);
      let score = 0;

    const matchesExplicitName = requestedNames.some((requested) => productName.includes(requested) || requested.includes(productName));
      if (matchesExplicitName) score += 100;

      if (customerText.includes(productName)) score += 80;

      for (const part of nameParts) {
        if (customerText.includes(part)) {
          score += 20;
        }
      }

      return score > 0 ? { product, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number((b as any).score) - Number((a as any).score));

  const bestScore = rankedMatches.length ? Number((rankedMatches[0] as any).score) : 0;
  return rankedMatches
    .filter((entry) => Number((entry as any).score) === bestScore)
    .map((entry) => (entry as any).product);
}

export async function handleInboundAiAutomation(
  conversationId: string,
  options: HandleInboundAiAutomationOptions = {},
): Promise<{ ok: boolean; replied: boolean; reason?: string }> {
  const id = String(conversationId || "").trim();
  if (id) {
    clearCustomerTurnTimer(id);
  }
  if (!id || processingConversations.has(id)) {
    if (id) {
      queuedConversations.add(id);
    }
    return { ok: false, replied: false, reason: "busy" };
  }

  processingConversations.add(id);
  let stopTypingIndicator: (() => void) | null = null;
  try {
    await wait(options.forceLatestCustomerMessage ? 180 : 550);

    const context = await getConversationAiContext(id);
    if (!context) {
      return { ok: false, replied: false, reason: "conversation_not_found" };
    }

    if (!context.ai_agent_enabled) {
      return { ok: true, replied: false, reason: "disabled" };
    }

    if (context.assigned_user_id && context.service_status === "in_progress") {
      return { ok: true, replied: false, reason: "human_in_charge" };
    }

    if (!context.account_wa_jid || !context.phone) {
      return { ok: false, replied: false, reason: "missing_account_or_phone" };
    }

    stopTypingIndicator = await setWhatsAppTypingPresence({
      to: context.phone,
      accountJid: context.account_wa_jid,
      active: true,
    }).catch(() => null);

    const accountSettings = context.account_id ? await getAiAccountSettings(String(context.account_id || "").trim()).catch(() => null) : null;
    const mood = getAgentMood(accountSettings?.mood);

    const messages = await listConversationMessagesForAi(id, 80);
    if (!messages.length) {
      return { ok: true, replied: false, reason: "no_messages" };
    }

    const effectiveMessages = [...messages];
    if (options.forceLatestCustomerMessage) {
      while (
        effectiveMessages.length > 0 &&
        effectiveMessages[effectiveMessages.length - 1]?.from_me &&
        effectiveMessages[effectiveMessages.length - 1]?.metadata?.ai_generated
      ) {
        effectiveMessages.pop();
      }
    }

    if (!effectiveMessages.length) {
      return { ok: true, replied: false, reason: "no_customer_message_after_queue" };
    }

    const account = context.account_id ? await getWhatsAppAccountById(String(context.account_id || "").trim(), null).catch(() => null) : null;
    const catalog = await listProductsForAgentDetailedContext(account?.company_id || null);
    const customerTurn = buildCustomerTurnContext(effectiveMessages);
    const lastMessage = customerTurn.turnMessages[customerTurn.turnMessages.length - 1] || effectiveMessages[effectiveMessages.length - 1];
    if (!lastMessage || lastMessage.from_me) {
      return { ok: true, replied: false, reason: "last_message_from_company" };
    }
    const quotedBody = customerTurn.combinedQuotedBody || (typeof lastMessage.metadata?.quoted_body === "string" ? lastMessage.metadata.quoted_body : null);
    const lastCustomerTurnBody = customerTurn.combinedBody || String(lastMessage.body || "");
    const previousCompanyMessage = findLastCompanyMessageBeforeTurn(effectiveMessages, customerTurn.turnMessages);
    const previousCompanyBody = String(previousCompanyMessage?.body || "").trim() || null;
    const awaitingOrderConfirmation = wasAwaitingOrderConfirmation(effectiveMessages);
    const awaitingScheduleConfirmation = wasAwaitingScheduleConfirmation(effectiveMessages);
    const customerRescheduleRequest = isScheduleRescheduleRequest(lastCustomerTurnBody, quotedBody, previousCompanyBody);
    const hasConfirmedScheduleContext = Boolean(context.confirmed_schedule_id);
    const aiRescheduleActive = Boolean(context.reschedule_active);
    const useRescheduleTargetConfirmedSchedule =
      aiRescheduleActive &&
      String(context.reschedule_target_schedule_id || "").trim() &&
      String(context.confirmed_schedule_id || "").trim() === String(context.reschedule_target_schedule_id || "").trim();
    const useConfirmedScheduleContext =
      useRescheduleTargetConfirmedSchedule ||
      (!context.open_schedule_id && (aiRescheduleActive || customerRescheduleRequest || hasConfirmedScheduleContext));
    const customerDirectConfirmation = hasDirectOrderConfirmation(
      lastCustomerTurnBody,
      quotedBody,
      awaitingOrderConfirmation || awaitingScheduleConfirmation,
    );
    const customerDirectScheduleSelection = hasDirectScheduleSelection(lastCustomerTurnBody, quotedBody);
    const customerScheduleInquiry = isCustomerScheduleInquiry(lastCustomerTurnBody, quotedBody, previousCompanyBody);

    const discountQuestion = isDiscountQuestion(lastCustomerTurnBody);
    const allowedDiscountProducts = discountQuestion ? getDiscountAwareProducts(catalog, lastCustomerTurnBody) : [];
    const discountAllowed = allowedDiscountProducts.length > 0;

    const activeSchedulesForConversation =
      customerRescheduleRequest || aiRescheduleActive || customerScheduleInquiry
        ? await listActiveAiSchedulesForConversation(id, {
            limit: 6,
            includePast: false,
          }).catch(() => [])
        : [];

    if (customerRescheduleRequest && !aiRescheduleActive && !hasDirectScheduleSelection(lastCustomerTurnBody, quotedBody)) {
      if (!activeSchedulesForConversation.length) {
        const replyText = "No momento eu não encontrei agendamento ativo seu para remarcar por aqui.";
        const waResponse = await sendWhatsAppText({
          to: context.phone,
          message: replyText,
          accountJid: context.account_wa_jid,
        });

        await saveOutboundMessage({
          accountJid: context.account_wa_jid,
          accountDisplayName: null,
          phone: context.phone,
          body: replyText,
          messageType: "text",
          externalMessageId: waResponse?.key?.id || null,
          status: "sent",
          payload: waResponse,
          metadata: {
            ai_generated: true,
            ai_schedule_reschedule_lookup: true,
          },
        });

        return { ok: true, replied: true, reason: "customer_reschedule_no_active_schedule" };
      }

      const targetSchedule = findRescheduleTargetSchedule(
        activeSchedulesForConversation.map((item) => ({
          id: String(item.id || "").trim(),
          service_name: item.service_name,
          scheduled_date: String(item.scheduled_date || "").trim(),
          scheduled_time: String(item.scheduled_time || "").trim(),
          status: String(item.status || "").trim(),
        })),
        lastCustomerTurnBody,
        quotedBody,
        aiRescheduleActive ? context.reschedule_target_schedule_id : null,
      );

      if (!targetSchedule) {
        const replyText = buildScheduleDisambiguationReply({
          schedules: activeSchedulesForConversation.map((item) => ({
            service_name: item.service_name,
            scheduled_date: String(item.scheduled_date || "").trim(),
            scheduled_time: String(item.scheduled_time || "").trim(),
            status: String(item.status || "").trim(),
          })),
        });
        const waResponse = await sendWhatsAppText({
          to: context.phone,
          message: replyText,
          accountJid: context.account_wa_jid,
        });

        await saveOutboundMessage({
          accountJid: context.account_wa_jid,
          accountDisplayName: null,
          phone: context.phone,
          body: replyText,
          messageType: "text",
          externalMessageId: waResponse?.key?.id || null,
          status: "sent",
          payload: waResponse,
          metadata: {
            ai_generated: true,
            ai_schedule_reschedule_lookup: true,
          },
        });

        return { ok: true, replied: true, reason: "customer_reschedule_disambiguation" };
      }

      await setConversationAiRescheduleContext({
        conversationId: id,
        scheduleId: targetSchedule.id,
        initiatedBy: "customer",
        reason: String(lastCustomerTurnBody || "").trim() || null,
      }).catch(() => undefined);

      const targetFullSchedule = activeSchedulesForConversation.find((item) => String(item.id || "").trim() === targetSchedule.id) || null;
      const replyText = await buildDeterministicCustomerRescheduleReply({
        body: lastCustomerTurnBody,
        quotedBody,
        previousCompanyBody,
        settings: accountSettings,
        accountId: context.account_id || null,
        targetSchedule: {
          id: targetSchedule.id,
          service_name: targetSchedule.service_name,
          scheduled_date: targetSchedule.scheduled_date,
          scheduled_time: targetSchedule.scheduled_time,
          duration_minutes: targetFullSchedule?.duration_minutes ?? null,
        },
      });
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: replyText,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: replyText,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_schedule_reschedule_lookup: true,
          ai_schedule_target_id: targetSchedule.id,
        },
      });

      return { ok: true, replied: true, reason: "customer_reschedule_suggestions" };
    }

    if (customerScheduleInquiry && !aiRescheduleActive && !customerRescheduleRequest) {
      const activeSchedules = activeSchedulesForConversation.length
        ? activeSchedulesForConversation
        : await listActiveAiSchedulesForConversation(id, {
            limit: 5,
            includePast: false,
          }).catch(() => []);
      const replyText = buildCustomerSchedulesReply({
        mood,
        body: lastCustomerTurnBody,
        schedules: activeSchedules.map((item) => ({
          service_name: item.service_name,
          scheduled_date: String(item.scheduled_date || "").trim(),
          scheduled_time: String(item.scheduled_time || "").trim(),
          status: String(item.status || "").trim(),
        })),
      });

      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: replyText,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: replyText,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_schedule_inquiry: true,
        },
      });

      return { ok: true, replied: true, reason: "customer_schedule_inquiry" };
    }

    const deterministicScheduleAvailabilityReply = await buildDeterministicScheduleAvailabilityReply({
      body: lastCustomerTurnBody,
      quotedBody,
      previousCompanyBody,
      settings: accountSettings,
      accountId: context.account_id || null,
      catalog: catalog as Array<any>,
      openScheduleServiceName: context.open_schedule_service_name || null,
    });

    if (deterministicScheduleAvailabilityReply) {
      const replyText = formatIsoDatesInText(deterministicScheduleAvailabilityReply);
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: replyText,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: replyText,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
        },
      });

      return { ok: true, replied: true, reason: "deterministic_schedule_availability" };
    }

    const aiResult = await generateAiSalesReply({
      accountId: context.account_id || null,
      companyName: null,
      agentName: null,
      conversationName: context.display_name || null,
      customerPhone: context.phone || null,
      memorySummary: context.memory_summary || null,
      customerProfile: context.customer_profile || null,
      lastOrderSummary: context.open_order_summary || null,
      lastOrderStatus: context.open_order_status || null,
      lastScheduleSummary: !useRescheduleTargetConfirmedSchedule && context.open_schedule_id && context.open_schedule_service_name && context.open_schedule_date && context.open_schedule_time
          ? buildScheduleSummary({
              serviceName: String(context.open_schedule_service_name || ""),
              scheduledDate: String(context.open_schedule_date || ""),
              scheduledTime: String(context.open_schedule_time || ""),
              durationMinutes: context.open_schedule_duration_minutes != null ? Number(context.open_schedule_duration_minutes) : null,
            })
          : useConfirmedScheduleContext &&
              context.confirmed_schedule_service_name &&
              context.confirmed_schedule_date &&
              context.confirmed_schedule_time
            ? buildScheduleSummary({
                serviceName: String(context.confirmed_schedule_service_name || ""),
                scheduledDate: String(context.confirmed_schedule_date || ""),
                scheduledTime: String(context.confirmed_schedule_time || ""),
                durationMinutes:
                  context.confirmed_schedule_duration_minutes != null ? Number(context.confirmed_schedule_duration_minutes) : null,
              })
          : null,
      lastScheduleStatus: !useRescheduleTargetConfirmedSchedule && context.open_schedule_id
        ? context.open_schedule_status || null
        : useConfirmedScheduleContext
          ? context.confirmed_schedule_status || null
          : null,
      messages: effectiveMessages.map((item) => ({
        from_me: Boolean(item.from_me),
        body:
          item === lastMessage
            ? buildAiTurnBody(lastCustomerTurnBody, quotedBody, previousCompanyBody)
            : String(item.body || ""),
        sent_at: item.sent_at || item.created_at || null,
        message_type: item.message_type || null,
        quoted_body: typeof item.metadata?.quoted_body === "string" ? item.metadata.quoted_body : null,
      })),
    });

    await upsertConversationAiMemory({
      conversationId: id,
      memorySummary: aiResult.memorySummary,
      customerProfile: aiResult.customerProfile,
      lastOrderSummary: aiResult.order.summary,
      lastScheduleSummary:
        aiResult.schedule?.serviceName && aiResult.schedule?.scheduledDate && aiResult.schedule?.scheduledTime
          ? buildScheduleSummary({
              serviceName: aiResult.schedule.serviceName,
              scheduledDate: aiResult.schedule.scheduledDate,
              scheduledTime: aiResult.schedule.scheduledTime,
              durationMinutes: aiResult.schedule.durationMinutes,
            })
          : null,
    });

    const existingPendingItems = Array.isArray(context.open_order_items) ? context.open_order_items : [];
    const mergedOrder = {
      summary: pickFirstFilled(aiResult.order.summary, context.open_order_summary) || null,
      items: aiResult.order.items.length ? aiResult.order.items : existingPendingItems,
      totalEstimate:
        aiResult.order.totalEstimate !== null && aiResult.order.totalEstimate !== undefined
          ? aiResult.order.totalEstimate
          : context.open_order_total_estimate !== null && context.open_order_total_estimate !== undefined
            ? Number(context.open_order_total_estimate)
            : null,
      responsibleName: pickFirstFilled(aiResult.order.responsibleName, context.open_order_responsible_name),
      fulfillmentType: pickFirstFilled(aiResult.order.fulfillmentType, context.open_order_fulfillment_type),
      deliveryAddress: pickFirstFilled(aiResult.order.deliveryAddress, context.open_order_delivery_address),
      paymentMethod: pickFirstFilled(aiResult.order.paymentMethod, context.open_order_payment_method),
    };

    const normalizedFulfillment = normalizeName(String(mergedOrder.fulfillmentType || ""));
    const requiresDeliveryAddress = normalizedFulfillment.includes("entrega");
    if (requiresDeliveryAddress) {
      mergedOrder.deliveryAddress = enrichDeliveryAddressWithCustomerText(
        String(mergedOrder.deliveryAddress || ""),
        buildAiTurnBody(lastCustomerTurnBody, quotedBody, previousCompanyBody),
      );
    }
    const hasOrderDataReadyForConfirmation =
      Boolean(mergedOrder.summary) &&
      Boolean(mergedOrder.responsibleName) &&
      Boolean(mergedOrder.paymentMethod) &&
      Boolean(mergedOrder.fulfillmentType) &&
      (!requiresDeliveryAddress || hasCompleteDeliveryAddress(String(mergedOrder.deliveryAddress || "")));
    const hasRequiredOrderData = hasOrderDataReadyForConfirmation && customerDirectConfirmation;

    const schedulableService = findSchedulableServiceMatch(
      catalog as Array<any>,
      aiResult.schedule?.serviceName,
      buildAiTurnBody(lastCustomerTurnBody, quotedBody, previousCompanyBody),
    );
    const scheduleBaseServiceProductId = !useRescheduleTargetConfirmedSchedule && context.open_schedule_id
      ? context.open_schedule_service_product_id
      : useConfirmedScheduleContext
        ? context.confirmed_schedule_service_product_id
        : null;
    const scheduleBaseServiceName = !useRescheduleTargetConfirmedSchedule && context.open_schedule_id
      ? context.open_schedule_service_name
      : useConfirmedScheduleContext
        ? context.confirmed_schedule_service_name
        : null;
    const scheduleBaseDate =
      !useRescheduleTargetConfirmedSchedule && context.open_schedule_id ? context.open_schedule_date : useConfirmedScheduleContext ? context.confirmed_schedule_date : null;
    const scheduleBaseTime =
      !useRescheduleTargetConfirmedSchedule && context.open_schedule_id ? context.open_schedule_time : useConfirmedScheduleContext ? context.confirmed_schedule_time : null;
    const scheduleBaseCustomerName = !useRescheduleTargetConfirmedSchedule && context.open_schedule_id
      ? context.open_schedule_customer_name
      : useConfirmedScheduleContext
        ? context.confirmed_schedule_customer_name
        : null;
    const scheduleBaseNotes =
      !useRescheduleTargetConfirmedSchedule && context.open_schedule_id ? context.open_schedule_notes : useConfirmedScheduleContext ? context.confirmed_schedule_notes : null;
    const scheduleBaseDuration = !useRescheduleTargetConfirmedSchedule && context.open_schedule_id
      ? context.open_schedule_duration_minutes
      : useConfirmedScheduleContext
        ? context.confirmed_schedule_duration_minutes
        : null;
    const customerSuggestedScheduleDate =
      aiRescheduleActive || customerRescheduleRequest || hasConfirmedScheduleContext
        ? resolveRelativeScheduleDate(null, buildAiTurnBody(lastCustomerTurnBody, quotedBody, previousCompanyBody))
        : null;
    const customerSuggestedScheduleTime =
      aiRescheduleActive || customerRescheduleRequest || hasConfirmedScheduleContext
        ? extractScheduleTimesFromText([lastCustomerTurnBody, quotedBody].filter(Boolean).join(" "))[0] || null
        : null;
    const hasCustomerSuggestedReschedule =
      Boolean(customerSuggestedScheduleDate) || Boolean(customerSuggestedScheduleTime) || customerDirectScheduleSelection;
    const canReopenConfirmedSchedule =
      !context.open_schedule_id &&
      Boolean(context.confirmed_schedule_id) &&
      (aiRescheduleActive || customerRescheduleRequest || hasCustomerSuggestedReschedule);
    const mergedSchedule = {
      serviceProductId: String(schedulableService?.id || scheduleBaseServiceProductId || "").trim() || null,
      serviceName:
        pickFirstFilled(aiResult.schedule?.serviceName, schedulableService?.name, scheduleBaseServiceName) || null,
      scheduledDate:
        resolveRelativeScheduleDate(
          pickFirstFilled(aiResult.schedule?.scheduledDate, customerSuggestedScheduleDate, scheduleBaseDate) || null,
          buildAiTurnBody(lastCustomerTurnBody, quotedBody, previousCompanyBody),
        ) || null,
      scheduledTime: pickFirstFilled(aiResult.schedule?.scheduledTime, customerSuggestedScheduleTime, scheduleBaseTime) || null,
      customerName:
        pickFirstFilled(aiResult.schedule?.customerName, scheduleBaseCustomerName, context.display_name) || null,
      notes: pickFirstFilled(aiResult.schedule?.notes, scheduleBaseNotes) || null,
      durationMinutes:
        aiResult.schedule?.durationMinutes !== null && aiResult.schedule?.durationMinutes !== undefined
          ? aiResult.schedule.durationMinutes
          : schedulableService?.service_duration_minutes != null
            ? Number(schedulableService.service_duration_minutes)
            : scheduleBaseDuration != null
              ? Number(scheduleBaseDuration)
              : null,
    };
    const selectedSameAsCurrentSchedule =
      aiRescheduleActive &&
      String(context.reschedule_target_schedule_id || "").trim() &&
      isValidScheduleDate(mergedSchedule.scheduledDate) &&
      isValidScheduleTime(mergedSchedule.scheduledTime) &&
      String(mergedSchedule.scheduledDate || "").trim() === String(scheduleBaseDate || "").trim() &&
      String(mergedSchedule.scheduledTime || "").trim() === String(scheduleBaseTime || "").trim();
    if (!mergedSchedule.scheduledTime) {
      const parsedScheduleSettings = parseScheduleSettings(accountSettings);
      const inferredScheduleDayConfig =
        mergedSchedule.scheduledDate && isValidScheduleDate(mergedSchedule.scheduledDate)
          ? parsedScheduleSettings.workingDays.find((item: any) => {
              const date = new Date(`${String(mergedSchedule.scheduledDate).trim()}T12:00:00Z`);
              return !Number.isNaN(date.getTime()) && item.dayOfWeek === date.getUTCDay();
            }) || null
          : null;
      const inferredTime = inferScheduleTimeFromNaturalSelection({
        body: lastCustomerTurnBody,
        quotedBody,
        previousCompanyBody,
        dayConfig: inferredScheduleDayConfig,
        durationMinutes: mergedSchedule.durationMinutes,
        intervalMinutes: parsedScheduleSettings.intervalMinutes,
      });
      if (inferredTime) {
        mergedSchedule.scheduledTime = inferredTime;
      }
    }
    const scheduleWindowValidation = validateScheduleWithinWorkingHours({
      settings: accountSettings,
      scheduledDate: mergedSchedule.scheduledDate,
      scheduledTime: mergedSchedule.scheduledTime,
      durationMinutes: mergedSchedule.durationMinutes,
    });
    const hasExistingScheduleTarget = Boolean(context.open_schedule_id) || canReopenConfirmedSchedule;
    const hasCompleteScheduleProposal =
      Boolean(mergedSchedule.serviceName) &&
      (Boolean(mergedSchedule.serviceProductId) || hasExistingScheduleTarget) &&
      isValidScheduleDate(mergedSchedule.scheduledDate) &&
      isValidScheduleTime(mergedSchedule.scheduledTime);
    const hasRequiredScheduleData =
      hasCompleteScheduleProposal &&
      scheduleWindowValidation.ok &&
      (customerDirectConfirmation || customerDirectScheduleSelection || canReopenConfirmedSchedule);

    let createdOrderId: string | null = null;
    let updatedPendingOrder = false;
    if (aiResult.order.shouldCreate && hasRequiredOrderData) {
      if (String(context.open_order_id || "").trim()) {
        const updatedOrder = await updatePendingAiOrder({
          orderId: String(context.open_order_id || "").trim(),
          summary: String(mergedOrder.summary || "").trim(),
          items: mergedOrder.items,
          totalEstimate: mergedOrder.totalEstimate,
          responsibleName: mergedOrder.responsibleName,
          fulfillmentType: mergedOrder.fulfillmentType,
          deliveryAddress: mergedOrder.deliveryAddress,
          paymentMethod: mergedOrder.paymentMethod,
        });

        if (updatedOrder?.id) {
          createdOrderId = String(updatedOrder.id || "").trim() || null;
          updatedPendingOrder = true;
        }
      }

      if (!createdOrderId) {
        const createdOrder = await createAiOrder({
          accountId: context.account_id || null,
          conversationId: id,
          customerPhone: context.phone || null,
          summary: String(mergedOrder.summary || "").trim(),
          items: mergedOrder.items,
          totalEstimate: mergedOrder.totalEstimate,
          responsibleName: mergedOrder.responsibleName,
          fulfillmentType: mergedOrder.fulfillmentType,
          deliveryAddress: mergedOrder.deliveryAddress,
          paymentMethod: mergedOrder.paymentMethod,
        });
        createdOrderId = String(createdOrder.id || "").trim() || null;
      }
    }

    let createdScheduleId: string | null = null;
    let updatedPendingSchedule = false;
    let reopenedConfirmedSchedule = false;
    let scheduleConflict: Awaited<ReturnType<typeof findAiScheduleConflict>> | null = null;
    let scheduleOutsideHoursFromRepository = false;
    let scheduleTooSoonOrPastFromRepository = false;
    const scheduleConflictExcludeId =
      String(context.open_schedule_id || "").trim() ||
      (canReopenConfirmedSchedule ? String(context.confirmed_schedule_id || "").trim() : "") ||
      null;
    if (hasCompleteScheduleProposal && scheduleWindowValidation.ok) {
      try {
        scheduleConflict = await findAiScheduleConflict({
          accountId: context.account_id || null,
          excludeScheduleId: scheduleConflictExcludeId,
          scheduledDate: String(mergedSchedule.scheduledDate || "").trim(),
          scheduledTime: String(mergedSchedule.scheduledTime || "").trim(),
          durationMinutes: mergedSchedule.durationMinutes,
          bufferMinutes: scheduleWindowValidation.intervalMinutes,
        });
      } catch (error) {
        console.error("Falha ao verificar conflito de agendamento:", error);
      }
    }
    if (hasRequiredScheduleData && !scheduleConflict) {
      try {
        if (String(context.open_schedule_id || "").trim()) {
          const updatedSchedule = await updatePendingAiSchedule({
            scheduleId: String(context.open_schedule_id || "").trim(),
            accountId: context.account_id || null,
            customerName: mergedSchedule.customerName,
            serviceProductId: mergedSchedule.serviceProductId,
            serviceName: String(mergedSchedule.serviceName || "").trim(),
            scheduledDate: String(mergedSchedule.scheduledDate || "").trim(),
            scheduledTime: String(mergedSchedule.scheduledTime || "").trim(),
            durationMinutes: mergedSchedule.durationMinutes,
            bufferMinutes: scheduleWindowValidation.intervalMinutes,
            notes: mergedSchedule.notes,
          });

          if (updatedSchedule?.id) {
            createdScheduleId = String(updatedSchedule.id || "").trim() || null;
            updatedPendingSchedule = true;
          }
        }

        if (!createdScheduleId && canReopenConfirmedSchedule && String(context.confirmed_schedule_id || "").trim()) {
          const updatedSchedule = await rescheduleAiSchedule({
            scheduleId: String(context.confirmed_schedule_id || "").trim(),
            accountId: context.account_id || null,
            scheduledDate: String(mergedSchedule.scheduledDate || "").trim(),
            scheduledTime: String(mergedSchedule.scheduledTime || "").trim(),
            durationMinutes: mergedSchedule.durationMinutes,
            revertConfirmedToPending: true,
          });

          if (updatedSchedule?.id) {
            createdScheduleId = String(updatedSchedule.id || "").trim() || null;
            reopenedConfirmedSchedule = true;
          }
        }

        if (!createdScheduleId) {
          const createdSchedule = await createAiSchedule({
            accountId: context.account_id || null,
            conversationId: id,
            customerPhone: context.phone || null,
            customerName: mergedSchedule.customerName,
            serviceProductId: mergedSchedule.serviceProductId,
            serviceName: String(mergedSchedule.serviceName || "").trim(),
            scheduledDate: String(mergedSchedule.scheduledDate || "").trim(),
            scheduledTime: String(mergedSchedule.scheduledTime || "").trim(),
            durationMinutes: mergedSchedule.durationMinutes,
            bufferMinutes: scheduleWindowValidation.intervalMinutes,
            notes: mergedSchedule.notes,
          });
          createdScheduleId = String(createdSchedule.id || "").trim() || null;
        }
        } catch (error: any) {
        if (error?.code === "AI_SCHEDULE_CONFLICT") {
          scheduleConflict = error?.conflict || null;
        } else if (error?.code === "AI_SCHEDULE_TOO_SOON_OR_PAST") {
          scheduleTooSoonOrPastFromRepository = true;
        } else if (error?.code === "AI_SCHEDULE_OUTSIDE_WORKING_HOURS") {
          scheduleOutsideHoursFromRepository = true;
        } else {
          throw error;
        }
      }
    }

    const fallbackReply =
      selectedSameAsCurrentSchedule
        ? `Esse já é o horário atual do seu atendimento: ${formatShortBrDate(String(scheduleBaseDate || "").trim())} às ${String(scheduleBaseTime || "").trim()}. Me passa outro horário que eu sigo com o reagendamento.`
        :
      scheduleConflict
        ? buildScheduleConflictReply({
            mood,
            conflict: scheduleConflict,
          })
        : hasCompleteScheduleProposal && (!scheduleWindowValidation.ok || scheduleOutsideHoursFromRepository || scheduleTooSoonOrPastFromRepository)
        ? buildScheduleOutsideWorkingHoursReply({
            mood,
            dayConfig: scheduleWindowValidation.dayConfig || null,
            dayUnavailable: scheduleWindowValidation.reason === "day_unavailable",
            insideLunchBreak: scheduleWindowValidation.reason === "inside_lunch_break",
            timeAlreadyPassed:
              scheduleWindowValidation.reason === "time_already_passed" || scheduleTooSoonOrPastFromRepository,
          })
        : hasRequiredScheduleData && createdScheduleId
        ? buildScheduleFallbackReply({
            mood,
            updatedPendingSchedule,
            reopenedConfirmedSchedule,
          })
        : hasCompleteScheduleProposal && scheduleWindowValidation.ok && !createdScheduleId
        ? buildScheduleConfirmationPrompt({
            serviceName: mergedSchedule.serviceName,
            scheduledDate: mergedSchedule.scheduledDate,
            scheduledTime: mergedSchedule.scheduledTime,
            durationMinutes: mergedSchedule.durationMinutes,
          })
        : aiResult.order.shouldCreate && hasRequiredOrderData
        ? buildOrderFallbackReply({
            mood,
            updatedPendingOrder,
          })
        : "";
    let replyText = String(aiResult.reply || "").trim() || fallbackReply || buildUnknownSalesReply(mood);
    if (reopenedConfirmedSchedule && createdScheduleId) {
      replyText = fallbackReply || replyText;
    }
    if (
      selectedSameAsCurrentSchedule ||
      scheduleConflict ||
      (hasCompleteScheduleProposal &&
        (!scheduleWindowValidation.ok || scheduleOutsideHoursFromRepository || scheduleTooSoonOrPastFromRepository))
    ) {
      replyText = fallbackReply || buildUnknownSalesReply(mood);
    }
    const normalizedReplyText = normalizeText(replyText);
    const scheduleClaimedAsCreated =
      normalizedReplyText.includes("agendamento ficou pendente de confirmacao interna") ||
      normalizedReplyText.includes("agendamento ficou pendente de confirmação interna") ||
      normalizedReplyText.includes("agendamento pendente") ||
      normalizedReplyText.includes("aguardando confirmacao interna") ||
      normalizedReplyText.includes("aguardando confirmação interna") ||
      normalizedReplyText.includes("permanece aguardando confirmacao interna") ||
      normalizedReplyText.includes("permanece aguardando confirmação interna") ||
      normalizedReplyText.includes("registrei seu agendamento") ||
      normalizedReplyText.includes("seu agendamento foi registrado") ||
      normalizedReplyText.includes("ajustei seu agendamento") ||
      normalizedReplyText.includes("agendamento ajustado") ||
      normalizedReplyText.includes("agendamento atualizado") ||
      normalizedReplyText.includes("agendei") ||
      normalizedReplyText.includes("agendado") ||
      normalizedReplyText.includes("agendamento registrado");
    if (hasCompleteScheduleProposal && !createdScheduleId && !scheduleConflict && scheduleWindowValidation.ok && scheduleClaimedAsCreated) {
      replyText =
        fallbackReply ||
        buildScheduleConfirmationPrompt({
          serviceName: mergedSchedule.serviceName,
          scheduledDate: mergedSchedule.scheduledDate,
          scheduledTime: mergedSchedule.scheduledTime,
          durationMinutes: mergedSchedule.durationMinutes,
        });
    }
    if (hasUnsupportedCapabilityClaim(replyText, discountAllowed)) {
      replyText = buildUnknownSalesReply(mood);
    }

    replyText = formatIsoDatesInText(replyText);

    const parsedDeliveryAddress = parseStructuredDeliveryAddress(mergedOrder.deliveryAddress);
    const deliveryHasOnlyMissingReference =
      normalizedFulfillment.includes("entrega") &&
      Boolean(parsedDeliveryAddress.city) &&
      Boolean(parsedDeliveryAddress.street) &&
      Boolean(parsedDeliveryAddress.neighborhood) &&
      Boolean(parsedDeliveryAddress.number) &&
      !parsedDeliveryAddress.reference;

    const shouldAttemptImage = aiResult.media.shouldSendImages;
    let matchedProducts: Array<{
      id: string;
      name: string;
      type: string;
      description: string | null;
      price: string;
      stock: number;
      image_url: string | null;
    }> = [];

    if (shouldAttemptImage) {
      const sendMultipleImages = shouldSendMultipleImages(String(lastMessage.body || ""), aiResult.media.productNames);
      matchedProducts = extractRequestedProductNames({
        catalog,
        productNames: aiResult.media.productNames,
        lastCustomerMessage: String(lastMessage.body || ""),
      });

      if (sendMultipleImages) {
        if (!matchedProducts.length && /\btodos\b|\btodas\b|\bcatalogo\b/.test(normalizeText(String(lastMessage.body || "")))) {
          matchedProducts = catalog.filter((product) => String(product.image_url || "").trim());
        }
        matchedProducts = matchedProducts.slice(0, 10);
      } else {
        matchedProducts = matchedProducts.slice(0, 1);
      }

      if (!matchedProducts.length) {
        const requestedName =
          aiResult.media.productNames[0] ||
          String(lastMessage.body || "")
            .trim()
            .replace(/^me envie a foto da\s+/i, "")
            .replace(/^agora da\s+/i, "")
            .replace(/^foto da\s+/i, "")
            .trim();

        replyText = buildMissingImageReply({
          mood,
          requestedName,
        });
      }
    }

    if (!aiResult.shouldReply || !replyText) {
      return { ok: true, replied: false, reason: "model_chose_not_to_reply" };
    }

    if (shouldSuppressDuplicateReply(id, replyText)) {
      return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
    }

    const waResponse = await sendWhatsAppText({
      to: context.phone,
      message: replyText,
      accountJid: context.account_wa_jid,
    });

    await saveOutboundMessage({
      accountJid: context.account_wa_jid,
      accountDisplayName: null,
      phone: context.phone,
      body: replyText,
      messageType: "text",
      externalMessageId: waResponse?.key?.id || null,
      status: "sent",
      payload: waResponse,
      metadata: {
        ai_generated: true,
        ai_agent: true,
        ai_order_id: createdOrderId,
        ai_schedule_id: createdScheduleId,
      },
    });

    if (createdScheduleId && (reopenedConfirmedSchedule || aiRescheduleActive)) {
      await clearConversationAiRescheduleContext(id).catch(() => undefined);
    }

    if (shouldAttemptImage && matchedProducts.length > 0) {
      for (const product of matchedProducts) {
        const media = await loadMediaBufferFromUrl(String(product.image_url || "").trim());
        if (!media?.buffer) continue;

        const caption = `${product.name}\nPreço: R$${Number(product.price || 0).toFixed(2)}`;
        const mediaResponse = await sendWhatsAppMedia({
          to: context.phone,
          mediaBuffer: media.buffer,
          mimetype: media.mimeType || "image/jpeg",
          fileName: media.fileName || `${product.name}.jpg`,
          caption,
          accountJid: context.account_wa_jid,
        });

        await saveOutboundMessage({
          accountJid: context.account_wa_jid,
          accountDisplayName: null,
          phone: context.phone,
          body: caption,
          messageType: "imageMessage",
          externalMessageId: mediaResponse?.key?.id || null,
          status: "sent",
          payload: mediaResponse,
          metadata: {
            ai_generated: true,
            ai_agent: true,
            ai_product_image: true,
            product_name: product.name,
            media_type: "image",
            image_preview_url: product.image_url,
            file_url: product.image_url,
            file_name: media.fileName || `${product.name}.jpg`,
            mime_type: media.mimeType || "image/jpeg",
          },
        });
      }
    }

    return { ok: true, replied: true };
  } catch (error) {
    console.error("Falha na automacao do agente de IA:", error);
    return {
      ok: false,
      replied: false,
      reason: error instanceof Error ? error.message : "ai_automation_failed",
    };
  } finally {
    if (stopTypingIndicator) {
      await Promise.resolve(stopTypingIndicator()).catch(() => undefined);
    }
    processingConversations.delete(id);
    if (queuedConversations.has(id)) {
      queuedConversations.delete(id);
      scheduleInboundAiAutomation(id, {
        delayMs: CUSTOMER_TURN_WAIT_MS,
        reason: "queued_customer_followup",
      });
    }
  }
}
