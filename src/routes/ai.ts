import { Router } from "express";
import { getOpenAIStatus, testOpenAIConnection } from "../services/openai.service";
import { cancelAiOrder, confirmAiOrder, deleteAiOrder, getAiAccountSettings, getAiOrderById, listAiOrders, upsertAiAccountSettings } from "../repositories/ai.repository";
import { getWhatsAppAccountById } from "../repositories/accounts.repository";
import { saveOutboundMessage } from "../repositories/messages.repository";
import { sendWhatsAppText } from "../services/whatsapp.service";

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

function formatCustomerOrderMessage(input: {
  greeting?: string;
  statusLine: string;
  summary?: string;
  readyTimeMinutes?: number | null;
  note?: string | null;
  cancelReason?: string | null;
}) {
  const parts = [
    input.greeting?.trim() || "",
    input.statusLine.trim(),
    input.summary?.trim() ? `Resumo:\n${input.summary.trim()}` : "",
    Number.isFinite(input.readyTimeMinutes)
      ? `Tempo estimado:\n${Math.round(Number(input.readyTimeMinutes))} minuto(s)`
      : "",
    input.note?.trim() ? `InformaÃ§Ãµes adicionais:\n${input.note.trim()}` : "",
    input.cancelReason?.trim() ? `Motivo do cancelamento:\n${input.cancelReason.trim()}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
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
    const message = error instanceof Error ? error.message : "Falha ao testar a conexÃ£o com a OpenAI.";
    const status = message === "OPENAI_API_KEY_NOT_CONFIGURED" ? 400 : 502;
    return res.status(status).json({
      error: message === "OPENAI_API_KEY_NOT_CONFIGURED" ? "OPENAI_API_KEY nÃ£o configurada." : message,
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
      store_name: settings?.store_name || "",
      store_description: settings?.store_description || "",
      store_cnpj: settings?.store_cnpj || "",
      store_address: settings?.store_address || "",
      store_payment_methods: Array.isArray(settings?.store_payment_methods) ? settings.store_payment_methods : [],
      store_delivery_fees: Array.isArray(settings?.store_delivery_fees) ? settings.store_delivery_fees : [],
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao carregar as configuraÃ§Ãµes do agente.",
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
      storeName,
      storeDescription,
      storeCnpj,
      storeAddress,
      storePaymentMethods,
      storeDeliveryFees,
    });
    return res.status(200).json({
      status: "ok",
      settings,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao salvar as configuraÃ§Ãµes do agente.",
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
    return res.status(400).json({ error: "Informe o tempo mÃ­nimo para o pedido ficar pronto." });
  }

  try {
    const order = await getAiOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Pedido nÃ£o encontrado." });
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
      return res.status(400).json({ error: "NÃ£o foi possÃ­vel confirmar o pedido." });
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
      return res.status(404).json({ error: "Pedido nÃ£o encontrado." });
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
      return res.status(400).json({ error: "NÃ£o foi possÃ­vel cancelar o pedido." });
    }

    if (order.customer_phone && order.account_wa_jid) {
      const customerName = String(order.conversation_name || "").trim();
      const orderSummary = String(order.summary || "").trim();
      const message = formatCustomerOrderMessage({
        greeting: customerName ? `${customerName},` : "",
        statusLine: "seu pedido foi cancelado.",
        summary: orderSummary || "",
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
      return res.status(404).json({ error: "Pedido nÃ£o encontrado." });
    }
    if (exists.account_id) {
      const account = await getWhatsAppAccountById(exists.account_id, authReq.authUser?.company_id || null);
      if (!account) {
        return res.status(404).json({ error: "Pedido nao pertence a esta empresa." });
      }
    }
    const deleted = await deleteAiOrder(orderId);
    if (!deleted) {
      return res.status(400).json({ error: "NÃ£o foi possÃ­vel excluir o pedido." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao excluir pedido.",
    });
  }
});

export default router;
