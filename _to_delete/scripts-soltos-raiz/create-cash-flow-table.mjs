import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function createTable() {
  try {
    // Parse connection string
    const url = new URL(DATABASE_URL);
    const config = {
      host: url.hostname,
      port: parseInt(url.port || '3306'),
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      ssl: url.searchParams.get('ssl') ? JSON.parse(url.searchParams.get('ssl')) : true,
    };

    console.log('Connecting to database:', config.host, config.database);

    const connection = await mysql.createConnection(config);
    const db = drizzle(connection);

    // Create table using raw SQL
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`cash_flow_entries\` (
        \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`budgetId\` int NOT NULL,
        \`month\` varchar(7) NOT NULL COMMENT 'YYYY-MM format',
        \`type\` enum('entrada','saida') NOT NULL,
        \`category\` varchar(50) NOT NULL,
        \`description\` text,
        \`amount\` decimal(15,2) NOT NULL,
        \`reference\` varchar(255),
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY \`cash_flow_entries_budgetId_idx\` (\`budgetId\`),
        KEY \`cash_flow_entries_month_idx\` (\`month\`),
        KEY \`cash_flow_entries_budgetMonth_idx\` (\`budgetId\`, \`month\`),
        CONSTRAINT \`cash_flow_entries_ibfk_1\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `;

    await db.execute(sql.raw(createTableSQL));
    console.log('✅ Table cash_flow_entries created successfully!');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    process.exit(1);
  }
}

createTable();
