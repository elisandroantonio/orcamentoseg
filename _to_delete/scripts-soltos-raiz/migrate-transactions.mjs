import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function migrate() {
  const connection = await pool.getConnection();
  
  try {
    console.log('Criando tabela financial_transactions...');
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        budgetId INT NOT NULL,
        date DATE NOT NULL,
        type ENUM('entrada', 'saida') NOT NULL,
        category VARCHAR(50),
        description VARCHAR(255) NOT NULL,
        value DECIMAL(15, 2) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (budgetId) REFERENCES budgets(id) ON DELETE CASCADE,
        INDEX financial_transactions_budgetId_idx (budgetId),
        INDEX financial_transactions_date_idx (date),
        INDEX financial_transactions_type_idx (type)
      )
    `);
    
    console.log('✅ Tabela financial_transactions criada com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error.message);
    throw error;
  } finally {
    await connection.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
