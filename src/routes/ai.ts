import { Router, type Response } from "express";
import PDFDocument = require("pdfkit");
import { generateAiOperationalMessage, getOpenAIStatus, testOpenAIConnection } from "../services/openai.service";
import {
  cancelAiOrder,
  cancelAiSchedule,
  confirmAiOrder,
  confirmAiSchedule,
  deleteAiOrder,
  deleteAiSchedule,
  getAiAccountSettings,
  getAiOrderById,
  getAiScheduleById,
  listAiOrders,
  listAiSchedules,
  listAiSchedulesDueForReminder,
  markAiScheduleReminderSent,
  rescheduleAiSchedule,
  upsertAiAccountSettings,
  validateAiScheduleSlot,
} from "../repositories/ai.repository";
import { getWhatsAppAccountById } from "../repositories/accounts.repository";
import { saveOutboundMessage } from "../repositories/messages.repository";
import { sendWhatsAppText } from "../services/whatsapp.service";
import { setConversationAiRescheduleContext, updateConversationAiEnabled } from "../repositories/conversations.repository";

const router = Router();
const APP_TIME_ZONE = String(process.env.APP_TIMEZONE || "America/Cuiaba").trim() || "America/Cuiaba";
type AuthRequest = Express.Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "ceo" | "administrador" | "operador";
    company_id?: string | null;
  };
};

function formatShortBrDate(value?: string | null): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1].slice(-2)}`;
}

function buildAiRescheduleOutreachMessage(input: {
  customerName?: string | null;
  serviceName?: string | null;
  reason: string;
  suggestedDate: string;
  suggestedTime: string;
}): string {
  const lines = [
    input.customerName ? `${String(input.customerName).trim()},` : "Olá,",
    "",
    `preciso ajustar o horário do serviço ${String(input.serviceName || "agendado").trim()}.`,
    `Motivo: ${String(input.reason || "").trim()}.`,
    "",
    `Consigo te atender em ${formatShortBrDate(input.suggestedDate)} às ${String(input.suggestedTime || "").trim()}.`,
    "Se esse horário não for bom, me fala outro horário disponível que eu sigo com você por aqui.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function __buildAiRescheduleOutreachMessageForTests(input: {
  customerName?: string | null;
  serviceName?: string | null;
  reason: string;
  suggestedDate: string;
  suggestedTime: string;
}): string {
  return buildAiRescheduleOutreachMessage(input);
}

function parseBrDateToIso(value?: string | null): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return raw;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (String(match[3]).length === 2) {
    year += 2000;
  }
  if (!day || !month || !year) return raw;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatCustomerOrderMessage(input: {
  greeting?: string;
  statusLine: string;
  summary?: string;
  readyTimeMinutes?: number | null;
  note?: string | null;
  orderNotes?: string | null;
  cancelReason?: string | null;
}) {
  const parts = [
    input.greeting?.trim() || "",
    input.statusLine.trim(),
    input.summary?.trim() ? `Resumo:\n${input.summary.trim()}` : "",
    input.orderNotes?.trim() ? `Observação do pedido:\n${input.orderNotes.trim()}` : "",
    Number.isFinite(input.readyTimeMinutes)
      ? `Tempo estimado:\n${Math.round(Number(input.readyTimeMinutes))} minuto(s)`
      : "",
    input.note?.trim() ? `Informações adicionais:\n${input.note.trim()}` : "",
    input.cancelReason?.trim() ? `Motivo do cancelamento:\n${input.cancelReason.trim()}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

function formatCurrencyBr(value?: string | number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTimeBrInAppTimeZone(value?: string | number | Date | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function buildOrderItemLines(items: Array<Record<string, unknown>>): string[] {
  if (!Array.isArray(items) || !items.length) {
    return ["Sem itens detalhados"];
  }
  return items.map((entry) => {
    const qty = String(entry?.quantity || entry?.qty || "1").trim();
    const name = String(entry?.name || entry?.product || "Item").trim();
    const unitPriceRaw = entry?.unit_price ?? entry?.price ?? null;
    const unitPrice = unitPriceRaw != null && String(unitPriceRaw).trim() !== "" ? formatCurrencyBr(unitPriceRaw as string | number) : "";
    return unitPrice ? `${qty} x ${name}  |  ${unitPrice}` : `${qty} x ${name}`;
  });
}

function writePdfField(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  if (!value || value === "-") return;
  doc.font("Helvetica-Bold").fontSize(10).text(`${label}: `, { continued: true });
  doc.font("Helvetica").text(value);
  doc.moveDown(0.35);
}

function writePdfSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#183244").text(title);
  doc
    .moveTo(40, doc.y + 4)
    .lineTo(555, doc.y + 4)
    .lineWidth(1)
    .strokeColor("#d7e0e7")
    .stroke();
  doc.moveDown(0.55);
}

function writePdfGridRow(
  doc: InstanceType<typeof PDFDocument>,
  leftLabel: string,
  leftValue: string,
  rightLabel?: string,
  rightValue?: string,
): void {
  const startY = doc.y;
  const leftX = 40;
  const rightX = 305;
  const colWidth = 230;

  const drawCell = (x: number, label: string, value: string) => {
    if (!label || !value || value === "-") return 0;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#5a7181").text(label.toUpperCase(), x, startY, { width: colWidth });
    doc.font("Helvetica").fontSize(10).fillColor("#10212c").text(value, x, startY + 12, {
      width: colWidth,
      lineGap: 1,
    });
    return doc.heightOfString(value, { width: colWidth, lineGap: 1 }) + 12;
  };

  const leftHeight = drawCell(leftX, leftLabel, leftValue);
  const rightHeight = rightLabel && rightValue ? drawCell(rightX, rightLabel, rightValue) : 0;
  doc.y = startY + Math.max(leftHeight, rightHeight, 18) + 10;
}

function ensurePdfSpace(doc: InstanceType<typeof PDFDocument>, requiredHeight: number): void {
  if (doc.y + requiredHeight <= doc.page.height - 45) return;
  doc.addPage();
}

function formatOrderSummaryForPdf(summary?: string | null): string {
  const raw = String(summary || "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/\.\s+/g, ".\n");
  const segments = normalized
    .split(/\n|\s+—\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const lines: string[] = [];

  for (const segment of segments) {
    const itemChunks = segment
      .split(/\s*;\s*|\s*,\s*(?=\d+x?\s|\d+\s*x\s|[0-9]+\s*-\s*)/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (itemChunks.length > 1) {
      lines.push(...itemChunks);
      continue;
    }

    const semicolonChunks = segment
      .split(/\s*;\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (semicolonChunks.length > 1) {
      lines.push(...semicolonChunks);
      continue;
    }

    lines.push(segment);
  }

  return lines.join("\n");
}

function extractOrderDeliveryAddressLines(order: Awaited<ReturnType<typeof getAiOrderById>>): string[] {
  const summary = String(order?.summary || "").replace(/\s+/g, " ").trim();
  const addresses: string[] = [];

  if (summary) {
    const segments = summary
      .split(/\s*;\s*(?=\d+x?\s|\d+\s*x\s|Entrega:|destinat[áa]ri[ao]?:)/i)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const recipientMatch = segment.match(/destinat[áa]ri[ao]?:\s*([^—;]+)/i);
      const deliveryMatch = segment.match(/entrega:\s*(.*?)(?=\s+—\s+(?:pagamento|total|taxa|respons[aá]vel|observa|pendente)|$)/i);
      if (!deliveryMatch) continue;

      const value = String(deliveryMatch[1] || "").trim();
      if (!value) continue;

      const normalizedValue = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const isGenericMultipleSummary =
        normalizedValue.includes("multiplos enderecos") ||
        /^\d+\s+entregas?\b/i.test(value) ||
        /^taxa\b/i.test(value);

      if (isGenericMultipleSummary) continue;

      const recipient = String(recipientMatch?.[1] || "").trim();
      addresses.push(recipient ? `${recipient}: ${value}` : value);
    }
  }

  if (addresses.length) return addresses;

  const fallback = String(order?.delivery_address || "").trim();
  if (!fallback) return [];

  const fallbackLines = fallback
    .split(/\s*(?=\d+\)\s)|\n+/)
    .map((line) => line.trim().replace(/;$/, ""))
    .filter(Boolean);

  return fallbackLines.length > 1 ? fallbackLines : [fallback];
}

function normalizePdfSourceText(value?: string | null): string {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function pickFirstOrderTextMatch(
  sources: string[],
  patterns: RegExp[],
): string {
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const value = String(match?.[1] || "").trim().replace(/[.;,\s]+$/g, "");
      if (value) return value;
    }
  }
  return "";
}

function pickFirstOrderTextMatchFromNormalizedSources(
  sources: string[],
  patterns: RegExp[],
): string {
  const normalizedSources = sources.map((source) =>
    String(source || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Ã¡|Ã£|Ã¢/gi, "a")
      .replace(/Ã©|Ãª/gi, "e")
      .replace(/Ã­/gi, "i")
      .replace(/Ã³|Ã´|Ãµ/gi, "o")
      .replace(/Ãº/gi, "u")
      .replace(/Ã§/gi, "c"),
  );

  for (const source of normalizedSources) {
    if (!source) continue;
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const value = String(match?.[1] || "").trim().replace(/[.;,\s]+$/g, "");
      if (value) return value;
    }
  }
  return "";
}

function extractOrderPdfDetails(order: Awaited<ReturnType<typeof getAiOrderById>>) {
  const sources = [
    normalizePdfSourceText(order?.notes),
    normalizePdfSourceText(order?.confirmation_note),
    normalizePdfSourceText(order?.delivery_address),
    normalizePdfSourceText(order?.summary),
  ].filter(Boolean);

  const deliveryDate =
    pickFirstOrderTextMatch(sources, [
      /(?:^|\n|[-*]\s*)data da entrega:\s*([^\n]+)/i,
      /(?:^|\n|[-*]\s*)data:\s*([^\n]+)/i,
    ]) ||
    pickFirstOrderTextMatchFromNormalizedSources(sources, [/\b(\d{2}\/\d{2}\/\d{2,4})\b/]);

  const deliveryTime =
    pickFirstOrderTextMatchFromNormalizedSources(sources, [
      /(?:^|\n|[-*]\s*)hor.{0,3}rio(?: de entrega)?:\s*([^\n]+)/i,
      /(?:^|\n|[-*]\s*)per.{0,3}odo:\s*([^\n]+)/i,
      /(?:^|\n|[-*]\s*)turno:\s*([^\n]+)/i,
    ]) ||
    pickFirstOrderTextMatchFromNormalizedSources(sources, [/\b(?:as)\s+([0-2]?\d(?::[0-5]\d)?h?)\b/i]);

  const contactPhone =
    pickFirstOrderTextMatch(sources, [
      /(?:^|\n|[-*]\s*)telefone(?: de contato)?(?: de quem ir[áa] receber)?\s*:\s*([^\n]+)/i,
      /(?:^|\n|[-*]\s*)contato:\s*([^\n]+)/i,
    ]) || String(order?.customer_phone || "").trim();

  const recipientName = pickFirstOrderTextMatch(sources, [
    /(?:^|\n|[-*]\s*)nome completo de quem vai receber:\s*([^\n]+)/i,
    /(?:^|\n|[-*]\s*)nome(?: de quem vai receber)?\s*:\s*([^\n]+)/i,
  ]);

  return {
    deliveryDate,
    deliveryTime,
    contactPhone,
    recipientName,
  };
}

export function __extractOrderPdfDetailsForTests(order: Partial<Awaited<ReturnType<typeof getAiOrderById>>>) {
  return extractOrderPdfDetails(order as Awaited<ReturnType<typeof getAiOrderById>>);
}

function streamOrderPdf(
  res: Response,
  input: {
    order: Awaited<ReturnType<typeof getAiOrderById>>;
    companyName?: string | null;
    companyCnpj?: string | null;
    companyAddress?: string | null;
  },
) {
  const order = input.order;
  const fileName = `pedido-${String(order?.id || "pedido").slice(0, 8)}.pdf`;
  const doc = new PDFDocument({ margin: 40, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  doc.pipe(res);

  const receiptX = 44;
  const receiptWidth = 330;

  if (input.companyName || input.companyCnpj || input.companyAddress) {
    doc.font("Helvetica-Bold").fontSize(17).fillColor("#10212c").text(input.companyName || "Empresa", receiptX, 42, {
      width: receiptWidth,
    });
    doc.font("Helvetica").fontSize(9).fillColor("#3d4f5c");
    if (input.companyCnpj) doc.text(`CNPJ: ${input.companyCnpj}`, receiptX, doc.y + 1, { width: receiptWidth });
    if (input.companyAddress) doc.text(input.companyAddress, receiptX, doc.y + 1, { width: receiptWidth, lineGap: 1 });
    doc.moveDown(0.65);
  }

  doc
    .moveTo(receiptX, doc.y)
    .lineTo(receiptX + receiptWidth, doc.y)
    .lineWidth(1)
    .strokeColor("#d4dde4")
    .stroke();
  doc.moveDown(0.45);

  const topY = doc.y;
  doc.fillColor("#10212c").font("Helvetica-Bold").fontSize(13).text("Pedido do agente", receiptX, topY, {
    width: receiptWidth,
  });
  doc.font("Helvetica")
    .fontSize(9)
    .fillColor("#3d4f5c")
    .text(`Pedido: ${String(order?.id || "").slice(0, 8).toUpperCase()}`, receiptX, topY + 18, { width: receiptWidth })
    .text(`Emitido em: ${formatDateTimeBrInAppTimeZone()}`, receiptX, topY + 31, { width: receiptWidth });
  doc.y = topY + 48;
  doc.moveDown(0.35);

  const orderStatus = String(order?.status || "").trim();
  const statusLabel = orderStatus === "confirmed" ? "Confirmado" : orderStatus === "cancelled" ? "Cancelado" : "Pendente";
  const derivedOrderDetails = extractOrderPdfDetails(order);

  const writeReceiptField = (label: string, value: string) => {
    if (!value || value === "-") return;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#10212c").text(`${label}:`, receiptX, doc.y, {
      width: receiptWidth,
    });
    doc.font("Helvetica").fontSize(10).fillColor("#10212c").text(value, receiptX, doc.y + 2, {
      width: receiptWidth,
      lineGap: 1,
    });
    doc.moveDown(0.35);
  };

  writeReceiptField("Cliente", String(order?.conversation_name || order?.customer_phone || "-"));
  writeReceiptField("Status", statusLabel);
  writeReceiptField("Total estimado", formatCurrencyBr(order?.total_estimate));
  writeReceiptField("Responsável", String(order?.responsible_name || "-"));
  writeReceiptField("Recebedor", String(derivedOrderDetails.recipientName || "-"));
  writeReceiptField("Entrega/retirada", String(order?.fulfillment_type || "-"));
  const deliveryAddressLines = extractOrderDeliveryAddressLines(order);
  writeReceiptField(deliveryAddressLines.length > 1 ? "Endereços/retirada" : "Endereço/retirada", deliveryAddressLines.join("\n") || "-");
  writeReceiptField("Telefone de contato", String(derivedOrderDetails.contactPhone || "-"));
  writeReceiptField("Data da entrega", String(derivedOrderDetails.deliveryDate || "-"));
  writeReceiptField("Horário/período", String(derivedOrderDetails.deliveryTime || "-"));
  writeReceiptField("Pagamento", String(order?.payment_method || "-"));
  writeReceiptField("Observação", String(order?.notes || "-"));
  writeReceiptField("Tempo mínimo", order?.ready_time_minutes ? `${order.ready_time_minutes} minuto(s)` : "-");
  writeReceiptField("Observação da confirmação", String(order?.confirmation_note || "-"));
  writeReceiptField("Motivo do cancelamento", String(order?.cancel_reason || "-"));

  doc.moveDown(0.3);
  doc
    .moveTo(receiptX, doc.y)
    .lineTo(receiptX + receiptWidth, doc.y)
    .lineWidth(1)
    .strokeColor("#d4dde4")
    .stroke();
  doc.moveDown(0.45);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#10212c").text("Itens do pedido", receiptX, doc.y, {
    width: receiptWidth,
  });
  doc.moveDown(0.4);
  ensurePdfSpace(doc, 120);
  const tableX = receiptX;
  const tableTopY = doc.y;
  const qtyX = tableX + 8;
  const itemX = tableX + 48;
  const unitX = tableX + 230;
  const totalX = tableX + 282;

  doc.rect(tableX, tableTopY, receiptWidth, 22).fill("#163140");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
  doc.text("QTD", qtyX, tableTopY + 7, { width: 28 });
  doc.text("ITEM", itemX, tableTopY + 7, { width: 172 });
  doc.text("UN.", unitX, tableTopY + 7, { width: 42, align: "right" });
  doc.text("TOTAL", totalX, tableTopY + 7, { width: 40, align: "right" });

  let rowY = tableTopY + 22;
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) {
    doc.rect(tableX, rowY, receiptWidth, 24).fill("#f8fafc");
    doc.font("Helvetica").fontSize(9).fillColor("#10212c").text("Sem itens detalhados", tableX + 8, rowY + 8, {
      width: receiptWidth - 16,
    });
    rowY += 24;
  } else {
    items.forEach((entry, index) => {
      const quantity = Number(entry?.quantity || entry?.qty || 1);
      const itemName = String(entry?.name || entry?.product || "Item").trim();
      const unitPrice = Number(entry?.unit_price ?? entry?.price ?? 0);
      const totalPrice = Number.isFinite(unitPrice) ? unitPrice * (Number.isFinite(quantity) ? quantity : 1) : 0;
      const bg = index % 2 === 0 ? "#f8fafc" : "#eef3f7";
      const rowHeight = Math.max(
        24,
        doc.heightOfString(itemName, { width: 172, lineGap: 1 }) + 10,
      );
      ensurePdfSpace(doc, rowHeight + 20);
      if (doc.y > rowY) {
        rowY = doc.y;
      }
      doc.rect(tableX, rowY, receiptWidth, rowHeight).fill(bg);
      doc.font("Helvetica").fontSize(9).fillColor("#10212c");
      doc.text(String(Number.isFinite(quantity) ? quantity : 1), qtyX, rowY + 7, { width: 28 });
      doc.text(itemName, itemX, rowY + 7, { width: 172, lineGap: 1 });
      doc.text(formatCurrencyBr(unitPrice), unitX, rowY + 7, { width: 42, align: "right" });
      doc.text(formatCurrencyBr(totalPrice), totalX, rowY + 7, { width: 40, align: "right" });
      rowY += rowHeight;
    });
  }

  doc.rect(tableX, rowY, receiptWidth, 24).fill("#dfe8ee");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#10212c");
  doc.text("TOTAL DO PEDIDO", tableX + 8, rowY + 8, { width: 190 });
  doc.text(formatCurrencyBr(order?.total_estimate), totalX, rowY + 8, { width: 40, align: "right" });
  doc.y = rowY + 32;

  if (order?.summary) {
    doc.moveDown(0.2);
    doc
      .moveTo(receiptX, doc.y)
      .lineTo(receiptX + receiptWidth, doc.y)
      .lineWidth(1)
      .strokeColor("#d4dde4")
      .stroke();
    doc.moveDown(0.45);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#10212c").text("Resumo interno", receiptX, doc.y, {
      width: receiptWidth,
    });
    doc.font("Helvetica").fontSize(9).fillColor("#10212c").text(formatOrderSummaryForPdf(order.summary), receiptX, doc.y + 2, {
      width: receiptWidth,
      lineGap: 2,
    });
  }

  doc.end();
}

