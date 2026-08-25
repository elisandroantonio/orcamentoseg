import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const connection = await mysql.createConnection(DATABASE_URL);

const [tables] = await connection.execute('SHOW TABLES');
console.log('Tables in database:');
tables.forEach(t => console.log(' -', Object.values(t)[0]));

// Verificar estrutura das tabelas relevantes
const tableNames = tables.map(t => Object.values(t)[0]);

for (const name of tableNames) {
  const [cols] = await connection.execute(`DESCRIBE \`${name}\``);
  console.log(`\n${name}:`, cols.map(c => `${c.Field}(${c.Type})`).join(', '));
}

await connection.end();
