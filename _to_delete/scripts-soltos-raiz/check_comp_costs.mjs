import 'dotenv/config';
import mysql from 'mysql2/promise';
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL não definido (.env)');

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // Verificar composição PAR-104725 - todos os campos de custo
  const [rows] = await conn.execute(
    "SELECT id, code, description, unit, material_cost, labor_cost, equipment_cost, total_cost FROM compositions WHERE code = 'PAR-104725' LIMIT 1"
  );
  console.log('PAR-104725 costs:', JSON.stringify(rows, null, 2));
  
  // Verificar quais campos existem na tabela compositions
  const [cols] = await conn.execute("SHOW COLUMNS FROM compositions");
  console.log('Columns:', cols.map(c => c.Field).join(', '));
  
  await conn.end();
}

main().catch(console.error);
