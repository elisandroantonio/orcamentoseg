import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

/**
 * Local-only login bypass — tem dois modos de operação.
 *
 * O login original da plataforma passa pelo OAuth da Manus (ver oauth.ts),
 * que só funciona dentro da própria Manus. Essa rota substitui isso por um
 * jeito de logar sem depender de nenhum serviço externo, em dois cenários:
 *
 * 1) Desenvolvimento local (NODE_ENV != production): entra direto, sem
 *    pedir nada — é o comportamento original, feito pra ser conveniente
 *    rodando na sua própria máquina.
 * 2) Hospedagem permanente (NODE_ENV=production, ex.: Railway): como o app
 *    fica acessível por uma URL pública, entrar "direto" seria inseguro —
 *    aí a rota pede uma chave de acesso (ACCESS_KEY no .env) antes de
 *    liberar a sessão. Sem ACCESS_KEY configurada, a rota continua
 *    totalmente desligada em produção (comportamento original).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 600): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        console.warn(`[DevAuth] Tentativa ${i + 1} falhou, tentando de novo em ${delayMs}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function loginAs(req: Request, res: Response, openId: string, name?: string) {
  const existing = await withRetry(() => db.getUserByOpenId(openId));

  if (!existing) {
    await withRetry(() =>
      db.upsertUser({
        openId,
        name: name || "Usuário local",
        email: null,
        loginMethod: "local-dev",
        lastSignedIn: new Date(),
      })
    );
  } else {
    await withRetry(() =>
      db.upsertUser({
        openId,
        lastSignedIn: new Date(),
      })
    );
  }

  const sessionToken = await sdk.createSessionToken(openId, {
    name: name || existing?.name || "",
    expiresInMs: ONE_YEAR_MS,
  });

  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
  res.redirect(302, "/");
}

/** Compara em tempo constante (evita timing attack), sem exigir mesmo tamanho. */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Tela de acesso mostrada em produção (hospedagem permanente). Pede a chave
 * compartilhada (ACCESS_KEY) antes de liberar a sessão — não tem cadastro de
 * usuário, é uma senha só, como uma senha de wi-fi.
 */
