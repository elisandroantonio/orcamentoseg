import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SHOW COLUMNS FROM budget_items");
console.log('Colunas de budget_items:');
rows.forEach(r => console.log(' ', r.Field));
await conn.end();
