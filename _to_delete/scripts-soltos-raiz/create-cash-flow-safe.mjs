import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida');
  process.exit(1);
}

async function createTable() {
  try {
    const db = drizzle(DATABASE_URL);
    
    console.log('✅ Conectado ao banco de dados');

    // Criar tabela cash_flow_entries
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cash_flow_entries (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        budgetId BIGINT NOT NULL,
        month VARCHAR(7) NOT NULL,
        type ENUM('entrada', 'saida') NOT NULL,
        category ENUM(
          'Medição',
          'Aditivo',
          'Recebimento',
          'Impostos',
          'Pagamento Mão de Obra',
          'Pagamento Material',
          'Pagamento Terceiros',
          'Despesas',
          'Aluguel de Equipamentos',
          'Compra Equipamentos',
          'Outros'
        ) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        reference VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_budgetId (budgetId),
        KEY idx_month (month),
        KEY idx_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Tabela cash_flow_entries criada/verificada com sucesso');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

createTable();
