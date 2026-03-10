import { NextFunction, Request, Response } from "express";
import { getSessionUserByToken } from "../repositories/auth.repository";

const SESSION_COOKIE_NAME = "nschat_session";

type AuthRequest = Request & {
  authUser?: {
    id: string;
    name: string;
    username: string;
    role: "administrador" | "operador";
  };
  authSessionId?: string;
};

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function getSessionCookieToken(req: Request): string {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || "";
}

export function getSessionHeaderToken(req: Request): string {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const rawHeaderToken = req.headers["x-session-token"];
  if (typeof rawHeaderToken === "string" && rawHeaderToken.trim()) {
    return rawHeaderToken.trim();
  }

  return "";
}

export function getSessionQueryToken(req: Request): string {
  const queryToken = req.query?.session_token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  return "";
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const secure = process.env.NODE_ENV === "production";
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production";
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

  if (secure) {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthRequest;
  try {
    // Prioriza token enviado no header para permitir sessoes simultaneas por aba/usuario.
    const token = getSessionHeaderToken(authReq) || getSessionQueryToken(authReq) || getSessionCookieToken(authReq);
    if (!token) {
      return res.status(401).json({ error: "Sessao invalida. Faca login novamente." });
    }

    const session = await getSessionUserByToken(token);
    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Sessao expirada. Faca login novamente." });
    }

    authReq.authUser = session.user;
    authReq.authSessionId = session.sessionId;
    return next();
  } catch (error: any) {
    return res.status(500).json({
      error: "Falha ao validar sessao.",
      details: error?.message || "Unknown error",
    });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthRequest;
  if (!authReq.authUser) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  if (authReq.authUser.role !== "administrador") {
    return res.status(403).json({ error: "Permissao negada." });
  }
  return next();
}
