import mysql from 'mysql2/promise';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const conn = await mysql.createConnection(connectionString);

const statements = [
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
    CONSTRAINT \`measurement_periods_id\` PRIMARY KEY(\`id\`)
  )`,
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
    CONSTRAINT \`measurement_items_id\` PRIMARY KEY(\`id\`)
  )`,
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
    CONSTRAINT \`contract_additives_id\` PRIMARY KEY(\`id\`)
  )`,
  `ALTER TABLE \`measurement_periods\` ADD CONSTRAINT \`measurement_periods_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_periodId_fk\` FOREIGN KEY (\`periodId\`) REFERENCES \`measurement_periods\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_budgetItemId_fk\` FOREIGN KEY (\`budgetItemId\`) REFERENCES \`budget_items\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`contract_additives\` ADD CONSTRAINT \`contract_additives_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS \`measurement_periods_budgetId_idx\` ON \`measurement_periods\` (\`budgetId\`)`,
  `CREATE INDEX IF NOT EXISTS \`measurement_items_periodId_idx\` ON \`measurement_items\` (\`periodId\`)`,
  `CREATE INDEX IF NOT EXISTS \`measurement_items_budgetId_idx\` ON \`measurement_items\` (\`budgetId\`)`,
  `CREATE INDEX IF NOT EXISTS \`measurement_items_budgetItemId_idx\` ON \`measurement_items\` (\`budgetItemId\`)`,
  `CREATE INDEX IF NOT EXISTS \`measurement_items_unique\` ON \`measurement_items\` (\`periodId\`,\`budgetItemId\`)`,
  `CREATE INDEX IF NOT EXISTS \`contract_additives_budgetId_idx\` ON \`contract_additives\` (\`budgetId\`)`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log('✓ OK:', sql.slice(0, 60).replace(/\n/g, ' '));
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME' || err.message?.includes('Duplicate key name') || err.message?.includes('already exists')) {
      console.log('⚠ Already exists (skip):', sql.slice(0, 60).replace(/\n/g, ' '));
    } else {
      console.error('✗ Error:', err.message);
      console.error('  SQL:', sql.slice(0, 100));
    }
  }
}

await conn.end();
console.log('\nMigration complete!');
