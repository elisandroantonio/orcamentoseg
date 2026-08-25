import 'dotenv/config';
import { createConnection } from 'mysql2/promise';

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
if (!ORIGINAL_DB_URL) throw new Error('DATABASE_URL não definido (.env)');

const conn = await createConnection(ORIGINAL_DB_URL);

try {
  // Verificar colunas atuais
  const [rows] = await conn.query('DESCRIBE budgets');
  const cols = rows.map(r => r.Field);
  console.log('Current columns:', cols.join(', '));

  const alterStatements = [
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `socialCharges` decimal(5,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `adminCentral` decimal(5,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `profit` decimal(5,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `taxes` decimal(5,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `risk` decimal(5,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `warranty` decimal(5,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `totalMaterialCost` decimal(15,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `totalLaborCost` decimal(15,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `totalCost` decimal(15,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `totalLaborHours` decimal(15,2) NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `startDate` date",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `endDate` date",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `durationMonths` int NOT NULL DEFAULT '0'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `periodType` varchar(20) NOT NULL DEFAULT 'months'",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `code` varchar(50)",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `frozenAt` timestamp NULL",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `frozenBy` varchar(255) NULL",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS `workStatus` varchar(50) NOT NULL DEFAULT 'orcamento'",
  ];

  for (const stmt of alterStatements) {
    try {
      await conn.query(stmt);
      console.log('OK:', stmt.substring(0, 70));
    } catch (e) {
      console.log('SKIP:', e.message.substring(0, 100));
    }
  }
  
  // Verify
  const [rows2] = await conn.query('DESCRIBE budgets');
  const cols2 = rows2.map(r => r.Field);
  console.log('\nFinal columns:', cols2.join(', '));
  console.log('\nHas frozenAt:', cols2.includes('frozenAt'));
  console.log('Has frozenBy:', cols2.includes('frozenBy'));
} finally {
  await conn.end();
}
