import { pool } from "../db/pool";

export interface ProductRow {
  id: string;
  company_id?: string | null;
  name: string;
  group_name: string | null;
  type: "product" | "service";
  description: string | null;
  price: string;
  discount_enabled: boolean;
  discount_price: string | null;
  schedule_enabled: boolean;
  service_duration_minutes: number | null;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

let ensureProductsSchemaPromise: Promise<void> | null = null;

export async function ensureProductsSchema(): Promise<void> {
  if (!ensureProductsSchemaPromise) {
    ensureProductsSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE,
          name VARCHAR(180) NOT NULL,
          group_name VARCHAR(120),
          type VARCHAR(20) NOT NULL DEFAULT 'product',
          description TEXT,
          price NUMERIC(12, 2) NOT NULL DEFAULT 0,
          discount_enabled BOOLEAN NOT NULL DEFAULT false,
          discount_price NUMERIC(12, 2),
          schedule_enabled BOOLEAN NOT NULL DEFAULT false,
          service_duration_minutes INTEGER,
          stock INTEGER NOT NULL DEFAULT 0,
          image_url TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app_companies(id) ON DELETE CASCADE
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS group_name VARCHAR(120)
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'product'
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS description TEXT
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS discount_enabled BOOLEAN NOT NULL DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS discount_price NUMERIC(12, 2)
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS service_duration_minutes INTEGER
      `);

      await pool.query(`
        UPDATE products p
        SET company_id = c.id
        FROM app_companies c
        WHERE p.company_id IS NULL
          AND lower(c.name) = lower('Empresa Principal')
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(lower(name));
        CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
        CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
      `);
    })().catch((error) => {
      ensureProductsSchemaPromise = null;
      throw error;
    });
  }

  await ensureProductsSchemaPromise;
}

export async function createProduct(input: {
  companyId: string;
  name: string;
  groupName?: string | null;
  isActive?: boolean;
  type: "product" | "service";
  description?: string | null;
  price: number;
  discountEnabled?: boolean;
  discountPrice?: number | null;
  scheduleEnabled?: boolean;
  serviceDurationMinutes?: number | null;
  stock: number;
  imageUrl?: string | null;
  createdBy?: string | null;
}): Promise<ProductRow> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    INSERT INTO products (
      company_id,
      name,
      group_name,
      is_active,
      type,
      description,
      price,
      discount_enabled,
      discount_price,
      schedule_enabled,
      service_duration_minutes,
      stock,
      image_url,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING
      id,
      company_id,
      name,
      group_name,
      type,
      description,
      price::text,
      discount_enabled,
      discount_price::text,
      schedule_enabled,
      service_duration_minutes,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    `,
    [
      input.companyId,
      input.name,
      input.groupName || null,
      input.isActive !== false,
      input.type,
      input.description || null,
      input.price,
      Boolean(input.discountEnabled),
      input.discountEnabled ? input.discountPrice ?? null : null,
      input.type === "service" ? Boolean(input.scheduleEnabled) : false,
      input.type === "service" ? (Number.isFinite(Number(input.serviceDurationMinutes)) ? Math.max(1, Math.round(Number(input.serviceDurationMinutes))) : null) : null,
      input.stock,
      input.imageUrl || null,
      input.createdBy || null,
    ],
  );

  return result.rows[0];
}

export async function updateProduct(input: {
  id: string;
  companyId: string;
  name: string;
  groupName?: string | null;
  isActive?: boolean;
  type: "product" | "service";
  description?: string | null;
  price: number;
  discountEnabled?: boolean;
  discountPrice?: number | null;
  scheduleEnabled?: boolean;
  serviceDurationMinutes?: number | null;
  stock: number;
  imageUrl?: string | null;
}): Promise<ProductRow | null> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    UPDATE products
    SET
      name = $2,
      group_name = $3,
      is_active = $4,
      type = $5,
      description = $6,
      price = $7,
      discount_enabled = $8,
      discount_price = $9,
      schedule_enabled = $10,
      service_duration_minutes = $11,
      stock = $12,
      image_url = COALESCE($13, image_url),
      updated_at = NOW()
    WHERE id = $1
      AND company_id = $14
    RETURNING
      id,
      company_id,
      name,
      group_name,
      type,
      description,
      price::text,
      discount_enabled,
      discount_price::text,
      schedule_enabled,
      service_duration_minutes,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    `,
    [
      input.id,
      input.name,
      input.groupName || null,
      input.isActive !== false,
      input.type,
      input.description || null,
      input.price,
      Boolean(input.discountEnabled),
      input.discountEnabled ? input.discountPrice ?? null : null,
      input.type === "service" ? Boolean(input.scheduleEnabled) : false,
      input.type === "service" ? (Number.isFinite(Number(input.serviceDurationMinutes)) ? Math.max(1, Math.round(Number(input.serviceDurationMinutes))) : null) : null,
      input.stock,
      input.imageUrl || null,
      input.companyId,
    ],
  );

  return result.rows[0] || null;
}

export async function listProducts(companyId?: string | null): Promise<ProductRow[]> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    SELECT
      id,
      company_id,
      name,
      group_name,
      type,
      description,
      price::text,
      discount_enabled,
      discount_price::text,
      schedule_enabled,
      service_duration_minutes,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    FROM products
    WHERE ($1::uuid IS NULL OR company_id = $1)
    ORDER BY group_name ASC NULLS LAST, created_at DESC, name ASC
    `,
    [companyId || null],
  );

  return result.rows;
}

