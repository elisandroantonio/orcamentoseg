// Mesma lógica de verify-fix-calculo-todos.mjs, mas pra UM orçamento só e
// mostrando o detalhe de cada item divergente (tipo, parentItemId, stageId,
// se é filho de composto e qual o stageId do pai) pra entender a causa.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BUDGET_ID = Number(process.argv[2]) || 1080001;
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [[b]] = await conn.query(
  `SELECT socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial FROM budgets WHERE id = ?`,
  [BUDGET_ID]
);
const [items] = await conn.query(
  `SELECT id, stageId, parentItemId, type, description, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost,
          aplicarEncargosSociais, laborAdjustment, materialAdjustment, includeMaterialOverride
   FROM budget_items WHERE budgetId = ?`,
  [BUDGET_ID]
);
const [stages] = await conn.query(`SELECT id FROM budget_stages WHERE budgetId = ?`, [BUDGET_ID]);
const validStageIds = new Set(stages.map(s => s.id));

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

const includeMaterial = Boolean(b.includeMaterial);
const socialCharges = Number(b.socialCharges || 0);
const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
  const numerator = (1 + Number(b.adminCentral) / 100) * (1 + Number(b.warranty) / 100) * (1 + Number(b.risk) / 100);
  const denominator = 1 - Number(b.profit) / 100 - Number(b.taxes) / 100;
  const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
  return 1 + baseBDI + additionalBdi / 100 - discount / 100;
};
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
  const totalLabor = laborWithBDI + equipment * bdiMultiplier + service * bdiMultiplier + other * bdiMultiplier;
  return { materialWithBDI, totalLabor };
};

const itemsById = new Map(items.map(i => [i.id, i]));

function calcServerNovo() {
  const perItem = new Map();
  const childrenByParent = new Map();
  for (const item of items) {
    if (item.parentItemId) {
      const list = childrenByParent.get(item.parentItemId) || [];
      list.push(item);
      childrenByParent.set(item.parentItemId, list);
    }
  }
  const rootItems = items.filter((i) => !i.parentItemId && i.stageId && validStageIds.has(i.stageId));
  for (const item of rootItems) {
    if (item.type === 'composite') {
      const children = childrenByParent.get(item.id) || [];
      for (const child of children) {
        const qty = Number(child.quantity || 0);
        const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(child);
        const childMaterialAdj = Number(child.materialAdjustment || 0);
        const childLaborAdj = Number(child.laborAdjustment || 0);
        perItem.set(child.id, { mat: (materialWithBDI * (1 + childMaterialAdj / 100)) * qty, lab: (tl * (1 + childLaborAdj / 100)) * qty });
      }
      continue;
    }
    const qty = Number(item.quantity || 0);
    const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(item);
    const matAdjPct = Number(item.materialAdjustment || 0);
    const laborAdjPct = Number(item.laborAdjustment || 0);
    perItem.set(item.id, { mat: (materialWithBDI * qty) * (1 + matAdjPct / 100), lab: (tl * qty) * (1 + laborAdjPct / 100) });
  }
  return perItem;
}

function calcClienteReal() {
  const perItem = new Map();
  const rootItems = items.filter((i) => !i.parentItemId && i.stageId && validStageIds.has(i.stageId));
  const itemsForCardBdi = [];
  for (const item of rootItems) {
    if (item.type === 'composite') {
      const children = items.filter(c => c.parentItemId === item.id);
      for (const child of children) itemsForCardBdi.push(child);
    } else {
      itemsForCardBdi.push(item);
    }
  }
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
    const bdiMultiplier = calcBDIMultiplier(itemConfig.additionalIncrement || 0, itemConfig.discount || 0);
    const matAdjPct = Number(item.materialAdjustment) || 0;
    const effectiveMaterialAdj = effectiveMaterial * (1 + matAdjPct / 100);
    const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterialAdj * bdiMultiplier : effectiveMaterialAdj;
    const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
    const laborAdjPct = Number(item.laborAdjustment) || 0;
    const totalLaborItem = (laborWithBDI + equipment * bdiMultiplier + service * bdiMultiplier + other * bdiMultiplier) * (1 + laborAdjPct / 100);
    perItem.set(item.id, { mat: materialWithBDI * qty, lab: totalLaborItem * qty });
  }
  return perItem;
}

const server = calcServerNovo();
const cliente = calcClienteReal();
const allIds = new Set([...server.keys(), ...cliente.keys()]);

console.log(`=== Itens divergentes no orçamento ${BUDGET_ID} ===`);
for (const id of allIds) {
  const s = server.get(id) || { mat: 0, lab: 0 };
  const c = cliente.get(id) || { mat: 0, lab: 0 };
  if (Math.abs(c.mat - s.mat) > 0.01 || Math.abs(c.lab - s.lab) > 0.01) {
    const item = itemsById.get(id);
    const parent = item?.parentItemId ? itemsById.get(item.parentItemId) : null;
    console.log(`\nItem ${id} [${item?.type}] "${(item?.description || '').slice(0, 60)}"`);
    console.log(`  stageId próprio=${item?.stageId ?? 'NULL'} (válido=${item?.stageId ? validStageIds.has(item.stageId) : false})`);
    console.log(`  parentItemId=${item?.parentItemId ?? '-'}`);
    if (parent) {
      console.log(`  pai: id=${parent.id} type=${parent.type} stageId=${parent.stageId ?? 'NULL'} (válido=${parent.stageId ? validStageIds.has(parent.stageId) : false})`);
    }
    console.log(`  no servidor(novo): mat=${s.mat.toFixed(2)} lab=${s.lab.toFixed(2)} ${server.has(id) ? '(incluído)' : '(NÃO incluído)'}`);
    console.log(`  no cliente:        mat=${c.mat.toFixed(2)} lab=${c.lab.toFixed(2)} ${cliente.has(id) ? '(incluído)' : '(NÃO incluído)'}`);
  }
}

await conn.end();
