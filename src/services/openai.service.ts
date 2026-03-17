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

function buildProductDiscountLabel(item: {
  discount_enabled?: boolean | null;
  discount_price?: string | null;
}) {
  if (item.discount_enabled && item.discount_price) {
    return ` | desconto ativo: sim | preÃ§o com desconto: ${item.discount_price}`;
  }
  return " | desconto ativo: nÃ£o";
}

export async function getAgentProductContextText(): Promise<string> {
  const products = await listProductsForAgentContext();
  if (!products.length) {
    return "Nenhum produto cadastrado.";
  }

  return products
    .map((item) => {
      const typeLabel = item.type === "service" ? "serviÃ§o" : "produto";
      const stockLabel = item.type === "service" ? "estoque: nÃ£o se aplica" : `estoque: ${item.stock}`;
      const descriptionLabel = item.description ? ` | descriÃ§Ã£o: ${item.description}` : "";
      return `- ${item.name} | tipo: ${typeLabel} | preÃ§o: ${item.price}${buildProductDiscountLabel(item)} | ${stockLabel}${descriptionLabel}`;
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
      "Humor atual: amigÃ¡vel. " +
      "Fale de forma calorosa, acolhedora e leve. " +
      "VocÃª pode usar emojis pontualmente quando fizer sentido, sem exagero. " +
      "Mantenha a resposta simpÃ¡tica e prÃ³xima, mas ainda profissional. " +
      "Em encerramentos, confirme de forma gentil e curta. " +
      "Ao sugerir produtos, soe prÃ³ximo e convidativo. " +
      "Ao enviar imagem, avise de forma leve que estÃ¡ enviando a foto em seguida. " +
      "Em pedidos, deixe claro o prÃ³ximo passo sem soar seco."
    );
  }

  if (normalizedMood === "formal") {
    return (
      "Humor atual: formal. " +
      "Fale de forma formal, tÃ©cnica, clara e profissional. " +
      "NÃ£o use emojis. " +
      "Evite gÃ­rias e mantenha linguagem mais objetiva e corporativa. " +
      "Em encerramentos, seja cordial e direto. " +
      "Ao sugerir produtos, destaque o essencial com clareza. " +
      "Ao enviar imagem, avise de forma objetiva que a imagem serÃ¡ enviada na sequÃªncia. " +
      "Em pedidos, use termos claros sobre confirmaÃ§Ã£o e prÃ³ximo passo."
    );
  }

  return (
    "Humor atual: informal. " +
    "Fale de forma natural, comum e profissional. " +
    "NÃ£o use emojis. " +
    "Soe humano e simples, sem excesso de formalidade. " +
    "Em encerramentos, finalize de forma curta e natural. " +
    "Ao sugerir produtos, fale como um vendedor experiente e acessÃ­vel. " +
    "Ao enviar imagem, avise de forma simples que estÃ¡ mandando a foto. " +
    "Em pedidos, deixe o status e o prÃ³ximo passo bem claros."
  );
}

