import { Router } from "express";
import { getWhatsAppConnectionStatus } from "../services/whatsapp.service";

const router = Router();

router.get("/health", (_, res) => {
  return res.status(200).json({
    status: "ok",
    service: "nschatbot-api",
    timestamp: new Date().toISOString(),
    whatsapp: getWhatsAppConnectionStatus(),
  });
});

export default router;
