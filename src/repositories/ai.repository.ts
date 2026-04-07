import { pool } from "../db/pool";

export interface AiAccountSettingsRow {
  account_id: string;
  company_id?: string | null;
  default_new_chats_ai_enabled?: boolean;
  agent_name: string | null;
  company_name: string | null;
  mood: string | null;
  agent_guidelines: Array<string>;
  store_name: string | null;
  store_description: string | null;
  store_cnpj: string | null;
  store_address: string | null;
  store_payment_methods: Array<string>;
  store_delivery_fees: Array<Record<string, unknown>>;
  schedule_working_days: Array<Record<string, unknown>>;
  schedule_interval_minutes: number | null;
  schedule_reminder_enabled: boolean;
  schedule_reminder_minutes: number | null;
  schedule_reminder_rules: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export interface AiConversationMemoryRow {
  conversation_id: string;
  memory_summary: string | null;
  customer_profile: string | null;
  last_order_summary: string | null;
  last_schedule_summary?: string | null;
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
  notes: string | null;
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

export interface AiScheduleRow {
  id: string;
  account_id: string | null;
  conversation_id: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  service_product_id: string | null;
  service_name: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number | null;
  notes: string | null;
  status: string;
  customer_confirmed_at: string | null;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  confirmation_note: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  reminder_sent_at?: string | null;
  reminder_sent_for_minutes?: number | null;
  created_at: string;
  updated_at: string;
  conversation_name?: string | null;
  account_wa_jid?: string | null;
  account_display_name?: string | null;
  account_phone?: string | null;
}

export interface AiScheduleConflictRow {
  id: string;
  account_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service_name: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number | null;
  status: string;
  account_wa_jid?: string | null;
  account_display_name?: string | null;
  account_phone?: string | null;
}

let ensureAiSchemaPromise: Promise<void> | null = null;

export async function ensureAiSchema(): Promise<void> {
  if (!ensureAiSchemaPromise) {
    ensureAiSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_account_settings (
          account_id UUID PRIMARY KEY REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
          default_new_chats_ai_enabled BOOLEAN NOT NULL DEFAULT false,
          agent_name VARCHAR(160),
          company_name VARCHAR(180),
          mood VARCHAR(20),
          store_name VARCHAR(180),
          store_description TEXT,
          store_cnpj VARCHAR(40),
          store_address TEXT,
          store_payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
          store_delivery_fees JSONB NOT NULL DEFAULT '[]'::jsonb,
          schedule_working_days JSONB NOT NULL DEFAULT '[]'::jsonb,
          schedule_interval_minutes INTEGER,
          schedule_reminder_enabled BOOLEAN NOT NULL DEFAULT false,
          schedule_reminder_minutes INTEGER,
          schedule_reminder_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS default_new_chats_ai_enabled BOOLEAN NOT NULL DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS mood VARCHAR(20)
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS agent_guidelines JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS store_name VARCHAR(180)
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS store_description TEXT
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS store_cnpj VARCHAR(40)
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS store_address TEXT
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS store_payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS store_delivery_fees JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS schedule_working_days JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS schedule_interval_minutes INTEGER
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS schedule_reminder_enabled BOOLEAN NOT NULL DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS schedule_reminder_minutes INTEGER
      `);
      await pool.query(`
        ALTER TABLE ai_account_settings
        ADD COLUMN IF NOT EXISTS schedule_reminder_rules JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_account_settings_company_id ON ai_account_settings(company_id)
      `);
      await pool.query(`
        UPDATE ai_account_settings cfg
        SET company_id = wa.company_id
        FROM whatsapp_accounts wa
        WHERE wa.id = cfg.account_id
          AND cfg.company_id IS NULL
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_conversation_memory (
          conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
          memory_summary TEXT,
          customer_profile TEXT,
          last_order_summary TEXT,
          last_schedule_summary TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE ai_conversation_memory
        ADD COLUMN IF NOT EXISTS last_schedule_summary TEXT
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
        ALTER TABLE ai_orders
        ADD COLUMN IF NOT EXISTS notes TEXT
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_service_schedules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
          conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
          customer_phone VARCHAR(40),
          customer_name TEXT,
          service_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
          service_name TEXT,
          scheduled_date DATE NOT NULL,
          scheduled_time VARCHAR(5) NOT NULL,
          duration_minutes INTEGER,
          notes TEXT,
          status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation',
          customer_confirmed_at TIMESTAMPTZ,
          confirmed_at TIMESTAMPTZ,
          confirmed_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
          confirmation_note TEXT,
          cancelled_at TIMESTAMPTZ,
          cancelled_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
          cancel_reason TEXT,
          reminder_sent_at TIMESTAMPTZ,
          reminder_sent_for_minutes INTEGER,
          reminder_sent_minutes_list JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        ALTER TABLE ai_service_schedules
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ
      `);
      await pool.query(`
        ALTER TABLE ai_service_schedules
        ADD COLUMN IF NOT EXISTS reminder_sent_for_minutes INTEGER
      `);
      await pool.query(`
        ALTER TABLE ai_service_schedules
        ADD COLUMN IF NOT EXISTS reminder_sent_minutes_list JSONB NOT NULL DEFAULT '[]'::jsonb
      `);

      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_service_schedules_account_id ON ai_service_schedules(account_id);
        CREATE INDEX IF NOT EXISTS idx_ai_service_schedules_conversation_id ON ai_service_schedules(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_ai_service_schedules_date_status ON ai_service_schedules(scheduled_date, status);
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
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return null;
  const result = await pool.query<AiAccountSettingsRow>(
    `
    SELECT
      cfg.account_id,
      COALESCE(cfg.company_id, target.company_id) AS company_id,
      COALESCE(cfg.default_new_chats_ai_enabled, false) AS default_new_chats_ai_enabled,
      cfg.agent_name,
      COALESCE(NULLIF(cfg.company_name, ''), company.name) AS company_name,
      cfg.mood,
      COALESCE(cfg.agent_guidelines, '[]'::jsonb) AS agent_guidelines,
      COALESCE(NULLIF(cfg.store_name, ''), company.name) AS store_name,
      cfg.store_description,
      COALESCE(NULLIF(cfg.store_cnpj, ''), company.cnpj) AS store_cnpj,
      cfg.store_address,
      COALESCE(cfg.store_payment_methods, '[]'::jsonb) AS store_payment_methods,
      COALESCE(cfg.store_delivery_fees, '[]'::jsonb) AS store_delivery_fees,
      COALESCE(cfg.schedule_working_days, '[]'::jsonb) AS schedule_working_days,
      cfg.schedule_interval_minutes,
      COALESCE(cfg.schedule_reminder_enabled, false) AS schedule_reminder_enabled,
      cfg.schedule_reminder_minutes,
      COALESCE(cfg.schedule_reminder_rules, '[]'::jsonb) AS schedule_reminder_rules,
      cfg.created_at::text,
      cfg.updated_at::text
    FROM whatsapp_accounts target
    LEFT JOIN app_companies company
      ON company.id = target.company_id
    JOIN whatsapp_accounts owner
      ON owner.company_id = target.company_id
    JOIN ai_account_settings cfg
      ON cfg.account_id = owner.id
    WHERE target.id = $1
    ORDER BY CASE WHEN cfg.account_id = target.id THEN 0 ELSE 1 END, cfg.updated_at DESC
    LIMIT 1
    `,
    [normalizedAccountId],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  const directFallback = await pool.query<AiAccountSettingsRow>(
    `
    SELECT
      cfg.account_id,
      COALESCE(cfg.company_id, wa.company_id) AS company_id,
      COALESCE(cfg.default_new_chats_ai_enabled, false) AS default_new_chats_ai_enabled,
      cfg.agent_name,
      COALESCE(NULLIF(cfg.company_name, ''), company.name) AS company_name,
      cfg.mood,
      COALESCE(cfg.agent_guidelines, '[]'::jsonb) AS agent_guidelines,
      COALESCE(NULLIF(cfg.store_name, ''), company.name) AS store_name,
      cfg.store_description,
      COALESCE(NULLIF(cfg.store_cnpj, ''), company.cnpj) AS store_cnpj,
      cfg.store_address,
      COALESCE(cfg.store_payment_methods, '[]'::jsonb) AS store_payment_methods,
      COALESCE(cfg.store_delivery_fees, '[]'::jsonb) AS store_delivery_fees,
      COALESCE(cfg.schedule_working_days, '[]'::jsonb) AS schedule_working_days,
      cfg.schedule_interval_minutes,
      COALESCE(cfg.schedule_reminder_enabled, false) AS schedule_reminder_enabled,
      cfg.schedule_reminder_minutes,
      COALESCE(cfg.schedule_reminder_rules, '[]'::jsonb) AS schedule_reminder_rules,
      cfg.created_at::text,
      cfg.updated_at::text
    FROM ai_account_settings cfg
    LEFT JOIN whatsapp_accounts wa ON wa.id = cfg.account_id
    LEFT JOIN app_companies company ON company.id = wa.company_id
    WHERE cfg.account_id = $1
    LIMIT 1
    `,
    [normalizedAccountId],
  );

  return directFallback.rows[0] || null;
}

function parseScheduleTimeToMinutes(timeText: string | null | undefined): number | null {
  const raw = String(timeText || "").trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    return null;
  }
  const [hours, minutes] = raw.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentCuiabaDateIso(baseDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);
  const year = parts.find((item) => item.type === "year")?.value || "1970";
  const month = parts.find((item) => item.type === "month")?.value || "01";
  const day = parts.find((item) => item.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function getCurrentCuiabaTimeMinutes(baseDate = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Cuiaba",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(baseDate);
  const hour = Number(parts.find((item) => item.type === "hour")?.value || "0");
  const minute = Number(parts.find((item) => item.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

function validateScheduleAgainstAccountSettings(input: {
  settings: AiAccountSettingsRow | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
  now?: Date;
}) {
  const workingDays = Array.isArray(input.settings?.schedule_working_days) ? input.settings.schedule_working_days : [];
  const enabledDays = workingDays
    .map((item: any) => ({
      dayOfWeek: Number(item?.day_of_week),
      enabled: Boolean(item?.enabled),
      morningEnabled: Boolean(item?.morning_enabled),
      morningStart: String(item?.morning_start || "").trim(),
      morningEnd: String(item?.morning_end || "").trim(),
      afternoonEnabled: Boolean(item?.afternoon_enabled),
      afternoonStart: String(item?.afternoon_start || "").trim(),
      afternoonEnd: String(item?.afternoon_end || "").trim(),
      nightEnabled: Boolean(item?.night_enabled),
      nightStart: String(item?.night_start || "").trim(),
      nightEnd: String(item?.night_end || "").trim(),
      startTime: String(item?.start_time || "").trim(),
      endTime: String(item?.end_time || "").trim(),
    }))
    .filter((item) => Number.isInteger(item.dayOfWeek) && item.dayOfWeek >= 0 && item.dayOfWeek <= 6 && item.enabled);

  if (!enabledDays.length) {
    return { ok: true as const };
  }

  const date = new Date(`${String(input.scheduledDate || "").trim()}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false as const, reason: "invalid_date" };
  }

  const targetDay = enabledDays.find((item) => item.dayOfWeek === date.getUTCDay());
  if (!targetDay) {
    return { ok: false as const, reason: "day_unavailable" };
  }

  const appointmentStart = parseScheduleTimeToMinutes(input.scheduledTime);
  const durationMinutes = Number.isFinite(Number(input.durationMinutes)) ? Math.max(1, Math.round(Number(input.durationMinutes))) : 60;
  if (appointmentStart === null) {
    return { ok: false as const, reason: "invalid_time" };
  }

  const todayIso = getCurrentCuiabaDateIso(input.now || new Date());
  const currentMinutes = getCurrentCuiabaTimeMinutes(input.now || new Date());
  const minimumLeadMinutes = 15;
  if (String(input.scheduledDate || "").trim() < todayIso) {
    return { ok: false as const, reason: "time_already_passed" };
  }
  if (String(input.scheduledDate || "").trim() === todayIso && appointmentStart < currentMinutes + minimumLeadMinutes) {
    return { ok: false as const, reason: "time_already_passed" };
  }

  const appointmentEnd = appointmentStart + durationMinutes;

  const periods = [
    targetDay.morningEnabled && targetDay.morningStart && targetDay.morningEnd
      ? { startTime: targetDay.morningStart, endTime: targetDay.morningEnd }
      : null,
    targetDay.afternoonEnabled && targetDay.afternoonStart && targetDay.afternoonEnd
      ? { startTime: targetDay.afternoonStart, endTime: targetDay.afternoonEnd }
      : null,
    targetDay.nightEnabled && targetDay.nightStart && targetDay.nightEnd
      ? { startTime: targetDay.nightStart, endTime: targetDay.nightEnd }
      : null,
  ].filter(Boolean) as Array<{ startTime: string; endTime: string }>;

  if (!periods.length && targetDay.startTime && targetDay.endTime) {
    periods.push({ startTime: targetDay.startTime, endTime: targetDay.endTime });
  }

  if (!periods.length) {
    return { ok: false as const, reason: "day_without_periods" };
  }

  const fitsPeriod = periods.some((period) => {
    const start = parseScheduleTimeToMinutes(period.startTime);
    const end = parseScheduleTimeToMinutes(period.endTime);
    return start !== null && end !== null && appointmentStart >= start && appointmentEnd <= end;
  });

  if (!fitsPeriod) {
    return { ok: false as const, reason: "outside_working_hours" };
  }

  return { ok: true as const };
}

export function __validateScheduleAgainstAccountSettingsForTests(input: {
  settings: AiAccountSettingsRow | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
  now?: Date;
}) {
  return validateScheduleAgainstAccountSettings(input);
}

async function ensureScheduleWithinAccountHours(input: {
  accountId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
}): Promise<void> {
  const accountId = String(input.accountId || "").trim() || null;
  if (!accountId) return;
  const settings = await getAiAccountSettings(accountId);
  const validation = validateScheduleAgainstAccountSettings({
    settings,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes: input.durationMinutes,
  });
  if (!validation.ok) {
    const errorCode =
      validation.reason === "time_already_passed" ? "AI_SCHEDULE_TOO_SOON_OR_PAST" : "AI_SCHEDULE_OUTSIDE_WORKING_HOURS";
    const error: any = new Error(errorCode);
    error.code = errorCode;
    error.reason = validation.reason;
    throw error;
  }
}

export async function validateAiScheduleSlot(input: {
  accountId: string | null;
  scheduleId?: string | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
}): Promise<{ ok: true } | { ok: false; code: string; reason?: string; conflict?: AiScheduleConflictRow | null }> {
  try {
    await ensureScheduleWithinAccountHours({
      accountId: input.accountId,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      durationMinutes: input.durationMinutes,
    });
  } catch (error: any) {
    return {
      ok: false,
      code: error?.code || "AI_SCHEDULE_OUTSIDE_WORKING_HOURS",
      reason: error?.reason || null,
    };
  }

  const conflict = await findAiScheduleConflict({
    accountId: input.accountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes: input.durationMinutes,
    excludeScheduleId: String(input.scheduleId || "").trim() || null,
  });
  if (conflict) {
    return {
      ok: false,
      code: "AI_SCHEDULE_CONFLICT",
      conflict,
    };
  }

  return { ok: true };
}

export async function upsertAiAccountSettings(input: {
  accountId: string;
  defaultNewChatsAiEnabled?: boolean;
  agentName?: string | null;
  companyName?: string | null;
  mood?: string | null;
  agentGuidelines?: Array<string>;
  storeName?: string | null;
  storeDescription?: string | null;
  storeCnpj?: string | null;
  storeAddress?: string | null;
  storePaymentMethods?: Array<string>;
  storeDeliveryFees?: Array<Record<string, unknown>>;
  scheduleWorkingDays?: Array<Record<string, unknown>>;
  scheduleIntervalMinutes?: number | null;
  scheduleReminderEnabled?: boolean;
  scheduleReminderMinutes?: number | null;
  scheduleReminderRules?: Array<Record<string, unknown>>;
}): Promise<AiAccountSettingsRow> {
  await ensureAiSchema();
  const normalizedAccountId = String(input.accountId || "").trim();
  const accountResult = await pool.query<{ id: string; company_id: string | null; company_name: string | null; company_cnpj: string | null }>(
    `
    SELECT wa.id, wa.company_id, c.name AS company_name, c.cnpj AS company_cnpj
    FROM whatsapp_accounts wa
    LEFT JOIN app_companies c ON c.id = wa.company_id
    WHERE wa.id = $1
    LIMIT 1
    `,
    [normalizedAccountId],
  );
  const account = accountResult.rows[0];
  if (!account) {
    throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
  }

  const companyId = String(account.company_id || "").trim() || null;
  const companyAccountsResult = companyId
    ? await pool.query<{ id: string }>(
        `
        SELECT id
        FROM whatsapp_accounts
        WHERE company_id = $1
        `,
        [companyId],
      )
    : { rows: [{ id: normalizedAccountId }] };

  const targetAccountIds = Array.from(
    new Set(
      companyAccountsResult.rows
        .map((row) => String(row.id || "").trim())
        .filter(Boolean)
        .concat(normalizedAccountId),
    ),
  );

  const sharedValues = [
    Boolean(input.defaultNewChatsAiEnabled),
    input.agentName || null,
    input.companyName || account.company_name || null,
    input.mood || null,
    JSON.stringify(Array.isArray(input.agentGuidelines) ? input.agentGuidelines : []),
    input.storeName || account.company_name || null,
    input.storeDescription || null,
    input.storeCnpj || account.company_cnpj || null,
    input.storeAddress || null,
    JSON.stringify(Array.isArray(input.storePaymentMethods) ? input.storePaymentMethods : []),
    JSON.stringify(Array.isArray(input.storeDeliveryFees) ? input.storeDeliveryFees : []),
    JSON.stringify(Array.isArray(input.scheduleWorkingDays) ? input.scheduleWorkingDays : []),
    Number.isFinite(Number(input.scheduleIntervalMinutes)) ? Math.max(0, Math.round(Number(input.scheduleIntervalMinutes))) : null,
    Boolean(input.scheduleReminderEnabled),
    Boolean(input.scheduleReminderEnabled) && Number.isFinite(Number(input.scheduleReminderMinutes))
      ? Math.max(1, Math.round(Number(input.scheduleReminderMinutes)))
      : null,
    JSON.stringify(Array.isArray(input.scheduleReminderRules) ? input.scheduleReminderRules : []),
    companyId,
  ];

  for (const targetAccountId of targetAccountIds) {
    await pool.query(
      `
      INSERT INTO ai_account_settings (
        account_id,
        company_id,
        default_new_chats_ai_enabled,
        agent_name,
        company_name,
        mood,
        agent_guidelines,
        store_name,
        store_description,
        store_cnpj,
        store_address,
        store_payment_methods,
        store_delivery_fees,
        schedule_working_days,
        schedule_interval_minutes,
        schedule_reminder_enabled,
        schedule_reminder_minutes,
        schedule_reminder_rules
      )
      VALUES ($1, $18::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17::jsonb)
      ON CONFLICT (account_id) DO UPDATE
        SET company_id = EXCLUDED.company_id,
            default_new_chats_ai_enabled = EXCLUDED.default_new_chats_ai_enabled,
            agent_name = EXCLUDED.agent_name,
            company_name = EXCLUDED.company_name,
            mood = EXCLUDED.mood,
            agent_guidelines = EXCLUDED.agent_guidelines,
            store_name = EXCLUDED.store_name,
            store_description = EXCLUDED.store_description,
            store_cnpj = EXCLUDED.store_cnpj,
            store_address = EXCLUDED.store_address,
            store_payment_methods = EXCLUDED.store_payment_methods,
            store_delivery_fees = EXCLUDED.store_delivery_fees,
            schedule_working_days = EXCLUDED.schedule_working_days,
            schedule_interval_minutes = EXCLUDED.schedule_interval_minutes,
            schedule_reminder_enabled = EXCLUDED.schedule_reminder_enabled,
            schedule_reminder_minutes = EXCLUDED.schedule_reminder_minutes,
            schedule_reminder_rules = EXCLUDED.schedule_reminder_rules,
            updated_at = NOW()
      `,
      [targetAccountId, ...sharedValues],
    );
  }

  const settings = await getAiAccountSettings(normalizedAccountId);
  if (!settings) {
    throw new Error("AI_ACCOUNT_SETTINGS_NOT_FOUND");
  }

  return settings;
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
      COALESCE((c.metadata->>'bulk_initiated')::boolean, false) AS bulk_initiated,
      COALESCE((c.metadata->>'bulk_replied')::boolean, false) AS bulk_replied,
      NULLIF(c.metadata->>'bulk_started_at', '') AS bulk_started_at,
      NULLIF(c.metadata->>'bulk_replied_at', '') AS bulk_replied_at,
      NULLIF(c.metadata->>'bulk_campaign_context', '') AS bulk_campaign_context,
      wa.wa_jid AS account_wa_jid,
      mem.memory_summary,
      mem.customer_profile,
      mem.last_order_summary,
      mem.last_schedule_summary,
      latest_open_order.id AS open_order_id,
      latest_open_order.status AS open_order_status,
      latest_open_order.summary AS open_order_summary,
      latest_open_order.items AS open_order_items,
      latest_open_order.total_estimate::text AS open_order_total_estimate,
      latest_open_order.responsible_name AS open_order_responsible_name,
      latest_open_order.fulfillment_type AS open_order_fulfillment_type,
      latest_open_order.delivery_address AS open_order_delivery_address,
      latest_open_order.payment_method AS open_order_payment_method,
      latest_open_order.notes AS open_order_notes,
      NULLIF(c.metadata->>'ai_order_draft_summary', '') AS order_draft_summary,
      COALESCE(c.metadata->'ai_order_draft_items', '[]'::jsonb) AS order_draft_items,
      NULLIF(c.metadata->>'ai_order_draft_total_estimate', '') AS order_draft_total_estimate,
      NULLIF(c.metadata->>'ai_order_draft_responsible_name', '') AS order_draft_responsible_name,
      NULLIF(c.metadata->>'ai_order_draft_fulfillment_type', '') AS order_draft_fulfillment_type,
      NULLIF(c.metadata->>'ai_order_draft_delivery_address', '') AS order_draft_delivery_address,
      NULLIF(c.metadata->>'ai_order_draft_payment_method', '') AS order_draft_payment_method,
      NULLIF(c.metadata->>'ai_order_draft_notes', '') AS order_draft_notes,
      latest_open_schedule.id AS open_schedule_id,
      latest_open_schedule.status AS open_schedule_status,
      latest_open_schedule.service_product_id AS open_schedule_service_product_id,
      latest_open_schedule.service_name AS open_schedule_service_name,
      latest_open_schedule.scheduled_date::text AS open_schedule_date,
      latest_open_schedule.scheduled_time AS open_schedule_time,
      latest_open_schedule.duration_minutes AS open_schedule_duration_minutes,
      latest_open_schedule.customer_name AS open_schedule_customer_name,
      latest_open_schedule.notes AS open_schedule_notes,
      COALESCE((c.metadata->>'ai_reschedule_active')::boolean, false) AS reschedule_active,
      NULLIF(c.metadata->>'ai_reschedule_target_schedule_id', '') AS reschedule_target_schedule_id,
      NULLIF(c.metadata->>'ai_reschedule_reason', '') AS reschedule_reason,
      NULLIF(c.metadata->>'ai_reschedule_suggested_date', '') AS reschedule_suggested_date,
      NULLIF(c.metadata->>'ai_reschedule_suggested_time', '') AS reschedule_suggested_time,
      NULLIF(c.metadata->>'ai_reschedule_initiated_by', '') AS reschedule_initiated_by,
      latest_confirmed_schedule.id AS confirmed_schedule_id,
      latest_confirmed_schedule.status AS confirmed_schedule_status,
      latest_confirmed_schedule.service_product_id AS confirmed_schedule_service_product_id,
      latest_confirmed_schedule.service_name AS confirmed_schedule_service_name,
      latest_confirmed_schedule.scheduled_date::text AS confirmed_schedule_date,
      latest_confirmed_schedule.scheduled_time AS confirmed_schedule_time,
      latest_confirmed_schedule.duration_minutes AS confirmed_schedule_duration_minutes,
      latest_confirmed_schedule.customer_name AS confirmed_schedule_customer_name,
      latest_confirmed_schedule.notes AS confirmed_schedule_notes
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
        ao.payment_method,
        ao.notes
      FROM ai_orders ao
      WHERE ao.conversation_id = c.id
        AND ao.status = 'pending_confirmation'
      ORDER BY ao.created_at DESC
      LIMIT 1
    ) latest_open_order ON true
    LEFT JOIN LATERAL (
      SELECT
        s.id,
        s.status,
        s.service_product_id,
        s.service_name,
        s.scheduled_date,
        s.scheduled_time,
        s.duration_minutes,
        s.customer_name,
        s.notes
      FROM ai_service_schedules s
      WHERE s.conversation_id = c.id
        AND s.status = 'pending_confirmation'
      ORDER BY s.created_at DESC
      LIMIT 1
    ) latest_open_schedule ON true
    LEFT JOIN LATERAL (
      SELECT
        s.id,
        s.status,
        s.service_product_id,
        s.service_name,
        s.scheduled_date,
        s.scheduled_time,
        s.duration_minutes,
        s.customer_name,
        s.notes
      FROM ai_service_schedules s
      WHERE s.conversation_id = c.id
        AND s.status = 'confirmed'
      ORDER BY
        CASE
          WHEN s.id::text = COALESCE(c.metadata->>'ai_reschedule_target_schedule_id', '') THEN 0
          ELSE 1
        END,
        s.confirmed_at DESC NULLS LAST,
        s.created_at DESC
      LIMIT 1
    ) latest_confirmed_schedule ON true
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
  notes?: string | null;
}): Promise<AiOrderRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    UPDATE ai_orders
    SET
      account_id = COALESCE(ai_orders.account_id, c.account_id),
      summary = $2,
      items = $3::jsonb,
      total_estimate = $4,
      responsible_name = $5,
      fulfillment_type = $6,
      delivery_address = $7,
      payment_method = $8,
      notes = $9,
      customer_confirmed_at = NOW(),
      updated_at = NOW()
    FROM conversations c
    WHERE ai_orders.id = $1
      AND c.id = ai_orders.conversation_id
      AND ai_orders.status = 'pending_confirmation'
    RETURNING
      ai_orders.id,
      ai_orders.account_id,
      ai_orders.conversation_id,
      ai_orders.customer_phone,
      ai_orders.summary,
      ai_orders.items,
      ai_orders.total_estimate::text,
      ai_orders.responsible_name,
      ai_orders.fulfillment_type,
      ai_orders.delivery_address,
      ai_orders.payment_method,
      ai_orders.notes,
      ai_orders.status,
      ai_orders.customer_confirmed_at::text,
      ai_orders.confirmed_at::text,
      ai_orders.confirmed_by_user_id,
      ai_orders.ready_time_minutes,
      ai_orders.confirmation_note,
      ai_orders.cancelled_at::text,
      ai_orders.cancelled_by_user_id,
      ai_orders.cancel_reason,
      ai_orders.created_at::text,
      ai_orders.updated_at::text
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
      input.notes || null,
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
  lastScheduleSummary?: string | null;
}): Promise<void> {
  await ensureAiSchema();
  await pool.query(
    `
    INSERT INTO ai_conversation_memory (conversation_id, memory_summary, customer_profile, last_order_summary, last_schedule_summary)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (conversation_id) DO UPDATE
      SET memory_summary = COALESCE($2, ai_conversation_memory.memory_summary),
          customer_profile = COALESCE($3, ai_conversation_memory.customer_profile),
          last_order_summary = COALESCE($4, ai_conversation_memory.last_order_summary),
          last_schedule_summary = COALESCE($5, ai_conversation_memory.last_schedule_summary),
          updated_at = NOW()
    `,
    [
      input.conversationId,
      input.memorySummary || null,
      input.customerProfile || null,
      input.lastOrderSummary || null,
      input.lastScheduleSummary || null,
    ],
  );
}