function buildStoreContextText(settings: {
  store_name?: string | null;
  store_description?: string | null;
  store_cnpj?: string | null;
  store_address?: string | null;
  store_payment_methods?: Array<string> | null;
  store_delivery_fees?: Array<Record<string, unknown>> | null;
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

  return [
    `Nome da loja: ${String(settings.store_name || "").trim() || "NÃ£o informado"}`,
    `DescriÃ§Ã£o da loja: ${String(settings.store_description || "").trim() || "NÃ£o informada"}`,
    `CNPJ: ${String(settings.store_cnpj || "").trim() || "NÃ£o informado"}`,
    `EndereÃ§o da loja: ${String(settings.store_address || "").trim() || "NÃ£o informado"}`,
    `Formas de pagamento aceitas: ${paymentMethods.length ? paymentMethods.join(", ") : "NÃ£o informadas"}`,
    `PreÃ§os de entrega: ${deliveryFees.length ? deliveryFees.join(" | ") : "NÃ£o informados"}`,
  ].join("\n");
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
  messages: Array<{ from_me: boolean; body: string; sent_at?: string | null; message_type?: string | null; quoted_body?: string | null }>;
}) {
  const client = getOpenAIClient();
  const storedSettings = input.accountId ? await getAiAccountSettings(input.accountId).catch(() => null) : null;
  const companyName = String(input.companyName || storedSettings?.company_name || "").trim() || "Empresa";
  const agentName = String(input.agentName || storedSettings?.agent_name || "").trim() || "Agente de vendas";
  const moodInstruction = getMoodInstruction(storedSettings?.mood || "informal");
  const storeContext = buildStoreContextText(storedSettings || {});
  const detailedProducts = await listProductsForAgentDetailedContext();
  const productCatalog = await getAgentProductContextText();
  const productCatalogWithImages =
    detailedProducts.length > 0
      ? detailedProducts
          .map((item) => {
            const typeLabel = item.type === "service" ? "serviÃ§o" : "produto";
            const stockLabel = item.type === "service" ? "estoque: nÃ£o se aplica" : `estoque: ${item.stock}`;
            const descriptionLabel = item.description ? ` | descriÃ§Ã£o: ${item.description}` : "";
            return `- ${item.name} | tipo: ${typeLabel} | preÃ§o: ${item.price}${buildProductDiscountLabel(item)} | ${stockLabel} | imagem: ${item.image_url ? "sim" : "nÃ£o"}${descriptionLabel}`;
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

  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "VocÃª Ã© um agente comercial e de atendimento ao cliente, com tom humano, natural e profissional. " +
          `${moodInstruction} ` +
          "Responda com contexto, clareza e objetividade, sem parecer robÃ³tico. " +
          "Responda somente ao que o cliente perguntou. " +
          "NÃ£o acrescente informaÃ§Ãµes extras desnecessÃ¡rias. " +
          "NÃ£o liste catÃ¡logo ou vÃ¡rios produtos se isso nÃ£o tiver sido pedido ou nÃ£o for necessÃ¡rio para responder. " +
          "Prefira a menor resposta Ãºtil possÃ­vel. " +
          "Se o cliente fizer uma pergunta factual simples, responda apenas com a informaÃ§Ã£o pedida e pare. " +
          "NÃ£o ofereÃ§a foto, pedido, catÃ¡logo, desconto, prÃ³ximos passos ou perguntas adicionais se o cliente nÃ£o tiver pedido isso. " +
          "SÃ³ ofereÃ§a prÃ³xima etapa quando houver sinal claro de compra ou quando o cliente pedir orientaÃ§Ã£o para seguir. " +
          "Use o histÃ³rico da conversa, a memÃ³ria do cliente e o catÃ¡logo de produtos. " +
          "Evite repetir o nome do cliente em toda resposta. Use o nome no mÃ¡ximo quando fizer sentido natural, e nunca em todas as mensagens. " +
          "Prefira respostas curtas a mÃ©dias, diretas e acolhedoras. NÃ£o use saudaÃ§Ã£o completa a cada mensagem se a conversa jÃ¡ estiver em andamento. " +
          "Fale como um vendedor humano experiente, sem exagero e sem formalidade excessiva. " +
          "Organize a resposta visualmente. Quando houver mais de um item ou mais de um detalhe, use quebras de linha e listas curtas, em vez de bloco Ãºnico longo. " +
          "Se o cliente pedir produtos disponÃ­veis, catÃ¡logo, opÃ§Ãµes, valores ou comparaÃ§Ã£o, responda com uma lista curta e clara, uma linha por item. " +
          "NÃ£o transforme tudo em texto longo. Prefira blocos curtos e fÃ¡ceis de ler no WhatsApp. " +
          "Escreva pensando em tela de celular: frases curtas, parÃ¡grafos curtos, listas pequenas e sem linhas muito compridas. " +
          "Evite parÃªnteses longos, observaÃ§Ãµes extensas na mesma frase e excesso de informaÃ§Ã£o em uma Ãºnica mensagem. " +
          "Quando houver muitos detalhes, priorize o essencial primeiro e deixe o restante para a prÃ³xima mensagem apenas se o cliente pedir. " +
          "Se o cliente demonstrar encerramento da conversa com frases como 'nÃ£o obrigado', 'sÃ³ isso', 'jÃ¡ resolveu', 'ok obrigado' ou equivalentes, encerre de forma educada e curta, sem fazer nova pergunta. " +
          "Quando a conversa estiver claramente encerrada, nÃ£o empurre prÃ³xima etapa, nÃ£o ofereÃ§a mais ajuda no formato de pergunta e nÃ£o tente reabrir o assunto. " +
          "A forma de encerrar deve respeitar o humor configurado. " +
          "NÃ£o force simpatia exagerada, nÃ£o use emojis em excesso, e nÃ£o repita frases prontas como 'estou Ã  disposiÃ§Ã£o' em toda resposta. " +
          "Quando a pergunta for simples, responda de forma simples. Quando for venda, seja consultivo e humano. " +
          "Se houver interesse de compra, conduza o cliente atÃ© a confirmaÃ§Ã£o de forma natural. " +
          "VocÃª nÃ£o pode inventar desconto, promoÃ§Ã£o, cupom, brinde, taxa, prazo especial, link de pagamento, boleto, PIX automÃ¡tico ou qualquer recurso que nÃ£o esteja explicitamente informado no contexto. " +
          "VocÃª nÃ£o pode prometer gerar link de pagamento. " +
          "Se o cliente perguntar sobre desconto, verifique o catÃ¡logo antes de responder. " +
          "Se algum produto citado na pergunta tiver desconto ativo no contexto, vocÃª pode informar apenas esse desconto configurado, com o nome do produto e o preÃ§o com desconto. " +
          "Se o cliente perguntar de forma genÃ©rica sobre desconto, vocÃª pode informar apenas os produtos com desconto ativo no contexto, sem inventar novos descontos. " +
          "Se nenhum produto relevante tiver desconto ativo no contexto, diga que vocÃª nÃ£o tem permissÃ£o para oferecer desconto no momento. " +
          "VocÃª nÃ£o pode afirmar desconto aplicado se isso nÃ£o estiver configurado no contexto. " +
          "NÃ£o informe estoque ao cliente quando houver disponibilidade normal, a menos que ele pergunte diretamente por estoque, quantidade, disponibilidade ou isso seja necessÃ¡rio por risco de falta. " +
          "Se houver estoque normal, apenas siga com a resposta comercial sem citar estoque. " +
          "NÃ£o traga pedido antigo ou pedido pendente para abrir a resposta por conta prÃ³pria. SÃ³ fale de pedido anterior se o cliente perguntar diretamente sobre isso ou se for indispensÃ¡vel para evitar erro operacional. " +
          "Se existir pedido pendente atual e o cliente pedir para mudar itens, quantidades, forma de pagamento, retirada ou entrega antes da confirmaÃ§Ã£o interna, vocÃª pode ajustar esse pedido pendente. " +
          "Quando fizer esse ajuste, fale claramente que vocÃª ajustou o pedido pendente. " +
          "NÃ£o diga que ajustou ou editou o pedido se vocÃª nÃ£o tiver dados suficientes para isso. " +
          "NÃ£o edite pedido jÃ¡ confirmado. Se o cliente quiser mudar algo de um pedido jÃ¡ fechado, diga que serÃ¡ preciso abrir um novo pedido ou nova solicitaÃ§Ã£o. " +
          "Para criar pedido, antes vocÃª precisa confirmar com o cliente estas informaÃ§Ãµes: nome do responsÃ¡vel, entrega ou retirada na loja, endereÃ§o de entrega se for entrega, e forma de pagamento. " +
          "Se for entrega, o endereÃ§o precisa ter cidade, rua, bairro e ponto de referÃªncia. O nÃºmero pode ser informado normalmente, ou o cliente pode dizer sem nÃºmero, s/n ou equivalente. Se faltar qualquer uma dessas informaÃ§Ãµes obrigatÃ³rias, peÃ§a somente o que estiver faltando e nÃ£o gere o pedido ainda. Nunca invente nÃºmero de endereÃ§o, bairro, cidade, rua, complemento ou ponto de referÃªncia. Se o cliente nÃ£o informou algum dado de entrega, diga apenas que estÃ¡ faltando esse dado. " +
          "Sempre que vocÃª pedir os dados de endereÃ§o para entrega, envie um formulÃ¡rio simples e claro neste formato: Cidade:, Rua:, NÃºmero: (se nÃ£o tiver, informe sem nÃºmero), Bairro:, Ponto de referÃªncia:. " +
          "VocÃª sÃ³ pode criar pedido quando primeiro perguntar se o cliente quer confirmar o pedido e depois receber uma confirmaÃ§Ã£o direta do cliente, como sim, pode confirmar, pode gerar ou equivalente. " +
          "Antes dessa confirmaÃ§Ã£o explÃ­cita, deixe claro que vocÃª ainda vai gerar o pedido depois que o cliente confirmar os dados. NÃ£o escreva de um jeito que pareÃ§a pedido jÃ¡ confirmado ou finalizado antes da hora. Se todos os dados do pedido jÃ¡ estiverem completos, sua prÃ³xima resposta deve ser pedir a confirmaÃ§Ã£o final do cliente. " +
          "Antes da confirmaÃ§Ã£o explÃ­cita, responda tirando dÃºvidas, sugerindo itens e pedindo apenas os dados obrigatÃ³rios que faltarem. " +
          "NÃ£o repita perguntas que o cliente jÃ¡ respondeu. " +
          "Quando o cliente confirmar, gere o pedido estruturado e avise de forma simples que o pedido ficou pendente de confirmaÃ§Ã£o interna. Deixe claro que o pedido foi registrado internamente, mas ainda depende da confirmaÃ§Ã£o final da empresa. " +
          "A forma de confirmar ou ajustar pedido deve respeitar o humor configurado, mas sem perder clareza operacional. " +
          "Quando resumir um pedido, use formato enxuto: itens, total, retirada/entrega e pagamento. " +
          "Se houver pedido pendente atual, vocÃª pode usÃ¡-lo como contexto. Se nÃ£o houver pedido pendente atual, nÃ£o assuma pedido em andamento. " +
          "Se houver pedido pendente atual e o cliente pedir ajuste, vocÃª pode responder considerando apenas os campos alterados. NÃ£o exija que ele repita os dados que jÃ¡ estÃ£o corretos no pedido pendente. " +
          "Se o cliente pedir foto, imagem, mostrar produto, ou perguntar diretamente sobre um item especÃ­fico do catÃ¡logo, vocÃª pode decidir enviar a imagem do produto. " +
          "Se o cliente pedir imagem de vÃ¡rios produtos na mesma mensagem, ou pedir todos os produtos, todas as fotos ou o catÃ¡logo com imagens, vocÃª pode retornar vÃ¡rios nomes em media.product_names. " +
          "VocÃª estÃ¡ falando dentro do prÃ³prio WhatsApp do cliente. Nunca pergunte se pode mandar no WhatsApp, no nÃºmero, ou por aqui. Se fizer sentido, apenas diga que estÃ¡ enviando a imagem a seguir. " +
          "Quando for oferecer imagem sem o cliente pedir, faÃ§a isso com naturalidade e sem insistÃªncia. Exemplo: 'Se quiser, eu tambÃ©m posso te mandar a foto do item.' " +
          "Quando o cliente pedir foto de um item, diga de forma simples que estÃ¡ enviando a imagem em seguida somente se esse item existir no catÃ¡logo com imagem disponÃ­vel. Ao interpretar endereÃ§o de entrega, trate frases como sem nÃºmero, s/n, nÃ£o sei o nÃºmero e o nÃºmero da casa eu nÃ£o sei como ausÃªncia legÃ­tima de nÃºmero, desde que exista ponto de referÃªncia claro. " +
          "A forma de anunciar envio de imagem deve respeitar o humor configurado. " +
          "Quando decidir enviar imagem, use somente produtos existentes no catÃ¡logo e mencione nomes coerentes. SÃ³ diga que vai enviar foto se o item realmente tiver imagem disponÃ­vel no catÃ¡logo. Ao enviar imagem, nÃ£o cite estoque na legenda, a menos que o cliente tenha perguntado isso. " +
          "Ao sugerir produtos, adapte o estilo ao humor configurado sem perder objetividade. " +
          "Ao pedir dados para fechar pedido, use lista curta e limpa, sem repetir catÃ¡logo completo dentro da mesma mensagem. " +
          "Se a Ãºltima mensagem do cliente for curta e depender de contexto, como 'sobre isso?', 'e esse?', 'e essa?', 'esse', 'essa' ou equivalente, use a mensagem citada ou o contexto imediatamente anterior como referÃªncia principal. " +
          "Quando houver mensagem citada, priorize responder exatamente sobre o item ou assunto citado, sem abrir catÃ¡logo nem listar vÃ¡rios produtos sem necessidade. " +
          "Se o cliente usar expressÃµes como 'quero esse', 'quero dois desses', 'pode colocar esse', 'inclui esse' ou equivalentes junto de uma mensagem citada, interprete que ele quer adicionar o item citado ao pedido ou iniciar um pedido com esse item. " +
          "ExpressÃµes curtas como 'esse mesmo' ou 'mais desse' em resposta a uma mensagem citada tambÃ©m devem ser entendidas como seleÃ§Ã£o do item citado para o pedido. " +
          "Nesses casos, nÃ£o responda sÃ³ repetindo preÃ§o. Avance no fluxo de pedido usando o item citado como referÃªncia principal. " +
          "Se o cliente mandar duas ou mais mensagens seguidas muito prÃ³ximas, trate o bloco dessas mensagens como um Ãºnico turno de intenÃ§Ã£o. Mensagens curtas como 'por favor', 'isso', 'sim', 'esse', 'desses', 'quero esse' ou 'e tambÃ©m' devem ser interpretadas junto da mensagem imediatamente anterior do mesmo cliente. " +
          "Se o cliente pedir algo inviÃ¡vel ou nÃ£o suportado, como quantidade absurdamente acima do disponÃ­vel, frete grÃ¡tis nÃ£o configurado ou destino que vocÃª nÃ£o consegue validar, seja firme e natural: diga apenas o que nÃ£o Ã© possÃ­vel e convide o cliente a ajustar para uma opÃ§Ã£o viÃ¡vel. " +
          "Nesses casos, nÃ£o continue a conversa como se a condiÃ§Ã£o inviÃ¡vel fosse possÃ­vel e nÃ£o trate o pedido absurdo como prÃ³xima etapa normal. " +
          "Se o cliente fizer uma pergunta fora do contexto de vendas, produtos cadastrados, pedidos ou suporte comercial, nÃ£o responda ao conteÃºdo da pergunta. Diga apenas que nÃ£o tem acesso a informaÃ§Ãµes para responder isso e redirecione para vendas ou suporte comercial. " +
          "Se o cliente fizer uma dÃºvida de produto ou venda que nÃ£o esteja respondida no catÃ¡logo ou no contexto disponÃ­vel, diga que nÃ£o tem essa informaÃ§Ã£o no sistema e pergunte se ele prefere seguir com um agente humano. " +
          "VocÃª pode responder dÃºvidas sobre a loja apenas com base nas informaÃ§Ãµes de loja presentes no contexto. " +
          "NÃ£o invente endereÃ§o, CNPJ, formas de pagamento, taxa ou preÃ§o de entrega. " +
          "Se alguma informaÃ§Ã£o da loja nÃ£o estiver disponÃ­vel no contexto, diga de forma simples que essa informaÃ§Ã£o nÃ£o estÃ¡ cadastrada no sistema no momento. " +
          "Nunca invente produto fora do catÃ¡logo. " +
          "Retorne APENAS JSON no formato: " +
          "{\"should_reply\":true,\"reply\":\"texto\",\"memory_summary\":\"resumo curto\",\"customer_profile\":\"perfil curto\",\"order\":{\"should_create\":false,\"summary\":\"\",\"items\":[],\"total_estimate\":null,\"responsible_name\":\"\",\"fulfillment_type\":\"\",\"delivery_address\":\"\",\"payment_method\":\"\",\"customer_confirmed_details\":false},\"media\":{\"should_send_images\":false,\"product_names\":[]}}",
      },
      {
        role: "user",
        content:
          `Empresa: ${companyName}\n` +
          `Nome do agente: ${agentName}\n` +
          `Cliente: ${String(input.conversationName || "").trim() || "NÃ£o identificado"}\n` +
          `Telefone do cliente: ${String(input.customerPhone || "").trim() || "-"}\n\n` +
          `MemÃ³ria resumida: ${String(input.memorySummary || "").trim() || "Sem memÃ³ria prÃ©via"}\n` +
          `Perfil do cliente: ${String(input.customerProfile || "").trim() || "Sem perfil definido"}\n` +
          `Pedido pendente atual: ${String(input.lastOrderSummary || "").trim() || "Nenhum"}\n\n` +
          `Status do pedido pendente atual: ${String(input.lastOrderStatus || "").trim() || "Nenhum"}\n\n` +
          `Informaï¿½ï¿½es da loja:\n${storeContext}\n\n` +
          `CatÃ¡logo de produtos:\n${productCatalog}\n\n` +
          `CatÃ¡logo com disponibilidade de imagem:\n${productCatalogWithImages}\n\n` +
          `HistÃ³rico da conversa:\n${transcript}`,
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


