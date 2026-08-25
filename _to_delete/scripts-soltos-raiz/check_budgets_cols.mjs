import dotenv from 'dotenv';
import { createConnection } from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, 'orcamento-obras-dinamico/.env') });

const conn = await createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await conn.query('DESCRIBE budgets');
  const cols = rows.map(r => r.Field);
  console.log('All columns:', cols.join(', '));
  const drizzleExpected = ['socialCharges', 'adminCentral', 'profit', 'taxes', 'risk', 'warranty', 'totalMaterialCost', 'totalLaborCost', 'totalCost', 'totalLaborHours', 'startDate', 'endDate', 'durationMonths', 'periodType', 'code', 'frozenAt', 'frozenBy'];
  for (const c of drizzleExpected) {
    if (!cols.includes(c)) console.log('MISSING:', c);
  }
  console.log('Done');
} finally {
  await conn.end();
}
