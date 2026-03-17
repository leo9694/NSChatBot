import { saveOutboundMessage } from "../repositories/messages.repository";
import {
  createAiOrder,
  getAiAccountSettings,
  getConversationAiContext,
  listConversationMessagesForAi,
  updatePendingAiOrder,
  upsertConversationAiMemory,
} from "../repositories/ai.repository";
import { listProductsForAgentDetailedContext } from "../repositories/products.repository";
import { generateAiSalesReply } from "./openai.service";
import { loadMediaBufferFromUrl } from "./media.service";
import { sendWhatsAppMedia, sendWhatsAppText } from "./whatsapp.service";

const processingConversations = new Set<string>();
const queuedConversations = new Set<string>();
const recentAiReplies = new Map<string, { body: string; at: number }>();
const customerTurnTimers = new Map<string, NodeJS.Timeout>();
const customerTurnDeadlines = new Map<string, number>();
const GENERIC_PRODUCT_NAME_PARTS = new Set(["semente", "sementes", "produto", "produtos", "servico", "servicos"]);
const CUSTOMER_TURN_WAIT_MS = 20_000;

interface HandleInboundAiAutomationOptions {
  forceLatestCustomerMessage?: boolean;
}

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
    customerTurnTimers.delete(conversationId);
    customerTurnDeadlines.delete(conversationId);
    void handleInboundAiAutomation(conversationId, { forceLatestCustomerMessage: true }).catch(() => undefined);
  }, delayMs);

  customerTurnTimers.set(conversationId, timer);
}

