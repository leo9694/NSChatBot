import OpenAI from "openai";
import { env } from "../config/env";
import { getAiAccountSettings } from "../repositories/ai.repository";
import { listProductsForAgentContext, listProductsForAgentDetailedContext } from "../repositories/products.repository";
import { getWhatsAppAccountById } from "../repositories/accounts.repository";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return openaiClient;
}

export async function getOpenAIStatus(companyId?: string | null) {
  const products = await listProductsForAgentContext(companyId || null).catch(() => []);
  return {
    configured: Boolean(env.openaiApiKey),
    model: env.openaiModel,
    productsCount: products.length,
  };
}

function extractResponseText(response: any): string {
  const directText = response?.output_text;
  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join("\n").trim();
}

export async function testOpenAIConnection() {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: env.openaiModel,
    input: "Responda apenas com: ok",
    max_output_tokens: 20,
  });

  return {
    configured: true,
    model: env.openaiModel,
    reply: extractResponseText(response) || "ok",
    responseId: String(response.id || ""),
  };
}

export type OperationalMessageInput = {
  accountId?: string | null;
  eventType:
    | "order_confirmation"
    | "order_cancellation"
    | "schedule_confirmation"
    | "schedule_cancellation"
    | "schedule_reminder"
    | "schedule_reschedule_request";
  customerName?: string | null;
  facts: Array<string>;
  extraGuidance?: string | null;
};

export type AiSalesReplyInput = {
  accountId: string | null;
  companyName?: string | null;
  agentName?: string | null;
  conversationName?: string | null;
  customerPhone?: string | null;
  memorySummary?: string | null;
  customerProfile?: string | null;
  lastOrderSummary?: string | null;
  lastOrderStatus?: string | null;
  lastScheduleSummary?: string | null;
  lastScheduleStatus?: string | null;
  groundingNotes?: Array<string> | null;
  messages: Array<{ from_me: boolean; body: string; sent_at?: string | null; message_type?: string | null; quoted_body?: string | null }>;
};

export async function generateAiOperationalMessage(input: OperationalMessageInput): Promise<string> {
  const client = getOpenAIClient();
  const accountId = String(input.accountId || "").trim() || null;
  const storedSettings = accountId ? await getAiAccountSettings(accountId).catch(() => null) : null;
  const account = accountId ? await getWhatsAppAccountById(accountId, null).catch(() => null) : null;
  const companyId = account?.company_id || null;
  const companyName = String(storedSettings?.company_name || storedSettings?.store_name || "").trim() || "Empresa";
  const agentName = String(storedSettings?.agent_name || "").trim() || "Atendimento";
  const moodInstruction = getMoodInstruction(storedSettings?.mood || "informal");
  const storeContext = buildStoreContextText(storedSettings || {});
  const customerName = String(input.customerName || "").trim();
  const eventLabels: Record<string, string> = {
    order_confirmation: "confirmação de pedido",
    order_cancellation: "cancelamento de pedido",
    schedule_confirmation: "confirmação de agendamento",
    schedule_cancellation: "cancelamento de agendamento",
    schedule_reminder: "lembrete de agendamento",
    schedule_reschedule_request: "pedido de reagendamento",
  };

  const response = await client.responses.create({
    model: env.openaiModel,
    max_output_tokens: 520,
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    input: [
      {
        role: "system",
        content:
          `Você escreve UMA mensagem operacional de WhatsApp para cliente, em português do Brasil.\n` +
          `Empresa: ${companyName}\n` +
          `Agente/assinatura interna: ${agentName}\n` +
          `${moodInstruction}\n\n` +
          `Regras obrigatórias:\n` +
          `- Retorne apenas o texto final da mensagem.\n` +
          `- A mensagem deve soar humana, natural e objetiva.\n` +
          `- Não invente informações.\n` +
          `- Inclua todas as informações factuais obrigatórias recebidas, sem omitir nenhuma.\n` +
          `- Cubra explicitamente cada fato obrigatório da lista do usuário.\n` +
          `- Preserve com exatidão fatos críticos como status, datas, horários, valores, formas de pagamento, motivos, nomes de serviços e nomes de itens do pedido.\n` +
          `- Você pode organizar as informações do jeito que achar melhor, desde que nada importante seja omitido.\n` +
          `- Não trate isso como conversa de venda; é uma atualização operacional.\n` +
          `- Se houver nome do cliente, você pode usar uma saudação curta no início, mas não é obrigatório.\n` +
          `- Revise a gramática antes de responder.\n` +
          `- Revise a naturalidade do texto antes de responder. Corrija construções estranhas ou ambíguas.\n` +
          `- Nunca escreva "agente combina" quando a intenção for "a gente combina".\n` +
          `- Se usar linguagem coloquial, use português natural e correto.\n` +
          `- Não troque, resuma demais nem esconda fatos obrigatórios atrás de frases vagas.\n` +
          `- Não use markdown, JSON, títulos técnicos nem comentários meta.\n\n` +
          `Contexto da loja:\n${storeContext}`,
      },
      {
        role: "user",
        content:
          `Tipo de mensagem: ${eventLabels[input.eventType] || input.eventType}\n` +
          `Cliente: ${customerName || "não informado"}\n` +
          `Informações obrigatórias:\n- ${input.facts.map((item) => String(item || "").trim()).filter(Boolean).join("\n- ")}\n` +
          `${String(input.extraGuidance || "").trim() ? `\nOrientação adicional:\n${String(input.extraGuidance || "").trim()}\n` : ""}` +
          `\nEscreva agora a mensagem final para o cliente. ` +
          `Antes de responder, confira internamente se todos os fatos obrigatórios aparecem de forma clara no texto final, especialmente datas, horários, valores, pagamento, motivo e nomes importantes.`,
      },
    ],
  });

  return extractResponseText(response);
}

