// Diagnóstico definitivo: replica EXATAMENTE a fórmula do servidor
// (server/db.ts recalculateBudgetTotals) e a fórmula ATUAL do cliente
// (client/src/pages/BudgetForm.tsx, bloco "Resumo do Orçamento com BDI",
// pós-correções de hoje) usando os MESMOS dados brutos do banco, e mostra
// onde exatamente elas divergem, item a item.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const budgetId = Number(process.argv[2]);
if (!budgetId) {
  console.error('Uso: node scripts/diag-server-vs-client-exato.mjs <budgetId>');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [[budget]] = await conn.query(
  `SELECT socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial, totalCost
   FROM budgets WHERE id = ?`,
  [budgetId]
);

const socialCharges = Number(budget.socialCharges || 0);
const adminCentral = Number(budget.adminCentral || 0);
const profit = Number(budget.profit || 0);
const taxes = Number(budget.taxes || 0);
const risk = Number(budget.risk || 0);
const warranty = Number(budget.warranty || 0);
const includeMaterial = Boolean(budget.includeMaterial);

console.log('=== PARÂMETROS DO ORÇAMENTO ===');
console.log({ socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial, totalCostAtual: budget.totalCost });

const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
  const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
  const denominator = 1 - profit / 100 - taxes / 100;
  const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
  const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
  return 1 + adjustedBDI;
};

const [items] = await conn.query(
  `SELECT id, parentItemId, type, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost,
          aplicarEncargosSociais, laborAdjustment, materialAdjustment, includeMaterialOverride
   FROM budget_items WHERE budgetId = ?`,
  [budgetId]
);

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

// ===== FÓRMULA DO SERVIDOR (server/db.ts recalculateBudgetTotals) =====
function calcServerTotal() {
  let totalMaterial = 0;
  let totalLabor = 0;
  const childrenByParent = new Map();
  for (const item of items) {
    if (item.parentItemId) {
      const list = childrenByParent.get(item.parentItemId) || [];
      list.push(item);
      childrenByParent.set(item.parentItemId, list);
    }
  }
  const rootItems = items.filter((i) => !i.parentItemId);
  const perItem = [];
  for (const item of rootItems) {
    if (item.type === 'composite') {
      const children = childrenByParent.get(item.id) || [];
      for (const child of children) {
        const qty = Number(child.quantity || 0);
        const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(child);
        const childLaborAdj = Number(child.laborAdjustment || 0);
        const mat = materialWithBDI * qty;
        const lab = (tl * (1 + childLaborAdj / 100)) * qty;
        totalMaterial += mat;
        totalLabor += lab;
        perItem.push({ id: child.id, mat, lab });
      }
      continue;
    }
    const qty = Number(item.quantity || 0);
    const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(item);
    const matAdjPct = Number(item.materialAdjustment || 0);
    const laborAdjPct = Number(item.laborAdjustment || 0);
    const mat = (materialWithBDI * qty) * (1 + matAdjPct / 100);
    const lab = (tl * qty) * (1 + laborAdjPct / 100);
    totalMaterial += mat;
    totalLabor += lab;
    perItem.push({ id: item.id, mat, lab });
  }
  return { total: totalMaterial + totalLabor, totalMaterial, totalLabor, perItem };
}

const itemsById = new Map(items.map(i => [i.id, i]));

// ===== FÓRMULA ATUAL DO CLIENTE (BudgetForm.tsx, bloco "Comp. BDI" pós-fix) =====
function calcClientTotal() {
  // allItems no cliente = itens raiz com children aninhados; itemsForCardBdi
  // faz flatMap: composto -> filhos (perde a distinção "é filho de composto").
  const rootItems = items.filter((i) => !i.parentItemId);
  const itemsForCardBdi = [];
  for (const item of rootItems) {
    if (item.type === 'composite') {
      const children = items.filter(c => c.parentItemId === item.id);
      for (const child of children) itemsForCardBdi.push(child);
    } else {
      itemsForCardBdi.push(item);
    }
  }

  let totalMaterial = 0;
  let totalLabor = 0;
  const perItem = [];
  for (const item of itemsForCardBdi) {
    const qty = Number(item.quantity || 0);
    const material = Number(item.materialCost || 0);
    const labor = Number(item.laborCost || 0);
    const equipment = Number(item.equipmentCost || 0);
    const service = Number(item.serviceCost || 0);
    const other = Number(item.otherCost || 0);
    const effectiveMaterial = (includeMaterial || Number(item.includeMaterialOverride) === 1) ? material : 0;
    const itemConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0 };
    const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    const additionalIncrement = itemConfig.additionalIncrement || 0;
    const discount = itemConfig.discount || 0;
    const bdiMultiplier = calcBDIMultiplier(additionalIncrement, discount);
    const matAdjPct = Number(item.materialAdjustment) || 0;
    const effectiveMaterialAdj = effectiveMaterial * (1 + matAdjPct / 100);
    const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterialAdj * bdiMultiplier : effectiveMaterialAdj;
    const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
    const equipmentWithBDI = equipment * bdiMultiplier;
    const serviceWithBDI = service * bdiMultiplier;
    const otherWithBDI = other * bdiMultiplier;
    const laborAdjPct = Number(item.laborAdjustment) || 0;
    const totalLaborItem = (laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI) * (1 + laborAdjPct / 100);
    const mat = materialWithBDI * qty;
    const lab = totalLaborItem * qty;
    totalMaterial += mat;
    totalLabor += lab;
    perItem.push({ id: item.id, mat, lab });
  }
  return { total: totalMaterial + totalLabor, totalMaterial, totalLabor, perItem };
}

const server = calcServerTotal();
const client = calcClientTotal();

console.log('\n=== TOTAIS ===');
console.log('Servidor (db.ts):        R$', server.total.toFixed(2), '(material', server.totalMaterial.toFixed(2), '+ mao de obra', server.totalLabor.toFixed(2), ')');
console.log('Cliente (BudgetForm.tsx): R$', client.total.toFixed(2), '(material', client.totalMaterial.toFixed(2), '+ mao de obra', client.totalLabor.toFixed(2), ')');
console.log('Diferença: R$', (client.total - server.total).toFixed(2));

// Diff item a item
const serverById = new Map(server.perItem.map(p => [p.id, p]));
const clientById = new Map(client.perItem.map(p => [p.id, p]));
const allIds = new Set([...serverById.keys(), ...clientById.keys()]);
let divergentCount = 0;
console.log('\n=== ITENS DIVERGENTES (diferença > R$0.01) ===');
for (const id of allIds) {
  const s = serverById.get(id) || { mat: 0, lab: 0 };
  const c = clientById.get(id) || { mat: 0, lab: 0 };
  const diffMat = c.mat - s.mat;
  const diffLab = c.lab - s.lab;
  if (Math.abs(diffMat) > 0.01 || Math.abs(diffLab) > 0.01) {
    divergentCount++;
    const item = itemsById.get(id);
    console.log(`Item ${id} [type=${item?.type}, parentItemId=${item?.parentItemId}]: diffMat=${diffMat.toFixed(2)} diffLab=${diffLab.toFixed(2)} | matAdj=${item?.materialAdjustment} laborAdj=${item?.laborAdjustment} encargos=${item?.aplicarEncargosSociais}`);
  }
}
console.log(`\nTotal de itens divergentes: ${divergentCount} de ${allIds.size}`);

await conn.end();
