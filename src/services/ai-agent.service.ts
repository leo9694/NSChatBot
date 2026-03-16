import { saveOutboundMessage } from "../repositories/messages.repository";
import {
  createAiOrder,
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

function pickFirstFilled<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function isClosingMessage(body: string): boolean {
  const text = normalizeText(body);
  if (!text) return false;

  const closingPatterns = [
    /^nao[, ]*obrigado/,
    /^nao precisa/,
    /^so isso$/,
    /^somente isso$/,
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

export async function handleInboundAiAutomation(conversationId: string): Promise<{ ok: boolean; replied: boolean; reason?: string }> {
  const id = String(conversationId || "").trim();
  if (!id || processingConversations.has(id)) {
    return { ok: false, replied: false, reason: "busy" };
  }

  processingConversations.add(id);
  try {
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

    const messages = await listConversationMessagesForAi(id, 80);
    if (!messages.length) {
      return { ok: true, replied: false, reason: "no_messages" };
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.from_me) {
      return { ok: true, replied: false, reason: "last_message_from_company" };
    }

    if (isClosingMessage(String(lastMessage.body || ""))) {
      const closingReply = "Perfeito. Qualquer coisa, fico por aqui. Obrigado pelo contato.";
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
      messages: messages.map((item) => ({
        from_me: Boolean(item.from_me),
        body: String(item.body || ""),
        sent_at: item.sent_at || item.created_at || null,
        message_type: item.message_type || null,
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
      (!requiresDeliveryAddress || Boolean(mergedOrder.deliveryAddress));

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
        ? updatedPendingOrder
          ? "Perfeito, ajustei seu pedido pendente e ele continua aguardando confirmacao interna. Assim que for confirmado, eu te aviso por aqui."
          : "Perfeito, registrei seu pedido e ele ficou pendente de confirmacao interna. Assim que for confirmado, eu te aviso por aqui."
        : "";
    const replyText = String(aiResult.reply || "").trim() || fallbackReply;

    if (!aiResult.shouldReply || !replyText) {
      return { ok: true, replied: false, reason: "model_chose_not_to_reply" };
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

    if (aiResult.media.shouldSendImages && aiResult.media.productNames.length > 0) {
      const catalog = await listProductsForAgentDetailedContext();
      const matchedProducts = catalog
        .filter((product) => {
          const productName = normalizeName(product.name);
          return aiResult.media.productNames.some((name: string) => productName.includes(normalizeName(name)));
        })
        .filter((product) => String(product.image_url || "").trim())
        .slice(0, 3);

      for (const product of matchedProducts) {
        const media = await loadMediaBufferFromUrl(String(product.image_url || "").trim());
        if (!media?.buffer) continue;

        const caption = `${product.name}\nPreco: R$${Number(product.price || 0).toFixed(2)}\nEstoque: ${Number(product.stock || 0)}`;
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
  }
}
