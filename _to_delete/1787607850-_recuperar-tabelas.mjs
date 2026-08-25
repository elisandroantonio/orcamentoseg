// Tentativa de recuperação via RECOVER TABLE (recurso nativo do TiDB) —
// só RESTAURA tabelas apagadas dentro da janela de GC; não apaga nada e
// não sobrescreve nada que já exista. Seguro de rodar.
import "dotenv/config";
import mysql2 from "mysql2/promise";

const TABLES = [
  "users", "categories", "clients", "inputs", "compositions",
  "composition_inputs", "projects", "budgets", "budget_stages",
  "budget_items", "budget_item_inputs", "budget_item_bdi_config",
  "schedule_activities", "schedule_periods", "disbursements",
  "company_settings", "budget_templates", "template_stages",
  "template_items", "budget_schedule_periods", "budget_schedule_items",
  "budget_monthly_distribution", "measurement_periods", "measurement_items",
  "contract_additives", "cash_flow_entries", "bank_accounts",
  "fleet_vehicles", "financial_transactions", "budget_additives",
  "additive_stages", "additive_items", "additive_item_inputs",
  "additive_measurements", "material_lists", "material_list_budgets",
  "material_list_items", "cub_sc_values",
];

const dbUrl = process.env.DATABASE_URL;
const conn = await mysql2.createConnection({ uri: dbUrl });

console.log("Tentando RECOVER TABLE pra", TABLES.length, "tabelas...\n");

let ok = 0;
let falhou = 0;
for (const t of TABLES) {
  try {
    await conn.query(`RECOVER TABLE \`${t}\``);
    console.log(`✅ RECUPERADA: ${t}`);
    ok++;
  } catch (err) {
    console.log(`❌ ${t}: ${err.message}`);
    falhou++;
  }
}

console.log(`\nResumo: ${ok} recuperadas, ${falhou} falharam.`);

console.log("\n--- Conferindo o que existe agora ---");
const [tables] = await conn.query("SHOW TABLES");
console.log(`Tabelas no banco agora (${tables.length}):`);
for (const row of tables) {
  console.log(" -", Object.values(row)[0]);
}

if (tables.length > 0) {
  try {
    const [[{ n }]] = await conn.query("SELECT COUNT(*) as n FROM budgets");
    console.log("\nRegistros em 'budgets':", n);
  } catch {}
  try {
    const [[{ n }]] = await conn.query("SELECT COUNT(*) as n FROM users");
    console.log("Registros em 'users':", n);
  } catch {}
}

await conn.end();