export async function setProductActiveStatus(input: {
  id: string;
  companyId: string;
  isActive: boolean;
}): Promise<ProductRow | null> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    UPDATE products
    SET
      is_active = $3,
      updated_at = NOW()
    WHERE id = $1
      AND company_id = $2
    RETURNING
      id,
      company_id,
      name,
      group_name,
      type,
      description,
      price::text,
      discount_enabled,
      discount_price::text,
      schedule_enabled,
      service_duration_minutes,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    `,
    [input.id, input.companyId, input.isActive],
  );

  return result.rows[0] || null;
}

export async function deleteProduct(input: {
  id: string;
  companyId: string;
}): Promise<boolean> {
  await ensureProductsSchema();
  const result = await pool.query(
    `
    DELETE FROM products
    WHERE id = $1
      AND company_id = $2
    `,
    [input.id, input.companyId],
  );

  return (result.rowCount || 0) > 0;
}

export async function listProductsForAgentContext(companyId?: string | null): Promise<Array<{
  name: string;
  group_name: string | null;
  type: string;
  description: string | null;
  price: string;
  discount_enabled: boolean;
  discount_price: string | null;
  schedule_enabled: boolean;
  service_duration_minutes: number | null;
  stock: number;
  image_url: string | null;
}>> {
  await ensureProductsSchema();
  const result = await pool.query(
    `
    SELECT name, group_name, type, description, price::text, discount_enabled, discount_price::text, schedule_enabled, service_duration_minutes, stock, image_url
    FROM products
    WHERE is_active = true
      AND ($1::uuid IS NULL OR company_id = $1)
    ORDER BY group_name ASC NULLS LAST, name ASC
    `,
    [companyId || null],
  );

  return result.rows;
}

export async function listProductsForAgentDetailedContext(companyId?: string | null): Promise<Array<{
  id: string;
  company_id?: string | null;
  name: string;
  group_name: string | null;
  type: string;
  description: string | null;
  price: string;
  discount_enabled: boolean;
  discount_price: string | null;
  schedule_enabled: boolean;
  service_duration_minutes: number | null;
  stock: number;
  image_url: string | null;
}>> {
  await ensureProductsSchema();
  const result = await pool.query(
    `
    SELECT id, company_id, name, group_name, type, description, price::text, discount_enabled, discount_price::text, schedule_enabled, service_duration_minutes, stock, image_url
    FROM products
    WHERE is_active = true
      AND ($1::uuid IS NULL OR company_id = $1)
    ORDER BY group_name ASC NULLS LAST, name ASC
    `,
    [companyId || null],
  );

  return result.rows;
}
