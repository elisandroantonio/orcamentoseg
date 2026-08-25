// Cria o banco "orcamento_producao" no MESMO cluster (sua conta TiDB Cloud,
// ORCAMENTO-TESTE) e clona pra lá a estrutura das tabelas que já existe no
// banco "test" (criada por uma sessão anterior). Não mexe em dados (o banco
// "test" já está vazio) — só estrutura. Idempotente: pode rodar de novo sem
// problema.
import mysql2 from "mysql2/promise";

const HOST = "gateway01.sa-east-1.prod.aws.tidbcloud.com";
const USER = "3m4Z5HddmfH7n6h.root";
const PASSWORD = "TKzEGbWg6aCiuqok";
const SOURCE_DB = "test";
const TARGET_DB = "orcamento_producao";

const admin = await mysql2.createConnection({
  host: HOST,
  user: USER,
  password: PASSWORD,
  ssl: { rejectUnauthorized: true },
});

console.log(`Criando banco "${TARGET_DB}" (se ainda não existir)...`);
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\``);

const source = await mysql2.createConnection({
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: SOURCE_DB,
  ssl: { rejectUnauthorized: true },
});
const target = await mysql2.createConnection({
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: TARGET_DB,
  ssl: { rejectUnauthorized: true },
});

try {
  const [tables] = await source.query("SHOW TABLES");
  const tableNames = tables.map((row) => Object.values(row)[0]);
  console.log(`${tableNames.length} tabelas encontradas em "${SOURCE_DB}".`);

  // Checagem de segurança: confirma que a origem está mesmo vazia (era de
  // teste) antes de basear a produção nela.
  let totalRows = 0;
  for (const name of tableNames) {
    if (name === "__drizzle_migrations") continue;
    const [[{ n }]] = await source.query(`SELECT COUNT(*) as n FROM \`${name}\``);
    totalRows += n;
  }
  console.log(`Total de linhas de dados em "${SOURCE_DB}": ${totalRows} (esperado: 0)`);

  await target.query("SET FOREIGN_KEY_CHECKS=0");
  for (const name of tableNames) {
    await target.query(`DROP TABLE IF EXISTS \`${name}\``);
  }
  for (const name of tableNames) {
    const [rows] = await source.query(`SHOW CREATE TABLE \`${name}\``);
    const createSql = rows[0]["Create Table"];
    await target.query(createSql);
    console.log(` ✓ ${name}`);
  }
  await target.query("SET FOREIGN_KEY_CHECKS=1");

  const [check] = await target.query("SHOW TABLES");
  console.log(`\nPronto! "${TARGET_DB}" agora tem ${check.length} tabelas.`);
} finally {
  await admin.end();
  await source.end();
  await target.end();
}
