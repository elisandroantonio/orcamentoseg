/**
 * Script para criar tabelas faltantes no banco TiDB
 * Tabelas: categories, projects, budget_item_bdi_config, schedule_activities,
 * schedule_periods, disbursements, company_settings, budget_templates,
 * template_stages, template_items, budget_schedule_periods, budget_schedule_items,
 * budget_monthly_distribution
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
// TABELA: categories
// ============================================================
if (!tables.includes('categories')) {
  await execSQL(`
    CREATE TABLE \`categories\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`code\` varchar(10) NOT NULL,
      \`name\` varchar(100) NOT NULL,
      \`description\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`categories_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE categories');
  await execSQL(`CREATE INDEX \`categories_userId_idx\` ON \`categories\` (\`userId\`)`, 'INDEX categories_userId_idx');
  await execSQL(`CREATE INDEX \`categories_code_idx\` ON \`categories\` (\`code\`)`, 'INDEX categories_code_idx');
  await execSQL(`ALTER TABLE \`categories\` ADD CONSTRAINT \`categories_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade`, 'FK categories_userId');
}

// ============================================================
// TABELA: projects
// ============================================================
if (!tables.includes('projects')) {
  await execSQL(`
    CREATE TABLE \`projects\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`name\` varchar(255) NOT NULL,
      \`client\` varchar(255),
      \`location\` text,
      \`description\` text,
      \`startDate\` date,
      \`endDate\` date,
      \`status\` enum('active','completed','archived') NOT NULL DEFAULT 'active',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`projects_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE projects');
  await execSQL(`CREATE INDEX \`projects_userId_idx\` ON \`projects\` (\`userId\`)`, 'INDEX projects_userId_idx');
  await execSQL(`ALTER TABLE \`projects\` ADD CONSTRAINT \`projects_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade`, 'FK projects_userId');
}

// ============================================================
// TABELA: budget_item_bdi_config
// ============================================================
if (!tables.includes('budget_item_bdi_config')) {
  await execSQL(`
    CREATE TABLE \`budget_item_bdi_config\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetItemId\` int NOT NULL,
      \`applyBdiToMaterial\` tinyint NOT NULL DEFAULT 1,
      \`applyBdiToLabor\` tinyint NOT NULL DEFAULT 1,
      \`additionalIncrement\` decimal(7,2) NOT NULL DEFAULT '0',
      \`discount\` decimal(7,2) NOT NULL DEFAULT '0',
      \`aplicarEncargosSociais\` tinyint NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_item_bdi_config_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_item_bdi_config');
  await execSQL(`CREATE UNIQUE INDEX \`budget_item_bdi_config_budgetItemId_idx\` ON \`budget_item_bdi_config\` (\`budgetItemId\`)`, 'INDEX budget_item_bdi_config_budgetItemId_idx');
  await execSQL(`ALTER TABLE \`budget_item_bdi_config\` ADD CONSTRAINT \`budget_item_bdi_config_budgetItemId_fk\` FOREIGN KEY (\`budgetItemId\`) REFERENCES \`budget_items\`(\`id\`) ON DELETE cascade`, 'FK budget_item_bdi_config_budgetItemId');
}

// ============================================================
// TABELA: company_settings
// ============================================================
if (!tables.includes('company_settings')) {
  await execSQL(`
    CREATE TABLE \`company_settings\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`companyName\` varchar(255),
      \`cnpj\` varchar(18),
      \`address\` text,
      \`phone\` varchar(20),
      \`email\` varchar(320),
      \`logoUrl\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`company_settings_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE company_settings');
  await execSQL(`CREATE UNIQUE INDEX \`company_settings_userId_idx\` ON \`company_settings\` (\`userId\`)`, 'INDEX company_settings_userId_idx');
  await execSQL(`ALTER TABLE \`company_settings\` ADD CONSTRAINT \`company_settings_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade`, 'FK company_settings_userId');
}

// ============================================================
// TABELA: budget_templates
// ============================================================
if (!tables.includes('budget_templates')) {
  await execSQL(`
    CREATE TABLE \`budget_templates\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`name\` varchar(255) NOT NULL,
      \`description\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_templates_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_templates');
  await execSQL(`CREATE INDEX \`budget_templates_userId_idx\` ON \`budget_templates\` (\`userId\`)`, 'INDEX budget_templates_userId_idx');
  await execSQL(`ALTER TABLE \`budget_templates\` ADD CONSTRAINT \`budget_templates_userId_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade`, 'FK budget_templates_userId');
}

// ============================================================
// TABELA: template_stages
// ============================================================
if (!tables.includes('template_stages')) {
  await execSQL(`
    CREATE TABLE \`template_stages\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`templateId\` int NOT NULL,
      \`parentId\` int,
      \`name\` varchar(255) NOT NULL,
      \`description\` text,
      \`order\` int NOT NULL DEFAULT 0,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`template_stages_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE template_stages');
  await execSQL(`CREATE INDEX \`template_stages_templateId_idx\` ON \`template_stages\` (\`templateId\`)`, 'INDEX template_stages_templateId_idx');
  await execSQL(`CREATE INDEX \`template_stages_parentId_idx\` ON \`template_stages\` (\`parentId\`)`, 'INDEX template_stages_parentId_idx');
  await execSQL(`ALTER TABLE \`template_stages\` ADD CONSTRAINT \`template_stages_templateId_fk\` FOREIGN KEY (\`templateId\`) REFERENCES \`budget_templates\`(\`id\`) ON DELETE cascade`, 'FK template_stages_templateId');
}

// ============================================================
// TABELA: template_items
// ============================================================
if (!tables.includes('template_items')) {
  await execSQL(`
    CREATE TABLE \`template_items\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`templateStageId\` int NOT NULL,
      \`type\` enum('composition','input','service') NOT NULL,
      \`compositionId\` int,
      \`inputId\` int,
      \`code\` varchar(50),
      \`description\` text NOT NULL,
      \`unit\` varchar(10) NOT NULL,
      \`quantity\` decimal(10,2) NOT NULL DEFAULT '1.00',
      \`materialCost\` decimal(15,2),
      \`laborCost\` decimal(15,2),
      \`equipmentCost\` decimal(15,2),
      \`serviceCost\` decimal(15,2),
      \`otherCost\` decimal(15,2),
      \`aplicarBdiMaterial\` tinyint(1) DEFAULT 1,
      \`aplicarBdiMaoObra\` tinyint(1) DEFAULT 1,
      \`aplicarEncargosSociais\` tinyint(1) DEFAULT 1,
      \`incrementoAdicional\` decimal(5,2) DEFAULT '0.00',
      \`order\` int NOT NULL DEFAULT 0,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`template_items_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE template_items');
  await execSQL(`CREATE INDEX \`template_items_templateStageId_idx\` ON \`template_items\` (\`templateStageId\`)`, 'INDEX template_items_templateStageId_idx');
  await execSQL(`ALTER TABLE \`template_items\` ADD CONSTRAINT \`template_items_templateStageId_fk\` FOREIGN KEY (\`templateStageId\`) REFERENCES \`template_stages\`(\`id\`) ON DELETE cascade`, 'FK template_items_templateStageId');
}

// ============================================================
// TABELA: budget_schedule_periods
// ============================================================
if (!tables.includes('budget_schedule_periods')) {
  await execSQL(`
    CREATE TABLE \`budget_schedule_periods\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetId\` int NOT NULL,
      \`periodNumber\` int NOT NULL,
      \`periodName\` varchar(50) NOT NULL,
      \`startDate\` date NOT NULL,
      \`endDate\` date NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`budget_schedule_periods_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_schedule_periods');
  await execSQL(`CREATE INDEX \`budget_schedule_periods_budgetId_idx\` ON \`budget_schedule_periods\` (\`budgetId\`)`, 'INDEX budget_schedule_periods_budgetId_idx');
  await execSQL(`ALTER TABLE \`budget_schedule_periods\` ADD CONSTRAINT \`budget_schedule_periods_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade`, 'FK budget_schedule_periods_budgetId');
}

// ============================================================
// TABELA: budget_schedule_items
// ============================================================
if (!tables.includes('budget_schedule_items')) {
  await execSQL(`
    CREATE TABLE \`budget_schedule_items\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetId\` int NOT NULL,
      \`stageId\` int NOT NULL,
      \`periodId\` int NOT NULL,
      \`percentPlanned\` decimal(5,2) NOT NULL DEFAULT '0',
      \`percentExecuted\` decimal(5,2) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_schedule_items_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_schedule_items');
  await execSQL(`CREATE INDEX \`budget_schedule_items_budgetId_idx\` ON \`budget_schedule_items\` (\`budgetId\`)`, 'INDEX budget_schedule_items_budgetId_idx');
  await execSQL(`CREATE INDEX \`budget_schedule_items_stageId_idx\` ON \`budget_schedule_items\` (\`stageId\`)`, 'INDEX budget_schedule_items_stageId_idx');
  await execSQL(`CREATE INDEX \`budget_schedule_items_periodId_idx\` ON \`budget_schedule_items\` (\`periodId\`)`, 'INDEX budget_schedule_items_periodId_idx');
  await execSQL(`ALTER TABLE \`budget_schedule_items\` ADD CONSTRAINT \`budget_schedule_items_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade`, 'FK budget_schedule_items_budgetId');
  await execSQL(`ALTER TABLE \`budget_schedule_items\` ADD CONSTRAINT \`budget_schedule_items_stageId_fk\` FOREIGN KEY (\`stageId\`) REFERENCES \`budget_stages\`(\`id\`) ON DELETE cascade`, 'FK budget_schedule_items_stageId');
  await execSQL(`ALTER TABLE \`budget_schedule_items\` ADD CONSTRAINT \`budget_schedule_items_periodId_fk\` FOREIGN KEY (\`periodId\`) REFERENCES \`budget_schedule_periods\`(\`id\`) ON DELETE cascade`, 'FK budget_schedule_items_periodId');
}

// ============================================================
// TABELA: budget_monthly_distribution
// ============================================================
if (!tables.includes('budget_monthly_distribution')) {
  await execSQL(`
    CREATE TABLE \`budget_monthly_distribution\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`budgetId\` int NOT NULL,
      \`stageId\` int NOT NULL,
      \`periodIndex\` int NOT NULL,
      \`periodLabel\` varchar(50) NOT NULL,
      \`percentage\` decimal(5,2) NOT NULL DEFAULT '0',
      \`value\` decimal(15,2) NOT NULL DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`budget_monthly_distribution_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE budget_monthly_distribution');
  await execSQL(`CREATE INDEX \`budget_monthly_distribution_budgetId_idx\` ON \`budget_monthly_distribution\` (\`budgetId\`)`, 'INDEX budget_monthly_distribution_budgetId_idx');
  await execSQL(`CREATE INDEX \`budget_monthly_distribution_stageId_idx\` ON \`budget_monthly_distribution\` (\`stageId\`)`, 'INDEX budget_monthly_distribution_stageId_idx');
  await execSQL(`ALTER TABLE \`budget_monthly_distribution\` ADD CONSTRAINT \`budget_monthly_distribution_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE cascade`, 'FK budget_monthly_distribution_budgetId');
  await execSQL(`ALTER TABLE \`budget_monthly_distribution\` ADD CONSTRAINT \`budget_monthly_distribution_stageId_fk\` FOREIGN KEY (\`stageId\`) REFERENCES \`budget_stages\`(\`id\`) ON DELETE cascade`, 'FK budget_monthly_distribution_stageId');
}

// Tabelas que existem no schema mas não são críticas para o funcionamento atual
// (schedule_activities, schedule_periods, disbursements) - podem ser criadas depois

// ============================================================
// Status final
// ============================================================
const [finalTables] = await connection.execute('SHOW TABLES');
const finalTableList = finalTables.map(r => Object.values(r)[0]);

const allNeeded = [
  'categories', 'projects', 'budget_item_bdi_config', 'company_settings',
  'budget_templates', 'template_stages', 'template_items',
  'budget_schedule_periods', 'budget_schedule_items', 'budget_monthly_distribution'
];
console.log('\nStatus:');
for (const t of allNeeded) {
  console.log(`  ${t}: ${finalTableList.includes(t) ? '✓' : '✗ MISSING'}`);
}

await connection.end();
console.log('\n✅ Script concluído!');
