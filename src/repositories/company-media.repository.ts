import { pool } from "../db/pool";

export type CompanyMediaKind = "image" | "video" | "audio" | "document";

export interface CompanyMediaAssetRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  media_url: string;
  mime_type: string | null;
  file_name: string | null;
  media_kind: CompanyMediaKind;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

let ensureCompanyMediaSchemaPromise: Promise<void> | null = null;

export async function ensureCompanyMediaSchema(): Promise<void> {
  if (!ensureCompanyMediaSchemaPromise) {
    ensureCompanyMediaSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS company_media_assets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES app_companies(id) ON DELETE CASCADE,
          title VARCHAR(180) NOT NULL,
          description TEXT,
          media_url TEXT NOT NULL,
          mime_type TEXT,
          file_name TEXT,
          media_kind VARCHAR(20) NOT NULL DEFAULT 'document',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        ALTER TABLE company_media_assets
        ADD COLUMN IF NOT EXISTS description TEXT
      `);
      await pool.query(`
        ALTER TABLE company_media_assets
        ADD COLUMN IF NOT EXISTS mime_type TEXT
      `);
      await pool.query(`
        ALTER TABLE company_media_assets
        ADD COLUMN IF NOT EXISTS file_name TEXT
      `);
      await pool.query(`
        ALTER TABLE company_media_assets
        ADD COLUMN IF NOT EXISTS media_kind VARCHAR(20) NOT NULL DEFAULT 'document'
      `);
      await pool.query(`
        ALTER TABLE company_media_assets
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
      `);
      await pool.query(`
        ALTER TABLE company_media_assets
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES app_users(id) ON DELETE SET NULL
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_company_media_assets_company_id
        ON company_media_assets(company_id, is_active, created_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_company_media_assets_kind
        ON company_media_assets(company_id, media_kind)
      `);
    })().catch((error) => {
      ensureCompanyMediaSchemaPromise = null;
      throw error;
    });
  }

  await ensureCompanyMediaSchemaPromise;
}

function mapRow(row: any): CompanyMediaAssetRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    title: String(row.title || ""),
    description: row.description ? String(row.description) : null,
    media_url: String(row.media_url || ""),
    mime_type: row.mime_type ? String(row.mime_type) : null,
    file_name: row.file_name ? String(row.file_name) : null,
    media_kind: String(row.media_kind || "document") as CompanyMediaKind,
    is_active: Boolean(row.is_active),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function listCompanyMediaAssets(companyId: string): Promise<CompanyMediaAssetRow[]> {
  await ensureCompanyMediaSchema();
  const result = await pool.query(
    `
    SELECT
      id,
      company_id,
      title,
      description,
      media_url,
      mime_type,
      file_name,
      media_kind,
      is_active,
      created_by,
      created_at::text,
      updated_at::text
    FROM company_media_assets
    WHERE company_id = $1
    ORDER BY is_active DESC, created_at DESC
    `,
    [companyId],
  );
  return result.rows.map(mapRow);
}

export async function listCompanyMediaAssetsForAgentContext(companyId: string): Promise<CompanyMediaAssetRow[]> {
  await ensureCompanyMediaSchema();
  const result = await pool.query(
    `
    SELECT
      id,
      company_id,
      title,
      description,
      media_url,
      mime_type,
      file_name,
      media_kind,
      is_active,
      created_by,
      created_at::text,
      updated_at::text
    FROM company_media_assets
    WHERE company_id = $1
      AND is_active = true
    ORDER BY created_at DESC
    `,
    [companyId],
  );
  return result.rows.map(mapRow);
}

export async function getCompanyMediaAssetById(
  assetId: string,
  companyId?: string | null,
): Promise<CompanyMediaAssetRow | null> {
  await ensureCompanyMediaSchema();
  const params: Array<string> = [assetId];
  let where = `id = $1`;
  if (companyId) {
    params.push(companyId);
    where += ` AND company_id = $2`;
  }
  const result = await pool.query(
    `
    SELECT
      id,
      company_id,
      title,
      description,
      media_url,
      mime_type,
      file_name,
      media_kind,
      is_active,
      created_by,
      created_at::text,
      updated_at::text
    FROM company_media_assets
    WHERE ${where}
    LIMIT 1
    `,
    params,
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createCompanyMediaAsset(input: {
  companyId: string;
  title: string;
  description?: string | null;
  mediaUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
  mediaKind: CompanyMediaKind;
  createdBy?: string | null;
}): Promise<CompanyMediaAssetRow> {
  await ensureCompanyMediaSchema();
  const result = await pool.query(
    `
    INSERT INTO company_media_assets (
      company_id,
      title,
      description,
      media_url,
      mime_type,
      file_name,
      media_kind,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      company_id,
      title,
      description,
      media_url,
      mime_type,
      file_name,
      media_kind,
      is_active,
      created_by,
      created_at::text,
      updated_at::text
    `,
    [
      input.companyId,
      input.title,
      input.description || null,
      input.mediaUrl,
      input.mimeType || null,
      input.fileName || null,
      input.mediaKind,
      input.createdBy || null,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function updateCompanyMediaAsset(input: {
  id: string;
  companyId: string;
  title: string;
  description?: string | null;
  fileName?: string | null;
}): Promise<CompanyMediaAssetRow | null> {
  await ensureCompanyMediaSchema();
  const result = await pool.query(
    `
    UPDATE company_media_assets
    SET
      title = $3,
      description = $4,
      file_name = $5,
      updated_at = NOW()
    WHERE id = $1
      AND company_id = $2
    RETURNING
      id,
      company_id,
      title,
      description,
      media_url,
      mime_type,
      file_name,
      media_kind,
      is_active,
      created_by,
      created_at::text,
      updated_at::text
    `,
    [
      input.id,
      input.companyId,
      input.title,
      input.description || null,
      input.fileName || null,
    ],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteCompanyMediaAsset(input: {
  id: string;
  companyId: string;
}): Promise<boolean> {
  await ensureCompanyMediaSchema();
  const result = await pool.query(
    `
    DELETE FROM company_media_assets
    WHERE id = $1
      AND company_id = $2
    `,
    [input.id, input.companyId],
  );
  return Number(result.rowCount || 0) > 0;
}
