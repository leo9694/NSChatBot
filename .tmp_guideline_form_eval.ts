import { generateAiSalesReply } from './src/services/openai.service';

async function main() {
  const accountId = '744679a1-4bbb-4063-8d5e-f6d399e6f9c9';
  const input = {
    accountId,
    companyName: 'Flores e Cultura',
    agentName: 'Atendimento',
    conversationName: 'Leo Gabriel',
    customerPhone: '5566999999999',
    messages: [
      { from_me: false, body: 'Quero uma cesta de chocolate e a cafe da manha, vao ser entregues para duas pessoas diferentes' },
      { from_me: true, body: 'Perfeito! Para confirmar o pedido, preciso de algumas informações rápidas: 1) Cesta de Chocolate — Para quem será? (nome e endereço) ...' },
      { from_me: false, body: 'A cesta vai ser para maria' },
    ],
  };
  const result = await generateAiSalesReply(input as any);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e)=>{console.error(e);process.exit(1);});
