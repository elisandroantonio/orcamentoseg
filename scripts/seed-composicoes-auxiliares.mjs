// Cadastra "composições auxiliares" (ex: argamassa traço 1:3) com a receita
// de materiais base (cimento, areia, cal...), usando o MESMO código SINAPI
// que já é usado como insumo de preço fechado em outras composições. A
// partir daí, a lista de materiais (extractMaterialsFromBudget, em
// server/routers/materialLists.ts) passa a "abrir" essa argamassa em
// cimento/areia em vez de lançar um preço fechado por m³.
//
// Fonte dos coeficientes: composição auxiliar oficial SINAPI, consultada em
// orcamentor.com (agregador que replica a base SINAPI) em ago/2026. Confira
// o coeficiente antes de usar em orçamento de licitação pública — o SINAPI
// atualiza preços/coeficientes mensalmente e pode variar conforme o estado.
//
// Idempotente: se já existir uma composição com o mesmo código pro usuário,
// pula (não duplica). Reaproveita insumos existentes (cimento, areia) por
// palavra-chave na descrição em vez de criar duplicados, quando encontra.
//
// Uso: node scripts/seed-composicoes-auxiliares.mjs
// Só escreve no banco do .env (o banco real) — é o objetivo do script.

import { config } from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[seed-auxiliares] Faltou DATABASE_URL no .env.");
  process.exit(1);
}

function parseConn(url) {
  const clean = url.replace(/\?.*/, "");
  const u = new URL(clean);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 4000,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "test",
    ssl: { rejectUnauthorized: true },
  };
}

function normalizeCode(code) {
  return (code || "").toString().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// ── Receitas a cadastrar ────────────────────────────────────────────────
// Adicione outras composições auxiliares aqui (mesmo formato) conforme for
// confirmando os coeficientes oficiais de cada traço.
const RECEITAS = [
  {
    code: "SINAPI-88629",
    description: "ARGAMASSA TRAÇO 1:3 (EM VOLUME DE CIMENTO E AREIA MÉDIA ÚMIDA), PREPARO MANUAL. AF_08/2019",
    unit: "M3",
    materiais: [
      { keywords: ["cimento"], description: "Cimento Portland Composto CP II-32", unit: "KG", coefficient: 482.96, referenceUnitCost: 0.72 },
      { keywords: ["areia", "media"], description: "Areia Média - posto jazida/fornecedor", unit: "M3", coefficient: 1.07, referenceUnitCost: 92.0 },
    ],
  },
];

const conn = await mysql.createConnection(parseConn(DATABASE_URL));

try {
  const [users] = await conn.query("SELECT id, name, email FROM users");
  if (users.length === 0) {
    console.error("[seed-auxiliares] Nenhum usuário encontrado no banco. Abortando.");
    process.exit(1);
  }

  let owner = users.find((u) => (u.email || "").toLowerCase() === "elisandro@construtoraeg.com.br");

  if (!owner) {
    // Sem bater por e-mail, escolhe o usuário "dono dos dados": o que tem
    // mais composições cadastradas (o mesmo critério de "quem é o usuário
    // de verdade" que a plataforma já usa em outros lugares).
    const [counts] = await conn.query(
      "SELECT userId, COUNT(*) as total FROM compositions GROUP BY userId ORDER BY total DESC LIMIT 1"
    );
    if (counts.length > 0) {
      owner = users.find((u) => u.id === counts[0].userId);
    }
  }

  if (!owner) {
    console.error(
      `[seed-auxiliares] Encontrei ${users.length} usuários e não consegui identificar qual é o dono dos dados. ` +
      `Usuários encontrados:\n` +
      users.map((u) => `  - id=${u.id} nome="${u.name || ""}" email="${u.email || ""}"`).join("\n") +
      `\nAbra o arquivo e defina o userId manualmente antes de rodar.`
    );
    process.exit(1);
  }

  const userId = owner.id;
  console.log(`[seed-auxiliares] Usuário: ${owner.name || "(sem nome)"} — ${owner.email || "sem e-mail"} (id=${userId})\n`);

  for (const receita of RECEITAS) {
    const normCode = normalizeCode(receita.code);

    const [existingComps] = await conn.query(
      "SELECT id, code FROM compositions WHERE userId = ?",
      [userId]
    );
    const already = existingComps.find((c) => normalizeCode(c.code) === normCode);
    if (already) {
      console.log(`[seed-auxiliares] "${receita.code}" já existe como composição (id=${already.id}) — pulando.\n`);
      continue;
    }

    const [allInputs] = await conn.query(
      "SELECT id, code, description, unit, unitCost FROM inputs WHERE userId = ? AND type = 'material'",
      [userId]
    );

    const resolvedMateriais = [];
    for (const mat of receita.materiais) {
      const found = allInputs.find((i) => {
        const desc = (i.description || "").toLowerCase();
        return mat.keywords.every((k) => desc.includes(k));
      });
      if (found) {
        console.log(`[seed-auxiliares]   Reaproveitando insumo existente p/ "${mat.description}": id=${found.id} ("${found.description}", R$ ${found.unitCost}/${found.unit})`);
        resolvedMateriais.push({ inputId: found.id, coefficient: mat.coefficient, unitCost: Number(found.unitCost) });
      } else {
        const [insertResult] = await conn.query(
          "INSERT INTO inputs (userId, code, description, type, unit, unitCost) VALUES (?, ?, ?, 'material', ?, ?)",
          [userId, receita.code, mat.description.toUpperCase(), mat.unit, mat.referenceUnitCost]
        );
        console.log(`[seed-auxiliares]   Criado novo insumo "${mat.description}": id=${insertResult.insertId} (preço de referência SINAPI R$ ${mat.referenceUnitCost} — ajuste pro preço do seu fornecedor se quiser)`);
        resolvedMateriais.push({ inputId: insertResult.insertId, coefficient: mat.coefficient, unitCost: mat.referenceUnitCost });
      }
    }

    const materialCostTotal = resolvedMateriais.reduce(
      (sum, m) => sum + m.coefficient * m.unitCost,
      0
    );

    const [compResult] = await conn.query(
      "INSERT INTO compositions (userId, code, description, unit, materialCost, laborCost, laborHours) VALUES (?, ?, ?, ?, ?, '0', '0')",
      [userId, receita.code, receita.description, receita.unit, materialCostTotal.toFixed(2)]
    );
    const compositionId = compResult.insertId;
    console.log(`[seed-auxiliares] ✓ Composição "${receita.code}" criada (id=${compositionId}, materialCost=R$ ${materialCostTotal.toFixed(2)}/${receita.unit})`);

    for (const m of resolvedMateriais) {
      await conn.query(
        "INSERT INTO composition_inputs (compositionId, inputId, quantity, coefficient) VALUES (?, ?, ?, ?)",
        [compositionId, m.inputId, "1.0000", m.coefficient]
      );
    }
    console.log(`[seed-auxiliares]   ${resolvedMateriais.length} insumo(s) vinculado(s).\n`);
  }

  console.log("[seed-auxiliares] Concluído. Nas listas de materiais existentes, clique em \"Regenerar\" no orçamento correspondente pra ver a argamassa expandida em cimento/areia.");
} finally {
  await conn.end();
}
