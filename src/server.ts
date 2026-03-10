import express from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env";
import { pool } from "./db/pool";
import { requireAuth } from "./middlewares/auth.middleware";
import { ensureAuthSchema } from "./repositories/auth.repository";
import { cleanupInvalidConversations } from "./repositories/conversations.repository";
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
const mediaDir = path.resolve(process.cwd(), "storage", "media");

app.use(express.json({ limit: "25mb" }));

app.use(healthRoutes);
app.use("/auth", authRoutes);
app.use("/media", express.static(mediaDir));
app.get("/media/:fileName", (req, res) => {
  const fileName = path.basename(String(req.params.fileName || ""));
  const localPath = path.join(mediaDir, fileName);

  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }

  if (env.mediaFallbackBaseUrl) {
    return res.redirect(`${env.mediaFallbackBaseUrl}/media/${encodeURIComponent(fileName)}`);
  }

  return res.status(404).json({ error: "Midia nao encontrada." });
});
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

app.listen(env.port, async () => {
  try {
    await pool.query("SELECT 1");
    await ensureAuthSchema();
    const cleanup = await cleanupInvalidConversations();
    await startWhatsAppSession();
    await resumePendingBulkDispatchJobs();
    console.log(`API running on port ${env.port}`);
    console.log("Database connection: OK");
    if (cleanup.conversations > 0 || cleanup.messages > 0) {
      console.log(`Cleanup invalid conversations: ${cleanup.conversations} conversa(s), ${cleanup.messages} mensagem(ns).`);
    }
  } catch (error) {
    console.error("Database connection failed on startup:", error);
  }
});
