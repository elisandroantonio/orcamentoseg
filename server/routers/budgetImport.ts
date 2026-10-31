import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import * as db from "../db";
import { budgets, budgetStages, budgetItems, compositions } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { prepareComps, matchRow } from "../../shared/budgetImportMatch";

/**
 * Importação de orçamento a partir de planilha Excel (já lida no navegador).
 *  - matchItems: sugere a composição da plataforma para cada linha (código ou descrição)
 *  - importBudget: cria o orçamento novo com etapas e itens, depois da conferência do usuário
 * Nunca altera orçamentos existentes — só cria um novo.
 */
export const budgetImportRouter = router({
  matchItems: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        key: z.string(),
        code: z.string().nullable().optional(),
        description: z.string(),
        unit: z.string().nullable().optional(),
      })).max(3000),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const rows = await database
        .select({
          id: compositions.id, code: compositions.code, description: compositions.description,
          unit: compositions.unit, materialCost: compositions.materialCost,
          laborCost: compositions.laborCost, equipmentCost: compositions.equipmentCost,
        })
        .from(compositions)
        .where(eq(compositions.userId, ctx.user.id));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const prepared = prepareComps(rows.map((r) => ({ id: r.id, code: r.code, description: r.description, unit: r.unit })));

      return input.items.map((it) => {
        const cands = matchRow(it, prepared, 5, 0.4).map((c) => {
          const r = byId.get(c.compositionId)!;
          return {
            compositionId: c.compositionId,
            score: c.score,
            byCode: c.byCode,
            code: r.code,
            description: r.description,
            unit: r.unit,
            materialCost: Number(r.materialCost || 0),
            laborCost: Number(r.laborCost || 0),
            equipmentCost: Number(r.equipmentCost || 0),
          };
        });
        return { key: it.key, candidates: cands };
      });
    }),

  importBudget: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      clientId: z.number().optional(),
      params: z.object({
        socialCharges: z.number().min(0).max(999),
        adminCentral: z.number().min(0).max(999),
        risk: z.number().min(0).max(999),
        warranty: z.number().min(0).max(999),
        profit: z.number().min(0).max(999),
        taxes: z.number().min(0).max(999),
      }),
      stages: z.array(z.object({
        name: z.string().min(1),
        parentIndex: z.number().nullable(),
        items: z.array(z.object({
          description: z.string().min(1),
          unit: z.string(),
          quantity: z.number(),
          compositionId: z.number().nullable(),
          materialCost: z.number(),
          laborCost: z.number(),
          equipmentCost: z.number(),
          needsReview: z.boolean(),
        })),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Composições referenciadas (e pertencentes ao usuário)
      const compIds = Array.from(new Set(input.stages.flatMap((s) => s.items.map((i) => i.compositionId)).filter((x): x is number => x !== null)));
      const compRows = compIds.length
        ? await database.select().from(compositions).where(and(eq(compositions.userId, ctx.user.id), sql`${compositions.id} IN (${sql.join(compIds.map((i) => sql`${i}`), sql`, `)})`))
        : [];
      const compMap = new Map(compRows.map((c) => [c.id, c]));
      for (const id of compIds) {
        if (!compMap.has(id)) throw new TRPCError({ code: "BAD_REQUEST", message: `Composição ${id} não encontrada` });
      }

      // Código automático ORC-AAAA-NNN (mesma regra de budgets.create)
      const year = new Date().getFullYear();
      const last = await database.select({ code: budgets.code }).from(budgets)
        .where(sql`${budgets.code} LIKE ${`ORC-${year}-%`}`).orderBy(sql`${budgets.code} DESC`).limit(1);
      let next = 1;
      if (last.length > 0 && last[0].code) {
        const m = last[0].code.match(/ORC-\d{4}-(\d+)/);
        if (m) next = parseInt(m[1]) + 1;
      }
      const code = `ORC-${year}-${String(next).padStart(3, "0")}`;
      const p = input.params;

      const [res] = await database.insert(budgets).values({
        userId: ctx.user.id,
        code,
        title: input.title,
        clientId: input.clientId,
        socialCharges: p.socialCharges.toFixed(2),
        adminCentral: p.adminCentral.toFixed(2),
        risk: p.risk.toFixed(2),
        warranty: p.warranty.toFixed(2),
        profit: p.profit.toFixed(2),
        taxes: p.taxes.toFixed(2),
        observations: "Importado de planilha Excel — conferir itens marcados (CONFERIR).",
      });
      const budgetId = Number(res.insertId);

      try {
        const stageIds: number[] = [];
        let serviceCounter = 0;
        let nComp = 0, nService = 0, nReview = 0;

        for (let si = 0; si < input.stages.length; si++) {
          const st = input.stages[si];
          const parentId = st.parentIndex !== null && st.parentIndex < si ? stageIds[st.parentIndex] : null;
          const [sr] = await database.insert(budgetStages).values({
            budgetId, parentStageId: parentId, name: st.name.slice(0, 255), order: si,
          });
          const stageId = Number(sr.insertId);
          stageIds.push(stageId);

          for (let ii = 0; ii < st.items.length; ii++) {
            const it = st.items[ii];
            if (it.compositionId !== null) {
              const c = compMap.get(it.compositionId)!;
              const mat = parseFloat(c.materialCost), lab = parseFloat(c.laborCost), eq_ = parseFloat(c.equipmentCost || "0");
              const unitCost = mat + lab + eq_;
              const hh = parseFloat(c.laborHours);
              await database.insert(budgetItems).values({
                budgetId, stageId, type: "composition", compositionId: c.id,
                description: c.description, unit: c.unit,
                quantity: String(it.quantity),
                materialCost: mat.toFixed(2), laborCost: lab.toFixed(2), equipmentCost: eq_.toFixed(2),
                unitCost: unitCost.toFixed(2), totalCost: (unitCost * it.quantity).toFixed(2),
                laborHours: hh.toFixed(3), totalLaborHours: (hh * it.quantity).toFixed(2),
                order: ii,
              });
              nComp++;
            } else {
              serviceCounter++;
              const svcCode = `SPI${String(serviceCounter).padStart(7, "0")}`;
              const unitCost = it.materialCost + it.laborCost + it.equipmentCost;
              const desc = `${svcCode} - ${it.needsReview ? "(CONFERIR) " : ""}${it.description}`;
              await database.insert(budgetItems).values({
                budgetId, stageId, type: "service", compositionId: null,
                description: desc, unit: (it.unit || "UN").slice(0, 20),
                quantity: String(it.quantity),
                materialCost: it.materialCost.toFixed(2), laborCost: it.laborCost.toFixed(2),
                equipmentCost: it.equipmentCost.toFixed(2), serviceCost: "0.00", otherCost: "0.00",
                unitCost: unitCost.toFixed(2), totalCost: (unitCost * it.quantity).toFixed(2),
                laborHours: "0", totalLaborHours: "0", order: ii,
              });
              nService++;
              if (it.needsReview) nReview++;
            }
          }
        }

        await db.normalizeStageOrder(budgetId);
        await db.recalculateBudgetTotals(budgetId, { skipItemCostRecalc: true });
        return { id: budgetId, code, stages: input.stages.length, compositions: nComp, services: nService, pending: nReview };
      } catch (err) {
        // Não deixa orçamento pela metade: apaga o que foi criado (cascade).
        await database.delete(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.userId, ctx.user.id)));
        throw err;
      }
    }),
});
