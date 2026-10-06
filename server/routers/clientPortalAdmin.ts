import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";
import { hashPassword } from "../_core/clientAuth";

/** Nome de login: sem espaços, só letras/números e . _ - (normalizado em minúsculas). */
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Usuário deve ter ao menos 3 caracteres")
  .max(50)
  .regex(/^[a-z0-9._-]+$/, "Use só letras, números, ponto, hífen ou underline (sem espaços ou acentos)");

/** E-mail é opcional — só pra encaminhar o acesso. Aceita vazio. */
const optionalEmailSchema = z
  .union([z.string().trim().toLowerCase().email(), z.literal("")])
  .nullable()
  .optional();

/** Garante que o cliente pertence ao usuário logado. */
async function assertClientOwner(clientId: number, userId: number) {
  const rows = await rawQuery(`SELECT id FROM clients WHERE id = ? AND userId = ? LIMIT 1`, [clientId, userId]);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
}

/** Garante que o orçamento pertence ao usuário logado. */
async function assertBudgetOwner(budgetId: number, userId: number) {
  const rows = await rawQuery(`SELECT id FROM budgets WHERE id = ? AND userId = ? LIMIT 1`, [budgetId, userId]);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
}

/** O login é do usuário se estiver vinculado a ao menos uma obra dele. */
async function assertFieldUserOwner(fieldUserId: number, userId: number) {
  const rows = await rawQuery(
    `SELECT fub.id FROM site_diary_field_user_budgets fub
     JOIN budgets b ON b.id = fub.budgetId
     WHERE fub.fieldUserId = ? AND b.userId = ? LIMIT 1`,
    [fieldUserId, userId]
  );
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Login não encontrado" });
}

/**
 * Gestão dos logins de CAMPO (mestre/encarregado) — por orçamento (obra), só pra
 * alimentar o Diário de Obras daquele orçamento. Criados pela equipe interna.
 */
export const fieldLoginsAdminRouter = router({
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      return rawQuery(
        `SELECT fu.id, fu.username, fu.email, fu.name, fu.isActive, fu.lastSignedIn, fu.createdAt,
                (SELECT COUNT(*) FROM site_diary_field_user_budgets x WHERE x.fieldUserId = fu.id) as budgetCount
         FROM site_diary_field_users fu
         JOIN site_diary_field_user_budgets fub ON fub.fieldUserId = fu.id
         WHERE fub.budgetId = ? ORDER BY fu.createdAt DESC`,
        [input.budgetId]
      );
    }),

  // Logins do dono que ainda NÃO estão nesta obra (pra vincular um mestre existente).
  listAvailable: protectedProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      return rawQuery(
        `SELECT DISTINCT fu.id, fu.username, fu.name
         FROM site_diary_field_users fu
         JOIN site_diary_field_user_budgets fub ON fub.fieldUserId = fu.id
         JOIN budgets b ON b.id = fub.budgetId AND b.userId = ?
         WHERE fu.id NOT IN (SELECT fieldUserId FROM site_diary_field_user_budgets WHERE budgetId = ?)
         ORDER BY fu.name, fu.username`,
        [ctx.user.id, input.budgetId]
      );
    }),

  assign: protectedProcedure
    .input(z.object({ fieldUserId: z.number().int(), budgetId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      await assertFieldUserOwner(input.fieldUserId, ctx.user.id);
      await rawQuery(
        `INSERT IGNORE INTO site_diary_field_user_budgets (fieldUserId, budgetId) VALUES (?, ?)`,
        [input.fieldUserId, input.budgetId]
      );
      return { success: true };
    }),

  // Remove o vínculo com esta obra. Não deixa tirar a última (login ficaria órfão — desative em vez disso).
  unassign: protectedProcedure
    .input(z.object({ fieldUserId: z.number().int(), budgetId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      await assertFieldUserOwner(input.fieldUserId, ctx.user.id);
      const [{ n }] = await rawQuery(
        `SELECT COUNT(*) as n FROM site_diary_field_user_budgets WHERE fieldUserId = ?`,
        [input.fieldUserId]
      );
      if (Number(n) <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este login só tem esta obra. Para bloquear o acesso, desative o login.",
        });
      }
      await rawQuery(
        `DELETE FROM site_diary_field_user_budgets WHERE fieldUserId = ? AND budgetId = ?`,
        [input.fieldUserId, input.budgetId]
      );
      return { success: true };
    }),

  create: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int(),
        username: usernameSchema,
        email: optionalEmailSchema,
        password: z.string().min(6).max(100),
        name: z.string().trim().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);

      const existing = await rawQuery(
        `SELECT id FROM site_diary_field_users WHERE username = ? OR email = ? LIMIT 1`,
        [input.username, input.username]
      );
      if (existing.length) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um login de campo com este usuário" });
      }

      const passwordHash = await hashPassword(input.password);
      const result: any = await rawQuery(
        `INSERT INTO site_diary_field_users (budgetId, username, email, passwordHash, name) VALUES (?, ?, ?, ?, ?)`,
        [input.budgetId, input.username, input.email || null, passwordHash, input.name ?? null]
      );
      await rawQuery(
        `INSERT IGNORE INTO site_diary_field_user_budgets (fieldUserId, budgetId) VALUES (?, ?)`,
        [result.insertId, input.budgetId]
      );
      return { id: result.insertId };
    }),

  resetPassword: protectedProcedure
    .input(z.object({ fieldUserId: z.number().int(), password: z.string().min(6).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await assertFieldUserOwner(input.fieldUserId, ctx.user.id);
      const passwordHash = await hashPassword(input.password);
      await rawQuery(`UPDATE site_diary_field_users SET passwordHash = ? WHERE id = ?`, [passwordHash, input.fieldUserId]);
      return { success: true };
    }),

  setActive: protectedProcedure
    .input(z.object({ fieldUserId: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertFieldUserOwner(input.fieldUserId, ctx.user.id);
      await rawQuery(`UPDATE site_diary_field_users SET isActive = ? WHERE id = ?`, [input.isActive ? 1 : 0, input.fieldUserId]);
      return { success: true };
    }),
});

