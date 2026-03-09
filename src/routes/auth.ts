import { Router } from "express";
import {
  authenticateUser,
  deactivateUser,
  createUser,
  createUserSession,
  createSector,
  ensureAuthSchema,
  listSectors,
  listUsers,
  revokeSessionByToken,
  updateUser,
} from "../repositories/auth.repository";
import {
  clearSessionCookie,
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
    role: "administrador" | "operador";
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

router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await listUsers();
  return res.status(200).json({ items: users });
});

router.get("/agents", requireAuth, async (_req, res) => {
  const users = await listUsers();
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
  const name = String(req.body?.name || "").trim();
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const sectorId = String(req.body?.sector_id || "").trim();
  const role = String(req.body?.role || "").trim() as "administrador" | "operador";

  if (!name || !username || !password || !role || !sectorId) {
    return res.status(400).json({ error: "Informe nome, usuario, senha, cargo e setor." });
  }

  if (!["administrador", "operador"].includes(role)) {
    return res.status(400).json({ error: "Cargo invalido." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const user = await createUser({ name, username, password, role, sectorId });
    return res.status(201).json({ status: "ok", user });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ja existe usuario com esse login." });
    }
    if (error?.code === "23503") {
      return res.status(400).json({ error: "Setor informado nao existe." });
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
  const role = String(req.body?.role || "").trim() as "administrador" | "operador";
  const sectorId = String(req.body?.sector_id || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!userId) {
    return res.status(400).json({ error: "Usuario invalido." });
  }
  if (!name || !username || !role || !sectorId) {
    return res.status(400).json({ error: "Informe nome, usuario, cargo e setor." });
  }
  if (!["administrador", "operador"].includes(role)) {
    return res.status(400).json({ error: "Cargo invalido." });
  }
  if (password && password.length < 6) {
    return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
  }
  if (authReq.authUser?.id === userId && role !== "administrador") {
    return res.status(400).json({ error: "Voce nao pode remover seu proprio cargo de administrador." });
  }

  try {
    const user = await updateUser({
      id: userId,
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
    if (error?.code === "23503") {
      return res.status(400).json({ error: "Setor informado nao existe." });
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

  try {
    const ok = await deactivateUser(userId);
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

router.get("/sectors", requireAuth, requireAdmin, async (_req, res) => {
  const items = await listSectors();
  return res.status(200).json({ items });
});

router.post("/sectors", requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Informe o nome do setor." });
  }

  try {
    const sector = await createSector(name);
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

export default router;
