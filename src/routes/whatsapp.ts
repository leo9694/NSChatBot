import { rm } from "node:fs/promises";
import { Request, Router } from "express";
import { requireAdmin } from "../middlewares/auth.middleware";
import {
  createPendingWhatsAppAccount,
  deleteWhatsAppAccount,
  ensureWhatsAppAccountSessionPath,
  getWhatsAppAccountById,
  getUserSelectedWhatsAppAccount,
  getUserSelectedWhatsAppAccountWithDetails,
  listWhatsAppAccounts,
  setUserSelectedWhatsAppAccount,
} from "../repositories/accounts.repository";
import {
  disconnectWhatsAppSession,
  getConnectedAccountAvatarUrl,
  getCurrentWhatsAppAccount,
  listConnectedWhatsAppAccounts,
  getLatestQr,
  getWhatsAppConnectionStatus,
  requestWhatsAppConnect,
  requestWhatsAppHistorySync,
} from "../services/whatsapp.service";

const router = Router();
type AuthRequest = Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "administrador" | "operador";
    sector_id?: string | null;
    sector_name?: string | null;
  };
};

router.get("/status", async (req, res) => {
  const authReq = req as AuthRequest;
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const status = getWhatsAppConnectionStatus(selected?.wa_jid || null, selected?.session_path || null);
  const connected = getCurrentWhatsAppAccount(selected?.wa_jid || null, selected?.session_path || null);

  if (selected?.wa_jid && (!connected.waJid || selected.wa_jid !== connected.waJid)) {
    return res.status(200).json({
      whatsapp: {
        ...status,
        connected: false,
        userId: selected.wa_jid,
        userPhone: selected.phone || null,
        userName: selected.display_name || null,
      },
    });
  }

  return res.status(200).json({
    whatsapp: status,
  });
});

router.get("/accounts", async (req, res) => {
  const authReq = req as AuthRequest;
  const accounts = await listWhatsAppAccounts();
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const connectedAccounts = new Set(listConnectedWhatsAppAccounts().map((item) => item.waJid));

  return res.status(200).json({
    items: accounts.map((item) => ({
      ...item,
      connected: connectedAccounts.has(item.wa_jid),
      selected: Boolean(selected?.selected_account_id) && selected?.selected_account_id === item.id,
    })),
    selected_account_id: selected?.selected_account_id || null,
    connected_account_jid: getCurrentWhatsAppAccount(selected?.wa_jid || null, selected?.session_path || null).waJid || null,
  });
});

router.get("/selected-account", async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }

  const selected = await getUserSelectedWhatsAppAccount(authReq.authUser.id);
  return res.status(200).json({
    selected_account_id: selected?.selected_account_id || null,
  });
});

router.post("/selected-account", async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.id) {
    return res.status(401).json({ error: "Sessao invalida." });
  }

  const accountId = String(req.body?.account_id || "").trim() || null;

  try {
    const selected = await setUserSelectedWhatsAppAccount(authReq.authUser.id, accountId);
    return res.status(200).json({
      status: "ok",
      selected_account_id: selected.selected_account_id || null,
    });
  } catch (error: any) {
    if (error?.message === "WHATSAPP_ACCOUNT_NOT_FOUND") {
      return res.status(404).json({ error: "Conta WhatsApp nao encontrada." });
    }
    throw error;
  }
});

router.get("/qr", async (req, res) => {
  const authReq = req as AuthRequest;
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const sessionPath = selected?.session_path || null;
  const connected = getCurrentWhatsAppAccount(selected?.wa_jid || null, sessionPath);

  if (selected?.wa_jid && connected.waJid && selected.wa_jid !== connected.waJid) {
    return res.status(200).json({
      qr: null,
      updatedAt: null,
    });
  }

  return res.status(200).json(getLatestQr(selected?.wa_jid || null, sessionPath));
});

router.get("/profile-avatar", async (req, res) => {
  const authReq = req as AuthRequest;
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const connected = getCurrentWhatsAppAccount(selected?.wa_jid || null, selected?.session_path || null);

  if (selected?.wa_jid && connected.waJid && selected.wa_jid !== connected.waJid) {
    return res.status(200).json({
      avatar_url: null,
    });
  }

  return res.status(200).json({
    avatar_url: (await getConnectedAccountAvatarUrl(selected?.wa_jid || null, selected?.session_path || null)) || null,
  });
});

router.post("/accounts/provision", requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const displayName = String(req.body?.display_name || "").trim() || "Novo numero";
  const account = await createPendingWhatsAppAccount(displayName);

  if (authReq.authUser?.id) {
    await setUserSelectedWhatsAppAccount(authReq.authUser.id, account.id);
  }

  return res.status(201).json({
    status: "ok",
    item: account,
  });
});

router.delete("/accounts/:accountId", requireAdmin, async (req, res) => {
  const accountId = String(req.params.accountId || "").trim();
  if (!accountId) {
    return res.status(400).json({ error: "Conta WhatsApp invalida." });
  }

  const account = await getWhatsAppAccountById(accountId);
  if (!account) {
    return res.status(404).json({ error: "Conta WhatsApp nao encontrada." });
  }

  if (account.session_path) {
    await disconnectWhatsAppSession(account.session_path);
  }

  const deleted = await deleteWhatsAppAccount(accountId);
  if (!deleted) {
    return res.status(404).json({ error: "Conta WhatsApp nao encontrada." });
  }

  if (deleted.session_path) {
    await rm(deleted.session_path, { recursive: true, force: true }).catch(() => undefined);
  }

  return res.status(200).json({
    status: "ok",
    item: deleted,
  });
});

router.post("/connect", async (req, res) => {
  const authReq = req as AuthRequest;
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const sessionPath = selected?.selected_account_id ? await ensureWhatsAppAccountSessionPath(selected.selected_account_id) : undefined;
  await requestWhatsAppConnect(sessionPath);
  return res.status(200).json({
    status: "ok",
    whatsapp: getWhatsAppConnectionStatus(selected?.wa_jid || null, sessionPath || null),
  });
});

router.post("/disconnect", requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const connected = getCurrentWhatsAppAccount(selected?.wa_jid || null, selected?.session_path || null);
  if (selected?.wa_jid && connected.waJid && selected.wa_jid !== connected.waJid) {
    return res.status(409).json({ error: "A conta selecionada nao esta conectada nesta sessao ativa." });
  }
  await disconnectWhatsAppSession(selected?.session_path || undefined);
  return res.status(200).json({
    status: "ok",
    whatsapp: getWhatsAppConnectionStatus(selected?.wa_jid || null, selected?.session_path || null),
  });
});

router.post("/sync-history", requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const selected = authReq.authUser?.id ? await getUserSelectedWhatsAppAccountWithDetails(authReq.authUser.id) : null;
  const sessionPath = selected?.selected_account_id ? await ensureWhatsAppAccountSessionPath(selected.selected_account_id) : undefined;
  await requestWhatsAppHistorySync(sessionPath);
  return res.status(200).json({
    status: "ok",
    whatsapp: getWhatsAppConnectionStatus(selected?.wa_jid || null, sessionPath || null),
  });
});

export default router;
