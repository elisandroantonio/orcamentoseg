import type { Express, Request, Response } from "express";
import { rawQuery } from "../db";

/**
 * API PÚBLICA (somente leitura) para o site institucional.
 *
 * Expõe SOMENTE obras que a equipe marcou explicitamente "Mostrar no site"
 * (budgets.showOnSite = 1) e que estão Em Execução. Devolve apenas nome
 * público, cidade, categoria, datas e % de evolução — nunca valores em R$,
 * nome de cliente, nem o título interno do orçamento.
 */

const ALLOWED_ORIGINS = new Set([
  "https://construtoraeg.com.br",
  "https://www.construtoraeg.com.br",
  "http://localhost:4321",
  "http://localhost:4322",
]);

const pick = (row: any, key: string) => row?.[key] ?? row?.[key.toLowerCase()];

export function registerPublicSiteRoutes(app: Express) {
  app.get("/api/public/obras-em-andamento", async (req: Request, res: Response) => {
    const origin = String(req.headers.origin || "");
    if (ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    try {
      const rows: any[] = await rawQuery(
        `SELECT id, title, siteTitle, siteCity, siteCategory, startDate, endDate, totalCost
           FROM budgets
          WHERE showOnSite = 1 AND workStatus = 'execucao'
          ORDER BY startDate DESC, id DESC`
      );
      const obras = [];
      for (const r of rows) {
        const id = Number(pick(r, "id"));
        const baseTotal = Number(pick(r, "totalCost") || 0);
        // Aditivos aprovados entram no total do contrato e nas medições, como na aba Medições
        const add: any[] = await rawQuery(
          `SELECT id, totalCostWithBdi FROM budget_additives WHERE budgetId = ? AND status = 'aprovado'`,
          [id]
        );
        const addTotal = add.reduce((a, x) => a + Number(pick(x, "totalCostWithBdi") || 0), 0);
        const med: any[] = await rawQuery(
          `SELECT COALESCE(SUM(valueMeasured),0) AS v FROM measurement_items WHERE budgetId = ?`,
          [id]
        );
        let measured = Number(pick(med[0], "v") || 0);
        if (add.length) {
          const ids = add.map((x) => Number(pick(x, "id")));
          const am: any[] = await rawQuery(
            `SELECT COALESCE(SUM(measuredValue),0) AS v FROM additive_measurements WHERE additiveId IN (${ids.map(() => "?").join(",")})`,
            ids
          );
          measured += Number(pick(am[0], "v") || 0);
        }
        const total = baseTotal + addTotal;
        const progress = total > 0 ? Math.max(0, Math.min(100, (measured / total) * 100)) : 0;
        obras.push({
          id,
          titulo: String(pick(r, "siteTitle") || "Obra em andamento"),
          cidade: pick(r, "siteCity") || null,
          categoria: pick(r, "siteCategory") || null,
          inicio: pick(r, "startDate") || null,
          previsaoTermino: pick(r, "endDate") || null,
          evolucao: Math.round(progress * 10) / 10,
        });
      }
      res.json({ obras });
    } catch (e) {
      console.error("[publicSite] erro:", e);
      res.status(500).json({ obras: [], error: "indisponivel" });
    }
  });
}
