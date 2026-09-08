// Recalcula budgets.totalCost dos orçamentos que ainda estão com o valor
// ANTIGO gravado (de antes das correções desta sessão), usando a MESMA
// fórmula corrigida do servidor (server/db.ts pós-fix):
//   - só soma itens cuja etapa realmente existe (trava de itens órfãos)
//   - aplica materialAdjustment TAMBÉM nos filhos de composição
// IMPORTANTE: diferente do fix-limpar-orfaos.mjs, este script NÃO apaga
// nenhum item — os itens órfãos continuam no banco (podem ser limpos depois,
// por higiene), mas como a trava já os exclui do cálculo, o total gravado
// fica correto mesmo sem apagar nada.
//
// SEGURANÇA: dry-run por padrão. Só grava com --confirm.
//
// Uso:
//   node scripts/recalcular-totais-14-orcamentos.mjs            (dry-run, todos os 14)
//   node scripts/recalcular-totais-14-orcamentos.mjs --confirm  (grava, todos os 14)
//   node scripts/recalcular-totais-14-orcamentos.mjs 1080001            (dry-run, só esse)
//   node scripts/recalcular-totais-14-orcamentos.mjs 1080001 --confirm  (grava, só esse)
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DEFAULT_IDS = [30001, 90001, 240001, 270003, 480002, 510001, 540001, 570002, 600001, 630001, 630002, 810001, 1020001, 1080001];

const CONFIRM = process.argv.includes('--confirm');
const argId = Number(process.argv.find((a) => /^\d+$/.test(a)));
const BUDGET_IDS = argId ? [argId] : DEFAULT_IDS;

const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function recalcularOrcamento(budgetId) {
  const [[budget]] = await conn.query(
    `SELECT title, code, socialCharges, adminCentral, profit, taxes, risk, warranty, includeMaterial, totalCost
     FROM budgets WHERE id = ?`,
    [budgetId]
  );
  if (!budget) {
    console.log(`Orçamento ${budgetId} não encontrado — pulando.`);
    return;
  }

  const [allItems] = await conn.query(
    `SELECT id, stageId, parentItemId, type, quantity, materialCost, laborCost, equipmentCost, serviceCost, otherCost,
            aplicarEncargosSociais, laborAdjustment, materialAdjustment, includeMaterialOverride, totalLaborHours
     FROM budget_items WHERE budgetId = ?`,
    [budgetId]
  );
  const [stages] = await conn.query(`SELECT id FROM budget_stages WHERE budgetId = ?`, [budgetId]);
  const validStageIds = new Set(stages.map((s) => s.id));

  const [bdiRows] = await conn.query(
    `SELECT budgetItemId, applyBdiToMaterial, applyBdiToLabor, additionalIncrement, discount
     FROM budget_item_bdi_config WHERE budgetItemId IN (${allItems.map((i) => i.id).join(',') || '0'})`
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

  const includeMaterial = Boolean(budget.includeMaterial);
  const socialCharges = Number(budget.socialCharges || 0);
  const adminCentral = Number(budget.adminCentral || 0);
  const profit = Number(budget.profit || 0);
  const taxes = Number(budget.taxes || 0);
  const risk = Number(budget.risk || 0);
  const warranty = Number(budget.warranty || 0);

  const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    const baseBDI = denominator > 0 ? numerator / denominator - 1 : 0;
    const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
    return 1 + adjustedBDI;
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

  // MESMA lógica de server/db.ts pós-correção: trava de itens órfãos +
  // materialAdjustment aplicado também nos filhos de composição.
  const childrenByParent = new Map();
  for (const item of allItems) {
    if (item.parentItemId) {
      const list = childrenByParent.get(item.parentItemId) || [];
      list.push(item);
      childrenByParent.set(item.parentItemId, list);
    }
  }
  const rootItems = allItems.filter((i) => !i.parentItemId && i.stageId && validStageIds.has(i.stageId));

  let totalMaterial = 0;
  let totalLabor = 0;
  let totalLaborHours = 0;
  const orphansSkipped = allItems.filter((i) => !i.parentItemId && (!i.stageId || !validStageIds.has(i.stageId)));

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

  const novoTotal = totalMaterial + totalLabor;
  const totalAntigo = Number(budget.totalCost || 0);
  const diff = novoTotal - totalAntigo;

  console.log(`\nOrçamento ${budgetId} — ${budget.code || ''} "${budget.title || ''}"`);
  console.log(`  itens órfãos ignorados no cálculo (não apagados): ${orphansSkipped.length}`);
  console.log(`  totalCost gravado hoje: R$ ${totalAntigo.toFixed(2)}`);
  console.log(`  totalCost recalculado:  R$ ${novoTotal.toFixed(2)}`);
  console.log(`  diferença:              R$ ${diff.toFixed(2)}`);

  if (CONFIRM) {
    await conn.query(
      `UPDATE budgets SET totalCost = ?, totalLaborHours = ? WHERE id = ?`,
      [novoTotal.toFixed(2), totalLaborHours.toFixed(2), budgetId]
    );
    console.log(`  [--confirm] Gravado.`);
  }
}

console.log(`Modo: ${CONFIRM ? 'CONFIRM (vai gravar)' : 'DRY-RUN (nada será gravado)'}`);
console.log(`Orçamentos a processar: ${BUDGET_IDS.join(', ')}`);

for (const id of BUDGET_IDS) {
  await recalcularOrcamento(id);
}

if (!CONFIRM) {
  console.log('\n[DRY-RUN] Nada foi gravado. Confira os valores "recalculado" contra a tela (Resumo do Orçamento) de cada um.');
  console.log('Se baterem, rode de novo com --confirm.');
}

await conn.end();
