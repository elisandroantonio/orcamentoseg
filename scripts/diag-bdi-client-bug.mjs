// Diagnóstico READ-ONLY: replica EXATAMENTE o bug do BudgetForm.tsx (card
// "Resumo do Orçamento" / exportação PDF-Excel), que lê aplicarEncargosSociais,
// laborAdjustment e includeMaterialOverride da tabela budget_item_bdi_config
// (onde essas colunas NÃO existem) em vez de budget_items (onde existem de
// verdade). Não grava nada.
//
// Uso: node scripts/diag-bdi-client-bug.mjs [budgetId]
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

  const [allItems] = await conn.query('SELECT * FROM budget_items WHERE budgetId = ? ORDER BY `order`', [BUDGET_ID]);
  const [bdiConfigRows] = await conn.query(
    `SELECT * FROM budget_item_bdi_config WHERE budgetItemId IN (${allItems.map(i => i.id).join(',') || '0'})`
  );

  // ---------- Réplica EXATA do bug do cliente ----------
  // configs[itemId] só tem os campos que REALMENTE existem em budget_item_bdi_config.
  // aplicarEncargosSociais / laborAdjustment / includeMaterialOverride vêm undefined,
  // exatamente como no browser.
  const bdiConfigByItemBUGGY = new Map();
  for (const row of bdiConfigRows) {
    bdiConfigByItemBUGGY.set(row.budgetItemId, {
      applyBdiToMaterial: row.applyBdiToMaterial === 1,
      applyBdiToLabor: row.applyBdiToLabor === 1,
      additionalIncrement: parseFloat(row.additionalIncrement || '0'),
      discount: parseFloat(row.discount || '0'),
      materialAdjustment: parseFloat(row.materialAdjustment || '0'),
      // campos que NÃO existem na tabela -> undefined, igual no browser:
      aplicarEncargosSociais: row.aplicarEncargosSociais === 1, // undefined === 1 -> false
      laborAdjustment: parseFloat(row.laborAdjustment || '0'),   // parseFloat(undefined || '0') -> 0
      includeMaterialOverride: Number(row.includeMaterialOverride) === 1, // NaN === 1 -> false
    });
  }

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

  function runCalc(bdiConfigByItem, label) {
    const itemUnitWithBdi = (item) => {
      const material = parseFloat(item.materialCost || '0');
      const labor = parseFloat(item.laborCost || '0');
      const equipment = parseFloat(item.equipmentCost || '0');
      const service = parseFloat(item.serviceCost || '0');
      const other = parseFloat(item.otherCost || '0');
      const config = bdiConfigByItem.get(item.id) || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, aplicarEncargosSociais: true, materialAdjustment: 0 };
      const effectiveMaterial = (includeMaterial || config.includeMaterialOverride) ? material : 0;
      const aplicarEncargos = config.aplicarEncargosSociais !== false;
      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
      const bdiMultiplier = calcBDIMultiplier(config.additionalIncrement, config.discount);
      const matAdjPct = config.materialAdjustment || 0;
      const effectiveMaterialAdj = effectiveMaterial * (1 + matAdjPct / 100);
      const materialWithBDI = config.applyBdiToMaterial ? effectiveMaterialAdj * bdiMultiplier : effectiveMaterialAdj;
      const laborWithBDI = config.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
      const equipmentWithBDI = equipment * bdiMultiplier;
      const serviceWithBDI = service * bdiMultiplier;
      const otherWithBDI = other * bdiMultiplier;
      const totalLabor = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
      const laborAdjPct = config.laborAdjustment || 0;
      return { materialWithBDI, totalLabor: totalLabor * (1 + laborAdjPct / 100) };
    };

    let totalMat = 0, totalLab = 0;
    for (const item of rootItems) {
      if (item.type === 'composite') {
        const children = childrenByParent.get(item.id) || [];
        for (const child of children) {
          const qty = parseFloat(child.quantity || '0');
          const { materialWithBDI, totalLabor } = itemUnitWithBdi(child);
          totalMat += materialWithBDI * qty;
          totalLab += totalLabor * qty;
        }
        continue;
      }
      const qty = parseFloat(item.quantity || '0');
      const { materialWithBDI, totalLabor } = itemUnitWithBdi(item);
      totalMat += materialWithBDI * qty;
      totalLab += totalLabor * qty;
    }
    const total = totalMat + totalLab;
    console.log(`\n=== ${label} ===`);
    console.log({ totalMat: totalMat.toFixed(2), totalLab: totalLab.toFixed(2), total: total.toFixed(2) });
    return total;
  }

  console.log('=== Orçamento', BUDGET_ID, '-', budget.code || '', '| totalCost gravado:', budget.totalCost, '===');
  const totalBUGGY = runCalc(bdiConfigByItemBUGGY, 'CÁLCULO C (réplica do bug real do BudgetForm.tsx / exportação)');

  console.log('\nDiferença (banco - card com bug):', (parseFloat(budget.totalCost) - totalBUGGY).toFixed(2));

  const itemsWithBdiConfig = new Set(bdiConfigRows.map(r => r.budgetItemId));
  const affectedItems = allItems.filter(i => itemsWithBdiConfig.has(i.id) && (Number(i.aplicarEncargosSociais) !== 0 || Number(i.laborAdjustment || 0) !== 0));
  console.log(`\nItens com config de BDI customizada E que realmente tinham encargos/ajuste M.O. sendo zerados pelo bug: ${affectedItems.length}`);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
