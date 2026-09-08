// Diagnóstico READ-ONLY item a item: compara, PARA CADA item/filho do
// orçamento, o valor "com BDI" calculado pela fórmula do SERVIDOR
// (recalculateBudgetTotals/getStages — a que grava budget.totalCost) contra
// a fórmula usada na "Barra de Totais BDI" / "Resumo do Orçamento" no
// cliente (BudgetForm.tsx).
//
// Hipótese a confirmar: o cliente aplica `materialAdjustment` também aos
// FILHOS de composições (serviços compostos), mas o servidor explicitamente
// NÃO aplica `materialAdjustment` a filhos (só a itens-raiz simples) — ver
// comentário em server/routers.ts linha ~1679 ("sem materialAdjustment...
// provavelmente não intencional"). Isso explicaria a diferença persistente
// entre o total gravado no banco (Home/Dashboard) e o total mostrado na aba
// "Comp. BDI" / "Resumo do Orçamento".
//
// Não grava nada. Uso: node scripts/diag-bdi-item-a-item.mjs [budgetId]
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
      materialAdjustment: parseFloat(row.materialAdjustment || '0'), // coluna existe em AMBAS as tabelas
    });
  }

  const calcBDIMultiplier = (additionalBdi = 0, discount = 0) => {
    const numerator = (1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100);
    const denominator = 1 - profit / 100 - taxes / 100;
    const baseBDI = denominator > 0 ? numerator / denominator - 1 : 0;
    const adjustedBDI = baseBDI + additionalBdi / 100 - discount / 100;
    return 1 + adjustedBDI;
  };

  const itemUnitWithBdi = (item) => {
    const material = parseFloat(item.materialCost || '0');
    const labor = parseFloat(item.laborCost || '0');
    const equipment = parseFloat(item.equipmentCost || '0');
    const service = parseFloat(item.serviceCost || '0');
    const other = parseFloat(item.otherCost || '0');
    const effectiveMaterial = (includeMaterial || Number(item.includeMaterialOverride) === 1) ? material : 0;
    const config = bdiConfigByItem.get(item.id) || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, materialAdjustment: 0 };
    const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    const bdiMultiplier = calcBDIMultiplier(config.additionalIncrement, config.discount);
    const materialWithBDI = config.applyBdiToMaterial ? effectiveMaterial * bdiMultiplier : effectiveMaterial;
    const laborWithBDI = config.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
    const equipmentWithBDI = equipment * bdiMultiplier;
    const serviceWithBDI = service * bdiMultiplier;
    const otherWithBDI = other * bdiMultiplier;
    const totalLabor = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
    return { materialWithBDI, totalLabor, effectiveMaterial, config, bdiMultiplier };
  };

  const rootItems = allItems.filter((i) => i.parentItemId === null);
  const childrenByParent = new Map();
  for (const item of allItems) {
    if (item.parentItemId === null) continue;
    const list = childrenByParent.get(item.parentItemId) || [];
    list.push(item);
    childrenByParent.set(item.parentItemId, list);
  }

  // ---------- CÁLCULO SERVIDOR (fiel a db.ts/routers.ts) ----------
  // Regra: materialAdjustment só é aplicado a itens-raiz simples, NUNCA a
  // filhos de composite. laborAdjustment é aplicado tanto a raiz quanto a
  // filhos, sobre o total (labor+equip+svc+other).
  function serverTotal() {
    let mat = 0, lab = 0;
    const perItem = [];
    for (const item of rootItems) {
      if (item.type === 'composite') {
        const children = childrenByParent.get(item.id) || [];
        for (const child of children) {
          const qty = parseFloat(child.quantity || '0');
          const { materialWithBDI, totalLabor } = itemUnitWithBdi(child);
          const childLaborAdj = parseFloat(child.laborAdjustment || '0');
          const m = materialWithBDI * qty;
          const l = totalLabor * (1 + childLaborAdj / 100) * qty;
          mat += m; lab += l;
          perItem.push({ id: child.id, code: child.code, desc: (child.description||'').slice(0,40), isChild: true, m, l });
        }
        continue;
      }
      const qty = parseFloat(item.quantity || '0');
      const { materialWithBDI, totalLabor } = itemUnitWithBdi(item);
      const matAdjPct = parseFloat(item.materialAdjustment || '0');
      const laborAdjPct = parseFloat(item.laborAdjustment || '0');
      const m = materialWithBDI * qty * (1 + matAdjPct / 100);
      const l = totalLabor * qty * (1 + laborAdjPct / 100);
      mat += m; lab += l;
      perItem.push({ id: item.id, code: item.code, desc: (item.description||'').slice(0,40), isChild: false, m, l });
    }
    return { mat, lab, total: mat + lab, perItem };
  }

  // ---------- CÁLCULO CLIENTE (Resumo do Orçamento / Barra de Totais BDI) ----------
  // Bug suspeito: aplica materialAdjustment (via bdiConfigs[item.id]) a TODOS
  // os itens da lista expandida, inclusive filhos de composite.
  function clientTotal() {
    const expanded = [];
    for (const item of rootItems) {
      if (item.type === 'composite') {
        const children = childrenByParent.get(item.id) || [];
        for (const child of children) {
          expanded.push({ ...child, serviceCost: child.serviceCost || '0', otherCost: child.otherCost || '0', isChild: true });
        }
      } else {
        expanded.push({ ...item, isChild: false });
      }
    }
    let mat = 0, lab = 0;
    const perItem = [];
    for (const item of expanded) {
      const qty = parseFloat(item.quantity || '0');
      const material = parseFloat(item.materialCost || '0');
      const labor = parseFloat(item.laborCost || '0');
      const equipment = parseFloat(item.equipmentCost || '0');
      const service = parseFloat(item.serviceCost || '0');
      const other = parseFloat(item.otherCost || '0');
      const effectiveMaterial = (includeMaterial || Number(item.includeMaterialOverride) === 1) ? material : 0;
      const itemConfig = bdiConfigByItem.get(item.id) || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0, discount: 0, materialAdjustment: 0 };
      const aplicarEncargos = Number(item.aplicarEncargosSociais) !== 0;
      const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
      const bdiMultiplier = calcBDIMultiplier(itemConfig.additionalIncrement, itemConfig.discount);
      const matAdjPct = itemConfig.materialAdjustment || 0; // <-- aplicado mesmo em filhos (suspeito)
      const effectiveMaterialAdj = effectiveMaterial * (1 + matAdjPct / 100);
      const materialWithBDI = itemConfig.applyBdiToMaterial ? effectiveMaterialAdj * bdiMultiplier : effectiveMaterialAdj;
      const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithCharges * bdiMultiplier : laborWithCharges;
      const equipmentWithBDI = equipment * bdiMultiplier;
      const serviceWithBDI = service * bdiMultiplier;
      const otherWithBDI = other * bdiMultiplier;
      const laborAdjPct = Number(item.laborAdjustment) || 0;
      const totalLaborItem = (laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI) * (1 + laborAdjPct / 100);
      const m = materialWithBDI * qty;
      const l = totalLaborItem * qty;
      mat += m; lab += l;
      perItem.push({ id: item.id, code: item.code, desc: (item.description||'').slice(0,40), isChild: item.isChild, m, l, matAdjPct });
    }
    return { mat, lab, total: mat + lab, perItem };
  }

  const srv = serverTotal();
  const cli = clientTotal();

  console.log('=== Orçamento', BUDGET_ID, '-', budget.code || '', '===');
  console.log('totalCost gravado no banco :', budget.totalCost);
  console.log('CÁLCULO SERVIDOR (db.ts/getStages) :', srv.total.toFixed(2), '(mat', srv.mat.toFixed(2), '/ lab', srv.lab.toFixed(2), ')');
  console.log('CÁLCULO CLIENTE  (Resumo/Barra BDI):', cli.total.toFixed(2), '(mat', cli.mat.toFixed(2), '/ lab', cli.lab.toFixed(2), ')');
  console.log('Diferença (servidor - cliente)     :', (srv.total - cli.total).toFixed(2));

  // Diff item a item
  const srvById = new Map(srv.perItem.map((i) => [i.id, i]));
  const cliById = new Map(cli.perItem.map((i) => [i.id, i]));
  const diffs = [];
  for (const [id, s] of srvById) {
    const c = cliById.get(id);
    if (!c) continue;
    const dM = s.m - c.m;
    const dL = s.l - c.l;
    if (Math.abs(dM) > 0.005 || Math.abs(dL) > 0.005) {
      diffs.push({ id, code: s.code, desc: s.desc, isChild: s.isChild, dM, dL, matAdjPct: c.matAdjPct });
    }
  }
  diffs.sort((a, b) => Math.abs(b.dM + b.dL) - Math.abs(a.dM + a.dL));
  console.log(`\nItens com diferença (servidor vs cliente): ${diffs.length}`);
  console.log('Soma das diferenças de material (servidor-cliente):', diffs.reduce((s, d) => s + d.dM, 0).toFixed(2));
  console.log('Soma das diferenças de M.O.     (servidor-cliente):', diffs.reduce((s, d) => s + d.dL, 0).toFixed(2));
  console.log('\nTop 20 itens com maior divergência:');
  for (const d of diffs.slice(0, 20)) {
    console.log(`  item ${d.id} [${d.isChild ? 'FILHO' : 'raiz'}] ${d.code || ''} "${d.desc}" matAdjPct=${d.matAdjPct} | dMat=${d.dM.toFixed(2)} dLab=${d.dL.toFixed(2)}`);
  }

  const childrenWithMatAdj = diffs.filter((d) => d.isChild && Math.abs(d.matAdjPct || 0) > 0);
  console.log(`\nFilhos de composite com materialAdjustment != 0 (candidato à causa raiz): ${childrenWithMatAdj.length}`);

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
