import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function createFinancialTable() {
  let connection;
  try {
    // Parse DATABASE_URL
    const url = new URL(DATABASE_URL);
    const config = {
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      port: url.port || 3306,
      ssl: {
        rejectUnauthorized: false,
      },
    };

    console.log('Conectando ao banco de dados...');
    connection = await mysql.createConnection(config);

    // Criar tabela financial_transactions
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        budgetId INT NOT NULL,
        date DATE NOT NULL,
        type ENUM('entrada', 'saida') NOT NULL,
        category VARCHAR(50) NOT NULL,
        description VARCHAR(255) NOT NULL,
        value DECIMAL(15, 2) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (budgetId) REFERENCES budgets(id) ON DELETE CASCADE,
        INDEX idx_budgetId (budgetId),
        INDEX idx_date (date),
        INDEX idx_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    console.log('Criando tabela financial_transactions...');
    await connection.execute(createTableSQL);
    console.log('✅ Tabela financial_transactions criada com sucesso!');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error.message);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

createFinancialTable();
