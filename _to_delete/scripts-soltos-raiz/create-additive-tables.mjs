/**
 * Script para criar tabelas do módulo de Aditivos no banco TiDB
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const connection = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database');

const [existingTables] = await connection.execute('SHOW TABLES');
const tables = existingTables.map(r => Object.values(r)[0]);

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
// TABELA: budget_additives (nova estrutura de aditivos)
// ============================================================
if (!tables.includes('budget_additives')) {
  await execSQL(`
    CREATE TABLE \`budget_additives\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`name\` varchar(255) NOT NULL,
      \`status\` enum('elaboracao','aprovado','negado') NOT NULL DEFAULT 'elaboracao',
      \`frozenAt\` timestamp,
      \`frozenBy\` varchar(255),
      \`totalCostNoBdi\` decimal(15,2) NOT NULL DEFAULT '0',
      \`totalCostWithBdi\` decimal(15,2) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_additives_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_additives');
  
  await execSQL(`CREATE INDEX \`budget_additives_budgetId_idx\` ON \`budget_additives\` (\`budgetId\`)`, 'INDEX budget_additives_budgetId_idx');
  await execSQL(`CREATE INDEX \`budget_additives_userId_idx\` ON \`budget_additives\` (\`userId\`)`, 'INDEX budget_additives_userId_idx');
  await execSQL(`ALTER TABLE \`budget_additives\` ADD CONSTRAINT \`budget_additives_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK budget_additives_budgetId');
  await execSQL(`ALTER TABLE \`budget_additives\` ADD CONSTRAINT \`budget_additives_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK budget_additives_userId');
} else {
  console.log('⚠ Table budget_additives already exists');
}

// ============================================================
// TABELA: additive_stages - Verificar FK para budget_additives
// ============================================================
// A tabela foi criada antes mas com FK errada (para contract_additives)
// Verificar e corrigir
console.log('\n--- Verificando additive_stages ---');
const [asColumns] = await connection.execute('DESCRIBE `additive_stages`');
console.log('Columns:', asColumns.map(c => c.Field).join(', '));

// ============================================================
// TABELA: additive_items - Verificar colunas faltantes
// ============================================================
console.log('\n--- Verificando additive_items ---');
const [aiColumns] = await connection.execute('DESCRIBE `additive_items`');
const aiColNames = aiColumns.map(c => c.Field);
console.log('Columns:', aiColNames.join(', '));

// Adicionar colunas faltantes
const aiNeededCols = [
  { name: 'additiveId', sql: "ALTER TABLE `additive_items` ADD COLUMN `additiveId` int NOT NULL DEFAULT 0 AFTER `id`" },
  { name: 'applyBdiToMaterial', sql: "ALTER TABLE `additive_items` ADD COLUMN `applyBdiToMaterial` tinyint NOT NULL DEFAULT 1" },
  { name: 'applyBdiToLabor', sql: "ALTER TABLE `additive_items` ADD COLUMN `applyBdiToLabor` tinyint NOT NULL DEFAULT 1" },
  { name: 'additionalIncrement', sql: "ALTER TABLE `additive_items` ADD COLUMN `additionalIncrement` decimal(7,2) NOT NULL DEFAULT '0'" },
  { name: 'discount', sql: "ALTER TABLE `additive_items` ADD COLUMN `discount` decimal(7,2) NOT NULL DEFAULT '0'" },
  { name: 'aplicarEncargosSociais', sql: "ALTER TABLE `additive_items` ADD COLUMN `aplicarEncargosSociais` tinyint NOT NULL DEFAULT 1" },
  { name: 'laborHours', sql: "ALTER TABLE `additive_items` ADD COLUMN `laborHours` decimal(15,3) NOT NULL DEFAULT '0'" },
  { name: 'totalLaborHours', sql: "ALTER TABLE `additive_items` ADD COLUMN `totalLaborHours` decimal(15,2) NOT NULL DEFAULT '0'" },
];

for (const col of aiNeededCols) {
  if (!aiColNames.includes(col.name)) {
    await execSQL(col.sql, `ADD COLUMN ${col.name} to additive_items`);
  }
}

// ============================================================
// TABELA: additive_item_inputs
// ============================================================
if (!tables.includes('additive_item_inputs')) {
  await execSQL(`
    CREATE TABLE \`additive_item_inputs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`additiveItemId\` int NOT NULL,
      \`inputId\` int NOT NULL,
      \`coefficient\` decimal(10,6) NOT NULL,
      \`unitCost\` decimal(15,2) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`additive_item_inputs_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE additive_item_inputs');
  
  await execSQL(`CREATE INDEX \`additive_item_inputs_additiveItemId_idx\` ON \`additive_item_inputs\` (\`additiveItemId\`)`, 'INDEX additive_item_inputs_additiveItemId_idx');
  await execSQL(`CREATE INDEX \`additive_item_inputs_inputId_idx\` ON \`additive_item_inputs\` (\`inputId\`)`, 'INDEX additive_item_inputs_inputId_idx');
  await execSQL(`ALTER TABLE \`additive_item_inputs\` ADD CONSTRAINT \`additive_item_inputs_additiveItemId_fk\` FOREIGN KEY (\`additiveItemId\`) REFERENCES \`additive_items\`(\`id\`) ON DELETE cascade ON UPDATE no action`, 'FK additive_item_inputs_additiveItemId');
}

// ============================================================
// TABELA: additive_measurements
// ============================================================
if (!tables.includes('additive_measurements')) {
  await execSQL(`
    CREATE TABLE \`additive_measurements\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`additiveId\` int NOT NULL,
      \`additiveItemId\` int NOT NULL,
      \`period\` varchar(7) NOT NULL,
      \`measuredPercent\` decimal(7,4) NOT NULL DEFAULT '0',
      \`measuredValue\` decimal(15,2) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`additive_measurements_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE additive_measurements');
  
  await execSQL(`CREATE INDEX \`additive_measurements_additiveId_idx\` ON \`additive_measurements\` (\`additiveId\`)`, 'INDEX additive_measurements_additiveId_idx');
  await execSQL(`CREATE INDEX \`additive_measurements_additiveItemId_idx\` ON \`additive_measurements\` (\`additiveItemId\`)`, 'INDEX additive_measurements_additiveItemId_idx');
}

// ============================================================
// Verificar tabelas extras do schema
// ============================================================
const [finalTables] = await connection.execute('SHOW TABLES');
const finalTableList = finalTables.map(r => Object.values(r)[0]);

const allNeeded = ['budget_additives', 'additive_stages', 'additive_items', 'additive_item_inputs', 'additive_measurements'];
console.log('\nStatus:');
for (const t of allNeeded) {
  console.log(`  ${t}: ${finalTableList.includes(t) ? '✓' : '✗ MISSING'}`);
}

await connection.end();
console.log('\n✅ Script concluído!');