function renderAccessGatePage(opts: { error?: boolean } = {}): string {
  const { error } = opts;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Acesso restrito — EG Construtora</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #05070d;
    --grid-line: rgba(110, 156, 255, 0.075);
    --grid-line-strong: rgba(110, 156, 255, 0.14);
    --panel: rgba(13, 19, 34, 0.72);
    --panel-border: rgba(120, 162, 255, 0.22);
    --accent: #4c7dff;
    --accent-soft: #8fb0ff;
    --text: #e9eef8;
    --text-muted: #8e9bbd;
    --steel: #9aa5b8;
    --danger: #ff6b6b;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    padding: 24px;
  }
  /* Papel de blueprint: grade fina + linhas de destaque a cada 5 células */
  body::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
      linear-gradient(var(--grid-line-strong) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line-strong) 1px, transparent 1px);
    background-size: 28px 28px, 28px 28px, 140px 140px, 140px 140px;
    mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 85%);
    pointer-events: none;
  }
  body::after {
    content: "";
    position: absolute;
    inset: -20%;
    background: radial-gradient(circle at 50% 15%, rgba(76, 125, 255, 0.16), transparent 55%);
    pointer-events: none;
  }

  .meta-corner {
    position: fixed;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    opacity: 0.55;
    z-index: 1;
  }
  .meta-corner.tl { top: 20px; left: 24px; }
  .meta-corner.br { bottom: 20px; right: 24px; text-align: right; }
  @media (max-width: 640px) { .meta-corner { display: none; } }

  .card {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 400px;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    padding: 40px 36px 32px;
    backdrop-filter: blur(14px);
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.02) inset;
  }
  /* marcas de canto, tipo prancha de desenho técnico */
  .card::before, .card::after,
  .corner-tr, .corner-bl {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--accent-soft);
    opacity: 0.55;
  }
  .card::before { top: -1px; left: -1px; border-right: none; border-bottom: none; }
  .card::after { bottom: -1px; right: -1px; border-left: none; border-top: none; }
  .corner-tr { top: -1px; right: -1px; border-left: none; border-bottom: none; }
  .corner-bl { bottom: -1px; left: -1px; border-right: none; border-top: none; }

  .logo {
    display: block;
    height: 54px;
    width: auto;
    margin: 0 auto 22px;
    filter: brightness(0) invert(1) drop-shadow(0 0 18px rgba(140, 170, 255, 0.25));
    opacity: 0.94;
  }

  .eyebrow {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent-soft);
    text-align: center;
    margin: 0 0 10px;
  }
  h1 {
    font-family: "Big Shoulders Display", "IBM Plex Sans", sans-serif;
    font-weight: 800;
    font-size: 30px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-align: center;
    margin: 0 0 8px;
    color: var(--text);
  }
  .subtitle {
    text-align: center;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-muted);
    margin: 0 0 28px;
  }

  form { display: flex; flex-direction: column; gap: 14px; }
  label {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--steel);
  }
  .field { display: flex; flex-direction: column; gap: 7px; }
  input[type="password"] {
    background: rgba(5, 8, 16, 0.65);
    border: 1px solid rgba(120, 142, 200, 0.28);
    border-radius: 8px;
    padding: 13px 14px;
    font-size: 15px;
    color: var(--text);
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    letter-spacing: 0.08em;
  }
  input[type="password"]:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.18);
  }
  input[type="password"]::placeholder { color: #4b5670; letter-spacing: normal; font-family: "IBM Plex Sans", sans-serif; }

  button {
    margin-top: 6px;
    background: linear-gradient(180deg, var(--accent), #3660d9);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 13px 14px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 10px 24px -8px rgba(76, 125, 255, 0.55);
    transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
  }
  button:hover { filter: brightness(1.08); box-shadow: 0 14px 30px -8px rgba(76, 125, 255, 0.7); }
  button:active { transform: translateY(1px); }

  .error {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.3);
    color: var(--danger);
    font-size: 12.5px;
    border-radius: 8px;
    padding: 10px 12px;
    animation: shake 0.4s ease;
  }
  @keyframes shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-4px); }
    40%, 60% { transform: translateX(4px); }
  }

  .footer {
    margin-top: 26px;
    padding-top: 18px;
    border-top: 1px solid rgba(120, 142, 200, 0.14);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: #4b5670;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="meta-corner tl">SISTEMA&nbsp;DE&nbsp;ORÇAMENTOS&nbsp;DE&nbsp;OBRA<br/>EG&nbsp;PROJETOS&nbsp;E&nbsp;CONSULTORIA&nbsp;EM&nbsp;CONSTRUÇÕES</div>
  <div class="meta-corner br">PROJ&nbsp;EG-ORC&nbsp;·&nbsp;ACESSO&nbsp;RESTRITO<br/>REV&nbsp;02</div>

  <div class="card">
    <div class="corner-tr"></div>
    <div class="corner-bl"></div>
    <img class="logo" src="/logo-eg.png" alt="EG Construtora" />
    <p class="eyebrow">Sistema de orçamentos de obra</p>
    <h1>Acesso restrito</h1>
    <p class="subtitle">Esta plataforma reúne orçamentos e dados de clientes da EG Construtora. Informe a chave de acesso pra continuar.</p>
    <form method="POST" action="/api/dev-login">
      <div class="field">
        <label for="chave">Chave de acesso</label>
        <input id="chave" name="chave" type="password" placeholder="••••••••••••" autofocus required autocomplete="current-password" />
      </div>
      ${error ? `<div class="error">Chave incorreta. Confira e tente de novo.</div>` : ""}
      <button type="submit">Entrar</button>
    </form>
    <div class="footer">
      <span>EG Construtora</span>
      <span>Projetos · Consultoria · Construções</span>
    </div>
  </div>
</body>
</html>`;
}

export function registerDevAuthRoute(app: Express) {
  // --- Desenvolvimento local: comportamento original, sem senha ---
  if (!ENV.isProduction) {
    app.get("/api/dev-login", async (req: Request, res: Response) => {
      try {
        const explicitOpenId = req.query.openId as string | undefined;
        if (explicitOpenId) {
          await loginAs(req, res, explicitOpenId);
          return;
        }

        if (ENV.ownerOpenId) {
          await loginAs(req, res, ENV.ownerOpenId);
          return;
        }

        const users = await withRetry(() => db.getAllUsers());

        if (users.length === 1) {
          await loginAs(req, res, users[0].openId, users[0].name ?? undefined);
          return;
        }

        if (users.length === 0) {
          await loginAs(req, res, "local-dev:elisandro@construtoraeg.com.br", "Elisandro");
          return;
        }

        // Multiple users found and no OWNER_OPEN_ID configured — don't guess,
        // let Elisandro pick the right one.
        const rows = users
          .map(
            u => `<li style="margin-bottom:8px">
              <a href="/api/dev-login?openId=${encodeURIComponent(u.openId)}">
                ${u.name || "(sem nome)"} — ${u.email || "sem e-mail"} — openId: ${u.openId}
              </a>
            </li>`
          )
          .join("\n");

        res.status(200).send(`
          <html><body style="font-family: sans-serif; padding: 24px;">
            <h2>Login local — mais de um usuário encontrado</h2>
            <p>Clique em qual conta é a sua (a que tem os orçamentos de verdade):</p>
            <ul>${rows}</ul>
          </body></html>
        `);
      } catch (error) {
        console.error("[DevAuth] Local login failed", error);
        res
          .status(500)
          .send(
            `<html><body style="font-family: sans-serif; padding: 24px;">
              <h2>Instabilidade temporária de conexão com o banco</h2>
              <p>Isso costuma ser passageiro (a plataforma roda local, mas o banco de dados fica na nuvem). Aguarde alguns segundos e tente de novo:</p>
              <p><a href="/api/dev-login">Tentar novamente</a></p>
            </body></html>`
          );
      }
    });
    return;
  }

  // --- Produção (hospedagem permanente): exige uma das ACCESS_KEY(s) configuradas ---
  // Duas chaves independentes (ex.: uma sua, uma da sua esposa) — qualquer
  // uma das duas libera o acesso, à mesma conta.
  const validAccessKeys = [ENV.accessKey, ENV.accessKey2].filter(Boolean);
  if (validAccessKeys.length === 0) return; // nenhuma chave configurada, rota fica desligada (comportamento original)

  app.get("/api/dev-login", (_req: Request, res: Response) => {
    res.status(200).send(renderAccessGatePage());
  });

  app.post("/api/dev-login", async (req: Request, res: Response) => {
    const submitted = typeof req.body?.chave === "string" ? req.body.chave : "";
    const isValid = submitted && validAccessKeys.some(key => safeEqual(submitted, key));

    if (!isValid) {
      // Pequeno atraso proposital: dificulta tentativa automatizada de força bruta.
      await new Promise(resolve => setTimeout(resolve, 500));
      res.status(401).send(renderAccessGatePage({ error: true }));
      return;
    }

    if (!ENV.ownerOpenId) {
      res
        .status(500)
        .send(
          `<html><body style="font-family: sans-serif; padding: 24px;">
            <h2>OWNER_OPEN_ID não configurado</h2>
            <p>A chave está certa, mas falta configurar OWNER_OPEN_ID nas variáveis de ambiente pra saber qual conta abrir.</p>
          </body></html>`
        );
      return;
    }

    try {
      await loginAs(req, res, ENV.ownerOpenId);
    } catch (error) {
      console.error("[DevAuth] Login (produção) falhou", error);
      res
        .status(500)
        .send(
          `<html><body style="font-family: sans-serif; padding: 24px;">
            <h2>Instabilidade temporária de conexão com o banco</h2>
            <p>Aguarde alguns segundos e tente de novo:</p>
            <p><a href="/api/dev-login">Tentar novamente</a></p>
          </body></html>`
        );
    }
  });
}
