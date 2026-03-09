import { randomBytes, createHash } from "node:crypto";
import { pool } from "../db/pool";

export type AppUserRole = "administrador" | "operador";

export interface AppUser {
  id: string;
  name: string;
  username: string;
  role: AppUserRole;
  sector_id?: string | null;
  sector_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSector {
  id: string;
  name: string;
  created_at: string;
}

export interface SessionUser {
  sessionId: string;
  tokenHash: string;
  user: Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name">;
}

let ensureAuthSchemaPromise: Promise<void> | null = null;

export async function ensureAuthSchema(): Promise<void> {
  if (!ensureAuthSchemaPromise) {
    ensureAuthSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_sectors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(120) NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(160) NOT NULL,
          username VARCHAR(80) NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role VARCHAR(30) NOT NULL DEFAULT 'operador' CHECK (role IN ('administrador', 'operador')),
          sector_id UUID REFERENCES app_sectors(id) ON DELETE SET NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES app_sectors(id) ON DELETE SET NULL
      `);

      await pool.query(`
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
        )
      `);

      // Compatibilidade com versoes antigas que limitavam 1 sessao por usuario.
      await pool.query(`
        ALTER TABLE app_user_sessions DROP CONSTRAINT IF EXISTS app_user_sessions_user_id_key;
        ALTER TABLE app_user_sessions DROP CONSTRAINT IF EXISTS uq_app_user_sessions_user_id;
        DROP INDEX IF EXISTS idx_app_user_sessions_user_id_unique;
        DROP INDEX IF EXISTS uq_app_user_sessions_user_id;
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(lower(username));
        CREATE INDEX IF NOT EXISTS idx_app_users_sector_id ON app_users(sector_id);
        CREATE INDEX IF NOT EXISTS idx_app_sectors_name ON app_sectors(lower(name));
        CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id ON app_user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires_at ON app_user_sessions(expires_at);
      `);

      await pool.query(`
        INSERT INTO app_sectors (name)
        VALUES ('Administrativo')
        ON CONFLICT (name) DO NOTHING
      `);

      await pool.query(`
        INSERT INTO app_users (name, username, password_hash, role, sector_id)
        SELECT 'Leonardo', 'leonardo', crypt('123456', gen_salt('bf')), 'administrador', s.id
        FROM app_sectors s
        WHERE s.name = 'Administrativo'
        ON CONFLICT (username) DO NOTHING
      `);

      await pool.query(`
        UPDATE app_users u
        SET sector_id = s.id, updated_at = NOW()
        FROM app_sectors s
        WHERE lower(u.username) = 'leonardo'
          AND s.name = 'Administrativo'
          AND u.sector_id IS NULL
      `);
    })().catch((error) => {
      ensureAuthSchemaPromise = null;
      throw error;
    });
  }

  await ensureAuthSchemaPromise;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<Pick<AppUser, "id" | "name" | "username" | "role"> | null> {
  await ensureAuthSchema();

  const result = await pool.query<Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name">>(
    `
    SELECT u.id, u.name, u.username, u.role, u.sector_id, s.name AS sector_name
    FROM app_users u
    LEFT JOIN app_sectors s ON s.id = u.sector_id
    WHERE lower(u.username) = lower($1)
      AND u.is_active = true
      AND u.password_hash = crypt($2, u.password_hash)
    LIMIT 1
    `,
    [username, password],
  );

  return result.rows[0] || null;
}

export async function createUserSession(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  daysValid?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  await ensureAuthSchema();

  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const days = Math.max(1, Math.min(Number(input.daysValid || 7), 30));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await pool.query(
    `
    INSERT INTO app_user_sessions (user_id, token_hash, ip_address, user_agent, expires_at, last_seen_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    `,
    [input.userId, tokenHash, input.ipAddress || null, input.userAgent || null, expiresAt],
  );

  return { token, expiresAt };
}

export async function getSessionUserByToken(token: string): Promise<SessionUser | null> {
  await ensureAuthSchema();
  if (!token) return null;

  const tokenHash = hashSessionToken(token);

  const result = await pool.query<{
    session_id: string;
    token_hash: string;
    user_id: string;
    name: string;
    username: string;
    role: AppUserRole;
    sector_id: string | null;
    sector_name: string | null;
  }>(
    `
    SELECT
      s.id AS session_id,
      s.token_hash,
      u.id AS user_id,
      u.name,
      u.username,
      u.role,
      u.sector_id,
      sec.name AS sector_name
    FROM app_user_sessions s
    JOIN app_users u ON u.id = s.user_id
    LEFT JOIN app_sectors sec ON sec.id = u.sector_id
    WHERE s.token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND u.is_active = true
    LIMIT 1
    `,
    [tokenHash],
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];

  await pool.query(
    `
    UPDATE app_user_sessions
    SET last_seen_at = NOW(), updated_at = NOW()
    WHERE id = $1
    `,
    [row.session_id],
  );

  return {
    sessionId: row.session_id,
    tokenHash: row.token_hash,
    user: {
      id: row.user_id,
      name: row.name,
      username: row.username,
      role: row.role,
      sector_id: row.sector_id,
      sector_name: row.sector_name,
    },
  };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await ensureAuthSchema();
  if (!token) return;

  const tokenHash = hashSessionToken(token);
  await pool.query(
    `
    UPDATE app_user_sessions
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE token_hash = $1
      AND revoked_at IS NULL
    `,
    [tokenHash],
  );
}

export async function listUsers(): Promise<Array<Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name" | "is_active" | "created_at">>> {
  await ensureAuthSchema();

  const result = await pool.query<Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name" | "is_active" | "created_at">>(
    `
    SELECT
      u.id,
      u.name,
      u.username,
      u.role,
      u.sector_id,
      s.name AS sector_name,
      u.is_active,
      u.created_at
    FROM app_users u
    LEFT JOIN app_sectors s ON s.id = u.sector_id
    WHERE u.is_active = true
    ORDER BY u.created_at DESC
    `,
  );

  return result.rows;
}

export async function createUser(input: {
  name: string;
  username: string;
  password: string;
  role: AppUserRole;
  sectorId: string;
}): Promise<Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name" | "is_active" | "created_at">> {
  await ensureAuthSchema();

  const result = await pool.query<Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name" | "is_active" | "created_at">>(
    `
    INSERT INTO app_users (name, username, password_hash, role, sector_id)
    VALUES ($1, lower($2), crypt($3, gen_salt('bf')), $4, $5)
    RETURNING id, name, username, role, sector_id, is_active, created_at
    `,
    [input.name, input.username, input.password, input.role, input.sectorId],
  );

  const user = result.rows[0];
  const sector = await pool.query<{ name: string }>(`SELECT name FROM app_sectors WHERE id = $1`, [user.sector_id]);
  return {
    ...user,
    sector_name: sector.rows[0]?.name || null,
  };
}

export async function updateUser(input: {
  id: string;
  name: string;
  username: string;
  role: AppUserRole;
  sectorId: string;
  password?: string;
}): Promise<Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "sector_name" | "is_active" | "created_at"> | null> {
  await ensureAuthSchema();

  if (input.password && input.password.trim()) {
    const withPass = await pool.query<
      Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "is_active" | "created_at">
    >(
      `
      UPDATE app_users
      SET
        name = $2,
        username = lower($3),
        role = $4,
        sector_id = $5,
        password_hash = crypt($6, gen_salt('bf')),
        updated_at = NOW()
      WHERE id = $1
        AND is_active = true
      RETURNING id, name, username, role, sector_id, is_active, created_at
      `,
      [input.id, input.name, input.username, input.role, input.sectorId, input.password],
    );

    if (!withPass.rows.length) return null;
    const user = withPass.rows[0];
    const sector = await pool.query<{ name: string }>(`SELECT name FROM app_sectors WHERE id = $1`, [user.sector_id]);
    return { ...user, sector_name: sector.rows[0]?.name || null };
  }

  const withoutPass = await pool.query<
    Pick<AppUser, "id" | "name" | "username" | "role" | "sector_id" | "is_active" | "created_at">
  >(
    `
    UPDATE app_users
    SET
      name = $2,
      username = lower($3),
      role = $4,
      sector_id = $5,
      updated_at = NOW()
    WHERE id = $1
      AND is_active = true
    RETURNING id, name, username, role, sector_id, is_active, created_at
    `,
    [input.id, input.name, input.username, input.role, input.sectorId],
  );

  if (!withoutPass.rows.length) return null;
  const user = withoutPass.rows[0];
  const sector = await pool.query<{ name: string }>(`SELECT name FROM app_sectors WHERE id = $1`, [user.sector_id]);
  return { ...user, sector_name: sector.rows[0]?.name || null };
}

export async function deactivateUser(userId: string): Promise<boolean> {
  await ensureAuthSchema();

  const result = await pool.query(
    `
    UPDATE app_users
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
      AND is_active = true
    `,
    [userId],
  );

  if (!result.rowCount) return false;

  await pool.query(
    `
    UPDATE app_user_sessions
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE user_id = $1
      AND revoked_at IS NULL
    `,
    [userId],
  );

  return true;
}

export async function listSectors(): Promise<AppSector[]> {
  await ensureAuthSchema();
  const result = await pool.query<AppSector>(
    `
    SELECT id, name, created_at
    FROM app_sectors
    ORDER BY name ASC
    `,
  );
  return result.rows;
}

export async function createSector(name: string): Promise<AppSector> {
  await ensureAuthSchema();
  const result = await pool.query<AppSector>(
    `
    INSERT INTO app_sectors (name)
    VALUES ($1)
    RETURNING id, name, created_at
    `,
    [name],
  );
  return result.rows[0];
}
