import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { FIELD_COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { verifyPassword } from "./clientAuth";
import * as db from "../db";

/**
 * Login de campo (mestre/encarregado) — um e-mail/senha POR OBRA, que só
 * permite alimentar o Diário de Obras daquela obra. Sessão própria (cookie
 * field_session_id, JWT com kind "field_diary"): não dá pra usar no lugar da
 * sessão da equipe nem do portal do cliente, e vice-versa.
 */

function getSecretKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET não configurado — necessário para login de campo.");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function createFieldSessionToken(fieldUserId: number): Promise<string> {
  return new SignJWT({ fieldUserId, kind: "field_diary" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + THIRTY_DAYS_MS) / 1000))
    .sign(getSecretKey());
}

async function verifyFieldSessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.kind !== "field_diary" || typeof payload.fieldUserId !== "number") return null;
    return payload.fieldUserId;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) map.set(key, decodeURIComponent(value));
  }
  return map;
}

/** Usado pelo tRPC context e pela rota de fotos — resolve o field_user da requisição, se válido. */
export async function authenticateFieldRequest(req: Request): Promise<db.FieldUserRecord | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.get(FIELD_COOKIE_NAME);
  if (!token) return null;

  const fieldUserId = await verifyFieldSessionToken(token);
  if (!fieldUserId) return null;

  const fieldUser = await db.getFieldUserById(fieldUserId);
  if (!fieldUser || !fieldUser.isActive) return null;
  return fieldUser;
}

export function registerFieldAuthRoutes(app: Express) {
  app.post("/api/field-diary/login", async (req: Request, res: Response) => {
    const login = typeof (req.body?.login ?? req.body?.email) === "string" ? String(req.body.login ?? req.body.email).trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!login || !password) {
      res.status(400).json({ error: "Informe usuário e senha." });
      return;
    }

    const start = Date.now();
    try {
      const fieldUser = await db.getFieldUserByLogin(login);
      const passwordOk = fieldUser ? await verifyPassword(password, fieldUser.passwordHash) : false;

      if (!fieldUser || !fieldUser.isActive || !passwordOk) {
        const elapsed = Date.now() - start;
        if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
        res.status(401).json({ error: "Usuário ou senha incorretos." });
        return;
      }

      await db.touchFieldUserLastSignedIn(fieldUser.id);
      const token = await createFieldSessionToken(fieldUser.id);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(FIELD_COOKIE_NAME, token, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });
      res.json({ ok: true, name: fieldUser.name, username: fieldUser.username });
    } catch (error) {
      console.error("[FieldAuth] Login falhou", error);
      res.status(500).json({ error: "Instabilidade temporária. Tente de novo em alguns segundos." });
    }
  });

  app.post("/api/field-diary/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(FIELD_COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  });
}
