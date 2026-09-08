// Passo 2/2 (ver ORC-2026-047, tarefa #71): cria de verdade a FK
// budget_items.stageId -> budget_stages.id com ON DELETE SET NULL na
// produção — a mesma regra que o schema Drizzle já declarava, mas que
// nunca tinha sido criada de fato no banco (confirmado via
// check-fk-stageid.mjs). A partir daqui, mesmo que uma etapa seja apagada
// por um caminho de código ainda não mapeado, o PRÓPRIO BANCO vai zerar o
// stageId dos itens automaticamente — não depende mais só do código do
// servidor.
//
// PRÉ-REQUISITO: rodar antes node scripts/limpar-stageid-orfaos-todos.mjs
// --confirm. Se ainda existir algum item com stageId órfão, o MySQL/TiDB
// recusa criar a constraint — este script já checa isso antes de tentar.
//
// SEGURANÇA: dry-run por padrão (só valida e mostra o que faria). Só
// executa o ALTER TABLE com --confirm.
//
// Uso:
//   node scripts/add-fk-stageid.mjs            (dry-run / checagem)
//   node scripts/add-fk-stageid.mjs --confirm  (executa o ALTER TABLE)
import 'dotenv/config';
import mysql from 'mysql2/promise';

const CONFIRM = process.argv.includes('--confirm');
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1) Já existe alguma FK nessa coluna?
const [existing] = await conn.query(
  `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budget_items'
     AND COLUMN_NAME = 'stageId' AND REFERENCED_TABLE_NAME IS NOT NULL`
);
if (existing.length > 0) {
  console.log(`Já existe uma FK em budget_items.stageId: ${existing[0].CONSTRAINT_NAME}. Nada a fazer.`);
  await conn.end();
  process.exit(0);
}

// 2) Pré-checagem: ainda tem algum item órfão (stageId não-nulo apontando
// pra etapa que não existe nesse orçamento)? Se tiver, o ALTER TABLE vai
// falhar — melhor avisar aqui com detalhe do que deixar o MySQL estourar
// um erro genérico.
const [orfaos] = await conn.query(`
  SELECT bi.id, bi.budgetId, bi.stageId
  FROM budget_items bi
  LEFT JOIN budget_stages bs ON bs.id = bi.stageId AND bs.budgetId = bi.budgetId
  WHERE bi.stageId IS NOT NULL AND bs.id IS NULL
`);
if (orfaos.length > 0) {
  console.log(`⚠️ Ainda existem ${orfaos.length} item(ns) com stageId órfão — a FK vai falhar ao ser criada.`);
  console.log('Rode primeiro: node scripts/limpar-stageid-orfaos-todos.mjs --confirm');
  console.table(orfaos.slice(0, 10));
  await conn.end();
  process.exit(1);
}
console.log('✅ Nenhum item órfão restante — seguro pra criar a FK.');

if (!CONFIRM) {
  console.log('\n[DRY-RUN] Nada foi alterado. Rode de novo com --confirm pra criar a constraint de verdade.');
  await conn.end();
  process.exit(0);
}

console.log('\n[--confirm] Criando a FK budget_items.stageId -> budget_stages.id (ON DELETE SET NULL)...');
try {
  await conn.query(`
    ALTER TABLE budget_items
    ADD CONSTRAINT budget_items_stageId_budget_stages_id_fk
    FOREIGN KEY (stageId) REFERENCES budget_stages(id) ON DELETE SET NULL ON UPDATE NO ACTION
  `);
  console.log('✅ FK criada com sucesso.');
} catch (err) {
  console.error('❌ Falha ao criar a FK:', err.message);
  console.error('Nada foi alterado além da tentativa acima (ALTER TABLE é atômico). Investigar antes de tentar de novo.');
  await conn.end();
  process.exit(1);
}

// 3) Confirmação final: reler o schema e mostrar a regra criada.
const [rules] = await conn.query(`
  SELECT CONSTRAINT_NAME, UPDATE_RULE, DELETE_RULE
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'budget_items'
    AND CONSTRAINT_NAME = 'budget_items_stageId_budget_stages_id_fk'
`);
console.log('\n=== Verificação ===');
console.table(rules);

await conn.end();
