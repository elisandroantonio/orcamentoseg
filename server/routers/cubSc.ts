import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";
import { fetchCubScTable, type CubScTable } from "../lib/cubSc";
import { fetchCubScChapecoTable } from "../lib/cubScChapeco";

// Mescla duas tabelas de CUB/SC (ano -> mês -> valor). Em caso de o mesmo
// ano/mês existir nas duas, o valor de `overlay` vence — usado para dar
// prioridade à fonte mais atualizada (Chapecó) sobre a mais antiga
// (SENGE-SC) quando ambas trazem o mesmo período.
function mergeCubScTables(base: CubScTable, overlay: CubScTable): CubScTable {
  const merged: CubScTable = {};
  for (const [yearStr, months] of Object.entries(base)) {
    merged[Number(yearStr)] = { ...months };
  }
  for (const [yearStr, months] of Object.entries(overlay)) {
    const year = Number(yearStr);
    merged[year] = { ...(merged[year] || {}), ...months };
  }
  return merged;
}

type Row = { year: number; month: number; value: string; source: "auto" | "manual" };

async function getAllRows(): Promise<Row[]> {
  return (await rawQuery(
    `SELECT year, month, value, source FROM cub_sc_values ORDER BY year, month`
  )) as Row[];
}

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function buildSummary(rows: Row[]) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.year - b.year || a.month - b.month);
  const latest = sorted[sorted.length - 1];
  const idx = sorted.length - 1;
  const prevMonth = sorted[idx - 1];
  const janSameYear = sorted.find((r) => r.year === latest.year && r.month === 1);
  const sameMonthLastYear = sorted.find((r) => r.year === latest.year - 1 && r.month === latest.month);

  const latestValue = parseFloat(latest.value);

  const pct = (base?: Row) => {
    if (!base) return null;
    const baseValue = parseFloat(base.value);
    if (!baseValue) return null;
    return ((latestValue - baseValue) / baseValue) * 100;
  };

  return {
    year: latest.year,
    month: latest.month,
    monthLabel: MONTH_LABELS[latest.month - 1],
    value: latestValue,
    source: latest.source,
    updatedAt: null as string | null,
    monthlyVariationPct: pct(prevMonth),
    yearToDateVariationPct: latest.month === 1 ? 0 : pct(janSameYear),
    twelveMonthVariationPct: pct(sameMonthLastYear),
  };
}

export const cubScRouter = router({
  getSummary: protectedProcedure.query(async () => {
    const rows = await getAllRows();
    return buildSummary(rows);
  }),

  // Busca a tabela pública mais recente nas duas fontes conhecidas
  // (Sinduscon-Chapecó e SENGE-SC) e atualiza o histórico. O Sinduscon-
  // Chapecó tende a publicar o mês mais recente primeiro (ver comentário em
  // lib/cubScChapeco.ts sobre a diferença de convenção de mês entre as
  // fontes, já compensada no parser); o SENGE-SC funciona como reforço —
  // nenhuma das duas derruba a outra, e só falha se AMBAS falharem. Nunca
  // sobrescreve um valor que tenha sido corrigido manualmente (source =
  // 'manual') — só atualiza/cria linhas que já eram 'auto'.
  refresh: protectedProcedure.mutation(async () => {
    let sengeTable: CubScTable = {};
    let chapecoTable: CubScTable = {};
    const errors: string[] = [];

    try {
      sengeTable = await fetchCubScTable();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    try {
      chapecoTable = await fetchCubScChapecoTable();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    if (Object.keys(sengeTable).length === 0 && Object.keys(chapecoTable).length === 0) {
      throw new Error(
        errors.join(" | ") || "Não consegui buscar o CUB/SC em nenhuma fonte automática."
      );
    }

    // Chapecó por cima do SENGE-SC: em caso de conflito no mesmo ano/mês,
    // vale o valor mais recente/atualizado.
    const table = mergeCubScTables(sengeTable, chapecoTable);
    let upserted = 0;

    for (const [yearStr, months] of Object.entries(table)) {
      const year = parseInt(yearStr, 10);
      for (const [monthStr, value] of Object.entries(months)) {
        const month = parseInt(monthStr, 10);
        const existing = await rawQuery(
          `SELECT id, source FROM cub_sc_values WHERE year = ? AND month = ?`,
          [year, month]
        );
        if (existing.length === 0) {
          await rawQuery(
            `INSERT INTO cub_sc_values (year, month, value, source) VALUES (?, ?, ?, 'auto')`,
            [year, month, value]
          );
          upserted++;
        } else if (existing[0].source === "auto") {
          await rawQuery(`UPDATE cub_sc_values SET value = ?, updatedAt = NOW() WHERE id = ?`, [
            value,
            existing[0].id,
          ]);
          upserted++;
        }
      }
    }

    const rows = await getAllRows();
    return { upserted, summary: buildSummary(rows) };
  }),

  setManual: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        value: z.number().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await rawQuery(`SELECT id FROM cub_sc_values WHERE year = ? AND month = ?`, [
        input.year,
        input.month,
      ]);
      if (existing.length === 0) {
        await rawQuery(
          `INSERT INTO cub_sc_values (year, month, value, source) VALUES (?, ?, ?, 'manual')`,
          [input.year, input.month, input.value]
        );
      } else {
        await rawQuery(
          `UPDATE cub_sc_values SET value = ?, source = 'manual', updatedAt = NOW() WHERE id = ?`,
          [input.value, existing[0].id]
        );
      }
      const rows = await getAllRows();
      return { summary: buildSummary(rows) };
    }),
});
