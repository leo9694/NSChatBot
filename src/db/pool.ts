import { Pool } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

export function describeActiveDatabaseTarget() {
  return env.databaseTarget;
}
