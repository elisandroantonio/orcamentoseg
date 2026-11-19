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

const workerDaySchema = z.object({
  workerId: z.number().int(),
  fraction: z.number().refine((v) => v === 0.5 || v === 1, "Use 0,5 (meio dia) ou 1 (dia inteiro)"),
});

const createEntrySchema = z.object({
  budgetId: z.number().int(),
  entryDate: z.string(), // "YYYY-MM-DD"
  weatherMorning: z.enum(WEATHER_OPTIONS).nullable().optional(),
  weatherAfternoon: z.enum(WEATHER_OPTIONS).nullable().optional(),
  equipmentUsed: z.string().trim().max(2000).nullable().optional(),
  budgetStageIds: z.array(z.number().int()).max(15).default([]),
  activities: z.string().trim().min(1).max(5000),
  occurrences: z.string().trim().max(5000).nullable().optional(),
  labor: z.array(laborEntrySchema).max(30).default([]),
  workerDays: z.array(workerDaySchema).max(80).default([]),
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
    `SELECT sde.*, DATE_FORMAT(sde.entryDate, '%Y-%m-%d') as entryDate, COALESCE(NULLIF(fu.name, ''), fu.username, fu.email, u.name) as userName
     FROM site_diary_entries sde
     LEFT JOIN users u ON u.id = sde.userId
     LEFT JOIN site_diary_field_users fu ON fu.id = sde.fieldUserId
     WHERE sde.id IN (${entryIds.map(() => "?").join(",")})
     ORDER BY sde.entryDate DESC, sde.createdAt DESC`,
    entryIds
  );
  const labor = await rawQuery(
    `SELECT * FROM site_diary_labor_entries WHERE diaryEntryId IN (${entryIds.map(() => "?").join(",")})`,
    entryIds
  );
  const workerDayRows = await rawQuery(
    `SELECT d.diaryEntryId, d.workerId, d.dayFraction, w.name as workerName, w.role as workerRole
     FROM site_diary_worker_days d
     JOIN site_workers w ON w.id = d.workerId
     WHERE d.diaryEntryId IN (${entryIds.map(() => "?").join(",")})
     ORDER BY w.name ASC`,
    entryIds
  );
  const stageRows = await rawQuery(
    `SELECT ses.diaryEntryId, bs.id, bs.name
     FROM site_diary_entry_stages ses
     JOIN budget_stages bs ON bs.id = ses.budgetStageId
     WHERE ses.diaryEntryId IN (${entryIds.map(() => "?").join(",")})
     ORDER BY ses.id ASC`,
    entryIds
  );
  const photos = await rawQuery(
    `SELECT * FROM site_diary_photos WHERE diaryEntryId IN (${entryIds.map(() => "?").join(",")}) ORDER BY createdAt ASC`,
    entryIds
  );

  return entries.map((entry: any) => {
    const stages = stageRows
      .filter((r: any) => r.diaryEntryId === entry.id)
      .map((r: any) => ({ id: r.id, name: r.name }));
    return {
    ...entry,
    stages,
    // Compatibilidade (cards/PDF antigos): nomes juntos por vírgula.
    stageName: stages.length ? stages.map((x: any) => x.name).join(", ") : null,
    labor: labor.filter((l: any) => l.diaryEntryId === entry.id),
    workerDays: workerDayRows
      .filter((r: any) => r.diaryEntryId === entry.id)
      .map((r: any) => ({
        workerId: r.workerId,
        workerName: r.workerName,
        workerRole: r.workerRole,
        fraction: Number(r.dayFraction),
      })),
    photos: photos
      .filter((p: any) => p.diaryEntryId === entry.id)
      .map((p: any) => ({ ...p, url: `/api/site-diary/photos/${p.fileName}` })),
    };
  });
}

/** Valida que todas as etapas pertencem ao orçamento e grava o vínculo N:N da entrada. */
async function saveEntryStages(entryId: number, budgetId: number, stageIds: number[]) {
  const ids = Array.from(new Set(stageIds));
  if (ids.length) {
    const rows = await rawQuery(
      `SELECT id FROM budget_stages WHERE budgetId = ? AND id IN (${ids.map(() => "?").join(",")})`,
      [budgetId, ...ids]
    );
    if (rows.length !== ids.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inválida para este orçamento" });
    }
  }
  await rawQuery(`DELETE FROM site_diary_entry_stages WHERE diaryEntryId = ?`, [entryId]);
  for (const id of ids) {
    await rawQuery(`INSERT INTO site_diary_entry_stages (diaryEntryId, budgetStageId) VALUES (?, ?)`, [entryId, id]);
  }
  // Coluna antiga mantida com a primeira etapa (compatibilidade).
  await rawQuery(`UPDATE site_diary_entries SET budgetStageId = ? WHERE id = ?`, [ids[0] ?? null, entryId]);
}

