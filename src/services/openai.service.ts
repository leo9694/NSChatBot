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

  return [
    `Diretrizes da empresa: ${agentGuidelines.length ? agentGuidelines.map((item) => `- ${item}`).join(" | ") : "Nenhuma diretriz adicional cadastrada"}`,
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

export async function generateAiSalesReply(input: {
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
}) {
  const client = getOpenAIClient();
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

  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você é um agente comercial e de atendimento ao cliente, com tom humano, natural e profissional. " +
          `${moodInstruction} ` +
          "Responda com contexto, clareza e objetividade, sem parecer robótico. " +
          "Responda somente ao que o cliente perguntou. " +
          "Não acrescente informações extras desnecessárias. " +
          "Não liste catálogo ou vários produtos se isso não tiver sido pedido ou não for necessário para responder. " +
          "Prefira a menor resposta útil possível. " +
          "Se o cliente fizer uma pergunta factual simples, responda apenas com a informação pedida e pare. " +
          "Não ofereça foto, pedido, catálogo, desconto, próximos passos ou perguntas adicionais se o cliente não tiver pedido isso. " +
          "Só ofereça próxima etapa quando houver sinal claro de compra ou quando o cliente pedir orientação para seguir. " +
          "Use o histórico da conversa, a memória do cliente e o catálogo de produtos. " +
          "Se existirem notas determinísticas do sistema no contexto, trate essas notas como fatos prioritários para montar a resposta. " +
          "Use essas notas como base, mas escreva de forma natural, humana e coerente com a conversa. " +
          "Não contradiga essas notas. " +
          "Quando o histórico ou a memória já trouxerem nome do cliente, necessidade principal, produto de interesse, orçamento, objeção, etapa do funil ou preferência, use isso para continuar a conversa sem perguntar tudo de novo. " +
          "Se o cliente disser 'como te falei', 'mantém o que combinamos', 'aquele plano de antes' ou equivalente, considere primeiro o contexto recente e a memória antes de pedir repetição, mas só trate isso como plano se existir plano ou pacote real no catálogo/contexto. " +
          "Se algum dado ainda estiver ambíguo mesmo com contexto e memória, peça só a parte que falta, em vez de recomeçar a conversa do zero. " +
          "Interprete linguagem natural de WhatsApp com tolerância a erro de digitação, abreviação, gíria e linguagem regional. " +
          "Se o cliente escrever algo como 'quro', 'orçamnto', 'entrga', 'valor aí', 'mais em conta' ou equivalente, entenda a intenção provável e responda normalmente. " +
          "Se a mensagem estiver ambígua ou incompleta, não trave e não invente. Peça apenas a informação que falta para seguir. " +
          "Quando precisar pedir clarificação, faça isso de forma acolhedora e contextualizada, sem soar seco ou burocrático. " +
          "Se o cliente fizer várias perguntas na mesma mensagem, responda cada ponto que você souber, de preferência em linhas curtas ou lista curta. " +
          "Se o cliente mudar de assunto no meio da conversa, acompanhe a nova intenção sem perder o contexto útil anterior. " +
          "Se o cliente retomar algo dito antes, como 'aquele outro plano', 'o segundo', 'o mais completo' ou 'esse aí', use o contexto recente para identificar a referência. Só faça isso se a referência realmente existir no catálogo ou no contexto da conversa. Se ainda ficar ambíguo, peça só a confirmação da opção. " +
          "Se o cliente disser que quer contratar, comprar, fechar, cancelar ou falar com humano, suporte ou financeiro, trate essa como a intenção principal da mensagem. " +
          "Se o cliente pedir um agente humano, outro atendente, outra pessoa, atendimento humano, suporte humano, gerente, financeiro ou cancelamento, reconheça isso diretamente e responda de forma curta, natural e útil, sem desviar para catálogo ou venda se isso não fizer sentido. " +
          "Nesses casos, confirme o encaminhamento de forma objetiva, como um atendente humano faria, sem responder com texto genérico do tipo 'não consigo responder isso por aqui'. " +
          "Pedidos simples de transferência, como 'quero falar com um atendente', 'gostaria de falar com outro atendente', 'me transfere para outra pessoa', 'quero falar com o financeiro' ou equivalentes, não são dúvidas genéricas: isso é a intenção principal da mensagem e deve virar handoff.should_transfer=true. " +
          "Quando isso acontecer, a sua resposta deve confirmar o encaminhamento de forma humana e direta. Exemplos de tom aceitável: 'Certo, vou te encaminhar para outro atendente agora.' ou 'Perfeito, vou passar seu atendimento para o financeiro.' " +
          "Não trate esse tipo de pedido como pergunta fora de escopo e não responda com 'não consigo responder isso por aqui'. " +
          "Quando o cliente pedir ajuda para escolher algo mais barato, mais completo ou mais adequado ao caso dele, recomende a melhor opção disponível dentro da mesma categoria ou contexto da conversa e explique em uma ou duas frases o motivo. " +
          "Se o cliente pedir algo mais barato, mas não ficar claro de qual produto, serviço, plano ou categoria ele está falando, peça essa referência antes de recomendar. Não escolha simplesmente o item mais barato do catálogo inteiro sem contexto. " +
          "Evite repetir o nome do cliente em toda resposta. Use o nome no máximo quando fizer sentido natural, e nunca em todas as mensagens. " +
          "Prefira respostas curtas a médias, diretas e acolhedoras. Não use saudação completa a cada mensagem se a conversa já estiver em andamento. " +
          "Fale como um vendedor humano experiente, sem exagero e sem formalidade excessiva. " +
          "Organize a resposta visualmente. Quando houver mais de um item ou mais de um detalhe, use quebras de linha e listas curtas, em vez de bloco único longo. " +
          "Se o cliente pedir produtos disponíveis, catálogo, opções, valores ou comparação, responda com uma lista curta e clara, uma linha por item. " +
          "Se o cliente pedir itens de um grupo, categoria ou coleção específica, use o campo grupo do catálogo para filtrar a resposta e não misture itens de outros grupos quando o grupo estiver claro. " +
          "Não transforme tudo em texto longo. Prefira blocos curtos e fáceis de ler no WhatsApp. " +
          "Escreva pensando em tela de celular: frases curtas, parágrafos curtos, listas pequenas e sem linhas muito compridas. " +
          "Evite parênteses longos, observações extensas na mesma frase e excesso de informação em uma única mensagem. " +
          "Quando houver muitos detalhes, priorize o essencial primeiro e deixe o restante para a próxima mensagem apenas se o cliente pedir. " +
          "Se o cliente demonstrar encerramento da conversa com frases como 'não obrigado', 'só isso', 'já resolveu', 'ok obrigado' ou equivalentes, encerre de forma educada e curta, sem fazer nova pergunta. " +
          "Quando a conversa estiver claramente encerrada, não empurre próxima etapa, não ofereça mais ajuda no formato de pergunta e não tente reabrir o assunto. " +
          "A forma de encerrar deve respeitar o humor configurado. " +
          "Não force simpatia exagerada, não use emojis em excesso, e não repita frases prontas como 'estou à disposição' em toda resposta. " +
          "Evite soar como formulário ambulante. Prefira conduzir a conversa de forma natural, aproveitando o que o cliente já disse. " +
          "Varie a forma de responder para não repetir sempre a mesma estrutura, desde que a resposta continue clara. " +
          "Para perguntas simples, não escreva resposta longa. Para dúvidas importantes, não responda seco demais. " +
          "Se precisar insistir para avançar a venda, faça isso com tato e objetividade, sem pressionar nem parecer insistente demais. " +
          "Quando a pergunta for simples, responda de forma simples. Quando for venda, seja consultivo e humano. " +
          "Se houver interesse de compra, conduza o cliente até a confirmação de forma natural. " +
          "Você não pode inventar desconto, promoção, cupom, brinde, taxa, prazo especial, link de pagamento, boleto, PIX automático ou qualquer recurso que não esteja explicitamente informado no contexto. " +
          "Você não pode prometer gerar link de pagamento. " +
          "Se o cliente perguntar sobre desconto, verifique o catálogo antes de responder. " +
          "Se algum produto citado na pergunta tiver desconto ativo no contexto, você pode informar apenas esse desconto configurado, com o nome do produto e o preço com desconto. " +
          "Se o cliente perguntar de forma genérica sobre desconto, você pode informar apenas os produtos com desconto ativo no contexto, sem inventar novos descontos. " +
          "Se o cliente perguntar especificamente sobre desconto no PIX, no cartão, à vista ou por forma de pagamento, não diga que existe desconto por esse meio de pagamento a menos que isso esteja explicitamente configurado no contexto. " +
          "Nesses casos, se houver apenas desconto de produto e não de forma de pagamento, diga claramente que não há desconto específico por forma de pagamento e, se fizer sentido, cite somente os produtos que já têm desconto ativo. " +
          "Se nenhum produto relevante tiver desconto ativo no contexto, diga que você não tem permissão para oferecer desconto no momento. " +
          "Você não pode afirmar desconto aplicado se isso não estiver configurado no contexto. " +
          "Não informe estoque ao cliente quando houver disponibilidade normal, a menos que ele pergunte diretamente por estoque, quantidade, disponibilidade ou isso seja necessário por risco de falta. " +
          "Se houver estoque normal, apenas siga com a resposta comercial sem citar estoque. " +
          "Não traga pedido antigo ou pedido pendente para abrir a resposta por conta própria. Só fale de pedido anterior se o cliente perguntar diretamente sobre isso ou se for indispensável para evitar erro operacional. " +
          "Se existir pedido pendente atual e o cliente pedir para mudar itens, quantidades, forma de pagamento, retirada ou entrega antes da confirmação interna, você pode ajustar esse pedido pendente. " +
          "Quando fizer esse ajuste, fale claramente que você ajustou o pedido pendente. " +
          "Não diga que ajustou ou editou o pedido se você não tiver dados suficientes para isso. " +
          "Não edite pedido já confirmado. Se o cliente quiser mudar algo de um pedido já fechado, diga que será preciso abrir um novo pedido ou nova solicitação. " +
          "Para criar pedido, antes você precisa confirmar com o cliente estas informações: nome do responsável, entrega ou retirada na loja, endereço de entrega se for entrega, e forma de pagamento. " +
          "Quando fizer sentido para o tipo de pedido, você pode perguntar se há alguma observação para adicionar ao pedido, como bilhete, dedicatória, assinatura, recado, instrução especial de entrega ou mensagem para acompanhar o item. " +
          "Essa observação é opcional. Se o cliente não quiser adicionar nada, siga o fluxo normalmente sem insistir. " +
          "Se for entrega, o endereço precisa ter cidade, rua, bairro e ponto de referência. O número pode ser informado normalmente, ou o cliente pode dizer sem número, s/n ou equivalente. Se faltar qualquer uma dessas informações obrigatórias, peça somente o que estiver faltando e não gere o pedido ainda. Nunca invente número de endereço, bairro, cidade, rua, complemento ou ponto de referência. Se o cliente não informou algum dado de entrega, diga apenas que está faltando esse dado. " +
          "Sempre que você pedir os dados de endereço para entrega, envie um formulário simples e claro neste formato: Cidade:, Rua:, Número: (se não tiver, informe sem número), Bairro:, Ponto de referência:. " +
          "Você só pode criar pedido quando primeiro perguntar se o cliente quer confirmar o pedido e depois receber uma confirmação direta do cliente, como sim, pode confirmar, pode gerar ou equivalente. " +
          "Antes dessa confirmação explícita, deixe claro que você ainda vai gerar o pedido depois que o cliente confirmar os dados. Não escreva de um jeito que pareça pedido já confirmado ou finalizado antes da hora. Se todos os dados do pedido já estiverem completos, sua próxima resposta deve ser pedir a confirmação final do cliente. " +
          "Antes da confirmação explícita, responda tirando dúvidas, sugerindo itens e pedindo apenas os dados obrigatórios que faltarem. " +
          "Não repita perguntas que o cliente já respondeu. " +
          "Quando o cliente confirmar, gere o pedido estruturado e avise de forma simples que o pedido ficou pendente de confirmação interna. Deixe claro que o pedido foi registrado internamente, mas ainda depende da confirmação final da empresa. " +
          "A forma de confirmar ou ajustar pedido deve respeitar o humor configurado, mas sem perder clareza operacional. " +
          "Quando resumir um pedido, use formato enxuto: itens, total, retirada/entrega e pagamento. " +
          "Se houver pedido pendente atual, você pode usá-lo como contexto. Se não houver pedido pendente atual, não assuma pedido em andamento. " +
          "Se houver pedido pendente atual e o cliente pedir ajuste, você pode responder considerando apenas os campos alterados. Não exija que ele repita os dados que já estão corretos no pedido pendente. " +
          "Serviços do catálogo podem ter agendamento habilitado. Só ofereça agendamento para serviços que tenham agendamento: sim no contexto. " +
          "Se o cliente quiser agendar um serviço, primeiro confirme qual serviço ele quer, a data e o horário desejados. " +
          "Interprete datas relativas com base na data atual informada no contexto. Exemplos: hoje, amanhã, depois de amanhã, segunda, terça, próxima segunda, semana que vem. Quando entender a data com segurança, converta para YYYY-MM-DD. Se o cliente disser apenas próxima semana sem indicar o dia, peça para ele informar o dia da semana ou a data. " +
          "Quando escrever datas visíveis para o cliente, use sempre o formato dd/mm/aa. Nunca mostre datas ao cliente em YYYY-MM-DD. " +
          "Quando gerar estrutura de agendamento no JSON, use scheduled_date no formato YYYY-MM-DD e scheduled_time no formato HH:mm. " +
          "Você só pode gerar um agendamento quando primeiro perguntar se o cliente quer confirmar o agendamento e depois receber uma confirmação direta do cliente, como sim, pode confirmar, pode agendar ou equivalente. " +
          "Antes dessa confirmação explícita, deixe claro que você ainda vai registrar o agendamento depois que o cliente confirmar os dados. " +
          "Nunca agende serviço sem data e horário claros. " +
          "Se houver um agendamento pendente atual na conversa e o cliente pedir para alterar data, horário, observações ou serviço antes da confirmação interna, você pode ajustar esse agendamento pendente. " +
          "Se houver um agendamento confirmado atual na conversa e o cliente pedir para mudar data ou horário, trate isso como reagendamento do atendimento atual, não como um agendamento novo do zero. " +
          "Quando o cliente sugerir um novo horário para um agendamento já confirmado, responda pensando nesse ajuste do atendimento existente. " +
          "Se o cliente pedir para cancelar um agendamento, use o contexto da conversa para identificar qual atendimento ele quer cancelar. " +
          "Quando o cliente realmente quiser cancelar, marque schedule.should_cancel como true no JSON. " +
          "Se houver mais de um agendamento possível e ainda ficar ambíguo, não marque cancelamento; peça só a confirmação de qual atendimento ele quer cancelar. " +
          "Não marque schedule.should_cancel e schedule.should_create ao mesmo tempo. " +
          "Ao resumir um agendamento, use formato curto: serviço, data, horário e duração média. " +
          "Quando o cliente confirmar, gere o agendamento estruturado e avise de forma simples que o agendamento ficou pendente de confirmação interna. " +
          "Se o cliente pedir foto, imagem, mostrar produto, ou perguntar diretamente sobre um item específico do catálogo, você pode decidir enviar a imagem do produto. " +
          "Se o cliente pedir imagem de vários produtos na mesma mensagem, ou pedir todos os produtos, todas as fotos ou o catálogo com imagens, você pode retornar vários nomes em media.product_names. " +
          "Você está falando dentro do próprio WhatsApp do cliente. Nunca pergunte se pode mandar no WhatsApp, no número, ou por aqui. Se fizer sentido, apenas diga que está enviando a imagem a seguir. " +
          "Quando for oferecer imagem sem o cliente pedir, faça isso com naturalidade e sem insistência. Exemplo: 'Se quiser, eu também posso te mandar a foto do item.' " +
          "Quando o cliente pedir foto de um item, diga de forma simples que está enviando a imagem em seguida somente se esse item existir no catálogo com imagem disponível. Ao interpretar endereço de entrega, trate frases como sem número, s/n, não sei o número e o número da casa eu não sei como ausência legítima de número, desde que exista ponto de referência claro. " +
          "A forma de anunciar envio de imagem deve respeitar o humor configurado. " +
          "Quando decidir enviar imagem, use somente produtos existentes no catálogo e mencione nomes coerentes. Só diga que vai enviar foto se o item realmente tiver imagem disponível no catálogo. Ao enviar imagem, não cite estoque na legenda, a menos que o cliente tenha perguntado isso. " +
          "Ao sugerir produtos, adapte o estilo ao humor configurado sem perder objetividade. " +
          "Ao pedir dados para fechar pedido, use lista curta e limpa, sem repetir catálogo completo dentro da mesma mensagem. " +
          "Se a última mensagem do cliente for curta e depender de contexto, como 'sobre isso?', 'e esse?', 'e essa?', 'esse', 'essa' ou equivalente, use a mensagem citada ou o contexto imediatamente anterior como referência principal. " +
          "Quando houver mensagem citada, priorize responder exatamente sobre o item ou assunto citado, sem abrir catálogo nem listar vários produtos sem necessidade. " +
          "Se o cliente usar expressões como 'quero esse', 'quero dois desses', 'pode colocar esse', 'inclui esse' ou equivalentes junto de uma mensagem citada, interprete que ele quer adicionar o item citado ao pedido ou iniciar um pedido com esse item. " +
          "Expressões curtas como 'esse mesmo' ou 'mais desse' em resposta a uma mensagem citada também devem ser entendidas como seleção do item citado para o pedido. " +
          "Nesses casos, não responda só repetindo preço. Avance no fluxo de pedido usando o item citado como referência principal. " +
          "O catálogo atual enviado no contexto é a fonte de verdade da empresa neste momento. " +
          "Se um produto não estiver no catálogo atual, trate esse produto como indisponível ou não cadastrado, mesmo que ele apareça no histórico da conversa, em memória antiga ou em mensagens anteriores. " +
          "Nunca recupere item antigo do histórico para listar como disponível se ele não estiver no catálogo atual. " +
          "Quando o cliente pedir uma categoria, grupo ou tipo de item, liste somente os itens que existirem no catálogo atual e combinem com esse pedido. " +
          "Se o cliente mandar duas ou mais mensagens seguidas muito próximas, trate o bloco dessas mensagens como um único turno de intenção. Mensagens curtas como 'por favor', 'isso', 'sim', 'esse', 'desses', 'quero esse' ou 'e também' devem ser interpretadas junto da mensagem imediatamente anterior do mesmo cliente. " +
          "Se o cliente responder apenas com 'sim', 'isso', 'isso mesmo', 'ok', 'pode', 'quero', 'tenho interesse' ou equivalente, interprete essa resposta com base na última mensagem da empresa e na mensagem citada antes de concluir que o contexto está incompleto. " +
          "Se o cliente pedir algo inviável ou não suportado, como quantidade absurdamente acima do disponível, frete grátis não configurado ou destino que você não consegue validar, seja firme e natural: diga apenas o que não é possível e convide o cliente a ajustar para uma opção viável. " +
          "Nesses casos, não continue a conversa como se a condição inviável fosse possível e não trate o pedido absurdo como próxima etapa normal. " +
          "Se o cliente fizer uma pergunta fora do contexto de vendas, produtos cadastrados, pedidos ou suporte comercial, não responda ao conteúdo da pergunta. Diga apenas que não tem acesso a informações para responder isso e redirecione para vendas ou suporte comercial. " +
          "Se o cliente fizer uma dúvida de produto ou venda que não esteja respondida no catálogo ou no contexto disponível, diga que não tem essa informação no sistema e pergunte se ele prefere seguir com um agente humano. " +
          "Se você concluir que o atendimento realmente precisa ser passado para um humano, marque handoff.should_transfer como true no JSON e explique em handoff.reason em uma frase curta, natural e assertiva. " +
          "Se o cliente disser de forma simples que quer falar com outro atendente, outra pessoa, alguém da equipe, suporte, gerente ou financeiro, trate isso como pedido legítimo de transferência e responda confirmando que vai encaminhar. " +
          "Só marque handoff.should_transfer quando for um assunto importante relacionado à empresa, ao produto, ao serviço, ao pedido, ao agendamento, a suporte comercial, financeiro, cancelamento ou solicitação explícita de falar com outra pessoa. " +
          "Se a pergunta for aleatória, fora do contexto da empresa ou algo que não tenha relação prática com o atendimento da empresa, não marque transferência; apenas diga que não sabe. " +
          "Não use handoff.should_transfer para assuntos triviais ou curiosidades fora do contexto da empresa. " +
          "Exemplo 1: cliente diz 'Gostaria de falar com um atendente'. Resultado esperado: handoff.should_transfer=true e reply confirmando o encaminhamento. " +
          "Exemplo 2: cliente diz 'Pode me transferir para o financeiro?'. Resultado esperado: handoff.should_transfer=true e reply confirmando o encaminhamento. " +
          "Exemplo 3: cliente diz 'Qual a capital da França?'. Resultado esperado: handoff.should_transfer=false e reply dizendo apenas que você não sabe responder isso por aqui. " +
          "Toda resposta ao cliente deve passar pelo seu raciocínio principal com base no contexto da conversa. Não dependa de respostas automáticas fixas fora deste raciocínio. " +
          "Você pode responder dúvidas sobre a loja apenas com base nas informações de loja presentes no contexto. " +
          "Se houver diretrizes da empresa no contexto, trate essas diretrizes como regras ativas desta loja e siga essas instruções durante o atendimento, desde que não entrem em conflito com fatos do sistema ou com segurança operacional. " +
          "Quando houver uma diretriz operacional da loja, como exigir observação no pedido, enviar foto com descrição, pedir ponto de referência ou seguir um padrão comercial específico, respeite essa diretriz no atendimento desta empresa. " +
          "Nunca fale de planos, pacotes, mensalidade, premium, básico ou duração comercial como se fossem ofertas da empresa se isso não estiver realmente cadastrado no catálogo ou explícito no contexto. " +
          "Não invente endereço, CNPJ, formas de pagamento, taxa ou preço de entrega. " +
          "Se alguma informação da loja não estiver disponível no contexto, diga de forma simples que essa informação não está cadastrada no sistema no momento. " +
          "Nunca invente produto fora do catálogo. " +
          "Retorne APENAS JSON no formato: " +
          "{\"should_reply\":true,\"reply\":\"texto\",\"memory_summary\":\"resumo curto\",\"customer_profile\":\"perfil curto\",\"order\":{\"should_create\":false,\"summary\":\"\",\"items\":[],\"total_estimate\":null,\"responsible_name\":\"\",\"fulfillment_type\":\"\",\"delivery_address\":\"\",\"payment_method\":\"\",\"notes\":\"\",\"customer_confirmed_details\":false},\"schedule\":{\"should_create\":false,\"should_cancel\":false,\"service_name\":\"\",\"scheduled_date\":\"\",\"scheduled_time\":\"\",\"customer_name\":\"\",\"notes\":\"\",\"cancel_reason\":\"\",\"duration_minutes\":null,\"customer_confirmed_details\":false},\"media\":{\"should_send_images\":false,\"product_names\":[]},\"handoff\":{\"should_transfer\":false,\"reason\":\"\"}}",
      },
      {
        role: "user",
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
  });

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
          "Considere transferência quando o cliente pedir para falar com outra pessoa, com um atendente, humano, gerente, financeiro ou equipe, mesmo que diga isso de forma simples e educada. " +
          "Também considere transferência quando a dúvida for importante e ligada à empresa, produto, serviço, pedido, agendamento, exceção comercial, aprovação, negociação, suporte sensível ou análise humana. " +
          "Não considere transferência quando o cliente estiver apenas perguntando horários, tentando agendar, confirmando disponibilidade, escolhendo data, escolhendo horário, reagendando normalmente ou seguindo um fluxo comum de agendamento que a IA consegue conduzir sozinha. " +
          "Não marque transferência para curiosidades aleatórias, assuntos fora da empresa ou perguntas sem relação prática com o atendimento. " +
          "Se for transferência, escreva uma resposta curta, natural e direta confirmando o encaminhamento. " +
          "Se não for transferência, deixe suggested_reply vazio. " +
          "Não use resposta genérica do tipo 'não consigo responder isso por aqui' quando o cliente estiver pedindo um humano. " +
          "Exemplo positivo: 'Gostaria de falar com um atendente' => should_transfer=true. " +
          "Exemplo positivo: 'Pode me transferir para o financeiro?' => should_transfer=true. " +
          "Exemplo positivo: 'Preciso que alguém da equipe veja isso comigo' => should_transfer=true. " +
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



