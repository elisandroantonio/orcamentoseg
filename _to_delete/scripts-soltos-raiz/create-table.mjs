import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL não definido (.env)');

async function createTable() {
  let connection;
  try {
    console.log('Conectando ao banco de dados...');
    const url = new URL(DB_URL);
    
    connection = await mysql.createConnection({
      host: url.hostname,
      port: url.port,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      ssl: {
        rejectUnauthorized: false,
      },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log('Conectado ao banco de dados!');

    // Ler o arquivo SQL
    const sqlPath = path.join(process.cwd(), 'create_financial_transactions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Executando SQL...');
    await connection.execute(sql);
    console.log('✓ Tabela financial_transactions criada com sucesso!');

    // Verificar se a tabela foi criada
    const [rows] = await connection.execute(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'financial_transactions'"
    );

    if (rows[0].count > 0) {
      console.log('✓ Tabela verificada no banco de dados!');
    } else {
      console.log('✗ Tabela não encontrada no banco de dados!');
    }

    await connection.end();
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
}

createTable();
