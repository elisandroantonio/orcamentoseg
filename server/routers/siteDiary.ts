import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, clientProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";
import { saveDiaryPhoto, deleteDiaryPhoto } from "../_core/diaryStorage";

const WEATHER_OPTIONS = ["bom", "chuva", "nublado", "impraticavel"] as const;

const laborEntrySchema = z.object({
  role: z.string().trim().min(1).max(100),
  count: z.number().int().min(0).max(999),
});

const createEntrySchema = z.object({
  projectId: z.number().int(),
  entryDate: z.string(), // "YYYY-MM-DD"
  weatherMorning: z.enum(WEATHER_OPTIONS).nullable().optional(),
  weatherAfternoon: z.enum(WEATHER_OPTIONS).nullable().optional(),
  equipmentUsed: z.string().trim().max(2000).nullable().optional(),
  budgetStageId: z.number().int().nullable().optional(),
  activities: z.string().trim().min(1).max(5000),
  occurrences: z.string().trim().max(5000).nullable().optional(),
  labor: z.array(laborEntrySchema).max(30).default([]),
  photos: z.array(z.string()).max(20).default([]), // data URLs
});

/** Garante que o projeto pertence ao usuário logado antes de ler/gravar nele. */
async function assertProjectOwner(projectId: number, userId: number) {
  const rows = await rawQuery(`SELECT id FROM projects WHERE id = ? AND userId = ? LIMIT 1`, [projectId, userId]);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
}

async function assertEntryOwner(entryId: number, userId: number) {
  const rows = await rawQuery(
    `SELECT sde.id FROM site_diary_entries sde
     JOIN projects p ON p.id = sde.projectId
     WHERE sde.id = ? AND p.userId = ? LIMIT 1`,
    [entryId, userId]
  );
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entrada não encontrada" });
}

async function loadEntriesWithDetails(entryIds: number[]) {
  if (!entryIds.length) return [];
  const entries = await rawQuery(
    `SELECT sde.*, u.name as userName, bs.name as stageName
     FROM site_diary_entries sde
     LEFT JOIN users u ON u.id = sde.userId
     LEFT JOIN budget_stages bs ON bs.id = sde.budgetStageId
     WHERE sde.id IN (${entryIds.map(() => "?").join(",")})
     ORDER BY sde.entryDate DESC, sde.createdAt DESC`,
    entryIds
  );
  const labor = await rawQuery(
    `SELECT * FROM site_diary_labor_entries WHERE diaryEntryId IN (${entryIds.map(() => "?").join(",")})`,
    entryIds
  );
  const photos = await rawQuery(
    `SELECT * FROM site_diary_photos WHERE diaryEntryId IN (${entryIds.map(() => "?").join(",")}) ORDER BY createdAt ASC`,
    entryIds
  );

  return entries.map((entry: any) => ({
    ...entry,
    labor: labor.filter((l: any) => l.diaryEntryId === entry.id),
    photos: photos
      .filter((p: any) => p.diaryEntryId === entry.id)
      .map((p: any) => ({ ...p, url: `/api/site-diary/photos/${p.fileName}` })),
  }));
}

