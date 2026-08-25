import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar e adicionar colunas faltantes em budget_items
const [cols] = await conn.execute("SHOW COLUMNS FROM budget_items");
const colNames = cols.map(c => c.Field.toLowerCase());

const toAdd = [
  { name: 'aplicarEncargosSociais', sql: "ALTER TABLE budget_items ADD COLUMN `aplicarEncargosSociais` tinyint NOT NULL DEFAULT 1" },
];

for (const col of toAdd) {
  if (!colNames.includes(col.name.toLowerCase())) {
    console.log(`Adicionando coluna: ${col.name}`);
    await conn.execute(col.sql);
    console.log(`✓ Coluna ${col.name} adicionada`);
  } else {
    console.log(`✓ Coluna ${col.name} já existe`);
  }
}

// Verificar resultado final
const [finalCols] = await conn.execute("SHOW COLUMNS FROM budget_items");
console.log('\nColunas finais:', finalCols.map(c => c.Field).join(', '));

await conn.end();