export function registerCustomerTypingActivity(conversationId: string): void {
  scheduleInboundAiAutomation(conversationId, { delayMs: CUSTOMER_TURN_WAIT_MS, reason: "customer_typing" });
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

function buildAiTurnBody(body: string, quotedBody?: string | null): string {
  const cleanBody = String(body || "").trim();
  const cleanQuoted = String(quotedBody || "").trim();
  if (!cleanQuoted) {
    return cleanBody;
  }

  if (isQuotedSelectionIntent(cleanBody, cleanQuoted)) {
    return `${cleanBody}\n[Item citado pelo cliente: ${cleanQuoted}]`;
  }

  if (isShortQuotedFollowup(cleanBody)) {
    return `${cleanBody}\n[Referência citada: ${cleanQuoted}]`;
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
  const hasNumber = /\b(n[ÂºoÂ°]?|numero)\b/.test(normalized) || /\d+/.test(normalized);
  const hasDistrict = /\bbairro\b/.test(normalized) || /\bjd\b/.test(normalized) || /\bjardim\b/.test(normalized);
  return hasCity && hasStreet && hasNumber && hasDistrict;
}

function buildDeliveryAddressForm() {
  return [
    "Para entrega, me envie estes dados assim:",
    "",
    "Cidade:",
    "Rua:",
    "Número:",
    "Bairro:",
  ].join("\n");
}

function hasDeliveryAddressForm(value: string | null | undefined): boolean {
  const normalized = normalizeText(String(value || ""));
  return (
    normalized.includes("cidade:") &&
    normalized.includes("rua:") &&
    normalized.includes("numero:") &&
    normalized.includes("bairro:")
  );
}

function isClosingMessage(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;

  const closingPatterns = [
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

function isSalesScopeMessage(
  body: string,
  catalog: Array<{ name: string; description: string | null; type: string }>,
  quotedBody?: string | null,
): boolean {
  const text = normalizeText([body, quotedBody].filter(Boolean).join(" "));
  if (!text) return true;
  if (isGreetingMessage(body) || isClosingMessage(body)) return true;

  const salesKeywords = [
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

    const catalog = await listProductsForAgentDetailedContext();
    const customerTurn = buildCustomerTurnContext(effectiveMessages);
    const lastMessage = customerTurn.turnMessages[customerTurn.turnMessages.length - 1] || effectiveMessages[effectiveMessages.length - 1];
    if (!lastMessage || lastMessage.from_me) {
      return { ok: true, replied: false, reason: "last_message_from_company" };
    }
    const quotedBody = customerTurn.combinedQuotedBody || (typeof lastMessage.metadata?.quoted_body === "string" ? lastMessage.metadata.quoted_body : null);
    const lastCustomerTurnBody = customerTurn.combinedBody || String(lastMessage.body || "");
    const latestCustomerBody = String(lastMessage.body || "");

    if (isClosingMessage(latestCustomerBody)) {
      const closingReply = buildClosingReply(mood);
      if (shouldSuppressDuplicateReply(id, closingReply)) {
        return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
      }
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: closingReply,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: closingReply,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_agent: true,
          ai_closing_message: true,
        },
      });

      return { ok: true, replied: true, reason: "closing_detected" };
    }

    const deterministicCatalogReply = buildDeterministicCatalogReply({
      body: lastCustomerTurnBody,
      quotedBody,
      catalog,
    });
    if (deterministicCatalogReply) {
      if (shouldSuppressDuplicateReply(id, deterministicCatalogReply)) {
        return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
      }
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: deterministicCatalogReply,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: deterministicCatalogReply,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_agent: true,
          ai_direct_catalog_reply: true,
        },
      });

      return { ok: true, replied: true, reason: "direct_catalog_reply" };
    }

    if (isClosingMessage(lastCustomerTurnBody)) {
      const closingReply = buildClosingReply(mood);
      if (shouldSuppressDuplicateReply(id, closingReply)) {
        return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
      }
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: closingReply,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: closingReply,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_agent: true,
          ai_closing_message: true,
        },
      });

      return { ok: true, replied: true, reason: "closing_detected" };
    }

    const discountQuestion = isDiscountQuestion(lastCustomerTurnBody);
    const allowedDiscountProducts = discountQuestion ? getDiscountAwareProducts(catalog, lastCustomerTurnBody) : [];
    const discountAllowed = allowedDiscountProducts.length > 0;

    const unrealisticSalesRequest = detectUnrealisticSalesRequest({
      body: lastCustomerTurnBody,
      catalog,
    });
    if (unrealisticSalesRequest) {
      const unrealisticReply = buildUnrealisticSalesReply(mood, unrealisticSalesRequest);
      if (shouldSuppressDuplicateReply(id, unrealisticReply)) {
        return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
      }
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: unrealisticReply,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: unrealisticReply,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_agent: true,
          ai_unrealistic_request: true,
        },
      });

      return { ok: true, replied: true, reason: "unrealistic_sales_request" };
    }

    if (discountQuestion && !discountAllowed) {
      const noDiscountReply = buildNoDiscountPermissionReply(mood);
      if (shouldSuppressDuplicateReply(id, noDiscountReply)) {
        return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
      }
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: noDiscountReply,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: noDiscountReply,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_agent: true,
          ai_discount_denied: true,
        },
      });

      return { ok: true, replied: true, reason: "discount_not_allowed" };
    }

    if (!isSalesScopeMessage(lastCustomerTurnBody, catalog, quotedBody)) {
      const offTopicReply = buildOffTopicReply(mood);
      if (shouldSuppressDuplicateReply(id, offTopicReply)) {
        return { ok: true, replied: false, reason: "duplicate_reply_suppressed" };
      }
      const waResponse = await sendWhatsAppText({
        to: context.phone,
        message: offTopicReply,
        accountJid: context.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: context.account_wa_jid,
        accountDisplayName: null,
        phone: context.phone,
        body: offTopicReply,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_agent: true,
          ai_off_topic: true,
        },
      });

      return { ok: true, replied: true, reason: "off_topic_detected" };
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
      messages: effectiveMessages.map((item) => ({
        from_me: Boolean(item.from_me),
        body:
          item === lastMessage
            ? buildAiTurnBody(lastCustomerTurnBody, quotedBody)
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
    const hasRequiredOrderData =
      Boolean(mergedOrder.summary) &&
      Boolean(mergedOrder.responsibleName) &&
      Boolean(mergedOrder.paymentMethod) &&
      Boolean(aiResult.order.customerConfirmedDetails) &&
      Boolean(mergedOrder.fulfillmentType) &&
      (!requiresDeliveryAddress || hasCompleteDeliveryAddress(String(mergedOrder.deliveryAddress || "")));

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

    const fallbackReply =
      aiResult.order.shouldCreate && hasRequiredOrderData
        ? buildOrderFallbackReply({
            mood,
            updatedPendingOrder,
          })
        : "";
    const quotedContextFallback = buildQuotedContextFallbackReply({
      body: lastCustomerTurnBody,
      quotedBody,
      catalog,
    });
    let replyText = String(aiResult.reply || "").trim() || quotedContextFallback || fallbackReply;
    if (discountQuestion && !discountAllowed) {
      replyText = buildNoDiscountPermissionReply(mood);
    } else if (hasUnsupportedCapabilityClaim(replyText, discountAllowed)) {
      replyText = buildUnknownSalesReply(mood);
    }

    if (
      normalizedFulfillment.includes("entrega") &&
      !hasCompleteDeliveryAddress(String(mergedOrder.deliveryAddress || "")) &&
      replyText &&
      !hasDeliveryAddressForm(replyText)
    ) {
      replyText = `${replyText}\n\n${buildDeliveryAddressForm()}`.trim();
    }

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
      },
    });

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
    processingConversations.delete(id);
    if (queuedConversations.has(id)) {
      queuedConversations.delete(id);
      void handleInboundAiAutomation(id, { forceLatestCustomerMessage: true }).catch(() => undefined);
    }
  }
}