/** Grava os funcionários presentes na entrada (dia inteiro = 1, meio dia = 0,5). Só aceita funcionários do dono da obra. */
async function saveWorkerDays(entryId: number, budgetId: number, workerDays: { workerId: number; fraction: number }[]) {
  const byWorker = new Map<number, number>();
  for (const w of workerDays) byWorker.set(w.workerId, w.fraction);
  const ids = Array.from(byWorker.keys());
  if (ids.length) {
    const rows = await rawQuery(
      `SELECT w.id FROM site_workers w
       JOIN budgets b ON b.userId = w.userId
       WHERE b.id = ? AND w.id IN (${ids.map(() => "?").join(",")})`,
      [budgetId, ...ids]
    );
    if (rows.length !== ids.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário inválido para esta obra" });
    }
  }
  await rawQuery(`DELETE FROM site_diary_worker_days WHERE diaryEntryId = ?`, [entryId]);
  for (const [workerId, fraction] of Array.from(byWorker.entries())) {
    await rawQuery(`INSERT INTO site_diary_worker_days (diaryEntryId, workerId, dayFraction) VALUES (?, ?, ?)`, [
      entryId,
      workerId,
      fraction,
    ]);
  }
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
    `SELECT bs.id, bs.name, bs.parentStageId, b.title as budgetTitle
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
  // Valida as etapas ANTES de gravar a entrada (não deixa entrada pela metade).
  if (input.budgetStageIds.length) {
    const ids = Array.from(new Set(input.budgetStageIds));
    const rows = await rawQuery(
      `SELECT id FROM budget_stages WHERE budgetId = ? AND id IN (${ids.map(() => "?").join(",")})`,
      [input.budgetId, ...ids]
    );
    if (rows.length !== ids.length) {
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
      null,
      input.entryDate,
      input.weatherMorning ?? null,
      input.weatherAfternoon ?? null,
      input.equipmentUsed ?? null,
      input.activities,
      input.occurrences ?? null,
    ]
  );
  const entryId = result.insertId;
  await saveEntryStages(entryId, input.budgetId, input.budgetStageIds);

  for (const l of input.labor) {
    if (l.count <= 0) continue;
    await rawQuery(`INSERT INTO site_diary_labor_entries (diaryEntryId, role, count) VALUES (?, ?, ?)`, [
      entryId,
      l.role,
      l.count,
    ]);
  }

  await saveWorkerDays(entryId, input.budgetId, input.workerDays);

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
  await saveEntryStages(input.entryId, budgetId, input.budgetStageIds);

  await rawQuery(
    `UPDATE site_diary_entries SET entryDate = ?, weatherMorning = ?, weatherAfternoon = ?,
       equipmentUsed = ?, activities = ?, occurrences = ? WHERE id = ?`,
    [
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

  await saveWorkerDays(input.entryId, budgetId, input.workerDays);

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
  // ---- Funcionários (cadastro único da empresa) ----
  listWorkers: protectedProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT id, name, role, dailyRate, active FROM site_workers WHERE userId = ? ORDER BY active DESC, name ASC`,
      [ctx.user.id]
    );
  }),

  createWorker: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(150),
      role: z.string().trim().max(100).nullable().optional(),
      dailyRate: z.number().min(0).max(100000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result: any = await rawQuery(
        `INSERT INTO site_workers (userId, name, role, dailyRate) VALUES (?, ?, ?, ?)`,
        [ctx.user.id, input.name, input.role || null, input.dailyRate ?? null]
      );
      return { id: result.insertId as number, name: input.name, role: input.role || null, dailyRate: input.dailyRate ?? null, active: 1 };
    }),

  updateWorker: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().trim().min(1).max(150),
      role: z.string().trim().max(100).nullable().optional(),
      dailyRate: z.number().min(0).max(100000).nullable().optional(),
      active: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(`SELECT id FROM site_workers WHERE id = ? AND userId = ? LIMIT 1`, [input.id, ctx.user.id]);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
      await rawQuery(
        `UPDATE site_workers SET name = ?, role = ?, dailyRate = ?, active = ? WHERE id = ?`,
        [input.name, input.role || null, input.dailyRate ?? null, input.active ? 1 : 0, input.id]
      );
      return { success: true };
    }),

  // Relatório de dias trabalhados. Se o mesmo funcionário aparece em mais de uma
  // entrada no mesmo dia e na mesma obra, conta uma vez só (vale o maior valor).
  workedDaysReport: protectedProcedure
    .input(z.object({
      budgetId: z.number().int().nullable().optional(),
      workerId: z.number().int().nullable().optional(),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where: string[] = ["b.userId = ?"];
      const params: any[] = [ctx.user.id];
      if (input.budgetId) { where.push("b.id = ?"); params.push(input.budgetId); }
      if (input.workerId) { where.push("w.id = ?"); params.push(input.workerId); }
      if (input.dateFrom) { where.push("e.entryDate >= ?"); params.push(input.dateFrom); }
      if (input.dateTo) { where.push("e.entryDate <= ?"); params.push(input.dateTo); }
      const rows = await rawQuery(
        `SELECT DATE_FORMAT(e.entryDate, '%Y-%m-%d') as entryDate, b.id as budgetId, b.title as budgetTitle,
                w.id as workerId, w.name as workerName, w.role as workerRole, w.dailyRate, d.dayFraction
         FROM site_diary_worker_days d
         JOIN site_diary_entries e ON e.id = d.diaryEntryId
         JOIN budgets b ON b.id = e.budgetId
         JOIN site_workers w ON w.id = d.workerId
         WHERE ${where.join(" AND ")}
         ORDER BY w.name ASC, e.entryDate ASC`,
        params
      );
      const merged = new Map<string, any>();
      for (const r of rows as any[]) {
        const key = `${r.workerId}|${r.budgetId}|${r.entryDate}`;
        const fraction = Number(r.dayFraction);
        const prev = merged.get(key);
        if (!prev || fraction > prev.fraction) {
          merged.set(key, {
            entryDate: r.entryDate,
            budgetId: r.budgetId,
            budgetTitle: r.budgetTitle,
            workerId: r.workerId,
            workerName: r.workerName,
            workerRole: r.workerRole,
            dailyRate: r.dailyRate == null ? null : Number(r.dailyRate),
            fraction,
          });
        }
      }
      return Array.from(merged.values());
    }),

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
      await rawQuery(`DELETE FROM site_diary_worker_days WHERE diaryEntryId = ?`, [input.id]);
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

  // Funcionários ativos do dono da obra (o mestre só marca quem esteve presente).
  listWorkers: fieldProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertFieldBudgetAccess(ctx.fieldUser.id, input.budgetId);
      return rawQuery(
        `SELECT w.id, w.name, w.role FROM site_workers w
         JOIN budgets b ON b.userId = w.userId
         WHERE b.id = ? AND w.active = 1 ORDER BY w.name ASC`,
        [input.budgetId]
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

/** O login de cliente está vinculado a esta obra (e ela é do mesmo cliente)? */
export async function clientUserHasBudget(clientUserId: number, clientId: number, budgetId: number | null | undefined) {
  if (!budgetId) return false;
  const rows = await rawQuery(
    `SELECT cub.id FROM site_diary_client_user_budgets cub
     JOIN budgets b ON b.id = cub.budgetId
     WHERE cub.clientUserId = ? AND cub.budgetId = ? AND b.clientId = ? LIMIT 1`,
    [clientUserId, budgetId, clientId]
  );
  return rows.length > 0;
}

async function assertClientBudgetAccess(budgetId: number, clientUserId: number, clientId: number) {
  if (!(await clientUserHasBudget(clientUserId, clientId, budgetId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
  }
}

export const clientPortalRouter = router({
  // Só obras (orçamentos) do cliente que estão em execução.
  listBudgets: clientProcedure.query(async ({ ctx }) => {
    return rawQuery(
      `SELECT b.id, b.title, b.startDate, b.endDate, p.name as projectName, p.location
       FROM site_diary_client_user_budgets cub
       JOIN budgets b ON b.id = cub.budgetId
       LEFT JOIN projects p ON p.id = b.projectId
       WHERE cub.clientUserId = ? AND b.clientId = ? AND b.workStatus = 'execucao'
       ORDER BY b.createdAt DESC`,
      [ctx.clientUser.id, ctx.clientUser.clientId]
    );
  }),

  listEntries: clientProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientBudgetAccess(input.budgetId, ctx.clientUser.id, ctx.clientUser.clientId);
      await assertBudgetInExecution(input.budgetId);
      return loadEntriesWithDetails(await listEntryIdsForBudget(input.budgetId));
    }),

  // Evolução da obra para o cliente: % geral, % por etapa e histórico de medições
  // FECHADAS. Nunca devolve valores em R$ — só percentuais.
  progress: clientProcedure
    .input(z.object({ budgetId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertClientBudgetAccess(input.budgetId, ctx.clientUser.id, ctx.clientUser.clientId);
      await assertBudgetInExecution(input.budgetId);
      const g = (r: any, k: string) => r?.[k] ?? r?.[k.toLowerCase()];
      const id = input.budgetId;

      const b: any[] = await rawQuery(`SELECT totalCost FROM budgets WHERE id = ? LIMIT 1`, [id]);
      const add: any[] = await rawQuery(`SELECT id, totalCostWithBdi FROM budget_additives WHERE budgetId = ? AND status = 'aprovado'`, [id]);
      const total = Number(g(b[0], "totalCost") || 0) + add.reduce((a, x) => a + Number(g(x, "totalCostWithBdi") || 0), 0);

      // Medições fechadas (histórico) e valor medido por período
      const periods: any[] = await rawQuery(
        `SELECT id, periodNumber, name, startDate, endDate, status FROM measurement_periods WHERE budgetId = ? ORDER BY periodNumber`, [id]);
      const perVal: any[] = await rawQuery(
        `SELECT periodId, COALESCE(SUM(valueMeasured),0) AS v FROM measurement_items WHERE budgetId = ? GROUP BY periodId`, [id]);
      const valMap = new Map<number, number>(perVal.map((r) => [Number(g(r, "periodId")), Number(g(r, "v") || 0)]));
      if (add.length) {
        const ids = add.map((x) => Number(g(x, "id")));
        const am: any[] = await rawQuery(
          `SELECT periodId, COALESCE(SUM(measuredValue),0) AS v FROM additive_measurements WHERE additiveId IN (${ids.map(() => "?").join(",")}) GROUP BY periodId`, ids);
        am.forEach((r) => valMap.set(Number(g(r, "periodId")), (valMap.get(Number(g(r, "periodId"))) || 0) + Number(g(r, "v") || 0)));
      }
      let acum = 0;
      const historico = periods.map((p) => {
        const v = valMap.get(Number(g(p, "id"))) || 0;
        acum += v;
        return {
          numero: Number(g(p, "periodNumber")),
          nome: String(g(p, "name") || ""),
          inicio: g(p, "startDate") || null,
          fim: g(p, "endDate") || null,
          fechada: String(g(p, "status")) === "closed",
          percentPeriodo: total > 0 ? (v / total) * 100 : 0,
          percentAcumulado: total > 0 ? (acum / total) * 100 : 0,
        };
      });
      const totalMedido = acum;
      const geral = total > 0 ? Math.max(0, Math.min(100, (totalMedido / total) * 100)) : 0;

      // % por etapa principal: média dos % acumulados dos itens, ponderada pelo custo do item
      const stages: any[] = await rawQuery(`SELECT id, name, parentStageId, \`order\` AS ord FROM budget_stages WHERE budgetId = ?`, [id]);
      const items: any[] = await rawQuery(`SELECT id, stageId, totalCost FROM budget_items WHERE budgetId = ? AND stageId IS NOT NULL`, [id]);
      const accRows: any[] = await rawQuery(`SELECT budgetItemId, COALESCE(SUM(percentMeasured),0) AS p FROM measurement_items WHERE budgetId = ? GROUP BY budgetItemId`, [id]);
      const accMap = new Map<number, number>(accRows.map((r) => [Number(g(r, "budgetItemId")), Number(g(r, "p") || 0)]));
      const parent = new Map<number, number | null>(stages.map((s) => [Number(g(s, "id")), g(s, "parentStageId") ? Number(g(s, "parentStageId")) : null]));
      const rootOf = (sid: number): number => { let cur = sid; let guard = 0; while (parent.get(cur) && guard++ < 20) cur = parent.get(cur)!; return cur; };
      const agg = new Map<number, { w: number; a: number }>();
      for (const it of items) {
        const w = Number(g(it, "totalCost") || 0);
        if (w <= 0) continue;
        const sid = Number(g(it, "stageId"));
        if (!parent.has(sid)) continue;
        const root = rootOf(sid);
        const pct = Math.min(100, accMap.get(Number(g(it, "id"))) || 0);
        const cur = agg.get(root) || { w: 0, a: 0 };
        cur.w += w; cur.a += w * pct / 100;
        agg.set(root, cur);
      }
      const etapas = stages
        .filter((s) => !g(s, "parentStageId") && agg.has(Number(g(s, "id"))))
        .sort((x, y) => Number(g(x, "ord") || 0) - Number(g(y, "ord") || 0))
        .map((s) => { const v = agg.get(Number(g(s, "id")))!; return { nome: String(g(s, "name")), percent: v.w > 0 ? (v.a / v.w) * 100 : 0 }; });

      return { geral, etapas, historico: historico.filter((h) => h.fechada) };
    }),

  me: clientProcedure.query(async ({ ctx }) => {
    return { username: ctx.clientUser.username, email: ctx.clientUser.email, name: ctx.clientUser.name };
  }),
});
