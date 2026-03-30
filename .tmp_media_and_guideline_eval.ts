import { __extractRequestedProductNamesForTests } from './src/services/ai-agent.service';
import { generateAiSalesReply } from './src/services/openai.service';

async function main() {
  const grouped = __extractRequestedProductNamesForTests({
    catalog: [
      { id: '1', name: 'Buque 3 Rosas, 2 Girassois e Flores Complementares', group_name: 'Buques', image_url: 'img1', price: '184.90', type: 'product', description: 'desc', stock: 1 },
      { id: '2', name: 'Buque com 1 Rosa e Gypsophila', group_name: 'Buques', image_url: 'img2', price: '95.00', type: 'product', description: 'desc', stock: 10 },
      { id: '3', name: 'Cesta de Chocolate', group_name: 'Cestas', image_url: 'img3', price: '120.00', type: 'product', description: 'desc', stock: 3 },
    ],
    productNames: [],
    lastCustomerMessage: 'Me manda fotos dos buques por favor',
  });

  const naturalFlow = await generateAiSalesReply({
    accountId: '744679a1-4bbb-4063-8d5e-f6d399e6f9c9',
    companyName: 'Flores e Cultura',
    agentName: 'Atendimento',
    conversationName: 'Leo Gabriel',
    customerPhone: '5566999999999',
    messages: [
      { from_me: false, body: 'Quero uma cesta de chocolate e a cafe da manha, vao ser entregues para duas pessoas diferentes' },
      { from_me: true, body: 'Perfeito! Para confirmar o pedido, preciso de algumas informações rápidas: 1) Cesta de Chocolate — Para quem será? (nome e endereço) ...' },
      { from_me: false, body: 'A cesta vai ser para maria' },
    ],
  });

  const imageFlow = await generateAiSalesReply({
    accountId: '744679a1-4bbb-4063-8d5e-f6d399e6f9c9',
    companyName: 'Flores e Cultura',
    agentName: 'Atendimento',
    conversationName: 'Leo Gabriel',
    customerPhone: '5566999999999',
    messages: [
      { from_me: false, body: 'Me manda foto da semente de abobora' },
    ],
  });

  console.log(JSON.stringify({
    groupedMatchNames: grouped.map((item) => item.name),
    naturalFlow: {
      reply: naturalFlow.reply,
      orderShouldCreate: naturalFlow.order.shouldCreate,
      handoff: naturalFlow.handoff,
    },
    imageFlow: {
      reply: imageFlow.reply,
      media: imageFlow.media,
      handoff: imageFlow.handoff,
    },
  }, null, 2));
}
main().catch((e)=>{console.error(e);process.exit(1);});
