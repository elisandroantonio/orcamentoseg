// Verifica se a FK budget_items.stageId -> budget_stages.id está realmente
// ativa na produção (TiDB Cloud), e com que regra ON DELETE. Isso não muda
// nada, só lê o schema. Ver ORC-2026-047 / tarefa pendente #71.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(
  `SELECT
     CONSTRAINT_NAME,
     COLUMN_NAME,
     REFERENCED_TABLE_NAME,
     REFERENCED_COLUMN_NAME
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'budget_items'
     AND REFERENCED_TABLE_NAME IS NOT NULL`
);

console.log('=== Foreign keys declaradas em budget_items ===');
console.table(rows);

const [rules] = await conn.query(
  `SELECT
     CONSTRAINT_NAME,
     UPDATE_RULE,
     DELETE_RULE
   FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'budget_items'`
);

console.log('\n=== Regras ON UPDATE / ON DELETE ===');
console.table(rules);

const stageFk = rules.find((r) =>
  rows.some((c) => c.CONSTRAINT_NAME === r.CONSTRAINT_NAME && c.COLUMN_NAME === 'stageId')
);

if (!stageFk) {
  console.log('\n⚠️ Nenhuma FK encontrada para budget_items.stageId — a validação de integridade referencial NÃO está ativa no banco. É por isso que itens órfãos conseguem existir (stageId apontando pra uma etapa já apagada) sem o banco reclamar. A trava que já colocamos em recalculateBudgetTotals continua protegendo o total mesmo assim.');
} else {
  console.log(`\nFK encontrada: ${stageFk.CONSTRAINT_NAME} — DELETE_RULE=${stageFk.DELETE_RULE}, UPDATE_RULE=${stageFk.UPDATE_RULE}`);
  if (stageFk.DELETE_RULE !== 'SET NULL') {
    console.log(`⚠️ Esperado DELETE_RULE=SET NULL (é o que o schema Drizzle declara), mas o banco tem "${stageFk.DELETE_RULE}". Pode explicar itens órfãos com stageId não-nulo apontando pra etapa inexistente.`);
  } else {
    console.log('✅ DELETE_RULE=SET NULL confirmado — bate com o schema declarado.');
  }
}

await conn.end();
