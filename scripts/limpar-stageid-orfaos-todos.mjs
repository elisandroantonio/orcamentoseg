// Passo 1/2 pra ativar a FK de verdade em produção (ver ORC-2026-047,
// tarefa #71): zera (SET NULL) o stageId de QUALQUER item, em QUALQUER
// orçamento, cujo stageId aponte pra uma etapa que não existe (mais) nesse
// orçamento. NÃO apaga nenhuma linha — só limpa o campo, exatamente como o
// próprio banco faria se a FK "ON DELETE SET NULL" já estivesse ativa desde
// o início (ela nunca existiu de fato — confirmado via check-fk-stageid.mjs).
//
// Pré-requisito pra poder criar a FK depois: o MySQL/TiDB recusa criar uma
// FK se já existir alguma linha violando ela. Depois deste script rodar, o
// stageId de TODO item vai estar OU nulo OU apontando pra uma etapa real —
// aí sim dá pra criar a constraint sem erro.
//
// Isso NÃO muda o total de nenhum orçamento: esses itens já eram ignorados
// no cálculo (pela trava em recalculateBudgetTotals), só estavam com
// stageId != NULL "por acidente". Depois deste script eles ficam com
// stageId = NULL, que é tratado exatamente igual.
//
// SEGURANÇA: dry-run por padrão. Só grava com --confirm.
//
// Uso:
//   node scripts/limpar-stageid-orfaos-todos.mjs            (dry-run)
//   node scripts/limpar-stageid-orfaos-todos.mjs --confirm  (executa)
import 'dotenv/config';
import mysql from 'mysql2/promise';

const CONFIRM = process.argv.includes('--confirm');
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [budgets] = await conn.query(`SELECT id, code, title FROM budgets`);

let totalOrfaosEncontrados = 0;
let orcamentosAfetados = 0;
const idsParaLimpar = [];

for (const b of budgets) {
  const [items] = await conn.query(
    `SELECT id, stageId FROM budget_items WHERE budgetId = ? AND stageId IS NOT NULL`,
    [b.id]
  );
  if (items.length === 0) continue;

  const [stages] = await conn.query(`SELECT id FROM budget_stages WHERE budgetId = ?`, [b.id]);
  const validStageIds = new Set(stages.map((s) => s.id));

  const orfaos = items.filter((i) => !validStageIds.has(i.stageId));
  if (orfaos.length > 0) {
    orcamentosAfetados++;
    totalOrfaosEncontrados += orfaos.length;
    console.log(`Orçamento ${b.id} ${b.code || ''} "${b.title || ''}" — ${orfaos.length} item(ns) com stageId órfão`);
    for (const o of orfaos) idsParaLimpar.push(o.id);
  }
}

console.log(`\n=== RESUMO ===`);
console.log(`Orçamentos afetados: ${orcamentosAfetados}`);
console.log(`Itens com stageId órfão a limpar (SET NULL): ${totalOrfaosEncontrados}`);

if (totalOrfaosEncontrados === 0) {
  console.log('\nNada a fazer — nenhum stageId órfão encontrado em nenhum orçamento.');
  await conn.end();
  process.exit(0);
}

if (!CONFIRM) {
  console.log('\n[DRY-RUN] Nada foi gravado. Rode de novo com --confirm pra zerar o stageId desses itens.');
  await conn.end();
  process.exit(0);
}

console.log('\n[--confirm] Zerando stageId dos itens órfãos...');
const CHUNK = 500;
for (let i = 0; i < idsParaLimpar.length; i += CHUNK) {
  const chunk = idsParaLimpar.slice(i, i + CHUNK);
  await conn.query(
    `UPDATE budget_items SET stageId = NULL WHERE id IN (${chunk.map(() => '?').join(',')})`,
    chunk
  );
}
console.log(`Concluído. ${idsParaLimpar.length} item(ns) atualizados (stageId = NULL).`);
console.log('Próximo passo: node scripts/add-fk-stageid.mjs');

await conn.end();
