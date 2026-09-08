// Limpa os 3 itens fantasmas do orçamento ORC-2026-047 (id 1320001),
// confirmados pelo usuário como itens que ele já havia deletado do
// orçamento (mas que sobreviveram como órfãos por causa do bug do
// deleteStage — corrigido em server/routers.ts). Depois de apagar,
// recalcula budgets.totalCost com a MESMA fórmula exata do servidor
// (idêntica à usada em diag-server-vs-client-exato.mjs, já validada
// com 0 divergência item a item contra server/db.ts).
//
// SEGURANÇA: por padrão roda em modo DRY-RUN (só mostra o que faria,
// não grava nada). Só apaga/atualiza de verdade se rodar com --confirm.
//
// Uso:
//   node scripts/fix-limpar-orfaos-1320001.mjs            (dry-run, seguro)
//   node scripts/fix-limpar-orfaos-1320001.mjs --confirm  (executa de verdade)
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BUDGET_ID = 1320001;
const ORPHAN_IDS = [13530021, 13530165, 13530231];
const CONFIRM = process.argv.includes('--confirm');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1) Reconfirma que são exatamente esses 3 e que continuam órfãos (stageId
//    NULL) antes de tocar em qualquer coisa — não confia em nada hardcoded
//    sem checar de novo contra o banco ao vivo.
const [rows] = await conn.query(
  `SELECT id, budgetId, stageId, type, description, quantity, materialCost, laborCost
   FROM budget_items WHERE id IN (?, ?, ?)`,
  ORPHAN_IDS
);

console.log('=== Itens encontrados (verificação antes de apagar) ===');
for (const r of rows) {
  console.log(`Item ${r.id} budgetId=${r.budgetId} stageId=${r.stageId ?? 'NULL'} type=${r.type} "${(r.description||'').slice(0,60)}"`);
}

const problemas = [];
if (rows.length !== ORPHAN_IDS.length) problemas.push(`Esperava 3 itens, encontrou ${rows.length}.`);
for (const r of rows) {
  if (r.budgetId !== BUDGET_ID) problemas.push(`Item ${r.id} pertence ao orçamento ${r.budgetId}, não ${BUDGET_ID}.`);
  if (r.stageId !== null) problemas.push(`Item ${r.id} tem stageId=${r.stageId} (não é mais NULL) — pode já ter sido corrigido ou não é mais o mesmo item órfão.`);
}
if (problemas.length > 0) {
  console.log('\n!!! ABORTANDO — dados não batem com o esperado:');
  problemas.forEach(p => console.log(' - ' + p));
  await conn.end();
  process.exit(1);
}
console.log('\nVerificação OK: os 3 itens ainda existem, pertencem ao orçamento certo e continuam com stageId=NULL.');

// 2) Calcula o novo total (SEM os 3 itens órfãos), com a fórmula exata do
//    servidor (server/db.ts recalculateBudgetTotals).
const [[budget]] = await conn.query(
  `SELECT socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial, totalCost
   FROM budgets WHERE id = ?`,
  [BUDGET_ID]
);
const socialCharges = Number(budget.socialCharges || 0);
const adminCentral = Number(budget.adminCentral || 0);
const profit = Number(budget.profit || 0);
const taxes = Number(budget.taxes || 0);
const risk = Number(budget.risk || 0);
const warranty = Number(budget.warranty || 0);
const includeMaterial = Boolean(budget.includeMaterial);

const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
  const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
  const denominator = 1 - profit / 100 - taxes / 100;
  const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
  const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
  return 1 + adjustedBDI;
};

const [allItems] = await conn.query(
  `SELECT id, parentItemId, type, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost,
          aplicarEncargosSociais, laborAdjustment, materialAdjustment, includeMaterialOverride, totalLaborHours
   FROM budget_items WHERE budgetId = ?`,
  [BUDGET_ID]
);
const orphanSet = new Set(ORPHAN_IDS);
const items = allItems.filter(i => !orphanSet.has(i.id));

const [bdiRows] = await conn.query(
  `SELECT budgetItemId, applyBdiToMaterial, applyBdiToLabor, additionalIncrement, discount
   FROM budget_item_bdi_config WHERE budgetItemId IN (${items.map(i => i.id).join(',') || '0'})`
);
const bdiConfigs = {};
for (const r of bdiRows) {
  bdiConfigs[r.budgetItemId] = {
    applyBdiToMaterial: Boolean(r.applyBdiToMaterial),
    applyBdiToLabor: Boolean(r.applyBdiToLabor),
    additionalIncrement: Number(r.additionalIncrement || 0),
    discount: Number(r.discount || 0),
  };
}

