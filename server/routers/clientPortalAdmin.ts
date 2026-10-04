import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";
import { hashPassword } from "../_core/clientAuth";

/** Garante que o cliente pertence ao usuário logado. */
async function assertClientOwner(clientId: number, userId: number) {
  const rows = await rawQuery(`SELECT id FROM clients WHERE id = ? AND userId = ? LIMIT 1`, [clientId, userId]);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
}

/** Garante que o projeto pertence ao usuário logado. */
async function assertProjectOwner(projectId: number, userId: number) {
  const rows = await rawQuery(`SELECT id FROM projects WHERE id = ? AND userId = ? LIMIT 1`, [projectId, userId]);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
}

async function assertFieldUserOwner(fieldUserId: number, userId: number) {
  const rows = await rawQuery(
    `SELECT fu.id FROM site_diary_field_users fu JOIN projects p ON p.id = fu.projectId WHERE fu.id = ? AND p.userId = ? LIMIT 1`,
    [fieldUserId, userId]
  );
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Login não encontrado" });
}

/**
 * Gestão dos logins de CAMPO (mestre/encarregado) — um por obra, só pra
 * alimentar o Diário de Obras daquela obra. Criados pela equipe interna.
 */
export const fieldLoginsAdminRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertProjectOwner(input.projectId, ctx.user.id);
      return rawQuery(
        `SELECT id, email, name, isActive, lastSignedIn, createdAt FROM site_diary_field_users WHERE projectId = ? ORDER BY createdAt DESC`,
        [input.projectId]
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        email: z.string().trim().email(),
        password: z.string().min(6).max(100),
        name: z.string().trim().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectOwner(input.projectId, ctx.user.id);

      const email = input.email.toLowerCase();
      const existing = await rawQuery(`SELECT id FROM site_diary_field_users WHERE email = ? LIMIT 1`, [email]);
      if (existing.length) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um login de campo com este e-mail" });
      }

      const passwordHash = await hashPassword(input.password);
      const result: any = await rawQuery(
        `INSERT INTO site_diary_field_users (projectId, email, passwordHash, name) VALUES (?, ?, ?, ?)`,
        [input.projectId, email, passwordHash, input.name ?? null]
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
  listLogins: protectedProcedure
    .input(z.object({ clientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientOwner(input.clientId, ctx.user.id);
      return rawQuery(
        `SELECT id, email, name, isActive, lastSignedIn, createdAt FROM client_users WHERE clientId = ? ORDER BY createdAt DESC`,
        [input.clientId]
      );
    }),

  createLogin: protectedProcedure
    .input(
      z.object({
        clientId: z.number().int(),
        email: z.string().trim().email(),
        password: z.string().min(6).max(100),
        name: z.string().trim().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertClientOwner(input.clientId, ctx.user.id);

      const email = input.email.toLowerCase();
      const existing = await rawQuery(`SELECT id FROM client_users WHERE email = ? LIMIT 1`, [email]);
      if (existing.length) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um login com este e-mail" });
      }

      const passwordHash = await hashPassword(input.password);
      const result: any = await rawQuery(
        `INSERT INTO client_users (clientId, email, passwordHash, name) VALUES (?, ?, ?, ?)`,
        [input.clientId, email, passwordHash, input.name ?? null]
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
