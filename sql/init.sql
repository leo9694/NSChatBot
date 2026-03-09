CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(180),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_jid VARCHAR(80) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  display_name VARCHAR(160),
  session_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone VARCHAR(30) NOT NULL,
  wa_jid VARCHAR(80) NOT NULL,
  display_name VARCHAR(160),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  phone VARCHAR(30) NOT NULL,
  wa_jid VARCHAR(80),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_me BOOLEAN NOT NULL DEFAULT false,
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  provider VARCHAR(40) NOT NULL DEFAULT 'whatsapp_baileys',
  external_message_id VARCHAR(120),
  provider_payload JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulk_dispatch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
  account_wa_jid VARCHAR(80) NOT NULL,
  message_text TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds >= 30 AND interval_seconds <= 3600),
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'stopped')),
  total_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulk_dispatch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES bulk_dispatch_jobs(id) ON DELETE CASCADE,
  phone VARCHAR(30) NOT NULL,
  contact_name VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error_message TEXT,
  external_message_id VARCHAR(120),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'operador' CHECK (role IN ('administrador', 'operador')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES app_sectors(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS app_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address VARCHAR(80),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

ALTER TABLE app_user_sessions DROP CONSTRAINT IF EXISTS app_user_sessions_user_id_key;
ALTER TABLE app_user_sessions DROP CONSTRAINT IF EXISTS uq_app_user_sessions_user_id;
DROP INDEX IF EXISTS idx_app_user_sessions_user_id_unique;
DROP INDEX IF EXISTS uq_app_user_sessions_user_id;

-- Merge duplicated conversations by account+phone, keeping the most recently updated row.
WITH ranked AS (
  SELECT
    id,
    account_id,
    phone,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, phone
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, created_at DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY account_id, phone
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, created_at DESC
    ) AS keep_id
  FROM conversations
  WHERE account_id IS NOT NULL
),
dupes AS (
  SELECT id AS drop_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE messages m
SET conversation_id = d.keep_id
FROM dupes d
WHERE m.conversation_id = d.drop_id;

WITH ranked AS (
  SELECT
    id,
    account_id,
    phone,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, phone
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, created_at DESC
    ) AS rn
  FROM conversations
  WHERE account_id IS NOT NULL
)
DELETE FROM conversations c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS service_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (service_status IN ('pending', 'in_progress', 'finalized'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_jid VARCHAR(80);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_me BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE messages ALTER COLUMN provider SET DEFAULT 'whatsapp_baileys';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_wa_jid_key'
  ) THEN
    ALTER TABLE conversations DROP CONSTRAINT conversations_wa_jid_key;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_wa_jid ON whatsapp_accounts(wa_jid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone ON whatsapp_accounts(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unread_count ON conversations(unread_count);
CREATE INDEX IF NOT EXISTS idx_conversations_service_status ON conversations(service_status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user_id ON conversations(assigned_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_account_jid ON conversations(account_id, wa_jid);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_account_phone ON conversations(account_id, phone) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_messages_wa_jid ON messages(wa_jid);
CREATE INDEX IF NOT EXISTS idx_messages_direction_created_at ON messages(direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_client_id ON agent_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_external_message_id ON messages(external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_jobs_status ON bulk_dispatch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_jobs_created_at ON bulk_dispatch_jobs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bulk_dispatch_one_active_per_account
  ON bulk_dispatch_jobs(account_wa_jid)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_items_job_id ON bulk_dispatch_items(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_items_status ON bulk_dispatch_items(status);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(lower(username));
CREATE INDEX IF NOT EXISTS idx_app_users_sector_id ON app_users(sector_id);
CREATE INDEX IF NOT EXISTS idx_app_sectors_name ON app_sectors(lower(name));
CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id ON app_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires_at ON app_user_sessions(expires_at);

INSERT INTO app_sectors (name)
VALUES ('Administrativo')
ON CONFLICT (name) DO NOTHING;

INSERT INTO app_users (name, username, password_hash, role, sector_id)
SELECT 'Leonardo', 'leonardo', crypt('123456', gen_salt('bf')), 'administrador', s.id
FROM app_sectors s
WHERE s.name = 'Administrativo'
ON CONFLICT (username) DO NOTHING;
