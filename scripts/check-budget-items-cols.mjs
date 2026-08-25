import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SHOW COLUMNS FROM budget_items LIKE '%labor%'");
console.log('Colunas labor* em budget_items:', JSON.stringify(rows, null, 2));
const [rows2] = await conn.execute("SHOW COLUMNS FROM budget_items LIKE '%encargo%'");
console.log('Colunas encargo* em budget_items:', JSON.stringify(rows2, null, 2));
await conn.end();
