import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

console.log('Connected to database');

// Lista de SQLs a executar individualmente
const sqls = [
  // 1. Adicionar equipmentCost à tabela compositions
  `ALTER TABLE \`compositions\` ADD COLUMN \`equipmentCost\` DECIMAL(15,2) NOT NULL DEFAULT '0' COMMENT 'Custo de equipamento'`,
  
  // 2. Criar tabela measurement_periods se não existir
  `CREATE TABLE IF NOT EXISTS \`measurement_periods\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`budgetId\` int NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`startDate\` date,
    \`endDate\` date,
    \`status\` varchar(20) NOT NULL DEFAULT 'open',
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  
  // 3. Criar tabela measurement_items se não existir
  `CREATE TABLE IF NOT EXISTS \`measurement_items\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`periodId\` int NOT NULL,
    \`budgetId\` int NOT NULL,
    \`budgetItemId\` int NOT NULL,
    \`measuredQuantity\` decimal(15,3) NOT NULL DEFAULT '0',
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  
  // 4. Criar tabela contract_additives se não existir
  `CREATE TABLE IF NOT EXISTS \`contract_additives\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`budgetId\` int NOT NULL,
    \`title\` varchar(200) NOT NULL,
    \`description\` text,
    \`status\` varchar(20) NOT NULL DEFAULT 'draft',
    \`totalValue\` decimal(15,2) NOT NULL DEFAULT '0',
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

// Foreign keys (separadas para evitar erros se já existirem)
const fkSqls = [
  `ALTER TABLE \`measurement_periods\` ADD CONSTRAINT \`measurement_periods_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_periodId_fk\` FOREIGN KEY (\`periodId\`) REFERENCES \`measurement_periods\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`measurement_items\` ADD CONSTRAINT \`measurement_items_budgetItemId_fk\` FOREIGN KEY (\`budgetItemId\`) REFERENCES \`budget_items\`(\`id\`) ON DELETE CASCADE`,
  `ALTER TABLE \`contract_additives\` ADD CONSTRAINT \`contract_additives_budgetId_fk\` FOREIGN KEY (\`budgetId\`) REFERENCES \`budgets\`(\`id\`) ON DELETE CASCADE`,
];

// Índices
const indexSqls = [
  `CREATE INDEX \`measurement_periods_budgetId_idx\` ON \`measurement_periods\` (\`budgetId\`)`,
  `CREATE INDEX \`measurement_items_periodId_idx\` ON \`measurement_items\` (\`periodId\`)`,
  `CREATE INDEX \`measurement_items_budgetId_idx\` ON \`measurement_items\` (\`budgetId\`)`,
  `CREATE INDEX \`measurement_items_budgetItemId_idx\` ON \`measurement_items\` (\`budgetItemId\`)`,
  `CREATE UNIQUE INDEX \`measurement_items_unique\` ON \`measurement_items\` (\`periodId\`, \`budgetItemId\`)`,
  `CREATE INDEX \`contract_additives_budgetId_idx\` ON \`contract_additives\` (\`budgetId\`)`,
];

for (const sql of sqls) {
  try {
    await connection.execute(sql);
    console.log('✓ Executed:', sql.substring(0, 80));
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR' || err.message?.includes('already exists') || err.message?.includes('Duplicate column')) {
      console.log('⚠ Already exists (skipped):', sql.substring(0, 80));
    } else {
      console.error('✗ Error:', err.message, '\nSQL:', sql.substring(0, 100));
    }
  }
}

for (const sql of fkSqls) {
  try {
    await connection.execute(sql);
    console.log('✓ FK created:', sql.substring(0, 80));
  } catch (err) {
    console.log('⚠ FK skipped (may already exist):', err.message.substring(0, 80));
  }
}

for (const sql of indexSqls) {
  try {
    await connection.execute(sql);
    console.log('✓ Index created:', sql.substring(0, 80));
  } catch (err) {
    console.log('⚠ Index skipped (may already exist):', err.message.substring(0, 80));
  }
}

// Agora recalcular todos os equipmentCost das composições a partir dos insumos
console.log('\n--- Recalculando equipmentCost das composições ---');
const [compRows] = await connection.execute(`SELECT id FROM compositions`);
console.log(`Total de composições: ${compRows.length}`);

let updated = 0;
let errors = 0;

