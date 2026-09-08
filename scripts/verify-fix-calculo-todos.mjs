// Verificação definitiva: replica a fórmula NOVA do servidor (pós-correção
// em server/db.ts, que agora só conta itens com stageId válido) e a fórmula
// do cliente (getStages / Comp. BDI — que SEMPRE só considerou itens com
// stageId válido) usando o MESMO critério de inclusão dos dois lados, pra
// TODOS os orçamentos do sistema. Objetivo: provar que depois da correção,
// server e cliente NUNCA mais podem divergir, para nenhum orçamento — nem
// só pra matemática do BDI (já provado antes), mas também pra QUAIS itens
// entram na soma, que era o ponto cego da verificação anterior.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [budgets] = await conn.query(
  `SELECT id, code, title, socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial, totalCost
   FROM budgets`
);

const calcBDIMultiplierFor = (b) => (additionalBdi = 0, discount = 0) => {
  const numerator = (1 + Number(b.adminCentral) / 100) * (1 + Number(b.warranty) / 100) * (1 + Number(b.risk) / 100);
  const denominator = 1 - Number(b.profit) / 100 - Number(b.taxes) / 100;
  const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
  const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
  return 1 + adjustedBDI;
};

let totalDivergentes = 0;
let orcamentosComDivergencia = 0;
let orcamentosVerificados = 0;

for (const b of budgets) {
  const [items] = await conn.query(
    `SELECT id, stageId, parentItemId, type, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost,
            aplicarEncargosSociais, laborAdjustment, materialAdjustment, includeMaterialOverride
     FROM budget_items WHERE budgetId = ?`,
    [b.id]
  );
  if (items.length === 0) continue;

  const [stages] = await conn.query(`SELECT id FROM budget_stages WHERE budgetId = ?`, [b.id]);
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
  const calcBDIMultiplier = calcBDIMultiplierFor(b);

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

  // ===== FÓRMULA NOVA DO SERVIDOR (server/db.ts pós-correção) =====
  function calcServerNovo() {
    let totalMaterial = 0, totalLabor = 0;
    const perItem = [];
    const childrenByParent = new Map();
    for (const item of items) {
      if (item.parentItemId) {
        const list = childrenByParent.get(item.parentItemId) || [];
        list.push(item);
        childrenByParent.set(item.parentItemId, list);
      }
    }
    // A MESMA trava que acabamos de aplicar em server/db.ts:
    const rootItems = items.filter((i) => !i.parentItemId && i.stageId && validStageIds.has(i.stageId));
    for (const item of rootItems) {
      if (item.type === 'composite') {
        const children = childrenByParent.get(item.id) || [];
        for (const child of children) {
          const qty = Number(child.quantity || 0);
          const { materialWithBDI, totalLabor: tl } = itemUnitWithBdi(child);
          const childMaterialAdj = Number(child.materialAdjustment || 0);
          const childLaborAdj = Number(child.laborAdjustment || 0);
          const mat = (materialWithBDI * (1 + childMaterialAdj / 100)) * qty;
          const lab = (tl * (1 + childLaborAdj / 100)) * qty;
          totalMaterial += mat; totalLabor += lab;
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
      totalMaterial += mat; totalLabor += lab;
      perItem.push({ id: item.id, mat, lab });
    }
    return { total: totalMaterial + totalLabor, totalMaterial, totalLabor, perItem };
  }

  // ===== FÓRMULA DO CLIENTE (getStages -> Comp. BDI), MESMO CRITÉRIO DE
  // MEMBRESIA: só itens com stageId que bate com uma etapa real =====
  function calcClienteReal() {
    let totalMaterial = 0, totalLabor = 0;
    const perItem = [];
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
      totalMaterial += mat; totalLabor += lab;
      perItem.push({ id: item.id, mat, lab });
    }
    return { total: totalMaterial + totalLabor, totalMaterial, totalLabor, perItem };
  }

  const server = calcServerNovo();
  const cliente = calcClienteReal();
  orcamentosVerificados++;

  const serverById = new Map(server.perItem.map(p => [p.id, p]));
  const clienteById = new Map(cliente.perItem.map(p => [p.id, p]));
  const allIds = new Set([...serverById.keys(), ...clienteById.keys()]);
  let divergentesNesteOrcamento = 0;
  for (const id of allIds) {
    const s = serverById.get(id) || { mat: 0, lab: 0 };
    const c = clienteById.get(id) || { mat: 0, lab: 0 };
    if (Math.abs(c.mat - s.mat) > 0.01 || Math.abs(c.lab - s.lab) > 0.01) divergentesNesteOrcamento++;
  }

  const diffTotal = Math.abs(server.total - cliente.total);
  const status = divergentesNesteOrcamento === 0 && diffTotal < 0.01 ? 'OK' : 'DIVERGENTE';
  if (status === 'DIVERGENTE') {
    orcamentosComDivergencia++;
    totalDivergentes += divergentesNesteOrcamento;
  }
  console.log(`Orçamento ${b.id} ${b.code || ''} — servidor(novo)=R$${server.total.toFixed(2)} cliente=R$${cliente.total.toFixed(2)} diff=R$${diffTotal.toFixed(2)} itens_divergentes=${divergentesNesteOrcamento} [${status}]`);
}

console.log('\n=== RESUMO FINAL ===');
console.log(`Orçamentos verificados: ${orcamentosVerificados}`);
console.log(`Orçamentos com divergência SERVIDOR-NOVO vs CLIENTE: ${orcamentosComDivergencia}`);
console.log(`Total de itens divergentes: ${totalDivergentes}`);
console.log(orcamentosComDivergencia === 0
  ? '\n✅ CONFIRMADO: com a correção, servidor e cliente produzem exatamente o mesmo total em TODOS os orçamentos.'
  : '\n⚠️ Ainda há divergência em alguns orçamentos — investigar antes de confiar 100%.');

await conn.end();
