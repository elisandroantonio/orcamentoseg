// Script de diagnóstico — SÓ LEITURA, não altera nada no banco.
// Roda: node _diagnostico-tabelas.mjs
import "dotenv/config";
import mysql2 from "mysql2/promise";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL não encontrada no .env");
  process.exit(1);
}

const conn = await mysql2.createConnection({ uri: dbUrl });

try {
  const [[dbRow]] = await conn.query("SELECT DATABASE() as db");
  console.log("Conectado ao schema:", dbRow.db);

  const [tables] = await conn.query("SHOW TABLES");
  console.log(`\nTabelas encontradas (${tables.length}):`);
  for (const row of tables) {
    console.log(" -", Object.values(row)[0]);
  }

  if (tables.length === 0) {
    console.log("\n>>> NENHUMA tabela encontrada neste schema.");
  } else {
    const names = tables.map((r) => Object.values(r)[0]);
    console.log("\nTem tabela 'users'?", names.includes("users") ? "SIM" : "NÃO");
    console.log("Tem tabela 'budgets'?", names.includes("budgets") ? "SIM" : "NÃO");
  }
} catch (err) {
  console.error("Erro ao consultar:", err.message);
} finally {
  await conn.end();
}
