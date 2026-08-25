// Só testa a conexão com o banco novo (ORCAMENTO-TESTE) e lista tabelas.
import mysql2 from "mysql2/promise";

const url = "mysql://3m4Z5HddmfH7n6h.root:TKzEGbWg6aCiuqok@gateway01.sa-east-1.prod.aws.tidbcloud.com:4000/test?ssl={\"rejectUnauthorized\":true}";

const conn = await mysql2.createConnection({ uri: url });
const [[dbRow]] = await conn.query("SELECT DATABASE() as db, VERSION() as v");
console.log("Conectado! Schema:", dbRow.db, "| Versão:", dbRow.v);
const [tables] = await conn.query("SHOW TABLES");
console.log(`Tabelas existentes (${tables.length}):`, tables.map((r) => Object.values(r)[0]));
await conn.end();
