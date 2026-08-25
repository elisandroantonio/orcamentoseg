// Clona a ESTRUTURA (schema) do banco REAL para o banco de TESTE, sem
// nenhum dado. Uso: pnpm run db:teste:clonar-schema
//
// Só LÊ do banco real (SHOW TABLES / SHOW CREATE TABLE) e só ESCREVE no
// banco de teste (DROP TABLE IF EXISTS + CREATE TABLE). Nunca faz
// INSERT/UPDATE/DELETE no banco real — o código nem chama isso.
//
// Motivo de existir: drizzle-kit migrate/push ficaram presos em
// inconsistências do histórico de migrations (tabelas criadas fora do
// sistema de migrations) e em uma peculiaridade do TiDB (diff de push
// tentando recriar uma PRIMARY KEY que já existe). Copiar o "SHOW CREATE
// TABLE" direto do banco real é mais simples e 100% fiel à estrutura real.
import { config } from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Carrega o .env real primeiro (fonte, só leitura).
config({ path: path.join(projectRoot, ".env") });
const REAL_DATABASE_URL = process.env.DATABASE_URL;

// Depois carrega o .env.teste por cima, com override, pra DATABASE_URL
// passar a apontar pro banco de teste (destino, escrita) a partir daqui.
config({ path: path.join(projectRoot, ".env.teste"), override: true });
const TEST_DATABASE_URL = process.env.DATABASE_URL;

if (!REAL_DATABASE_URL || !TEST_DATABASE_URL) {
  console.error("[clone-schema] Faltou DATABASE_URL em .env ou .env.teste.");
  process.exit(1);
}

function parseConn(url) {
  const clean = url.replace(/\?.*/, "");
  const u = new URL(clean);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 4000,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "test",
    ssl: { rejectUnauthorized: true },
  };
}

const sourceConfig = parseConn(REAL_DATABASE_URL);
const targetConfig = parseConn(TEST_DATABASE_URL);

console.log(`[clone-schema] Origem (só leitura):  ${sourceConfig.host} / banco "${sourceConfig.database}"`);
console.log(`[clone-schema] Destino (escrita):    ${targetConfig.host} / banco "${targetConfig.database}"`);

if (sourceConfig.host === targetConfig.host && sourceConfig.database === targetConfig.database) {
  console.error("[clone-schema] ORIGEM E DESTINO SÃO O MESMO BANCO. Abortando por segurança.");
  process.exit(1);
}

const source = await mysql.createConnection(sourceConfig);
const target = await mysql.createConnection(targetConfig);

try {
  const [tables] = await source.query("SHOW TABLES");
  const tableNames = tables
    .map((row) => Object.values(row)[0])
    .filter((name) => name !== "__drizzle_migrations");

  console.log(`[clone-schema] ${tableNames.length} tabelas encontradas no banco real.`);

  await target.query("SET FOREIGN_KEY_CHECKS=0");

  // Idempotente: apaga o que já existe no teste antes de recriar, assim dá
  // pra rodar esse script quantas vezes precisar.
  for (const name of tableNames) {
    await target.query(`DROP TABLE IF EXISTS \`${name}\``);
  }

  for (const name of tableNames) {
    const [rows] = await source.query(`SHOW CREATE TABLE \`${name}\``);
    const createSql = rows[0]["Create Table"];
    await target.query(createSql);
    console.log(`[clone-schema] ✓ ${name}`);
  }

  await target.query("SET FOREIGN_KEY_CHECKS=1");

  console.log("[clone-schema] Concluído. Estrutura do banco de teste igual à do banco real (sem dados).");
} finally {
  await source.end();
  await target.end();
}
