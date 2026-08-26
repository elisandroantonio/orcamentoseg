import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";

/**
 * Regras de mesclagem manual de materiais na Lista de Materiais (aba Resumo
 * Geral). ctx.user.id escopa tudo — cada usuário tem suas próprias regras,
 * e elas valem pra TODAS as listas de materiais dele (a mesclagem é sobre
 * o material em si, não sobre uma lista específica).
 */
export const materialMergeRulesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT id, sourceKey, targetKey, targetDescription, targetUnit, createdAt
       FROM material_merge_rules WHERE userId = ? ORDER BY createdAt DESC`,
      [ctx.user.id]
    );
  }),

  // Cria ou atualiza a regra pra este sourceKey (um material só mescla pra
  // UM destino por vez — sourceKey é único por usuário).
  create: protectedProcedure
    .input(z.object({
      sourceKey: z.string().min(1),
      targetKey: z.string().min(1),
      targetDescription: z.string().optional(),
      targetUnit: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceKey === input.targetKey) {
        throw new Error("Não é possível mesclar um material com ele mesmo.");
      }
      const existing = await rawQuery(
        `SELECT id FROM material_merge_rules WHERE userId = ? AND sourceKey = ?`,
        [ctx.user.id, input.sourceKey]
      );
      if (existing.length > 0) {
        await rawQuery(
          `UPDATE material_merge_rules SET targetKey = ?, targetDescription = ?, targetUnit = ? WHERE id = ?`,
          [input.targetKey, input.targetDescription || null, input.targetUnit || null, existing[0].id]
        );
      } else {
        await rawQuery(
          `INSERT INTO material_merge_rules (userId, sourceKey, targetKey, targetDescription, targetUnit) VALUES (?, ?, ?, ?, ?)`,
          [ctx.user.id, input.sourceKey, input.targetKey, input.targetDescription || null, input.targetUnit || null]
        );
      }
      return { success: true };
    }),

  // Desfaz uma mesclagem.
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await rawQuery(
        `DELETE FROM material_merge_rules WHERE id = ? AND userId = ?`,
        [input.id, ctx.user.id]
      );
      return { success: true };
    }),
});
