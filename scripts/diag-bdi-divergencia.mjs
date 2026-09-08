// Diagnóstico READ-ONLY: compara os totais candidatos de BDI para um orçamento
// específico, usando os dados reais do banco. NÃO grava nada (só SELECT).
//
// Uso: node scripts/diag-bdi-divergencia.mjs [budgetId]
// Ex.: node scripts/diag-bdi-divergencia.mjs 1320001
import mysql2 from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const BUDGET_ID = Number(process.argv[2]) || 1320001;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL não encontrada no .env');
  const conn = await mysql2.createConnection(dbUrl);

  const [[budget]] = await conn.query('SELECT * FROM budgets WHERE id = ?', [BUDGET_ID]);
  if (!budget) throw new Error('Orçamento não encontrado: ' + BUDGET_ID);

  const includeMaterial = Number(budget.includeMaterial ?? 1) !== 0;
  const socialCharges = parseFloat(budget.socialCharges || '0');
  const adminCentral = parseFloat(budget.adminCentral || '0');
  const profit = parseFloat(budget.profit || '0');
  const taxes = parseFloat(budget.taxes || '0');
  const risk = parseFloat(budget.risk || '0');
  const warranty = parseFloat(budget.warranty || '0');

  console.log('=== Orçamento', BUDGET_ID, '-', budget.name || budget.code || '', '===');
  console.log('=== Parâmetros do orçamento ===');
  console.log({ includeMaterial, socialCharges, adminCentral, profit, taxes, risk, warranty, totalCostGravado: budget.totalCost });

  const [allItems] = await conn.query('SELECT * FROM budget_items WHERE budgetId = ? ORDER BY `order`', [BUDGET_ID]);
  const [bdiConfigRows] = await conn.query(
    `SELECT * FROM budget_item_bdi_config WHERE budgetItemId IN (${allItems.map(i => i.id).join(',') || '0'})`
  );
  const bdiConfigByItem = new Map();
  for (const row of bdiConfigRows) {
    bdiConfigByItem.set(row.budgetItemId, {
      applyBdiToMaterial: row.applyBdiToMaterial === 1,
      applyBdiToLabor: row.applyBdiToLabor === 1,
      additionalIncrement: parseFloat(row.additionalIncrement || '0'),
      discount: parseFloat(row.discount || '0'),
    });
  }

  console.log(`\nTotal de linhas em budget_items: ${allItems.length}`);
  console.log(`Linhas com budget_item_bdi_config customizado: ${bdiConfigRows.length}`);

  // ---------- CÁLCULO A: replica EXATAMENTE recalculateBudgetTotals (server/db.ts) ----------
  {
    let totalMaterialWithBDI = 0;
    let totalLaborWithBDI = 0;
    const bdiMultiplier = 1 + (profit + taxes + risk + warranty) / 100;

    for (const item of allItems) {
      const qty = Number(item.quantity);
      const material = Number(item.materialCost || 0);
      const labor = Number(item.laborCost || 0);
      const equipment = Number(item.equipmentCost || 0);
      const service = Number(item.serviceCost || 0);
      const other = Number(item.otherCost || 0);
      const itemConfig = bdiConfigByItem.get(item.id) || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0 };

      const matAdjMultiplier = 1 + Number(item.materialAdjustment || 0) / 100;
      const labAdjMultiplier = 1 + Number(item.laborAdjustment || 0) / 100;
      const materialAdjusted = material * matAdjMultiplier;
      const laborAdjusted = labor * labAdjMultiplier;
      const laborWithChargesAdj = laborAdjusted * (1 + socialCharges / 100);

      const materialWithBDI = itemConfig.applyBdiToMaterial ? materialAdjusted * bdiMultiplier : materialAdjusted;
      const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithChargesAdj * bdiMultiplier : laborWithChargesAdj;

      const equipmentWithBDI = equipment * bdiMultiplier;
      const serviceWithBDI = service * bdiMultiplier;
      const otherWithBDI = other * bdiMultiplier;

      let totalLaborItem = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
      if (itemConfig.additionalIncrement > 0) {
        totalLaborItem = totalLaborItem * (1 + itemConfig.additionalIncrement / 100);
      }

      totalMaterialWithBDI += materialWithBDI * qty;
      totalLaborWithBDI += totalLaborItem * qty;
    }

    const totalA = totalMaterialWithBDI + totalLaborWithBDI;
    console.log('\n=== CÁLCULO A (replica recalculateBudgetTotals / server/db.ts — o que grava budget.totalCost) ===');
    console.log({ totalMaterialWithBDI: totalMaterialWithBDI.toFixed(2), totalLaborWithBDI: totalLaborWithBDI.toFixed(2), totalA: totalA.toFixed(2) });
  }

  // ---------- CÁLCULO B: replica EXATAMENTE getStages (server/routers.ts) / BudgetForm "Resumo do Orçamento" ----------
  {
    const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
      const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
      const denominator = 1 - profit / 100 - taxes / 100;
      const baseBDI = denominator > 0 ? (numerator / denominator - 1) : 0;
      const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
      return 1 + adjustedBDI;
    };

    const rootItems = allItems.filter(i => i.parentItemId === null);
    const childrenByParent = new Map();
    for (const item of allItems) {
      if (item.parentItemId === null) continue;
      const list = childrenByParent.get(item.parentItemId) || [];
      list.push(item);
      childrenByParent.set(item.parentItemId, list);
    }

    const itemUnitWithBdi = (item) => {
      const material = parseFloat(item.materialCost || '0');
      const labor = parseFloat(item.laborCost || '0');
      const equipment = parseFloat(item.equipmentCost || '0');
      const service = parseFloat(item.serviceCost || '0');
      const other = parseFloat(item.otherCost || '0');
      const effectiveMaterial = (includeMaterial || item.includeMaterialOverride === 1) ? material : 0;
      const config = bdiConfigByItem.get(item.id) || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
      const aplicarEncargos = item.aplicarEncargosSociais !== 0;
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

    const rootItemTotalWithBdi = (item) => {
      if (item.type === 'composite') {
        const children = childrenByParent.get(item.id) || [];
        let mat = 0, lab = 0;
        for (const child of children) {
          const qty = parseFloat(child.quantity || '0');
          const { materialWithBDI, totalLabor } = itemUnitWithBdi(child);
          mat += materialWithBDI * qty;
          const childLaborAdj = parseFloat(child.laborAdjustment || '0');
          lab += (totalLabor * (1 + childLaborAdj / 100)) * qty;
        }
        return { mat, lab };
      }
      const qty = parseFloat(item.quantity || '0');
      const { materialWithBDI, totalLabor } = itemUnitWithBdi(item);
      const matAdjPct = parseFloat(item.materialAdjustment || '0');
      const laborAdjPct = parseFloat(item.laborAdjustment || '0');
      const mat = (materialWithBDI * qty) * (1 + matAdjPct / 100);
      const lab = (totalLabor * qty) * (1 + laborAdjPct / 100);
      return { mat, lab };
    };

    let totalMat = 0, totalLab = 0;
    for (const item of rootItems) {
      const { mat, lab } = rootItemTotalWithBdi(item);
      totalMat += mat;
      totalLab += lab;
    }
    const totalB = totalMat + totalLab;
    console.log('\n=== CÁLCULO B (replica getStages / BudgetForm "Resumo do Orçamento") ===');
    console.log({ totalMat: totalMat.toFixed(2), totalLab: totalLab.toFixed(2), totalB: totalB.toFixed(2) });
  }

  // ---------- Diagnóstico de fatores que podem explicar a diferença ----------
  console.log('\n=== Fatores que diferem entre A e B ===');
  console.log('includeMaterial (nível orçamento):', includeMaterial, '(budget.includeMaterial bruto =', budget.includeMaterial, ')');
  const itemsWithOverride = allItems.filter(i => i.includeMaterialOverride === 1);
  console.log('Itens com includeMaterialOverride=1:', itemsWithOverride.length);
  const itemsNoEncargos = allItems.filter(i => i.aplicarEncargosSociais === 0);
  console.log('Itens com aplicarEncargosSociais=0 (isentos de encargos):', itemsNoEncargos.length);
  const itemsWithDiscount = bdiConfigRows.filter(r => parseFloat(r.discount || '0') !== 0);
  console.log('Configs de BDI por item com discount != 0:', itemsWithDiscount.length, itemsWithDiscount.map(r => ({ item: r.budgetItemId, discount: r.discount })));
  const itemsWithIncrement = bdiConfigRows.filter(r => parseFloat(r.additionalIncrement || '0') !== 0);
  console.log('Configs de BDI por item com additionalIncrement != 0:', itemsWithIncrement.length, itemsWithIncrement.map(r => ({ item: r.budgetItemId, inc: r.additionalIncrement })));
  const compositeParents = allItems.filter(i => i.type === 'composite');
  console.log('Itens tipo composite (pais):', compositeParents.length, compositeParents.map(i => ({ id: i.id, materialCost: i.materialCost, laborCost: i.laborCost, qty: i.quantity })));
  const itemsWithMaterialAdjAndComposite = compositeParents.flatMap(p => {
    const kids = allItems.filter(i => i.parentItemId === p.id);
    return kids.filter(k => parseFloat(k.materialAdjustment || '0') !== 0);
  });
  console.log('Filhos de composite com materialAdjustment != 0 (ignorado por B, aplicado por A):', itemsWithMaterialAdjAndComposite.length, itemsWithMaterialAdjAndComposite.map(i => ({ id: i.id, materialAdjustment: i.materialAdjustment })));

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
