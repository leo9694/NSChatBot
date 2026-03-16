import { pool } from "../db/pool";

export interface AiAccountSettingsRow {
  account_id: string;
  agent_name: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiConversationMemoryRow {
  conversation_id: string;
  memory_summary: string | null;
  customer_profile: string | null;
  last_order_summary: string | null;
  updated_at: string;
}

export interface AiOrderRow {
  id: string;
  account_id: string | null;
  conversation_id: string | null;
  customer_phone: string | null;
  summary: string | null;
  items: Array<Record<string, unknown>>;
  total_estimate: string | null;
  responsible_name: string | null;
  fulfillment_type: string | null;
  delivery_address: string | null;
  payment_method: string | null;
  status: string;
  customer_confirmed_at: string | null;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  ready_time_minutes: number | null;
  confirmation_note: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  conversation_name?: string | null;
  account_wa_jid?: string | null;
}

let ensureAiSchemaPromise: Promise<void> | null = null;

export async function ensureAiSchema(): Promise<void> {
  if (!ensureAiSchemaPromise) {
    ensureAiSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_account_settings (
          account_id UUID PRIMARY KEY REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
          agent_name VARCHAR(160),
          company_name VARCHAR(180),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_conversation_memory (
          conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
          memory_summary TEXT,
          customer_profile TEXT,
          last_order_summary TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
          conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
          customer_phone VARCHAR(40),
          summary TEXT,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          total_estimate NUMERIC(12, 2),
          status VARCHAR(30) NOT NULL DEFAULT 'draft',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS responsible_name TEXT
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(30)
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS delivery_address TEXT
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS payment_method TEXT
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS confirmed_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS cancel_reason TEXT
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS ready_time_minutes INTEGER
      `);
      await pool.query(`
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS confirmation_note TEXT
      `);

      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
      `);
    })().catch((error) => {
      ensureAiSchemaPromise = null;
      throw error;
    });
  }

  await ensureAiSchemaPromise;
}

export async function getAiAccountSettings(accountId: string): Promise<AiAccountSettingsRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiAccountSettingsRow>(
    `
    SELECT
      account_id,
      agent_name,
      company_name,
      created_at::text,
      updated_at::text
    FROM ai_account_settings
    WHERE account_id = $1
    LIMIT 1
    `,
    [accountId],
  );

  return result.rows[0] || null;
}

export async function upsertAiAccountSettings(input: {
  accountId: string;
  agentName?: string | null;
  companyName?: string | null;
}): Promise<AiAccountSettingsRow> {
  await ensureAiSchema();
  const result = await pool.query<AiAccountSettingsRow>(
    `
    INSERT INTO ai_account_settings (account_id, agent_name, company_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (account_id) DO UPDATE
      SET agent_name = EXCLUDED.agent_name,
          company_name = EXCLUDED.company_name,
          updated_at = NOW()
    RETURNING
      account_id,
      agent_name,
      company_name,
      created_at::text,
      updated_at::text
    `,
    [input.accountId, input.agentName || null, input.companyName || null],
  );

  return result.rows[0];
}

export async function setConversationAiAgentEnabled(conversationId: string, enabled: boolean): Promise<boolean> {
  await ensureAiSchema();
  const result = await pool.query(
    `
    UPDATE conversations
    SET
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ai_agent_enabled}', to_jsonb($2::boolean), true),
      updated_at = NOW()
    WHERE id = $1
    `,
    [conversationId, enabled],
  );

  return (result.rowCount || 0) > 0;
}

