import express from "express";
import path from "node:path";
import { env } from "./config/env";
import { pool } from "./db/pool";
import { requireAuth } from "./middlewares/auth.middleware";
import { ensureAuthSchema } from "./repositories/auth.repository";
import authRoutes from "./routes/auth";
import conversationRoutes from "./routes/conversations";
import healthRoutes from "./routes/health";
import bulkDispatchRoutes from "./routes/bulk-dispatch";
import messageRoutes from "./routes/messages";
import realtimeRoutes from "./routes/realtime";
import whatsappRoutes from "./routes/whatsapp";
import { startWhatsAppSession } from "./services/whatsapp.service";
import { resumePendingBulkDispatchJobs } from "./services/bulk-dispatch.service";

const app = express();

app.use(express.json({ limit: "25mb" }));

app.use(healthRoutes);
app.use("/auth", authRoutes);
app.use("/app", express.static(path.resolve(process.cwd(), "web")));
app.get("/", (_, res) => {
  res.redirect("/app");
});
app.use(requireAuth);
app.use("/messages", messageRoutes);
app.use("/conversations", conversationRoutes);
app.use("/bulk-dispatch", bulkDispatchRoutes);
app.use("/realtime", realtimeRoutes);
app.use("/whatsapp", whatsappRoutes);
app.use("/media", express.static(path.resolve(process.cwd(), "storage", "media")));

app.listen(env.port, async () => {
  try {
    await pool.query("SELECT 1");
    await ensureAuthSchema();
    await startWhatsAppSession();
    await resumePendingBulkDispatchJobs();
    console.log(`API running on port ${env.port}`);
    console.log("Database connection: OK");
  } catch (error) {
    console.error("Database connection failed on startup:", error);
  }
});
