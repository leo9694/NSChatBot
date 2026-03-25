import { Router } from "express";
import { getOpenAIStatus, testOpenAIConnection } from "../services/openai.service";
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

export async function processDueScheduleReminders(): Promise<number> {
  const dueItems = await listAiSchedulesDueForReminder();
  let sentCount = 0;

  for (const schedule of dueItems) {
    if (!schedule.customer_phone || !schedule.account_wa_jid || !schedule.schedule_reminder_minutes) {
      continue;
    }

    const customerName = String(schedule.customer_name || schedule.conversation_name || "").trim();
    const greeting = customerName ? `${customerName},` : "";
    const message = [
      greeting,
      "este é um lembrete do seu atendimento confirmado.",
      schedule.service_name ? `Serviço: ${schedule.service_name}` : "",
      schedule.scheduled_date && schedule.scheduled_time
        ? `Horário: ${formatShortBrDate(schedule.scheduled_date)} às ${schedule.scheduled_time}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

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
      const greeting = customerName ? `${customerName},` : "";
      const statusLine = "seu pedido foi confirmado com sucesso.";
      const message = formatCustomerOrderMessage({
        greeting,
        statusLine,
        summary: orderSummary || "",
        orderNotes: order.notes || null,
        readyTimeMinutes: Math.round(readyTimeMinutes),
        note: confirmationNote || null,
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
      const message = formatCustomerOrderMessage({
        greeting: customerName ? `${customerName},` : "",
        statusLine: "seu pedido foi cancelado.",
        summary: orderSummary || "",
        orderNotes: order.notes || null,
        cancelReason: reason,
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
      const message = formatCustomerScheduleMessage({
        greeting: customerName ? `${customerName},` : "",
        statusLine: "seu agendamento foi confirmado com sucesso.",
        serviceName: schedule.service_name || "",
        scheduledDate: schedule.scheduled_date || "",
        scheduledTime: schedule.scheduled_time || "",
        durationMinutes: schedule.duration_minutes,
        note: confirmationNote || null,
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
      const message = formatCustomerScheduleMessage({
        greeting: customerName ? `${customerName},` : "",
        statusLine: "seu agendamento foi cancelado.",
        serviceName: schedule.service_name || "",
        scheduledDate: schedule.scheduled_date || "",
        scheduledTime: schedule.scheduled_time || "",
        cancelReason: reason,
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

    const message = buildAiRescheduleOutreachMessage({
      customerName: schedule.customer_name || schedule.conversation_name || null,
      serviceName: schedule.service_name || null,
      reason,
      suggestedDate,
      suggestedTime,
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