export async function updatePendingAiSchedule(input: {
  scheduleId: string;
  accountId?: string | null;
  customerName?: string | null;
  serviceProductId?: string | null;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
  bufferMinutes?: number | null;
  notes?: string | null;
}): Promise<AiScheduleRow | null> {
  await ensureAiSchema();
  const existingScheduleRow = await pool.query<{ account_id: string | null; conversation_id: string | null }>(
    `
    SELECT account_id, conversation_id
    FROM ai_service_schedules
    WHERE id = $1
    LIMIT 1
    `,
    [input.scheduleId],
  );
  const existingSchedule = existingScheduleRow.rows[0] || null;
  const conversationAccountRow =
    existingSchedule?.conversation_id
      ? await pool.query<{ account_id: string | null }>(
          `
          SELECT account_id
          FROM conversations
          WHERE id = $1
          LIMIT 1
          `,
          [existingSchedule.conversation_id],
        )
      : { rows: [] as Array<{ account_id: string | null }> };
  const resolvedAccountId =
    String(input.accountId || "").trim() ||
    String(existingSchedule?.account_id || "").trim() ||
    String(conversationAccountRow.rows[0]?.account_id || "").trim() ||
    null;

  await ensureScheduleWithinAccountHours({
    accountId: resolvedAccountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes: input.durationMinutes,
  });

  const conflict = await findAiScheduleConflict({
    accountId: resolvedAccountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes: input.durationMinutes,
    bufferMinutes: input.bufferMinutes,
    excludeScheduleId: input.scheduleId,
  });
  if (conflict) {
    const error: any = new Error("AI_SCHEDULE_CONFLICT");
    error.code = "AI_SCHEDULE_CONFLICT";
    error.conflict = conflict;
    throw error;
  }

  const result = await pool.query<AiScheduleRow>(
    `
    UPDATE ai_service_schedules
    SET
      account_id = COALESCE($2, account_id),
      customer_name = $3,
      service_product_id = $4,
      service_name = $5,
      scheduled_date = $6::date,
      scheduled_time = $7,
      duration_minutes = $8,
      notes = $9,
      customer_confirmed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
      AND status = 'pending_confirmation'
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      customer_name,
      service_product_id,
      service_name,
      scheduled_date::text,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [
      input.scheduleId,
      resolvedAccountId,
      input.customerName || null,
      input.serviceProductId || null,
      input.serviceName,
      input.scheduledDate,
      input.scheduledTime,
      Number.isFinite(Number(input.durationMinutes)) ? Math.round(Number(input.durationMinutes)) : null,
      input.notes || null,
    ],
  );

  return result.rows[0] || null;
}

export async function rescheduleAiSchedule(input: {
  scheduleId: string;
  accountId?: string | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
  revertConfirmedToPending?: boolean;
}): Promise<AiScheduleRow | null> {
  await ensureAiSchema();
  const existing = await getAiScheduleById(input.scheduleId);
  if (!existing || existing.status === "cancelled") {
    return null;
  }

  const resolvedAccountId =
    String(input.accountId || "").trim() ||
    String(existing.account_id || "").trim() ||
    String(
      (
        existing.conversation_id
          ? await pool.query<{ account_id: string | null }>(
              `
              SELECT account_id
              FROM conversations
              WHERE id = $1
              LIMIT 1
              `,
              [existing.conversation_id],
            )
          : { rows: [] as Array<{ account_id: string | null }> }
      ).rows[0]?.account_id || "",
    ).trim() ||
    null;

  await ensureScheduleWithinAccountHours({
    accountId: resolvedAccountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes:
      Number.isFinite(Number(input.durationMinutes)) ? Math.round(Number(input.durationMinutes)) : existing.duration_minutes,
  });

  const conflict = await findAiScheduleConflict({
    accountId: resolvedAccountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes:
      Number.isFinite(Number(input.durationMinutes)) ? Math.round(Number(input.durationMinutes)) : existing.duration_minutes,
    excludeScheduleId: input.scheduleId,
  });
  if (conflict) {
    const error: any = new Error("AI_SCHEDULE_CONFLICT");
    error.code = "AI_SCHEDULE_CONFLICT";
    error.conflict = conflict;
    throw error;
  }

  const result = await pool.query<AiScheduleRow>(
    `
    UPDATE ai_service_schedules
    SET
      account_id = COALESCE($2, account_id),
      scheduled_date = $3::date,
      scheduled_time = $4,
      duration_minutes = $5,
      status = CASE
        WHEN $6::boolean = true AND status = 'confirmed' THEN 'pending_confirmation'
        ELSE status
      END,
      customer_confirmed_at = CASE
        WHEN $6::boolean = true AND status = 'confirmed' THEN NOW()
        ELSE customer_confirmed_at
      END,
      confirmed_at = CASE
        WHEN $6::boolean = true AND status = 'confirmed' THEN NULL
        ELSE confirmed_at
      END,
      confirmed_by_user_id = CASE
        WHEN $6::boolean = true AND status = 'confirmed' THEN NULL
        ELSE confirmed_by_user_id
      END,
      confirmation_note = CASE
        WHEN $6::boolean = true AND status = 'confirmed' THEN NULL
        ELSE confirmation_note
      END,
      reminder_sent_at = NULL,
      reminder_sent_for_minutes = NULL,
      reminder_sent_minutes_list = '[]'::jsonb,
      updated_at = NOW()
    WHERE id = $1
      AND status IN ('pending_confirmation', 'confirmed')
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      customer_name,
      service_product_id,
      service_name,
      scheduled_date::text,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      reminder_sent_at::text,
      reminder_sent_for_minutes,
      created_at::text,
      updated_at::text
    `,
    [
      input.scheduleId,
      resolvedAccountId,
      input.scheduledDate,
      input.scheduledTime,
      Number.isFinite(Number(input.durationMinutes))
        ? Math.round(Number(input.durationMinutes))
        : existing.duration_minutes,
      Boolean(input.revertConfirmedToPending),
    ],
  );

  return result.rows[0] || null;
}

export async function createAiSchedule(input: {
  accountId: string | null;
  conversationId: string;
  customerPhone: string | null;
  customerName?: string | null;
  serviceProductId?: string | null;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
  bufferMinutes?: number | null;
  notes?: string | null;
}): Promise<AiScheduleRow> {
  await ensureAiSchema();
  const conversationAccountRow = await pool.query<{ account_id: string | null }>(
    `
    SELECT account_id
    FROM conversations
    WHERE id = $1
    LIMIT 1
    `,
    [input.conversationId],
  );
  const resolvedAccountId =
    String(input.accountId || "").trim() ||
    String(conversationAccountRow.rows[0]?.account_id || "").trim() ||
    null;
  await ensureScheduleWithinAccountHours({
    accountId: resolvedAccountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes: input.durationMinutes,
  });
  const conflict = await findAiScheduleConflict({
    accountId: resolvedAccountId,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    durationMinutes: input.durationMinutes,
    bufferMinutes: input.bufferMinutes,
  });
  if (conflict) {
    const error: any = new Error("AI_SCHEDULE_CONFLICT");
    error.code = "AI_SCHEDULE_CONFLICT";
    error.conflict = conflict;
    throw error;
  }

  const existing = await pool.query<AiScheduleRow>(
    `
    SELECT
      id,
      account_id,
      conversation_id,
      customer_phone,
      customer_name,
      service_product_id,
      service_name,
      scheduled_date::text,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    FROM ai_service_schedules
    WHERE conversation_id = $1
      AND status = 'pending_confirmation'
      AND service_name = $2
      AND scheduled_date = $3::date
      AND scheduled_time = $4
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [input.conversationId, input.serviceName, input.scheduledDate, input.scheduledTime],
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const result = await pool.query<AiScheduleRow>(
    `
    INSERT INTO ai_service_schedules (
      account_id,
      conversation_id,
      customer_phone,
      customer_name,
      service_product_id,
      service_name,
      scheduled_date,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, 'pending_confirmation', NOW())
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      customer_name,
      service_product_id,
      service_name,
      scheduled_date::text,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [
      resolvedAccountId,
      input.conversationId,
      input.customerPhone || null,
      input.customerName || null,
      input.serviceProductId || null,
      input.serviceName,
      input.scheduledDate,
      input.scheduledTime,
      Number.isFinite(Number(input.durationMinutes)) ? Math.round(Number(input.durationMinutes)) : null,
      input.notes || null,
    ],
  );
  return result.rows[0];
}

export async function listAiSchedules(
  month: string,
  accountId?: string | null,
  companyId?: string | null,
): Promise<AiScheduleRow[]> {
  await ensureAiSchema();
  const result = await pool.query<AiScheduleRow>(
    `
    SELECT
      s.id,
      COALESCE(s.account_id, c.account_id) AS account_id,
      s.conversation_id,
      s.customer_phone,
      s.customer_name,
      s.service_product_id,
      s.service_name,
      s.scheduled_date::text,
      s.scheduled_time,
      s.duration_minutes,
      s.notes,
      s.status,
      s.customer_confirmed_at::text,
      s.confirmed_at::text,
      s.confirmed_by_user_id,
      s.confirmation_note,
      s.cancelled_at::text,
      s.cancelled_by_user_id,
      s.cancel_reason,
      s.created_at::text,
      s.updated_at::text,
      c.display_name AS conversation_name,
      wa.wa_jid AS account_wa_jid,
      wa.display_name AS account_display_name,
      wa.phone AS account_phone
    FROM ai_service_schedules s
    LEFT JOIN conversations c ON c.id = s.conversation_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = COALESCE(s.account_id, c.account_id)
    WHERE ($1::uuid IS NULL OR COALESCE(s.account_id, c.account_id) = $1)
      AND ($2::uuid IS NULL OR wa.company_id = $2)
      AND s.scheduled_date >= to_date($3 || '-01', 'YYYY-MM-DD')
      AND s.scheduled_date < (to_date($3 || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')
    ORDER BY s.scheduled_date ASC, s.scheduled_time ASC, s.created_at ASC
    `,
    [accountId || null, companyId || null, month],
  );

  return result.rows;
}

export async function getAiScheduleById(scheduleId: string): Promise<AiScheduleRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiScheduleRow>(
    `
    SELECT
      s.id,
      COALESCE(s.account_id, c.account_id) AS account_id,
      s.conversation_id,
      s.customer_phone,
      s.customer_name,
      s.service_product_id,
      s.service_name,
      s.scheduled_date::text,
      s.scheduled_time,
      s.duration_minutes,
      s.notes,
      s.status,
      s.customer_confirmed_at::text,
      s.confirmed_at::text,
      s.confirmed_by_user_id,
      s.confirmation_note,
      s.cancelled_at::text,
      s.cancelled_by_user_id,
      s.cancel_reason,
      s.created_at::text,
      s.updated_at::text,
      c.display_name AS conversation_name,
      wa.wa_jid AS account_wa_jid,
      wa.display_name AS account_display_name,
      wa.phone AS account_phone
    FROM ai_service_schedules s
    LEFT JOIN conversations c ON c.id = s.conversation_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = COALESCE(s.account_id, c.account_id)
    WHERE s.id = $1
    LIMIT 1
    `,
    [scheduleId],
  );

  return result.rows[0] || null;
}

export async function confirmAiSchedule(
  scheduleId: string,
  confirmedByUserId: string,
  confirmationNote?: string | null,
): Promise<AiScheduleRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiScheduleRow>(
    `
    UPDATE ai_service_schedules
    SET
      status = 'confirmed',
      confirmed_at = NOW(),
      confirmed_by_user_id = $2,
      confirmation_note = $3,
      updated_at = NOW()
    WHERE id = $1
      AND status <> 'confirmed'
    RETURNING
      id,
      account_id,
      conversation_id,
      customer_phone,
      customer_name,
      service_product_id,
      service_name,
      scheduled_date::text,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [scheduleId, confirmedByUserId, confirmationNote || null],
  );
  return result.rows[0] || null;
}

export async function cancelAiSchedule(
  scheduleId: string,
  cancelledByUserId: string | null,
  reason: string,
): Promise<AiScheduleRow | null> {
  await ensureAiSchema();
  const result = await pool.query<AiScheduleRow>(
    `
    UPDATE ai_service_schedules
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
      customer_name,
      service_product_id,
      service_name,
      scheduled_date::text,
      scheduled_time,
      duration_minutes,
      notes,
      status,
      customer_confirmed_at::text,
      confirmed_at::text,
      confirmed_by_user_id,
      confirmation_note,
      cancelled_at::text,
      cancelled_by_user_id,
      cancel_reason,
      created_at::text,
      updated_at::text
    `,
    [scheduleId, cancelledByUserId, reason],
  );
  return result.rows[0] || null;
}

export async function deleteAiSchedule(scheduleId: string): Promise<boolean> {
  await ensureAiSchema();
  const result = await pool.query(
    `
    DELETE FROM ai_service_schedules
    WHERE id = $1
    `,
    [scheduleId],
  );
  return (result.rowCount || 0) > 0;
}

export async function findAiScheduleConflict(input: {
  accountId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number | null;
  bufferMinutes?: number | null;
  excludeScheduleId?: string | null;
}): Promise<AiScheduleConflictRow | null> {
  await ensureAiSchema();
  const accountId = String(input.accountId || "").trim() || null;
  if (!accountId) {
    return null;
  }

  const result = await pool.query<AiScheduleConflictRow>(
    `
    SELECT
      s.id,
      s.account_id,
      s.customer_name,
      s.customer_phone,
      s.service_name,
      s.scheduled_date::text,
      s.scheduled_time,
      s.duration_minutes,
      s.status,
      wa.wa_jid AS account_wa_jid,
      wa.display_name AS account_display_name,
      wa.phone AS account_phone
    FROM ai_service_schedules s
    LEFT JOIN whatsapp_accounts wa ON wa.id = s.account_id
    WHERE s.account_id = $1
      AND s.status IN ('pending_confirmation', 'confirmed')
      AND ($2::uuid IS NULL OR s.id <> $2)
      AND s.scheduled_date = $3::date
      AND (
        (EXTRACT(HOUR FROM s.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM s.scheduled_time::time))
          < (
            (EXTRACT(HOUR FROM $4::time) * 60 + EXTRACT(MINUTE FROM $4::time))
            + GREATEST(COALESCE($5::integer, 0), 1)
            + GREATEST(COALESCE($6::integer, 0), 0)
          )
      )
      AND (
        (
          EXTRACT(HOUR FROM $4::time) * 60 + EXTRACT(MINUTE FROM $4::time)
        ) < (
          (EXTRACT(HOUR FROM s.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM s.scheduled_time::time))
          + GREATEST(COALESCE(s.duration_minutes, 0), 1)
          + GREATEST(COALESCE($6::integer, 0), 0)
        )
      )
    ORDER BY s.scheduled_time ASC, s.created_at ASC
    LIMIT 1
    `,
    [
      accountId,
      String(input.excludeScheduleId || "").trim() || null,
      input.scheduledDate,
      input.scheduledTime,
      Number.isFinite(Number(input.durationMinutes)) ? Math.max(1, Math.round(Number(input.durationMinutes))) : 60,
      Number.isFinite(Number(input.bufferMinutes)) ? Math.max(0, Math.round(Number(input.bufferMinutes))) : 0,
    ],
  );

  return result.rows[0] || null;
}

export async function listAiSchedulesForDate(
  accountId: string | null,
  scheduledDate: string,
  excludeScheduleId?: string | null,
): Promise<AiScheduleRow[]> {
  await ensureAiSchema();
  const normalizedAccountId = String(accountId || "").trim() || null;
  const normalizedDate = String(scheduledDate || "").trim();
  if (!normalizedAccountId || !normalizedDate) {
    return [];
  }

  const result = await pool.query<AiScheduleRow>(
    `
    SELECT
      s.id,
      s.account_id,
      s.conversation_id,
      s.customer_phone,
      s.customer_name,
      s.service_product_id,
      s.service_name,
      s.scheduled_date::text,
      s.scheduled_time,
      s.duration_minutes,
      s.notes,
      s.status,
      s.customer_confirmed_at::text,
      s.confirmed_at::text,
      s.confirmed_by_user_id,
      s.confirmation_note,
      s.cancelled_at::text,
      s.cancelled_by_user_id,
      s.cancel_reason,
      s.created_at::text,
      s.updated_at::text
    FROM ai_service_schedules s
    WHERE s.account_id = $1
      AND s.scheduled_date = $2::date
      AND s.status IN ('pending_confirmation', 'confirmed')
      AND ($3::uuid IS NULL OR s.id <> $3)
    ORDER BY s.scheduled_time ASC, s.created_at ASC
    `,
    [normalizedAccountId, normalizedDate, String(excludeScheduleId || "").trim() || null],
  );

  return result.rows;
}

export async function listActiveAiSchedulesForConversation(
  conversationId: string,
  options?: {
    limit?: number;
    includePast?: boolean;
  },
): Promise<AiScheduleRow[]> {
  await ensureAiSchema();
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return [];
  }

  const includePast = options?.includePast === true;
  const limit = Number.isFinite(Number(options?.limit)) ? Math.max(1, Math.min(20, Math.round(Number(options?.limit)))) : 10;
  const result = await pool.query<AiScheduleRow>(
    `
    SELECT
      s.id,
      s.account_id,
      s.conversation_id,
      s.customer_phone,
      s.customer_name,
      s.service_product_id,
      s.service_name,
      s.scheduled_date::text,
      s.scheduled_time,
      s.duration_minutes,
      s.notes,
      s.status,
      s.customer_confirmed_at::text,
      s.confirmed_at::text,
      s.confirmed_by_user_id,
      s.confirmation_note,
      s.cancelled_at::text,
      s.cancelled_by_user_id,
      s.cancel_reason,
      s.reminder_sent_at::text,
      s.reminder_sent_for_minutes,
      s.created_at::text,
      s.updated_at::text,
      c.display_name AS conversation_name,
      wa.wa_jid AS account_wa_jid,
      wa.display_name AS account_display_name,
      wa.phone AS account_phone
    FROM ai_service_schedules s
    LEFT JOIN conversations c ON c.id = s.conversation_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = s.account_id
    WHERE s.conversation_id = $1
      AND s.status IN ('pending_confirmation', 'confirmed')
      AND (
        $2::boolean = true
        OR (
          s.scheduled_date > CURRENT_DATE
          OR (
            s.scheduled_date = CURRENT_DATE
            AND s.scheduled_time::time >= CURRENT_TIME
          )
        )
      )
    ORDER BY s.scheduled_date ASC, s.scheduled_time ASC, s.created_at ASC
    LIMIT $3
    `,
    [normalizedConversationId, includePast, limit],
  );

  return result.rows;
}

export async function listAiSchedulesDueForReminder(): Promise<
  Array<
    AiScheduleRow & {
      schedule_reminder_minutes: number;
    }
  >
> {
  await ensureAiSchema();
  const result = await pool.query<
    AiScheduleRow & {
      schedule_reminder_minutes: number;
    }
  >(
    `
    SELECT
      s.id,
      s.account_id,
      s.conversation_id,
      s.customer_phone,
      s.customer_name,
      s.service_product_id,
      s.service_name,
      s.scheduled_date::text,
      s.scheduled_time,
      s.duration_minutes,
      s.notes,
      s.status,
      s.customer_confirmed_at::text,
      s.confirmed_at::text,
      s.confirmed_by_user_id,
      s.confirmation_note,
      s.cancelled_at::text,
      s.cancelled_by_user_id,
      s.cancel_reason,
      s.reminder_sent_at::text,
      s.reminder_sent_for_minutes,
      s.created_at::text,
      s.updated_at::text,
      c.display_name AS conversation_name,
      wa.wa_jid AS account_wa_jid,
      wa.display_name AS account_display_name,
      wa.phone AS account_phone,
      reminder_rules.schedule_reminder_minutes
    FROM ai_service_schedules s
    JOIN ai_account_settings cfg ON cfg.account_id = s.account_id
    JOIN LATERAL (
      SELECT DISTINCT
        GREATEST(
          1,
          ROUND(
            CASE
              WHEN rr.unit = 'days' THEN rr.value * 1440
              WHEN rr.unit = 'hours' THEN rr.value * 60
              ELSE rr.value
            END
          )
        )::integer AS schedule_reminder_minutes
      FROM jsonb_to_recordset(
        CASE
          WHEN jsonb_typeof(cfg.schedule_reminder_rules) = 'array' AND jsonb_array_length(cfg.schedule_reminder_rules) > 0
            THEN cfg.schedule_reminder_rules
          WHEN COALESCE(cfg.schedule_reminder_enabled, false) = true AND COALESCE(cfg.schedule_reminder_minutes, 0) > 0
            THEN jsonb_build_array(jsonb_build_object('value', cfg.schedule_reminder_minutes, 'unit', 'minutes'))
          ELSE '[]'::jsonb
        END
      ) AS rr(value numeric, unit text)
    ) reminder_rules ON TRUE
    LEFT JOIN conversations c ON c.id = s.conversation_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = s.account_id
    WHERE s.status = 'confirmed'
      AND COALESCE(cfg.schedule_reminder_enabled, false) = true
      AND reminder_rules.schedule_reminder_minutes > 0
      AND NOT (
        COALESCE(s.reminder_sent_minutes_list, '[]'::jsonb) @> to_jsonb(ARRAY[reminder_rules.schedule_reminder_minutes])
      )
      AND (
        ((s.scheduled_date::text || ' ' || s.scheduled_time || ':00')::timestamp)
        - make_interval(mins => reminder_rules.schedule_reminder_minutes)
      ) <= NOW()
      AND ((s.scheduled_date::text || ' ' || s.scheduled_time || ':00')::timestamp) > NOW()
    ORDER BY s.scheduled_date ASC, s.scheduled_time ASC
    `,
  );

  return result.rows;
}

export async function markAiScheduleReminderSent(scheduleId: string, reminderMinutes: number): Promise<void> {
  await ensureAiSchema();
  await pool.query(
    `
    UPDATE ai_service_schedules
    SET reminder_sent_at = NOW(),
        reminder_sent_for_minutes = $2,
        reminder_sent_minutes_list = CASE
          WHEN COALESCE(reminder_sent_minutes_list, '[]'::jsonb) @> to_jsonb(ARRAY[$2::integer])
            THEN COALESCE(reminder_sent_minutes_list, '[]'::jsonb)
          ELSE COALESCE(reminder_sent_minutes_list, '[]'::jsonb) || to_jsonb(ARRAY[$2::integer])
        END,
        updated_at = NOW()
    WHERE id = $1
    `,
    [scheduleId, Math.max(1, Math.round(Number(reminderMinutes || 0)))],
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
  notes?: string | null;
}): Promise<AiOrderRow> {
  await ensureAiSchema();
  const resolvedAccountId =
    String(input.accountId || "").trim() ||
    String(
      (
        await pool.query<{ account_id: string | null }>(
          `
          SELECT account_id
          FROM conversations
          WHERE id = $1
          LIMIT 1
          `,
          [input.conversationId],
        )
      ).rows[0]?.account_id || "",
    ).trim() ||
    null;
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
      notes,
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
    const updatedExisting = await pool.query<AiOrderRow>(
      `
      UPDATE ai_orders
      SET
        account_id = COALESCE($2, account_id),
        customer_phone = COALESCE($3, customer_phone),
        summary = $4,
        items = $5::jsonb,
        total_estimate = $6,
        responsible_name = $7,
        fulfillment_type = $8,
        delivery_address = $9,
        payment_method = $10,
        notes = $11,
        customer_confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
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
        notes,
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
        existing.rows[0].id,
        resolvedAccountId,
        input.customerPhone || null,
        input.summary,
        JSON.stringify(input.items || []),
        Number.isFinite(Number(input.totalEstimate)) ? Number(input.totalEstimate) : null,
        input.responsibleName || null,
        input.fulfillmentType || null,
        input.deliveryAddress || null,
        input.paymentMethod || null,
        input.notes || null,
      ],
    );
    return updatedExisting.rows[0] || existing.rows[0];
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
      notes,
      status,
      customer_confirmed_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, 'pending_confirmation', NOW())
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
      notes,
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
      resolvedAccountId,
      input.conversationId,
      input.customerPhone || null,
      input.summary,
      JSON.stringify(input.items || []),
      Number.isFinite(Number(input.totalEstimate)) ? Number(input.totalEstimate) : null,
      input.responsibleName || null,
      input.fulfillmentType || null,
      input.deliveryAddress || null,
      input.paymentMethod || null,
      input.notes || null,
    ],
  );
  return result.rows[0];
}

export async function listAiOrders(accountId?: string | null, companyId?: string | null): Promise<AiOrderRow[]> {
  await ensureAiSchema();
  const result = await pool.query<AiOrderRow>(
    `
    SELECT
      o.id,
      COALESCE(o.account_id, c.account_id) AS account_id,
      o.conversation_id,
      o.customer_phone,
      o.summary,
      o.items,
      o.total_estimate::text,
      o.responsible_name,
      o.fulfillment_type,
      o.delivery_address,
      o.payment_method,
      o.notes,
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
    LEFT JOIN whatsapp_accounts wa ON wa.id = COALESCE(o.account_id, c.account_id)
    WHERE ($1::uuid IS NULL OR COALESCE(o.account_id, c.account_id) = $1)
      AND ($2::uuid IS NULL OR wa.company_id = $2)
    ORDER BY o.created_at DESC
    `,
    [accountId || null, companyId || null],
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
      COALESCE(o.account_id, c.account_id) AS account_id,
      o.conversation_id,
      o.customer_phone,
      o.summary,
      o.items,
      o.total_estimate::text,
      o.responsible_name,
      o.fulfillment_type,
      o.delivery_address,
      o.payment_method,
      o.notes,
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
    LEFT JOIN whatsapp_accounts wa ON wa.id = COALESCE(o.account_id, c.account_id)
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
      notes,
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
      responsible_name,
      fulfillment_type,
      delivery_address,
      payment_method,
      notes,
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