const itemUnitWithBdi = (item) => {
  const material = Number(item.materialCost || 0);
  const labor = Number(item.laborCost || 0);
  const equipment = Number(item.equipmentCost || 0);
  const service = Number(item.serviceCost || 0);
  const other = Number(item.otherCost || 0);
  const effectiveMaterial = (includeMaterial || item.includeMaterialOverride === 1) ? material : 0;
  const config = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
  const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
  const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
  const bdiMultiplier = calcBDIMultiplier(config.additionalIncrement, config.discount);
  const materialWithBDI = config.applyBdiToMaterial ? effectiveMaterial * bdiMultiplier : effectiveMaterial;
  const laborWithBDI = config.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
  const equipmentWithBDI = equipment * bdiMultiplier;
  const serviceWithBDI = service * bdiMultiplier;
  const otherWithBDI = other * bdiMultiplier;
  const totalLabor = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
  return { materialWithBDI, totalLabor };
};

function calcTotal(itemList) {
  let totalMaterial = 0;
  let totalLabor = 0;
  let totalLaborHours = 0;
  const childrenByParent = new Map();
  for (const item of itemList) {
    if (item.parentItemId) {
      const list = childrenByParent.get(item.parentItemId) || [];
      list.push(item);
      childrenByParent.set(item.parentItemId, list);
    }
  }
  const rootItems = itemList.filter((i) => !i.parentItemId);
  for (const item of rootItems) {
    if (item.type === 'composite') {
      const children = childrenByParent.get(item.id) || [];
      for (const child of children) {
        const qty = Number(child.quantity || 0);
        const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(child);
        const childLaborAdj = Number(child.laborAdjustment || 0);
        totalMaterial += materialWithBDI * qty;
        totalLabor += (tl * (1 + childLaborAdj / 100)) * qty;
        totalLaborHours += Number(child.totalLaborHours || 0);
      }
      continue;
    }
    const qty = Number(item.quantity || 0);
    const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(item);
    const matAdjPct = Number(item.materialAdjustment || 0);
    const laborAdjPct = Number(item.laborAdjustment || 0);
    totalMaterial += (materialWithBDI * qty) * (1 + matAdjPct / 100);
    totalLabor += (tl * qty) * (1 + laborAdjPct / 100);
    totalLaborHours += Number(item.totalLaborHours || 0);
  }
  return { total: totalMaterial + totalLabor, totalMaterial, totalLabor, totalLaborHours };
}

const novoTotal = calcTotal(items);
const totalAtualComFantasmas = calcTotal(allItems);

console.log('\n=== TOTAIS ===');
console.log('totalCost gravado hoje no banco:      R$', Number(budget.totalCost).toFixed(2));
console.log('Recalculado COM os 3 fantasmas:        R$', totalAtualComFantasmas.total.toFixed(2));
console.log('Recalculado SEM os 3 fantasmas (novo): R$', novoTotal.total.toFixed(2));
console.log('  material:', novoTotal.totalMaterial.toFixed(2), '| mão de obra:', novoTotal.totalLabor.toFixed(2), '| horas:', novoTotal.totalLaborHours.toFixed(2));

if (!CONFIRM) {
  console.log('\n[DRY-RUN] Nada foi gravado. Confira os valores acima.');
  console.log('Se o "Recalculado SEM os 3 fantasmas" bater com o valor mostrado na tela (Comp. BDI / Resumo), rode de novo com --confirm para aplicar.');
  await conn.end();
  process.exit(0);
}

console.log('\n[--confirm] Aplicando: apagando os 3 itens e atualizando budgets.totalCost...');
await conn.query(`DELETE FROM budget_items WHERE id IN (?, ?, ?)`, ORPHAN_IDS);
await conn.query(
  `UPDATE budgets SET totalCost = ?, totalLaborHours = ? WHERE id = ?`,
  [novoTotal.total.toFixed(2), novoTotal.totalLaborHours.toFixed(2), BUDGET_ID]
);
console.log('Concluído. budgets.totalCost atualizado para', novoTotal.total.toFixed(2));

await conn.end();