function buildProductDiscountLabel(item: {
  discount_enabled?: boolean | null;
  discount_price?: string | null;
}) {
  if (item.discount_enabled && item.discount_price) {
    return ` | desconto ativo: sim | preço com desconto: ${item.discount_price}`;
  }
  return " | desconto ativo: não";
}

export async function getAgentProductContextText(companyId?: string | null): Promise<string> {
  const products = await listProductsForAgentContext(companyId || null);
  if (!products.length) {
    return "Nenhum produto cadastrado.";
  }

  return products
    .map((item) => {
      const typeLabel = item.type === "service" ? "serviço" : "produto";
      const groupLabel = item.group_name ? ` | grupo: ${item.group_name}` : "";
      const stockLabel = item.type === "service" ? "estoque: não se aplica" : `estoque: ${item.stock}`;
      const scheduleLabel =
        item.type === "service"
          ? ` | agendamento: ${item.schedule_enabled ? "sim" : "não"}${
              item.schedule_enabled && item.service_duration_minutes ? ` | duração média: ${item.service_duration_minutes} min` : ""
            }`
          : "";
      const descriptionLabel = item.description ? ` | descrição: ${item.description}` : "";
      return `- ${item.name}${groupLabel} | tipo: ${typeLabel} | preço: ${item.price}${buildProductDiscountLabel(item)} | ${stockLabel}${scheduleLabel}${descriptionLabel}`;
    })
    .join("\n");
}

function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getMoodInstruction(mood: string | null | undefined): string {
  const normalizedMood = String(mood || "informal").trim().toLowerCase();

  if (normalizedMood === "amigavel") {
    return (
      "Humor atual: amigável. " +
      "Fale de forma calorosa, acolhedora e leve. " +
      "Você pode usar emojis pontualmente quando fizer sentido, sem exagero. " +
      "Mantenha a resposta simpática e próxima, mas ainda profissional. " +
      "Em encerramentos, confirme de forma gentil e curta. " +
      "Ao sugerir produtos, soe próximo e convidativo. " +
      "Ao enviar imagem, avise de forma leve que está enviando a foto em seguida. " +
      "Em pedidos, deixe claro o próximo passo sem soar seco."
    );
  }

  if (normalizedMood === "formal") {
    return (
      "Humor atual: formal. " +
      "Fale de forma formal, técnica, clara e profissional. " +
      "Não use emojis. " +
      "Evite gírias e mantenha linguagem mais objetiva e corporativa. " +
      "Em encerramentos, seja cordial e direto. " +
      "Ao sugerir produtos, destaque o essencial com clareza. " +
      "Ao enviar imagem, avise de forma objetiva que a imagem será enviada na sequência. " +
      "Em pedidos, use termos claros sobre confirmação e próximo passo."
    );
  }

  return (
    "Humor atual: informal. " +
    "Fale de forma natural, comum e profissional. " +
    "Não use emojis. " +
    "Soe humano e simples, sem excesso de formalidade. " +
    "Em encerramentos, finalize de forma curta e natural. " +
    "Ao sugerir produtos, fale como um vendedor experiente e acessível. " +
    "Ao enviar imagem, avise de forma simples que está mandando a foto. " +
    "Em pedidos, deixe o status e o próximo passo bem claros."
  );
}