export async function getConversationAiContext(conversationId: string): Promise<any | null> {
  await ensureAiSchema();
  const result = await pool.query(
    `
    SELECT
      c.id,
      c.account_id,
      c.phone,
      c.wa_jid,
      c.display_name,
      c.service_status,
      c.assigned_user_id,
      COALESCE((c.metadata->>'ai_agent_enabled')::boolean, false) AS ai_agent_enabled,
      wa.wa_jid AS account_wa_jid,
      mem.memory_summary,
      mem.customer_profile,
      mem.last_order_summary,
      latest_open_order.id AS open_order_id,
      latest_open_order.status AS open_order_status,
      latest_open_order.summary AS open_order_summary,
      latest_open_order.items AS open_order_items,
      latest_open_order.total_estimate::text AS open_order_total_estimate,
      latest_open_order.responsible_name AS open_order_responsible_name,
      latest_open_order.fulfillment_type AS open_order_fulfillment_type,
      latest_open_order.delivery_address AS open_order_delivery_address,
      latest_open_order.payment_method AS open_order_payment_method
    FROM conversations c
    LEFT JOIN whatsapp_accounts wa ON wa.id = c.account_id
    LEFT JOIN ai_conversation_memory mem ON mem.conversation_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        ao.id,
        ao.status,
        ao.summary,
        ao.items,
        ao.total_estimate,
        ao.responsible_name,
        ao.fulfillment_type,
        ao.delivery_address,
        ao.payment_method
      FROM ai_orders ao
      WHERE ao.conversation_id = c.id
        AND ao.status = 'pending_confirmation'
      ORDER BY ao.created_at DESC
      LIMIT 1
    ) latest_open_order ON true
    WHERE c.id = $1
    LIMIT 1
    `,
    [conversationId],
  );

  return result.rows[0] || null;
}

export async function updatePendingAiOrder(input: {
  orderId: string;
  summary: string;
  items: Array<Record<string, unknown>>;
  totalEstimate?: number | null;
  responsibleName?: string | null;
  fulfillmentType?: string | null;
  deliveryAddress?: string | null;
  paymentMethod?: string | null;
}): Promise<AiOrderRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    UPDATE ai_orders
    SET
      summary = $2,
      items = $3::jsonb,
      total_estimate = $4,
      responsible_name = $5,
      fulfillment_type = $6,
      delivery_address = $7,
      payment_method = $8,
      customer_confirmed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
      AND status = 'pending_confirmation'
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      summary,
      items,
      total_estimate::text,
      responsible_name,
      fulfillment_type,
      delivery_address,
      payment_method,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      ready_time_minutes,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [
      input.orderId,
      input.summary,
      JSON.stringify(input.items || []),
      Number.isFinite(Number(input.totalEstimate)) ? Number(input.totalEstimate) : null,
      input.responsibleName || null,
      input.fulfillmentType || null,
      input.deliveryAddress || null,
      input.paymentMethod || null,
    ],
  );

  return result.rows[0] || null;
}

export async function listConversationMessagesForAi(conversationId: string, limit = 80): Promise<any[]> {
  await ensureAiSchema();
  const result = await pool.query(
    `
    SELECT
      id,
      from_me,
      body,
      message_type,
      sent_at,
      created_at,
      metadata
    FROM messages
    WHERE conversation_id = $1
      AND message_type <> 'protocolMessage'
    ORDER BY COALESCE(sent_at, created_at) DESC, created_at DESC
    LIMIT $2
    `,
    [conversationId, limit],
  );

  return result.rows.reverse();
}

export async function upsertConversationAiMemory(input: {
  conversationId: string;
  memorySummary?: string | null;
  customerProfile?: string | null;
  lastOrderSummary?: string | null;
}): Promise<void> {
  await ensureAiSchema();
  await pool.query(
    `
    INSERT INTO ai_conversation_memory (conversation_id, memory_summary, customer_profile, last_order_summary)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (conversation_id) DO UPDATE
      SET memory_summary = COALESCE($2, ai_conversation_memory.memory_summary),
          customer_profile = COALESCE($3, ai_conversation_memory.customer_profile),
          last_order_summary = COALESCE($4, ai_conversation_memory.last_order_summary),
          updated_at = NOW()
    `,
    [input.conversationId, input.memorySummary || null, input.customerProfile || null, input.lastOrderSummary || null],
  );
}

