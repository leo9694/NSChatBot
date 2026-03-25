import { readFile } from "fs/promises";
import path from "path";
import { pool } from "./pool";

async function run() {
  const sqlPath = path.resolve(process.cwd(), "sql", "init.sql");
  const sql = await readFile(sqlPath, "utf8");

  await pool.query(sql);
  console.log("Migration finished successfully.");
}

run()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });