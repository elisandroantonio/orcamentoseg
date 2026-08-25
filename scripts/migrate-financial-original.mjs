import 'dotenv/config';
import mysql from 'mysql2/promise';

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
if (!ORIGINAL_DB_URL) throw new Error('DATABASE_URL não definido (.env)');

const conn = await mysql.createConnection(ORIGINAL_DB_URL);

const statements = [
  // Tabela de períodos de medição
  `CREATE TABLE IF NOT EXISTS \`measurement_periods\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`budgetId\` int NOT NULL,
    \`periodNumber\` int NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`startDate\` date,
    \`endDate\` date,
    \`status\` enum('open','closed') NOT NULL DEFAULT 'open',
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`measurement_periods_pk\` PRIMARY KEY(\`id\`)
  )`,
  // Tabela de itens de medição
  `CREATE TABLE IF NOT EXISTS \`measurement_items\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`periodId\` int NOT NULL,
    \`budgetId\` int NOT NULL,
    \`budgetItemId\` int NOT NULL,
    \`percentMeasured\` decimal(7,4) NOT NULL DEFAULT '0',
    \`quantityMeasured\` decimal(15,4) NOT NULL DEFAULT '0',
    \`valueMeasured\` decimal(15,2) NOT NULL DEFAULT '0',
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`measurement_items_pk\` PRIMARY KEY(\`id\`)
  )`,
  // Tabela de aditivos de contrato
  `CREATE TABLE IF NOT EXISTS \`contract_additives\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`budgetId\` int NOT NULL,
    \`number\` varchar(50) NOT NULL,
    \`type\` enum('acrescimo','supressao') NOT NULL DEFAULT 'acrescimo',
    \`description\` text NOT NULL,
    \`value\` decimal(15,2) NOT NULL DEFAULT '0',
    \`signedDate\` date,
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`contract_additives_pk\` PRIMARY KEY(\`id\`)
  )`,
  // Foreign Keys
  `ALTER TABLE \`measurement_periods\` ADD CONSTRAINT \`mp_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`mi_periodId_fk\` FOREIGN KEY (\`periodId\`) REFERENCES \`measurement_periods\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`mi_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`mi_budgetItemId_fk\` FOREIGN KEY (\`budgetItemId\`) REFERENCES \`budget_items\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`contract_additives\` ADD CONSTRAINT \`ca_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE CASCADE`,
  // Índices
  `CREATE INDEX \`mp_budgetId_idx\` ON \`measurement_periods\` (\`budgetId\`)`,
  `CREATE INDEX \`mi_periodId_idx\` ON \`measurement_items\` (\`periodId\`)`,
  `CREATE INDEX \`mi_budgetId_idx\` ON \`measurement_items\` (\`budgetId\`)`,
  `CREATE INDEX \`mi_budgetItemId_idx\` ON \`measurement_items\` (\`budgetItemId\`)`,
  `CREATE INDEX \`ca_budgetId_idx\` ON \`contract_additives\` (\`budgetId\`)`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log('✓ OK:', sql.slice(0, 70).replace(/\n/g, ' ').replace(/\s+/g, ' '));
  } catch (err) {
    if (
      err.message?.includes('already exists') ||
      err.message?.includes('Duplicate key name') ||
      err.code === 'ER_DUP_KEYNAME' ||
      err.code === 'ER_TABLE_EXISTS_ERROR'
    ) {
      console.log('⚠ Skip (already exists):', sql.slice(0, 60).replace(/\n/g, ' ').replace(/\s+/g, ' '));
    } else {
      console.error('✗ Error:', err.message);
    }
  }
}

await conn.end();
console.log('\n✅ Migration complete on ORIGINAL DB!');
