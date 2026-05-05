import { pool } from "../db/pool";

export interface InternalChatContact {
  user_id: string;
  name: string;
  username: string;
  role: string;
  sector_id: string | null;
  sector_name: string | null;
  thread_id: string;
  last_message_preview: string | null;
  last_message_at: string | null;
}

export interface InternalChatThread {
  id: string;
  company_id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternalChatMessage {
  id: string;
  thread_id: string;
  sender_user_id: string | null;
  sender_name: string | null;
  body: string;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

let ensureInternalChatSchemaPromise: Promise<void> | null = null;

function sortUserPair(userId: string, peerUserId: string): [string, string] {
  return [userId, peerUserId].sort() as [string, string];
}

export async function ensureInternalChatSchema(): Promise<void> {
  if (ensureInternalChatSchemaPromise) {
    return ensureInternalChatSchemaPromise;
  }

  ensureInternalChatSchemaPromise = (async () => {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS internal_chat_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES app_companies(id) ON DELETE CASCADE,
        user_a_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        user_b_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        last_message_preview TEXT,
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT internal_chat_threads_distinct_users CHECK (user_a_id <> user_b_id)
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_chat_threads_pair
      ON internal_chat_threads(company_id, user_a_id, user_b_id)
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_internal_chat_threads_company ON internal_chat_threads(company_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_internal_chat_threads_user_a ON internal_chat_threads(user_a_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_internal_chat_threads_user_b ON internal_chat_threads(user_b_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS internal_chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id UUID NOT NULL REFERENCES internal_chat_threads(id) ON DELETE CASCADE,
        sender_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        message_type VARCHAR(30) NOT NULL DEFAULT 'text',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_thread_created ON internal_chat_messages(thread_id, created_at)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS internal_chat_reads (
        thread_id UUID NOT NULL REFERENCES internal_chat_threads(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (thread_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_internal_chat_reads_user ON internal_chat_reads(user_id)`);
  })();

  return ensureInternalChatSchemaPromise;
}

async function assertPeerInCompany(companyId: string, userId: string): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM app_users
      WHERE id = $1
        AND company_id = $2
        AND is_active = true
      LIMIT 1
    `,
    [userId, companyId],
  );
  return (result.rowCount || 0) > 0;
}

export async function getOrCreateInternalThread(input: {
  companyId: string;
  userId: string;
  peerUserId: string;
}): Promise<InternalChatThread | null> {
  await ensureInternalChatSchema();
  const companyId = String(input.companyId || "").trim();
  const userId = String(input.userId || "").trim();
  const peerUserId = String(input.peerUserId || "").trim();

  if (!companyId || !userId || !peerUserId || userId === peerUserId) {
    return null;
  }

  const [userAId, userBId] = sortUserPair(userId, peerUserId);
  const bothUsersOk = await Promise.all([assertPeerInCompany(companyId, userId), assertPeerInCompany(companyId, peerUserId)]);
  if (!bothUsersOk.every(Boolean)) {
    return null;
  }

  await pool.query(
    `
      INSERT INTO internal_chat_threads (company_id, user_a_id, user_b_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id, user_a_id, user_b_id)
      DO NOTHING
    `,
    [companyId, userAId, userBId],
  );

  const result = await pool.query<InternalChatThread>(
    `
      SELECT
        id,
        company_id,
        user_a_id,
        user_b_id,
        last_message_preview,
        last_message_at,
        created_at,
        updated_at
      FROM internal_chat_threads
      WHERE company_id = $1
        AND user_a_id = $2
        AND user_b_id = $3
      LIMIT 1
    `,
    [companyId, userAId, userBId],
  );

  return result.rows[0] || null;
}

export async function listInternalChatContacts(companyId: string, currentUserId: string): Promise<InternalChatContact[]> {
  await ensureInternalChatSchema();
  const users = await pool.query<{
    id: string;
    name: string;
    username: string;
    role: string;
    sector_id: string | null;
    sector_name: string | null;
  }>(
    `
      SELECT
        u.id,
        u.name,
        u.username,
        u.role,
        u.sector_id,
        s.name AS sector_name
      FROM app_users u
      LEFT JOIN app_sectors s ON s.id = u.sector_id
      WHERE u.company_id = $1
        AND u.id <> $2
        AND u.is_active = true
      ORDER BY u.name ASC, u.username ASC
    `,
    [companyId, currentUserId],
  );

  const contacts: InternalChatContact[] = [];
  for (const user of users.rows) {
    const thread = await getOrCreateInternalThread({ companyId, userId: currentUserId, peerUserId: user.id });
    if (!thread) continue;
    contacts.push({
      user_id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      sector_id: user.sector_id,
      sector_name: user.sector_name,
      thread_id: thread.id,
      last_message_preview: thread.last_message_preview,
      last_message_at: thread.last_message_at,
    });
  }

  return contacts.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export async function countUnreadInternalMessages(companyId: string, userId: string): Promise<number> {
  await ensureInternalChatSchema();
  const result = await pool.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM internal_chat_messages m
      JOIN internal_chat_threads t ON t.id = m.thread_id
      LEFT JOIN internal_chat_reads r ON r.thread_id = t.id AND r.user_id = $2
      WHERE t.company_id = $1
        AND (t.user_a_id = $2 OR t.user_b_id = $2)
        AND COALESCE(m.sender_user_id::text, '') <> $2::text
        AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)
    `,
    [companyId, userId],
  );
  return Number(result.rows[0]?.total || 0);
}

export async function markInternalThreadRead(input: {
  threadId: string;
  companyId: string;
  userId: string;
}): Promise<void> {
  await ensureInternalChatSchema();
  const access = await getInternalThreadAccess(input);
  if (!access) return;
  await pool.query(
    `
      INSERT INTO internal_chat_reads (thread_id, user_id, last_read_at)
      VALUES ($1, $2, now())
      ON CONFLICT (thread_id, user_id)
      DO UPDATE SET last_read_at = EXCLUDED.last_read_at
    `,
    [input.threadId, input.userId],
  );
}

export async function getInternalThreadAccess(input: {
  threadId: string;
  companyId: string;
  userId: string;
}): Promise<InternalChatThread | null> {
  await ensureInternalChatSchema();
  const result = await pool.query<InternalChatThread>(
    `
      SELECT
        id,
        company_id,
        user_a_id,
        user_b_id,
        last_message_preview,
        last_message_at,
        created_at,
        updated_at
      FROM internal_chat_threads
      WHERE id = $1
        AND company_id = $2
        AND (user_a_id = $3 OR user_b_id = $3)
      LIMIT 1
    `,
    [input.threadId, input.companyId, input.userId],
  );
  return result.rows[0] || null;
}

export async function listInternalMessages(input: {
  threadId: string;
  companyId: string;
  userId: string;
  limit?: number;
}): Promise<InternalChatMessage[]> {
  await ensureInternalChatSchema();
  const access = await getInternalThreadAccess(input);
  if (!access) return [];

  const limit = Math.max(1, Math.min(Number(input.limit || 80), 200));
  const result = await pool.query<InternalChatMessage>(
    `
      SELECT *
      FROM (
        SELECT
          m.id,
          m.thread_id,
          m.sender_user_id,
          u.name AS sender_name,
          m.body,
          m.message_type,
          m.metadata,
          m.created_at
        FROM internal_chat_messages m
        LEFT JOIN app_users u ON u.id = m.sender_user_id
        WHERE m.thread_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
      ) ordered
      ORDER BY created_at ASC
    `,
    [input.threadId, limit],
  );

  return result.rows;
}

export async function createInternalMessage(input: {
  threadId: string;
  companyId: string;
  senderUserId: string;
  body: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
}): Promise<InternalChatMessage | null> {
  await ensureInternalChatSchema();
  const access = await getInternalThreadAccess({
    threadId: input.threadId,
    companyId: input.companyId,
    userId: input.senderUserId,
  });
  if (!access) return null;

  const body = String(input.body || "").trim();
  if (!body) return null;

  const result = await pool.query<InternalChatMessage>(
    `
      INSERT INTO internal_chat_messages (thread_id, sender_user_id, body, message_type, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING
        id,
        thread_id,
        sender_user_id,
        (SELECT name FROM app_users WHERE id = $2) AS sender_name,
        body,
        message_type,
        metadata,
        created_at
    `,
    [
      input.threadId,
      input.senderUserId,
      body,
      String(input.messageType || "text").trim() || "text",
      JSON.stringify(input.metadata || {}),
    ],
  );

  const message = result.rows[0] || null;
  if (message) {
    await pool.query(
      `
        UPDATE internal_chat_threads
        SET
          last_message_preview = $2,
          last_message_at = $3,
          updated_at = now()
        WHERE id = $1
      `,
      [input.threadId, body.slice(0, 240), message.created_at],
    );
  }

  return message;
}
