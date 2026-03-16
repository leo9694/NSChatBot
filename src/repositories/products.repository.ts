import { pool } from "../db/pool";

export interface ProductRow {
  id: string;
  name: string;
  type: "product" | "service";
  description: string | null;
  price: string;
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
          name VARCHAR(180) NOT NULL,
          type VARCHAR(20) NOT NULL DEFAULT 'product',
          description TEXT,
          price NUMERIC(12, 2) NOT NULL DEFAULT 0,
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
        ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'product'
      `);
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS description TEXT
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(lower(name));
        CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
      `);
    })().catch((error) => {
      ensureProductsSchemaPromise = null;
      throw error;
    });
  }

  await ensureProductsSchemaPromise;
}

export async function createProduct(input: {
  name: string;
  type: "product" | "service";
  description?: string | null;
  price: number;
  stock: number;
  imageUrl?: string | null;
  createdBy?: string | null;
}): Promise<ProductRow> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    INSERT INTO products (name, type, description, price, stock, image_url, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id,
      name,
      type,
      description,
      price::text,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    `,
    [input.name, input.type, input.description || null, input.price, input.stock, input.imageUrl || null, input.createdBy || null],
  );

  return result.rows[0];
}

export async function updateProduct(input: {
  id: string;
  name: string;
  type: "product" | "service";
  description?: string | null;
  price: number;
  stock: number;
  imageUrl?: string | null;
}): Promise<ProductRow | null> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    UPDATE products
    SET
      name = $2,
      type = $3,
      description = $4,
      price = $5,
      stock = $6,
      image_url = COALESCE($7, image_url),
      updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      name,
      type,
      description,
      price::text,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    `,
    [input.id, input.name, input.type, input.description || null, input.price, input.stock, input.imageUrl || null],
  );

  return result.rows[0] || null;
}

export async function listProducts(): Promise<ProductRow[]> {
  await ensureProductsSchema();
  const result = await pool.query<ProductRow>(
    `
    SELECT
      id,
      name,
      type,
      description,
      price::text,
      stock,
      image_url,
      is_active,
      created_at::text,
      updated_at::text
    FROM products
    WHERE is_active = true
    ORDER BY created_at DESC, name ASC
    `,
  );

  return result.rows;
}

export async function listProductsForAgentContext(): Promise<Array<{ name: string; type: string; description: string | null; price: string; stock: number; image_url: string | null }>> {
  await ensureProductsSchema();
  const result = await pool.query(
    `
    SELECT name, type, description, price::text, stock, image_url
    FROM products
    WHERE is_active = true
    ORDER BY name ASC
    `,
  );

  return result.rows;
}

export async function listProductsForAgentDetailedContext(): Promise<Array<{
  id: string;
  name: string;
  type: string;
  description: string | null;
  price: string;
  stock: number;
  image_url: string | null;
}>> {
  await ensureProductsSchema();
  const result = await pool.query(
    `
    SELECT id, name, type, description, price::text, stock, image_url
    FROM products
    WHERE is_active = true
    ORDER BY name ASC
    `,
  );

  return result.rows;
}
