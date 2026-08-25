/**
 * Script para criar todas as tabelas faltantes no banco TiDB
 * Executa cada SQL individualmente para contornar a limitação de multi-statement
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database');

// Verificar tabelas existentes
const [existingTables] = await connection.execute('SHOW TABLES');
const tables = existingTables.map(r => Object.values(r)[0]);
console.log('Existing tables:', tables.join(', '));

async function execSQL(sql, description) {
  try {
    await connection.execute(sql);
    console.log(`✓ ${description}`);
    return true;
  } catch (err) {
    if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.message?.includes('already exists') || 
        err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column') ||
        err.code === 'ER_DUP_KEYNAME' || err.message?.includes('Duplicate key name') ||
        err.message?.includes('Duplicate foreign key')) {
      console.log(`⚠ Already exists (skipped): ${description}`);
      return true;
    }
    console.error(`✗ Error in "${description}": ${err.message}`);
    return false;
  }
}

// ============================================================
// TABELA: composition_inputs
// ============================================================
if (!tables.includes('composition_inputs')) {
  await execSQL(`
    CREATE TABLE \`composition_inputs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`compositionId\` int NOT NULL,
      \`inputId\` int NOT NULL,
      \`quantity\` decimal(12,4) NOT NULL DEFAULT '1',
      \`coefficient\` decimal(12,6) NOT NULL DEFAULT '1',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`composition_inputs_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE composition_inputs');
  
  await execSQL(`CREATE INDEX \`composition_inputs_compositionId_idx\` ON \`composition_inputs\` (\`compositionId\`)`, 'INDEX composition_inputs_compositionId_idx');
  await execSQL(`CREATE INDEX \`composition_inputs_inputId_idx\` ON \`composition_inputs\` (\`inputId\`)`, 'INDEX composition_inputs_inputId_idx');
  await execSQL(`ALTER TABLE \`composition_inputs\` ADD CONSTRAINT \`composition_inputs_compositionId_fk\` FOREIGN KEY (\`compositionId\`) REFERENCES \`compositions\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK composition_inputs_compositionId');
}

// ============================================================
// TABELA: budget_stages
// ============================================================
if (!tables.includes('budget_stages')) {
  await execSQL(`
    CREATE TABLE \`budget_stages\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetId\` int NOT NULL,
      \`parentStageId\` int,
      \`name\` varchar(255) NOT NULL,
      \`description\` text,
      \`order\` int NOT NULL DEFAULT 0,
      \`totalCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_stages_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_stages');
  
  await execSQL(`CREATE INDEX \`budget_stages_budgetId_idx\` ON \`budget_stages\` (\`budgetId\`)`, 'INDEX budget_stages_budgetId_idx');
  await execSQL(`CREATE INDEX \`budget_stages_parentStageId_idx\` ON \`budget_stages\` (\`parentStageId\`)`, 'INDEX budget_stages_parentStageId_idx');
  await execSQL(`ALTER TABLE \`budget_stages\` ADD CONSTRAINT \`budget_stages_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK budget_stages_budgetId');
}

// ============================================================
// TABELA: budget_items
// ============================================================
if (!tables.includes('budget_items')) {
  await execSQL(`
    CREATE TABLE \`budget_items\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetId\` int NOT NULL,
      \`stageId\` int,
      \`compositionId\` int,
      \`type\` enum('composition','service','composite') NOT NULL DEFAULT 'composition',
      \`description\` text,
      \`unit\` varchar(50),
      \`quantity\` decimal(15,4) NOT NULL DEFAULT '1',
      \`materialCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`laborCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`equipmentCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`serviceCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`otherCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`unitCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`totalCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`laborHours\` decimal(15,3) NOT NULL DEFAULT '0',
      \`totalLaborHours\` decimal(15,2) NOT NULL DEFAULT '0',
      \`order\` int NOT NULL DEFAULT 0,
      \`includeMaterial\` tinyint(1) NOT NULL DEFAULT 1,
      \`code\` varchar(50),
      \`parentItemId\` int,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_items_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_items');
  
  await execSQL(`CREATE INDEX \`budget_items_budgetId_idx\` ON \`budget_items\` (\`budgetId\`)`, 'INDEX budget_items_budgetId_idx');
  await execSQL(`CREATE INDEX \`budget_items_stageId_idx\` ON \`budget_items\` (\`stageId\`)`, 'INDEX budget_items_stageId_idx');
  await execSQL(`CREATE INDEX \`budget_items_compositionId_idx\` ON \`budget_items\` (\`compositionId\`)`, 'INDEX budget_items_compositionId_idx');
  await execSQL(`ALTER TABLE \`budget_items\` ADD CONSTRAINT \`budget_items_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK budget_items_budgetId');
  await execSQL(`ALTER TABLE \`budget_items\` ADD CONSTRAINT \`budget_items_stageId_fk\` FOREIGN KEY (\`stageId\`) REFERENCES \`budget_stages\`(\`id\`) ON DELETE set null ON UPDATE no action`, 'FK budget_items_stageId');
}

// ============================================================
// TABELA: budget_item_inputs
// ============================================================
if (!tables.includes('budget_item_inputs')) {
  await execSQL(`
    CREATE TABLE \`budget_item_inputs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetItemId\` int NOT NULL,
      \`inputId\` int NOT NULL,
      \`coefficient\` decimal(12,6) NOT NULL DEFAULT '1',
      \`unitCost\` decimal(12,4) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_item_inputs_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_item_inputs');
  
  await execSQL(`CREATE INDEX \`budget_item_inputs_budgetItemId_idx\` ON \`budget_item_inputs\` (\`budgetItemId\`)`, 'INDEX budget_item_inputs_budgetItemId_idx');
  await execSQL(`ALTER TABLE \`budget_item_inputs\` ADD CONSTRAINT \`budget_item_inputs_budgetItemId_fk\` FOREIGN KEY (\`budgetItemId\`) REFERENCES \`budget_items\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK budget_item_inputs_budgetItemId');
}

// ============================================================
// TABELA: additive_stages
// ============================================================
if (!tables.includes('additive_stages')) {
  await execSQL(`
    CREATE TABLE \`additive_stages\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`additiveId\` int NOT NULL,
      \`parentStageId\` int,
      \`name\` varchar(255) NOT NULL,
      \`description\` text,
      \`order\` int NOT NULL DEFAULT 0,
      \`totalCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`additive_stages_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE additive_stages');
  
  await execSQL(`CREATE INDEX \`additive_stages_additiveId_idx\` ON \`additive_stages\` (\`additiveId\`)`, 'INDEX additive_stages_additiveId_idx');
  await execSQL(`CREATE INDEX \`additive_stages_parentStageId_idx\` ON \`additive_stages\` (\`parentStageId\`)`, 'INDEX additive_stages_parentStageId_idx');
}

// ============================================================
// TABELA: additive_items
// ============================================================
if (!tables.includes('additive_items')) {
  await execSQL(`
    CREATE TABLE \`additive_items\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`additiveId\` int NOT NULL,
      \`stageId\` int,
      \`compositionId\` int,
      \`type\` enum('composition','service','composite') NOT NULL DEFAULT 'composition',
      \`description\` text,
      \`unit\` varchar(50),
      \`quantity\` decimal(15,4) NOT NULL DEFAULT '1',
      \`materialCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`laborCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`equipmentCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`serviceCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`otherCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`unitCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`totalCost\` decimal(15,2) NOT NULL DEFAULT '0',
      \`laborHours\` decimal(15,3) NOT NULL DEFAULT '0',
      \`totalLaborHours\` decimal(15,2) NOT NULL DEFAULT '0',
      \`order\` int NOT NULL DEFAULT 0,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`additive_items_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE additive_items');
  
  await execSQL(`CREATE INDEX \`additive_items_additiveId_idx\` ON \`additive_items\` (\`additiveId\`)`, 'INDEX additive_items_additiveId_idx');
  await execSQL(`CREATE INDEX \`additive_items_stageId_idx\` ON \`additive_items\` (\`stageId\`)`, 'INDEX additive_items_stageId_idx');
}

// ============================================================
// TABELA: contract_additives - Verificar e adicionar colunas faltantes
// ============================================================
// A tabela já existe mas pode ter estrutura diferente do schema atual
console.log('\n--- Verificando estrutura da tabela contract_additives ---');
const [caColumns] = await connection.execute('DESCRIBE `contract_additives`');
const caColNames = caColumns.map(c => c.Field);
console.log('Columns:', caColNames.join(', '));

// Adicionar colunas faltantes
const neededCols = [
  { name: 'title', sql: "ALTER TABLE `contract_additives` ADD COLUMN `title` varchar(200) NOT NULL DEFAULT '' AFTER `budgetId`" },
  { name: 'status', sql: "ALTER TABLE `contract_additives` ADD COLUMN `status` enum('draft','approved','rejected','closed') NOT NULL DEFAULT 'draft' AFTER `description`" },
  { name: 'totalValue', sql: "ALTER TABLE `contract_additives` ADD COLUMN `totalValue` decimal(15,2) NOT NULL DEFAULT '0' AFTER `status`" },
  { name: 'socialCharges', sql: "ALTER TABLE `contract_additives` ADD COLUMN `socialCharges` decimal(5,2) NOT NULL DEFAULT '0' AFTER `totalValue`" },
  { name: 'adminCentral', sql: "ALTER TABLE `contract_additives` ADD COLUMN `adminCentral` decimal(5,2) NOT NULL DEFAULT '0' AFTER `socialCharges`" },
  { name: 'profit', sql: "ALTER TABLE `contract_additives` ADD COLUMN `profit` decimal(5,2) NOT NULL DEFAULT '0' AFTER `adminCentral`" },
  { name: 'taxes', sql: "ALTER TABLE `contract_additives` ADD COLUMN `taxes` decimal(5,2) NOT NULL DEFAULT '0' AFTER `profit`" },
  { name: 'risk', sql: "ALTER TABLE `contract_additives` ADD COLUMN `risk` decimal(5,2) NOT NULL DEFAULT '0' AFTER `taxes`" },
  { name: 'warranty', sql: "ALTER TABLE `contract_additives` ADD COLUMN `warranty` decimal(5,2) NOT NULL DEFAULT '0' AFTER `risk`" },
  { name: 'frozenAt', sql: "ALTER TABLE `contract_additives` ADD COLUMN `frozenAt` timestamp AFTER `warranty`" },
  { name: 'frozenBy', sql: "ALTER TABLE `contract_additives` ADD COLUMN `frozenBy` varchar(255) AFTER `frozenAt`" },
];

for (const col of neededCols) {
  if (!caColNames.includes(col.name)) {
    await execSQL(col.sql, `ADD COLUMN ${col.name} to contract_additives`);
  } else {
    console.log(`⚠ Column ${col.name} already exists in contract_additives`);
  }
}

// ============================================================
// TABELA: measurement_periods - Verificar estrutura
// ============================================================
console.log('\n--- Verificando estrutura da tabela measurement_periods ---');
const [mpColumns] = await connection.execute('DESCRIBE `measurement_periods`');
const mpColNames = mpColumns.map(c => c.Field);
console.log('Columns:', mpColNames.join(', '));

// ============================================================
// TABELA: measurement_items - Verificar FK para budget_items
// ============================================================
// A FK para budget_items pode ter falhado antes. Tentar adicionar agora.
await execSQL(
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_budgetItemId_fk\` FOREIGN KEY (\`budgetItemId\`) REFERENCES \`budget_items\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  'FK measurement_items_budgetItemId'
);

// ============================================================
// Verificar tabelas extras do schema
// ============================================================
const [finalTables] = await connection.execute('SHOW TABLES');
const finalTableList = finalTables.map(r => Object.values(r)[0]);
console.log('\nFinal tables:', finalTableList.join(', '));

const allNeeded = ['budget_stages', 'budget_items', 'composition_inputs', 'budget_item_inputs', 'additive_stages', 'additive_items', 'contract_additives', 'measurement_periods', 'measurement_items'];
console.log('\nStatus:');
for (const t of allNeeded) {
  console.log(`  ${t}: ${finalTableList.includes(t) ? '✓' : '✗ MISSING'}`);
}

await connection.end();
console.log('\n✅ Script concluído!');
