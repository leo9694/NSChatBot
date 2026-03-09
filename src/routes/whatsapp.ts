import { Router } from "express";
import { requireAdmin } from "../middlewares/auth.middleware";
import {
  disconnectWhatsAppSession,
  getConnectedAccountAvatarUrl,
  getLatestQr,
  getWhatsAppConnectionStatus,
  requestWhatsAppConnect,
  requestWhatsAppHistorySync,
} from "../services/whatsapp.service";

const router = Router();

router.get("/status", (_, res) => {
  return res.status(200).json({
    whatsapp: getWhatsAppConnectionStatus(),
  });
});

router.get("/qr", (_, res) => {
  return res.status(200).json(getLatestQr());
});

router.get("/profile-avatar", async (_, res) => {
  return res.status(200).json({
    avatar_url: (await getConnectedAccountAvatarUrl()) || null,
  });
});

router.post("/connect", async (_, res) => {
  await requestWhatsAppConnect();
  return res.status(200).json({
    status: "ok",
    whatsapp: getWhatsAppConnectionStatus(),
  });
});

router.post("/disconnect", requireAdmin, async (_, res) => {
  await disconnectWhatsAppSession();
  return res.status(200).json({
    status: "ok",
    whatsapp: getWhatsAppConnectionStatus(),
  });
});

router.post("/sync-history", requireAdmin, async (_, res) => {
  await requestWhatsAppHistorySync();
  return res.status(200).json({
    status: "ok",
    whatsapp: getWhatsAppConnectionStatus(),
  });
});

export default router;
