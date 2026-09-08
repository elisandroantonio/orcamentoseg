// Backfill: recalcula budget.totalCost de TODOS os orçamentos usando a
// fórmula corrigida (server/db.ts -> recalculateBudgetTotals). Corrige o
// valor desatualizado/errado que ficou gravado no banco por causa da
// divergência de fórmulas de BDI entre telas.
//
// Usa a MESMA função que o servidor usa em produção (importa direto de
// server/db.ts) — não duplica a lógica, então não tem risco de divergir
// dela.
//
// Uso: npx tsx scripts/backfill-bdi-totals.ts
//      npx tsx scripts/backfill-bdi-totals.ts --dry-run   (só mostra, não grava)
import 'dotenv/config';
import { rawQuery, recalculateBudgetTotals } from '../server/db';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const budgets = await rawQuery('SELECT id, code, title, totalCost FROM budgets ORDER BY id');
  console.log(`Encontrados ${budgets.length} orçamentos.\n`);

  let changedCount = 0;
  let unchangedCount = 0;
  const changes: Array<{ id: number; code: string; before: string; after: string; diff: number }> = [];

  let i = 0;
  for (const budget of budgets) {
    i++;
    process.stdout.write(`[${i}/${budgets.length}] ${budget.code}...`);
    const before = String(budget.totalCost ?? '0.00');

    // skipItemCostRecalc: true — só queremos recalcular o TOTAL com BDI em
    // cima dos custos unitários que já estão salvos em budget_items, não
    // refazer o custo unitário de cada item a partir da composição (isso é
    // uma operação bem mais cara, várias idas ao banco por item, e não tem
    // nada a ver com o bug de BDI que estamos corrigindo aqui).
    const result = await recalculateBudgetTotals(budget.id, { dryRun: DRY_RUN, skipItemCostRecalc: true });
    const afterValue = result ? result.totalCost.toFixed(2) : before;

    const diff = parseFloat(afterValue) - parseFloat(before);
    if (Math.abs(diff) > 0.01) {
      changedCount++;
      changes.push({ id: budget.id, code: budget.code, before, after: afterValue, diff });
      process.stdout.write(` mudou (${before} -> ${afterValue})\n`);
    } else {
      unchangedCount++;
      process.stdout.write(` sem mudança\n`);
    }
  }

  console.log(DRY_RUN ? '=== MODO DRY-RUN (nada foi gravado) ===\n' : '=== Alterações gravadas ===\n');
  for (const c of changes) {
    console.log(`${c.code} (id ${c.id}): ${c.before} -> ${c.after}  (diferença: ${c.diff >= 0 ? '+' : ''}${c.diff.toFixed(2)})`);
  }
  console.log(`\nTotal: ${budgets.length} orçamentos | ${changedCount} corrigidos | ${unchangedCount} já estavam corretos.`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
