// Sincroniza o schema (drizzle/schema.ts) com o banco de TESTE (.env.teste),
// nunca com o banco real. Uso: pnpm run db:teste:migrar (já configurado no
// package.json).
//
// Usa "drizzle-kit push" em vez de "drizzle-kit migrate": o histórico de
// migrations em drizzle/*.sql está incompleto em relação ao schema real
// (algumas tabelas, como budget_items, foram criadas por scripts avulsos
// fora do sistema de migrations). O push ignora o histórico e sincroniza
// direto a partir do schema.ts, que é a fonte da verdade atual.
//
// Carrega .env.teste de forma explícita (por caminho resolvido), em vez de
// depender de DOTENV_CONFIG_PATH — isso evita cair silenciosamente no .env
// real caso essa variável não seja respeitada em alguma combinação de
// ferramentas.
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envTestePath = path.join(projectRoot, ".env.teste");

const result = config({ path: envTestePath, override: true });

if (result.error) {
  console.error(
    `[migrate-teste] Não encontrei ${envTestePath}. Siga o guia COMO-CRIAR-BANCO-TESTE.md primeiro (copie .env.teste.example para .env.teste e preencha).`
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[migrate-teste] DATABASE_URL está vazio em .env.teste. Preencha antes de continuar.");
  process.exit(1);
}

const host = new URL(process.env.DATABASE_URL.replace(/\?.*/, "")).host;
console.log(`[migrate-teste] Arquivo carregado: ${envTestePath}`);
console.log(`[migrate-teste] Host de destino: ${host}`);
console.log(
  `[migrate-teste] CONFIRME que esse host é o do cluster de TESTE (não deve ser o mesmo host do .env real).`
);

console.log("[migrate-teste] Executando: npx drizzle-kit push (não é mais 'migrate')");

const migrateResult = spawnSync("npx", ["--yes", "drizzle-kit", "push"], {
  stdio: "inherit",
  env: process.env,
  cwd: projectRoot,
});

process.exit(migrateResult.status ?? 1);
