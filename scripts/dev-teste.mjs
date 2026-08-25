// Sobe o servidor apontando pro banco de TESTE (.env.teste), nunca pro
// banco real. Uso: pnpm run dev:teste (já configurado no package.json).
//
// Carrega .env.teste de forma explícita (por caminho resolvido) e injeta
// tudo no processo ANTES de subir o tsx watch, em vez de depender de
// DOTENV_CONFIG_PATH — isso evita cair silenciosamente no .env real.
import { config } from "dotenv";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envTestePath = path.join(projectRoot, ".env.teste");

const result = config({ path: envTestePath, override: true });

if (result.error) {
  console.error(
    `[dev:teste] Não encontrei ${envTestePath}. Siga o guia COMO-CRIAR-BANCO-TESTE.md primeiro (copie .env.teste.example para .env.teste e preencha).`
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[dev:teste] DATABASE_URL está vazio em .env.teste. Preencha antes de continuar.");
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.PORT = process.env.PORT || "3001";

const host = new URL(process.env.DATABASE_URL.replace(/\?.*/, "")).host;
console.log(`[dev:teste] Arquivo carregado: ${envTestePath}`);
console.log(`[dev:teste] Host de destino: ${host}`);
console.log(`[dev:teste] Porta preferida: ${process.env.PORT}`);
console.log(
  `[dev:teste] CONFIRME que esse host é o do cluster de TESTE (não deve ser o mesmo host do .env real).`
);

const child = spawn("npx", ["--yes", "tsx", "watch", "server/_core/index.ts"], {
  stdio: "inherit",
  env: process.env,
  cwd: projectRoot,
});

child.on("exit", (code) => process.exit(code ?? 0));
