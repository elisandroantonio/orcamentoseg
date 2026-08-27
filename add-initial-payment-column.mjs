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

const [rows] = await conn.execute(
  `SELECT COUNT(*) AS cnt
   FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'budgets'
     AND column_name = 'initialPaymentPercent'`
);

if (rows[0].cnt > 0) {
  console.log("ℹ️ Coluna 'initialPaymentPercent' já existe em 'budgets'. Nada a fazer.");
} else {
  await conn.execute(
    `ALTER TABLE budgets
     ADD COLUMN initialPaymentPercent DECIMAL(5,2) NOT NULL DEFAULT 0`
  );
  console.log("✅ Coluna 'initialPaymentPercent' criada em 'budgets'.");
}

await conn.end();
console.log("✅ Concluído!");
