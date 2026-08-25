import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

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
];

try {
  for (const stmt of alterStatements) {
    try {
      await conn.query(stmt);
      console.log('OK:', stmt.substring(0, 60));
    } catch (e) {
      console.log('SKIP (already exists or error):', e.message.substring(0, 80));
    }
  }
  
  // Verify
  const [rows] = await conn.query('DESCRIBE budgets');
  const cols = rows.map(r => r.Field);
  console.log('\nFinal columns:', cols.join(', '));
} finally {
  await conn.end();
}
