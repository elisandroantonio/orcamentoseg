import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  materialLists,
  materialListBudgets,
  materialListItems,
  budgets,
  budgetStages,
  budgetItems,
  compositions,
  compositionInputs,
  inputs,
} from "../../drizzle/schema";

// Unidades de tempo/trabalho que NÃO devem aparecer na lista de materiais
// (mão de obra e equipamentos, não são "comprados" como material).
const TIME_UNITS = /^(H|HH|H\/H|H\/h|HORA|HORAS|DIA|DIAS|MES|MÊS|MESES|CHP|CHI|H\/DIA|H\/MES|H\/MÊS|EQUIP)$/i;

// Normaliza um código (SINAPI ou interno) pra comparação — remove tudo que
// não for letra/número e ignora maiúsculas/minúsculas. "SINAPI-88629" e
// "88629" viram a mesma chave.
function normalizeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const cleaned = code.toString().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned || null;
}

interface ExpandedMaterial {
  inputId: number | null;
  sinapiCode: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

/**
 * Expande recursivamente os materiais de uma composição. Quando um insumo
 * de material é, na verdade, uma "composição auxiliar" (ex: argamassa
 * traço 1:3, concreto usinado) que também está cadastrada no menu
 * Composições com o MESMO código, em vez de lançar essa argamassa como uma
 * linha única de preço fechado, desce na receita dela e lança os materiais
 * base (cimento, areia, cal, aditivo...) — que é o que de fato se compra
 * quando a argamassa é feita em obra. Se a composição auxiliar não estiver
 * cadastrada (ainda não existe a receita), cai no comportamento antigo:
 * lança o insumo como está, com seu preço fechado.
 */
async function expandCompositionMaterials(
  database: any,
  compositionId: number,
  multiplier: number,
  compositionsByCode: Map<string, number>,
  depth: number,
  pathVisited: Set<number>,
  out: ExpandedMaterial[]
) {
  // Guarda contra recursão excessiva/ciclos (mesma composição auxiliar
  // referenciando a si mesma direta ou indiretamente).
  if (depth > 5 || pathVisited.has(compositionId)) return;
  pathVisited.add(compositionId);

  const compInputs = await database
    .select({
      inputId: compositionInputs.inputId,
      coefficient: compositionInputs.coefficient,
      inputCode: inputs.code,
      inputDescription: inputs.description,
      inputUnit: inputs.unit,
      inputUnitCost: inputs.unitCost,
    })
    .from(compositionInputs)
    .innerJoin(inputs, eq(compositionInputs.inputId, inputs.id))
    .where(and(
      eq(compositionInputs.compositionId, compositionId),
      eq(inputs.type, "material")
    ));

  for (const ci of compInputs) {
    if (TIME_UNITS.test((ci.inputUnit || "").trim())) continue;
    const coefficient = parseFloat(ci.coefficient || "0");
    const qtyHere = multiplier * coefficient;

    const normCode = normalizeCode(ci.inputCode);
    const auxCompositionId = normCode ? compositionsByCode.get(normCode) : undefined;

    if (auxCompositionId && auxCompositionId !== compositionId) {
      await expandCompositionMaterials(database, auxCompositionId, qtyHere, compositionsByCode, depth + 1, pathVisited, out);
    } else {
      out.push({
        inputId: ci.inputId,
        sinapiCode: ci.inputCode || null,
        description: ci.inputDescription,
        unit: ci.inputUnit,
        quantity: qtyHere,
        unitCost: parseFloat(ci.inputUnitCost || "0"),
      });
    }
  }

  pathVisited.delete(compositionId);
}

/**
 * Extrai os materiais de um orçamento e retorna uma lista de itens.
 * - Composições: percorre composition_inputs (type=material) e multiplica coeficiente × quantidade do item,
 *   expandindo recursivamente composições auxiliares (argamassa, concreto usinado etc.) quando a receita
 *   também estiver cadastrada como Composição com o mesmo código.
 * - Serviços a preço informado (type=service): cria uma linha genérica com materialCost
 */
async function extractMaterialsFromBudget(
  database: any,
  budgetId: number,
  materialListId: number,
  userId: number
) {
  // 0. Mapa código normalizado → id da composição, pra saber quais insumos
  // são, na verdade, composições auxiliares (argamassa, concreto usinado
  // etc.) com receita própria cadastrada — usado pra expandir em materiais
  // base em vez de lançar como uma linha de preço fechado.
  const userCompositions = await database
    .select({ id: compositions.id, code: compositions.code })
    .from(compositions)
    .where(eq(compositions.userId, userId));
  const compositionsByCode = new Map<string, number>();
  for (const c of userCompositions) {
    const norm = normalizeCode(c.code);
    if (norm) compositionsByCode.set(norm, c.id);
  }

  // 1. Buscar todas as etapas do orçamento (apenas raiz + sub-etapas)
  const stages = await database
    .select({ id: budgetStages.id, name: budgetStages.name, parentStageId: budgetStages.parentStageId, order: budgetStages.order })
    .from(budgetStages)
    .where(eq(budgetStages.budgetId, budgetId));

  // Mapa stageId → nome completo (etapa raiz)
  const stageMap = new Map<number, string>();
  const rootStages = stages.filter((s: any) => !s.parentStageId);
  const childStages = stages.filter((s: any) => s.parentStageId);

  for (const s of rootStages) stageMap.set(s.id, s.name);
  for (const s of childStages) {
    const parent = rootStages.find((r: any) => r.id === s.parentStageId);
    stageMap.set(s.id, parent ? `${parent.name} / ${s.name}` : s.name);
  }

  // 2. Buscar todos os itens do orçamento (excluindo itens compostos pai — type=composite)
  const items = await database
    .select({
      id: budgetItems.id,
      stageId: budgetItems.stageId,
      type: budgetItems.type,
      compositionId: budgetItems.compositionId,
      description: budgetItems.description,
      unit: budgetItems.unit,
      quantity: budgetItems.quantity,
      materialCost: budgetItems.materialCost,
      order: budgetItems.order,
    })
    .from(budgetItems)
    .where(and(
      eq(budgetItems.budgetId, budgetId),
      // Excluir itens compostos pai (eles não têm custo próprio)
    ));

  const itemsToInsert: any[] = [];
  let orderCounter = 0;

  for (const item of items) {
    // Ignorar itens do tipo 'composite' (pai de serviços compostos)
    if (item.type === 'composite') continue;

    const stageId = item.stageId || null;
    const stageName = stageId ? (stageMap.get(stageId) || null) : null;
    const qty = parseFloat(item.quantity || "0");

    if (item.type === 'composition' && item.compositionId) {
      // Expande a composição (recursivamente, quando houver composições
      // auxiliares com receita cadastrada) em materiais base.
      const expanded: ExpandedMaterial[] = [];
      await expandCompositionMaterials(database, item.compositionId, qty, compositionsByCode, 0, new Set(), expanded);

      // Agrega por insumo — o mesmo material pode aparecer em mais de um
      // ramo da árvore (ex: cimento usado direto na composição E dentro da
      // argamassa expandida), então soma tudo numa linha só antes de gravar.
      const aggMap = new Map<string, ExpandedMaterial & { quantity: number }>();
      for (const m of expanded) {
        const key = m.inputId ? `input_${m.inputId}` : `desc_${m.description}_${m.unit}`;
        if (!aggMap.has(key)) {
          aggMap.set(key, { ...m, quantity: 0 });
        }
        aggMap.get(key)!.quantity += m.quantity;
      }

      for (const m of Array.from(aggMap.values())) {
        const totalCost = m.quantity * m.unitCost;
        itemsToInsert.push({
          materialListId,
          budgetId,
          stageId,
          stageName,
          inputId: m.inputId,
          sinapiCode: m.sinapiCode,
          description: m.description,
          unit: m.unit,
          quantity: m.quantity.toFixed(4),
          unitCost: m.unitCost.toFixed(2),
          totalCost: totalCost.toFixed(2),
          itemType: "input",
          order: orderCounter++,
        });
      }
    } else if (item.type === 'service') {
      // Serviço a preço informado — linha genérica com materialCost
      const matCost = parseFloat(item.materialCost || "0");
      if (matCost <= 0) continue; // Sem custo de material, não inclui

      const totalCost = qty * matCost;
      itemsToInsert.push({
        materialListId,
        budgetId,
        stageId,
        stageName,
        inputId: null,
        sinapiCode: null,
        description: item.description,
        unit: item.unit,
        quantity: qty.toFixed(4),
        unitCost: matCost.toFixed(2),
        totalCost: totalCost.toFixed(2),
        itemType: "service",
        order: orderCounter++,
      });
    }
  }

  return itemsToInsert;
}

export const materialListsRouter = router({
  // Listar todas as listas do usuário
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) return [];
    const lists = await database
      .select({
        id: materialLists.id,
        name: materialLists.name,
        description: materialLists.description,
        createdAt: materialLists.createdAt,
        updatedAt: materialLists.updatedAt,
      })
      .from(materialLists)
      .where(eq(materialLists.userId, ctx.user.id))
      .orderBy(materialLists.createdAt);

    // Para cada lista, buscar os orçamentos vinculados
    const result = [];
    for (const list of lists) {
      const linkedBudgets = await database
        .select({
          budgetId: materialListBudgets.budgetId,
          budgetTitle: budgets.title,
          order: materialListBudgets.order,
        })
        .from(materialListBudgets)
        .innerJoin(budgets, eq(materialListBudgets.budgetId, budgets.id))
        .where(eq(materialListBudgets.materialListId, list.id))
        .orderBy(materialListBudgets.order);

      // Contar itens
      const { sql: sqlFn } = await import("drizzle-orm");
      const countResult = await database
        .select({ count: sqlFn<number>`COUNT(*)` })
        .from(materialListItems)
        .where(eq(materialListItems.materialListId, list.id));

      result.push({
        ...list,
        budgets: linkedBudgets,
        itemCount: Number(countResult[0]?.count || 0),
      });
    }
    return result;
  }),

  // Buscar uma lista com todos os seus itens
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) return null;

      const list = await database
        .select()
        .from(materialLists)
        .where(and(eq(materialLists.id, input.id), eq(materialLists.userId, ctx.user.id)))
        .limit(1);

      if (!list[0]) return null;

      const linkedBudgets = await database
        .select({
          budgetId: materialListBudgets.budgetId,
          budgetTitle: budgets.title,
          order: materialListBudgets.order,
        })
        .from(materialListBudgets)
        .innerJoin(budgets, eq(materialListBudgets.budgetId, budgets.id))
        .where(eq(materialListBudgets.materialListId, input.id))
        .orderBy(materialListBudgets.order);

      const items = await database
        .select()
        .from(materialListItems)
        .where(eq(materialListItems.materialListId, input.id))
        .orderBy(materialListItems.budgetId, materialListItems.stageId, materialListItems.order);

      return {
        ...list[0],
        budgets: linkedBudgets,
        items,
      };
    }),

  // Criar nova lista e gerar itens automaticamente
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      budgetIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verificar que os orçamentos pertencem ao usuário
      const userBudgets = await database
        .select({ id: budgets.id })
        .from(budgets)
        .where(and(eq(budgets.userId, ctx.user.id), inArray(budgets.id, input.budgetIds)));

      if (userBudgets.length !== input.budgetIds.length) {
        throw new Error("Um ou mais orçamentos não encontrados");
      }

      // Criar a lista
      const [newList] = await database.insert(materialLists).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
      });
      const listId = (newList as any).insertId;

      // Vincular orçamentos
      for (let i = 0; i < input.budgetIds.length; i++) {
        await database.insert(materialListBudgets).values({
          materialListId: listId,
          budgetId: input.budgetIds[i],
          order: i,
        });
      }

      // Gerar itens para cada orçamento
      for (const budgetId of input.budgetIds) {
        const items = await extractMaterialsFromBudget(database, budgetId, listId, ctx.user.id);
        if (items.length > 0) {
          for (const item of items) {
            await database.insert(materialListItems).values(item);
          }
        }
      }

      return { id: listId };
    }),

  // Regenerar itens de um orçamento específico (reprocessa do zero)
  regenerate: protectedProcedure
    .input(z.object({
      materialListId: z.number(),
      budgetId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verificar propriedade
      const list = await database
        .select({ id: materialLists.id })
        .from(materialLists)
        .where(and(eq(materialLists.id, input.materialListId), eq(materialLists.userId, ctx.user.id)))
        .limit(1);
      if (!list[0]) throw new Error("Lista não encontrada");

      // Deletar itens existentes deste orçamento
      await database
        .delete(materialListItems)
        .where(and(
          eq(materialListItems.materialListId, input.materialListId),
          eq(materialListItems.budgetId, input.budgetId)
        ));

      // Regenerar
      const items = await extractMaterialsFromBudget(database, input.budgetId, input.materialListId, ctx.user.id);
      if (items.length > 0) {
        for (const item of items) {
          await database.insert(materialListItems).values(item);
        }
      }

      return { count: items.length };
    }),

  // Atualizar um item manualmente
  updateItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      unit: z.string().optional(),
      quantity: z.number().optional(),
      unitCost: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verificar propriedade via join
      const item = await database
        .select({ id: materialListItems.id, quantity: materialListItems.quantity, unitCost: materialListItems.unitCost, materialListId: materialListItems.materialListId })
        .from(materialListItems)
        .innerJoin(materialLists, eq(materialListItems.materialListId, materialLists.id))
        .where(and(eq(materialListItems.id, input.id), eq(materialLists.userId, ctx.user.id)))
        .limit(1);

      if (!item[0]) throw new Error("Item não encontrado");

      const newQty = input.quantity !== undefined ? input.quantity : parseFloat(item[0].quantity || "0");
      const newUnitCost = input.unitCost !== undefined ? input.unitCost : parseFloat(item[0].unitCost || "0");
      const newTotalCost = newQty * newUnitCost;

      const updateData: any = { totalCost: newTotalCost.toFixed(2) };
      if (input.description !== undefined) updateData.description = input.description;
      if (input.unit !== undefined) updateData.unit = input.unit;
      if (input.quantity !== undefined) updateData.quantity = newQty.toFixed(4);
      if (input.unitCost !== undefined) updateData.unitCost = newUnitCost.toFixed(2);

      await database.update(materialListItems).set(updateData).where(eq(materialListItems.id, input.id));
      return { success: true };
    }),

  // Deletar um item
  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      await database
        .delete(materialListItems)
        .where(eq(materialListItems.id, input.id));

      return { success: true };
    }),

  // Deletar uma lista inteira
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const list = await database
        .select({ id: materialLists.id })
        .from(materialLists)
        .where(and(eq(materialLists.id, input.id), eq(materialLists.userId, ctx.user.id)))
        .limit(1);
      if (!list[0]) throw new Error("Lista não encontrada");

      await database.delete(materialLists).where(eq(materialLists.id, input.id));
      return { success: true };
    }),

  // Adicionar item manual
  addManualItem: protectedProcedure
    .input(z.object({
      materialListId: z.number(),
      budgetId: z.number().optional(),
      stageName: z.string().optional(),
      description: z.string().min(1),
      unit: z.string().min(1),
      quantity: z.number().min(0),
      unitCost: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verificar propriedade
      const list = await database
        .select({ id: materialLists.id })
        .from(materialLists)
        .where(and(eq(materialLists.id, input.materialListId), eq(materialLists.userId, ctx.user.id)))
        .limit(1);
      if (!list[0]) throw new Error("Lista não encontrada");

      // Buscar maior order atual
      const { sql: sqlFn } = await import("drizzle-orm");
      const maxOrderResult = await database
        .select({ maxOrder: sqlFn<number>`MAX(\`order\`)` })
        .from(materialListItems)
        .where(eq(materialListItems.materialListId, input.materialListId));
      const nextOrder = Number(maxOrderResult[0]?.maxOrder || 0) + 1;

      const totalCost = input.quantity * input.unitCost;
      await database.insert(materialListItems).values({
        materialListId: input.materialListId,
        budgetId: input.budgetId || null,
        stageId: null,
        stageName: input.stageName || null,
        inputId: null,
        sinapiCode: null,
        description: input.description,
        unit: input.unit,
        quantity: input.quantity.toFixed(4),
        unitCost: input.unitCost.toFixed(2),
        totalCost: totalCost.toFixed(2),
        itemType: "manual",
        order: nextOrder,
      });

      return { success: true };
    }),

  // Renomear uma lista
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;

      await database
        .update(materialLists)
        .set(updateData)
        .where(and(eq(materialLists.id, input.id), eq(materialLists.userId, ctx.user.id)));

      return { success: true };
    }),
});
