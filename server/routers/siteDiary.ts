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

/** O login de campo está vinculado a esta obra? (tabela N:N site_diary_field_user_budgets) */
export async function fieldUserHasBudget(fieldUserId: number, budgetId: number | null | undefined): Promise<boolean> {
  if (!budgetId) return false;
  const rows = await rawQuery(
    `SELECT id FROM site_diary_field_user_budgets WHERE fieldUserId = ? AND budgetId = ? LIMIT 1`,
    [fieldUserId, budgetId]
  );
  return rows.length > 0;
}

/** Vínculo com a obra + obra em execução. Chamado em TODA ação do login de campo. */
async function assertFieldBudgetAccess(fieldUserId: number, budgetId: number) {
  if (!(await fieldUserHasBudget(fieldUserId, budgetId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
  }
  await assertBudgetInExecution(budgetId);
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
    `SELECT sde.*, DATE_FORMAT(sde.entryDate, '%Y-%m-%d') as entryDate, COALESCE(NULLIF(fu.name, ''), fu.username, fu.email, u.name) as userName, bs.name as stageName
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

const updateEntrySchema = createEntrySchema.omit({ budgetId: true }).extend({
  entryId: z.number().int(),
  removePhotoIds: z.array(z.number().int()).max(50).default([]),
});

/**
 * Edita uma entrada existente: campos, efetivo (substitui tudo), remove fotos
 * marcadas e adiciona as novas (input.photos). Quem chama já checou a permissão
 * sobre a entrada (e devolve o budgetId dela).
 */
async function updateEntryCore(budgetId: number, input: z.infer<typeof updateEntrySchema>) {
  if (input.budgetStageId) {
    const stageRows = await rawQuery(
      `SELECT id FROM budget_stages WHERE id = ? AND budgetId = ? LIMIT 1`,
      [input.budgetStageId, budgetId]
    );
    if (!stageRows.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inválida para este orçamento" });
    }
  }

  await rawQuery(
    `UPDATE site_diary_entries SET budgetStageId = ?, entryDate = ?, weatherMorning = ?, weatherAfternoon = ?,
       equipmentUsed = ?, activities = ?, occurrences = ? WHERE id = ?`,
    [
      input.budgetStageId ?? null,
      input.entryDate,
      input.weatherMorning ?? null,
      input.weatherAfternoon ?? null,
      input.equipmentUsed ?? null,
      input.activities,
      input.occurrences ?? null,
      input.entryId,
    ]
  );

  await rawQuery(`DELETE FROM site_diary_labor_entries WHERE diaryEntryId = ?`, [input.entryId]);
  for (const l of input.labor) {
    if (l.count <= 0) continue;
    await rawQuery(`INSERT INTO site_diary_labor_entries (diaryEntryId, role, count) VALUES (?, ?, ?)`, [
      input.entryId,
      l.role,
      l.count,
    ]);
  }

  // Só remove fotos que realmente são desta entrada.
  for (const photoId of input.removePhotoIds) {
    const rows = await rawQuery(`SELECT fileName FROM site_diary_photos WHERE id = ? AND diaryEntryId = ? LIMIT 1`, [
      photoId,
      input.entryId,
    ]);
    if (!rows.length) continue;
    await deleteDiaryPhoto(rows[0].fileName);
    await rawQuery(`DELETE FROM site_diary_photos WHERE id = ?`, [photoId]);
  }

  for (const photoDataUrl of input.photos) {
    try {
      const fileName = await saveDiaryPhoto(photoDataUrl);
      await rawQuery(`INSERT INTO site_diary_photos (diaryEntryId, fileName) VALUES (?, ?)`, [input.entryId, fileName]);
    } catch (error: any) {
      console.error("[SiteDiary] Falha ao salvar foto", error);
      throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Falha ao salvar foto" });
    }
  }

  const [entry] = await loadEntriesWithDetails([input.entryId]);
  return entry;
}

export const siteDiaryRouter = router({
  update: protectedProcedure
    .input(updateEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await assertEntryOwner(input.entryId, ctx.user.id);
      const rows = await rawQuery(`SELECT budgetId FROM site_diary_entries WHERE id = ? LIMIT 1`, [input.entryId]);
      const budgetId = rows[0].budgetId as number;
      await assertBudgetInExecution(budgetId);
      return updateEntryCore(budgetId, input);
    }),

  // Hub do dono: todas as obras em execução (alimenta a página /diarios).
  listExecutingBudgets: protectedProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT b.id, b.title, p.name as projectName, p.location, c.name as clientName,
              (SELECT COUNT(*) FROM site_diary_entries e WHERE e.budgetId = b.id) as entryCount,
              (SELECT DATE_FORMAT(MAX(e.entryDate), '%Y-%m-%d') FROM site_diary_entries e WHERE e.budgetId = b.id) as lastEntryDate
       FROM budgets b
       LEFT JOIN projects p ON p.id = b.projectId
       LEFT JOIN clients c ON c.id = b.clientId
       WHERE b.userId = ? AND b.workStatus = 'execucao'
       ORDER BY b.title ASC`,
      [ctx.user.id]
    );
  }),

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
 * Login de campo: um login pode ter VÁRIAS obras (site_diary_field_user_budgets).
 * O budgetId vem do input (a obra escolhida no seletor), mas TODA chamada
 * revalida no servidor que o login está vinculado a essa obra e que ela está
 * em execução — o mestre não consegue lançar em obra que não é dele mesmo
 * adulterando a requisição. Só lê e cria; não edita nem exclui.
 */
