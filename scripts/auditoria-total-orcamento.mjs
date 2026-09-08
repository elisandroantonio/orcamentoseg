// AUDITORIA COMPLETA, READ-ONLY, direto do banco — ignora qualquer tela/cache.
// Calcula o valor real do orçamento usando EXATAMENTE a mesma fórmula gravada
// no servidor (server/db.ts recalculateBudgetTotals / server/routers.ts
// getStages), lista TODOS os itens com ajuste manual de BDI e o impacto de
// cada um, e confere se bate com o totalCost gravado em `budgets`.
//
// Não grava nada. Uso: node scripts/auditoria-total-orcamento.mjs [budgetId]
import mysql2 from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const BUDGET_ID = Number(process.argv[2]) || 1320001;
const fmt = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  console.log('='.repeat(90));
  console.log(`AUDITORIA — Orçamento ${BUDGET_ID} (${budget.code || ''})`);
  console.log('='.repeat(90));
  console.log('Parâmetros de BDI gravados no orçamento:');
  console.log(`  Encargos Sociais: ${socialCharges}%   Administração Central: ${adminCentral}%`);
  console.log(`  Lucro: ${profit}%   Impostos: ${taxes}%   Risco: ${risk}%   Garantia: ${warranty}%`);
  console.log(`  Incluir Material (padrão geral): ${includeMaterial ? 'SIM' : 'NÃO'}`);
  console.log(`  totalCost GRAVADO no banco (budgets.totalCost): R$ ${fmt(parseFloat(budget.totalCost))}\n`);

  const [allItems] = await conn.query('SELECT * FROM budget_items WHERE budgetId = ? ORDER BY `order`', [BUDGET_ID]);
  const itemIds = allItems.map((i) => i.id);
  const [bdiConfigRows] = itemIds.length
    ? await conn.query(`SELECT * FROM budget_item_bdi_config WHERE budgetItemId IN (${itemIds.join(',')})`)
    : [[]];

  const bdiConfigByItem = new Map();
  for (const row of bdiConfigRows) {
    bdiConfigByItem.set(row.budgetItemId, {
      applyBdiToMaterial: row.applyBdiToMaterial === 1,
      applyBdiToLabor: row.applyBdiToLabor === 1,
      additionalIncrement: parseFloat(row.additionalIncrement || '0'),
      discount: parseFloat(row.discount || '0'),
    });
  }

  const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    const baseBDI = denominator > 0 ? numerator / denominator - 1 : 0;
    const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
    return 1 + adjustedBDI;
  };
  const bdiMultiplierPadrao = calcBDIMultiplier(0, 0);

  const itemUnitWithBdi = (item) => {
    const material = parseFloat(item.materialCost || '0');
    const labor = parseFloat(item.laborCost || '0');
    const equipment = parseFloat(item.equipmentCost || '0');
    const service = parseFloat(item.serviceCost || '0');
    const other = parseFloat(item.otherCost || '0');
    const effectiveMaterial = (includeMaterial || Number(item.includeMaterialOverride) === 1) ? material : 0;
    const config = bdiConfigByItem.get(item.id) || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0 };
    const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    const bdiMultiplier = calcBDIMultiplier(config.additionalIncrement, config.discount);
    const materialWithBDI = config.applyBdiToMaterial ? effectiveMaterial * bdiMultiplier : effectiveMaterial;
    const laborWithBDI = config.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
    const equipmentWithBDI = equipment * bdiMultiplier;
    const serviceWithBDI = service * bdiMultiplier;
    const otherWithBDI = other * bdiMultiplier;
    const totalLabor = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
    return { materialWithBDI, totalLabor, effectiveMaterial, aplicarEncargos, config, bdiMultiplier };
  };

  const rootItems = allItems.filter((i) => i.parentItemId === null);
  const childrenByParent = new Map();
  for (const item of allItems) {
    if (item.parentItemId === null) continue;
    const list = childrenByParent.get(item.parentItemId) || [];
    list.push(item);
    childrenByParent.set(item.parentItemId, list);
  }

  let totalMat = 0, totalLab = 0;
  let totalMatSemBDI = 0, totalLabSemBDI = 0, totalEquipSemBDI = 0, totalSvcSemBDI = 0, totalOtherSemBDI = 0;
  let encargosSociaisValue = 0, lucroValue = 0, impostosValue = 0, riscoValue = 0, garantiaValue = 0;
  const itensComAjusteManual = [];

  function acumularBase(item, qty, effectiveMaterial, laborWithCharges, equipment, service, other, aplicarEncargos) {
    totalMatSemBDI += effectiveMaterial * qty;
    totalLabSemBDI += parseFloat(item.laborCost || '0') * qty;
    totalEquipSemBDI += equipment * qty;
    totalSvcSemBDI += service * qty;
    totalOtherSemBDI += other * qty;
    if (aplicarEncargos) encargosSociaisValue += parseFloat(item.laborCost || '0') * (socialCharges / 100) * qty;
    const base = (effectiveMaterial + laborWithCharges + equipment + service + other) * qty;
    lucroValue += base * (profit / 100);
    impostosValue += base * (taxes / 100);
    riscoValue += base * (risk / 100);
    garantiaValue += base * (warranty / 100);
  }

  function registrarAjuste(item, tipo, detalhe, impactoAprox) {
    itensComAjusteManual.push({
      id: item.id,
      code: item.code || '',
      desc: (item.description || '').slice(0, 55),
      tipo,
      detalhe,
      impactoAprox,
    });
  }

  for (const item of rootItems) {
    if (item.type === 'composite') {
      const children = childrenByParent.get(item.id) || [];
      for (const child of children) {
        const qty = parseFloat(child.quantity || '0');
        const equipment = parseFloat(child.equipmentCost || '0');
        const service = parseFloat(child.serviceCost || '0');
        const other = parseFloat(child.otherCost || '0');
        const { materialWithBDI, totalLabor, effectiveMaterial, aplicarEncargos, config, bdiMultiplier } = itemUnitWithBdi(child);
        const childLaborAdj = parseFloat(child.laborAdjustment || '0');
        const m = materialWithBDI * qty;
        const l = totalLabor * (1 + childLaborAdj / 100) * qty;
        totalMat += m; totalLab += l;
        const labor = parseFloat(child.laborCost || '0');
        const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
        acumularBase(child, qty, effectiveMaterial, laborWithCharges, equipment, service, other, aplicarEncargos);

        // Registrar qualquer ajuste manual fora do padrão
        if (!aplicarEncargos) registrarAjuste(child, 'Encargos Sociais DESLIGADOS', `filho de composto #${item.id}`, labor * (socialCharges / 100) * qty);
        if (childLaborAdj !== 0) registrarAjuste(child, `Ajuste M.O. ${childLaborAdj > 0 ? '+' : ''}${childLaborAdj}%`, `filho de composto #${item.id}`, totalLabor * qty * (childLaborAdj / 100));
        if (Number(child.includeMaterialOverride) === 1 && !includeMaterial) registrarAjuste(child, 'Material FORÇADO a entrar', `filho de composto #${item.id}`, materialWithBDI * qty);
        if (config.additionalIncrement !== 0 || config.discount !== 0) registrarAjuste(child, `Incremento ${config.additionalIncrement}% / Desconto ${config.discount}%`, `filho de composto #${item.id}`, (bdiMultiplier - bdiMultiplierPadrao) * (effectiveMaterial + labor) * qty);
        if (!config.applyBdiToMaterial) registrarAjuste(child, 'BDI DESLIGADO no material', `filho de composto #${item.id}`, effectiveMaterial * (bdiMultiplier - 1) * qty * -1);
        if (!config.applyBdiToLabor) registrarAjuste(child, 'BDI DESLIGADO na M.O.', `filho de composto #${item.id}`, laborWithCharges * (bdiMultiplier - 1) * qty * -1);
      }
      continue;
    }
    const qty = parseFloat(item.quantity || '0');
    const equipment = parseFloat(item.equipmentCost || '0');
    const service = parseFloat(item.serviceCost || '0');
    const other = parseFloat(item.otherCost || '0');
    const { materialWithBDI, totalLabor, effectiveMaterial, aplicarEncargos, config, bdiMultiplier } = itemUnitWithBdi(item);
    const matAdjPct = parseFloat(item.materialAdjustment || '0');
    const laborAdjPct = parseFloat(item.laborAdjustment || '0');
    const m = materialWithBDI * qty * (1 + matAdjPct / 100);
    const l = totalLabor * qty * (1 + laborAdjPct / 100);
    totalMat += m; totalLab += l;
    const labor = parseFloat(item.laborCost || '0');
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    acumularBase(item, qty, effectiveMaterial, laborWithCharges, equipment, service, other, aplicarEncargos);

    if (!aplicarEncargos) registrarAjuste(item, 'Encargos Sociais DESLIGADOS', 'item raiz', labor * (socialCharges / 100) * qty);
    if (matAdjPct !== 0) registrarAjuste(item, `Ajuste Material ${matAdjPct > 0 ? '+' : ''}${matAdjPct}%`, 'item raiz', materialWithBDI * qty * (matAdjPct / 100));
    if (laborAdjPct !== 0) registrarAjuste(item, `Ajuste M.O. ${laborAdjPct > 0 ? '+' : ''}${laborAdjPct}%`, 'item raiz', totalLabor * qty * (laborAdjPct / 100));
    if (Number(item.includeMaterialOverride) === 1 && !includeMaterial) registrarAjuste(item, 'Material FORÇADO a entrar', 'item raiz', materialWithBDI * qty);
    if (config.additionalIncrement !== 0 || config.discount !== 0) registrarAjuste(item, `Incremento ${config.additionalIncrement}% / Desconto ${config.discount}%`, 'item raiz', (bdiMultiplier - bdiMultiplierPadrao) * (effectiveMaterial + labor) * qty);
    if (!config.applyBdiToMaterial) registrarAjuste(item, 'BDI DESLIGADO no material', 'item raiz', effectiveMaterial * (bdiMultiplier - 1) * qty * -1);
    if (!config.applyBdiToLabor) registrarAjuste(item, 'BDI DESLIGADO na M.O.', 'item raiz', laborWithCharges * (bdiMultiplier - 1) * qty * -1);
  }

  const totalGeral = totalMat + totalLab;
  const totalSemBDI = totalMatSemBDI + totalLabSemBDI + totalEquipSemBDI + totalSvcSemBDI + totalOtherSemBDI;
  const valorBDI = totalGeral - totalSemBDI;

  console.log('-'.repeat(90));
  console.log('RESULTADO — calculado direto do banco, fórmula do servidor (db.ts / getStages)');
  console.log('-'.repeat(90));
  console.log(`  VALOR SEM BDI ......................... R$ ${fmt(totalSemBDI)}`);
  console.log(`     Material: R$ ${fmt(totalMatSemBDI)}   Mão de Obra: R$ ${fmt(totalLabSemBDI)}   Equip.: R$ ${fmt(totalEquipSemBDI)}`);
  console.log(`  VALOR DO BDI ........................... R$ ${fmt(valorBDI)}`);
  console.log(`     Encargos Sociais: R$ ${fmt(encargosSociaisValue)}   Lucro: R$ ${fmt(lucroValue)}   Impostos: R$ ${fmt(impostosValue)}   Risco: R$ ${fmt(riscoValue)}   Garantia: R$ ${fmt(garantiaValue)}`);
  console.log(`  TOTAL GERAL (com BDI) .................. R$ ${fmt(totalGeral)}`);
  console.log(`     Material: R$ ${fmt(totalMat)}   Mão de Obra: R$ ${fmt(totalLab)}`);
  console.log('-'.repeat(90));
  const gravado = parseFloat(budget.totalCost);
  const diff = totalGeral - gravado;
  console.log(`  totalCost GRAVADO no banco: R$ ${fmt(gravado)}`);
  console.log(`  DIFERENÇA (calculado - gravado): R$ ${fmt(diff)}  ${Math.abs(diff) < 0.01 ? '✅ BATE 100%' : '⚠️ NÃO BATE — banco desatualizado, precisa recalcular'}`);
  console.log('='.repeat(90));

  console.log(`\nITENS COM AJUSTE MANUAL DE BDI (${itensComAjusteManual.length} ajustes encontrados):\n`);
  for (const a of itensComAjusteManual) {
    console.log(`  #${a.id} [${a.tipo}] (${a.detalhe}) "${a.desc}" — impacto aprox.: R$ ${fmt(a.impactoAprox)}`);
  }
  const somaImpacto = itensComAjusteManual.reduce((s, a) => s + a.impactoAprox, 0);
  console.log(`\nSoma aproximada do impacto de todos os ajustes manuais: R$ ${fmt(somaImpacto)}`);

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
