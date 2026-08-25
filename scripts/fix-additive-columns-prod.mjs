import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL + '&ssl={"rejectUnauthorized":true}').catch(() =>
  mysql.createConnection(process.env.DATABASE_URL)
);

console.log('Conectado ao banco remoto.');

// Verificar colunas existentes na tabela additive_items
const [cols] = await conn.execute("SHOW COLUMNS FROM additive_items");
const colNames = cols.map(c => c.Field.toLowerCase());
console.log('Colunas existentes:', colNames.join(', '));

const needed = [
  { name: 'applyBdiToMaterial', sql: "ALTER TABLE additive_items ADD COLUMN `applyBdiToMaterial` TINYINT NOT NULL DEFAULT 1" },
  { name: 'applyBdiToLabor', sql: "ALTER TABLE additive_items ADD COLUMN `applyBdiToLabor` TINYINT NOT NULL DEFAULT 1" },
  { name: 'aplicarEncargosSociais', sql: "ALTER TABLE additive_items ADD COLUMN `aplicarEncargosSociais` TINYINT NOT NULL DEFAULT 1" },
  { name: 'additionalIncrement', sql: "ALTER TABLE additive_items ADD COLUMN `additionalIncrement` DECIMAL(10,2) NOT NULL DEFAULT 0" },
  { name: 'discount', sql: "ALTER TABLE additive_items ADD COLUMN `discount` DECIMAL(10,2) NOT NULL DEFAULT 0" },
  { name: 'includeMaterial', sql: "ALTER TABLE additive_items ADD COLUMN `includeMaterial` TINYINT NOT NULL DEFAULT 1" },
];

for (const col of needed) {
  if (!colNames.includes(col.name.toLowerCase())) {
    console.log(`Adicionando coluna: ${col.name}`);
    await conn.execute(col.sql);
    console.log(`✓ ${col.name} adicionada`);
  } else {
    console.log(`✓ ${col.name} já existe`);
  }
}

await conn.end();
console.log('Pronto!');