/**
 * Gestão de login do portal do cliente (Diário de Obras) — criada/gerida
 * pela equipe interna. O cliente nunca se autocadastra: você cria a conta
 * dele e passa a senha.
 */
export const clientPortalAdminRouter = router({
  // Logins do cliente vinculados a ESTA obra.
  listLogins: protectedProcedure
    .input(z.object({ clientId: z.number().int(), budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientOwner(input.clientId, ctx.user.id);
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      return rawQuery(
        `SELECT cu.id, cu.username, cu.email, cu.name, cu.isActive, cu.lastSignedIn, cu.createdAt
         FROM client_users cu
         JOIN site_diary_client_user_budgets cub ON cub.clientUserId = cu.id
         WHERE cu.clientId = ? AND cub.budgetId = ? ORDER BY cu.createdAt DESC`,
        [input.clientId, input.budgetId]
      );
    }),

  // Logins do cliente que ainda NÃO estão nesta obra (pra vincular um existente).
  listAvailable: protectedProcedure
    .input(z.object({ clientId: z.number().int(), budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientOwner(input.clientId, ctx.user.id);
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      return rawQuery(
        `SELECT id, username, name FROM client_users
         WHERE clientId = ? AND id NOT IN (SELECT clientUserId FROM site_diary_client_user_budgets WHERE budgetId = ?)
         ORDER BY name, username`,
        [input.clientId, input.budgetId]
      );
    }),

  assign: protectedProcedure
    .input(z.object({ clientUserId: z.number().int(), budgetId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      // O login precisa ser do mesmo cliente do orçamento (e do dono logado).
      const rows = await rawQuery(
        `SELECT cu.id FROM client_users cu
         JOIN clients c ON c.id = cu.clientId
         JOIN budgets b ON b.clientId = cu.clientId
         WHERE cu.id = ? AND b.id = ? AND c.userId = ? LIMIT 1`,
        [input.clientUserId, input.budgetId, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Login não encontrado para o cliente desta obra" });
      await rawQuery(
        `INSERT IGNORE INTO site_diary_client_user_budgets (clientUserId, budgetId) VALUES (?, ?)`,
        [input.clientUserId, input.budgetId]
      );
      return { success: true };
    }),

  unassign: protectedProcedure
    .input(z.object({ clientUserId: z.number().int(), budgetId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      await rawQuery(
        `DELETE FROM site_diary_client_user_budgets WHERE clientUserId = ? AND budgetId = ?`,
        [input.clientUserId, input.budgetId]
      );
      return { success: true };
    }),

  createLogin: protectedProcedure
    .input(
      z.object({
        clientId: z.number().int(),
        budgetId: z.number().int(),
        username: usernameSchema,
        email: optionalEmailSchema,
        password: z.string().min(6).max(100),
        name: z.string().trim().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertClientOwner(input.clientId, ctx.user.id);
      await assertBudgetOwner(input.budgetId, ctx.user.id);

      const existing = await rawQuery(
        `SELECT id FROM client_users WHERE username = ? OR email = ? LIMIT 1`,
        [input.username, input.username]
      );
      if (existing.length) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um login de cliente com este usuário" });
      }

      const passwordHash = await hashPassword(input.password);
      const result: any = await rawQuery(
        `INSERT INTO client_users (clientId, username, email, passwordHash, name) VALUES (?, ?, ?, ?, ?)`,
        [input.clientId, input.username, input.email || null, passwordHash, input.name ?? null]
      );
      await rawQuery(
        `INSERT IGNORE INTO site_diary_client_user_budgets (clientUserId, budgetId) VALUES (?, ?)`,
        [result.insertId, input.budgetId]
      );
      return { id: result.insertId };
    }),

  resetPassword: protectedProcedure
    .input(z.object({ clientUserId: z.number().int(), password: z.string().min(6).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(
        `SELECT cu.id FROM client_users cu JOIN clients c ON c.id = cu.clientId WHERE cu.id = ? AND c.userId = ? LIMIT 1`,
        [input.clientUserId, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Login não encontrado" });

      const passwordHash = await hashPassword(input.password);
      await rawQuery(`UPDATE client_users SET passwordHash = ? WHERE id = ?`, [passwordHash, input.clientUserId]);
      return { success: true };
    }),

  setActive: protectedProcedure
    .input(z.object({ clientUserId: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(
        `SELECT cu.id FROM client_users cu JOIN clients c ON c.id = cu.clientId WHERE cu.id = ? AND c.userId = ? LIMIT 1`,
        [input.clientUserId, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Login não encontrado" });

      await rawQuery(`UPDATE client_users SET isActive = ? WHERE id = ?`, [input.isActive ? 1 : 0, input.clientUserId]);
      return { success: true };
    }),
});
