import { Router } from "express";
import {
  authenticateUser,
  createCompanyWithAdmin,
  deactivateUser,
  createUser,
  createUserSession,
  createSector,
  ensureAuthSchema,
  getCompanyBranding,
  listCompanies,
  listSectors,
  listUsers,
  revokeSessionByToken,
  updateCompanyBranding,
  updateUser,
} from "../repositories/auth.repository";
import {
  clearSessionCookie,
  requireCEO,
  getSessionCookieToken,
  getSessionHeaderToken,
  requireAdmin,
  requireAuth,
  setSessionCookie,
} from "../middlewares/auth.middleware";

const router = Router();
type AuthRequest = Parameters<typeof requireAuth>[0] & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "ceo" | "administrador" | "operador";
    company_id?: string | null;
    company_name?: string | null;
    company_cnpj?: string | null;
    sector_id?: string | null;
    sector_name?: string | null;
  };
};

router.post("/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!username || !password) {
    return res.status(400).json({ error: "Informe usuario e senha." });
  }

  await ensureAuthSchema();
  const user = await authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({ error: "Usuario ou senha invalidos." });
  }

  const { token, expiresAt } = await createUserSession({
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || null,
    daysValid: 7,
  });

  setSessionCookie(res, token, expiresAt);
  return res.status(200).json({
    status: "ok",
    user,
    session_token: token,
    expires_at: expiresAt.toISOString(),
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  const token = getSessionHeaderToken(req) || getSessionCookieToken(req);
  await revokeSessionByToken(token);
  clearSessionCookie(res);
  return res.status(200).json({ status: "ok" });
});

router.get("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  return res.status(200).json({
    user: authReq.authUser,
  });
});

router.get("/company-branding", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  const branding = await getCompanyBranding(authReq.authUser.company_id);
  return res.status(200).json({
    branding: branding || {
      company_id: authReq.authUser.company_id,
      logo_data_url: null,
      palette_options: [],
      selected_palette_index: -1,
      selected_palette: null,
    },
  });
});

router.put("/company-branding", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  try {
    const branding = await updateCompanyBranding({
      companyId: authReq.authUser.company_id,
      logoDataUrl: req.body?.logo_data_url || null,
      paletteOptions: req.body?.palette_options,
      selectedPaletteIndex: req.body?.selected_palette_index,
    });
    if (!branding) {
      return res.status(404).json({ error: "Empresa nao encontrada." });
    }
    return res.status(200).json({ status: "ok", branding });
  } catch (error: any) {
    if (error?.message === "INVALID_COMPANY_LOGO_DATA_URL") {
      return res.status(400).json({ error: "Logo invalida. Envie uma imagem PNG, JPG ou WEBP." });
    }
    return res.status(400).json({
      error: "Falha ao salvar a identidade visual da empresa.",
      details: error?.message || "Unknown error",
    });
  }
});

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  const users = await listUsers(authReq.authUser.company_id);
  return res.status(200).json({ items: users });
});

router.get("/agents", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  const users = await listUsers(authReq.authUser.company_id);
  return res.status(200).json({
    items: users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      sector_id: user.sector_id,
      sector_name: user.sector_name,
    })),
  });
});

router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const name = String(req.body?.name || "").trim();
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const sectorId = String(req.body?.sector_id || "").trim();
  const role = String(req.body?.role || "").trim() as "ceo" | "administrador" | "operador";

  if (!name || !username || !password || !role || !sectorId) {
    return res.status(400).json({ error: "Informe nome, usuario, senha, cargo e setor." });
  }

  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }

  if (!["ceo", "administrador", "operador"].includes(role)) {
    return res.status(400).json({ error: "Cargo invalido." });
  }
  if (role === "ceo" && authReq.authUser.role !== "ceo") {
    return res.status(403).json({ error: "Somente um CEO pode conceder cargo de CEO." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const user = await createUser({
      companyId: authReq.authUser.company_id,
      name,
      username,
      password,
      role,
      sectorId,
    });
    return res.status(201).json({ status: "ok", user });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ja existe usuario com esse login." });
    }
    if (error?.code === "23503" || error?.code === "SECTOR_NOT_IN_COMPANY") {
      return res.status(400).json({ error: "Setor informado nao existe para esta empresa." });
    }
    return res.status(500).json({
      error: "Falha ao criar usuario.",
      details: error?.message || "Unknown error",
    });
  }
});

