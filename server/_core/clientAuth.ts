import { randomBytes, timingSafeEqual } from "node:crypto";
import { scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { CLIENT_COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";

const scrypt = promisify(scryptCb);

/**
 * Login próprio do portal do cliente (Diário de Obras) — email/senha,
 * separado do login da equipe interna (sdk.ts / devAuth.ts). Sem OAuth,
 * sem depender de nenhum serviço externo: hash de senha com scrypt
 * (nativo do Node, sem dependência nova) e sessão em JWT assinado com o
 * mesmo segredo (JWT_SECRET) já usado pela sessão da equipe, mas num
 * cookie e formato de payload diferentes — não dá pra confundir as duas
 * sessões nem usar uma no lugar da outra.
 */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function getSecretKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET não configurado — necessário para login do portal do cliente.");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function createClientSessionToken(clientUserId: number): Promise<string> {
  return new SignJWT({ clientUserId, kind: "client_portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + THIRTY_DAYS_MS) / 1000))
    .sign(getSecretKey());
}

export async function verifyClientSessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.kind !== "client_portal" || typeof payload.clientUserId !== "number") return null;
    return payload.clientUserId;
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

/** Usado pelo tRPC context — lê o cookie da requisição e resolve o client_user, se válido. */
export async function authenticateClientRequest(req: Request): Promise<db.ClientUserRecord | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.get(CLIENT_COOKIE_NAME);
  if (!token) return null;

  const clientUserId = await verifyClientSessionToken(token);
  if (!clientUserId) return null;

  const clientUser = await db.getClientUserById(clientUserId);
  if (!clientUser || !clientUser.isActive) return null;
  return clientUser;
}

export function registerClientAuthRoutes(app: Express) {
  app.post("/api/client-portal/login", async (req: Request, res: Response) => {
    const login = typeof (req.body?.login ?? req.body?.email) === "string" ? String(req.body.login ?? req.body.email).trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!login || !password) {
      res.status(400).json({ error: "Informe usuário e senha." });
      return;
    }

    // Pequeno atraso proposital independente do resultado — dificulta
    // enumeração de e-mail cadastrado via timing.
    const start = Date.now();
    try {
      const clientUser = await db.getClientUserByLogin(login);
      const passwordOk = clientUser ? await verifyPassword(password, clientUser.passwordHash) : false;

      if (!clientUser || !clientUser.isActive || !passwordOk) {
        console.warn(
          `[ClientAuth] Login recusado para "${login}": ${
            !clientUser ? "usuário não encontrado" : !clientUser.isActive ? "login inativo" : "senha não confere"
          }`
        );
        const elapsed = Date.now() - start;
        if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
        res.status(401).json({ error: "Usuário ou senha incorretos." });
        return;
      }

      await db.touchClientUserLastSignedIn(clientUser.id);
      const token = await createClientSessionToken(clientUser.id);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(CLIENT_COOKIE_NAME, token, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });
      res.json({ ok: true, name: clientUser.name, username: clientUser.username });
    } catch (error) {
      console.error("[ClientAuth] Login falhou", error);
      res.status(500).json({ error: "Instabilidade temporária. Tente de novo em alguns segundos." });
    }
  });

  app.post("/api/client-portal/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(CLIENT_COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  });
}
