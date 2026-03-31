import { Request, Router } from "express";
import {
  createBulkDispatchJob,
  deleteBulkDispatchJob,
  getBulkDispatchJob,
  listBulkDispatchJobs,
  stopBulkDispatchJob,
} from "../services/bulk-dispatch.service";

const router = Router();
type AuthRequest = Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "ceo" | "administrador" | "operador";
    company_id?: string | null;
    sector_id?: string | null;
    sector_name?: string | null;
  };
};

router.post("/jobs", async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const message = String(req.body?.message || "").trim();
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messageBlocks = Array.isArray(req.body?.message_blocks) ? req.body.message_blocks : [];
    const intervalMinSeconds = Number(req.body?.interval_min_seconds || 0);
    const intervalMaxSeconds = Number(req.body?.interval_max_seconds || 0);
    const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    const enableAiAgent = Boolean(req.body?.enable_ai_agent);

    const created = await createBulkDispatchJob({
      userId: authReq.authUser?.id || null,
      companyId: authReq.authUser?.company_id || null,
      message,
      messages,
      messageBlocks,
      intervalMinSeconds,
      intervalMaxSeconds,
      contacts,
      enableAiAgent,
    });

    return res.status(201).json({
      status: "ok",
      job_id: created.jobId,
      total: created.total,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao criar disparo em massa.",
    });
  }
});

router.get("/jobs", async (req, res) => {
  const authReq = req as AuthRequest;
  const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));
  const jobs = await listBulkDispatchJobs(limit, authReq.authUser?.company_id || null);
  return res.status(200).json({ items: jobs });
});

router.get("/jobs/:jobId", async (req, res) => {
  const authReq = req as AuthRequest;
  const data = await getBulkDispatchJob(req.params.jobId, authReq.authUser?.company_id || null);
  if (!data) {
    return res.status(404).json({ error: "Disparo nao encontrado." });
  }
  return res.status(200).json(data);
});

router.patch("/jobs/:jobId/stop", async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    await stopBulkDispatchJob(req.params.jobId, authReq.authUser?.company_id || null);
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    if (error instanceof Error && error.message === "DISPATCH_NOT_FOUND") {
      return res.status(404).json({ error: "Disparo nao encontrado." });
    }
    throw error;
  }
});

router.delete("/jobs/:jobId", async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const ok = await deleteBulkDispatchJob(req.params.jobId, authReq.authUser?.company_id || null);
    if (!ok) {
      return res.status(404).json({ error: "Disparo nao encontrado." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir disparo.",
    });
  }
});

export default router;
