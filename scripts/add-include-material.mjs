import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Verificar se coluna já existe
  const [rows] = await conn.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'additive_items' AND COLUMN_NAME = 'includeMaterial'"
  );
  
  if (rows.length > 0) {
    console.log('✅ Coluna includeMaterial já existe em additive_items');
  } else {
    await conn.execute("ALTER TABLE additive_items ADD COLUMN `includeMaterial` TINYINT(1) NOT NULL DEFAULT 1");
    console.log('✅ Coluna includeMaterial criada com sucesso em additive_items');
  }
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await conn.end();
}
