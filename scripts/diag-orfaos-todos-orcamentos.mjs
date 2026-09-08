// Varre TODOS os orçamentos procurando o mesmo bug do ORC-2026-047: itens de
// budget_items com stageId que não existe (ou é NULL) em budget_stages —
// itens "fantasmas" que ficam invisíveis na tela (getStages agrupa por etapa)
// mas continuam sendo somados em budgets.totalCost (recalculateBudgetTotals
// não filtra por etapa). Causado pela mutation deleteStage, que até agora só
// apagava a etapa e nunca os itens dela (corrigido em server/routers.ts).
//
// Uso: node scripts/diag-orfaos-todos-orcamentos.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [budgets] = await conn.query(
  `SELECT id, title, code, totalCost FROM budgets`
);

console.log(`Analisando ${budgets.length} orçamentos...\n`);

let orcamentosAfetados = 0;
let totalItensOrfaos = 0;

for (const budget of budgets) {
  const [items] = await conn.query(
    `SELECT id, stageId, parentItemId, type, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost
     FROM budget_items WHERE budgetId = ?`,
    [budget.id]
  );
  if (items.length === 0) continue;

  const [stages] = await conn.query(
    `SELECT id FROM budget_stages WHERE budgetId = ?`,
    [budget.id]
  );
  const stageIds = new Set(stages.map(s => s.id));

  const orfaos = items.filter(i => !i.stageId || !stageIds.has(i.stageId));
  if (orfaos.length === 0) continue;

  orcamentosAfetados++;
  totalItensOrfaos += orfaos.length;

  const somaBruta = orfaos.reduce((acc, i) =>
    acc + Number(i.materialCost || 0) * Number(i.quantity || 0)
        + Number(i.laborCost || 0) * Number(i.quantity || 0)
        + Number(i.equipmentCost || 0) * Number(i.quantity || 0)
        + Number(i.serviceCost || 0) * Number(i.quantity || 0)
        + Number(i.otherCost || 0) * Number(i.quantity || 0), 0);

  console.log(`Orçamento ${budget.id} "${budget.name}" (totalCost atual: R$ ${Number(budget.totalCost).toFixed(2)})`);
  console.log(`  -> ${orfaos.length} item(ns) órfão(s) [sem BDI, valor bruto aproximado: R$ ${somaBruta.toFixed(2)}]`);
  for (const o of orfaos) {
    console.log(`     item ${o.id} [${o.type}] parentItemId=${o.parentItemId ?? '-'} stageId=${o.stageId ?? 'NULL'}`);
  }
  console.log('');
}

console.log('=== RESUMO ===');
console.log(`Orçamentos afetados: ${orcamentosAfetados} de ${budgets.length}`);
console.log(`Total de itens órfãos encontrados: ${totalItensOrfaos}`);

await conn.end();
