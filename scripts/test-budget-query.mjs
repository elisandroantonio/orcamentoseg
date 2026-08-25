import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await conn.execute(
    "select `id`, `budgetId`, `stageId`, `type`, `parentItemId`, `compositionId`, `description`, `unit`, `quantity`, `materialCost`, `laborCost`, `equipmentCost`, `serviceCost`, `otherCost`, `unitCost`, `totalCost`, `laborHours`, `totalLaborHours`, `order`, `aplicarEncargosSociais`, `laborAdjustment`, `createdAt` from `budget_items` where `budget_items`.`budgetId` = ? order by `budget_items`.`order`",
    [840001]
  );
  console.log('Query OK, rows:', rows.length);
} catch (e) {
  console.error('Query FAILED:', e.message);
}
await conn.end();