function formatCustomerScheduleMessage(input: {
  greeting?: string;
  statusLine: string;
  serviceName?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  durationMinutes?: number | null;
  note?: string | null;
  cancelReason?: string | null;
}) {
  const dateLine =
    input.scheduledDate && input.scheduledTime
      ? `${formatShortBrDate(input.scheduledDate)} às ${input.scheduledTime}`
      : formatShortBrDate(input.scheduledDate) || input.scheduledTime || "";

  const parts = [
    input.greeting?.trim() || "",
    input.statusLine.trim(),
    input.serviceName?.trim() ? `Serviço:\n${input.serviceName.trim()}` : "",
    dateLine ? `Data e horário:\n${dateLine}` : "",
    Number.isFinite(input.durationMinutes) ? `Duração média:\n${Math.round(Number(input.durationMinutes))} minuto(s)` : "",
    input.note?.trim() ? `Informações adicionais:\n${input.note.trim()}` : "",
    input.cancelReason?.trim() ? `Motivo do cancelamento:\n${input.cancelReason.trim()}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

async function buildOperationalCustomerMessage(input: {
  accountId?: string | null;
  eventType:
    | "order_confirmation"
    | "order_cancellation"
    | "schedule_confirmation"
    | "schedule_cancellation"
    | "schedule_reminder"
    | "schedule_reschedule_request";
  customerName?: string | null;
  facts: Array<string | null | undefined>;
  extraGuidance?: string | null;
  fallback: () => string;
}): Promise<string> {
  const facts = input.facts.map((item) => String(item || "").trim()).filter(Boolean);
  if (!facts.length) {
    return input.fallback();
  }

  const normalizeForFactMatch = (value: string) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const normalizedEventType = String(input.eventType || "").trim().toLowerCase();

  const badPhrases = [
    "agente combina",
    "o agente combina",
    "agente segue com voce",
    "agente sigo com voce",
  ];

  const stopwords = new Set([
    "pedido",
    "agendamento",
    "servico",
    "serviço",
    "resumo",
    "motivo",
    "informacao",
    "informação",
    "adicional",
    "tempo",
    "estimado",
    "horario",
    "horário",
    "data",
    "media",
    "média",
    "minuto",
    "minutos",
    "cliente",
    "confirmado",
    "cancelado",
    "sucesso",
    "foi",
    "com",
    "sem",
    "para",
    "das",
    "dos",
    "que",
    "uma",
    "por",
    "via",
    "ja",
    "já",
    "esse",
    "essa",
    "neste",
    "neste",
    "atendimento",
    "horario",
    "horário",
    "prazo",
    "cliente",
    "pedido",
    "agendamento",
  ]);

  const pickSignificantWords = (value: string, limit = 2) =>
    normalizeForFactMatch(value)
      .split(/[^a-z0-9]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && !stopwords.has(item))
      .slice(0, limit);

  const buildValidationTokens = (fact: string) => {
    const normalizedFact = normalizeForFactMatch(fact);
    const tokens: string[] = [];

    const timeMatches = fact.match(/\b\d{1,2}:\d{2}\b/g) || [];
    const dateMatches = fact.match(/\b\d{2}\/\d{2}\/\d{2,4}\b/g) || [];
    const currencyMatches = fact.match(/r\$\s*\d[\d\.\,]*/gi) || [];
    tokens.push(
      ...timeMatches.map(normalizeForFactMatch),
      ...dateMatches.map(normalizeForFactMatch),
      ...currencyMatches.map(normalizeForFactMatch),
    );

    const paymentKeywords = ["pix", "cartao", "crédito", "credito", "debito", "débito", "dinheiro", "boleto"];
    paymentKeywords.forEach((keyword) => {
      const normalizedKeyword = normalizeForFactMatch(keyword);
      if (normalizedFact.includes(normalizedKeyword)) {
        tokens.push(normalizedKeyword);
      }
    });

    if (normalizedFact.includes("confirmado")) tokens.push("confirm");
    if (normalizedFact.includes("cancelado")) tokens.push("cancel");
    if (normalizedFact.includes("lembrete")) tokens.push("lembrete");
    if (normalizedFact.includes("reagendamento")) tokens.push("reagend");
    if (normalizedFact.includes("agendamento")) tokens.push("agendamento");
    if (normalizedFact.includes("pedido")) tokens.push("pedido");
    if (normalizedFact.includes("servico") || normalizedFact.includes("serviço")) tokens.push("serv");

    const labelMatch = fact.match(/^[^:]+:\s*(.+)$/);
    if (labelMatch?.[1]) {
      const valuePart = String(labelMatch[1] || "").trim();
      if (/^resumo do pedido:/i.test(fact)) {
        valuePart
          .split(/\s+e\s+|,\s*|\s*;\s*/)
          .map((item) => pickSignificantWords(item, 1))
          .forEach((items) => tokens.push(...items));
      } else {
        tokens.push(...pickSignificantWords(valuePart, 2));
      }
    }

    return Array.from(new Set(tokens.filter(Boolean)));
  };

  const eventRequiredTokens = () => {
    switch (normalizedEventType) {
      case "order_confirmation":
        return ["pedido", "confirm"];
      case "order_cancellation":
        return ["pedido", "cancel"];
      case "schedule_confirmation":
        return ["agendamento", "confirm"];
      case "schedule_cancellation":
        return ["agendamento", "cancel"];
      case "schedule_reminder":
        return ["lembrete"];
      case "schedule_reschedule_request":
        return ["reagend"];
      default:
        return [];
    }
  };

  const validateOperationalMessage = (message: string) => {
    const normalizedMessage = normalizeForFactMatch(message);
    if (!normalizedMessage.trim()) {
      return false;
    }
    if (badPhrases.some((phrase) => normalizedMessage.includes(phrase))) {
      return false;
    }

    const requiredTokens = Array.from(new Set([...eventRequiredTokens(), ...facts.flatMap((fact) => buildValidationTokens(fact))]));
    return requiredTokens.every((token) => normalizedMessage.includes(token));
  };

  try {
    const aiMessage = await generateAiOperationalMessage({
      accountId: input.accountId || null,
      eventType: input.eventType,
      customerName: input.customerName || null,
      facts,
      extraGuidance: input.extraGuidance || null,
    });
    const finalMessage = String(aiMessage || "").trim();
    if (!finalMessage || !validateOperationalMessage(finalMessage)) {
      return input.fallback();
    }
    return finalMessage;
  } catch (error) {
    console.error("Falha ao gerar mensagem operacional por IA:", error);
    return input.fallback();
  }
}

export async function processDueScheduleReminders(): Promise<number> {
  const dueItems = await listAiSchedulesDueForReminder();
  let sentCount = 0;

  for (const schedule of dueItems) {
    if (!schedule.customer_phone || !schedule.account_wa_jid || !schedule.schedule_reminder_minutes) {
      continue;
    }

    const customerName = String(schedule.customer_name || schedule.conversation_name || "").trim();
    const message = await buildOperationalCustomerMessage({
      accountId: schedule.account_id || null,
      eventType: "schedule_reminder",
      customerName,
      facts: [
        "É um lembrete de atendimento já confirmado.",
        schedule.service_name ? `Serviço: ${schedule.service_name}` : null,
        schedule.scheduled_date && schedule.scheduled_time
          ? `Horário: ${formatShortBrDate(schedule.scheduled_date)} às ${schedule.scheduled_time}`
          : null,
      ],
      extraGuidance: "Mantenha a mensagem curta e clara. O objetivo é apenas lembrar o cliente do horário confirmado.",
      fallback: () =>
        [
          customerName ? `${customerName},` : "",
          "este é um lembrete do seu atendimento confirmado.",
          schedule.service_name ? `Serviço: ${schedule.service_name}` : "",
          schedule.scheduled_date && schedule.scheduled_time
            ? `Horário: ${formatShortBrDate(schedule.scheduled_date)} às ${schedule.scheduled_time}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
    });

    const waResponse = await sendWhatsAppText({
      to: schedule.customer_phone,
      message,
      accountJid: schedule.account_wa_jid,
    });

    await saveOutboundMessage({
      accountJid: schedule.account_wa_jid,
      accountDisplayName: null,
      phone: schedule.customer_phone,
      body: message,
      messageType: "text",
      externalMessageId: waResponse?.key?.id || null,
      status: "sent",
      payload: waResponse,
      metadata: {
        ai_generated: true,
        ai_schedule_reminder: true,
        ai_schedule_id: schedule.id,
        reminder_minutes: schedule.schedule_reminder_minutes,
      },
    });

    await markAiScheduleReminderSent(schedule.id, schedule.schedule_reminder_minutes);
    sentCount += 1;
  }

  return sentCount;
}

function normalizeScheduleWorkingDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item: any) => ({
      day_of_week: Number(item?.day_of_week),
      enabled: Boolean(item?.enabled),
      start_time: String(item?.start_time || "").trim(),
      end_time: String(item?.end_time || "").trim(),
      morning_enabled: item?.morning_enabled === undefined ? undefined : Boolean(item?.morning_enabled),
      morning_start: String(item?.morning_start || "").trim(),
      morning_end: String(item?.morning_end || "").trim(),
      afternoon_enabled: item?.afternoon_enabled === undefined ? undefined : Boolean(item?.afternoon_enabled),
      afternoon_start: String(item?.afternoon_start || "").trim(),
      afternoon_end: String(item?.afternoon_end || "").trim(),
      night_enabled: item?.night_enabled === undefined ? undefined : Boolean(item?.night_enabled),
      night_start: String(item?.night_start || "").trim(),
      night_end: String(item?.night_end || "").trim(),
      lunch_break_enabled: item?.lunch_break_enabled === undefined ? undefined : Boolean(item?.lunch_break_enabled),
      lunch_start: String(item?.lunch_start || "").trim(),
      lunch_end: String(item?.lunch_end || "").trim(),
    }))
    .filter((item: { day_of_week: number }) =>
      Number.isInteger(item.day_of_week) && item.day_of_week >= 0 && item.day_of_week <= 6,
    );
}