function buildStoreContextText(settings: {
  agent_guidelines?: Array<string> | null;
  store_name?: string | null;
  store_description?: string | null;
  store_cnpj?: string | null;
  store_address?: string | null;
  store_payment_methods?: Array<string> | null;
  store_delivery_fees?: Array<Record<string, unknown>> | null;
  schedule_working_days?: Array<Record<string, unknown>> | null;
  schedule_interval_minutes?: number | null;
  schedule_reminder_enabled?: boolean | null;
  schedule_reminder_minutes?: number | null;
  schedule_reminder_rules?: Array<Record<string, unknown>> | null;
}) {
  const paymentMethods = Array.isArray(settings.store_payment_methods)
    ? settings.store_payment_methods.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const deliveryFees = Array.isArray(settings.store_delivery_fees)
    ? settings.store_delivery_fees
        .map((item) => {
          const label = String(item?.label || "").trim();
          const price = String(item?.price || "").trim();
          if (!label && !price) return "";
          return [label, price].filter(Boolean).join(": ");
        })
        .filter(Boolean)
    : [];
  const weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const workingDays = Array.isArray(settings.schedule_working_days)
    ? settings.schedule_working_days
        .map((item) => {
          const dayOfWeek = Number(item?.day_of_week);
          if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !item?.enabled) {
            return "";
          }
          const periods: string[] = [];
          if (item?.morning_enabled && item?.morning_start && item?.morning_end) {
            periods.push(`manhã ${String(item.morning_start).trim()} às ${String(item.morning_end).trim()}`);
          }
          if (item?.afternoon_enabled && item?.afternoon_start && item?.afternoon_end) {
            periods.push(`tarde ${String(item.afternoon_start).trim()} às ${String(item.afternoon_end).trim()}`);
          }
          if (item?.night_enabled && item?.night_start && item?.night_end) {
            periods.push(`noite ${String(item.night_start).trim()} às ${String(item.night_end).trim()}`);
          }
          if (!periods.length) {
            const start = String(item?.start_time || "").trim();
            const end = String(item?.end_time || "").trim();
            if (start && end) {
              periods.push(`${start} às ${end}`);
            }
          }
          const lunch =
            item?.morning_enabled &&
            item?.afternoon_enabled &&
            item?.morning_end &&
            item?.afternoon_start &&
            String(item.morning_end).trim() < String(item.afternoon_start).trim()
              ? ` | almoço ${String(item.morning_end).trim()} às ${String(item.afternoon_start).trim()}`
              : "";
          if (!periods.length) return "";
          return `${weekdayNames[dayOfWeek]}: ${periods.join(" | ")}${lunch}`;
        })
        .filter(Boolean)
    : [];
  const reminderRules = Array.isArray(settings.schedule_reminder_rules)
    ? settings.schedule_reminder_rules
        .map((item) => {
          const unit = String(item?.unit || "minutes").trim().toLowerCase();
          const value = Number(item?.value);
          if (!Number.isFinite(value) || value <= 0) return "";
          if (unit === "days") return `${Math.max(1, Math.round(value))} dia(s) antes`;
          if (unit === "hours") return `${Math.max(1, Math.round(value))} hora(s) antes`;
          return `${Math.max(1, Math.round(value))} min antes`;
        })
        .filter(Boolean)
    : [];
  const agentGuidelines = Array.isArray(settings.agent_guidelines)
    ? settings.agent_guidelines.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const guidelinesText = agentGuidelines.length
    ? `DIRETRIZES DA EMPRESA (PRIORIDADE MÁXIMA - SIGA LITERALMENTE QUANDO SE APLICAR):\n${agentGuidelines
        .map((item) => `- ${item}`)
        .join("\n")}`
    : "DIRETRIZES DA EMPRESA: Nenhuma diretriz adicional cadastrada";

  return [
    guidelinesText,
    `Nome da loja: ${String(settings.store_name || "").trim() || "Não informado"}`,
    `Descrição da loja: ${String(settings.store_description || "").trim() || "Não informada"}`,
    `CNPJ: ${String(settings.store_cnpj || "").trim() || "Não informado"}`,
    `Endereço da loja: ${String(settings.store_address || "").trim() || "Não informado"}`,
    `Formas de pagamento aceitas: ${paymentMethods.length ? paymentMethods.join(", ") : "Não informadas"}`,
    `Preços de entrega: ${deliveryFees.length ? deliveryFees.join(" | ") : "Não informados"}`,
    `Escala de agendamento: ${workingDays.length ? workingDays.join(" | ") : "Não configurada"}`,
    `Intervalo entre atendimentos: ${
      Number.isFinite(Number(settings.schedule_interval_minutes)) ? `${Math.max(0, Math.round(Number(settings.schedule_interval_minutes)))} min` : "Não informado"
    }`,
    `Lembrete de agendamento: ${
      settings.schedule_reminder_enabled && reminderRules.length
        ? reminderRules.join(" | ")
        : settings.schedule_reminder_enabled && Number.isFinite(Number(settings.schedule_reminder_minutes))
          ? `${Math.max(1, Math.round(Number(settings.schedule_reminder_minutes)))} min antes`
          : "Desativado"
    }`,
  ].join("\n");
}

export function __buildStoreContextTextForTests(settings: {
  agent_guidelines?: Array<string> | null;
  store_name?: string | null;
  store_description?: string | null;
  store_cnpj?: string | null;
  store_address?: string | null;
  store_payment_methods?: Array<string> | null;
  store_delivery_fees?: Array<Record<string, unknown>> | null;
  schedule_working_days?: Array<Record<string, unknown>> | null;
  schedule_interval_minutes?: number | null;
  schedule_reminder_enabled?: boolean | null;
  schedule_reminder_minutes?: number | null;
  schedule_reminder_rules?: Array<Record<string, unknown>> | null;
}) {
  return buildStoreContextText(settings);
}


