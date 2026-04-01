import multer from "multer";
import { Router } from "express";
import {
  createCompanyMediaAsset,
  deleteCompanyMediaAsset,
  ensureCompanyMediaSchema,
  listCompanyMediaAssets,
  updateCompanyMediaAsset,
  type CompanyMediaKind,
} from "../repositories/company-media.repository";
import { saveMediaBuffer } from "../services/media.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
});

type AuthRequest = Express.Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "ceo" | "administrador" | "operador";
    company_id?: string | null;
  };
};

function detectMediaKind(mimeType: string, fileName: string): CompanyMediaKind {
  const mime = String(mimeType || "").trim().toLowerCase();
  const file = String(fileName || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".png") || file.endsWith(".webp") || file.endsWith(".gif")) return "image";
  if (file.endsWith(".mp4") || file.endsWith(".mov") || file.endsWith(".webm")) return "video";
  if (file.endsWith(".mp3") || file.endsWith(".ogg") || file.endsWith(".wav") || file.endsWith(".m4a") || file.endsWith(".aac") || file.endsWith(".opus")) return "audio";
  return "document";
}

router.get("/", async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }

  const items = await listCompanyMediaAssets(authReq.authUser.company_id);
  return res.status(200).json({ items });
});

router.post("/", upload.single("file"), async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    await ensureCompanyMediaSchema();
    if (!authReq.authUser?.company_id) {
      return res.status(401).json({ error: "Sessao invalida." });
    }
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const displayFileName = String(req.body?.file_name || "").trim();
    const file = req.file;
    if (!title) {
      return res.status(400).json({ error: "Informe o nome da midia." });
    }
    if (!description) {
      return res.status(400).json({ error: "Informe uma descricao para a midia." });
    }
    if (!file?.buffer) {
      return res.status(400).json({ error: "Selecione um arquivo para enviar." });
    }

    const mediaUrl = await saveMediaBuffer({
      buffer: file.buffer,
      mimeType: file.mimetype || "application/octet-stream",
      fileName: file.originalname || "arquivo",
    });

    const asset = await createCompanyMediaAsset({
      companyId: authReq.authUser.company_id,
      title,
      description,
      mediaUrl,
      mimeType: file.mimetype || "application/octet-stream",
      fileName: displayFileName || file.originalname || "arquivo",
      mediaKind: detectMediaKind(file.mimetype || "", file.originalname || ""),
      createdBy: authReq.authUser.id || null,
    });

    return res.status(201).json({ status: "ok", asset });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao cadastrar midia.",
    });
  }
});

router.patch("/:assetId", async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    await ensureCompanyMediaSchema();
    if (!authReq.authUser?.company_id) {
      return res.status(401).json({ error: "Sessao invalida." });
    }

    const assetId = String(req.params.assetId || "").trim();
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const fileName = String(req.body?.file_name || "").trim();

    if (!assetId) {
      return res.status(400).json({ error: "Midia invalida." });
    }
    if (!title) {
      return res.status(400).json({ error: "Informe o nome da midia." });
    }
    if (!description) {
      return res.status(400).json({ error: "Informe uma descricao para a midia." });
    }
    if (!fileName) {
      return res.status(400).json({ error: "Informe o nome do arquivo." });
    }

    const asset = await updateCompanyMediaAsset({
      id: assetId,
      companyId: authReq.authUser.company_id,
      title,
      description,
      fileName,
    });

    if (!asset) {
      return res.status(404).json({ error: "Midia nao encontrada." });
    }

    return res.status(200).json({ status: "ok", asset });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar a midia.",
    });
  }
});

router.delete("/:assetId", async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }

  const assetId = String(req.params.assetId || "").trim();
  if (!assetId) {
    return res.status(400).json({ error: "Midia invalida." });
  }

  try {
    const deleted = await deleteCompanyMediaAsset({
      id: assetId,
      companyId: authReq.authUser.company_id,
    });
    if (!deleted) {
      return res.status(404).json({ error: "Midia nao encontrada." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir midia.",
    });
  }
});

export default router;
