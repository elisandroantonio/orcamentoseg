import mysql from 'mysql2/promise';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const conn = await mysql.createConnection(connectionString);

const statements = [
  // 1. workStatus na tabela budgets
  `ALTER TABLE \`budgets\` ADD COLUMN \`workStatus\` enum('orcamento','contrato','execucao','finalizada','nao_fechada') NOT NULL DEFAULT 'execucao'`,

  // 2. Criar tabela bank_accounts
  `CREATE TABLE IF NOT EXISTS \`bank_accounts\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`bank\` varchar(100) NOT NULL,
    \`type\` enum('corrente','poupanca','caixa') NOT NULL DEFAULT 'corrente',
    \`agency\` varchar(20),
    \`accountNumber\` varchar(30),
    \`initialBalance\` decimal(15,2) NOT NULL DEFAULT '0',
    \`isActive\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`bank_accounts_id\` PRIMARY KEY(\`id\`)
  )`,

  // 3. Criar tabela fleet_vehicles
  `CREATE TABLE IF NOT EXISTS \`fleet_vehicles\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`type\` enum('veiculo','maquina') NOT NULL DEFAULT 'veiculo',
    \`description\` varchar(255) NOT NULL,
    \`plate\` varchar(10),
    \`model\` varchar(100),
    \`year\` int,
    \`status\` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`fleet_vehicles_id\` PRIMARY KEY(\`id\`)
  )`,

  // 4. Novos campos em financial_transactions
  `ALTER TABLE \`financial_transactions\` ADD COLUMN \`bankAccountId\` int`,
  `ALTER TABLE \`financial_transactions\` ADD COLUMN \`vehicleId\` int`,
  `ALTER TABLE \`financial_transactions\` ADD COLUMN \`userId\` int NOT NULL DEFAULT 1`,
  `ALTER TABLE \`financial_transactions\` ADD COLUMN \`costCenter\` enum('obra','administrativo','frota') NOT NULL DEFAULT 'obra'`,
  `ALTER TABLE \`financial_transactions\` ADD COLUMN \`payeeName\` varchar(255)`,
  `ALTER TABLE \`financial_transactions\` MODIFY COLUMN \`budgetId\` int`,

  // 5. FK bank_accounts
  `ALTER TABLE \`bank_accounts\` ADD CONSTRAINT \`bank_accounts_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE`,

  // 6. FK fleet_vehicles
  `ALTER TABLE \`fleet_vehicles\` ADD CONSTRAINT \`fleet_vehicles_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE`,

  // 7. FK financial_transactions novos campos
  `ALTER TABLE \`financial_transactions\` ADD CONSTRAINT \`financial_transactions_bankAccountId_fk\` FOREIGN KEY (\`bankAccountId\`) REFERENCES \`bank_accounts\`(\`id\`) ON DELETE SET NULL`,
  `ALTER TABLE \`financial_transactions\` ADD CONSTRAINT \`financial_transactions_vehicleId_fk\` FOREIGN KEY (\`vehicleId\`) REFERENCES \`fleet_vehicles\`(\`id\`) ON DELETE SET NULL`,
  `ALTER TABLE \`financial_transactions\` ADD CONSTRAINT \`financial_transactions_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE`,

  // 8. Índices
  `CREATE INDEX \`bank_accounts_userId_idx\` ON \`bank_accounts\` (\`userId\`)`,
  `CREATE INDEX \`fleet_vehicles_userId_idx\` ON \`fleet_vehicles\` (\`userId\`)`,
  `CREATE INDEX \`financial_transactions_userId_idx\` ON \`financial_transactions\` (\`userId\`)`,
  `CREATE INDEX \`financial_transactions_costCenter_idx\` ON \`financial_transactions\` (\`costCenter\`)`,
];

console.log(`Running ${statements.length} migration statements...`);
let ok = 0, skipped = 0, failed = 0;

for (let i = 0; i < statements.length; i++) {
  const sql = statements[i];
  const preview = sql.trim().replace(/\s+/g, ' ').substring(0, 70);
  try {
    await conn.execute(sql);
    console.log(`✓ [${i+1}] ${preview}`);
    ok++;
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Duplicate column') || msg.includes('already exists') || msg.includes('Duplicate key name') || msg.includes('Duplicate entry') || msg.includes('already exists')) {
      console.log(`⚠ [${i+1}] Already applied: ${preview}`);
      skipped++;
    } else {
      console.error(`✗ [${i+1}] FAILED: ${preview}`);
      console.error(`   ${msg}`);
      failed++;
    }
  }
}

await conn.end();
console.log(`\nDone: ${ok} applied, ${skipped} skipped, ${failed} failed`);