function buildAiSalesSystemPrompt(moodInstruction: string): string {
  return [
    "Voc? ? um agente comercial e de atendimento ao cliente da empresa. Fale em portugu?s do Brasil, com tom humano, natural, claro e profissional.",
    moodInstruction,
    "As diretrizes da empresa enviadas no contexto do usu?rio t?m prioridade m?xima sobre seu estilo padr?o e sobre qualquer prefer?ncia gen?rica de escrita, desde que n?o entrem em conflito com fatos do sistema ou seguran?a operacional.",
    "",
    "ESTILO",
    "- Responda somente ao que o cliente perguntou.",
    "- Prefira a menor resposta ?til poss?vel.",
    "- Para perguntas simples, responda de forma simples e curta.",
    "- Para respostas com v?rios detalhes, organize em linhas curtas ou listas pequenas.",
    "- N?o use sauda??o completa em toda mensagem se a conversa j? estiver em andamento.",
    "- N?o repita o nome do cliente sem necessidade.",
    "- N?o pare?a rob?tico, burocr?tico ou excessivamente formal.",
    "- N?o acrescente informa??es extras desnecess?rias.",
    "",
    "CONTEXTO E MEM?RIA",
    "- Use o hist?rico da conversa, a mem?ria do cliente, as notas determin?sticas do sistema e o cat?logo atual.",
    "- Se existirem notas determin?sticas, trate essas notas como fatos priorit?rios.",
    "- Quando o contexto recente j? trouxer nome, interesse, etapa da conversa, produto, obje??o ou prefer?ncia, continue dali sem pedir tudo de novo.",
    "- Interprete linguagem natural de WhatsApp com toler?ncia a abrevia??es, g?rias, erros de digita??o e mensagens curtas.",
    "- Mensagens como 'sim', 'isso', 'esse', 'esse mesmo', 'quero esse', 'mais desse' ou equivalentes devem ser interpretadas com base no contexto recente, na ?ltima mensagem da empresa e na mensagem citada.",
    "- Quando houver mensagem citada, priorize o item ou assunto citado.",
    "- Se o cliente mandar duas ou mais mensagens seguidas muito pr?ximas, trate o bloco como um ?nico turno de inten??o.",
    "- Se algo continuar amb?guo, pe?a apenas a parte que falta.",
    "",
    "CAT?LOGO E VERDADE DOS DADOS",
    "- O cat?logo atual enviado no contexto ? a fonte de verdade.",
    "- Nunca invente produto, servi?o, plano, pacote, pre?o, desconto, endere?o, CNPJ, pagamento, taxa, prazo, cupom, brinde, link de pagamento, boleto ou PIX autom?tico.",
    "- Se um produto n?o estiver no cat?logo atual, trate-o como indispon?vel ou n?o cadastrado, mesmo que apare?a no hist?rico.",
    "- S? mencione desconto se ele estiver explicitamente configurado no contexto.",
    "- S? mencione estoque se o cliente perguntar diretamente ou se for necess?rio por indisponibilidade.",
    "- Se alguma informa??o da loja n?o estiver dispon?vel no contexto, diga de forma simples que essa informa??o n?o est? cadastrada no sistema no momento.",
    "",
    "VENDA E RECOMENDA??O",
    "- Quando o cliente pedir produtos, op??es, valores ou compara??o, responda com lista curta e clara.",
    "- Quando o cliente pedir itens de um grupo espec?fico, filtre usando o campo grupo e n?o misture itens de outros grupos.",
    "- Quando o cliente pedir algo mais barato, mais completo ou mais adequado, recomende a melhor op??o dispon?vel dentro do contexto da conversa e explique em uma ou duas frases o motivo.",
    "- Se n?o ficar claro a que item, servi?o ou categoria ele se refere, pe?a essa refer?ncia antes de recomendar.",
    "- Se houver interesse claro de compra, conduza a conversa at? a confirma??o de forma natural, sem pressionar.",
    "",
    "PEDIDOS",
    "- Para criar pedido, confirme antes: nome do respons?vel, entrega ou retirada, endere?o completo se for entrega e forma de pagamento.",
    "- Quando fizer sentido, voc? pode perguntar se h? observa??o no pedido, como bilhete, dedicat?ria, assinatura, recado ou instru??o especial. Isso ? opcional.",
    "- Se for entrega, o endere?o precisa ter cidade, rua, bairro e ponto de refer?ncia. O n?mero pode ser informado normalmente ou como 'sem n?mero' / 's/n'.",
    "- Nunca invente dados de endere?o.",
    "- Por padr?o, colete informa??es do pedido de forma natural e progressiva, uma parte por vez, sem transformar o atendimento em formul?rio.",
    "- Evite fazer mais de duas perguntas por mensagem, a menos que uma diretriz da empresa exija claramente outro formato.",
    "- Se faltar endere?o, pe?a somente o pr?ximo dado necess?rio para seguir, em linguagem natural.",
    "- S? use bloco estruturado ou formul?rio de coleta quando houver diretriz expl?cita da empresa exigindo esse formato para aquele caso.",
    "- Voc? s? pode criar pedido depois de pedir a confirma??o final e receber uma confirma??o direta do cliente.",
    "- A confirma??o final do cliente deve ser interpretada pelo sentido da resposta no contexto da conversa, e n?o apenas por palavras literais fixas.",
    "- Se o cliente estiver validando claramente o resumo final do pedido com linguagem natural, marque order.customer_confirmed_details=true mesmo que ele n?o use uma frase exata como 'sim, confirmo'.",
    "- Se houver d?vida real sobre se o cliente confirmou ou ainda est? ajustando algo, marque order.customer_confirmed_details=false, n?o crie o pedido e fa?a apenas a pergunta curta necess?ria para confirmar.",
    "- Dados completos de pedido N?O significam confirma??o final por si s?.",
    "- Frases como \"quero\", \"vou querer\", \"pode ser\", enviar nome, endere?o e pagamento, ou apenas descrever o pedido n?o bastam para criar o pedido se a confirma??o final ainda n?o foi pedida e respondida.",
    "- Se todos os dados j? estiverem completos, mas o cliente ainda n?o tiver confirmado depois do seu pedido de confirma??o final, sua resposta deve ser apenas pedir essa confirma??o e order.should_create deve continuar false.",
    "- Antes da confirma??o expl?cita, deixe claro que voc? ainda vai gerar o pedido depois que o cliente confirmar os dados.",
    "- N?o escreva de um jeito que pare?a pedido j? criado ou finalizado antes da hora.",
    "- S? marque order.should_create=true quando o cliente j? tiver confirmado o pedido no contexto e os dados necess?rios estiverem completos.",
    "- Se order.should_create=true, a sua reply deve assumir que o pedido ser? realmente registrado agora. Se houver d?vida, mantenha order.should_create=false e pe?a confirma??o novamente.",
    "- Quando o cliente confirmar, gere o pedido estruturado e diga de forma simples que ele ficou pendente de confirma??o interna.",
    "- Se houver pedido pendente atual e o cliente pedir ajuste antes da confirma??o interna, voc? pode ajustar esse pedido pendente.",
    "- N?o edite pedido j? confirmado.",
    "- Quando resumir um pedido, use formato enxuto: itens, total, retirada ou entrega e pagamento.",
    "",
    "AGENDAMENTOS",
    "- S? ofere?a agendamento para servi?os que tenham agendamento habilitado no contexto.",
    "- Para agendar, confirme antes: servi?o, data e hor?rio.",
    "- Nunca agende sem data e hor?rio claros.",
    "- Interprete datas relativas com base na data atual informada no contexto.",
    "- Mostre datas ao cliente em dd/mm/aa.",
    "- No JSON, use scheduled_date em YYYY-MM-DD e scheduled_time em HH:mm.",
    "- Voc? s? pode criar agendamento depois de pedir confirma??o final e receber confirma??o direta do cliente.",
    "- A confirma??o do agendamento tamb?m deve ser interpretada pelo sentido da resposta no contexto, n?o apenas por frases fixas.",
    "- Se o cliente estiver claramente validando o resumo final do agendamento, marque schedule.customer_confirmed_details=true; se houver d?vida, mantenha false e confirme novamente.",
    "- Antes da confirma??o expl?cita, deixe claro que ainda vai registrar o agendamento depois que ele confirmar.",
    "- Se houver agendamento pendente atual e o cliente pedir ajuste antes da confirma??o interna, voc? pode ajustar esse agendamento.",
    "- Se houver agendamento confirmado atual e o cliente pedir para mudar data ou hor?rio, trate isso como reagendamento.",
    "- Se o cliente pedir cancelamento e o atendimento estiver claro, marque schedule.should_cancel=true.",
    "- Se houver ambiguidade entre mais de um agendamento, pe?a apenas a confirma??o de qual atendimento ele quer alterar ou cancelar.",
    "- N?o marque schedule.should_cancel e schedule.should_create ao mesmo tempo.",
    "- Quando resumir um agendamento, use formato curto: servi?o, data, hor?rio e dura??o m?dia.",
    "",
    "IMAGENS",
    "- A decis?o de enviar imagem ? sua. Marque media.should_send_images=true somente quando voc? realmente decidir enviar imagem agora.",
    "- Se o cliente pedir a foto de um produto espec?fico, marque media.should_send_images=true e retorne em media.product_names somente o nome desse produto.",
    "- Se o cliente pedir fotos de um grupo, categoria ou cole??o, marque media.should_send_images=true e retorne em media.product_names todos os produtos relevantes desse grupo que devam ser enviados, n?o apenas um exemplo.",
    "- Se o cliente pedir fotos de todos os produtos e existir diretriz da empresa para perguntar o grupo antes, n?o marque envio de imagem ainda; primeiro pergunte o grupo e deixe media.should_send_images=false.",
    "- Se o cliente responder com o grupo depois dessa pergunta, interprete isso como autoriza??o para enviar as imagens do grupo escolhido e retorne todos os nomes relevantes em media.product_names.",
    "- S? diga que vai enviar foto se o item existir no cat?logo e tiver imagem dispon?vel.",
    "- Voc? est? falando no pr?prio WhatsApp do cliente; n?o pergunte se pode mandar 'por aqui'.",
    "- Ao enviar imagem, respeite literalmente as diretrizes da empresa sobre aviso de envio, grupo de produtos e legenda das fotos.",
    "- Ao enviar imagem, n?o cite estoque na legenda, salvo se o cliente tiver pedido isso ou se uma diretriz da empresa mandar citar.",
    "",
    "ENCERRAMENTO E HANDOFF",
    "- Se o cliente encerrar com algo como 'n?o obrigado', 's? isso', 'ok obrigado' ou equivalente, encerre de forma curta e educada, sem reabrir o assunto.",
    "- Se o cliente pedir humano, atendente, gerente, suporte, financeiro ou outra pessoa da equipe, trate isso como inten??o principal e marque handoff.should_transfer=true.",
    "- Nesses casos, responda confirmando o encaminhamento de forma humana e direta.",
    "- Se a pergunta for fora do contexto da empresa, fora de vendas, fora de produtos, fora de pedidos, fora de agendamentos ou fora de suporte comercial, N?O responda ao conte?do factual da pergunta.",
    "- Nesses casos, diga apenas que n?o consegue responder isso por aqui e redirecione para produtos, pedidos, agendamentos ou suporte da empresa.",
    "- Exemplo: se o cliente perguntar a capital da Fran?a, n?o responda Paris; diga apenas que n?o consegue responder esse tipo de assunto por aqui.",
    "",
    "DIRETRIZES DA EMPRESA",
    "- Se houver diretrizes da empresa no contexto, siga essas diretrizes como regras ativas desta loja, desde que n?o entrem em conflito com fatos do sistema ou seguran?a operacional.",
    "- Quando uma diretriz da empresa entrar em conflito com seu estilo padr?o de escrita, a diretriz da empresa tem prioridade.",
    "- Se houver diretriz operacional espec?fica para foto, legenda, sauda??o, pedido, observa??o, endere?o ou forma de responder, cumpra essa diretriz literalmente sempre que ela se aplicar.",
    "- Se a diretriz disser para n?o transformar o atendimento em formul?rio, n?o use listas longas de campos nem blocos de preenchimento; conduza a coleta em conversa natural.",
    "- Se a diretriz disser para coletar informa??es uma por vez, pergunte apenas o pr?ximo dado necess?rio e n?o repita o que j? foi informado.",
    "- Se a diretriz limitar a quantidade de perguntas por mensagem, respeite esse limite mesmo quando faltarem v?rios dados.",
    "- Se a diretriz mandar apresentar o nome da loja na sauda??o, use isso na abertura real do atendimento, sem repetir a apresenta??o em toda mensagem seguinte.",
    "- Se a diretriz mandar perguntar o grupo antes de enviar fotos de todos os produtos, fa?a essa pergunta antes de decidir enviar imagens.",
    "- Se a diretriz mandar usar linguagem natural e conduzir a conversa, priorize perguntas curtas e contexto progressivo em vez de blocos longos de coleta.",
    "",
    "RETORNO",
    '- Retorne APENAS JSON neste formato: {"should_reply":true,"reply":"texto","memory_summary":"resumo curto","customer_profile":"perfil curto","order":{"should_create":false,"summary":"","items":[],"total_estimate":null,"responsible_name":"","fulfillment_type":"","delivery_address":"","payment_method":"","notes":"","customer_confirmed_details":false},"schedule":{"should_create":false,"should_cancel":false,"service_name":"","scheduled_date":"","scheduled_time":"","customer_name":"","notes":"","cancel_reason":"","duration_minutes":null,"customer_confirmed_details":false},"media":{"should_send_images":false,"product_names":[]},"handoff":{"should_transfer":false,"reason":""}}',
  ].join("\n");
}

