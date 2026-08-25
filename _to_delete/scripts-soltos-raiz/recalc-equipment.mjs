/**
 * Script para recalcular equipmentCost nas compositions
 * usando a estrutura real do banco remoto:
 * - compositions (tem: id, substageId, stageId, budgetId, name, ...)
 * - inputs (tem: id, compositionId, type, coefficient, unitValue, ...)
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const connection = await mysql.createConnection(DATABASE_URL);

console.log('Connected to database');

// Buscar todas as composições
const [comps] = await connection.execute(`SELECT id, name FROM compositions`);
console.log(`Total de composições: ${comps.length}`);

let updated = 0;
let errors = 0;

for (const comp of comps) {
  try {
    // Buscar insumos da composição usando a tabela 'inputs' do banco remoto
    const [inputRows] = await connection.execute(`
      SELECT coefficient, unitValue, type 
      FROM inputs
      WHERE compositionId = ?
    `, [comp.id]);
    
    let materialCost = 0;
    let laborCost = 0;
    let equipmentCost = 0;
    
    for (const inp of inputRows) {
      const cost = Number(inp.coefficient) * Number(inp.unitValue);
      const type = inp.type?.toLowerCase();
      if (type === 'material') {
        materialCost += cost;
      } else if (type === 'labor') {
        laborCost += cost;
      } else if (type === 'equipment') {
        equipmentCost += cost;
      }
    }
    
    // Atualizar a composição com os custos calculados
    // Nota: compositions tem unitValueMaterial, unitValueLabor, unitValueEquipment
    // mas também agora tem equipmentCost (que acabamos de adicionar)
    // Vamos atualizar apenas o equipmentCost (novo campo)
    await connection.execute(`
      UPDATE compositions SET equipmentCost = ? WHERE id = ?
    `, [equipmentCost.toFixed(2), comp.id]);
    
    if (equipmentCost > 0) {
      console.log(`  Composição ${comp.id} "${comp.name}": equipmentCost = R$ ${equipmentCost.toFixed(2)}`);
    }
    
    updated++;
  } catch (err) {
    errors++;
    console.error(`Error updating composition ${comp.id}:`, err.message);
  }
}

console.log(`\n✓ Composições atualizadas: ${updated}, erros: ${errors}`);

// Verificar o orçamento 570002 (ou qualquer orçamento existente)
const [budgets] = await connection.execute(`SELECT id, title FROM budgets LIMIT 10`);
console.log('\nOrçamentos no banco:');
budgets.forEach(b => console.log(`  ${b.id}: ${b.title}`));

// Verificar composições com equipamento no orçamento 570002
const [compWithEq] = await connection.execute(`
  SELECT c.id, c.name, c.equipmentCost, c.stageId, s.name as stageName
  FROM compositions c
  JOIN stages s ON c.stageId = s.id
  WHERE c.budgetId = 570002 AND c.equipmentCost > 0
  ORDER BY c.stageId, c.order
`);

if (compWithEq.length > 0) {
  console.log(`\nComposições com equipamento no orçamento 570002:`);
  compWithEq.forEach(c => console.log(`  Etapa ${c.stageId} "${c.stageName}" - ${c.name}: R$ ${c.equipmentCost}`));
} else {
  console.log('\nNenhuma composição com equipamento encontrada no orçamento 570002');
}

await connection.end();
console.log('\n✅ Recálculo concluído!');
