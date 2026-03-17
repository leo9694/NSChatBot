require('ts-node/register/transpile-only');
const { pool } = require('./src/db/pool');
const { upsertWhatsAppAccount } = require('./src/repositories/accounts.repository');
const { saveInboundMessage } = require('./src/repositories/messages.repository');
const { setConversationAiAgentEnabled, upsertAiAccountSettings } = require('./src/repositories/ai.repository');
const aiAgent = require('./src/services/ai-agent.service');
const whatsappService = require('./src/services/whatsapp.service');

const originalSendText = whatsappService.sendWhatsAppText;
const originalSendMedia = whatsappService.sendWhatsAppMedia;
const createdConversationIds = [];
const createdAccountIds = [];
let fakeMsgCounter = 0;

function wait(ms){ return new Promise((resolve)=>setTimeout(resolve, ms)); }
function uniqueId(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

async function insertInbound({ accountJid, phone, body, metadata }) {
  await saveInboundMessage({
    accountJid,
    accountDisplayName:'Conta Teste',
    waJid:`${phone}@s.whatsapp.net`,
    body,
    messageType:'conversation',
    externalMessageId:uniqueId('msg'),
    payload:{},
    sentAt:new Date(),
    displayName:'Cliente Teste',
    metadata: metadata || {},
  });
}

async function fetchConversationIdByPhone(accountId, phone){
  const r = await pool.query('select id from conversations where account_id=$1 and phone=$2 order by created_at desc limit 1',[accountId,phone]);
  return r.rows[0]?.id || null;
}

async function fetchOutboundBodies(conversationId){
  const r = await pool.query('select body, metadata from messages where conversation_id=$1 and from_me=true order by created_at asc',[conversationId]);
  return r.rows;
}

async function setupConversation(accountJid, accountId, phone, firstMessage, metadata){
  await insertInbound({ accountJid, phone, body:firstMessage, metadata });
  const conversationId = await fetchConversationIdByPhone(accountId, phone);
  if (!conversationId) throw new Error(`conversation not found for ${phone}`);
  createdConversationIds.push(conversationId);
  await setConversationAiAgentEnabled(conversationId, true);
  return conversationId;
}

async function runScenario({ account, phone, messages }) {
  const [first, ...rest] = messages;
  const conversationId = await setupConversation(account.wa_jid, account.id, phone, first.body, first.metadata);
  const firstPromise = aiAgent.handleInboundAiAutomation(conversationId);
  for (const item of rest) {
    await wait(item.delayMs ?? 80);
    await insertInbound({ accountJid: account.wa_jid, phone, body:item.body, metadata:item.metadata });
    await aiAgent.handleInboundAiAutomation(conversationId);
  }
  await firstPromise;
  await wait(2600);
  const replies = await fetchOutboundBodies(conversationId);
  return replies.map((row) => row.body);
}

(async()=>{
  try {
    const account = await upsertWhatsAppAccount({ waJid:'556692339094@s.whatsapp.net', displayName:'Conta Teste Local' });
    createdAccountIds.push(account.id);
    await upsertAiAccountSettings({ accountId: account.id, agentName:'Ted', companyName:'Norte Sul Sementes', mood:'informal' });

    whatsappService.sendWhatsAppText = async () => { await wait(300); return { key:{ id:`fake_${++fakeMsgCounter}` } }; };
    whatsappService.sendWhatsAppMedia = async () => { await wait(120); return { key:{ id:`fake_media_${++fakeMsgCounter}` } }; };

    const scenarios = [
      { name:'01_preco_simples_abobora', messages:[{ body:'Qual o preço da abobora?' }] },
      { name:'02_preco_simples_agriao', messages:[{ body:'Quanto custa o agriao?' }] },
      { name:'03_duas_msgs_mesmo_contexto', messages:[{ body:'Qual o preço da abobora?' }, { body:'e do agriao tambem', delayMs:70 }] },
      { name:'04_tres_msgs_montando_pedido', messages:[{ body:'Quero a semente de abobora' }, { body:'duas unidades', delayMs:70 }, { body:'retirada e pix', delayMs:70 }] },
      { name:'05_quote_sobre_isso', messages:[{ body:'Sobre isso?', metadata:{ quoted_body:'A Semente de abobora custa R$ 4,10 por unidade.' } }] },
      { name:'06_quote_quero_dois_desses', messages:[{ body:'Quero dois desses', metadata:{ quoted_body:'Semente de abobora\nPreço: R$4.10' } }] },
      { name:'07_quote_esse_mesmo', messages:[{ body:'Esse mesmo', metadata:{ quoted_body:'Malathion ce 500' } }] },
      { name:'08_fotos_todos_por_favor', messages:[{ body:'Me mande fotos de todos eles' }, { body:'Por favor', delayMs:90 }] },
      { name:'09_foto_item_especifico', messages:[{ body:'Manda a foto da abobora' }] },
      { name:'10_desconto_sem_permissao', messages:[{ body:'Voce pode me dar um desconto?' }] },
      { name:'11_fora_escopo_terra', messages:[{ body:'Qual a circunferencia da terra?' }] },
      { name:'12_absurdo_mistico', messages:[{ body:'Se eu plantar a lua nasce abobora dourada?' }] },
      { name:'13_link_pagamento_inexistente', messages:[{ body:'Me manda link de pagamento do cartao' }] },
      { name:'14_emoji_giria_contexto_venda', messages:[{ body:'manda as fotinhas da abobora ai pfvr' }] },
      { name:'15_abreviacoes_multiplas', messages:[{ body:'qto a abobora' }, { body:'e o agriao', delayMs:60 }, { body:'pfv', delayMs:60 }] },
      { name:'16_quote_pedido_complemento', messages:[{ body:'Vou querer esse', metadata:{ quoted_body:'Semente Agriao' } }, { body:'3 unidades e retirada', delayMs:80 }] },
      { name:'17_encerramento_nao_reabrir', messages:[{ body:'Nao obrigado' }] },
      { name:'18_contexto_absurdo_mas_venda', messages:[{ body:'quero 999999 sacos de abobora pra hoje e frete gratis pro japao' }] },
      { name:'19_duas_msgs_curtas_genericas', messages:[{ body:'me ajuda' }, { body:'com a abobora', delayMs:70 }] },
      { name:'20_quote_duplo', messages:[{ body:'Sobre isso?', metadata:{ quoted_body:'Semente Agriao — R$ 4,90 por unidade.' } }, { body:'e essa tambem?', metadata:{ quoted_body:'Semente de abobora — R$ 4,10 por unidade.' }, delayMs:80 }] },
    ];

    const results = [];
    let idx = 0;
    for (const scenario of scenarios) {
      idx += 1;
      const phone = `55669991${String(idx).padStart(4,'0')}`;
      try {
        const replies = await runScenario({ account, phone, messages: scenario.messages });
        results.push({ name: scenario.name, ok: true, replies });
      } catch (error) {
        results.push({ name: scenario.name, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    whatsappService.sendWhatsAppText = originalSendText;
    whatsappService.sendWhatsAppMedia = originalSendMedia;
    try {
      if (createdConversationIds.length) {
        await pool.query('delete from messages where conversation_id = any($1::uuid[])', [createdConversationIds]);
        await pool.query('delete from ai_orders where conversation_id = any($1::uuid[])', [createdConversationIds]);
        await pool.query('delete from ai_conversation_memory where conversation_id = any($1::uuid[])', [createdConversationIds]);
        await pool.query('delete from conversations where id = any($1::uuid[])', [createdConversationIds]);
      }
      if (createdAccountIds.length) {
        await pool.query('delete from ai_account_settings where account_id = any($1::uuid[])', [createdAccountIds]);
      }
    } catch (cleanupError) {
      console.error('cleanup_failed', cleanupError);
    }
    await pool.end().catch(()=>undefined);
  }
})().catch((error)=>{ console.error(error); process.exit(1); });