export async function buildAiSalesPromptPayload(
  input: AiSalesReplyInput,
): Promise<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming> {
  const storedSettings = input.accountId ? await getAiAccountSettings(input.accountId).catch(() => null) : null;
  const account = input.accountId ? await getWhatsAppAccountById(input.accountId, null).catch(() => null) : null;
  const companyId = account?.company_id || null;
  const currentDateInCuiaba = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const companyName = String(input.companyName || storedSettings?.company_name || "").trim() || "Empresa";
  const agentName = String(input.agentName || storedSettings?.agent_name || "").trim() || "Agente de vendas";
  const moodInstruction = getMoodInstruction(storedSettings?.mood || "informal");
  const storeContext = buildStoreContextText(storedSettings || {});
  const detailedProducts = await listProductsForAgentDetailedContext(companyId);
  const productCatalog = await getAgentProductContextText(companyId);
  const productCatalogWithImages =
    detailedProducts.length > 0
      ? detailedProducts
          .map((item) => {
            const typeLabel = item.type === "service" ? "serviço" : "produto";
            const groupLabel = item.group_name ? ` | grupo: ${item.group_name}` : "";
            const stockLabel = item.type === "service" ? "estoque: não se aplica" : `estoque: ${item.stock}`;
            const descriptionLabel = item.description ? ` | descrição: ${item.description}` : "";
            const scheduleLabel =
              item.type === "service"
                ? ` | agendamento: ${item.schedule_enabled ? "sim" : "não"}${
                    item.schedule_enabled && item.service_duration_minutes
                      ? ` | duração média: ${item.service_duration_minutes} min`
                      : ""
                  }`
                : "";
            return `- ${item.name}${groupLabel} | tipo: ${typeLabel} | preço: ${item.price}${buildProductDiscountLabel(item)} | ${stockLabel}${scheduleLabel} | imagem: ${item.image_url ? "sim" : "não"}${descriptionLabel}`;
          })
          .join("\n")
      : "Nenhum produto cadastrado.";
  const transcript = input.messages
    .slice(-80)
    .map((item) => {
      const role = item.from_me ? "empresa" : "cliente";
      const body = String(item.body || "").trim() || "[mensagem vazia]";
      const quotedBody = String(item.quoted_body || "").trim();
      if (quotedBody) {
        return `${role} (respondendo a: ${quotedBody}): ${body}`;
      }
      return `${role}: ${body}`;
    })
    .join("\n");
  const groundingNotes = Array.isArray(input.groundingNotes)
    ? input.groundingNotes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const groundingContext = groundingNotes.length ? groundingNotes.map((item) => `- ${item}`).join("\n") : "Nenhuma";

  return {
    model: env.openaiModel,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content: buildAiSalesSystemPrompt(moodInstruction),
      },
      {
        role: "user" as const,
        content:
          `Empresa: ${companyName}\n` +
          `Nome do agente: ${agentName}\n` +
          `Cliente: ${String(input.conversationName || "").trim() || "Não identificado"}\n` +
          `Telefone do cliente: ${String(input.customerPhone || "").trim() || "-"}\n\n` +
          `Data atual (America/Cuiaba): ${currentDateInCuiaba}\n\n` +
          `Memória resumida: ${String(input.memorySummary || "").trim() || "Sem memória prévia"}\n` +
          `Perfil do cliente: ${String(input.customerProfile || "").trim() || "Sem perfil definido"}\n` +
          `Pedido pendente atual: ${String(input.lastOrderSummary || "").trim() || "Nenhum"}\n\n` +
          `Status do pedido pendente atual: ${String(input.lastOrderStatus || "").trim() || "Nenhum"}\n\n` +
          `Agendamento pendente atual: ${String(input.lastScheduleSummary || "").trim() || "Nenhum"}\n\n` +
          `Status do agendamento pendente atual: ${String(input.lastScheduleStatus || "").trim() || "Nenhum"}\n\n` +
          `Notas determinísticas do sistema:\n${groundingContext}\n\n` +
          `Informações da loja:\n${storeContext}\n\n` +
          `Catálogo de produtos:\n${productCatalog}\n\n` +
          `Catálogo com disponibilidade de imagem:\n${productCatalogWithImages}\n\n` +
          `Histórico da conversa:\n${transcript}`,
      },
    ],
  };
}

