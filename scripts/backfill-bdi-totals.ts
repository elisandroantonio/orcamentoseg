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

  for (const budget of budgets) {
    const before = String(budget.totalCost ?? '0.00');

    if (!DRY_RUN) {
      await recalculateBudgetTotals(budget.id);
    }

    const [after] = await rawQuery('SELECT totalCost FROM budgets WHERE id = ?', [budget.id]);
    const afterValue = DRY_RUN ? before : String(after.totalCost ?? '0.00');

    const diff = parseFloat(afterValue) - parseFloat(before);
    if (Math.abs(diff) > 0.01) {
      changedCount++;
      changes.push({ id: budget.id, code: budget.code, before, after: afterValue, diff });
    } else {
      unchangedCount++;
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