router.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const userId = String(req.params?.id || "").trim();
  const name = String(req.body?.name || "").trim();
  const username = String(req.body?.username || "").trim().toLowerCase();
  const role = String(req.body?.role || "").trim() as "ceo" | "administrador" | "operador";
  const sectorId = String(req.body?.sector_id || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!userId) {
    return res.status(400).json({ error: "Usuario invalido." });
  }
  if (!name || !username || !role || !sectorId) {
    return res.status(400).json({ error: "Informe nome, usuario, cargo e setor." });
  }
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  if (!["ceo", "administrador", "operador"].includes(role)) {
    return res.status(400).json({ error: "Cargo invalido." });
  }
  if (role === "ceo" && authReq.authUser.role !== "ceo") {
    return res.status(403).json({ error: "Somente um CEO pode conceder cargo de CEO." });
  }
  if (password && password.length < 6) {
    return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
  }
  if (authReq.authUser?.id === userId && role !== authReq.authUser.role) {
    return res.status(400).json({ error: "Voce nao pode remover seu proprio cargo atual." });
  }

  try {
    const user = await updateUser({
      id: userId,
      companyId: authReq.authUser.company_id,
      name,
      username,
      role,
      sectorId,
      password: password || undefined,
    });

    if (!user) {
      return res.status(404).json({ error: "Usuario nao encontrado." });
    }

    return res.status(200).json({ status: "ok", user });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ja existe usuario com esse login." });
    }
    if (error?.code === "23503" || error?.code === "SECTOR_NOT_IN_COMPANY") {
      return res.status(400).json({ error: "Setor informado nao existe para esta empresa." });
    }
    return res.status(500).json({
      error: "Falha ao editar usuario.",
      details: error?.message || "Unknown error",
    });
  }
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const userId = String(req.params?.id || "").trim();
  if (!userId) {
    return res.status(400).json({ error: "Usuario invalido." });
  }
  if (authReq.authUser?.id === userId) {
    return res.status(400).json({ error: "Voce nao pode excluir seu proprio usuario." });
  }
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }

  try {
    const ok = await deactivateUser(userId, authReq.authUser.company_id);
    if (!ok) {
      return res.status(404).json({ error: "Usuario nao encontrado." });
    }
    return res.status(200).json({ status: "ok" });
  } catch (error: any) {
    return res.status(500).json({
      error: "Falha ao excluir usuario.",
      details: error?.message || "Unknown error",
    });
  }
});

router.get("/sectors", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }
  const items = await listSectors(authReq.authUser.company_id);
  return res.status(200).json({ items });
});

router.post("/sectors", requireAuth, requireAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Informe o nome do setor." });
  }
  if (!authReq.authUser?.company_id) {
    return res.status(400).json({ error: "Usuario sem empresa vinculada." });
  }

  try {
    const sector = await createSector(name, authReq.authUser.company_id);
    return res.status(201).json({ status: "ok", sector });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ja existe setor com esse nome." });
    }
    return res.status(500).json({
      error: "Falha ao criar setor.",
      details: error?.message || "Unknown error",
    });
  }
});

router.get("/companies", requireAuth, requireCEO, async (_req, res) => {
  const items = await listCompanies();
  return res.status(200).json({ items });
});

router.post("/companies", requireAuth, requireCEO, async (req, res) => {
  const companyName = String(req.body?.company_name || "").trim();
  const companyCnpj = String(req.body?.company_cnpj || "").trim();
  const adminName = String(req.body?.admin_name || "").trim();
  const adminUsername = String(req.body?.admin_username || "").trim().toLowerCase();
  const adminPassword = String(req.body?.admin_password || "").trim();

  if (!companyName || !adminName || !adminUsername || !adminPassword) {
    return res.status(400).json({
      error: "Informe nome da empresa, nome do administrador, login e senha do administrador.",
    });
  }
  if (adminPassword.length < 6) {
    return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const created = await createCompanyWithAdmin({
      companyName,
      companyCnpj: companyCnpj || null,
      adminName,
      adminUsername,
      adminPassword,
    });
    return res.status(201).json({ status: "ok", ...created });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ja existe empresa, CNPJ ou usuario administrador com esses dados." });
    }
    return res.status(500).json({
      error: "Falha ao criar empresa.",
      details: error?.message || "Unknown error",
    });
  }
});

export default router;