export async function generateAiSalesReply(input: AiSalesReplyInput) {
  const client = getOpenAIClient();
  const payload = await buildAiSalesPromptPayload(input);

  const completion = await client.chat.completions.create(payload);

  const content = String(completion.choices?.[0]?.message?.content || "").trim();
  const parsed = safeJsonParse(content) || {};
  return {
    shouldReply: Boolean(parsed.should_reply),
    reply: String(parsed.reply || "").trim(),
    memorySummary: String(parsed.memory_summary || "").trim() || null,
    customerProfile: String(parsed.customer_profile || "").trim() || null,
    order: {
      shouldCreate: Boolean(parsed?.order?.should_create),
      summary: String(parsed?.order?.summary || "").trim() || null,
      items: Array.isArray(parsed?.order?.items) ? parsed.order.items : [],
      responsibleName: String(parsed?.order?.responsible_name || "").trim() || null,
      fulfillmentType: String(parsed?.order?.fulfillment_type || "").trim() || null,
      deliveryAddress: String(parsed?.order?.delivery_address || "").trim() || null,
      paymentMethod: String(parsed?.order?.payment_method || "").trim() || null,
      notes: String(parsed?.order?.notes || "").trim() || null,
      customerConfirmedDetails: Boolean(parsed?.order?.customer_confirmed_details),
      totalEstimate:
        parsed?.order?.total_estimate !== undefined && parsed?.order?.total_estimate !== null
          ? Number(parsed.order.total_estimate)
          : null,
    },
    schedule: {
      shouldCreate: Boolean(parsed?.schedule?.should_create),
      shouldCancel: Boolean(parsed?.schedule?.should_cancel),
      serviceName: String(parsed?.schedule?.service_name || "").trim() || null,
      scheduledDate: String(parsed?.schedule?.scheduled_date || "").trim() || null,
      scheduledTime: String(parsed?.schedule?.scheduled_time || "").trim() || null,
      customerName: String(parsed?.schedule?.customer_name || "").trim() || null,
      notes: String(parsed?.schedule?.notes || "").trim() || null,
      cancelReason: String(parsed?.schedule?.cancel_reason || "").trim() || null,
      customerConfirmedDetails: Boolean(parsed?.schedule?.customer_confirmed_details),
      durationMinutes:
        parsed?.schedule?.duration_minutes !== undefined && parsed?.schedule?.duration_minutes !== null
          ? Number(parsed.schedule.duration_minutes)
          : null,
    },
    media: {
      shouldSendImages: Boolean(parsed?.media?.should_send_images),
      productNames: Array.isArray(parsed?.media?.product_names)
        ? parsed.media.product_names.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [],
    },
    handoff: {
      shouldTransfer: Boolean(parsed?.handoff?.should_transfer),
      reason: String(parsed?.handoff?.reason || "").trim() || null,
    },
    raw: parsed,
  };
}

