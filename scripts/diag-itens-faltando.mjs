// Encontra itens de budget_items que NÃO apareceriam em getStages/allItems no
// cliente — ou porque o stageId do item não existe em budget_stages, ou porque
// é um filho (parentItemId) cujo pai não existe/não é composite.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const budgetId = Number(process.argv[2]);
if (!budgetId) {
  console.error('Uso: node scripts/diag-itens-faltando.mjs <budgetId>');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [items] = await conn.query(
  `SELECT id, stageId, parentItemId, type, description, quantity, materialCost, laborCost
   FROM budget_items WHERE budgetId = ?`,
  [budgetId]
);
const [stages] = await conn.query(
  `SELECT id, name, parentStageId FROM budget_stages WHERE budgetId = ?`,
  [budgetId]
);

const stageIds = new Set(stages.map(s => s.id));
const itemsById = new Map(items.map(i => [i.id, i]));

console.log(`Total de budget_items: ${items.length}`);
console.log(`Total de budget_stages: ${stages.length}`);

console.log('\n=== Itens cujo stageId NÃO existe em budget_stages (órfãos de etapa) ===');
let orfaosDeEtapa = 0;
for (const item of items) {
  if (item.stageId && !stageIds.has(item.stageId)) {
    orfaosDeEtapa++;
    console.log(`Item ${item.id} [${item.type}] "${(item.description||'').slice(0,60)}" stageId=${item.stageId} (não existe) qty=${item.quantity} mat=${item.materialCost} lab=${item.laborCost}`);
  }
  if (!item.stageId) {
    console.log(`Item ${item.id} [${item.type}] "${(item.description||'').slice(0,60)}" SEM stageId (null)`);
  }
}
console.log(`Total órfãos de etapa: ${orfaosDeEtapa}`);

console.log('\n=== Itens filhos (parentItemId) cujo pai NÃO existe ou não é composite ===');
let orfaosDePai = 0;
for (const item of items) {
  if (item.parentItemId) {
    const parent = itemsById.get(item.parentItemId);
    if (!parent) {
      orfaosDePai++;
      console.log(`Item ${item.id} [${item.type}] "${(item.description||'').slice(0,60)}" parentItemId=${item.parentItemId} (PAI NÃO EXISTE)`);
    } else if (parent.type !== 'composite') {
      orfaosDePai++;
      console.log(`Item ${item.id} [${item.type}] "${(item.description||'').slice(0,60)}" parentItemId=${item.parentItemId} (pai existe mas type=${parent.type}, não é composite)`);
    }
  }
}
console.log(`Total órfãos de pai: ${orfaosDePai}`);

// Simula a contagem client-side: root items (sem parentItemId) não-composite +
// filhos de composite (com stageId existente, já que getStages agrupa por etapa)
const rootItems = items.filter(i => !i.parentItemId);
let clientCount = 0;
const contadosIds = [];
for (const item of rootItems) {
  // getStages só inclui o item se o stageId dele bater com uma etapa existente
  if (item.stageId && !stageIds.has(item.stageId)) continue;
  if (item.type === 'composite') {
    const children = items.filter(c => c.parentItemId === item.id);
    for (const child of children) {
      clientCount++;
      contadosIds.push(child.id);
    }
  } else {
    clientCount++;
    contadosIds.push(item.id);
  }
}
console.log(`\nContagem simulada (respeitando stageId órfão) que o cliente deveria montar: ${clientCount}`);

await conn.end();
