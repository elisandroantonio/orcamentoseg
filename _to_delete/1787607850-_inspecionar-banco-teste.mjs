// Só leitura — verifica o que são essas 221 linhas encontradas no banco
// "test" (esperávamos vazio). Não altera nada.
import mysql2 from "mysql2/promise";

const HOST = "gateway01.sa-east-1.prod.aws.tidbcloud.com";
const USER = "3m4Z5HddmfH7n6h.root";
const PASSWORD = "TKzEGbWg6aCiuqok";
const DB = "test";

const conn = await mysql2.createConnection({
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DB,
  ssl: { rejectUnauthorized: true },
});

const [tables] = await conn.query("SHOW TABLES");
const tableNames = tables.map((row) => Object.values(row)[0]).filter((n) => n !== "__drizzle_migrations");

console.log("Contagem de linhas por tabela (só as com dados):\n");
for (const name of tableNames) {
  const [[{ n }]] = await conn.query(`SELECT COUNT(*) as n FROM \`${name}\``);
  if (n > 0) console.log(`  ${name}: ${n}`);
}

console.log("\n--- Detalhe: budgets ---");
try {
  const [rows] = await conn.query(
    "SELECT id, title, totalCost, createdAt, updatedAt FROM budgets ORDER BY id LIMIT 30"
  );
  for (const r of rows) console.log(" ", JSON.stringify(r));
} catch (e) {
  console.log("  (erro ou vazio:", e.message, ")");
}

console.log("\n--- Detalhe: clients ---");
try {
  const [rows] = await conn.query("SELECT id, name, createdAt FROM clients ORDER BY id LIMIT 30");
  for (const r of rows) console.log(" ", JSON.stringify(r));
} catch (e) {
  console.log("  (erro ou vazio:", e.message, ")");
}

console.log("\n--- Detalhe: users ---");
try {
  const [rows] = await conn.query("SELECT id, name, email, openId, createdAt FROM users ORDER BY id LIMIT 10");
  for (const r of rows) console.log(" ", JSON.stringify(r));
} catch (e) {
  console.log("  (erro ou vazio:", e.message, ")");
}

await conn.end();