export async function evaluateAiHumanTransferIntent(input: {
  accountId: string | null;
  conversationName?: string | null;
  customerPhone?: string | null;
  memorySummary?: string | null;
  customerProfile?: string | null;
  lastOrderSummary?: string | null;
  lastScheduleSummary?: string | null;
  groundingNotes?: Array<string> | null;
  messages: Array<{ from_me: boolean; body: string; sent_at?: string | null; message_type?: string | null; quoted_body?: string | null }>;
}) {
  const client = getOpenAIClient();
  const storedSettings = input.accountId ? await getAiAccountSettings(input.accountId).catch(() => null) : null;
  const account = input.accountId ? await getWhatsAppAccountById(input.accountId, null).catch(() => null) : null;
  const companyId = account?.company_id || null;
  const companyName = String(storedSettings?.company_name || "").trim() || "Empresa";
  const agentName = String(storedSettings?.agent_name || "").trim() || "Agente de vendas";
  const moodInstruction = getMoodInstruction(storedSettings?.mood || "informal");
  const storeContext = buildStoreContextText(storedSettings || {});
  const productCatalog = await getAgentProductContextText(companyId);
  const transcript = input.messages
    .slice(-20)
    .map((item) => {
      const role = item.from_me ? "empresa" : "cliente";
      const body = String(item.body || "").trim() || "[mensagem vazia]";
      const quotedBody = String(item.quoted_body || "").trim();
      if (quotedBody) {
        return `${role} (respondendo a: ${quotedBody}): ${body}`;
      }
      return `${role}: ${body}`;
    })
    .join("\n");
  const groundingNotes = Array.isArray(input.groundingNotes)
    ? input.groundingNotes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const groundingContext = groundingNotes.length ? groundingNotes.map((item) => `- ${item}`).join("\n") : "Nenhuma";

  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você é um classificador de transferência de atendimento no WhatsApp. " +
          `${moodInstruction} ` +
          "Seu trabalho é decidir se a mensagem do cliente deve ser encaminhada para um atendente humano. " +
          "Considere transferência principalmente quando o cliente pedir de forma explícita ou claramente implícita para falar com outra pessoa, com um atendente, humano, gerente, financeiro ou equipe. " +
          "Considere transferência implícita apenas quando o cliente realmente pedir revisão humana, como 'preciso que alguém da equipe veja isso comigo'. " +
          "Não considere transferência só porque a dúvida é importante, comercial, sensível, tem mais de um item, tem mais de um endereço, envolve pagamento, entrega, agendamento, exceção comercial ou exige montar um pedido mais detalhado. " +
          "Pedidos com múltiplas entregas, mais de um destinatário, dúvidas de produto, venda, preço, estoque, pagamento, retirada, entrega, desconto, catálogo, criação de pedido e agendamento continuam sendo responsabilidade normal da IA. " +
          "Não considere transferência quando o cliente estiver apenas perguntando horários, tentando agendar, confirmando disponibilidade, escolhendo data, escolhendo horário, reagendando normalmente ou seguindo um fluxo comum de agendamento que a IA consegue conduzir sozinha. " +
          "Não marque transferência para curiosidades aleatórias, assuntos fora da empresa ou perguntas sem relação prática com o atendimento. " +
          "Se for transferência, escreva uma resposta curta, natural e direta confirmando o encaminhamento. " +
          "Se não for transferência, deixe suggested_reply vazio. " +
          "Não use resposta genérica do tipo 'não consigo responder isso por aqui' quando o cliente estiver pedindo um humano. " +
          "Exemplo positivo: 'Gostaria de falar com um atendente' => should_transfer=true. " +
          "Exemplo positivo: 'Pode me transferir para o financeiro?' => should_transfer=true. " +
          "Exemplo positivo: 'Preciso que alguém da equipe veja isso comigo' => should_transfer=true. " +
          "Exemplo negativo: 'Quero uma cesta de chocolate e café da manhã para duas pessoas em endereços diferentes' => should_transfer=false. " +
          "Exemplo negativo: 'Quero fechar um pedido com duas entregas' => should_transfer=false. " +
          "Exemplo negativo: 'Quero marcar para amanhã às 14h' => should_transfer=false. " +
          "Exemplo negativo: 'Quais horários disponíveis para a avaliação?' => should_transfer=false. " +
          "Exemplo negativo: 'Pode confirmar a disponibilidade amanhã às 14h?' => should_transfer=false. " +
          "Exemplo negativo: 'Qual a capital da França?' => should_transfer=false. " +
          "Retorne apenas JSON no formato: " +
          "{\"should_transfer\":false,\"reason\":\"\",\"suggested_reply\":\"\"}",
      },
      {
        role: "user",
        content:
          `Empresa: ${companyName}\n` +
          `Nome do agente: ${agentName}\n` +
          `Cliente: ${String(input.conversationName || "").trim() || "Não identificado"}\n` +
          `Telefone do cliente: ${String(input.customerPhone || "").trim() || "-"}\n\n` +
          `Memória resumida: ${String(input.memorySummary || "").trim() || "Sem memória prévia"}\n` +
          `Perfil do cliente: ${String(input.customerProfile || "").trim() || "Sem perfil definido"}\n` +
          `Pedido pendente atual: ${String(input.lastOrderSummary || "").trim() || "Nenhum"}\n` +
          `Agendamento pendente atual: ${String(input.lastScheduleSummary || "").trim() || "Nenhum"}\n\n` +
          `Notas determinísticas do sistema:\n${groundingContext}\n\n` +
          `Informações da loja:\n${storeContext}\n\n` +
          `Catálogo de produtos:\n${productCatalog}\n\n` +
          `Histórico recente da conversa:\n${transcript}`,
      },
    ],
  });

  const content = String(completion.choices?.[0]?.message?.content || "").trim();
  const parsed = safeJsonParse(content) || {};
  return {
    shouldTransfer: Boolean(parsed?.should_transfer),
    reason: String(parsed?.reason || "").trim() || null,
    suggestedReply: String(parsed?.suggested_reply || "").trim() || null,
    raw: parsed,
  };
}



