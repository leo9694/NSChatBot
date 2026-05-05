import express from "express";
import fs from "fs";
import path from "path";
import { env } from "./config/env";
import { describeActiveDatabaseTarget, pool } from "./db/pool";
import { requireAuth } from "./middlewares/auth.middleware";
import { ensureAuthSchema } from "./repositories/auth.repository";
import { cleanupInvalidConversations, finalizeInactiveAiConversations, finalizeInactiveAssignedConversations } from "./repositories/conversations.repository";
import authRoutes from "./routes/auth";
import aiRoutes from "./routes/ai";
import { processDueScheduleReminders } from "./routes/ai";
import conversationRoutes from "./routes/conversations";
import healthRoutes from "./routes/health";
import bulkDispatchRoutes from "./routes/bulk-dispatch";
import messageRoutes from "./routes/messages";
import companyMediaRoutes from "./routes/company-media";
import internalChatRoutes from "./routes/internal-chat";
import productRoutes from "./routes/products";
import realtimeRoutes from "./routes/realtime";
import whatsappRoutes from "./routes/whatsapp";
import { getMediaBlob, syncLocalMediaDirectoryToDatabase } from "./services/media.service";
import { startKnownWhatsAppSessions } from "./services/whatsapp.service";
import { resumePendingBulkDispatchJobs } from "./services/bulk-dispatch.service";

const app = express();
const mediaDir = path.resolve(process.cwd(), "storage", "media");
const uploadJsonLimit = "70mb";

app.use(express.json({ limit: uploadJsonLimit }));
app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "Arquivo muito grande. Envie arquivos de ate 40 MB.",
    });
  }
  return next(error);
});

app.use(healthRoutes);
app.use("/auth", authRoutes);
app.use("/media", express.static(mediaDir));
app.get("/media/:fileName", (req, res) => {
  void (async () => {
  const fileName = path.basename(String(req.params.fileName || ""));
  const localPath = path.join(mediaDir, fileName);

  if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
  }

    const blob = await getMediaBlob(fileName);
    if (blob) {
      if (blob.mimeType) {
        res.setHeader("Content-Type", blob.mimeType);
      }
      return res.send(blob.content);
    }

  if (env.mediaFallbackBaseUrl) {
      return res.redirect(`${env.mediaFallbackBaseUrl}/media/${encodeURIComponent(fileName)}`);
  }

    return res.status(404).json({ error: "Midia nao encontrada." });
  })().catch((error) => {
    console.error("Erro ao servir midia:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Falha ao servir midia." });
    }
  });
});
app.use("/app", express.static(path.resolve(process.cwd(), "web")));
app.get("/", (_, res) => {
  res.redirect("/app");
});
app.use(requireAuth);
app.use("/ai", aiRoutes);
app.use("/messages", messageRoutes);
app.use("/company-media", companyMediaRoutes);
app.use("/internal-chat", internalChatRoutes);
app.use("/products", productRoutes);
app.use("/conversations", conversationRoutes);
app.use("/bulk-dispatch", bulkDispatchRoutes);
app.use("/realtime", realtimeRoutes);
app.use("/whatsapp", whatsappRoutes);
app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.code === "LIMIT_FILE_SIZE" || error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "Arquivo muito grande. Envie arquivos de ate 40 MB.",
    });
  }
  return next(error);
});

app.listen(env.port, async () => {
  try {
    await pool.query("SELECT 1");
    await ensureAuthSchema();
    const cleanup = await cleanupInvalidConversations();
    await startKnownWhatsAppSessions();
    await resumePendingBulkDispatchJobs();
    void processDueScheduleReminders().catch((error) => {
      console.error("Falha ao processar lembretes de agendamento na inicialização:", error);
    });
    setInterval(() => {
      void processDueScheduleReminders().catch((error) => {
        console.error("Falha ao processar lembretes de agendamento:", error);
      });
    }, 60_000);
    setInterval(() => {
      void finalizeInactiveAiConversations(24).catch((error) => {
        console.error("Falha ao finalizar conversas inativas do agente:", error);
      });
      void finalizeInactiveAssignedConversations(24).catch((error) => {
        console.error("Falha ao finalizar atendimentos humanos inativos:", error);
      });
    }, 60_000);
    syncLocalMediaDirectoryToDatabase()
      .then((result) => {
        if (result.synced > 0) {
          console.log(`Media sync: ${result.synced} arquivo(s) enviados para o banco.`);
        }
      })
      .catch((error) => {
        console.error("Falha ao sincronizar midia local para o banco:", error);
      });
    console.log(`API running on port ${env.port}`);
    console.log("Database connection: OK");
    console.log(`Database target: ${describeActiveDatabaseTarget()}`);
    if (cleanup.conversations > 0 || cleanup.messages > 0) {
      console.log(`Cleanup invalid conversations: ${cleanup.conversations} conversa(s), ${cleanup.messages} mensagem(ns).`);
    }
  } catch (error) {
    console.error("Database connection failed on startup:", error);
  }
});
