// Versão genérica do fix-limpar-orfaos-1320001.mjs — recebe o budgetId por
// argumento, detecta automaticamente os itens órfãos (stageId NULL OU
// apontando pra uma etapa que não existe mais nesse orçamento) e limpa,
// recalculando budgets.totalCost com a fórmula exata do servidor.
//
// SEGURANÇA: dry-run por padrão. Só apaga/atualiza com --confirm.
//
// Uso:
//   node scripts/fix-limpar-orfaos.mjs <budgetId>            (dry-run)
//   node scripts/fix-limpar-orfaos.mjs <budgetId> --confirm  (executa)
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BUDGET_ID = Number(process.argv[2]);
const CONFIRM = process.argv.includes('--confirm');
if (!BUDGET_ID) {
  console.error('Uso: node scripts/fix-limpar-orfaos.mjs <budgetId> [--confirm]');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [[budget]] = await conn.query(
  `SELECT title, code, socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial, totalCost
   FROM budgets WHERE id = ?`,
  [BUDGET_ID]
);
if (!budget) {
  console.error(`Orçamento ${BUDGET_ID} não encontrado.`);
  await conn.end();
  process.exit(1);
}

console.log(`Orçamento ${BUDGET_ID} — ${budget.code || ''} "${budget.title || ''}"`);

const [allItems] = await conn.query(
  `SELECT id, stageId, parentItemId, type, description, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost,
          aplicarEncargosSociais, laborAdjustment, materialAdjustment, includeMaterialOverride, totalLaborHours
   FROM budget_items WHERE budgetId = ?`,
  [BUDGET_ID]
);
const [stages] = await conn.query(`SELECT id FROM budget_stages WHERE budgetId = ?`, [BUDGET_ID]);
const stageIds = new Set(stages.map(s => s.id));

const orphans = allItems.filter(i => !i.stageId || !stageIds.has(i.stageId));

console.log(`\n=== Itens órfãos detectados: ${orphans.length} ===`);
for (const o of orphans) {
  console.log(`Item ${o.id} [${o.type}] stageId=${o.stageId ?? 'NULL'} "${(o.description || '').slice(0, 60)}"`);
}

if (orphans.length === 0) {
  console.log('\nNenhum item órfão encontrado. Nada a fazer.');
  await conn.end();
  process.exit(0);
}

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

const orphanIds = new Set(orphans.map(o => o.id));
const items = allItems.filter(i => !orphanIds.has(i.id));

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
        const childMaterialAdj = Number(child.materialAdjustment || 0);
        const childLaborAdj = Number(child.laborAdjustment || 0);
        totalMaterial += (materialWithBDI * (1 + childMaterialAdj / 100)) * qty;
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

console.log('\n=== TOTAIS ===');
console.log('totalCost gravado hoje no banco:      R$', Number(budget.totalCost).toFixed(2));
console.log('Recalculado SEM os órfãos (novo):      R$', novoTotal.total.toFixed(2));
console.log('  material:', novoTotal.totalMaterial.toFixed(2), '| mão de obra:', novoTotal.totalLabor.toFixed(2), '| horas:', novoTotal.totalLaborHours.toFixed(2));

if (!CONFIRM) {
  console.log('\n[DRY-RUN] Nada foi gravado. Compare o "Recalculado SEM os órfãos" com o "Resumo do Orçamento" mostrado na tela.');
  console.log('Se bater, rode de novo com --confirm para aplicar.');
  await conn.end();
  process.exit(0);
}

console.log('\n[--confirm] Aplicando: apagando os itens órfãos e atualizando budgets.totalCost...');
const idsArray = Array.from(orphanIds);
await conn.query(`DELETE FROM budget_items WHERE id IN (${idsArray.map(() => '?').join(',')})`, idsArray);
await conn.query(
  `UPDATE budgets SET totalCost = ?, totalLaborHours = ? WHERE id = ?`,
  [novoTotal.total.toFixed(2), novoTotal.totalLaborHours.toFixed(2), BUDGET_ID]
);
console.log('Concluído. budgets.totalCost atualizado para', novoTotal.total.toFixed(2));

await conn.end();
