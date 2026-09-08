// Diagnóstico decisivo: compara budget_items.materialAdjustment (fonte correta,
// usada pelo servidor) vs budget_item_bdi_config.materialAdjustment (fonte que
// o "Resumo do Orçamento"/Comp. BDI usava antes da correção) para cada item do
// orçamento, e mostra quanto isso mudaria no total.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const budgetId = Number(process.argv[2]);
if (!budgetId) {
  console.error('Uso: node scripts/diag-materialadj-fonte.mjs <budgetId>');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(
  `SELECT
     bi.id, bi.description, bi.materialAdjustment AS itemMatAdj,
     bi.quantity, bi.materialCost,
     bdi.materialAdjustment AS configMatAdj
   FROM budget_items bi
   LEFT JOIN budget_item_bdi_config bdi ON bdi.budgetItemId = bi.id
   WHERE bi.budgetId = ?`,
  [budgetId]
);

let divergentes = 0;
let impactoTotal = 0;

for (const r of rows) {
  const itemVal = Number(r.itemMatAdj || 0);
  const configVal = Number(r.configMatAdj || 0);
  if (itemVal !== configVal) {
    divergentes++;
    const qty = Number(r.quantity || 0);
    const mat = Number(r.materialCost || 0);
    const diffPct = (itemVal - configVal) / 100;
    const impacto = mat * qty * diffPct;
    impactoTotal += impacto;
    console.log(
      `Item ${r.id} (${(r.description || '').slice(0, 50)}): budget_items=${itemVal}% vs bdi_config=${configVal}% -> impacto ~R$ ${impacto.toFixed(2)}`
    );
  }
}

console.log('\n=== RESUMO ===');
console.log(`Total de itens: ${rows.length}`);
console.log(`Itens com materialAdjustment DIVERGENTE entre as duas tabelas: ${divergentes}`);
console.log(`Impacto financeiro estimado da divergência: R$ ${impactoTotal.toFixed(2)}`);

await conn.end();