function normalizeScheduleReminderRules(
  value: unknown,
  legacyEnabled = false,
  legacyMinutes: number | null = null,
): Array<{ value: number; unit: "minutes" | "hours" | "days"; offset_minutes: number }> {
  const rawItems = Array.isArray(value)
    ? value
    : legacyEnabled && Number.isFinite(Number(legacyMinutes)) && Number(legacyMinutes) > 0
      ? [{ value: Number(legacyMinutes), unit: "minutes" }]
      : [];

  const normalized = rawItems
    .map((item: any) => {
      const rawUnit = String(item?.unit || "minutes").trim().toLowerCase();
      const unit = rawUnit === "days" || rawUnit === "hours" || rawUnit === "minutes" ? rawUnit : "minutes";
      const rawValue = Number(item?.value);
      const value = Number.isFinite(rawValue) ? Math.max(1, Math.round(rawValue)) : null;
      if (!value) return null;
      const offsetMinutes = unit === "days" ? value * 1440 : unit === "hours" ? value * 60 : value;
      return { value, unit: unit as "minutes" | "hours" | "days", offset_minutes: offsetMinutes };
    })
    .filter(
      (item): item is { value: number; unit: "minutes" | "hours" | "days"; offset_minutes: number } => Boolean(item),
    );

  const seen = new Set<string>();
  return normalized.filter((item: any) => {
    const key = `${item.unit}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAgentGuidelines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => String(line || "").replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

router.get("/status", (req, res) => {
  const authReq = req as AuthRequest;
  void (async () => {
    return res.status(200).json(await getOpenAIStatus(authReq.authUser?.company_id || null));
  })().catch((error) => {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao obter status do agente.",
    });
  });
});

router.post("/test", async (_req, res) => {
  try {
    const result = await testOpenAIConnection();
    return res.status(200).json({
      status: "ok",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar a conexão com a OpenAI.";
    const status = message === "OPENAI_API_KEY_NOT_CONFIGURED" ? 400 : 502;
    return res.status(status).json({
      error: message === "OPENAI_API_KEY_NOT_CONFIGURED" ? "OPENAI_API_KEY não configurada." : message,
    });
  }
});

router.get("/settings", async (req, res) => {
  const authReq = req as AuthRequest;
  const accountId = String(req.query.account_id || "").trim();
  if (!accountId) {
    return res.status(400).json({ error: "Informe account_id." });
  }

  try {
    const account = await getWhatsAppAccountById(accountId, authReq.authUser?.company_id || null);
    if (!account) {
      return res.status(404).json({ error: "Conta nao encontrada para esta empresa." });
    }
    const settings = await getAiAccountSettings(accountId);
    return res.status(200).json({
      account_id: accountId,
      agent_name: settings?.agent_name || "",
      company_name: settings?.company_name || "",
      mood: settings?.mood || "informal",
      agent_guidelines: Array.isArray(settings?.agent_guidelines) ? settings.agent_guidelines : [],
      store_name: settings?.store_name || "",
      store_description: settings?.store_description || "",
      store_cnpj: settings?.store_cnpj || "",
      store_address: settings?.store_address || "",
      store_payment_methods: Array.isArray(settings?.store_payment_methods) ? settings.store_payment_methods : [],
      store_delivery_fees: Array.isArray(settings?.store_delivery_fees) ? settings.store_delivery_fees : [],
      schedule_working_days: normalizeScheduleWorkingDays(settings?.schedule_working_days),
      schedule_interval_minutes:
        settings?.schedule_interval_minutes != null ? Number(settings.schedule_interval_minutes) : null,
      schedule_reminder_enabled: Boolean(settings?.schedule_reminder_enabled),
      schedule_reminder_minutes:
        settings?.schedule_reminder_minutes != null ? Number(settings.schedule_reminder_minutes) : null,
      schedule_reminder_rules: normalizeScheduleReminderRules(
        settings?.schedule_reminder_rules,
        Boolean(settings?.schedule_reminder_enabled),
        settings?.schedule_reminder_minutes != null ? Number(settings.schedule_reminder_minutes) : null,
      ),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao carregar as configurações do agente.",
    });
  }
});

router.put("/settings", async (req, res) => {
  const authReq = req as AuthRequest;
  const accountId = String(req.body?.account_id || "").trim();
  const agentName = String(req.body?.agent_name || "").trim();
  const companyName = String(req.body?.company_name || "").trim();
  const rawMood = String(req.body?.mood || "").trim().toLowerCase();
  const mood = ["amigavel", "informal", "formal"].includes(rawMood) ? rawMood : "informal";
  const agentGuidelines = normalizeAgentGuidelines(req.body?.agent_guidelines);
  const storeName = String(req.body?.store_name || "").trim();
  const storeDescription = String(req.body?.store_description || "").trim();
  const storeCnpj = String(req.body?.store_cnpj || "").trim();
  const storeAddress = String(req.body?.store_address || "").trim();
  const storePaymentMethods = Array.isArray(req.body?.store_payment_methods)
    ? req.body.store_payment_methods.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const storeDeliveryFees = Array.isArray(req.body?.store_delivery_fees)
    ? req.body.store_delivery_fees
        .map((item: any) => ({
          label: String(item?.label || "").trim(),
          price: String(item?.price || "").trim(),
        }))
        .filter((item: { label: string; price: string }) => item.label || item.price)
    : [];
  const scheduleWorkingDays = normalizeScheduleWorkingDays(req.body?.schedule_working_days);
  const scheduleIntervalMinutes = Number(req.body?.schedule_interval_minutes);
  const scheduleReminderEnabled = Boolean(req.body?.schedule_reminder_enabled);
  const scheduleReminderMinutes = Number(req.body?.schedule_reminder_minutes);
  const scheduleReminderRules = normalizeScheduleReminderRules(
    req.body?.schedule_reminder_rules,
    scheduleReminderEnabled,
    Number.isFinite(scheduleReminderMinutes) ? scheduleReminderMinutes : null,
  );
  const firstScheduleReminder = scheduleReminderRules[0] || null;

  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!accountId) {
    return res.status(400).json({ error: "Informe account_id." });
  }

  try {
    const account = await getWhatsAppAccountById(accountId, authReq.authUser?.company_id || null);
    if (!account) {
      return res.status(404).json({ error: "Conta nao encontrada para esta empresa." });
    }
    const settings = await upsertAiAccountSettings({
      accountId,
      agentName,
      companyName,
      mood,
      agentGuidelines,
      storeName,
      storeDescription,
      storeCnpj,
      storeAddress,
      storePaymentMethods,
      storeDeliveryFees,
      scheduleWorkingDays,
      scheduleIntervalMinutes: Number.isFinite(scheduleIntervalMinutes) && scheduleIntervalMinutes >= 0 ? scheduleIntervalMinutes : null,
      scheduleReminderEnabled: scheduleReminderEnabled && scheduleReminderRules.length > 0,
      scheduleReminderMinutes:
        scheduleReminderEnabled && firstScheduleReminder
          ? Number(firstScheduleReminder.offset_minutes || scheduleReminderMinutes || 0)
          : null,
      scheduleReminderRules,
    });
    return res.status(200).json({
      status: "ok",
      settings,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao salvar as configurações do agente.",
    });
  }
});

router.get("/orders", async (req, res) => {
  const authReq = req as AuthRequest;
  const accountId = String(req.query.account_id || "").trim() || null;

  try {
    if (accountId) {
      const account = await getWhatsAppAccountById(accountId, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Conta nao encontrada para esta empresa." });
      }
    }
    const items = await listAiOrders(accountId, authReq.authUser?.company_id || null);
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao carregar pedidos do agente.",
    });
  }
});

router.get("/orders/:orderId/pdf", async (req, res) => {
  const authReq = req as AuthRequest;
  const orderId = String(req.params.orderId || "").trim();

  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!orderId) {
    return res.status(400).json({ error: "Pedido invalido." });
  }

  try {
    const order = await getAiOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    if (order.account_id) {
      const account = await getWhatsAppAccountById(order.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Pedido nao pertence a esta empresa." });
      }
    }
    const settings = order.account_id ? await getAiAccountSettings(order.account_id).catch(() => null) : null;
    streamOrderPdf(res, {
      order,
      companyName: settings?.store_name || settings?.company_name || authReq.authUser?.name || "Empresa",
      companyCnpj: settings?.store_cnpj || null,
      companyAddress: settings?.store_address || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao gerar PDF do pedido.",
    });
  }
});

router.get("/schedules", async (req, res) => {
  const authReq = req as AuthRequest;
  const accountId = String(req.query.account_id || "").trim() || null;
  const month = String(req.query.month || "").trim();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "Informe month no formato YYYY-MM." });
  }

  try {
    if (accountId) {
      const account = await getWhatsAppAccountById(accountId, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Conta nao encontrada para esta empresa." });
      }
    }
    const items = await listAiSchedules(month, accountId, authReq.authUser?.company_id || null);
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao carregar agendamentos do agente.",
    });
  }
});

router.post("/orders/:orderId/confirm", async (req, res) => {
  const authReq = req as AuthRequest;
  const orderId = String(req.params.orderId || "").trim();
  const readyTimeMinutes = Number(req.body?.ready_time_minutes);
  const confirmationNote = String(req.body?.confirmation_note || "").trim();
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!orderId) {
    return res.status(400).json({ error: "Pedido invalido." });
  }
  if (!Number.isFinite(readyTimeMinutes) || readyTimeMinutes <= 0) {
    return res.status(400).json({ error: "Informe o tempo mínimo para o pedido ficar pronto." });
  }

  try {
    const order = await getAiOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    if (order.account_id) {
      const account = await getWhatsAppAccountById(order.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Pedido nao pertence a esta empresa." });
      }
    }
    if (order.status === "cancelled") {
      return res.status(409).json({ error: "Este pedido ja foi cancelado." });
    }
    if (order.status === "confirmed") {
      return res.status(409).json({ error: "Este pedido ja foi confirmado." });
    }

    const updated = await confirmAiOrder(orderId, authReq.authUser.id, Math.round(readyTimeMinutes), confirmationNote || null);
    if (!updated) {
      return res.status(400).json({ error: "Não foi possível confirmar o pedido." });
    }

    if (order.customer_phone && order.account_wa_jid) {
      const customerName = String(order.conversation_name || "").trim();
      const orderSummary = String(order.summary || "").trim();
      const message = await buildOperationalCustomerMessage({
        accountId: order.account_id || null,
        eventType: "order_confirmation",
        customerName,
        facts: [
          "O pedido foi confirmado com sucesso.",
          orderSummary ? `Resumo do pedido: ${orderSummary}` : null,
          order.notes ? `Observação do pedido: ${order.notes}` : null,
          `Tempo estimado: ${Math.round(readyTimeMinutes)} minuto(s)`,
          confirmationNote ? `Informação adicional: ${confirmationNote}` : null,
        ],
        extraGuidance: "Deixe claro que o pedido foi confirmado e informe o prazo/tempo estimado com naturalidade.",
        fallback: () =>
          formatCustomerOrderMessage({
            greeting: customerName ? `${customerName},` : "",
            statusLine: "seu pedido foi confirmado com sucesso.",
            summary: orderSummary || "",
            orderNotes: order.notes || null,
            readyTimeMinutes: Math.round(readyTimeMinutes),
            note: confirmationNote || null,
          }),
      });

      const waResponse = await sendWhatsAppText({
        to: order.customer_phone,
        message,
        accountJid: order.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: order.account_wa_jid,
        accountDisplayName: null,
        phone: order.customer_phone,
        body: message,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_order_confirmation: true,
          ai_order_id: order.id,
          ready_time_minutes: Math.round(readyTimeMinutes),
          confirmation_note: confirmationNote || null,
        },
      });
    }

    return res.status(200).json({
      status: "ok",
      order: updated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao confirmar pedido.",
    });
  }
});

router.post("/orders/:orderId/cancel", async (req, res) => {
  const authReq = req as AuthRequest;
  const orderId = String(req.params.orderId || "").trim();
  const reason = String(req.body?.reason || "").trim();
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!orderId) {
    return res.status(400).json({ error: "Pedido invalido." });
  }
  if (!reason) {
    return res.status(400).json({ error: "Informe o motivo do cancelamento." });
  }

  try {
    const order = await getAiOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    if (order.account_id) {
      const account = await getWhatsAppAccountById(order.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Pedido nao pertence a esta empresa." });
      }
    }
    if (order.status === "cancelled") {
      return res.status(409).json({ error: "Este pedido ja foi cancelado." });
    }

    const updated = await cancelAiOrder(orderId, authReq.authUser.id, reason);
    if (!updated) {
      return res.status(400).json({ error: "Não foi possível cancelar o pedido." });
    }

    if (order.customer_phone && order.account_wa_jid) {
      const customerName = String(order.conversation_name || "").trim();
      const orderSummary = String(order.summary || "").trim();
      const message = await buildOperationalCustomerMessage({
        accountId: order.account_id || null,
        eventType: "order_cancellation",
        customerName,
        facts: [
          "O pedido foi cancelado.",
          orderSummary ? `Resumo do pedido: ${orderSummary}` : null,
          order.notes ? `Observação do pedido: ${order.notes}` : null,
          `Motivo do cancelamento: ${reason}`,
        ],
        extraGuidance: "Seja claro, respeitoso e direto. Não pareça ríspido.",
        fallback: () =>
          formatCustomerOrderMessage({
            greeting: customerName ? `${customerName},` : "",
            statusLine: "seu pedido foi cancelado.",
            summary: orderSummary || "",
            orderNotes: order.notes || null,
            cancelReason: reason,
          }),
      });

      const waResponse = await sendWhatsAppText({
        to: order.customer_phone,
        message,
        accountJid: order.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: order.account_wa_jid,
        accountDisplayName: null,
        phone: order.customer_phone,
        body: message,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_order_cancelled: true,
          ai_order_id: order.id,
          cancel_reason: reason,
        },
      });
    }

    return res.status(200).json({
      status: "ok",
      order: updated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao cancelar pedido.",
    });
  }
});

router.delete("/orders/:orderId", async (req, res) => {
  const authReq = req as AuthRequest;
  const orderId = String(req.params.orderId || "").trim();
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!orderId) {
    return res.status(400).json({ error: "Pedido invalido." });
  }

  try {
    const exists = await getAiOrderById(orderId);
    if (!exists) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    if (exists.account_id) {
      const account = await getWhatsAppAccountById(exists.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Pedido nao pertence a esta empresa." });
      }
    }
    const deleted = await deleteAiOrder(orderId);
    if (!deleted) {
      return res.status(400).json({ error: "Não foi possível excluir o pedido." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao excluir pedido.",
    });
  }
});

router.post("/schedules/:scheduleId/confirm", async (req, res) => {
  const authReq = req as AuthRequest;
  const scheduleId = String(req.params.scheduleId || "").trim();
  const confirmationNote = String(req.body?.confirmation_note || "").trim();
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!scheduleId) {
    return res.status(400).json({ error: "Agendamento invalido." });
  }

  try {
    const schedule = await getAiScheduleById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: "Agendamento nao encontrado." });
    }
    if (schedule.account_id) {
      const account = await getWhatsAppAccountById(schedule.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Agendamento nao pertence a esta empresa." });
      }
    }
    if (schedule.status === "cancelled") {
      return res.status(400).json({ error: "Agendamento ja cancelado." });
    }
    if (schedule.status === "confirmed") {
      return res.status(200).json({ status: "ok", schedule });
    }

    const updated = await confirmAiSchedule(scheduleId, authReq.authUser.id, confirmationNote || null);
    if (!updated) {
      return res.status(400).json({ error: "Nao foi possivel confirmar o agendamento." });
    }

    if (schedule.customer_phone && schedule.account_wa_jid) {
      const customerName = String(schedule.customer_name || schedule.conversation_name || "").trim();
      const message = await buildOperationalCustomerMessage({
        accountId: schedule.account_id || null,
        eventType: "schedule_confirmation",
        customerName,
        facts: [
          "O agendamento foi confirmado com sucesso.",
          schedule.service_name ? `Serviço: ${schedule.service_name}` : null,
          schedule.scheduled_date && schedule.scheduled_time
            ? `Data e horário: ${formatShortBrDate(schedule.scheduled_date)} às ${schedule.scheduled_time}`
            : null,
          Number.isFinite(schedule.duration_minutes) ? `Duração média: ${Math.round(Number(schedule.duration_minutes))} minuto(s)` : null,
          confirmationNote ? `Informação adicional: ${confirmationNote}` : null,
        ],
        extraGuidance: "A mensagem deve soar como uma confirmação operacional do atendimento já aprovado.",
        fallback: () =>
          formatCustomerScheduleMessage({
            greeting: customerName ? `${customerName},` : "",
            statusLine: "seu agendamento foi confirmado com sucesso.",
            serviceName: schedule.service_name || "",
            scheduledDate: schedule.scheduled_date || "",
            scheduledTime: schedule.scheduled_time || "",
            durationMinutes: schedule.duration_minutes,
            note: confirmationNote || null,
          }),
      });

      const waResponse = await sendWhatsAppText({
        to: schedule.customer_phone,
        message,
        accountJid: schedule.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: schedule.account_wa_jid,
        accountDisplayName: null,
        phone: schedule.customer_phone,
        body: message,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_schedule_confirmation: true,
          ai_schedule_id: schedule.id,
        },
      });
    }

    return res.status(200).json({
      status: "ok",
      schedule: updated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao confirmar agendamento.",
    });
  }
});

router.post("/schedules/:scheduleId/cancel", async (req, res) => {
  const authReq = req as AuthRequest;
  const scheduleId = String(req.params.scheduleId || "").trim();
  const reason = String(req.body?.reason || "").trim() || "Agendamento cancelado internamente.";
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!scheduleId) {
    return res.status(400).json({ error: "Agendamento invalido." });
  }

  try {
    const schedule = await getAiScheduleById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: "Agendamento nao encontrado." });
    }
    if (schedule.account_id) {
      const account = await getWhatsAppAccountById(schedule.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Agendamento nao pertence a esta empresa." });
      }
    }
    if (schedule.status === "cancelled") {
      return res.status(200).json({ status: "ok", schedule });
    }

    const updated = await cancelAiSchedule(scheduleId, authReq.authUser.id, reason);
    if (!updated) {
      return res.status(400).json({ error: "Nao foi possivel cancelar o agendamento." });
    }

    if (schedule.customer_phone && schedule.account_wa_jid) {
      const customerName = String(schedule.customer_name || schedule.conversation_name || "").trim();
      const message = await buildOperationalCustomerMessage({
        accountId: schedule.account_id || null,
        eventType: "schedule_cancellation",
        customerName,
        facts: [
          "O agendamento foi cancelado.",
          schedule.service_name ? `Serviço: ${schedule.service_name}` : null,
          schedule.scheduled_date && schedule.scheduled_time
            ? `Data e horário: ${formatShortBrDate(schedule.scheduled_date)} às ${schedule.scheduled_time}`
            : null,
          `Motivo do cancelamento: ${reason}`,
        ],
        extraGuidance: "A mensagem deve ser clara e respeitosa, explicando o cancelamento sem soar fria.",
        fallback: () =>
          formatCustomerScheduleMessage({
            greeting: customerName ? `${customerName},` : "",
            statusLine: "seu agendamento foi cancelado.",
            serviceName: schedule.service_name || "",
            scheduledDate: schedule.scheduled_date || "",
            scheduledTime: schedule.scheduled_time || "",
            cancelReason: reason,
          }),
      });

      const waResponse = await sendWhatsAppText({
        to: schedule.customer_phone,
        message,
        accountJid: schedule.account_wa_jid,
      });

      await saveOutboundMessage({
        accountJid: schedule.account_wa_jid,
        accountDisplayName: null,
        phone: schedule.customer_phone,
        body: message,
        messageType: "text",
        externalMessageId: waResponse?.key?.id || null,
        status: "sent",
        payload: waResponse,
        metadata: {
          ai_generated: true,
          ai_schedule_cancelled: true,
          ai_schedule_id: schedule.id,
        },
      });
    }

    return res.status(200).json({
      status: "ok",
      schedule: updated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao cancelar agendamento.",
    });
  }
});

router.post("/schedules/:scheduleId/reschedule-assistant", async (req, res) => {
  const authReq = req as AuthRequest;
  const scheduleId = String(req.params.scheduleId || "").trim();
  const mode = String(req.body?.mode || "").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const suggestedDate = parseBrDateToIso(String(req.body?.suggested_date || "").trim());
  const suggestedTime = String(req.body?.suggested_time || "").trim();

  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!scheduleId) {
    return res.status(400).json({ error: "Agendamento invalido." });
  }
  if (mode !== "ai" && mode !== "human") {
    return res.status(400).json({ error: "Modo de reagendamento invalido." });
  }

  try {
    const schedule = await getAiScheduleById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: "Agendamento nao encontrado." });
    }
    if (schedule.account_id) {
      const account = await getWhatsAppAccountById(schedule.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Agendamento nao pertence a esta empresa." });
      }
    }
    if (schedule.status === "cancelled") {
      return res.status(400).json({ error: "Agendamento cancelado nao pode ser reagendado." });
    }

    if (mode === "human") {
      return res.status(200).json({
        status: "ok",
        mode: "human",
        conversation_id: schedule.conversation_id || null,
      });
    }

    if (!schedule.conversation_id || !schedule.customer_phone || !schedule.account_wa_jid) {
      return res.status(400).json({ error: "Esse agendamento nao tem conversa vinculada para a IA seguir." });
    }
    if (!reason) {
      return res.status(400).json({ error: "Informe o motivo do reagendamento." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(suggestedDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(suggestedTime)) {
      return res.status(400).json({ error: "Data ou horario sugerido invalido." });
    }

    const slotValidation = await validateAiScheduleSlot({
      accountId: schedule.account_id || null,
      scheduleId: schedule.id,
      scheduledDate: suggestedDate,
      scheduledTime: suggestedTime,
      durationMinutes: schedule.duration_minutes,
    });
    if (!slotValidation.ok) {
      if (slotValidation.code === "AI_SCHEDULE_CONFLICT") {
        return res.status(409).json({
          error: "Ja existe um agendamento nesse horario.",
          conflict: slotValidation.conflict || null,
        });
      }
      if (slotValidation.code === "AI_SCHEDULE_TOO_SOON_OR_PAST") {
        return res.status(400).json({ error: "O agendamento precisa ter pelo menos 15 minutos de antecedencia." });
      }
      return res.status(400).json({ error: "Horario fora do expediente configurado para esta empresa." });
    }

    const customerName = String(schedule.customer_name || schedule.conversation_name || "").trim();
    const message = await buildOperationalCustomerMessage({
      accountId: schedule.account_id || null,
      eventType: "schedule_reschedule_request",
      customerName,
      facts: [
        schedule.service_name ? `Serviço afetado: ${schedule.service_name}` : null,
        `Motivo do reagendamento: ${reason}`,
        `Novo horário sugerido: ${formatShortBrDate(suggestedDate)} às ${suggestedTime}`,
        "Se esse horário não funcionar, o cliente pode responder com outro horário disponível.",
      ],
      extraGuidance: "A mensagem deve pedir o reagendamento de forma humana e colaborativa, propondo o novo horário e abrindo espaço para contraproposta.",
      fallback: () =>
        buildAiRescheduleOutreachMessage({
          customerName: schedule.customer_name || schedule.conversation_name || null,
          serviceName: schedule.service_name || null,
          reason,
          suggestedDate,
          suggestedTime,
        }),
    });

    await setConversationAiRescheduleContext({
      conversationId: schedule.conversation_id,
      scheduleId: schedule.id,
      reason,
      suggestedDate,
      suggestedTime,
      initiatedBy: "company",
    });
    await updateConversationAiEnabled(schedule.conversation_id, true);

    const waResponse = await sendWhatsAppText({
      to: schedule.customer_phone,
      message,
      accountJid: schedule.account_wa_jid,
    });

    await saveOutboundMessage({
      accountJid: schedule.account_wa_jid,
      accountDisplayName: null,
      phone: schedule.customer_phone,
      body: message,
      messageType: "text",
      externalMessageId: waResponse?.key?.id || null,
      status: "sent",
      payload: waResponse,
      metadata: {
        ai_generated: true,
        ai_agent: true,
        ai_schedule_id: schedule.id,
        ai_schedule_reschedule_request: true,
        ai_reschedule_reason: reason,
        ai_reschedule_suggested_date: suggestedDate,
        ai_reschedule_suggested_time: suggestedTime,
      },
    });

    return res.status(200).json({
      status: "ok",
      mode: "ai",
      conversation_id: schedule.conversation_id,
      message,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao iniciar o reagendamento com a IA.",
    });
  }
});

router.patch("/schedules/:scheduleId/reschedule", async (req, res) => {
  const authReq = req as AuthRequest;
  const scheduleId = String(req.params.scheduleId || "").trim();
  const scheduledDate = parseBrDateToIso(String(req.body?.scheduled_date || "").trim());
  const scheduledTime = String(req.body?.scheduled_time || "").trim();
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!scheduleId) {
    return res.status(400).json({ error: "Agendamento invalido." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
    return res.status(400).json({ error: "Data ou horario invalido." });
  }

  try {
    const schedule = await getAiScheduleById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: "Agendamento nao encontrado." });
    }
    if (schedule.account_id) {
      const account = await getWhatsAppAccountById(schedule.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Agendamento nao pertence a esta empresa." });
      }
    }
    if (schedule.status === "cancelled") {
      return res.status(400).json({ error: "Agendamento cancelado nao pode ser reagendado." });
    }

    const updated = await rescheduleAiSchedule({
      scheduleId,
      accountId: schedule.account_id || null,
      scheduledDate,
      scheduledTime,
      durationMinutes: schedule.duration_minutes,
    });
    if (!updated) {
      return res.status(400).json({ error: "Nao foi possivel reagendar o agendamento." });
    }

    return res.status(200).json({
      status: "ok",
      schedule: updated,
    });
  } catch (error: any) {
    if (error?.code === "AI_SCHEDULE_CONFLICT") {
      return res.status(409).json({
        error: "Ja existe um agendamento nesse horario.",
        conflict: error.conflict || null,
      });
    }
    if (error?.code === "AI_SCHEDULE_TOO_SOON_OR_PAST") {
      return res.status(400).json({
        error: "O agendamento precisa ter pelo menos 15 minutos de antecedencia.",
      });
    }
    if (error?.code === "AI_SCHEDULE_OUTSIDE_WORKING_HOURS") {
      return res.status(400).json({
        error: "Horario fora do expediente configurado para esta empresa.",
      });
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao reagendar agendamento.",
    });
  }
});

router.delete("/schedules/:scheduleId", async (req, res) => {
  const authReq = req as AuthRequest;
  const scheduleId = String(req.params.scheduleId || "").trim();
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!scheduleId) {
    return res.status(400).json({ error: "Agendamento invalido." });
  }

  try {
    const exists = await getAiScheduleById(scheduleId);
    if (!exists) {
      return res.status(404).json({ error: "Agendamento nao encontrado." });
    }
    if (exists.account_id) {
      const account = await getWhatsAppAccountById(exists.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Agendamento nao pertence a esta empresa." });
      }
    }
    const deleted = await deleteAiSchedule(scheduleId);
    if (!deleted) {
      return res.status(400).json({ error: "Nao foi possivel excluir o agendamento." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao excluir agendamento.",
    });
  }
});

export default router;