export const fieldDiaryRouter = router({
  me: fieldProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.fieldUser.id,
      username: ctx.fieldUser.username,
      email: ctx.fieldUser.email,
      name: ctx.fieldUser.name,
    };
  }),

  // Obras do login que estão em execução (alimenta o seletor de obra).
  listBudgets: fieldProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT b.id, b.title, b.startDate, b.endDate, p.name as projectName, p.location
       FROM site_diary_field_user_budgets fub
       JOIN budgets b ON b.id = fub.budgetId
       LEFT JOIN projects p ON p.id = b.projectId
       WHERE fub.fieldUserId = ? AND b.workStatus = 'execucao'
       ORDER BY b.title ASC`,
      [ctx.fieldUser.id]
    );
  }),

  listStages: fieldProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertFieldBudgetAccess(ctx.fieldUser.id, input.budgetId);
      return listStagesForBudget(input.budgetId);
    }),

  list: fieldProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertFieldBudgetAccess(ctx.fieldUser.id, input.budgetId);
      return loadEntriesWithDetails(await listEntryIdsForBudget(input.budgetId));
    }),

  // O mestre só edita o que ELE mesmo lançou, em obra vinculada e em execução.
  update: fieldProcedure
    .input(updateEntrySchema.extend({ budgetId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertFieldBudgetAccess(ctx.fieldUser.id, input.budgetId);
      const rows = await rawQuery(
        `SELECT id FROM site_diary_entries WHERE id = ? AND budgetId = ? AND fieldUserId = ? LIMIT 1`,
        [input.entryId, input.budgetId, ctx.fieldUser.id]
      );
      if (!rows.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode editar registros que você mesmo lançou" });
      }
      return updateEntryCore(input.budgetId, input);
    }),

  create: fieldProcedure
    .input(createEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await assertFieldBudgetAccess(ctx.fieldUser.id, input.budgetId);
      const rows = await rawQuery(`SELECT userId FROM budgets WHERE id = ? LIMIT 1`, [input.budgetId]);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
      return createEntryCore(input, { authorUserId: rows[0].userId, fieldUserId: ctx.fieldUser.id });
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
    return { username: ctx.clientUser.username, email: ctx.clientUser.email, name: ctx.clientUser.name };
  }),
});
