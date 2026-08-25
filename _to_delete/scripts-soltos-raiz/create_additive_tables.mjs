import 'dotenv/config';
import { createConnection } from "mysql2/promise";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
if (!ORIGINAL_DB_URL) throw new Error('DATABASE_URL não definido (.env)');

// Parse URL
const url = new URL(ORIGINAL_DB_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "4000"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log("✅ Conectado ao banco:", url.hostname);

const queries = [
  // Tabela budget_additives
  `CREATE TABLE IF NOT EXISTS budget_additives (
    id INT AUTO_INCREMENT PRIMARY KEY,
    budgetId INT NOT NULL,
    userId INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    status ENUM('elaboracao', 'aprovado', 'negado') NOT NULL DEFAULT 'elaboracao',
    frozenAt TIMESTAMP NULL,
    frozenBy VARCHAR(255) NULL,
    totalCostNoBdi DECIMAL(15,2) NOT NULL DEFAULT 0,
    totalCostWithBdi DECIMAL(15,2) NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX budget_additives_budgetId_idx (budgetId),
    INDEX budget_additives_userId_idx (userId),
    CONSTRAINT fk_budget_additives_budget FOREIGN KEY (budgetId) REFERENCES budgets(id) ON DELETE CASCADE,
    CONSTRAINT fk_budget_additives_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,

  // Tabela additive_stages
  `CREATE TABLE IF NOT EXISTS additive_stages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    additiveId INT NOT NULL,
    parentStageId INT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    \`order\` INT NOT NULL DEFAULT 0,
    totalCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX additive_stages_additiveId_idx (additiveId),
    INDEX additive_stages_parentStageId_idx (parentStageId),
    CONSTRAINT fk_additive_stages_additive FOREIGN KEY (additiveId) REFERENCES budget_additives(id) ON DELETE CASCADE,
    CONSTRAINT fk_additive_stages_parent FOREIGN KEY (parentStageId) REFERENCES additive_stages(id) ON DELETE CASCADE
  )`,

  // Tabela additive_items
  `CREATE TABLE IF NOT EXISTS additive_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    additiveId INT NOT NULL,
    stageId INT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'composition',
    compositionId INT NULL,
    description TEXT NOT NULL,
    unit VARCHAR(20) NOT NULL,
    quantity DECIMAL(15,3) NOT NULL,
    materialCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    laborCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    equipmentCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    serviceCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    otherCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    unitCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    totalCost DECIMAL(15,2) NOT NULL DEFAULT 0,
    \`order\` INT NOT NULL DEFAULT 0,
    applyBdiToMaterial TINYINT NOT NULL DEFAULT 1,
    applyBdiToLabor TINYINT NOT NULL DEFAULT 1,
    additionalIncrement DECIMAL(7,2) NOT NULL DEFAULT 0,
    discount DECIMAL(7,2) NOT NULL DEFAULT 0,
    aplicarEncargosSociais TINYINT NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX additive_items_additiveId_idx (additiveId),
    INDEX additive_items_stageId_idx (stageId),
    CONSTRAINT fk_additive_items_additive FOREIGN KEY (additiveId) REFERENCES budget_additives(id) ON DELETE CASCADE,
    CONSTRAINT fk_additive_items_stage FOREIGN KEY (stageId) REFERENCES additive_stages(id) ON DELETE SET NULL,
    CONSTRAINT fk_additive_items_composition FOREIGN KEY (compositionId) REFERENCES compositions(id) ON DELETE SET NULL
  )`,

  // Tabela additive_item_inputs
  `CREATE TABLE IF NOT EXISTS additive_item_inputs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    additiveItemId INT NOT NULL,
    inputId INT NOT NULL,
    coefficient DECIMAL(10,6) NOT NULL,
    unitCost DECIMAL(15,2) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX additive_item_inputs_additiveItemId_idx (additiveItemId),
    INDEX additive_item_inputs_inputId_idx (inputId),
    CONSTRAINT fk_additive_item_inputs_item FOREIGN KEY (additiveItemId) REFERENCES additive_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_additive_item_inputs_input FOREIGN KEY (inputId) REFERENCES inputs(id) ON DELETE CASCADE
  )`,

  // Tabela additive_measurements
  `CREATE TABLE IF NOT EXISTS additive_measurements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    additiveId INT NOT NULL,
    additiveItemId INT NOT NULL,
    period VARCHAR(7) NOT NULL,
    measuredPercent DECIMAL(7,4) NOT NULL DEFAULT 0,
    measuredValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX additive_measurements_additiveId_idx (additiveId),
    INDEX additive_measurements_additiveItemId_idx (additiveItemId),
    CONSTRAINT fk_additive_measurements_additive FOREIGN KEY (additiveId) REFERENCES budget_additives(id) ON DELETE CASCADE,
    CONSTRAINT fk_additive_measurements_item FOREIGN KEY (additiveItemId) REFERENCES additive_items(id) ON DELETE CASCADE
  )`,
];

for (const sql of queries) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
  try {
    await conn.execute(sql);
    console.log(`✅ Tabela '${tableName}' criada/verificada`);
  } catch (err) {
    console.error(`❌ Erro na tabela '${tableName}':`, err.message);
  }
}

await conn.end();
console.log("✅ Migração concluída!");
