import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL não definido (.env)');

async function checkTransactions() {
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
    });

    console.log('Conectado ao banco de dados!');

    // Contar lançamentos
    const [countResult] = await connection.execute(
      "SELECT COUNT(*) as count FROM financial_transactions"
    );
    console.log(`Total de lançamentos: ${countResult[0].count}`);

    // Listar todos os lançamentos
    const [transactions] = await connection.execute(
      "SELECT id, budgetId, date, type, category, description, value FROM financial_transactions ORDER BY date DESC"
    );

    if (transactions.length > 0) {
      console.log('\nLançamentos encontrados:');
      transactions.forEach((t, index) => {
        console.log(`${index + 1}. [${t.id}] ${t.date} | ${t.type} | ${t.category} | ${t.description} | R$ ${t.value}`);
      });
    } else {
      console.log('Nenhum lançamento encontrado');
    }

    // Verificar resumo por tipo
    const [summary] = await connection.execute(`
      SELECT 
        type,
        COUNT(*) as count,
        SUM(value) as total
      FROM financial_transactions
      GROUP BY type
    `);

    if (summary.length > 0) {
      console.log('\nResumo por tipo:');
      summary.forEach(row => {
        console.log(`${row.type}: ${row.count} lançamento(s), Total: R$ ${row.total}`);
      });
    }

    await connection.end();
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
}

checkTransactions();
