import 'dotenv/config';
import { createConnection } from "mysql2/promise";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
if (!ORIGINAL_DB_URL) throw new Error('DATABASE_URL não definido (.env)');

const url = new URL(ORIGINAL_DB_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "4000"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log("✅ Conectado ao banco:", url.hostname, "/", url.pathname.slice(1));

const columns = [
  { name: "materialAdjustment", ddl: "ALTER TABLE additive_items ADD COLUMN materialAdjustment DECIMAL(10,2) NOT NULL DEFAULT 0" },
  { name: "laborAdjustment", ddl: "ALTER TABLE additive_items ADD COLUMN laborAdjustment DECIMAL(10,2) NOT NULL DEFAULT 0" },
];

for (const col of columns) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'additive_items'
       AND column_name = ?`,
    [col.name]
  );
  if (rows[0].cnt > 0) {
    console.log(`ℹ️ Coluna '${col.name}' já existe em 'additive_items'. Nada a fazer.`);
  } else {
    await conn.execute(col.ddl);
    console.log(`✅ Coluna '${col.name}' criada em 'additive_items'.`);
  }
}

await conn.end();
console.log("✅ Concluído!");
