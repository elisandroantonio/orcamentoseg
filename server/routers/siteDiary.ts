import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, clientProcedure, fieldProcedure, router } from "../_core/trpc";
import { rawQuery } from "../db";
import { saveDiaryPhoto, deleteDiaryPhoto } from "../_core/diaryStorage";

const WEATHER_OPTIONS = ["bom", "chuva", "nublado", "impraticavel"] as const;

const laborEntrySchema = z.object({
  role: z.string().trim().min(1).max(100),
  count: z.number().int().min(0).max(999),
});

const createEntrySchema = z.object({
  budgetId: z.number().int(),
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

/**
 * O Diário de Obras é POR ORÇAMENTO e só vale para orçamentos EM EXECUÇÃO
 * (workStatus = 'execucao'). Regra única, reaproveitada pela equipe, pelo
 * login de campo, pelo portal do cliente e pela rota de fotos
 * (ver diaryPhotoRoute.ts).
 */
export const DIARY_NOT_IN_EXECUTION_MSG = "O Diário de Obras só está disponível para obras em execução.";

export async function isBudgetInExecution(budgetId: number | null | undefined): Promise<boolean> {
  if (!budgetId) return false;
  const rows = await rawQuery(`SELECT id FROM budgets WHERE id = ? AND workStatus = 'execucao' LIMIT 1`, [budgetId]);
  return rows.length > 0;
}

async function assertBudgetInExecution(budgetId: number | null | undefined) {
  if (!(await isBudgetInExecution(budgetId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: DIARY_NOT_IN_EXECUTION_MSG });
  }
}

/** Garante que o orçamento pertence ao usuário logado antes de ler/gravar nele. */
async function assertBudgetOwner(budgetId: number, userId: number) {
  const rows = await rawQuery(`SELECT id FROM budgets WHERE id = ? AND userId = ? LIMIT 1`, [budgetId, userId]);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
}

async function assertEntryOwner(entryId: number, userId: number) {
  const rows = await rawQuery(
    `SELECT sde.id FROM site_diary_entries sde
     JOIN budgets b ON b.id = sde.budgetId
     WHERE sde.id = ? AND b.userId = ? LIMIT 1`,
    [entryId, userId]
  );
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entrada não encontrada" });
}

async function loadEntriesWithDetails(entryIds: number[]) {
  if (!entryIds.length) return [];
  const entries = await rawQuery(
    `SELECT sde.*, COALESCE(NULLIF(fu.name, ''), fu.email, u.name) as userName, bs.name as stageName
     FROM site_diary_entries sde
     LEFT JOIN users u ON u.id = sde.userId
     LEFT JOIN site_diary_field_users fu ON fu.id = sde.fieldUserId
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

async function listEntryIdsForBudget(budgetId: number): Promise<number[]> {
  const ids = await rawQuery(
    `SELECT id FROM site_diary_entries WHERE budgetId = ? ORDER BY entryDate DESC, createdAt DESC`,
    [budgetId]
  );
  return ids.map((r: any) => r.id);
}

async function listStagesForBudget(budgetId: number) {
  return rawQuery(
    `SELECT bs.id, bs.name, b.title as budgetTitle
     FROM budget_stages bs
     JOIN budgets b ON b.id = bs.budgetId
     WHERE bs.budgetId = ?
     ORDER BY bs.\`order\``,
    [budgetId]
  );
}

/**
 * Cria a entrada + efetivo + fotos. Usado tanto pela equipe interna quanto
 * pelo login de campo (quem chama é responsável por checar a permissão no
 * orçamento ANTES de chamar). Pra login de campo, authorUserId é o dono do
 * orçamento (coluna userId é NOT NULL) e fieldUserId identifica quem lançou.
 */
async function createEntryCore(
  input: z.infer<typeof createEntrySchema>,
  author: { authorUserId: number; fieldUserId: number | null }
) {
  if (input.budgetStageId) {
    const stageRows = await rawQuery(
      `SELECT id FROM budget_stages WHERE id = ? AND budgetId = ? LIMIT 1`,
      [input.budgetStageId, input.budgetId]
    );
    if (!stageRows.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inválida para este orçamento" });
    }
  }

  const result: any = await rawQuery(
    `INSERT INTO site_diary_entries
      (budgetId, userId, fieldUserId, budgetStageId, entryDate, weatherMorning, weatherAfternoon, equipmentUsed, activities, occurrences)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.budgetId,
      author.authorUserId,
      author.fieldUserId,
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
}

export const siteDiaryRouter = router({
  // Dados do orçamento pra tela do diário + se está liberado (em execução).
  status: protectedProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      const rows = await rawQuery(
        `SELECT b.title, b.clientId, b.workStatus, c.name as clientName, p.name as projectName
         FROM budgets b
         LEFT JOIN clients c ON c.id = b.clientId
         LEFT JOIN projects p ON p.id = b.projectId
         WHERE b.id = ? LIMIT 1`,
        [input.budgetId]
      );
      const b = rows[0];
      return {
        inExecution: b?.workStatus === "execucao",
        title: b?.title ?? null,
        clientId: b?.clientId ?? null,
        clientName: b?.clientName ?? null,
        projectName: b?.projectName ?? null,
      };
    }),

  // Etapas do cronograma do orçamento, pro seletor opcional.
  listStages: protectedProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      await assertBudgetInExecution(input.budgetId);
      return listStagesForBudget(input.budgetId);
    }),

  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      await assertBudgetInExecution(input.budgetId);
      return loadEntriesWithDetails(await listEntryIdsForBudget(input.budgetId));
    }),

  create: protectedProcedure
    .input(createEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      await assertBudgetInExecution(input.budgetId);
      return createEntryCore(input, { authorUserId: ctx.user.id, fieldUserId: null });
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
         JOIN budgets b ON b.id = sde.budgetId
         WHERE sdp.id = ? AND b.userId = ? LIMIT 1`,
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

/**
 * Login de campo: o budgetId vem SEMPRE da sessão (ctx.fieldUser.budgetId),
 * nunca do input — assim o mestre da obra A não consegue lançar na obra B
 * mesmo adulterando a requisição. Só lê e cria; não edita nem exclui.
 */
export const fieldDiaryRouter = router({
  me: fieldProcedure.query(async ({ ctx }) => {
    const budgetId = ctx.fieldUser.budgetId;
    const rows = budgetId ? await rawQuery(`SELECT title FROM budgets WHERE id = ? LIMIT 1`, [budgetId]) : [];
    return {
      email: ctx.fieldUser.email,
      name: ctx.fieldUser.name,
      budgetId,
      budgetTitle: rows[0]?.title ?? null,
      inExecution: await isBudgetInExecution(budgetId),
    };
  }),

  listStages: fieldProcedure.query(async ({ ctx }) => {
    const budgetId = ctx.fieldUser.budgetId;
    await assertBudgetInExecution(budgetId);
    return listStagesForBudget(budgetId!);
  }),

  list: fieldProcedure.query(async ({ ctx }) => {
    const budgetId = ctx.fieldUser.budgetId;
    await assertBudgetInExecution(budgetId);
    return loadEntriesWithDetails(await listEntryIdsForBudget(budgetId!));
  }),

  create: fieldProcedure
    .input(createEntrySchema.omit({ budgetId: true }))
    .mutation(async ({ ctx, input }) => {
      const budgetId = ctx.fieldUser.budgetId;
      await assertBudgetInExecution(budgetId);
      const rows = await rawQuery(`SELECT userId FROM budgets WHERE id = ? LIMIT 1`, [budgetId]);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
      return createEntryCore(
        { ...input, budgetId: budgetId! },
        { authorUserId: rows[0].userId, fieldUserId: ctx.fieldUser.id }
      );
    }),
});

/** Verifica que o orçamento é do mesmo cliente (clientId) do client_user logado. */
async function assertClientBudgetAccess(budgetId: number, clientId: number) {
  const rows = await rawQuery(`SELECT id FROM budgets WHERE id = ? AND clientId = ? LIMIT 1`, [budgetId, clientId]);
  if (!rows.length) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
}

export const clientPortalRouter = router({
  // Só obras (orçamentos) do cliente que estão em execução.
  listBudgets: clientProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT b.id, b.title, b.startDate, b.endDate, p.name as projectName, p.location
       FROM budgets b
       LEFT JOIN projects p ON p.id = b.projectId
       WHERE b.clientId = ? AND b.workStatus = 'execucao'
       ORDER BY b.createdAt DESC`,
      [ctx.clientUser.clientId]
    );
  }),

  listEntries: clientProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientBudgetAccess(input.budgetId, ctx.clientUser.clientId);
      await assertBudgetInExecution(input.budgetId);
      return loadEntriesWithDetails(await listEntryIdsForBudget(input.budgetId));
    }),

  me: clientProcedure.query(async ({ ctx }) => {
    return { email: ctx.clientUser.email, name: ctx.clientUser.name };
  }),
});
