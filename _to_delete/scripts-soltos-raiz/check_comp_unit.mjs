import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL não definido (.env)');

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // Verificar composição PAR-104725
  const [rows] = await conn.execute(
    "SELECT id, code, description, unit FROM compositions WHERE code LIKE '%104725%' OR description LIKE '%alvenaria%blocos%' LIMIT 5"
  );
  console.log('Composições encontradas:', JSON.stringify(rows, null, 2));
  
  await conn.end();
}

main().catch(console.error);
