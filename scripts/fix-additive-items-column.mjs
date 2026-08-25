import mysql from 'mysql2/promise';

// Conecta ao banco remoto de produção via DATABASE_URL
const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // 1. Verificar quais colunas existem em additive_items
  const [cols] = await conn.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'additive_items' ORDER BY ORDINAL_POSITION"
  );
  console.log('Colunas atuais em additive_items:', cols.map(c => c.COLUMN_NAME).join(', '));

  const colNames = cols.map(c => c.COLUMN_NAME);

  // 2. Adicionar includeMaterial se não existir
  if (!colNames.includes('includeMaterial')) {
    await conn.execute("ALTER TABLE additive_items ADD COLUMN `includeMaterial` TINYINT(1) NOT NULL DEFAULT 1");
    console.log('✅ Coluna includeMaterial adicionada!');
  } else {
    console.log('✅ Coluna includeMaterial já existe.');
  }

  // 3. Verificar novamente
  const [cols2] = await conn.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'additive_items' AND COLUMN_NAME = 'includeMaterial'"
  );
  console.log('Verificação final:', cols2.length > 0 ? 'COLUNA EXISTE ✅' : 'COLUNA NÃO ENCONTRADA ❌');

} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await conn.end();
  process.exit(0);
}
