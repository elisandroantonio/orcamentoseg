// Diagnóstico SOMENTE LEITURA: compara o total do aditivo gravado no banco
// (o que aparece no cabeçalho) com o recalculo item a item (o que aparece nos
// cards e no PDF). Uso: node scripts/diag-aditivo-extras.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const n = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
const [ads] = await conn.query(`SELECT ba.id, ba.name, ba.status, ba.totalCostNoBdi, ba.totalCostWithBdi, b.title, b.socialCharges, b.adminCentral, b.profit, b.taxes, b.risk, b.warranty FROM budget_additives ba JOIN budgets b ON b.id=ba.budgetId WHERE ba.name LIKE '%EXTRAS%' OR ba.totalCostWithBdi BETWEEN 132081 AND 132082`);
for (const a of ads) {
  const sc = n(a.socialCharges), den = 1 - n(a.profit)/100 - n(a.taxes)/100;
  const mult = den > 0 ? ((1+n(a.adminCentral)/100)*(1+n(a.warranty)/100)*(1+n(a.risk)/100))/den : 1;
  console.log(`\nADITIVO #${a.id} "${a.name}" (${a.status}) — orçamento: ${a.title}`);
  console.log(`Gravado no banco: s/BDI=${a.totalCostNoBdi}  c/BDI=${a.totalCostWithBdi}`);
  console.log(`Encargos=${sc}%  BDI mult=${mult.toFixed(5)} (${((mult-1)*100).toFixed(2)}%)`);
  const [items] = await conn.query(`SELECT ai.*, s.id AS sid FROM additive_items ai LEFT JOIN additive_stages s ON s.id=ai.stageId WHERE ai.additiveId=? ORDER BY ai.stageId, ai.\`order\`, ai.id`, [a.id]);
  let tNo = 0, tBdi = 0, tOrfNo = 0, tOrfBdi = 0, qtd0 = 0;
  for (const i of items) {
    const q = n(i.quantity, 1);
    const mat = Number(i.includeMaterial) === 0 ? 0 : n(i.materialCost);
    const lab = n(i.laborCost), non = n(i.equipmentCost)+n(i.serviceCost)+n(i.otherCost);
    const enc = Number(i.aplicarEncargosSociais) !== 0;
    const m = mat*(1+n(i.materialAdjustment)/100);
    const l = (lab*(1+(enc?sc:0)/100)+non)*(1+n(i.laborAdjustment)/100);
    const mf = Number(i.applyBdiToMaterial) !== 0 ? m*mult : m;
    const lf = Number(i.applyBdiToLabor) !== 0 ? l*mult : l;
    const f = (1+n(i.additionalIncrement)/100)*(1-n(i.discount)/100)*q;
    const no = (mat+lab+non)*q, com = (mf+lf)*f;
    tNo += no; tBdi += com;
    if (!i.sid) { tOrfNo += no; tOrfBdi += com; }
    console.log(`#${i.id} etapa=${i.stageId}${i.sid?'':' (ÓRFÃO)'} qtd=${q} ${String(i.description).slice(0,38)} | s/BDI=${no.toFixed(2)} c/BDI=${com.toFixed(2)} | encargos=${i.aplicarEncargosSociais} incMat=${i.includeMaterial} adjM=${i.materialAdjustment} adjMO=${i.laborAdjustment} incr=${i.additionalIncrement} desc=${i.discount}`);
  }
  console.log(`\nRecalculado agora: s/BDI=${tNo.toFixed(2)}  c/BDI=${tBdi.toFixed(2)}  (itens: ${items.length})`);
  console.log(`Itens órfãos (sem etapa): s/BDI=${tOrfNo.toFixed(2)} c/BDI=${tOrfBdi.toFixed(2)}`);
}
await conn.end();
