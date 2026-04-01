import { randomBytes, createHash } from "crypto";
import { pool } from "../db/pool";

export type AppUserRole = "ceo" | "administrador" | "operador";

export interface CompanyThemePalette {
  name: string;
  bg: string;
  panel: string;
  panel_2: string;
  hover: string;
  text: string;
  muted: string;
  accent: string;
  bubble_out: string;
  bubble_in: string;
  line: string;
}

export interface AppCompany {
  id: string;
  name: string;
  cnpj: string | null;
  is_active: boolean;
  logo_data_url?: string | null;
  theme_palette_options?: CompanyThemePalette[] | null;
  theme_selected_palette_index?: number | null;
  theme_selected_palette?: CompanyThemePalette | null;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  name: string;
  username: string;
  role: AppUserRole;
  auto_sign_messages?: boolean;
  company_id?: string | null;
  company_name?: string | null;
  company_cnpj?: string | null;
  sector_id?: string | null;
  sector_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSector {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface SessionUser {
  sessionId: string;
  tokenHash: string;
  user: Pick<
    AppUser,
    "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name"
  >;
}

let ensureAuthSchemaPromise: Promise<void> | null = null;

async function isAuthSchemaReady(): Promise<boolean> {
  const result = await pool.query<{
    companies_ok: boolean;
    sectors_ok: boolean;
    users_ok: boolean;
    sessions_ok: boolean;
  }>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'app_companies'
          AND column_name IN ('id', 'name', 'logo_data_url', 'theme_palette_options', 'theme_selected_palette_index')
        GROUP BY table_name
        HAVING COUNT(DISTINCT column_name) = 5
      ) AS companies_ok,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'app_sectors'
          AND column_name IN ('id', 'company_id', 'name')
        GROUP BY table_name
        HAVING COUNT(DISTINCT column_name) = 3
      ) AS sectors_ok,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'app_users'
          AND column_name IN ('id', 'company_id', 'sector_id', 'name', 'username', 'password_hash', 'role', 'auto_sign_messages', 'is_active')
        GROUP BY table_name
        HAVING COUNT(DISTINCT column_name) = 9
      ) AS users_ok,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'app_user_sessions'
          AND column_name IN ('id', 'user_id', 'token_hash', 'expires_at', 'revoked_at', 'last_seen_at')
        GROUP BY table_name
        HAVING COUNT(DISTINCT column_name) = 6
      ) AS sessions_ok
  `);

  const row = result.rows[0];
  return Boolean(row?.companies_ok && row?.sectors_ok && row?.users_ok && row?.sessions_ok);
}

function normalizeThemePaletteCandidate(value: any): CompanyThemePalette | null {
  const palette = {
    name: String(value?.name || "").trim() || "Paleta",
    bg: String(value?.bg || "").trim(),
    panel: String(value?.panel || "").trim(),
    panel_2: String(value?.panel_2 || value?.panel2 || "").trim(),
    hover: String(value?.hover || "").trim(),
    text: String(value?.text || "").trim(),
    muted: String(value?.muted || "").trim(),
    accent: String(value?.accent || "").trim(),
    bubble_out: String(value?.bubble_out || value?.bubbleOut || "").trim(),
    bubble_in: String(value?.bubble_in || value?.bubbleIn || "").trim(),
    line: String(value?.line || "").trim(),
  };

  const looksComplete = Object.values(palette).every((item) => typeof item === "string" && item.trim());
  if (!looksComplete) {
    return null;
  }
  return palette;
}

function normalizeCompanyThemePalettes(value: unknown): CompanyThemePalette[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeThemePaletteCandidate(item)).filter((item): item is CompanyThemePalette => Boolean(item)).slice(0, 3);
}

async function getDefaultCompanyId(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM app_companies
    WHERE lower(name) IN (lower('Norte Sul Sementes'), lower('Empresa Principal'))
    ORDER BY CASE
      WHEN lower(name) = lower('Norte Sul Sementes') THEN 0
      ELSE 1
    END
    LIMIT 1
    `,
  );
  if (!result.rows.length) {
    throw new Error("DEFAULT_COMPANY_NOT_FOUND");
  }
  return result.rows[0].id;
}