for (const comp of compRows) {
  try {
    // Buscar insumos da composição
    const [inputRows] = await connection.execute(`
      SELECT ci.coefficient, i.unitCost, i.type 
      FROM composition_inputs ci
      JOIN inputs i ON ci.inputId = i.id
      WHERE ci.compositionId = ?
    `, [comp.id]);
    
    let materialCost = 0;
    let laborCost = 0;
    let equipmentCost = 0;
    
    for (const inp of inputRows) {
      const cost = Number(inp.coefficient) * Number(inp.unitCost);
      const type = inp.type?.toLowerCase();
      if (type === 'material') {
        materialCost += cost;
      } else if (type === 'labor') {
        laborCost += cost;
      } else if (type === 'equipment') {
        equipmentCost += cost;
      }
    }
    
    if (inputRows.length > 0) {
      await connection.execute(`
        UPDATE compositions SET materialCost = ?, laborCost = ?, equipmentCost = ? WHERE id = ?
      `, [materialCost.toFixed(2), laborCost.toFixed(2), equipmentCost.toFixed(2), comp.id]);
      updated++;
    }
  } catch (err) {
    errors++;
    if (errors <= 5) console.error(`Error updating composition ${comp.id}:`, err.message);
  }
}

console.log(`✓ Composições atualizadas: ${updated}, erros: ${errors}`);

// Agora recalcular todos os budget_items do tipo 'composition' que não têm customizações
console.log('\n--- Recalculando equipmentCost dos itens de orçamento ---');
const [itemRows] = await connection.execute(`
  SELECT bi.id, bi.compositionId, bi.quantity
  FROM budget_items bi
  WHERE bi.type = 'composition' AND bi.compositionId IS NOT NULL
`);
console.log(`Total de itens de composição: ${itemRows.length}`);

let itemsUpdated = 0;
let itemsErrors = 0;

for (const item of itemRows) {
  try {
    // Verificar se há customizações
    const [customRows] = await connection.execute(`
      SELECT COUNT(*) as cnt FROM budget_item_inputs WHERE budgetItemId = ?
    `, [item.id]);
    
    const hasCustom = Number(customRows[0].cnt) > 0;
    
    if (hasCustom) {
      // Recalcular a partir das customizações
      const [customInputs] = await connection.execute(`
        SELECT bii.coefficient, bii.unitCost, i.type
        FROM budget_item_inputs bii
        JOIN inputs i ON bii.inputId = i.id
        WHERE bii.budgetItemId = ?
      `, [item.id]);
      
      let mat = 0, lab = 0, eqp = 0;
      for (const ci of customInputs) {
        const cost = Number(ci.coefficient) * Number(ci.unitCost);
        const type = ci.type?.toLowerCase();
        if (type === 'material') mat += cost;
        else if (type === 'labor') lab += cost;
        else if (type === 'equipment') eqp += cost;
      }
      
      const unitCost = mat + lab + eqp;
      const totalCost = Number(item.quantity) * unitCost;
      
      await connection.execute(`
        UPDATE budget_items SET materialCost = ?, laborCost = ?, equipmentCost = ?, unitCost = ?, totalCost = ? WHERE id = ?
      `, [mat.toFixed(2), lab.toFixed(2), eqp.toFixed(2), unitCost.toFixed(2), totalCost.toFixed(2), item.id]);
    } else {
      // Usar valores da composição
      const [compData] = await connection.execute(`
        SELECT materialCost, laborCost, equipmentCost FROM compositions WHERE id = ?
      `, [item.compositionId]);
      
      if (compData[0]) {
        const mat = Number(compData[0].materialCost);
        const lab = Number(compData[0].laborCost);
        const eqp = Number(compData[0].equipmentCost);
        const unitCost = mat + lab + eqp;
        const totalCost = Number(item.quantity) * unitCost;
        
        await connection.execute(`
          UPDATE budget_items SET materialCost = ?, laborCost = ?, equipmentCost = ?, unitCost = ?, totalCost = ? WHERE id = ?
        `, [mat.toFixed(2), lab.toFixed(2), eqp.toFixed(2), unitCost.toFixed(2), totalCost.toFixed(2), item.id]);
      }
    }
    itemsUpdated++;
  } catch (err) {
    itemsErrors++;
    if (itemsErrors <= 5) console.error(`Error updating item ${item.id}:`, err.message);
  }
}

console.log(`✓ Itens de orçamento atualizados: ${itemsUpdated}, erros: ${itemsErrors}`);

await connection.end();
console.log('\n✅ Migração concluída!');
