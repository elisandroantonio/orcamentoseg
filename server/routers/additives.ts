import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { rawQuery, getCompositionInputs } from "../db";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function assertAdditiveOwner(additiveId: number, userId: number) {
  const rows = await rawQuery(
    `SELECT ba.id FROM budget_additives ba
     JOIN budgets b ON b.id = ba.budgetId
     WHERE ba.id = ? AND b.userId = ? LIMIT 1`,
    [additiveId, userId]
  );
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
  return rows[0];
}

async function assertBudgetOwner(budgetId: number, userId: number) {
  const rows = await rawQuery(
    `SELECT id FROM budgets WHERE id = ? AND userId = ? LIMIT 1`,
    [budgetId, userId]
  );
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
  return rows[0];
}

async function recalcAdditiveTotals(additiveId: number) {
  // Recalcula totalCostNoBdi e totalCostWithBdi do aditivo
  // totalCostNoBdi = soma de (unitCost * quantity) de todos os itens
  // totalCostWithBdi = soma com encargos sociais sobre M.O. + BDI aplicado
  
  // Buscar itens do aditivo (TiDB armazena nomes de colunas em lowercase)
  const bdiQuery = 'SELECT ai.materialcost, ai.laborcost, ai.equipmentcost, ai.servicecost, ai.othercost,' +
    ' ai.quantity, ai.unitcost, ai.totalcost,' +
    ' ai.applybditomaterial, ai.applybditolabor, ai.aplicarencargossociais,' +
    ' ai.additionalincrement, ai.discount, ai.includematerial' +
    ' FROM additive_items ai WHERE ai.additiveid = ?';
  const items = await rawQuery(bdiQuery, [additiveId]);

  // Buscar parâmetros de BDI do orçamento pai
  const budgetParams = await rawQuery(
    `SELECT b.socialCharges, b.adminCentral, b.profit, b.taxes, b.risk, b.warranty
     FROM budget_additives ba
     JOIN budgets b ON b.id = ba.budgetId
     WHERE ba.id = ? LIMIT 1`,
    [additiveId]
  );
  
  const params = budgetParams[0] || {};
  const socialCharges = parseFloat(params.socialCharges || "0");
  const adminCentral = parseFloat(params.adminCentral || "0");
  const profit = parseFloat(params.profit || "0");
  const taxes = parseFloat(params.taxes || "0");
  const risk = parseFloat(params.risk || "0");
  const warranty = parseFloat(params.warranty || "0");
  
  // Calcular BDI multiplier
  const denominator = 1 - profit / 100 - taxes / 100;
  const bdiMultiplier = denominator > 0
    ? ((1 + adminCentral / 100) * (1 + warranty / 100) * (1 + risk / 100)) / denominator
    : 1;
  
  let totalNoBdi = 0;
  let totalWithBdi = 0;
  
  for (const item of items) {
    const qty = parseFloat(item.quantity || "1");
    
    // Calcular c/ BDI (mesmo algoritmo do calcItemTotalWithBdi no frontend)
    // TiDB retorna colunas em lowercase
    const rawMaterial = parseFloat(item.materialcost || "0");
    // Respeitar flag includematerial (0 = material por conta do cliente)
    const material = Number(item.includematerial) === 0 ? 0 : rawMaterial;
    const labor = parseFloat(item.laborcost || "0")
                + parseFloat(item.equipmentcost || "0")
                + parseFloat(item.servicecost || "0")
                + parseFloat(item.othercost || "0");
    // totalNoBdi respeita includeMaterial: exclui material se desabilitado
    totalNoBdi += (material + labor) * qty;
    const aplicarEncargos = Number(item.aplicarencargossociais) !== 0;
    const laborWithCharges = labor * (1 + (aplicarEncargos ? socialCharges : 0) / 100);
    const applyMat = Number(item.applybditomaterial) !== 0;
    const applyLab = Number(item.applybditolabor) !== 0;
    const increment = 1 + parseFloat(item.additionalincrement || "0") / 100;
    const discount = 1 - parseFloat(item.discount || "0") / 100;
    const matFinal = applyMat ? material * bdiMultiplier : material;
    const labFinal = applyLab ? laborWithCharges * bdiMultiplier : laborWithCharges;
    totalWithBdi += (matFinal + labFinal) * increment * discount * qty;
  }
  
  await rawQuery(
    `UPDATE budget_additives SET totalCostNoBdi = ?, totalCostWithBdi = ?, updatedAt = NOW() WHERE id = ?`,
    [totalNoBdi, totalWithBdi, additiveId]
  );
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const additivesRouter = router({

  // ── Recalcular todos os aditivos de um orçamento ───────────────────────────

  recalcAll: protectedProcedure
    .input(z.object({ budgetId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      const additives = await rawQuery(
        `SELECT id FROM budget_additives WHERE budgetId = ?`,
        [input.budgetId]
      );
      for (const a of additives) {
        await recalcAdditiveTotals(a.id);
      }
      return { recalculated: additives.length };
    }),

  // ── CRUD de Aditivos ──────────────────────────────────────────────────────

  list: protectedProcedure
    .input(z.object({ budgetId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      const additives = await rawQuery(
        `SELECT * FROM budget_additives WHERE budgetId = ? ORDER BY createdAt ASC`,
        [input.budgetId]
      );
      return additives.map((a: any) => ({
        ...a,
        totalCostNoBdi: parseFloat(a.totalCostNoBdi || "0"),
        totalCostWithBdi: parseFloat(a.totalCostWithBdi || "0"),
        frozenAt: a.frozenAt || null,
        frozenBy: a.frozenBy || null,
      }));
    }),

  create: protectedProcedure
    .input(z.object({
      budgetId: z.number(),
      name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      const result = await rawQuery(
        `INSERT INTO budget_additives (budgetId, userId, name, status, totalCostNoBdi, totalCostWithBdi)
         VALUES (?, ?, ?, 'elaboracao', 0, 0)`,
        [input.budgetId, ctx.user.id, input.name]
      ) as any;
      return { id: result.insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      status: z.enum(["elaboracao", "aprovado", "negado"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.id, ctx.user.id);
      const sets: string[] = [];
      const values: any[] = [];
      if (input.name !== undefined) { sets.push(`name = ?`); values.push(input.name); }
      if (input.status !== undefined) { sets.push(`status = ?`); values.push(input.status); }
      if (!sets.length) return { success: true };
      values.push(input.id);
      await rawQuery(`UPDATE budget_additives SET ${sets.join(", ")}, updatedAt = NOW() WHERE id = ?`, values);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.id, ctx.user.id);
      await rawQuery(`DELETE FROM budget_additives WHERE id = ?`, [input.id]);
      return { success: true };
    }),

  freeze: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.id, ctx.user.id);
      const frozenBy = ctx.user.name || ctx.user.email || "Usuário";
      await rawQuery(
        `UPDATE budget_additives SET frozenAt = NOW(), frozenBy = ?, updatedAt = NOW() WHERE id = ?`,
        [frozenBy, input.id]
      );
      return { success: true };
    }),

  unfreeze: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.id, ctx.user.id);
      await rawQuery(
        `UPDATE budget_additives SET frozenAt = NULL, frozenBy = NULL, updatedAt = NOW() WHERE id = ?`,
        [input.id]
      );
      return { success: true };
    }),

  // ── Etapas do Aditivo ─────────────────────────────────────────────────────

  getStages: protectedProcedure
    .input(z.object({ additiveId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      const stages = await rawQuery(
        `SELECT * FROM additive_stages WHERE additiveId = ? ORDER BY \`order\` ASC, id ASC`,
        [input.additiveId]
      );
      const items = await rawQuery(
        `SELECT ai.*, c.description as compositionDescription, c.unit as compositionUnit,
                c.materialCost as compositionMaterialCost, c.laborCost as compositionLaborCost
         FROM additive_items ai
         LEFT JOIN compositions c ON c.id = ai.compositionId
         WHERE ai.additiveId = ?
         ORDER BY ai.\`order\` ASC, ai.id ASC`,
        [input.additiveId]
      );
      // Montar hierarquia
      const stageMap: Record<number, any> = {};
      const rootStages: any[] = [];
      for (const s of stages) {
        stageMap[s.id] = { ...s, items: [], children: [] };
      }
      for (const s of stages) {
        if (s.parentStageId && stageMap[s.parentStageId]) {
          stageMap[s.parentStageId].children.push(stageMap[s.id]);
        } else {
          rootStages.push(stageMap[s.id]);
        }
      }
      for (const item of items) {
        const stageId = item.stageId;
        if (stageId && stageMap[stageId]) {
          // TiDB retorna colunas camelCase em lowercase via SELECT *, normalizar aqui
          const raw = item as any;
          stageMap[stageId].items.push({
            ...item,
            quantity: parseFloat(raw.quantity || "1"),
            materialCost: parseFloat(raw.materialCost || raw.materialcost || "0"),
            laborCost: parseFloat(raw.laborCost || raw.laborcost || "0"),
            equipmentCost: parseFloat(raw.equipmentCost || raw.equipmentcost || "0"),
            serviceCost: parseFloat(raw.serviceCost || raw.servicecost || "0"),
            otherCost: parseFloat(raw.otherCost || raw.othercost || "0"),
            unitCost: parseFloat(raw.unitCost || raw.unitcost || "0"),
            totalCost: parseFloat(raw.totalCost || raw.totalcost || "0"),
            additionalIncrement: parseFloat(raw.additionalIncrement || raw.additionalincrement || "0"),
            discount: parseFloat(raw.discount || "0"),
            applyBdiToMaterial: Number(raw.applyBdiToMaterial ?? raw.applybditomaterial ?? 1),
            applyBdiToLabor: Number(raw.applyBdiToLabor ?? raw.applybditolabor ?? 1),
            aplicarEncargosSociais: Number(raw.aplicarEncargosSociais ?? raw.aplicarencargossociais ?? 1),
            includeMaterial: Number(raw.includeMaterial ?? raw.includematerial ?? 1),
          });
        }
      }
      return rootStages;
    }),

  createStage: protectedProcedure
    .input(z.object({
      additiveId: z.number(),
      name: z.string().min(1),
      parentStageId: z.number().nullable().optional(),
      order: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      // Calcular próxima ordem
      const maxOrder = input.parentStageId
        ? await rawQuery(
            `SELECT COALESCE(MAX(\`order\`), 0) as maxOrd FROM additive_stages WHERE additiveId = ? AND parentStageId = ?`,
            [input.additiveId, input.parentStageId]
          )
        : await rawQuery(
            `SELECT COALESCE(MAX(\`order\`), 0) as maxOrd FROM additive_stages WHERE additiveId = ? AND parentStageId IS NULL`,
            [input.additiveId]
          );
      const nextOrder = (input.order !== undefined) ? input.order : (parseInt(maxOrder[0]?.maxOrd || "0") + 1);
      const result = await rawQuery(
        `INSERT INTO additive_stages (additiveId, parentStageId, name, \`order\`)
         VALUES (?, ?, ?, ?)`,
        [input.additiveId, input.parentStageId ?? null, input.name, nextOrder]
      ) as any;
      return { id: result.insertId };
    }),

  updateStage: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      order: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verificar ownership via additiveId
      const rows = await rawQuery(
        `SELECT as2.additiveId FROM additive_stages as2
         JOIN budget_additives ba ON ba.id = as2.additiveId
         JOIN budgets b ON b.id = ba.budgetId
         WHERE as2.id = ? AND b.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
      const sets: string[] = [];
      const values: any[] = [];
      if (input.name !== undefined) { sets.push(`name = ?`); values.push(input.name); }
      if (input.order !== undefined) { sets.push(`\`order\` = ?`); values.push(input.order); }
      if (!sets.length) return { success: true };
      values.push(input.id);
      await rawQuery(`UPDATE additive_stages SET ${sets.join(", ")} WHERE id = ?`, values);
      return { success: true };
    }),

  deleteStage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(
        `SELECT as2.additiveId FROM additive_stages as2
         JOIN budget_additives ba ON ba.id = as2.additiveId
         JOIN budgets b ON b.id = ba.budgetId
         WHERE as2.id = ? AND b.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
      await rawQuery(`DELETE FROM additive_stages WHERE id = ?`, [input.id]);
      return { success: true };
    }),

  // ── Itens do Aditivo ──────────────────────────────────────────────────────

  createItem: protectedProcedure
    .input(z.object({
      additiveId: z.number(),
      stageId: z.number().nullable().optional(),
      type: z.enum(["composition", "input", "service"]).default("composition"),
      compositionId: z.number().nullable().optional(),
      description: z.string(),
      unit: z.string(),
      quantity: z.number(),
      materialCost: z.number().default(0),
      laborCost: z.number().default(0),
      equipmentCost: z.number().default(0),
      serviceCost: z.number().default(0),
      otherCost: z.number().default(0),
      unitCost: z.number().default(0),
      order: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      
      // Se compositionId fornecido, calcular custos a partir dos insumos (composições SINAPI podem ter materialCost/laborCost null)
      let materialCost = input.materialCost;
      let laborCost = input.laborCost;
      let equipmentCost = input.equipmentCost;
      let unitCost = input.unitCost;
      
      // Só recalcular a partir dos insumos base se unitCost === 0
      // Isso garante que valores customizados passados pelo frontend (ex: budgetItemInputs) sejam preservados
      if (input.compositionId && unitCost === 0) {
        // Calcular a partir dos insumos da composição
        const compInputs = await getCompositionInputs(input.compositionId);
        let mat = 0, lab = 0, eqp = 0;
        for (const ci of compInputs) {
          if (!ci.input) continue;
          const cost = Number(ci.input.unitCost) * Number(ci.coefficient);
          if (ci.input.type === "material") mat += cost;
          else if (ci.input.type === "labor") lab += cost;
          else if (ci.input.type === "equipment") eqp += cost;
        }
        materialCost = mat;
        laborCost = lab;
        equipmentCost = eqp;
        unitCost = mat + lab + eqp;
      }
      
      const maxOrder = input.stageId
        ? await rawQuery(
            `SELECT COALESCE(MAX(\`order\`), 0) as maxOrd FROM additive_items WHERE additiveId = ? AND stageId = ?`,
            [input.additiveId, input.stageId]
          )
        : await rawQuery(
            `SELECT COALESCE(MAX(\`order\`), 0) as maxOrd FROM additive_items WHERE additiveId = ? AND stageId IS NULL`,
            [input.additiveId]
          );
      const nextOrder = (input.order !== undefined) ? input.order : (parseInt(maxOrder[0]?.maxOrd || "0") + 1);
      const totalCost = unitCost * input.quantity;
      const result = await rawQuery(
        `INSERT INTO additive_items
         (additiveId, stageId, type, compositionId, description, unit, quantity,
          materialCost, laborCost, equipmentCost, serviceCost, otherCost, unitCost, totalCost, \`order\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.additiveId, input.stageId ?? null, input.type, input.compositionId ?? null,
          input.description, input.unit, input.quantity,
          materialCost, laborCost, equipmentCost,
          input.serviceCost, input.otherCost, unitCost, totalCost, nextOrder,
        ]
      ) as any;
      await recalcAdditiveTotals(input.additiveId);
      return { id: result.insertId };
    }),

  updateItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      unit: z.string().optional(),
      quantity: z.number().optional(),
      materialCost: z.number().optional(),
      laborCost: z.number().optional(),
      equipmentCost: z.number().optional(),
      serviceCost: z.number().optional(),
      otherCost: z.number().optional(),
      unitCost: z.number().optional(),
      applyBdiToMaterial: z.boolean().optional(),
      applyBdiToLabor: z.boolean().optional(),
      additionalIncrement: z.number().optional(),
      discount: z.number().optional(),
      aplicarEncargosSociais: z.boolean().optional(),
      includeMaterial: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(
        `SELECT ai.additiveId FROM additive_items ai
         JOIN budget_additives ba ON ba.id = ai.additiveId
         JOIN budgets b ON b.id = ba.budgetId
         WHERE ai.id = ? AND b.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
      const additiveId = rows[0].additiveId;
      const sets: string[] = [];
      const values: any[] = [];
      if (input.description !== undefined) { sets.push(`description = ?`); values.push(input.description); }
      if (input.unit !== undefined) { sets.push(`unit = ?`); values.push(input.unit); }
      if (input.quantity !== undefined) { sets.push(`quantity = ?`); values.push(input.quantity); }
      if (input.materialCost !== undefined) { sets.push(`materialCost = ?`); values.push(input.materialCost); }
      if (input.laborCost !== undefined) { sets.push(`laborCost = ?`); values.push(input.laborCost); }
      if (input.equipmentCost !== undefined) { sets.push(`equipmentCost = ?`); values.push(input.equipmentCost); }
      if (input.serviceCost !== undefined) { sets.push(`serviceCost = ?`); values.push(input.serviceCost); }
      if (input.otherCost !== undefined) { sets.push(`otherCost = ?`); values.push(input.otherCost); }
      if (input.unitCost !== undefined) { sets.push(`unitCost = ?`); values.push(input.unitCost); }
      if (input.applyBdiToMaterial !== undefined) { sets.push('applybditomaterial = ?'); values.push(input.applyBdiToMaterial ? 1 : 0); }
      if (input.applyBdiToLabor !== undefined) { sets.push('applybditolabor = ?'); values.push(input.applyBdiToLabor ? 1 : 0); }
      if (input.additionalIncrement !== undefined) { sets.push('additionalincrement = ?'); values.push(input.additionalIncrement); }
      if (input.discount !== undefined) { sets.push('discount = ?'); values.push(input.discount); }
      if (input.aplicarEncargosSociais !== undefined) { sets.push('aplicarencargossociais = ?'); values.push(input.aplicarEncargosSociais ? 1 : 0); }
      if (input.includeMaterial !== undefined) { sets.push('includematerial = ?'); values.push(input.includeMaterial ? 1 : 0); }
      // Recalcular unitCost e totalCost quando custos de componentes ou quantidade mudam
      const needsRecalc = input.quantity !== undefined || input.unitCost !== undefined ||
        input.materialCost !== undefined || input.laborCost !== undefined ||
        input.equipmentCost !== undefined || input.serviceCost !== undefined || input.otherCost !== undefined;
      if (needsRecalc) {
        const current = await rawQuery(`SELECT quantity, unitCost, materialCost, laborCost, equipmentCost, serviceCost, otherCost, type FROM additive_items WHERE id = ?`, [input.id]);
        const qty = input.quantity ?? parseFloat(current[0]?.quantity || "1");
        // Para itens do tipo service, unitCost = soma dos componentes
        const isService = current[0]?.type === 'service';
        let uc: number;
        if (isService || input.materialCost !== undefined || input.laborCost !== undefined || input.equipmentCost !== undefined || input.serviceCost !== undefined || input.otherCost !== undefined) {
          const mat = input.materialCost ?? parseFloat(current[0]?.materialCost || "0");
          const lab = input.laborCost ?? parseFloat(current[0]?.laborCost || "0");
          const eqp = input.equipmentCost ?? parseFloat(current[0]?.equipmentCost || "0");
          const svc = input.serviceCost ?? parseFloat(current[0]?.serviceCost || "0");
          const oth = input.otherCost ?? parseFloat(current[0]?.otherCost || "0");
          uc = mat + lab + eqp + svc + oth;
          sets.push(`unitCost = ?`); values.push(uc);
        } else {
          uc = input.unitCost ?? parseFloat(current[0]?.unitCost || "0");
        }
        sets.push(`totalCost = ?`); values.push(qty * uc);
      }
      if (!sets.length) return { success: true };
      values.push(input.id);
      await rawQuery(`UPDATE additive_items SET ${sets.join(", ")} WHERE id = ?`, values);
      await recalcAdditiveTotals(additiveId);
      return { success: true };
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await rawQuery(
        `SELECT ai.additiveId FROM additive_items ai
         JOIN budget_additives ba ON ba.id = ai.additiveId
         JOIN budgets b ON b.id = ba.budgetId
         WHERE ai.id = ? AND b.userId = ? LIMIT 1`,
        [input.id, ctx.user.id]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
      const additiveId = rows[0].additiveId;
      await rawQuery(`DELETE FROM additive_items WHERE id = ?`, [input.id]);
      await recalcAdditiveTotals(additiveId);
      return { success: true };
    }),

  // ── Buscar composição para adicionar ao aditivo ───────────────────────────

  // ── Medição de Aditivos ──────────────────────────────────────────────────────

  // Buscar medições de um aditivo em um período específico
  listMeasurementItems: protectedProcedure
    .input(z.object({ additiveId: z.number(), periodId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      const rows = await rawQuery(
        `SELECT * FROM additive_measurements WHERE additiveId = ? AND periodId = ?`,
        [input.additiveId, input.periodId]
      );
      return rows.map((r: any) => ({
        id: r.id,
        additiveId: r.additiveId,
        additiveItemId: r.additiveItemId,
        periodId: r.periodId,
        measuredPercent: parseFloat(r.measuredPercent || r.measuredpercent || "0"),
        measuredValue: parseFloat(r.measuredValue || r.measuredvalue || "0"),
      }));
    }),

  // Buscar TODAS as medições de um aditivo (todos os períodos) — para acumulado histórico
  listAllMeasurementItems: protectedProcedure
    .input(z.object({ additiveId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      const rows = await rawQuery(
        `SELECT am.*, mp.periodNumber FROM additive_measurements am
         JOIN measurement_periods mp ON mp.id = am.periodId
         WHERE am.additiveId = ?
         ORDER BY mp.periodNumber ASC`,
        [input.additiveId]
      );
      return rows.map((r: any) => ({
        id: r.id,
        additiveId: r.additiveId,
        additiveItemId: r.additiveItemId,
        periodId: r.periodId,
        periodNumber: r.periodNumber,
        measuredPercent: parseFloat(r.measuredPercent || r.measuredpercent || "0"),
        measuredValue: parseFloat(r.measuredValue || r.measuredvalue || "0"),
      }));
    }),

  // Salvar medições de um aditivo em lote (batch upsert por periodId)
  batchUpsertMeasurementItems: protectedProcedure
    .input(z.object({
      additiveId: z.number(),
      periodId: z.number(),
      items: z.array(z.object({
        additiveItemId: z.number(),
        measuredPercent: z.string(),
        measuredValue: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      for (const item of input.items) {
        // measuredPercent/measuredValue chegam como string do frontend — validar
        // que são números antes de usar em SQL (mesmo parametrizado, evita lixo).
        if (!/^-?\d+(\.\d+)?$/.test(item.measuredPercent) || !/^-?\d+(\.\d+)?$/.test(item.measuredValue)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Valor de medição inválido" });
        }
        const existing = await rawQuery(
          `SELECT id FROM additive_measurements WHERE additiveId = ? AND additiveItemId = ? AND periodId = ? LIMIT 1`,
          [input.additiveId, item.additiveItemId, input.periodId]
        );
        if (existing.length > 0) {
          await rawQuery(
            `UPDATE additive_measurements SET measuredPercent = ?, measuredValue = ?, updatedAt = NOW()
             WHERE id = ?`,
            [item.measuredPercent, item.measuredValue, existing[0].id]
          );
        } else {
          await rawQuery(
            `INSERT INTO additive_measurements (additiveId, additiveItemId, periodId, measuredPercent, measuredValue)
             VALUES (?, ?, ?, ?, ?)`,
            [input.additiveId, item.additiveItemId, input.periodId, item.measuredPercent, item.measuredValue]
          );
        }
      }
      return { success: true, count: input.items.length };
    }),

  // ─── Insumos customizados por item de aditivo ──────────────────────────────
  // Busca os insumos de um item de aditivo (customizados ou da composição base)
  getAdditiveItemInputs: protectedProcedure
    .input(z.object({ additiveItemId: z.number(), additiveId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      // Verificar se há customizações salvas para este item de aditivo
      const customInputs = await rawQuery(
        `SELECT aii.id, aii.inputId, aii.coefficient, aii.unitCost,
                i.description, i.unit, i.type
         FROM additive_item_inputs aii
         LEFT JOIN inputs i ON i.id = aii.inputId
         WHERE aii.additiveItemId = ?
         ORDER BY aii.id ASC`,
        [input.additiveItemId]
      );
      if (customInputs.length > 0) {
        return {
          source: 'custom' as const,
          inputs: customInputs.map((r: any) => ({
            id: r.id,
            inputId: r.inputId,
            coefficient: parseFloat(r.coefficient || '1'),
            unitCost: parseFloat(r.unitCost || '0'),
            description: r.description,
            unit: r.unit,
            type: r.type,
          }))
        };
      }
      // Sem customizações: buscar compositionId do item e retornar insumos da composição base
      const itemRows = await rawQuery(
        `SELECT ai.compositionId FROM additive_items ai WHERE ai.id = ? LIMIT 1`,
        [input.additiveItemId]
      );
      if (!itemRows.length) throw new TRPCError({ code: 'NOT_FOUND' });
      const item = itemRows[0];
      if (!item.compositionId) return { source: 'base' as const, inputs: [] };
      // Buscar insumos da composição base
      const baseInputs = await rawQuery(
        `SELECT ci.inputId, ci.coefficient,
                i.description, i.unit, i.unitCost, i.type
         FROM composition_inputs ci
         LEFT JOIN inputs i ON i.id = ci.inputId
         WHERE ci.compositionId = ?
         ORDER BY ci.id ASC`,
        [item.compositionId]
      );
      return {
        source: 'base' as const,
        inputs: baseInputs.map((r: any) => ({
          id: null as null,
          inputId: r.inputId,
          coefficient: parseFloat(r.coefficient || '1'),
          unitCost: parseFloat(r.unitCost || '0'),
          description: r.description,
          unit: r.unit,
          type: r.type,
        }))
      };
    }),

  // Salva customizações de insumos para um item de aditivo e recalcula seus custos
  saveAdditiveItemInputs: protectedProcedure
    .input(z.object({
      additiveItemId: z.number(),
      additiveId: z.number(),
      inputs: z.array(z.object({
        inputId: z.number(),
        coefficient: z.number(),
        unitCost: z.number(),
        type: z.string(),
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      // Deletar customizações existentes e reinserir
      await rawQuery(`DELETE FROM additive_item_inputs WHERE additiveItemId = ?`, [input.additiveItemId]);
      for (const inp of input.inputs) {
        await rawQuery(
          `INSERT INTO additive_item_inputs (additiveItemId, inputId, coefficient, unitCost)
           VALUES (?, ?, ?, ?)`,
          [input.additiveItemId, inp.inputId, inp.coefficient, inp.unitCost]
        );
      }
      // Recalcular custos do item de aditivo
      let mat = 0, lab = 0, eqp = 0;
      for (const inp of input.inputs) {
        const cost = inp.coefficient * inp.unitCost;
        if (inp.type === 'labor') lab += cost;
        else if (inp.type === 'equipment') eqp += cost;
        else mat += cost;
      }
      // Buscar quantidade e outros custos do item
      const itemRows = await rawQuery(
        `SELECT quantity, serviceCost, otherCost FROM additive_items WHERE id = ? LIMIT 1`,
        [input.additiveItemId]
      );
      const qty = parseFloat(itemRows[0]?.quantity || itemRows[0]?.quantity || '1');
      const svc = parseFloat(itemRows[0]?.serviceCost || itemRows[0]?.servicecost || '0');
      const oth = parseFloat(itemRows[0]?.otherCost || itemRows[0]?.othercost || '0');
      const unitCostCalc = mat + lab + eqp + svc + oth;
      const totalCost = unitCostCalc * qty;
      await rawQuery(
        `UPDATE additive_items
         SET materialCost = ?, laborCost = ?, equipmentCost = ?,
             unitCost = ?, totalCost = ?
         WHERE id = ?`,
        [mat, lab, eqp, unitCostCalc, totalCost, input.additiveItemId]
      );
      // Recalcular totais do aditivo
      await recalcAdditiveTotals(input.additiveId);
      return { success: true, materialCost: mat, laborCost: lab, equipmentCost: eqp, unitCost: unitCostCalc, totalCost };
    }),

  getCompositionForAdditive: protectedProcedure
    .input(z.object({ compositionId: z.number(), budgetId: z.number(), budgetItemId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetOwner(input.budgetId, ctx.user.id);
      const comps = await rawQuery(
        `SELECT c.*, ci.inputId, ci.coefficient,
                i.description as inputDescription, i.unit as inputUnit,
                i.unitCost as inputUnitCost, i.type as inputType
         FROM compositions c
         LEFT JOIN composition_inputs ci ON ci.compositionId = c.id
         LEFT JOIN inputs i ON i.id = ci.inputId
         WHERE c.id = ?
         ORDER BY ci.id ASC`,
        [input.compositionId]
      );
      if (!comps.length) throw new TRPCError({ code: "NOT_FOUND" });
      const comp = comps[0];
      const baseInputs = comps
        .filter((r: any) => r.inputId)
        .map((r: any) => ({
          inputId: r.inputId,
          coefficient: parseFloat(r.coefficient || "1"),
          unitCost: parseFloat(r.inputUnitCost || "0"),
          description: r.inputDescription,
          unit: r.inputUnit,
          type: r.inputType,
        }));

      // Buscar budgetItemId: usar o fornecido ou buscar no banco pelo budgetId + compositionId
      // Isso garante que o aditivo use os mesmos valores customizados do orçamento principal
      // sem depender do mapeamento no frontend (que pode falhar em sub-etapas)
      let resolvedBudgetItemId = input.budgetItemId;
      if (!resolvedBudgetItemId && input.budgetId) {
        const biRows = await rawQuery(
          `SELECT bi.id FROM budget_items bi
           JOIN budget_stages bs ON bs.id = bi.stageId
           WHERE bs.budgetId = ? AND bi.compositionId = ?
           LIMIT 1`,
          [input.budgetId, input.compositionId]
        );
        if (biRows.length > 0) resolvedBudgetItemId = biRows[0].id;
      }
      let activeInputs = baseInputs;
      if (resolvedBudgetItemId) {
        const customRows = await rawQuery(
          `SELECT bii.inputId, bii.coefficient, bii.unitCost,
                  i.description, i.unit, i.type
           FROM budget_item_inputs bii
           LEFT JOIN inputs i ON i.id = bii.inputId
           WHERE bii.budgetItemId = ?`,
          [resolvedBudgetItemId]
        );
        if (customRows.length > 0) {
          // Usar customizações do orçamento principal
          activeInputs = customRows.map((r: any) => ({
            inputId: r.inputId,
            coefficient: parseFloat(r.coefficient || "1"),
            unitCost: parseFloat(r.unitCost || "0"),
            description: r.description,
            unit: r.unit,
            type: r.type,
          }));
        }
      }

      // Calcular custos a partir dos insumos ativos
      let mat = 0;
      let lab = 0;
      let eqp = 0;
      const svc = parseFloat(comp.serviceCost || "0");
      const oth = parseFloat(comp.otherCost || "0");

      if (activeInputs.length > 0) {
        for (const ci of activeInputs) {
          const cost = ci.unitCost * ci.coefficient;
          if (ci.type === "material") mat += cost;
          else if (ci.type === "labor") lab += cost;
          else if (ci.type === "equipment") eqp += cost;
          else mat += cost; // fallback
        }
      } else {
        // Fallback: usar valores salvos na composição base
        mat = parseFloat(comp.materialCost || "0");
        lab = parseFloat(comp.laborCost || "0");
        eqp = parseFloat(comp.equipmentCost || "0");
      }

      const unt = mat + lab + eqp + svc + oth;
      return {
        id: comp.id,
        description: comp.description,
        unit: comp.unit,
        materialCost: mat,
        laborCost: lab,
        equipmentCost: eqp,
        serviceCost: svc,
        otherCost: oth,
        unitCost: unt,
        inputs: activeInputs,
      };
    }),

  // ── Sincronizar item do aditivo com valores do orçamento principal ────────────
  syncItemWithBudget: protectedProcedure
    .input(z.object({
      additiveItemId: z.number(),
      budgetId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verificar ownership do item
      const itemRows = await rawQuery(
        `SELECT ai.id, ai.additiveId, ai.compositionId, ai.type
         FROM additive_items ai
         JOIN budget_additives ba ON ba.id = ai.additiveId
         JOIN budgets b ON b.id = ba.budgetId
         WHERE ai.id = ? AND b.userId = ? LIMIT 1`,
        [input.additiveItemId, ctx.user.id]
      );
      if (!itemRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Item n\u00e3o encontrado" });
      const item = itemRows[0];
      if (!item.compositionId) throw new TRPCError({ code: "BAD_REQUEST", message: "Item n\u00e3o \u00e9 uma composi\u00e7\u00e3o" });

      // Buscar o budgetItem correspondente no or\u00e7amento principal (mesma compositionId)
      const budgetItemRows = await rawQuery(
        `SELECT bi.id
         FROM budget_items bi
         JOIN budget_stages bs ON bs.id = bi.stageId
         WHERE bs.budgetId = ? AND bi.compositionId = ?
         LIMIT 1`,
        [input.budgetId, item.compositionId]
      );

      let mat: number, lab: number, eqp: number, svc: number, oth: number, unt: number;

      if (budgetItemRows.length > 0) {
        // Calcular direto dos budget_item_inputs (customiza\u00e7\u00f5es) ou composi\u00e7\u00e3o base
        const budgetItemId = budgetItemRows[0].id;
        const customInputs = await rawQuery(
          `SELECT bii.coefficient, bii.unitCost, i.type
           FROM budget_item_inputs bii
           JOIN inputs i ON i.id = bii.inputId
           WHERE bii.budgetItemId = ?`,
          [budgetItemId]
        );
        mat = 0; lab = 0; eqp = 0; svc = 0; oth = 0;
        if (customInputs.length > 0) {
          for (const ci of customInputs) {
            const cost = Number(ci.coefficient) * Number(ci.unitCost);
            const t = (ci.type || "").toLowerCase();
            if (t === "material") mat += cost;
            else if (t === "labor") lab += cost;
            else if (t === "equipment") eqp += cost;
          }
        } else {
          // Sem customiza\u00e7\u00f5es: usar composi\u00e7\u00e3o base
          const compInputs = await getCompositionInputs(item.compositionId);
          for (const ci of compInputs) {
            if (!ci.input) continue;
            const cost = Number(ci.input.unitCost) * Number(ci.coefficient);
            if (ci.input.type === "material") mat += cost;
            else if (ci.input.type === "labor") lab += cost;
            else if (ci.input.type === "equipment") eqp += cost;
          }
        }
        unt = mat + lab + eqp;
      } else {
        // Fallback: calcular a partir dos insumos da composi\u00e7\u00e3o base
        const compInputs = await getCompositionInputs(item.compositionId);
        mat = 0; lab = 0; eqp = 0; svc = 0; oth = 0;
        for (const ci of compInputs) {
          if (!ci.input) continue;
          const cost = Number(ci.input.unitCost) * Number(ci.coefficient);
          if (ci.input.type === "material") mat += cost;
          else if (ci.input.type === "labor") lab += cost;
          else if (ci.input.type === "equipment") eqp += cost;
        }
        unt = mat + lab + eqp;
      }

      // Buscar quantity atual do item do aditivo
      const qtyRows = await rawQuery(`SELECT quantity FROM additive_items WHERE id = ?`, [input.additiveItemId]);
      const qty = parseFloat(qtyRows[0]?.quantity || "1");
      const totalCost = unt * qty;

      await rawQuery(
        `UPDATE additive_items
         SET materialCost = ?, laborCost = ?, equipmentCost = ?,
             serviceCost = ?, otherCost = ?, unitCost = ?, totalCost = ?
         WHERE id = ?`,
        [mat, lab, eqp, svc, oth, unt, totalCost, input.additiveItemId]
      );
      await recalcAdditiveTotals(item.additiveId);
      return { success: true, materialCost: mat, laborCost: lab, equipmentCost: eqp, serviceCost: svc, otherCost: oth, unitCost: unt };
    }),

  // ── Sincronizar TODOS os itens de composi\u00e7\u00e3o de um aditivo com o or\u00e7amento principal ──
  syncAllItemsWithBudget: protectedProcedure
    .input(z.object({
      additiveId: z.number(),
      budgetId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdditiveOwner(input.additiveId, ctx.user.id);
      // Buscar todos os itens do tipo composition neste aditivo
      const items = await rawQuery(
        `SELECT id, compositionId FROM additive_items
         WHERE additiveId = ? AND compositionId IS NOT NULL AND type = 'composition'`,
        [input.additiveId]
      );
      let synced = 0;
      for (const item of items) {
        // Buscar budgetItem correspondente
        const biRows = await rawQuery(
          `SELECT bi.id
           FROM budget_items bi
           JOIN budget_stages bs ON bs.id = bi.stageId
           WHERE bs.budgetId = ? AND bi.compositionId = ?
           LIMIT 1`,
          [input.budgetId, item.compositionId]
        );
        if (!biRows.length) continue;
        const biId = biRows[0].id;
        // Calcular via budget_item_inputs (customizações) ou composição base
        const custInputs = await rawQuery(
          `SELECT bii.coefficient, bii.unitCost, i.type
           FROM budget_item_inputs bii
           JOIN inputs i ON i.id = bii.inputId
           WHERE bii.budgetItemId = ?`,
          [biId]
        );
        let mat = 0, lab = 0, eqp = 0, svc = 0, oth = 0;
        if (custInputs.length > 0) {
          for (const ci of custInputs) {
            const cost = Number(ci.coefficient) * Number(ci.unitCost);
            const t = (ci.type || "").toLowerCase();
            if (t === "material") mat += cost;
            else if (t === "labor") lab += cost;
            else if (t === "equipment") eqp += cost;
          }
        } else {
          const compInputs = await getCompositionInputs(item.compositionId);
          for (const ci of compInputs) {
            if (!ci.input) continue;
            const cost = Number(ci.input.unitCost) * Number(ci.coefficient);
            if (ci.input.type === "material") mat += cost;
            else if (ci.input.type === "labor") lab += cost;
            else if (ci.input.type === "equipment") eqp += cost;
          }
        }
        const unt = mat + lab + eqp;
        const qtyRows = await rawQuery(`SELECT quantity FROM additive_items WHERE id = ?`, [item.id]);
        const qty = parseFloat(qtyRows[0]?.quantity || "1");
        await rawQuery(
          `UPDATE additive_items
           SET materialCost = ?, laborCost = ?, equipmentCost = ?,
               serviceCost = ?, otherCost = ?, unitCost = ?, totalCost = ?
           WHERE id = ?`,
          [mat, lab, eqp, svc, oth, unt, unt * qty, item.id]
        );
        synced++;
      }
      await recalcAdditiveTotals(input.additiveId);
      return { success: true, synced };
    }),
});
