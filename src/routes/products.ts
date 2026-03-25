import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { Router } from "express";
import { createProduct, deleteProduct, ensureProductsSchema, listProducts, setProductActiveStatus, updateProduct } from "../repositories/products.repository";

const router = Router();
const mediaDir = path.resolve(process.cwd(), "storage", "media");
const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(mediaDir, { recursive: true });
    cb(null, mediaDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || "")).trim() || ".png";
    cb(null, `product_${Date.now()}_${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_PRODUCT_IMAGE_MIME_TYPES.has(mimeType)) {
      cb(new Error("A imagem do produto deve estar em JPG, JPEG ou PNG."));
      return;
    }
    cb(null, true);
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

function parseDiscountInput(body: any, basePrice: number) {
  const discountEnabled = String(body?.discount_enabled || "").trim() === "true";
  const discountPriceRaw = String(body?.discount_price || "").trim();
  const discountPrice = discountEnabled && discountPriceRaw ? Number(discountPriceRaw) : null;

  if (!discountEnabled) {
    return { discountEnabled: false, discountPrice: null };
  }

  if (!Number.isFinite(discountPrice) || Number(discountPrice) < 0) {
    throw new Error("Informe um desconto válido.");
  }

  if (Number(discountPrice) >= basePrice) {
    throw new Error("O preço com desconto deve ser menor que o preço base.");
  }

  return { discountEnabled: true, discountPrice: Number(discountPrice) };
}

function parseScheduleInput(body: any, type: "product" | "service") {
  const scheduleEnabled = type === "service" && String(body?.schedule_enabled || "").trim() === "true";
  const durationRaw = String(body?.service_duration_minutes || "").trim();
  const durationMinutes = scheduleEnabled && durationRaw ? Number(durationRaw) : null;

  if (!scheduleEnabled) {
    return { scheduleEnabled: false, serviceDurationMinutes: null };
  }

  if (!Number.isFinite(durationMinutes) || Number(durationMinutes) <= 0) {
    throw new Error("Informe um tempo médio válido em minutos.");
  }

  return {
    scheduleEnabled: true,
    serviceDurationMinutes: Math.round(Number(durationMinutes)),
  };
}

router.get("/", async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  const items = await listProducts(authReq.authUser?.company_id || null);
  return res.status(200).json({ items });
});

router.post("/", upload.single("image"), async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    await ensureProductsSchema();

    const name = String(req.body?.name || "").trim();
    const groupName = String(req.body?.group_name || "").trim();
    const isActive = String(req.body?.is_active ?? "true").trim() !== "false";
    const type = String(req.body?.type || "product").trim() === "service" ? "service" : "product";
    const description = String(req.body?.description || "").trim();
    const price = Number(req.body?.price || 0);
    const stock = type === "service" ? 0 : Number(req.body?.stock || 0);

    if (!name) {
      return res.status(400).json({ error: "Informe o nome do produto." });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Informe um preço válido." });
    }

    if (!Number.isFinite(stock) || stock < 0) {
      return res.status(400).json({ error: "Informe um estoque válido." });
    }

    const { discountEnabled, discountPrice } = parseDiscountInput(req.body, price);
    const { scheduleEnabled, serviceDurationMinutes } = parseScheduleInput(req.body, type);
    const imageUrl = req.file?.filename ? `/media/${req.file.filename}` : null;
    if (!authReq.authUser?.company_id) {
      return res.status(400).json({ error: "Usuario sem empresa vinculada." });
    }
    const product = await createProduct({
      companyId: authReq.authUser.company_id,
      name,
      groupName,
      isActive,
      type,
      description,
      price,
      discountEnabled,
      discountPrice,
      scheduleEnabled,
      serviceDurationMinutes,
      stock: Math.floor(stock),
      imageUrl,
      createdBy: authReq.authUser?.id || null,
    });

    return res.status(201).json({ status: "ok", product });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao cadastrar produto.",
    });
  }
});

router.put("/:productId", upload.single("image"), async (req, res) => {
  const authReq = req as AuthRequest;
  const productId = String(req.params.productId || "").trim();
  try {
    await ensureProductsSchema();

    const name = String(req.body?.name || "").trim();
    const groupName = String(req.body?.group_name || "").trim();
    const isActive = String(req.body?.is_active ?? "true").trim() !== "false";
    const type = String(req.body?.type || "product").trim() === "service" ? "service" : "product";
    const description = String(req.body?.description || "").trim();
    const price = Number(req.body?.price || 0);
    const stock = type === "service" ? 0 : Number(req.body?.stock || 0);

    if (!productId) {
      return res.status(400).json({ error: "Produto inválido." });
    }
    if (!name) {
      return res.status(400).json({ error: "Informe o nome do produto." });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Informe um preço válido." });
    }
    if (!Number.isFinite(stock) || stock < 0) {
      return res.status(400).json({ error: "Informe um estoque válido." });
    }

    const { discountEnabled, discountPrice } = parseDiscountInput(req.body, price);
    const { scheduleEnabled, serviceDurationMinutes } = parseScheduleInput(req.body, type);
    const imageUrl = req.file?.filename ? `/media/${req.file.filename}` : null;
    if (!authReq.authUser?.company_id) {
      return res.status(400).json({ error: "Usuario sem empresa vinculada." });
    }
    const product = await updateProduct({
      id: productId,
      companyId: authReq.authUser.company_id,
      name,
      groupName,
      isActive,
      type,
      description,
      price,
      discountEnabled,
      discountPrice,
      scheduleEnabled,
      serviceDurationMinutes,
      stock: Math.floor(stock),
      imageUrl,
    });

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado." });
    }

    return res.status(200).json({ status: "ok", product });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar produto.",
    });
  }
});

router.patch("/:productId/active", async (req, res) => {
  const authReq = req as AuthRequest;
  const productId = String(req.params.productId || "").trim();
  const isActive = String(req.body?.is_active ?? "").trim();

  if (!authReq.authUser?.company_id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!productId) {
    return res.status(400).json({ error: "Produto inválido." });
  }
  if (!["true", "false"].includes(isActive)) {
    return res.status(400).json({ error: "Informe um status válido para o produto." });
  }

  try {
    const product = await setProductActiveStatus({
      id: productId,
      companyId: authReq.authUser.company_id,
      isActive: isActive === "true",
    });
    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado." });
    }
    return res.status(200).json({ status: "ok", product });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar status do produto.",
    });
  }
});

router.delete("/:productId", async (req, res) => {
  const authReq = req as AuthRequest;
  const productId = String(req.params.productId || "").trim();

  if (!authReq.authUser?.company_id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (!productId) {
    return res.status(400).json({ error: "Produto inválido." });
  }

  try {
    const deleted = await deleteProduct({
      id: productId,
      companyId: authReq.authUser.company_id,
    });
    if (!deleted) {
      return res.status(404).json({ error: "Produto não encontrado." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir produto.",
    });
  }
});

export default router;

