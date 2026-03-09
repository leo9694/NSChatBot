# NSChatBot API

Backend em TypeScript com integracao ao WhatsApp via Baileys e PostgreSQL.

## 1. Configurar ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Preencha as variaveis no `.env`:

- `DATABASE_URL`
- `WHATSAPP_SESSION_PATH` (opcional)
- `PORT` (opcional)

## 2. Instalar dependencias

```bash
npm install
```

## 3. Criar/atualizar estrutura do banco

```bash
npm run db:migrate
```

## 4. Rodar API em desenvolvimento

```bash
npm run dev
```

No primeiro start, o terminal exibe um QR Code. Escaneie com o WhatsApp do numero que vai enviar/receber mensagens.

## Endpoints principais

- `GET /health` (inclui status da conexao WhatsApp)
- `POST /messages/send`
- `GET /conversations?search=&limit=30&offset=0`
- `GET /conversations/:conversationId/messages?limit=50&before=2026-02-25T12:00:00Z`
- `PATCH /conversations/:conversationId/read`

## Painel web

- Abra `http://localhost:3000/app`
- Visual estilo WhatsApp Web para listar conversas, ler historico e enviar mensagens

### Exemplo envio

```bash
POST http://localhost:3000/messages/send
Content-Type: application/json

{
  "phone": "5511999998888",
  "message": "Ola, esta e uma mensagem de teste",
  "client_id": null,
  "campaign_id": null
}
```

Formato recomendado do telefone: somente numeros com DDI.

## Tabelas principais

- `conversations`: resumo por contato, ultima mensagem e nao lidas.
- `messages`: historico completo inbound/outbound com payload do provider.
- `clients`
- `campaigns`
- `agent_sessions`

Script SQL: `sql/init.sql`