export const siteDiaryRouter = router({
  // Lista as etapas disponíveis (de todos os orçamentos do projeto) pro seletor opcional.
  listStagesForProject: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertProjectOwner(input.projectId, ctx.user.id);
      return rawQuery(
        `SELECT bs.id, bs.name, b.title as budgetTitle
         FROM budget_stages bs
         JOIN budgets b ON b.id = bs.budgetId
         WHERE b.projectId = ?
         ORDER BY b.title, bs.\`order\``,
        [input.projectId]
      );
    }),

  list: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertProjectOwner(input.projectId, ctx.user.id);
      const ids = await rawQuery(
        `SELECT id FROM site_diary_entries WHERE projectId = ? ORDER BY entryDate DESC, createdAt DESC`,
        [input.projectId]
      );
      return loadEntriesWithDetails(ids.map((r: any) => r.id));
    }),

  create: protectedProcedure
    .input(createEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await assertProjectOwner(input.projectId, ctx.user.id);

      if (input.budgetStageId) {
        const stageRows = await rawQuery(
          `SELECT bs.id FROM budget_stages bs JOIN budgets b ON b.id = bs.budgetId WHERE bs.id = ? AND b.projectId = ? LIMIT 1`,
          [input.budgetStageId, input.projectId]
        );
        if (!stageRows.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inválida para este projeto" });
        }
      }

      const result: any = await rawQuery(
        `INSERT INTO site_diary_entries
          (projectId, userId, budgetStageId, entryDate, weatherMorning, weatherAfternoon, equipmentUsed, activities, occurrences)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.projectId,
          ctx.user.id,
          input.budgetStageId ?? null,
          input.entryDate,
          input.weatherMorning ?? null,
          input.weatherAfternoon ?? null,
          input.equipmentUsed ?? null,
          input.activities,
          input.occurrences ?? null,
        ]
      );
      const entryId = result.insertId;

      for (const l of input.labor) {
        if (l.count <= 0) continue;
        await rawQuery(`INSERT INTO site_diary_labor_entries (diaryEntryId, role, count) VALUES (?, ?, ?)`, [
          entryId,
          l.role,
          l.count,
        ]);
      }

      for (const photoDataUrl of input.photos) {
        try {
          const fileName = await saveDiaryPhoto(photoDataUrl);
          await rawQuery(`INSERT INTO site_diary_photos (diaryEntryId, fileName) VALUES (?, ?)`, [entryId, fileName]);
        } catch (error: any) {
          console.error("[SiteDiary] Falha ao salvar foto", error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Falha ao salvar foto" });
        }
      }

      const [entry] = await loadEntriesWithDetails([entryId]);
      return entry;
    }),

  addPhotos: protectedProcedure
    .input(z.object({ entryId: z.number().int(), photos: z.array(z.string()).min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      await assertEntryOwner(input.entryId, ctx.user.id);
      for (const photoDataUrl of input.photos) {
        const fileName = await saveDiaryPhoto(photoDataUrl);
        await rawQuery(`INSERT INTO site_diary_photos (diaryEntryId, fileName) VALUES (?, ?)`, [input.entryId, fileName]);
      }
      const [entry] = await loadEntriesWithDetails([input.entryId]);
      return entry;
    }),

  deletePhoto: protectedProcedure
    .input(z.object({ photoId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(
        `SELECT sdp.id, sdp.fileName, sde.id as entryId FROM site_diary_photos sdp
         JOIN site_diary_entries sde ON sde.id = sdp.diaryEntryId
         JOIN projects p ON p.id = sde.projectId
         WHERE sdp.id = ? AND p.userId = ? LIMIT 1`,
        [input.photoId, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Foto não encontrada" });
      await deleteDiaryPhoto(rows[0].fileName);
      await rawQuery(`DELETE FROM site_diary_photos WHERE id = ?`, [input.photoId]);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertEntryOwner(input.id, ctx.user.id);

      const photos = await rawQuery(`SELECT fileName FROM site_diary_photos WHERE diaryEntryId = ?`, [input.id]);
      for (const p of photos) {
        await deleteDiaryPhoto(p.fileName);
      }
      await rawQuery(`DELETE FROM site_diary_photos WHERE diaryEntryId = ?`, [input.id]);
      await rawQuery(`DELETE FROM site_diary_labor_entries WHERE diaryEntryId = ?`, [input.id]);
      await rawQuery(`DELETE FROM site_diary_entries WHERE id = ?`, [input.id]);

      return { success: true };
    }),
});

/** Verifica que o projeto pertence ao mesmo clientId do client_user logado. */
async function assertClientProjectAccess(projectId: number, clientId: number) {
  const rows = await rawQuery(`SELECT id FROM projects WHERE id = ? AND clientId = ? LIMIT 1`, [projectId, clientId]);
  if (!rows.length) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este projeto" });
}

export const clientPortalRouter = router({
  listProjects: clientProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT id, name, location, status, startDate, endDate FROM projects WHERE clientId = ? ORDER BY createdAt DESC`,
      [ctx.clientUser.clientId]
    );
  }),

  listEntries: clientProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientProjectAccess(input.projectId, ctx.clientUser.clientId);
      const ids = await rawQuery(
        `SELECT id FROM site_diary_entries WHERE projectId = ? ORDER BY entryDate DESC, createdAt DESC`,
        [input.projectId]
      );
      return loadEntriesWithDetails(ids.map((r: any) => r.id));
    }),

  me: clientProcedure.query(async ({ ctx }) => {
    return { email: ctx.clientUser.email, name: ctx.clientUser.name };
  }),
});
