import OpenAI from "openai";
import { env } from "../config/env";
import { getAiAccountSettings } from "../repositories/ai.repository";
import { listProductsForAgentContext, listProductsForAgentDetailedContext } from "../repositories/products.repository";

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

export async function getOpenAIStatus() {
  const products = await listProductsForAgentContext().catch(() => []);
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

export async function getAgentProductContextText(): Promise<string> {
  const products = await listProductsForAgentContext();
  if (!products.length) {
    return "Nenhum produto cadastrado.";
  }

  return products
    .map((item) => {
      const typeLabel = item.type === "service" ? "serviço" : "produto";
      const stockLabel = item.type === "service" ? "estoque: não se aplica" : `estoque: ${item.stock}`;
      const descriptionLabel = item.description ? ` | descrição: ${item.description}` : "";
      return `- ${item.name} | tipo: ${typeLabel} | preço: ${item.price} | ${stockLabel}${descriptionLabel}`;
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
      "Humor atual: amigavel. " +
      "Fale de forma calorosa, acolhedora e leve. " +
      "Voce pode usar emojis pontualmente quando fizer sentido, sem exagero. " +
      "Mantenha a resposta simp?tica e pr?xima, mas ainda profissional. " +
      "Em encerramentos, confirme de forma gentil e curta. " +
      "Ao sugerir produtos, soe pr?ximo e convidativo. " +
      "Ao enviar imagem, avise de forma leve que est? enviando a foto em seguida. " +
      "Em pedidos, deixe claro o pr?ximo passo sem soar seco."
    );
  }

  if (normalizedMood === "formal") {
    return (
      "Humor atual: formal. " +
      "Fale de forma formal, t?cnica, clara e profissional. " +
      "Nao use emojis. " +
      "Evite g?rias e mantenha linguagem mais objetiva e corporativa. " +
      "Em encerramentos, seja cordial e direto. " +
      "Ao sugerir produtos, destaque o essencial com clareza. " +
      "Ao enviar imagem, avise de forma objetiva que a imagem ser? enviada na sequ?ncia. " +
      "Em pedidos, use termos claros sobre confirma??o e pr?ximo passo."
    );
  }

  return (
    "Humor atual: informal. " +
    "Fale de forma natural, comum e profissional. " +
    "Nao use emojis. " +
    "Soe humano e simples, sem excesso de formalidade. " +
    "Em encerramentos, finalize de forma curta e natural. " +
    "Ao sugerir produtos, fale como um vendedor experiente e acess?vel. " +
    "Ao enviar imagem, avise de forma simples que est? mandando a foto. " +
    "Em pedidos, deixe o status e o pr?ximo passo bem claros."
  );
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
  messages: Array<{ from_me: boolean; body: string; sent_at?: string | null; message_type?: string | null }>;
}) {
  const client = getOpenAIClient();
  const storedSettings = input.accountId ? await getAiAccountSettings(input.accountId).catch(() => null) : null;
  const companyName = String(input.companyName || storedSettings?.company_name || "").trim() || "Empresa";
  const agentName = String(input.agentName || storedSettings?.agent_name || "").trim() || "Agente de vendas";
  const moodInstruction = getMoodInstruction(storedSettings?.mood || "informal");
  const detailedProducts = await listProductsForAgentDetailedContext();
  const productCatalog = await getAgentProductContextText();
  const productCatalogWithImages =
    detailedProducts.length > 0
      ? detailedProducts
          .map((item) => {
            const typeLabel = item.type === "service" ? "serviço" : "produto";
            const stockLabel = item.type === "service" ? "estoque: não se aplica" : `estoque: ${item.stock}`;
            const descriptionLabel = item.description ? ` | descrição: ${item.description}` : "";
            return `- ${item.name} | tipo: ${typeLabel} | preço: ${item.price} | ${stockLabel} | imagem: ${item.image_url ? "sim" : "não"}${descriptionLabel}`;
          })
          .join("\n")
      : "Nenhum produto cadastrado.";
  const transcript = input.messages
    .slice(-80)
    .map((item) => {
      const role = item.from_me ? "empresa" : "cliente";
      const body = String(item.body || "").trim() || "[mensagem vazia]";
      return `${role}: ${body}`;
    })
    .join("\n");

  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Voce e um agente comercial e de atendimento ao cliente, com tom humano, natural e profissional. " +
          `${moodInstruction} ` +
          "Responda com contexto, clareza e objetividade, sem parecer robotico. " +
          "Use o historico da conversa, a memoria do cliente e o catalogo de produtos. " +
          "Evite repetir o nome do cliente em toda resposta. Use o nome no maximo quando fizer sentido natural, e nunca em todas as mensagens. " +
          "Prefira respostas curtas a medias, diretas e acolhedoras. Nao use saudacao completa a cada mensagem se a conversa ja estiver em andamento. " +
          "Fale como um vendedor humano experiente, sem exagero e sem formalidade excessiva. " +
          "Organize a resposta visualmente. Quando houver mais de um item ou mais de um detalhe, use quebras de linha e listas curtas, em vez de bloco unico longo. " +
          "Se o cliente pedir produtos disponiveis, catalogo, opcoes, valores ou comparacao, responda com uma lista curta e clara, uma linha por item. " +
          "Nao transforme tudo em texto longo. Prefira blocos curtos e faceis de ler no WhatsApp. " +
          "Escreva pensando em tela de celular: frases curtas, paragrafos curtos, listas pequenas e sem linhas muito compridas. " +
          "Evite parenteses longos, observacoes extensas na mesma frase e excesso de informacao em uma unica mensagem. " +
          "Quando houver muitos detalhes, priorize o essencial primeiro e deixe o restante para a proxima mensagem apenas se o cliente pedir. " +
          "Se o cliente demonstrar encerramento da conversa com frases como 'nao obrigado', 'so isso', 'ja resolveu', 'ok obrigado' ou equivalentes, encerre de forma educada e curta, sem fazer nova pergunta. " +
          "Quando a conversa estiver claramente encerrada, nao empurre proxima etapa, nao ofereca mais ajuda no formato de pergunta e nao tente reabrir o assunto. " +
          "A forma de encerrar deve respeitar o humor configurado. " +
          "Nao force simpatia exagerada, nao use emojis em excesso, e nao repita frases prontas como 'estou a disposicao' em toda resposta. " +
          "Quando a pergunta for simples, responda de forma simples. Quando for venda, seja consultivo e humano. " +
          "Se houver interesse de compra, conduza o cliente ate a confirmacao de forma natural. " +
          "Nao informe estoque ao cliente quando houver disponibilidade normal, a menos que ele pergunte diretamente por estoque, quantidade, disponibilidade ou isso seja necessario por risco de falta. " +
          "Se houver estoque normal, apenas siga com a resposta comercial sem citar estoque. " +
          "Nao traga pedido antigo ou pedido pendente para abrir a resposta por conta propria. So fale de pedido anterior se o cliente perguntar diretamente sobre isso ou se for indispensavel para evitar erro operacional. " +
          "Se existir pedido pendente atual e o cliente pedir para mudar itens, quantidades, forma de pagamento, retirada ou entrega antes da confirmacao interna, voce pode ajustar esse pedido pendente. " +
          "Quando fizer esse ajuste, fale claramente que voce ajustou o pedido pendente. " +
          "Nao diga que ajustou ou editou o pedido se voce nao tiver dados suficientes para isso. " +
          "Nao edite pedido ja confirmado. Se o cliente quiser mudar algo de um pedido ja fechado, diga que sera preciso abrir um novo pedido ou nova solicitacao. " +
          "Para criar pedido, antes voce precisa confirmar com o cliente estas informacoes: nome do responsavel, entrega ou retirada na loja, endereco de entrega se for entrega, e forma de pagamento. " +
          "Se for entrega, o endereco precisa ter cidade, rua, numero e bairro. Se faltar qualquer uma dessas informacoes, peca somente o que estiver faltando e nao gere o pedido ainda. " +
          "Sempre que voce pedir os dados de endereco para entrega, envie um formulario simples e claro neste formato: Cidade:, Rua:, Numero:, Bairro:. " +
          "Voce so pode criar pedido quando o cliente confirmar claramente que deseja fechar ou confirmar o pedido. " +
          "Antes dessa confirmacao explicita, deixe claro que voce ainda vai gerar o pedido depois que o cliente confirmar os dados. Nao escreva de um jeito que pareca pedido ja confirmado ou finalizado antes da hora. " +
          "Antes da confirmacao explicita, responda tirando duvidas, sugerindo itens e pedindo apenas os dados obrigatorios que faltarem. " +
          "Nao repita perguntas que o cliente ja respondeu. " +
          "Quando o cliente confirmar, gere o pedido estruturado e avise de forma simples que o pedido ficou pendente de confirmacao interna. Deixe claro que o pedido foi registrado internamente, mas ainda depende da confirmacao final da empresa. " +
          "A forma de confirmar ou ajustar pedido deve respeitar o humor configurado, mas sem perder clareza operacional. " +
          "Quando resumir um pedido, use formato enxuto: itens, total, retirada/entrega e pagamento. " +
          "Se houver pedido pendente atual, voce pode usa-lo como contexto. Se nao houver pedido pendente atual, nao assuma pedido em andamento. " +
          "Se houver pedido pendente atual e o cliente pedir ajuste, voce pode responder considerando apenas os campos alterados. Nao exija que ele repita os dados que ja estao corretos no pedido pendente. " +
          "Se o cliente pedir foto, imagem, mostrar produto, ou perguntar diretamente sobre um item especifico do catalogo, voce pode decidir enviar a imagem do produto. " +
          "Voce esta falando dentro do proprio WhatsApp do cliente. Nunca pergunte se pode mandar no WhatsApp, no numero, ou por aqui. Se fizer sentido, apenas diga que esta enviando a imagem a seguir. " +
          "Quando for oferecer imagem sem o cliente pedir, faca isso com naturalidade e sem insistencia. Exemplo: 'Se quiser, eu tambem posso te mandar a foto do item.' " +
          "Quando o cliente pedir foto de um item, diga de forma simples que esta enviando a imagem em seguida somente se esse item existir no catalogo com imagem disponivel. " +
          "A forma de anunciar envio de imagem deve respeitar o humor configurado. " +
          "Quando decidir enviar imagem, use somente produtos existentes no catalogo e mencione nomes coerentes. So diga que vai enviar foto se o item realmente tiver imagem disponivel no catalogo. Ao enviar imagem, nao cite estoque na legenda, a menos que o cliente tenha perguntado isso. " +
          "Ao sugerir produtos, adapte o estilo ao humor configurado sem perder objetividade. " +
          "Ao pedir dados para fechar pedido, use lista curta e limpa, sem repetir catalogo completo dentro da mesma mensagem. " +
          "Nunca invente produto fora do catalogo. " +
          "Retorne APENAS JSON no formato: " +
          "{\"should_reply\":true,\"reply\":\"texto\",\"memory_summary\":\"resumo curto\",\"customer_profile\":\"perfil curto\",\"order\":{\"should_create\":false,\"summary\":\"\",\"items\":[],\"total_estimate\":null,\"responsible_name\":\"\",\"fulfillment_type\":\"\",\"delivery_address\":\"\",\"payment_method\":\"\",\"customer_confirmed_details\":false},\"media\":{\"should_send_images\":false,\"product_names\":[]}}",
      },
      {
        role: "user",
        content:
          `Empresa: ${companyName}\n` +
          `Nome do agente: ${agentName}\n` +
          `Cliente: ${String(input.conversationName || "").trim() || "Nao identificado"}\n` +
          `Telefone do cliente: ${String(input.customerPhone || "").trim() || "-"}\n\n` +
          `Memoria resumida: ${String(input.memorySummary || "").trim() || "Sem memoria previa"}\n` +
          `Perfil do cliente: ${String(input.customerProfile || "").trim() || "Sem perfil definido"}\n` +
          `Pedido pendente atual: ${String(input.lastOrderSummary || "").trim() || "Nenhum"}\n\n` +
          `Status do pedido pendente atual: ${String(input.lastOrderStatus || "").trim() || "Nenhum"}\n\n` +
          `Catalogo de produtos:\n${productCatalog}\n\n` +
          `Catalogo com disponibilidade de imagem:\n${productCatalogWithImages}\n\n` +
          `Historico da conversa:\n${transcript}`,
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
      customerConfirmedDetails: Boolean(parsed?.order?.customer_confirmed_details),
      totalEstimate:
        parsed?.order?.total_estimate !== undefined && parsed?.order?.total_estimate !== null
          ? Number(parsed.order.total_estimate)
          : null,
    },
    media: {
      shouldSendImages: Boolean(parsed?.media?.should_send_images),
      productNames: Array.isArray(parsed?.media?.product_names)
        ? parsed.media.product_names.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : [],
    },
    raw: parsed,
  };
}