export async function createAiOrder(input: {
  accountId: string | null;
  conversationId: string;
  customerPhone: string | null;
  summary: string;
  items: Array<Record<string, unknown>>;
  totalEstimate?: number | null;
  responsibleName?: string | null;
  fulfillmentType?: string | null;
  deliveryAddress?: string | null;
  paymentMethod?: string | null;
}): Promise<AiOrderRow> {
  await ensureAiSchema();
  const existing = await pool.query<AiOrderRow>(
    `
    SELECT
      id,
      account_id,
      conversation_id,
      customer_phone,
      summary,
      items,
      total_estimate::text,
      responsible_name,
      fulfillment_type,
      delivery_address,
      payment_method,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      ready_time_minutes,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    FROM ai_orders
    WHERE conversation_id = $1
      AND status = 'pending_confirmation'
      AND summary = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [input.conversationId, input.summary],
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const result = await pool.query<AiOrderRow>(
    `
    INSERT INTO ai_orders (
      account_id,
      conversation_id,
      customer_phone,
      summary,
      items,
      total_estimate,
      responsible_name,
      fulfillment_type,
      delivery_address,
      payment_method,
      status,
      customer_confirmed_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'pending_confirmation', NOW())
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      summary,
      items,
      total_estimate::text,
      responsible_name,
      fulfillment_type,
      delivery_address,
      payment_method,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      ready_time_minutes,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [
      input.accountId,
      input.conversationId,
      input.customerPhone || null,
      input.summary,
      JSON.stringify(input.items || []),
      Number.isFinite(Number(input.totalEstimate)) ? Number(input.totalEstimate) : null,
      input.responsibleName || null,
      input.fulfillmentType || null,
      input.deliveryAddress || null,
      input.paymentMethod || null,
    ],
  );
  return result.rows[0];
}

export async function listAiOrders(accountId?: string | null): Promise<AiOrderRow[]> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    SELECT
      o.id,
      o.account_id,
      o.conversation_id,
      o.customer_phone,
      o.summary,
      o.items,
      o.total_estimate::text,
      o.responsible_name,
      o.fulfillment_type,
      o.delivery_address,
      o.payment_method,
      o.status,
      o.customer_confirmed_at::text,
      o.confirmed_at::text,
      o.confirmed_by_user_id,
      o.ready_time_minutes,
      o.confirmation_note,
      o.cancelled_at::text,
      o.cancelled_by_user_id,
      o.cancel_reason,
      o.created_at::text,
      o.updated_at::text,
      c.display_name AS conversation_name,
      wa.wa_jid AS account_wa_jid
    FROM ai_orders o
    LEFT JOIN conversations c ON c.id = o.conversation_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = o.account_id
    WHERE ($1::uuid IS NULL OR o.account_id = $1)
    ORDER BY o.created_at DESC
    `,
    [accountId || null],
  );

  return result.rows.map((row) => ({
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  }));
}

export async function getAiOrderById(orderId: string): Promise<AiOrderRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    SELECT
      o.id,
      o.account_id,
      o.conversation_id,
      o.customer_phone,
      o.summary,
      o.items,
      o.total_estimate::text,
      o.responsible_name,
      o.fulfillment_type,
      o.delivery_address,
      o.payment_method,
      o.status,
      o.customer_confirmed_at::text,
      o.confirmed_at::text,
      o.confirmed_by_user_id,
      o.ready_time_minutes,
      o.confirmation_note,
      o.cancelled_at::text,
      o.cancelled_by_user_id,
      o.cancel_reason,
      o.created_at::text,
      o.updated_at::text,
      c.display_name AS conversation_name,
      wa.wa_jid AS account_wa_jid
    FROM ai_orders o
    LEFT JOIN conversations c ON c.id = o.conversation_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = o.account_id
    WHERE o.id = $1
    LIMIT 1
    `,
    [orderId],
  );

  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function confirmAiOrder(
  orderId: string,
  confirmedByUserId: string,
  readyTimeMinutes: number,
  confirmationNote?: string | null,
): Promise<AiOrderRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    UPDATE ai_orders
    SET
      status = 'confirmed',
      confirmed_at = NOW(),
      confirmed_by_user_id = $2,
      ready_time_minutes = $3,
      confirmation_note = $4,
      updated_at = NOW()
    WHERE id = $1
      AND status <> 'confirmed'
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      summary,
      items,
      total_estimate::text,
      responsible_name,
      fulfillment_type,
      delivery_address,
      payment_method,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      ready_time_minutes,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [orderId, confirmedByUserId, readyTimeMinutes, confirmationNote || null],
  );

  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function cancelAiOrder(orderId: string, cancelledByUserId: string, reason: string): Promise<AiOrderRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    UPDATE ai_orders
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by_user_id = $2,
      cancel_reason = $3,
      updated_at = NOW()
    WHERE id = $1
      AND status <> 'cancelled'
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      summary,
      items,
      total_estimate::text,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [orderId, cancelledByUserId, reason],
  );

  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function deleteAiOrder(orderId: string): Promise<boolean> {
  await ensureAiSchema();
  const result = await pool.query(
    `
    DELETE FROM ai_orders
    WHERE id = $1
    `,
    [orderId],
  );
  return (result.rowCount || 0) > 0;
}