async function migrateLegacyDefaultCompanyData(targetCompanyId: string): Promise<void> {
  const legacyResult = await pool.query<{ id: string }>(
    `SELECT id FROM app_companies WHERE lower(name) = lower('Empresa Principal') LIMIT 1`,
  );
  const legacyCompanyId = legacyResult.rows[0]?.id || "";
  if (!legacyCompanyId || legacyCompanyId === targetCompanyId) {
    return;
  }

  const legacySectors = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM app_sectors WHERE company_id = $1 ORDER BY created_at ASC`,
    [legacyCompanyId],
  );

  const sectorMap = new Map<string, string>();
  for (const sector of legacySectors.rows) {
    await pool.query(
      `
      INSERT INTO app_sectors (company_id, name)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [targetCompanyId, sector.name],
    );

    const targetSector = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM app_sectors
      WHERE company_id = $1
        AND lower(name) = lower($2)
      LIMIT 1
      `,
      [targetCompanyId, sector.name],
    );
    if (targetSector.rows[0]?.id) {
      sectorMap.set(sector.id, targetSector.rows[0].id);
    }
  }

  for (const [legacySectorId, targetSectorId] of sectorMap.entries()) {
    await pool.query(
      `
      UPDATE app_users
      SET
        company_id = $1,
        sector_id = $2,
        updated_at = NOW()
      WHERE company_id = $3
        AND sector_id = $4
      `,
      [targetCompanyId, targetSectorId, legacyCompanyId, legacySectorId],
    );
  }

  await pool.query(
    `
    UPDATE app_users
    SET
      company_id = $1,
      updated_at = NOW()
    WHERE company_id = $2
    `,
    [targetCompanyId, legacyCompanyId],
  );

  await pool.query(`UPDATE whatsapp_accounts SET company_id = $1 WHERE company_id = $2`, [targetCompanyId, legacyCompanyId]);
  await pool.query(`UPDATE products SET company_id = $1 WHERE company_id = $2`, [targetCompanyId, legacyCompanyId]).catch(() => undefined);
  await pool.query(`DELETE FROM app_sectors WHERE company_id = $1`, [legacyCompanyId]);

  const remainingRefs = await pool.query<{ total: string }>(
    `
    SELECT (
      (SELECT COUNT(*) FROM app_users WHERE company_id = $1)
      + (SELECT COUNT(*) FROM app_sectors WHERE company_id = $1)
      + (SELECT COUNT(*) FROM whatsapp_accounts WHERE company_id = $1)
      + COALESCE((SELECT COUNT(*) FROM products WHERE company_id = $1), 0)
    )::text AS total
    `,
    [legacyCompanyId],
  ).catch(() => ({ rows: [{ total: "1" }] }));

  if (Number(remainingRefs.rows[0]?.total || 0) === 0) {
    await pool.query(`DELETE FROM app_companies WHERE id = $1`, [legacyCompanyId]).catch(() => undefined);
  }
}

export async function ensureAuthSchema(): Promise<void> {
  if (!ensureAuthSchemaPromise) {
    ensureAuthSchemaPromise = (async () => {
      const schemaReady = await isAuthSchemaReady().catch(() => false);
      if (schemaReady) {
        return;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(180) NOT NULL,
          cnpj VARCHAR(40),
          is_active BOOLEAN NOT NULL DEFAULT true,
          logo_data_url TEXT,
          theme_palette_options JSONB NOT NULL DEFAULT '[]'::jsonb,
          theme_selected_palette_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS logo_data_url TEXT`);
      await pool.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS theme_palette_options JSONB NOT NULL DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS theme_selected_palette_index INTEGER NOT NULL DEFAULT 0`);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_app_companies_name ON app_companies(lower(name));
        CREATE UNIQUE INDEX IF NOT EXISTS uq_app_companies_cnpj ON app_companies(cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';
      `);

      await pool.query(`
        INSERT INTO app_companies (name)
        VALUES ('Norte Sul Sementes')
        ON CONFLICT DO NOTHING
      `);
      await pool.query(`
        UPDATE app_companies
        SET
          name = 'Norte Sul Sementes',
          updated_at = NOW()
        WHERE lower(name) = lower('Empresa Principal')
          AND NOT EXISTS (
            SELECT 1
            FROM app_companies existing
            WHERE existing.id <> app_companies.id
              AND lower(existing.name) = lower('Norte Sul Sementes')
          )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_sectors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE,
          name VARCHAR(120) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`ALTER TABLE app_sectors ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE`);
      await pool.query(`ALTER TABLE app_sectors DROP CONSTRAINT IF EXISTS app_sectors_name_key`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE,
          name VARCHAR(160) NOT NULL,
          username VARCHAR(80) NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role VARCHAR(30) NOT NULL DEFAULT 'operador',
          sector_id UUID REFERENCES app_sectors(id) ON DELETE SET NULL,
          auto_sign_messages BOOLEAN NOT NULL DEFAULT true,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE`);
      await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES app_sectors(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auto_sign_messages BOOLEAN NOT NULL DEFAULT true`);
      await pool.query(`ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check`);
      await pool.query(`ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('ceo', 'administrador', 'operador')) NOT VALID`);
      await pool.query(`ALTER TABLE app_users VALIDATE CONSTRAINT app_users_role_check`);

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

      await pool.query(`
        ALTER TABLE app_user_sessions DROP CONSTRAINT IF EXISTS app_user_sessions_user_id_key;
        ALTER TABLE app_user_sessions DROP CONSTRAINT IF EXISTS uq_app_user_sessions_user_id;
        DROP INDEX IF EXISTS idx_app_user_sessions_user_id_unique;
        DROP INDEX IF EXISTS uq_app_user_sessions_user_id;
      `);

      const defaultCompanyId = await getDefaultCompanyId();
      await migrateLegacyDefaultCompanyData(defaultCompanyId);

      await pool.query(`UPDATE app_sectors SET company_id = $1 WHERE company_id IS NULL`, [defaultCompanyId]);
      await pool.query(`UPDATE app_users SET company_id = $1 WHERE company_id IS NULL`, [defaultCompanyId]);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_app_sectors_company_name
        ON app_sectors(company_id, lower(name))
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(lower(username));
        CREATE INDEX IF NOT EXISTS idx_app_users_sector_id ON app_users(sector_id);
        CREATE INDEX IF NOT EXISTS idx_app_users_company_id ON app_users(company_id);
        CREATE INDEX IF NOT EXISTS idx_app_sectors_company_id ON app_sectors(company_id);
        CREATE INDEX IF NOT EXISTS idx_app_sectors_name ON app_sectors(lower(name));
        CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id ON app_user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires_at ON app_user_sessions(expires_at);
      `);

      await pool.query(
        `
        INSERT INTO app_sectors (company_id, name)
        VALUES ($1, 'Administrativo')
        ON CONFLICT (company_id, lower(name)) DO NOTHING
        `,
        [defaultCompanyId],
      ).catch(async () => {
        await pool.query(
          `
          INSERT INTO app_sectors (company_id, name)
          SELECT $1, 'Administrativo'
          WHERE NOT EXISTS (
            SELECT 1 FROM app_sectors WHERE company_id = $1 AND lower(name) = lower('Administrativo')
          )
          `,
          [defaultCompanyId],
        );
      });

      await pool.query(`
        INSERT INTO app_users (company_id, name, username, password_hash, role, sector_id)
        SELECT $1, 'Leonardo', 'leonardo', crypt('123456', gen_salt('bf')), 'ceo', s.id
        FROM app_sectors s
        WHERE s.company_id = $1
          AND lower(s.name) = lower('Administrativo')
        ON CONFLICT (username) DO NOTHING
      `, [defaultCompanyId]);

      await pool.query(`
        UPDATE app_users u
        SET company_id = $1,
            role = 'ceo',
            sector_id = s.id,
            updated_at = NOW()
        FROM app_sectors s
        WHERE lower(u.username) = 'leonardo'
          AND s.company_id = $1
          AND lower(s.name) = lower('Administrativo')
      `, [defaultCompanyId]);
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
): Promise<Pick<AppUser, "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name"> | null> {
  await ensureAuthSchema();

  const result = await pool.query<Pick<AppUser, "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name">>(
    `
    SELECT u.id, u.name, u.username, u.role, u.auto_sign_messages,
           u.company_id,
           c.name AS company_name,
           c.cnpj AS company_cnpj,
           u.sector_id,
           s.name AS sector_name
    FROM app_users u
    LEFT JOIN app_sectors s ON s.id = u.sector_id
    LEFT JOIN app_companies c ON c.id = u.company_id
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
    auto_sign_messages: boolean;
    company_id: string | null;
    company_name: string | null;
    company_cnpj: string | null;
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
      u.auto_sign_messages,
      u.company_id,
      c.name AS company_name,
      c.cnpj AS company_cnpj,
      u.sector_id,
      sec.name AS sector_name
    FROM app_user_sessions s
    JOIN app_users u ON u.id = s.user_id
    LEFT JOIN app_sectors sec ON sec.id = u.sector_id
    LEFT JOIN app_companies c ON c.id = u.company_id
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
      auto_sign_messages: Boolean(row.auto_sign_messages),
      company_id: row.company_id,
      company_name: row.company_name,
      company_cnpj: row.company_cnpj,
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

export async function listUsers(companyId: string): Promise<Array<Pick<AppUser, "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name" | "is_active" | "created_at">>> {
  await ensureAuthSchema();

  const result = await pool.query<Pick<AppUser, "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name" | "is_active" | "created_at">>(
    `
    SELECT
      u.id,
      u.name,
      u.username,
      u.role,
      u.auto_sign_messages,
      u.company_id,
      c.name AS company_name,
      c.cnpj AS company_cnpj,
      u.sector_id,
      s.name AS sector_name,
      u.is_active,
      u.created_at
    FROM app_users u
    LEFT JOIN app_sectors s ON s.id = u.sector_id
    LEFT JOIN app_companies c ON c.id = u.company_id
    WHERE u.is_active = true
      AND u.company_id = $1
    ORDER BY u.created_at DESC
    `,
    [companyId],
  );

  return result.rows;
}

export async function createUser(input: {
  companyId: string;
  name: string;
  username: string;
  password: string;
  role: AppUserRole;
  sectorId: string;
}): Promise<Pick<AppUser, "id" | "name" | "username" | "role" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name" | "is_active" | "created_at">> {
  await ensureAuthSchema();

  const sectorCheck = await pool.query<{ id: string }>(`SELECT id FROM app_sectors WHERE id = $1 AND company_id = $2 LIMIT 1`, [input.sectorId, input.companyId]);
  if (!sectorCheck.rows.length) {
    const err: any = new Error("SECTOR_NOT_IN_COMPANY");
    err.code = 'SECTOR_NOT_IN_COMPANY';
    throw err;
  }

  const result = await pool.query<Pick<AppUser, "id" | "name" | "username" | "role" | "company_id" | "sector_id" | "is_active" | "created_at">>(
    `
    INSERT INTO app_users (company_id, name, username, password_hash, role, sector_id)
    VALUES ($1, $2, lower($3), crypt($4, gen_salt('bf')), $5, $6)
    RETURNING id, name, username, role, company_id, sector_id, is_active, created_at
    `,
    [input.companyId, input.name, input.username, input.password, input.role, input.sectorId],
  );

  const user = result.rows[0];
  const meta = await pool.query<{ sector_name: string | null; company_name: string | null; company_cnpj: string | null }>(
    `
    SELECT s.name AS sector_name, c.name AS company_name, c.cnpj AS company_cnpj
    FROM app_companies c
    LEFT JOIN app_sectors s ON s.id = $1
    WHERE c.id = $2
    LIMIT 1
    `,
    [user.sector_id, user.company_id],
  );

  return { ...user, sector_name: meta.rows[0]?.sector_name || null, company_name: meta.rows[0]?.company_name || null, company_cnpj: meta.rows[0]?.company_cnpj || null };
}

export async function updateUser(input: {
  id: string;
  companyId: string;
  name: string;
  username: string;
  role: AppUserRole;
  sectorId: string;
  password?: string;
}): Promise<Pick<AppUser, "id" | "name" | "username" | "role" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name" | "is_active" | "created_at"> | null> {
  await ensureAuthSchema();

  const sectorCheck = await pool.query<{ id: string }>(`SELECT id FROM app_sectors WHERE id = $1 AND company_id = $2 LIMIT 1`, [input.sectorId, input.companyId]);
  if (!sectorCheck.rows.length) {
    const err: any = new Error("SECTOR_NOT_IN_COMPANY");
    err.code = 'SECTOR_NOT_IN_COMPANY';
    throw err;
  }

  const query = input.password && input.password.trim()
    ? {
        sql: `
          UPDATE app_users
          SET name = $3,
              username = lower($4),
              role = $5,
              sector_id = $6,
              password_hash = crypt($7, gen_salt('bf')),
              updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND is_active = true
          RETURNING id, name, username, role, company_id, sector_id, is_active, created_at
        `,
        params: [input.id, input.companyId, input.name, input.username, input.role, input.sectorId, input.password],
      }
    : {
        sql: `
          UPDATE app_users
          SET name = $3,
              username = lower($4),
              role = $5,
              sector_id = $6,
              updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND is_active = true
          RETURNING id, name, username, role, company_id, sector_id, is_active, created_at
        `,
        params: [input.id, input.companyId, input.name, input.username, input.role, input.sectorId],
      };

  const result = await pool.query<any>(query.sql, query.params);
  if (!result.rows.length) return null;
  const user = result.rows[0];
  const meta = await pool.query<{ sector_name: string | null; company_name: string | null; company_cnpj: string | null }>(
    `
    SELECT s.name AS sector_name, c.name AS company_name, c.cnpj AS company_cnpj
    FROM app_companies c
    LEFT JOIN app_sectors s ON s.id = $1
    WHERE c.id = $2
    LIMIT 1
    `,
    [user.sector_id, user.company_id],
  );
  return { ...user, sector_name: meta.rows[0]?.sector_name || null, company_name: meta.rows[0]?.company_name || null, company_cnpj: meta.rows[0]?.company_cnpj || null };
}

export async function updateMyMessageSignaturePreference(input: {
  userId: string;
  autoSignMessages: boolean;
}): Promise<Pick<AppUser, "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name"> | null> {
  await ensureAuthSchema();

  await pool.query(
    `
    UPDATE app_users
    SET auto_sign_messages = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [input.userId, input.autoSignMessages],
  );

  const result = await pool.query<
    Pick<AppUser, "id" | "name" | "username" | "role" | "auto_sign_messages" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name">
  >(
    `
    SELECT u.id, u.name, u.username, u.role, u.auto_sign_messages, u.company_id,
           c.name AS company_name, c.cnpj AS company_cnpj, u.sector_id, s.name AS sector_name
    FROM app_users u
    LEFT JOIN app_sectors s ON s.id = u.sector_id
    LEFT JOIN app_companies c ON c.id = u.company_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [input.userId],
  );

  return result.rows[0] || null;
}

export async function deactivateUser(userId: string, companyId: string): Promise<boolean> {
  await ensureAuthSchema();

  const result = await pool.query(
    `
    UPDATE app_users
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
      AND company_id = $2
      AND is_active = true
    `,
    [userId, companyId],
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

export async function listSectors(companyId: string): Promise<AppSector[]> {
  await ensureAuthSchema();
  const result = await pool.query<AppSector>(
    `
    SELECT id, company_id, name, created_at
    FROM app_sectors
    WHERE company_id = $1
    ORDER BY name ASC
    `,
    [companyId],
  );
  return result.rows;
}

export async function createSector(name: string, companyId: string): Promise<AppSector> {
  await ensureAuthSchema();
  const result = await pool.query<AppSector>(
    `
    INSERT INTO app_sectors (company_id, name)
    VALUES ($1, $2)
    RETURNING id, company_id, name, created_at
    `,
    [companyId, name],
  );
  return result.rows[0];
}

export async function listCompanies(): Promise<AppCompany[]> {
  await ensureAuthSchema();
  const result = await pool.query<AppCompany>(
    `
    SELECT
      id,
      name,
      cnpj,
      is_active,
      logo_data_url,
      theme_palette_options,
      theme_selected_palette_index,
      created_at::text,
      updated_at::text
    FROM app_companies
    WHERE is_active = true
    ORDER BY created_at DESC, name ASC
    `,
  );
  return result.rows.map((row) => {
    const palettes = normalizeCompanyThemePalettes(row.theme_palette_options);
    const rawSelectedIndex = Number(row.theme_selected_palette_index);
    const selectedIndex = Number.isInteger(rawSelectedIndex)
      ? rawSelectedIndex === -1
        ? -1
        : Math.max(0, Math.min(rawSelectedIndex, Math.max(0, palettes.length - 1)))
      : 0;
    return {
      ...row,
      theme_palette_options: palettes,
      theme_selected_palette_index: selectedIndex,
      theme_selected_palette: selectedIndex >= 0 ? palettes[selectedIndex] || null : null,
    };
  });
}

export async function getCompanyBranding(companyId: string): Promise<{
  company_id: string;
  logo_data_url: string | null;
  palette_options: CompanyThemePalette[];
  selected_palette_index: number;
  selected_palette: CompanyThemePalette | null;
} | null> {
  await ensureAuthSchema();
  const result = await pool.query<{
    id: string;
    logo_data_url: string | null;
    theme_palette_options: unknown;
    theme_selected_palette_index: number | null;
  }>(
    `
    SELECT id, logo_data_url, theme_palette_options, theme_selected_palette_index
    FROM app_companies
    WHERE id = $1
      AND is_active = true
    LIMIT 1
    `,
    [companyId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const paletteOptions = normalizeCompanyThemePalettes(row.theme_palette_options);
  const rawSelectedIndex = Number(row.theme_selected_palette_index);
  const selectedIndex = Number.isInteger(rawSelectedIndex)
    ? rawSelectedIndex === -1
      ? -1
      : Math.max(0, Math.min(rawSelectedIndex, Math.max(0, paletteOptions.length - 1)))
    : 0;
  return {
    company_id: row.id,
    logo_data_url: row.logo_data_url || null,
    palette_options: paletteOptions,
    selected_palette_index: selectedIndex,
    selected_palette: selectedIndex >= 0 ? paletteOptions[selectedIndex] || null : null,
  };
}

export async function updateCompanyBranding(input: {
  companyId: string;
  logoDataUrl?: string | null;
  paletteOptions?: unknown;
  selectedPaletteIndex?: number | null;
}) {
  await ensureAuthSchema();
  const paletteOptions = normalizeCompanyThemePalettes(input.paletteOptions);
  const rawSelectedIndex = Number(input.selectedPaletteIndex);
  const selectedIndex = Number.isInteger(rawSelectedIndex)
    ? rawSelectedIndex === -1
      ? -1
      : Math.max(0, Math.min(rawSelectedIndex, Math.max(0, paletteOptions.length - 1)))
    : 0;
  const logoDataUrl = String(input.logoDataUrl || "").trim() || null;

  if (logoDataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(logoDataUrl)) {
    throw new Error("INVALID_COMPANY_LOGO_DATA_URL");
  }

  const result = await pool.query<{
    id: string;
    logo_data_url: string | null;
    theme_palette_options: unknown;
    theme_selected_palette_index: number | null;
  }>(
    `
    UPDATE app_companies
    SET
      logo_data_url = $2,
      theme_palette_options = $3::jsonb,
      theme_selected_palette_index = $4,
      updated_at = NOW()
    WHERE id = $1
      AND is_active = true
    RETURNING id, logo_data_url, theme_palette_options, theme_selected_palette_index
    `,
    [input.companyId, logoDataUrl, JSON.stringify(paletteOptions), selectedIndex],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const normalizedPalettes = normalizeCompanyThemePalettes(row.theme_palette_options);
  const rawNormalizedIndex = Number(row.theme_selected_palette_index);
  const normalizedIndex = Number.isInteger(rawNormalizedIndex)
    ? rawNormalizedIndex === -1
      ? -1
      : Math.max(0, Math.min(rawNormalizedIndex, Math.max(0, normalizedPalettes.length - 1)))
    : 0;
  return {
    company_id: row.id,
    logo_data_url: row.logo_data_url || null,
    palette_options: normalizedPalettes,
    selected_palette_index: normalizedIndex,
    selected_palette: normalizedIndex >= 0 ? normalizedPalettes[normalizedIndex] || null : null,
  };
}

export async function createCompanyWithAdmin(input: {
  companyName: string;
  companyCnpj?: string | null;
  adminName: string;
  adminUsername: string;
  adminPassword: string;
}): Promise<{
  company: AppCompany;
  adminUser: Pick<AppUser, "id" | "name" | "username" | "role" | "company_id" | "company_name" | "company_cnpj" | "sector_id" | "sector_name" | "is_active" | "created_at">;
}> {
  await ensureAuthSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query<AppCompany>(
      `
      INSERT INTO app_companies (name, cnpj)
      VALUES ($1, $2)
      RETURNING id, name, cnpj, is_active, created_at::text, updated_at::text
      `,
      [input.companyName, input.companyCnpj || null],
    );
    const company = companyResult.rows[0];

    const sectorResult = await client.query<AppSector>(
      `
      INSERT INTO app_sectors (company_id, name)
      VALUES ($1, 'Administrativo')
      RETURNING id, company_id, name, created_at
      `,
      [company.id],
    );
    const sector = sectorResult.rows[0];

    const userResult = await client.query<any>(
      `
      INSERT INTO app_users (company_id, name, username, password_hash, role, sector_id)
      VALUES ($1, $2, lower($3), crypt($4, gen_salt('bf')), 'administrador', $5)
      RETURNING id, name, username, role, company_id, sector_id, is_active, created_at
      `,
      [company.id, input.adminName, input.adminUsername, input.adminPassword, sector.id],
    );

    await client.query('COMMIT');

    return {
      company,
      adminUser: {
        ...userResult.rows[0],
        company_name: company.name,
        company_cnpj: company.cnpj,
        sector_name: sector.name,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
