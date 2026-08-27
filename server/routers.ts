import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import * as db from "./db";
import { additivesRouter } from "./routers/additives";
import { materialListsRouter } from "./routers/materialLists";
import { cubScRouter } from "./routers/cubSc";
import { materialMergeRulesRouter } from "./routers/materialMergeRules";
import { 
  inputs, compositions, compositionInputs, projects, budgets, budgetItems, budgetItemInputs,
  budgetStages, scheduleActivities, schedulePeriods, disbursements, categories, clients, companySettings,
  budgetItemBdiConfig, budgetSchedulePeriods, budgetScheduleItems, budgetMonthlyDistribution,
  measurementPeriods, measurementItems, contractAdditives
} from "../drizzle/schema";
import { eq, and, sql, isNotNull, isNull, inArray } from "drizzle-orm";
// Exportação movida para frontend (jsPDF + xlsx)

export const appRouter = router({
  system: systemRouter,
  additives: additivesRouter,
  materialLists: materialListsRouter,
  cubSc: cubScRouter,
  materialMergeRules: materialMergeRulesRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Inputs (Insumos)
  inputs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getInputsByUserId(ctx.user.id);
    }),
    
    search: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.searchInputs(ctx.user.id, input?.search);
      }),
    
    create: protectedProcedure
      .input(z.object({
        code: z.string().optional(),
        description: z.string().min(1),
        type: z.enum(["material", "labor", "equipment"]),
        unit: z.string().min(1),
        unitCost: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const [result] = await database.insert(inputs).values({
          userId: ctx.user.id,
          ...input,
          description: input.description.toUpperCase(),
        });
        return { id: Number(result.insertId) };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().optional(),
        description: z.string().min(1),
        type: z.enum(["material", "labor", "equipment"]),
        unit: z.string().min(1),
        unitCost: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.update(inputs)
          .set({ ...input, description: input.description.toUpperCase() })
          .where(and(eq(inputs.id, input.id), eq(inputs.userId, ctx.user.id)));
        return { success: true };
      }),
    
    updateUnitCost: protectedProcedure
      .input(z.object({
        id: z.number(),
        unitCost: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.update(inputs)
          .set({ unitCost: input.unitCost })
          .where(and(eq(inputs.id, input.id), eq(inputs.userId, ctx.user.id)));
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(inputs)
          .where(and(eq(inputs.id, input.id), eq(inputs.userId, ctx.user.id)));
        return { success: true };
      }),
    
    // Atualizar insumo temporariamente (só no orçamento)
    updateTemporary: protectedProcedure
      .input(z.object({
        budgetItemId: z.number(),
        inputId: z.number(),
        coefficient: z.string(),
        unitCost: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se já existe customização
        const existing = await database
          .select()
          .from(budgetItemInputs)
          .where(
            and(
              eq(budgetItemInputs.budgetItemId, input.budgetItemId),
              eq(budgetItemInputs.inputId, input.inputId)
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          // Atualizar existente
          await database.update(budgetItemInputs)
            .set({
              coefficient: input.coefficient,
              unitCost: input.unitCost,
            })
            .where(eq(budgetItemInputs.id, existing[0].id));
        } else {
          // Criar novo
          await database.insert(budgetItemInputs).values({
            budgetItemId: input.budgetItemId,
            inputId: input.inputId,
            coefficient: input.coefficient,
            unitCost: input.unitCost,
          });
        }
        
        return { success: true };
      }),
    
    // Atualizar insumo permanentemente (na base)
    updatePermanent: protectedProcedure
      .input(z.object({
        inputId: z.number(),
        compositionId: z.number(),
        unitCost: z.string(),
        coefficient: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Atualizar custo unitário do insumo na tabela inputs
        await database.update(inputs)
          .set({ unitCost: input.unitCost })
          .where(and(eq(inputs.id, input.inputId), eq(inputs.userId, ctx.user.id)));
        
        // Se coeficiente foi fornecido, atualizar na tabela composition_inputs
        if (input.coefficient !== undefined && input.coefficient !== "") {
          await database.update(compositionInputs)
            .set({ coefficient: input.coefficient })
            .where(
              and(
                eq(compositionInputs.compositionId, input.compositionId),
                eq(compositionInputs.inputId, input.inputId)
              )
            );
        }
        
        // Recalcular custos da composição após atualização
        await db.recalculateCompositionCosts(input.compositionId);
        
        return { success: true };
      }),
  }),

  // Compositions
  compositions: router({
    generateCode: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar categoria
        const [category] = await database.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
        
        if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada" });
        
        // Gerar prefixo: se code tiver 3 ou menos caracteres, usar completo; senão, pegar 3 primeiras letras
        const prefix = category.code.length <= 3 
          ? category.code.toUpperCase()
          : category.code.substring(0, 3).toUpperCase();
        
        // Buscar maior sequencial para este prefixo
        const existingCompositions = await database.select().from(compositions)
          .where(and(
            eq(compositions.userId, ctx.user.id),
            eq(compositions.categoryId, input.categoryId)
          ))
          .orderBy(sql`${compositions.id} DESC`);
        
        // Encontrar maior número sequencial
        let maxSequential = 0;
        for (const comp of existingCompositions) {
          if (comp.code) {
            const match = comp.code.match(/-([0-9]+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxSequential) maxSequential = num;
            }
          }
        }
        
        const nextSequential = (maxSequential + 1).toString().padStart(3, '0');
        const generatedCode = `${prefix}-${nextSequential}`;
        
        return { code: generatedCode };
      }),
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.getCompositionsByUserId(ctx.user.id, input?.search);
      }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const composition = await db.getCompositionById(input.id, ctx.user.id);
        if (!composition) throw new Error("Composition not found");
        
        const compositionInputsList = await db.getCompositionInputs(input.id);
        return { ...composition, inputs: compositionInputsList };
      }),
    
    getWithInputs: protectedProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ ctx, input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) throw new Error("Database not available");
        
        const [composition] = await dbInstance
          .select()
          .from(compositions)
          .where(and(
            eq(compositions.code, input.code),
            eq(compositions.userId, ctx.user.id)
          ))
          .limit(1);
        
        if (!composition) throw new Error("Composition not found");
        
        const compositionInputsList = await db.getCompositionInputs(composition.id);
        return { ...composition, inputs: compositionInputsList };
      }),
    
    // Buscar insumos de uma composição com valores customizados (se houver)
    getInputsWithCustomValues: protectedProcedure
      .input(z.object({ 
        compositionId: z.number(),
        budgetItemId: z.number().optional() // Se fornecido, busca valores customizados
      }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar insumos da composição
        const compositionInputsList = await db.getCompositionInputs(input.compositionId);
        
        // Se não tem budgetItemId, retorna valores padrão
        if (!input.budgetItemId) {
          return compositionInputsList;
        }
        
        // Buscar valores customizados do orçamento
        const customValues = await database
          .select()
          .from(budgetItemInputs)
          .where(eq(budgetItemInputs.budgetItemId, input.budgetItemId));
        
        // Mesclar valores customizados com valores padrão
        const customMap = new Map(customValues.map(cv => [cv.inputId, cv]));
        
        return compositionInputsList.map(inp => {
          const custom = customMap.get(inp.inputId);
          if (custom) {
            return {
              ...inp,
              coefficient: custom.coefficient,
              unitCost: custom.unitCost,
              isCustom: true,
            };
          }
          return { ...inp, isCustom: false };
        });
      }),
    
    create: protectedProcedure
      .input(z.object({
        code: z.string().optional(),
        categoryId: z.number().optional(),
        description: z.string().min(1),
        unit: z.string().min(1),
        materialCost: z.string().optional(),
        laborCost: z.string().optional(),
        laborHours: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const [result] = await database.insert(compositions).values({
          userId: ctx.user.id,
          materialCost: input.materialCost || "0",
          laborCost: input.laborCost || "0",
          laborHours: input.laborHours || "0",
          ...input,
          description: input.description.toUpperCase(),
        });
        return { id: Number(result.insertId) };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().optional(),
        categoryId: z.number().optional(),
        description: z.string().min(1),
        unit: z.string().min(1),
        materialCost: z.string().optional(),
        laborCost: z.string().optional(),
        laborHours: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.update(compositions)
          .set({ ...input, description: input.description.toUpperCase() })
          .where(and(eq(compositions.id, input.id), eq(compositions.userId, ctx.user.id)));
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(compositions)
          .where(and(eq(compositions.id, input.id), eq(compositions.userId, ctx.user.id)));
        return { success: true };
      }),
    
    addInput: protectedProcedure
      .input(z.object({
        compositionId: z.number(),
        inputId: z.number(),
        quantity: z.string(),
        coefficient: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const composition = await db.getCompositionById(input.compositionId, ctx.user.id);
        if (!composition) throw new Error("Composition not found");
        
        const [result] = await database.insert(compositionInputs).values(input);
        
        // Recalcular custos da composição
        await db.recalculateCompositionCosts(input.compositionId);
        
        return { id: Number(result.insertId) };
      }),
    
    removeInput: protectedProcedure
      .input(z.object({ 
        id: z.number(),
        compositionId: z.number()
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(compositionInputs).where(eq(compositionInputs.id, input.id));
        
        // Recalcular custos da composição
        await db.recalculateCompositionCosts(input.compositionId);
        
        return { success: true };
      }),
    
    updateInputCoefficient: protectedProcedure
      .input(z.object({
        compositionInputId: z.number(),
        compositionId: z.number(),
        coefficient: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.update(compositionInputs)
          .set({ coefficient: input.coefficient })
          .where(eq(compositionInputs.id, input.compositionInputId));
        
        // Recalcular custos da composição
        await db.recalculateCompositionCosts(input.compositionId);
        
        return { success: true };
      }),
    
    updateCompositionInputs: protectedProcedure
      .input(z.object({
        compositionId: z.number(),
        budgetItemId: z.number().optional(),
        inputs: z.array(z.object({
          inputId: z.number(),
          coefficient: z.number(),
          unitCost: z.number(),
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se composição pertence ao usuário
        const composition = await db.getCompositionById(input.compositionId, ctx.user.id);
        if (!composition) throw new Error("Composition not found");
        
        // Atualizar coeficientes na tabela composition_inputs (base global)
        for (const inp of input.inputs) {
          // Buscar o composition_input correspondente
          const [compInput] = await database
            .select()
            .from(compositionInputs)
            .where(and(
              eq(compositionInputs.compositionId, input.compositionId),
              eq(compositionInputs.inputId, inp.inputId)
            ))
            .limit(1);
          
          if (compInput) {
            // Atualizar coeficiente na base global
            await database.update(compositionInputs)
              .set({ coefficient: inp.coefficient.toString() })
              .where(eq(compositionInputs.id, compInput.id));
          }
          
          // Atualizar custo unitário na tabela inputs (base global)
          await database.update(inputs)
            .set({ unitCost: inp.unitCost.toString() })
            .where(eq(inputs.id, inp.inputId));
          
          // Se budgetItemId fornecido, sincronizar budget_item_inputs com novos valores
          // Isso garante que o orçamento atual também reflita os novos valores
          if (input.budgetItemId) {
            const [existingCustom] = await database
              .select()
              .from(budgetItemInputs)
              .where(and(
                eq(budgetItemInputs.budgetItemId, input.budgetItemId),
                eq(budgetItemInputs.inputId, inp.inputId)
              ))
              .limit(1);
            
            if (existingCustom) {
              // Atualizar customização existente com novos valores da base
              await database.update(budgetItemInputs)
                .set({ 
                  coefficient: inp.coefficient.toString(),
                  unitCost: inp.unitCost.toString()
                })
                .where(and(
                  eq(budgetItemInputs.budgetItemId, input.budgetItemId),
                  eq(budgetItemInputs.inputId, inp.inputId)
                ));
            }
          }
        }
        
        // Recalcular custos da composição
        await db.recalculateCompositionCosts(input.compositionId);
        
        return { success: true };
      }),
    
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar composição original
        const original = await db.getCompositionById(input.id, ctx.user.id);
        if (!original) throw new Error("Composition not found");
        
        // Criar nova composição com sufixo " (Cópia)"
        const [result] = await database.insert(compositions).values({
          userId: ctx.user.id,
          code: original.code ? `${original.code}-COPIA` : undefined,
          categoryId: original.categoryId,
          description: `${original.description} (Cópia)`,
          unit: original.unit,
          materialCost: original.materialCost,
          laborCost: original.laborCost,
          equipmentCost: original.equipmentCost,
          laborHours: original.laborHours,
          notes: original.notes,
        });
        
        const newCompositionId = Number(result.insertId);
        
        // Copiar todos os insumos
        const originalInputs = await db.getCompositionInputs(input.id);
        for (const inp of originalInputs) {
          await database.insert(compositionInputs).values({
            compositionId: newCompositionId,
            inputId: inp.inputId,
            quantity: inp.quantity,
            coefficient: inp.coefficient,
          });
        }
        
        return { id: newCompositionId };
      }),
  }),

  // Projects
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getProjectsByUserId(ctx.user.id);
    }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getProjectById(input.id, ctx.user.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        client: z.string().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const [result] = await database.insert(projects).values({
          userId: ctx.user.id,
          ...input,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        });
        return { id: Number(result.insertId) };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        client: z.string().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.update(projects)
          .set({
            ...input,
            startDate: input.startDate ? new Date(input.startDate) : undefined,
            endDate: input.endDate ? new Date(input.endDate) : undefined,
          })
          .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(projects)
          .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // Budgets
  budgets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getBudgetsByUserId(ctx.user.id);
    }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const budget = await db.getBudgetById(input.id, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const items = await db.getBudgetItems(input.id);
        return { ...budget, items };
      }),
    
    create: protectedProcedure
      .input(z.object({
        clientId: z.number().optional(),
        projectId: z.number().optional(),
        title: z.string().min(1),
        squareMeters: z.string().optional(),
        description: z.string().optional(),
        observations: z.string().optional(),
        socialCharges: z.string().optional(),
        adminCentral: z.string().optional(),
        profit: z.string().optional(),
        taxes: z.string().optional(),
        risk: z.string().optional(),
        warranty: z.string().optional(),
        totalCost: z.string().optional(),
        totalLaborHours: z.string().optional(),
        status: z.enum(["draft", "sent", "approved", "rejected"]).optional(),
        items: z.array(z.object({
          compositionId: z.number(),
          quantity: z.string(),
          unitPrice: z.string(),
          totalPrice: z.string(),
          laborHours: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const { items, ...budgetData } = input;
        
        // Gerar código automático (ORC-YYYY-NNN)
        const currentYear = new Date().getFullYear();
        const lastBudget = await database
          .select({ code: budgets.code })
          .from(budgets)
          .where(sql`${budgets.code} LIKE ${`ORC-${currentYear}-%`}`)
          .orderBy(sql`${budgets.code} DESC`)
          .limit(1);
        
        let nextNumber = 1;
        if (lastBudget.length > 0 && lastBudget[0].code) {
          const match = lastBudget[0].code.match(/ORC-\d{4}-(\d+)/);
          if (match) {
            nextNumber = parseInt(match[1]) + 1;
          }
        }
        
        const code = `ORC-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
        
        const [result] = await database.insert(budgets).values({
          userId: ctx.user.id,
          code,
          ...budgetData,
        });
        
        const budgetId = Number(result.insertId);
        
        // Inserir itens se fornecidos
        if (items && items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // Buscar composição para pegar descrição e unidade
            const composition = await db.getCompositionById(item.compositionId, ctx.user.id);
            if (composition) {
              await database.insert(budgetItems).values({
                budgetId,
                compositionId: item.compositionId,
                description: composition.description,
                unit: composition.unit,
                quantity: item.quantity,
                materialCost: composition.materialCost,
                laborCost: composition.laborCost,
                unitCost: item.unitPrice,
                totalCost: item.totalPrice,
                laborHours: composition.laborHours,
                totalLaborHours: item.laborHours,
                order: i,
              });
            }
          }
        }
        
        return { id: budgetId };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        clientId: z.number().optional().nullable(),
        projectId: z.number().optional().nullable(),
        title: z.string().min(1),
        squareMeters: z.string().optional(),
        description: z.string().optional(),
        observations: z.string().optional(),
        socialCharges: z.string().optional(),
        adminCentral: z.string().optional(),
        profit: z.string().optional(),
        taxes: z.string().optional(),
        risk: z.string().optional(),
        warranty: z.string().optional(),
        totalCost: z.string().optional(),
        totalLaborHours: z.string().optional(),
        status: z.enum(["draft", "sent", "approved", "rejected"]).optional(),
        workStatus: z.enum(['orcamento', 'contrato', 'execucao', 'finalizada', 'nao_fechada']).optional(),
        includeMaterial: z.boolean().optional(),
        items: z.array(z.object({
          compositionId: z.number(),
          quantity: z.string(),
          unitPrice: z.string(),
          totalPrice: z.string(),
          laborHours: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const { items, ...budgetData } = input;
        
        // Converter strings em números para campos numéricos
        const processedData: any = { ...budgetData };
        if (budgetData.squareMeters) processedData.squareMeters = parseFloat(budgetData.squareMeters);
        if (budgetData.socialCharges) processedData.socialCharges = parseFloat(budgetData.socialCharges);
        if (budgetData.adminCentral) processedData.adminCentral = parseFloat(budgetData.adminCentral);
        if (budgetData.profit) processedData.profit = parseFloat(budgetData.profit);
        if (budgetData.taxes) processedData.taxes = parseFloat(budgetData.taxes);
        if (budgetData.risk) processedData.risk = parseFloat(budgetData.risk);
        if (budgetData.warranty) processedData.warranty = parseFloat(budgetData.warranty);
        if (budgetData.totalCost) processedData.totalCost = parseFloat(budgetData.totalCost);
        if (budgetData.totalLaborHours) processedData.totalLaborHours = parseFloat(budgetData.totalLaborHours);
        if (budgetData.includeMaterial !== undefined) processedData.includeMaterial = budgetData.includeMaterial ? 1 : 0;
        
        // Remover workStatus do processedData (Drizzle não conhece essa coluna adicionada manualmente)
        const { workStatus: workStatusValue, ...drizzleData } = processedData;
        await database.update(budgets)
          .set(drizzleData)
          .where(and(eq(budgets.id, input.id), eq(budgets.userId, ctx.user.id)));
        
        // Salvar workStatus via rawQuery (coluna adicionada manualmente ao banco)
        if (workStatusValue) {
          await db.updateBudgetWorkStatus(input.id, ctx.user.id, workStatusValue);
        }
        
        // Atualizar itens se fornecidos
        if (items) {
          // Remover itens antigos
          await database.delete(budgetItems).where(eq(budgetItems.budgetId, input.id));
          
          // Inserir novos itens
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const composition = await db.getCompositionById(item.compositionId, ctx.user.id);
            if (composition) {
              await database.insert(budgetItems).values({
                budgetId: input.id,
                compositionId: item.compositionId,
                description: composition.description,
                unit: composition.unit,
                quantity: item.quantity,
                materialCost: composition.materialCost,
                laborCost: composition.laborCost,
                unitCost: item.unitPrice,
                totalCost: item.totalPrice,
                laborHours: composition.laborHours,
                totalLaborHours: item.laborHours,
                order: i,
              });
            }
          }
        }
        
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(budgets)
          .where(and(eq(budgets.id, input.id), eq(budgets.userId, ctx.user.id)));
        return { success: true };
      }),
    
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar orçamento original
        const originalBudget = await database
          .select()
          .from(budgets)
          .where(and(eq(budgets.id, input.id), eq(budgets.userId, ctx.user.id)))
          .limit(1);
        
        if (originalBudget.length === 0) {
          throw new Error("Orçamento não encontrado");
        }
        
        const budget = originalBudget[0];
        
        // Gerar novo código automático (ORC-YYYY-NNN)
        const currentYear = new Date().getFullYear();
        const lastBudget = await database
          .select({ code: budgets.code })
          .from(budgets)
          .where(sql`${budgets.code} LIKE ${`ORC-${currentYear}-%`}`)
          .orderBy(sql`${budgets.code} DESC`)
          .limit(1);
        
        let nextNumber = 1;
        if (lastBudget.length > 0 && lastBudget[0].code) {
          const match = lastBudget[0].code.match(/ORC-\d{4}-(\d+)/);
          if (match) {
            nextNumber = parseInt(match[1]) + 1;
          }
        }
        
        const code = `ORC-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
        
        // Criar novo orçamento
        const [result] = await database.insert(budgets).values({
          userId: ctx.user.id,
          code,
          clientId: budget.clientId,
          projectId: budget.projectId,
          title: `[CÓPIA] ${budget.title}`,
          squareMeters: budget.squareMeters,
          description: budget.description,
          observations: budget.observations,
          socialCharges: budget.socialCharges,
          profit: budget.profit,
          taxes: budget.taxes,
          risk: budget.risk,
          warranty: budget.warranty,
          totalCost: "0",
          totalLaborHours: "0",
          status: "draft",
        });
        
        const newBudgetId = Number(result.insertId);
        
        // Copiar etapas (budget_stages)
        const originalStages = await database
          .select()
          .from(budgetStages)
          .where(eq(budgetStages.budgetId, input.id))
          .orderBy(budgetStages.order);
        
        const stageIdMap = new Map<number, number>(); // oldId -> newId
        
        // Funcao recursiva para copiar etapas e sub-etapas em todos os niveis
        const copyStagesRecursive = async (parentStageId: number | null) => {
          const stagesToCopy = originalStages.filter(s => s.parentStageId === parentStageId);
          
          for (const stage of stagesToCopy) {
            const newParentId = parentStageId ? stageIdMap.get(parentStageId) : null;
            const [stageResult] = await database.insert(budgetStages).values({
              budgetId: newBudgetId,
              parentStageId: newParentId || null,
              name: stage.name,
              description: stage.description,
              order: stage.order,
            });
            const newStageId = Number(stageResult.insertId);
            stageIdMap.set(stage.id, newStageId);
            
            // Copiar sub-etapas recursivamente
            await copyStagesRecursive(stage.id);
          }
        };
        
        // Iniciar copia recursiva a partir das etapas raizes
        await copyStagesRecursive(null);
        
        // Copiar itens (budget_items)
        const originalItems = await database
          .select()
          .from(budgetItems)
          .where(eq(budgetItems.budgetId, input.id))
          .orderBy(budgetItems.order);
        
        for (const item of originalItems) {
          const newStageId = item.stageId ? stageIdMap.get(item.stageId) : null;
          
          const [itemResult] = await database.insert(budgetItems).values({
            budgetId: newBudgetId,
            stageId: newStageId || null,
            type: item.type,
            compositionId: item.compositionId,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            materialCost: item.materialCost,
            laborCost: item.laborCost,
            equipmentCost: item.equipmentCost,
            serviceCost: item.serviceCost,
            otherCost: item.otherCost,
            unitCost: item.unitCost,
            totalCost: item.totalCost,
            laborHours: item.laborHours,
            totalLaborHours: item.totalLaborHours,
            order: item.order,
          });
          
          // Copiar insumos customizados (budget_item_inputs)
          const customInputs = await database
            .select()
            .from(budgetItemInputs)
            .where(eq(budgetItemInputs.budgetItemId, item.id));
          
          for (const customInput of customInputs) {
            await database.insert(budgetItemInputs).values({
              budgetItemId: Number(itemResult.insertId),
              inputId: customInput.inputId,
              coefficient: customInput.coefficient,
              unitCost: customInput.unitCost,
            });
          }
        }
        
        // Recalcular totais do novo orçamento (os custos unitários já foram
        // copiados 1:1 dos itens originais, não precisa recalcular de novo)
        await db.recalculateBudgetTotals(newBudgetId, { skipItemCostRecalc: true });
        
        return { id: newBudgetId, code };
      }),
    
    moveToClient: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        clientId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se orçamento existe e pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Orçamento não encontrado");
        
        // Verificar se cliente existe e pertence ao usuário
        const client = await database
          .select()
          .from(clients)
          .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id)))
          .limit(1);
        
        if (client.length === 0) {
          throw new Error("Cliente não encontrado");
        }
        
        // Atualizar clientId do orçamento
        await database.update(budgets)
          .set({ clientId: input.clientId })
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)));
        
        return { success: true };
      }),
    
    addItem: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        compositionId: z.number().optional(),
        description: z.string().min(1),
        unit: z.string().min(1),
        quantity: z.string(),
        unitCost: z.string(),
        laborHours: z.string().optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const quantity = parseFloat(input.quantity);
        const unitCost = parseFloat(input.unitCost);
        const laborHours = parseFloat(input.laborHours || "0");
        const totalCost = quantity * unitCost;
        const totalLaborHours = quantity * laborHours;
        
        const [result] = await database.insert(budgetItems).values({
          ...input,
          laborHours: laborHours.toFixed(3),
          totalCost: totalCost.toFixed(2),
          totalLaborHours: totalLaborHours.toFixed(2),
          order: input.order || 0,
        });

        // unitCost/totalCost já vieram prontos do cliente para este item.
        await db.recalculateBudgetTotals(input.budgetId, { skipItemCostRecalc: true });
        return { id: Number(result.insertId) };
      }),
    
    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().min(1),
        unit: z.string().min(1),
        quantity: z.string(),
        unitCost: z.string(),
        laborHours: z.string().optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const quantity = parseFloat(input.quantity);
        const unitCost = parseFloat(input.unitCost);
        const laborHours = parseFloat(input.laborHours || "0");
        const totalCost = quantity * unitCost;
        const totalLaborHours = quantity * laborHours;
        
        const item = await database.select().from(budgetItems).where(eq(budgetItems.id, input.id)).limit(1);
        if (!item[0]) throw new Error("Item not found");
        
        await database.update(budgetItems)
          .set({
            ...input,
            laborHours: laborHours.toFixed(3),
            totalCost: totalCost.toFixed(2),
            totalLaborHours: totalLaborHours.toFixed(2),
          })
          .where(eq(budgetItems.id, input.id));

        // unitCost já veio pronto do cliente para este item.
        await db.recalculateBudgetTotals(item[0].budgetId, { skipItemCostRecalc: true });
        return { success: true };
      }),
    
    updateItemQuantity: protectedProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.string(),
        materialCost: z.string().optional(),
        laborCost: z.string().optional(),
        equipmentCost: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const item = await database.select().from(budgetItems).where(eq(budgetItems.id, input.id)).limit(1);
        if (!item[0]) throw new Error("Item not found");
        
        const quantity = parseFloat(input.quantity);
        // Usar valores fornecidos ou manter os valores existentes
        const materialCost = input.materialCost !== undefined ? parseFloat(input.materialCost) : parseFloat(item[0].materialCost || "0");
        const laborCost = input.laborCost !== undefined ? parseFloat(input.laborCost) : parseFloat(item[0].laborCost || "0");
        const equipmentCost = input.equipmentCost !== undefined ? parseFloat(input.equipmentCost) : parseFloat(item[0].equipmentCost || "0");
        const totalCost = quantity * (materialCost + laborCost + equipmentCost);
        
        await database.update(budgetItems)
          .set({
            quantity: input.quantity,
            materialCost: materialCost.toFixed(2),
            laborCost: laborCost.toFixed(2),
            equipmentCost: equipmentCost.toFixed(2),
            totalCost: totalCost.toFixed(2),
          })
          .where(eq(budgetItems.id, input.id));

        // Só a quantidade (e, no máximo, custos já prontos vindos do
        // cliente) mudou aqui — o custo unitário dos outros itens do
        // orçamento não é afetado, então pula o recálculo pesado de cada
        // item de composição (evita percorrer o orçamento inteiro a cada
        // edição de quantidade, que deixava essa tela lenta).
        await db.recalculateBudgetTotals(item[0].budgetId, { skipItemCostRecalc: true });
        return { success: true };
      }),

    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const item = await database.select().from(budgetItems).where(eq(budgetItems.id, input.id)).limit(1);
        if (!item[0]) throw new Error("Item not found");
        
        await database.delete(budgetItems).where(eq(budgetItems.id, input.id));
        // Excluir um item não muda o custo unitário dos demais.
        await db.recalculateBudgetTotals(item[0].budgetId, { skipItemCostRecalc: true });
        return { success: true };
      }),
    
    // Salvar alteração temporária de insumo (só neste orçamento)
    saveInputTemporary: protectedProcedure
      .input(z.object({
        budgetItemId: z.number(),
        inputId: z.number(),
        coefficient: z.string(),
        unitCost: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se já existe customização para este insumo
        const existing = await database
          .select()
          .from(budgetItemInputs)
          .where(
            and(
              eq(budgetItemInputs.budgetItemId, input.budgetItemId),
              eq(budgetItemInputs.inputId, input.inputId)
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          // Atualizar existente
          await database
            .update(budgetItemInputs)
            .set({
              coefficient: input.coefficient,
              unitCost: input.unitCost,
            })
            .where(eq(budgetItemInputs.id, existing[0].id));
        } else {
          // Criar novo
          await database.insert(budgetItemInputs).values({
            budgetItemId: input.budgetItemId,
            inputId: input.inputId,
            coefficient: input.coefficient,
            unitCost: input.unitCost,
          });
        }
        
        // Recalcular custos do item do orçamento
        const budgetItem = await database.select().from(budgetItems).where(eq(budgetItems.id, input.budgetItemId)).limit(1);
        if (budgetItem[0]) {
          // Primeiro recalcular o totalCost do item baseado nos insumos customizados
          await db.recalculateItemTotalCost(input.budgetItemId);
          // Depois recalcular só os totais da cascata (etapa -> geral) — o
          // custo unitário já foi recalculado acima, não precisa repetir
          // para todos os outros itens do orçamento.
          await db.recalculateBudgetTotals(budgetItem[0].budgetId, { skipItemCostRecalc: true });
        }
        
        return { success: true };
      }),
    
    recalculateCompositionForBudget: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await database.select().from(budgets).where(eq(budgets.id, input.budgetId)).limit(1);
        if (!budget[0] || budget[0].userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        await db.recalculateBudgetTotals(input.budgetId);
        return { success: true };
      }),
    
    // Salvar alteração permanente (atualizar insumo na base)
    saveInputPermanent: protectedProcedure
      .input(z.object({
        inputId: z.number(),
        compositionId: z.number(),
        coefficient: z.string(),
        unitCost: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Atualizar custo unitário do insumo
        await database
          .update(inputs)
          .set({ unitCost: input.unitCost })
          .where(and(eq(inputs.id, input.inputId), eq(inputs.userId, ctx.user.id)));
        
        // Atualizar coeficiente na composição
        await database
          .update(compositionInputs)
          .set({ coefficient: input.coefficient })
          .where(
            and(
              eq(compositionInputs.compositionId, input.compositionId),
              eq(compositionInputs.inputId, input.inputId)
            )
          );
        
        // Recalcular custos da composição
        await db.recalculateCompositionCosts(input.compositionId);
        
        return { success: true };
      }),
    
    // Etapas do orçamento
    getStages: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");

        const stages = await database
          .select()
          .from(budgetStages)
          .where(eq(budgetStages.budgetId, input.budgetId))
          .orderBy(budgetStages.order, budgetStages.id);

        // Buscar TODOS os itens-raiz do orçamento numa única query (em vez
        // de uma consulta por etapa) — evita N idas ao banco sequenciais,
        // que era a maior causa de lentidão desta tela (chamada depois de
        // toda ação: adicionar composição, excluir item, editar
        // quantidade...).
        const allItems = await database
          .select({
            id: budgetItems.id,
            stageId: budgetItems.stageId,
            compositionId: budgetItems.compositionId,
            type: budgetItems.type,
            description: budgetItems.description,
            unit: budgetItems.unit,
            quantity: budgetItems.quantity,
            materialCost: budgetItems.materialCost,
            laborCost: budgetItems.laborCost,
            equipmentCost: budgetItems.equipmentCost,
            serviceCost: budgetItems.serviceCost,
            otherCost: budgetItems.otherCost,
            unitCost: budgetItems.unitCost,
            totalCost: budgetItems.totalCost,
            laborHours: budgetItems.laborHours,
            totalLaborHours: budgetItems.totalLaborHours,
            order: budgetItems.order,
            composition: {
              id: compositions.id,
              code: compositions.code,
              description: compositions.description,
              unit: compositions.unit,
              materialCost: compositions.materialCost,
              laborCost: compositions.laborCost,
              equipmentCost: compositions.equipmentCost,
            },
          })
          .from(budgetItems)
          .leftJoin(compositions, eq(budgetItems.compositionId, compositions.id))
          .where(and(eq(budgetItems.budgetId, input.budgetId), isNull(budgetItems.parentItemId)))
          .orderBy(budgetItems.order);

        // Buscar TODOS os filhos de itens compostos numa única query.
        const compositeItemIds = allItems.filter(item => item.type === 'composite').map(item => item.id);
        const allChildren = compositeItemIds.length > 0
          ? await database
              .select({
                id: budgetItems.id,
                stageId: budgetItems.stageId,
                compositionId: budgetItems.compositionId,
                type: budgetItems.type,
                description: budgetItems.description,
                unit: budgetItems.unit,
                quantity: budgetItems.quantity,
                materialCost: budgetItems.materialCost,
                laborCost: budgetItems.laborCost,
                equipmentCost: budgetItems.equipmentCost,
                serviceCost: budgetItems.serviceCost,
                otherCost: budgetItems.otherCost,
                unitCost: budgetItems.unitCost,
                totalCost: budgetItems.totalCost,
                parentItemId: budgetItems.parentItemId,
                order: budgetItems.order,
                composition: {
                  id: compositions.id,
                  code: compositions.code,
                  description: compositions.description,
                  unit: compositions.unit,
                  materialCost: compositions.materialCost,
                  laborCost: compositions.laborCost,
                  equipmentCost: compositions.equipmentCost,
                },
              })
              .from(budgetItems)
              .leftJoin(compositions, eq(budgetItems.compositionId, compositions.id))
              .where(inArray(budgetItems.parentItemId, compositeItemIds))
              .orderBy(budgetItems.order)
          : [];

        const childrenByParent = new Map<number, typeof allChildren>();
        for (const child of allChildren) {
          if (child.parentItemId === null) continue;
          const list = childrenByParent.get(child.parentItemId) || [];
          list.push(child);
          childrenByParent.set(child.parentItemId, list);
        }

        const itemsByStage = new Map<number, typeof allItems>();
        for (const item of allItems) {
          if (item.stageId === null) continue;
          const list = itemsByStage.get(item.stageId) || [];
          list.push(item);
          itemsByStage.set(item.stageId, list);
        }

        // Mesma matemática de BDI de antes (encargos só em MO, demais
        // parcelas do BDI em tudo), só que aplicada em memória sobre os
        // itens já buscados, em vez de fazer uma query nova por etapa.
        const encargos = parseFloat(budget.socialCharges || "0") / 100;
        const lucro = parseFloat(budget.profit || "0") / 100;
        const impostos = parseFloat(budget.taxes || "0") / 100;
        const risco = parseFloat(budget.risk || "0") / 100;
        const garantia = parseFloat(budget.warranty || "0") / 100;

        const itemTotalWithBdi = (item: {
          quantity: string | null;
          materialCost: string | null;
          laborCost: string | null;
          equipmentCost: string | null;
          serviceCost: string | null;
          otherCost: string | null;
        }) => {
          const qty = parseFloat(item.quantity || "0");
          const material = parseFloat(item.materialCost || "0");
          const labor = parseFloat(item.laborCost || "0");
          const equipment = parseFloat(item.equipmentCost || "0");
          const service = parseFloat(item.serviceCost || "0");
          const other = parseFloat(item.otherCost || "0");
          const laborWithEncargos = labor * (1 + encargos);
          const subtotal = material + laborWithEncargos + equipment + service + other;
          const totalWithAllBdi = subtotal * (1 + lucro) * (1 + impostos) * (1 + risco) * (1 + garantia);
          return totalWithAllBdi * qty;
        };

        // Total COM BDI de uma etapa, somando seus itens diretos — mesmo
        // comportamento de calculateStageTotalWithBdi original (só itens
        // diretos daquela etapa, sem descer recursivamente por várias
        // sub-etapas).
        const stageDirectTotalWithBdi = (stageId: number): number => {
          const items = itemsByStage.get(stageId) || [];
          return items.reduce((sum, item) => sum + itemTotalWithBdi(item), 0);
        };

        const stagesWithItems = stages.map((stage) => {
          const items = itemsByStage.get(stage.id) || [];
          const itemsWithChildren = items.map((item) =>
            item.type === 'composite'
              ? { ...item, children: childrenByParent.get(item.id) || [] }
              : item
          );

          // Verificar se esta etapa tem sub-etapas
          const subStages = stages.filter(s => s.parentStageId === stage.id);

          let totalWithBdi = 0;
          if (subStages.length > 0) {
            // Se tem sub-etapas, somar o total de todas as sub-etapas
            for (const subStage of subStages) {
              totalWithBdi += stageDirectTotalWithBdi(subStage.id);
            }
          } else {
            // Se não tem sub-etapas, calcular pelos itens da própria etapa
            totalWithBdi = stageDirectTotalWithBdi(stage.id);
          }

          return {
            ...stage,
            items: itemsWithChildren,
            totalWithBdi: totalWithBdi.toFixed(2),
          };
        });

        return stagesWithItems;
      }),
    
    createStage: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        parentStageId: z.number().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        serviceUnit: z.string().optional(),
        serviceQuantity: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Obter o maior order atual usando MAX() do SQL
        // IMPORTANTE: Buscar MAX(order) de TODAS as etapas do orçamento (sem filtrar por parentStageId)
        // para garantir que novas etapas sempre aparecem no final da lista
        const [maxOrderResult] = await database
          .select({ maxOrder: sql<number>`COALESCE(MAX(\`order\`), -1)` })
          .from(budgetStages)
          .where(eq(budgetStages.budgetId, input.budgetId));
        
        const maxOrder = maxOrderResult?.maxOrder ?? -1;
        
        const [result] = await database.insert(budgetStages).values({
          budgetId: input.budgetId,
          parentStageId: input.parentStageId || null,
          name: input.name,
          description: input.description || null,
          order: maxOrder + 1,
          serviceUnit: input.serviceUnit || null,
          serviceQuantity: input.serviceQuantity ? String(input.serviceQuantity) : null,
        });

        // Corrige a ordem de exibição imediatamente após criar — não depende
        // só do MAX(order) acima ter vindo correto (ver normalizeStageOrder).
        await db.normalizeStageOrder(input.budgetId);

        return { id: Number(result.insertId) };
      }),
    
    reorderStage: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        direction: z.enum(["up", "down"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");

        // Garante que scheduleOrder está populado/atualizado antes de ler —
        // essa ação SÓ mexe em scheduleOrder (ordem no Gantt), nunca em
        // `order` (número da etapa na planilha do orçamento).
        await db.normalizeStageOrder(input.budgetId);

        // Buscar a etapa atual para saber seu parentStageId
        const [currentStageRow] = await database
          .select()
          .from(budgetStages)
          .where(eq(budgetStages.id, input.stageId));
        if (!currentStageRow) throw new Error("Stage not found");

        // Buscar APENAS os irmãos (mesma etapa pai) ordenados por
        // scheduleOrder, id. Restringe a etapas COM data configurada — é
        // exatamente o mesmo filtro usado na tabela "Etapas Configuradas" de
        // onde essa ação é disparada. Sem essa restrição, o "irmão"
        // encontrado podia ser uma etapa sem data (invisível na tela),
        // fazendo o botão "trocar de lugar" com algo que o usuário nem vê —
        // parecendo que não fez nada.
        const siblingsFilter = currentStageRow.parentStageId
          ? and(
              eq(budgetStages.budgetId, input.budgetId),
              eq(budgetStages.parentStageId, currentStageRow.parentStageId),
              isNotNull(budgetStages.startDate),
              isNotNull(budgetStages.endDate)
            )
          : and(
              eq(budgetStages.budgetId, input.budgetId),
              isNull(budgetStages.parentStageId),
              isNotNull(budgetStages.startDate),
              isNotNull(budgetStages.endDate)
            );
        const siblings = await database
          .select()
          .from(budgetStages)
          .where(siblingsFilter)
          .orderBy(budgetStages.scheduleOrder, budgetStages.id);

        // Encontrar o índice da etapa atual entre os irmãos
        const currentIndex = siblings.findIndex(s => s.id === input.stageId);
        if (currentIndex === -1) throw new Error("Stage not found among siblings");

        // Determinar o irmão com o qual trocar
        const swapIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (swapIndex < 0 || swapIndex >= siblings.length) {
          return { success: true, message: "Already at boundary" };
        }

        // Renumerar scheduleOrder de todos os irmãos sequencialmente (0..N-1)
        // e então trocar os dois envolvidos — garante valores únicos mesmo
        // que scheduleOrder tenha ficado com empates.
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i].scheduleOrder !== i) {
            await database
              .update(budgetStages)
              .set({ scheduleOrder: i })
              .where(eq(budgetStages.id, siblings[i].id));
            siblings[i] = { ...siblings[i], scheduleOrder: i };
          }
        }

        const normalizedCurrent = siblings[currentIndex];
        const normalizedSwap = siblings[swapIndex];

        await database
          .update(budgetStages)
          .set({ scheduleOrder: normalizedSwap.scheduleOrder })
          .where(eq(budgetStages.id, normalizedCurrent.id));

        await database
          .update(budgetStages)
          .set({ scheduleOrder: normalizedCurrent.scheduleOrder })
          .where(eq(budgetStages.id, normalizedSwap.id));

        return { success: true };
      }),
    
    moveStageToPosition: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        targetPosition: z.number(), // Nova posição (0-based) DENTRO do grupo de irmãs (mesma etapa-mãe)
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");

        // Garante que scheduleOrder está populado/atualizado antes de ler —
        // essa ação SÓ mexe em scheduleOrder (ordem no Gantt), nunca em
        // `order` (número da etapa na planilha do orçamento).
        await db.normalizeStageOrder(input.budgetId);

        const [currentStageRow] = await database
          .select()
          .from(budgetStages)
          .where(eq(budgetStages.id, input.stageId));
        if (!currentStageRow) throw new Error("Stage not found");

        // Escopo = APENAS os irmãos (mesma etapa-mãe) com data configurada —
        // mesma lógica de reorderStage. "Posição" sempre foi tratada como um
        // índice na lista INTEIRA (etapas e sub-etapas de todo mundo
        // misturadas), ignorando a hierarquia — por isso mover uma etapa
        // raiz podia "enfiar" ela no meio das sub-etapas de outra etapa, e
        // uma renumeração posterior (criação de nova etapa, ou o botão
        // "Reorganizar Etapas") desfazia o resultado. Agora "Posição N" é
        // sempre relativa às próprias irmãs da etapa.
        const siblingsFilter = currentStageRow.parentStageId
          ? and(
              eq(budgetStages.budgetId, input.budgetId),
              eq(budgetStages.parentStageId, currentStageRow.parentStageId),
              isNotNull(budgetStages.startDate),
              isNotNull(budgetStages.endDate)
            )
          : and(
              eq(budgetStages.budgetId, input.budgetId),
              isNull(budgetStages.parentStageId),
              isNotNull(budgetStages.startDate),
              isNotNull(budgetStages.endDate)
            );
        const siblings = await database
          .select()
          .from(budgetStages)
          .where(siblingsFilter)
          .orderBy(budgetStages.scheduleOrder, budgetStages.id);

        // Encontrar a etapa atual entre as irmãs
        const currentIndex = siblings.findIndex(s => s.id === input.stageId);
        if (currentIndex === -1) throw new Error("Stage not found among siblings");

        // Validar targetPosition
        if (input.targetPosition < 0 || input.targetPosition >= siblings.length) {
          throw new Error("Invalid target position");
        }

        // Se já está na posição desejada, não fazer nada
        if (currentIndex === input.targetPosition) {
          return { success: true };
        }

        // Remover etapa da posição atual e inserir na nova posição, dentro do grupo de irmãs
        const [movedStage] = siblings.splice(currentIndex, 1);
        siblings.splice(input.targetPosition, 0, movedStage);

        // Grava o novo scheduleOrder das irmãs afetadas numa única query (CASE WHEN)
        const caseSql = siblings.map(() => `WHEN ? THEN ?`).join(' ');
        const caseParams: any[] = [];
        siblings.forEach((s, i) => caseParams.push(s.id, i));
        const ids = siblings.map((s) => s.id);
        const inSql = ids.map(() => '?').join(',');
        await db.rawQuery(
          `UPDATE budget_stages SET scheduleOrder = CASE id ${caseSql} END WHERE id IN (${inSql})`,
          [...caseParams, ...ids]
        );

        return { success: true };
      }),
    
    updateStage: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        startDate: z.string().optional(), // ISO date string
        endDate: z.string().optional(), // ISO date string
        duration: z.number().optional(),
        predecessors: z.string().optional(), // JSON string
        serviceUnit: z.string().optional(),
        serviceQuantity: z.number().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se a etapa existe e pertence a um orçamento do usuário
        const stage = await database.select().from(budgetStages).where(eq(budgetStages.id, input.id)).limit(1);
        if (!stage[0]) throw new Error("Stage not found");
        
        const budget = await db.getBudgetById(stage[0].budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        await database
          .update(budgetStages)
          .set({
            name: input.name,
            description: input.description || null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            endDate: input.endDate ? new Date(input.endDate) : null,
            duration: input.duration || null,
            predecessors: input.predecessors || null,
            serviceUnit: input.serviceUnit || null,
            serviceQuantity: input.serviceQuantity != null ? String(input.serviceQuantity) : null,
          })
          .where(eq(budgetStages.id, input.id));
        
        return { success: true };
      }),
    
    deleteStage: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se a etapa pertence a um orçamento do usuário
        const stage = await database.select().from(budgetStages).where(eq(budgetStages.id, input.id)).limit(1);
        if (!stage[0]) throw new Error("Stage not found");
        
        const budget = await db.getBudgetById(stage[0].budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Remover etapa (cascade removerá sub-etapas)
        await database.delete(budgetStages).where(eq(budgetStages.id, input.id));
        
        return { success: true };
      }),
    
    recalculateTotals: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Forçar recálculo de todos os totais
        await db.recalculateBudgetTotals(input.budgetId);
        
        return { success: true };
      }),
    
    reorderStages: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Atualizar order de cada etapa
        for (let i = 0; i < input.stageIds.length; i++) {
          await database
            .update(budgetStages)
            .set({ order: i })
            .where(eq(budgetStages.id, input.stageIds[i]));
        }
        
        return { success: true };
      }),
    
    // Adicionar item (composição) a uma etapa
    addItemToStage: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        compositionId: z.number(),
        quantity: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar composição
        const composition = await database
          .select()
          .from(compositions)
          .where(and(eq(compositions.id, input.compositionId), eq(compositions.userId, ctx.user.id)))
          .limit(1);
        
        if (!composition[0]) throw new Error("Composition not found");
        
        const comp = composition[0];
        const materialCost = parseFloat(comp.materialCost);
        const laborCost = parseFloat(comp.laborCost);
        const equipmentCost = parseFloat(comp.equipmentCost || "0");
        const unitCost = materialCost + laborCost + equipmentCost;
        const totalCost = unitCost * input.quantity;
        const laborHours = parseFloat(comp.laborHours);
        const totalLaborHours = laborHours * input.quantity;
        
        // Obter maior order atual
        const items = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(budgetItems.stageId, input.stageId)
          ));
        
        const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : -1;
        
        // Inserir item
        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: input.stageId,
          type: "composition",
          compositionId: input.compositionId,
          description: comp.description,
          unit: comp.unit,
          quantity: input.quantity.toString(),
          materialCost: materialCost.toFixed(2),
          laborCost: laborCost.toFixed(2),
          equipmentCost: equipmentCost.toFixed(2),
          unitCost: unitCost.toFixed(2),
          totalCost: totalCost.toFixed(2),
          laborHours: laborHours.toFixed(3),
          totalLaborHours: totalLaborHours.toFixed(2),
          order: maxOrder + 1,
        });
        
        return { id: Number(result.insertId) };
      }),
    
    // Adicionar serviço a preço informado
    addServiceItem: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        description: z.string(),
        unit: z.string(),
        quantity: z.number(),
        materialCost: z.number(),
        laborCost: z.number(),
        equipmentCost: z.number(),
        serviceCost: z.number(),
        otherCost: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Gerar código automático SPI0000001
        const existingServices = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(budgetItems.type, "service")
          ));
        
        const nextNumber = existingServices.length + 1;
        const code = `SPI${nextNumber.toString().padStart(7, '0')}`;
        
        // Calcular custos totais
        const unitCost = input.materialCost + input.laborCost + input.equipmentCost + input.serviceCost + input.otherCost;
        const totalCost = unitCost * input.quantity;
        
        // Obter maior order atual
        const items = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(budgetItems.stageId, input.stageId)
          ));
        
        const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : -1;
        
        // Inserir serviço
        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: input.stageId,
          type: "service",
          compositionId: null,
          description: `${code} - ${input.description}`,
          unit: input.unit,
          quantity: input.quantity.toString(),
          materialCost: input.materialCost.toFixed(2),
          laborCost: input.laborCost.toFixed(2),
          equipmentCost: input.equipmentCost.toFixed(2),
          serviceCost: input.serviceCost.toFixed(2),
          otherCost: input.otherCost.toFixed(2),
          unitCost: unitCost.toFixed(2),
          totalCost: totalCost.toFixed(2),
          laborHours: "0",
          totalLaborHours: "0",
          order: maxOrder + 1,
        });
        
        return { success: true, itemId: Number(result.insertId), code };
      }),

    // Adicionar insumo do banco SINAPI à etapa
    addInputItem: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        inputId: z.number(),
        quantity: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar dados do insumo
        const inputData = await db.getInputById(input.inputId, ctx.user.id);
        if (!inputData) throw new Error("Input not found");
        

        
        // Calcular custos baseado no tipo de insumo
        const unitCostValue = parseFloat(inputData.unitCost);
        const totalCost = unitCostValue * input.quantity;
        
        let materialCost = 0;
        let laborCost = 0;
        let equipmentCost = 0;
        
        if (inputData.type === "material") {
          materialCost = unitCostValue;
        } else if (inputData.type === "labor") {
          laborCost = unitCostValue;
        } else if (inputData.type === "equipment") {
          equipmentCost = unitCostValue;
        }
        
        // Obter maior order atual
        const items = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(budgetItems.stageId, input.stageId)
          ));
        
        const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : -1;
        
        // Inserir insumo como item do orçamento
        const description = `${inputData.code || ''} - ${inputData.description}`;

        
        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: input.stageId,
          type: "input",
          compositionId: null,
          description: description,
          unit: inputData.unit,
          quantity: input.quantity.toString(),
          materialCost: materialCost.toFixed(2),
          laborCost: laborCost.toFixed(2),
          equipmentCost: equipmentCost.toFixed(2),
          serviceCost: "0.00",
          otherCost: "0.00",
          unitCost: unitCostValue.toFixed(2),
          totalCost: totalCost.toFixed(2),
          laborHours: "0",
          totalLaborHours: "0",
          order: maxOrder + 1,
        });
        
        return { success: true, itemId: Number(result.insertId) };
      }),

    updateInputItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        budgetId: z.number(),
        description: z.string(),
        unit: z.string(),
        quantity: z.number(),
        materialCost: z.number(),
        laborCost: z.number(),
        equipmentCost: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        // Calcular custos totais
        const unitCost = input.materialCost + input.laborCost + input.equipmentCost;
        const totalCost = unitCost * input.quantity;
        
        // Atualizar insumo
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await database
          .update(budgetItems)
          .set({
            description: input.description,
            unit: input.unit,
            quantity: input.quantity.toString(),
            materialCost: input.materialCost.toFixed(2),
            laborCost: input.laborCost.toFixed(2),
            equipmentCost: input.equipmentCost.toFixed(2),
            unitCost: unitCost.toFixed(2),
            totalCost: totalCost.toFixed(2),
          })
          .where(eq(budgetItems.id, input.itemId));
        
        return { success: true };
      }),

    updateServiceItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        budgetId: z.number(),
        description: z.string(),
        unit: z.string(),
        quantity: z.number(),
        materialCost: z.number(),
        laborCost: z.number(),
        equipmentCost: z.number(),
        serviceCost: z.number(),
        otherCost: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        // Calcular custos totais
        const unitCost = input.materialCost + input.laborCost + input.equipmentCost + input.serviceCost + input.otherCost;
        const totalCost = unitCost * input.quantity;
        
        // Atualizar serviço
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await database
          .update(budgetItems)
          .set({
            description: input.description,
            unit: input.unit,
            quantity: input.quantity.toString(),
            materialCost: input.materialCost.toFixed(2),
            laborCost: input.laborCost.toFixed(2),
            equipmentCost: input.equipmentCost.toFixed(2),
            serviceCost: input.serviceCost.toFixed(2),
            otherCost: input.otherCost.toFixed(2),
            unitCost: unitCost.toFixed(2),
            totalCost: totalCost.toFixed(2),
          })
          .where(eq(budgetItems.id, input.itemId));
        
        return { success: true };
      }),

    // === SERVIÇO COMPOSTO ===
    createCompositeItem: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        description: z.string(),
        unit: z.string(),
        quantity: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        // Obter maior order atual na etapa
        const items = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(budgetItems.stageId, input.stageId),
            isNull(budgetItems.parentItemId)
          ));
        
        const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : -1;
        
        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: input.stageId,
          type: "composite",
          description: input.description,
          unit: input.unit,
          quantity: input.quantity.toString(),
          materialCost: "0.00",
          laborCost: "0.00",
          equipmentCost: "0.00",
          serviceCost: "0.00",
          otherCost: "0.00",
          unitCost: "0.00",
          totalCost: "0.00",
          laborHours: "0",
          totalLaborHours: "0",
          order: maxOrder + 1,
        });

        // Atualiza os totais da etapa/orçamento (esse endpoint não fazia
        // isso antes, deixando budgets.totalCost desatualizado até alguma
        // outra ação recalcular). Custo do item já veio pronto acima.
        await db.recalculateBudgetTotals(input.budgetId, { skipItemCostRecalc: true });

        return { id: Number(result.insertId) };
      }),

    addCompositionToComposite: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        parentItemId: z.number(),
        compositionId: z.number(),
        quantity: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        // Buscar o item pai (composite)
        const parentItem = await database.select().from(budgetItems).where(eq(budgetItems.id, input.parentItemId)).limit(1);
        if (!parentItem[0] || parentItem[0].type !== 'composite') throw new TRPCError({ code: "NOT_FOUND", message: "Composite item not found" });
        
        // Buscar composição
        const composition = await database
          .select()
          .from(compositions)
          .where(and(eq(compositions.id, input.compositionId), eq(compositions.userId, ctx.user.id)))
          .limit(1);
        
        if (!composition[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Composition not found" });
        
        const comp = composition[0];
        const materialCost = parseFloat(comp.materialCost);
        const laborCost = parseFloat(comp.laborCost);
        const unitCost = materialCost + laborCost;
        const totalCost = unitCost * input.quantity;
        
        // Obter maior order entre filhos do composite
        const children = await database
          .select()
          .from(budgetItems)
          .where(eq(budgetItems.parentItemId, input.parentItemId));
        
        const maxOrder = children.length > 0 ? Math.max(...children.map(i => i.order)) : -1;
        
        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: parentItem[0].stageId,
          parentItemId: input.parentItemId,
          type: "composition",
          compositionId: input.compositionId,
          description: comp.description,
          unit: comp.unit,
          quantity: input.quantity.toString(),
          materialCost: materialCost.toFixed(2),
          laborCost: laborCost.toFixed(2),
          equipmentCost: "0.00",
          serviceCost: "0.00",
          otherCost: "0.00",
          unitCost: unitCost.toFixed(2),
          totalCost: totalCost.toFixed(2),
          laborHours: parseFloat(comp.laborHours || "0").toFixed(3),
          totalLaborHours: (parseFloat(comp.laborHours || "0") * input.quantity).toFixed(2),
          order: maxOrder + 1,
        });

        // Mesma correção do addItemToStage: mantém budgets.totalCost em dia.
        await db.recalculateBudgetTotals(input.budgetId, { skipItemCostRecalc: true });

        return { id: Number(result.insertId) };
      }),

    addInputToComposite: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        parentItemId: z.number(),
        inputId: z.number(),
        quantity: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        const parentItem = await database.select().from(budgetItems).where(eq(budgetItems.id, input.parentItemId)).limit(1);
        if (!parentItem[0] || parentItem[0].type !== 'composite') throw new TRPCError({ code: "NOT_FOUND", message: "Composite item not found" });
        
        const inputData = await db.getInputById(input.inputId, ctx.user.id);
        if (!inputData) throw new TRPCError({ code: "NOT_FOUND", message: "Input not found" });
        
        const unitCostValue = parseFloat(inputData.unitCost);
        const totalCost = unitCostValue * input.quantity;
        
        let materialCost = 0, laborCost = 0, equipmentCost = 0;
        if (inputData.type === "material") materialCost = unitCostValue;
        else if (inputData.type === "labor") laborCost = unitCostValue;
        else if (inputData.type === "equipment") equipmentCost = unitCostValue;
        
        const children = await database
          .select()
          .from(budgetItems)
          .where(eq(budgetItems.parentItemId, input.parentItemId));
        
        const maxOrder = children.length > 0 ? Math.max(...children.map(i => i.order)) : -1;
        
        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: parentItem[0].stageId,
          parentItemId: input.parentItemId,
          type: "input",
          description: `${inputData.code || ''} - ${inputData.description}`,
          unit: inputData.unit,
          quantity: input.quantity.toString(),
          materialCost: materialCost.toFixed(2),
          laborCost: laborCost.toFixed(2),
          equipmentCost: equipmentCost.toFixed(2),
          serviceCost: "0.00",
          otherCost: "0.00",
          unitCost: unitCostValue.toFixed(2),
          totalCost: totalCost.toFixed(2),
          laborHours: "0",
          totalLaborHours: "0",
          order: maxOrder + 1,
        });
        
        return { id: Number(result.insertId) };
      }),

    addServiceToComposite: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        parentItemId: z.number(),
        description: z.string(),
        unit: z.string(),
        quantity: z.number(),
        materialCost: z.number(),
        laborCost: z.number(),
        equipmentCost: z.number(),
        serviceCost: z.number(),
        otherCost: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });

        // Verificar que o item pai é do tipo composite
        const parentItem = await database.select().from(budgetItems).where(eq(budgetItems.id, input.parentItemId)).limit(1);
        if (!parentItem[0] || parentItem[0].type !== 'composite') throw new TRPCError({ code: "NOT_FOUND", message: "Composite item not found" });

        // Gerar código SPI automático
        const existingServices = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(budgetItems.type, "service")
          ));
        const nextNumber = existingServices.length + 1;
        const code = `SPI${nextNumber.toString().padStart(7, '0')}`;

        const unitCost = input.materialCost + input.laborCost + input.equipmentCost + input.serviceCost + input.otherCost;
        const totalCost = unitCost * input.quantity;

        // Obter maior order entre filhos do composite
        const children = await database
          .select()
          .from(budgetItems)
          .where(eq(budgetItems.parentItemId, input.parentItemId));
        const maxOrder = children.length > 0 ? Math.max(...children.map(i => i.order)) : -1;

        const [result] = await database.insert(budgetItems).values({
          budgetId: input.budgetId,
          stageId: parentItem[0].stageId,
          parentItemId: input.parentItemId,
          type: "service",
          compositionId: null,
          description: `${code} - ${input.description}`,
          unit: input.unit,
          quantity: input.quantity.toString(),
          materialCost: input.materialCost.toFixed(2),
          laborCost: input.laborCost.toFixed(2),
          equipmentCost: input.equipmentCost.toFixed(2),
          serviceCost: input.serviceCost.toFixed(2),
          otherCost: input.otherCost.toFixed(2),
          unitCost: unitCost.toFixed(2),
          totalCost: totalCost.toFixed(2),
          laborHours: "0",
          totalLaborHours: "0",
          order: maxOrder + 1,
        });

        return { id: Number(result.insertId), code };
      }),

    updateCompositeItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        budgetId: z.number(),
        description: z.string(),
        unit: z.string(),
        quantity: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database
          .update(budgetItems)
          .set({
            description: input.description,
            unit: input.unit,
            quantity: input.quantity.toString(),
          })
          .where(eq(budgetItems.id, input.itemId));
        
        return { success: true };
      }),

    deleteCompositeItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        budgetId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Deletar filhos primeiro
        await database
          .delete(budgetItems)
          .where(eq(budgetItems.parentItemId, input.itemId));
        
        // Deletar o item composto
        await database
          .delete(budgetItems)
          .where(eq(budgetItems.id, input.itemId));
        
        return { success: true };
      }),

    deleteBudgetItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        budgetId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new TRPCError({ code: "FORBIDDEN", message: "Budget not found" });
        
        // Deletar item
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await database
          .delete(budgetItems)
          .where(eq(budgetItems.id, input.itemId));
        
        return { success: true };
      }),
    
    // Curva ABC de Materiais
    getAbcCurve: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar todos os itens do orçamento com seus insumos (APENAS MATERIAIS)
        // Os insumos estão nas composições, não diretamente nos itens
        const items = await database
          .select({
            itemId: budgetItems.id,
            itemDescription: budgetItems.description,
            itemQuantity: budgetItems.quantity,
            inputId: inputs.id,
            inputCode: inputs.code,
            inputDescription: inputs.description,
            inputType: inputs.type,
            inputUnitCost: inputs.unitCost,
            coefficient: compositionInputs.coefficient,
          })
          .from(budgetItems)
          .innerJoin(compositions, eq(budgetItems.compositionId, compositions.id))
          .innerJoin(compositionInputs, eq(compositions.id, compositionInputs.compositionId))
          .innerJoin(inputs, eq(compositionInputs.inputId, inputs.id))
          .where(and(
            eq(budgetItems.budgetId, input.budgetId),
            eq(inputs.type, 'material')
          ));
        
        // Agrupar por material (inputId + código) e somar valores
        const materialsMap = new Map<number, {
          inputId: number;
          code: string;
          description: string;
          type: string;
          totalValue: number;
        }>();
        
        for (const item of items) {
          if (!item.inputId) continue;
          
          const existing = materialsMap.get(item.inputId);
          // Calcular valor total: quantidade do item * coeficiente * custo unitário do insumo
          const itemQty = parseFloat(item.itemQuantity || "1");
          const coefficient = parseFloat(item.coefficient || "0");
          const unitCost = parseFloat(item.inputUnitCost || "0");
          const value = itemQty * coefficient * unitCost;
          
          if (existing) {
            existing.totalValue += value;
          } else {
            materialsMap.set(item.inputId, {
              inputId: item.inputId,
              code: item.inputCode || "",
              description: item.inputDescription || "Sem descrição",
              type: item.inputType || "material",
              totalValue: value,
            });
          }
        }
        
        // Converter para array e ordenar por valor decrescente
        const materials = Array.from(materialsMap.values())
          .sort((a, b) => b.totalValue - a.totalValue);
        
        // Calcular total geral
        const totalValue = materials.reduce((sum, m) => sum + m.totalValue, 0);
        
        // Calcular percentual acumulado e classificar em A, B, C
        let accumulated = 0;
        const abcCurve = materials.map((material, index) => {
          const percentage = totalValue > 0 ? (material.totalValue / totalValue) * 100 : 0;
          accumulated += percentage;
          
          let classification: "A" | "B" | "C";
          if (accumulated <= 80) {
            classification = "A";
          } else if (accumulated <= 95) {
            classification = "B";
          } else {
            classification = "C";
          }
          
          return {
            rank: index + 1,
            inputId: material.inputId,
            code: material.code,
            description: material.description,
            type: material.type,
            totalValue: material.totalValue,
            percentage: percentage,
            accumulatedPercentage: accumulated,
            classification,
          };
        });
        
        return {
          totalValue,
          items: abcCurve,
        };
      }),
  }),

  // Schedule (Cronograma)
  schedule: router({
    getActivities: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        return db.getScheduleActivities(input.budgetId);
      }),
    
    createActivity: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        budgetItemId: z.number().optional(),
        description: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
        totalCost: z.string(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const [result] = await database.insert(scheduleActivities).values({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          order: input.order || 0,
        });
        return { id: Number(result.insertId) };
      }),
    
    deleteActivity: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(scheduleActivities).where(eq(scheduleActivities.id, input.id));
        return { success: true };
      }),
    
    getPeriods: protectedProcedure
      .input(z.object({ activityId: z.number() }))
      .query(async ({ input }) => {
        return db.getSchedulePeriods(input.activityId);
      }),
    
    createPeriod: protectedProcedure
      .input(z.object({
        activityId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        physicalProgress: z.string(),
        financialAmount: z.string(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const [result] = await database.insert(schedulePeriods).values({
          ...input,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
        });
        return { id: Number(result.insertId) };
      }),
  }),

  // Disbursements (Desembolsos)
  disbursements: router({
    list: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        return db.getDisbursements(input.budgetId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        description: z.string().min(1),
        dueDate: z.string(),
        amount: z.string(),
        category: z.string().optional(),
        status: z.enum(["planned", "paid"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const [result] = await database.insert(disbursements).values({
          ...input,
          dueDate: new Date(input.dueDate),
        });
        return { id: Number(result.insertId) };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().min(1),
        dueDate: z.string(),
        amount: z.string(),
        category: z.string().optional(),
        status: z.enum(["planned", "paid"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.update(disbursements)
          .set({
            ...input,
            dueDate: new Date(input.dueDate),
          })
          .where(eq(disbursements.id, input.id));
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.delete(disbursements).where(eq(disbursements.id, input.id));
        return { success: true };
      }),
  }),

  // Categories
  categories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) return [];
      
      const result = await database.select().from(categories)
        .where(eq(categories.userId, ctx.user.id));
      return result;
    }),
    
    create: protectedProcedure
      .input(z.object({
        code: z.string().min(1).max(10),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o código já existe para este usuário
        const existing = await database.select().from(categories)
          .where(and(eq(categories.userId, ctx.user.id), eq(categories.code, input.code)));
        
        if (existing.length > 0) {
          throw new Error("Já existe uma categoria com este código");
        }
        
        const [result] = await database.insert(categories).values({
          userId: ctx.user.id,
          ...input,
        });
        return { id: Number(result.insertId) };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(1).max(10),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o código já existe para outro registro
        const existing = await database.select().from(categories)
          .where(and(
            eq(categories.userId, ctx.user.id),
            eq(categories.code, input.code)
          ));
        
        if (existing.length > 0 && existing[0].id !== input.id) {
          throw new Error("Já existe uma categoria com este código");
        }
        
        await database.update(categories)
          .set({
            code: input.code,
            name: input.name,
            description: input.description,
          })
          .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)));
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se a categoria está em uso
        const compositionsUsingCategory = await database.select().from(compositions)
          .where(and(
            eq(compositions.userId, ctx.user.id),
            eq(compositions.categoryId, input.id)
          ));
        
        if (compositionsUsingCategory.length > 0) {
          throw new Error(`Não é possível deletar esta categoria pois ela está sendo usada por ${compositionsUsingCategory.length} composição(ões)`);
        }
        
        await database.delete(categories)
          .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // Clients (Clientes)
  clients: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) return [];
      
      const result = await database.select().from(clients)
        .where(eq(clients.userId, ctx.user.id))
        .orderBy(clients.name);
      return result;
    }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) return null;
        
        const result = await database.select().from(clients)
          .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
        return result[0] || null;
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        documentType: z.enum(["cpf", "cnpj"]),
        document: z.string().min(1),
        address: z.string().optional(),
        zipCode: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o documento já existe para este usuário
        const existing = await database.select().from(clients)
          .where(and(eq(clients.userId, ctx.user.id), eq(clients.document, input.document)));
        
        if (existing.length > 0) {
          throw new Error("Já existe um cliente com este CPF/CNPJ");
        }
        
        const [result] = await database.insert(clients).values({
          userId: ctx.user.id,
          ...input,
        });
        return { id: Number(result.insertId) };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        documentType: z.enum(["cpf", "cnpj"]),
        document: z.string().min(1),
        address: z.string().optional(),
        zipCode: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o documento já existe para outro cliente
        const existing = await database.select().from(clients)
          .where(and(
            eq(clients.userId, ctx.user.id),
            eq(clients.document, input.document)
          ));
        
        if (existing.length > 0 && existing[0].id !== input.id) {
          throw new Error("Já existe um cliente com este CPF/CNPJ");
        }
        
        await database.update(clients)
          .set({
            name: input.name,
            documentType: input.documentType,
            document: input.document,
            address: input.address,
            zipCode: input.zipCode,
            email: input.email,
            phone: input.phone,
            notes: input.notes,
          })
          .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o cliente está em uso em algum orçamento
        const budgetsUsingClient = await database.select().from(budgets)
          .where(and(
            eq(budgets.userId, ctx.user.id),
            eq(budgets.clientId, input.id)
          ));
        
        if (budgetsUsingClient.length > 0) {
          throw new Error(`Não é possível deletar este cliente pois ele está sendo usado por ${budgetsUsingClient.length} orçamento(s)`);
        }
        
        await database.delete(clients)
          .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // Budget Item BDI Config
  budgetItemBdiConfig: router({
    upsert: protectedProcedure
      .input(z.object({
        budgetItemId: z.number(),
        applyBdiToMaterial: z.boolean(),
        applyBdiToLabor: z.boolean(),
        additionalIncrement: z.number(),
        discount: z.number().optional(),
        aplicarEncargosSociais: z.boolean().optional(), // Melhoria 16
        laborAdjustment: z.number().optional(), // Melhoria 17: ajuste % sobre M.O.
        materialAdjustment: z.number().optional(), // Ajuste % sobre Material
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o item pertence a um orçamento do usuário
        const item = await database.select().from(budgetItems).where(eq(budgetItems.id, input.budgetItemId)).limit(1);
        if (!item[0]) throw new Error("Item not found");
        
        const budget = await db.getBudgetById(item[0].budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Verificar se já existe configuração (rawQueryParams para evitar cache de prepared statements)
        const existing = await db.rawQueryParams(
          'SELECT id FROM budget_item_bdi_config WHERE budgetItemId = ? LIMIT 1',
          [input.budgetItemId]
        ) as { id: number }[];
        
        if (existing.length > 0) {
          // Atualizar existente
          await database
            .update(budgetItemBdiConfig)
            .set({
              applyBdiToMaterial: input.applyBdiToMaterial ? 1 : 0,
              applyBdiToLabor: input.applyBdiToLabor ? 1 : 0,
              additionalIncrement: input.additionalIncrement.toFixed(2),
              discount: (input.discount || 0).toFixed(2),
              ...(input.materialAdjustment !== undefined && { materialAdjustment: input.materialAdjustment.toFixed(2) }),
            })
            .where(eq(budgetItemBdiConfig.id, existing[0].id));
        } else {
          // Criar novo
          await database.insert(budgetItemBdiConfig).values({
            budgetItemId: input.budgetItemId,
            applyBdiToMaterial: input.applyBdiToMaterial ? 1 : 0,
            applyBdiToLabor: input.applyBdiToLabor ? 1 : 0,
            additionalIncrement: input.additionalIncrement.toFixed(2),
            discount: (input.discount || 0).toFixed(2),
            materialAdjustment: (input.materialAdjustment || 0).toFixed(2),
          });
        }
        
        // Melhoria 16 + 17: Atualizar campos aplicarEncargosSociais e laborAdjustment no budgetItems
        const itemUpdates: Record<string, unknown> = {};
        if (input.aplicarEncargosSociais !== undefined) {
          itemUpdates.aplicarEncargosSociais = input.aplicarEncargosSociais ? 1 : 0;
        }
        if (input.laborAdjustment !== undefined) {
          itemUpdates.laborAdjustment = input.laborAdjustment.toFixed(2);
        }
        if (input.materialAdjustment !== undefined) {
          itemUpdates.materialAdjustment = input.materialAdjustment.toFixed(2);
        }
        if (Object.keys(itemUpdates).length > 0) {
          await database
            .update(budgetItems)
            .set(itemUpdates as Partial<typeof budgetItems.$inferInsert>)
            .where(eq(budgetItems.id, input.budgetItemId));
        }
        
        // Recalcular totais do orçamento após alteração de BDI/ajuste — esses
        // campos são aplicados depois, no cálculo de totais com BDI; não
        // afetam o custo unitário (materialCost/laborCost/equipmentCost) que
        // o recálculo por item recomputa, então pode pular esse passo.
        await db.recalculateBudgetTotals(item[0].budgetId, { skipItemCostRecalc: true });
        
        return { success: true };
      }),
    
    getByBudgetId: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se o orçamento pertence ao usuário
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar todas as configurações de BDI dos itens deste orçamento
        // Usando rawQueryParams para evitar cache de prepared statements do Drizzle
        const rawConfigs = await db.rawQueryParams(
          `SELECT bdi.id, bdi.budgetItemId, bdi.applyBdiToMaterial, bdi.applyBdiToLabor,
           bdi.additionalIncrement, bi.materialAdjustment, bi.laborAdjustment, bi.aplicarEncargosSociais
           FROM budget_item_bdi_config bdi
           INNER JOIN budget_items bi ON bdi.budgetItemId = bi.id
           WHERE bi.budgetId = ?`,
          [input.budgetId]
        );

        const configs = (rawConfigs as any[]).map((r: any) => ({
          id: r.id,
          budgetItemId: r.budgetItemId,
          applyBdiToMaterial: r.applyBdiToMaterial,
          applyBdiToLabor: r.applyBdiToLabor,
          additionalIncrement: r.additionalIncrement ?? '0',
          materialAdjustment: r.materialAdjustment ?? '0',
          laborAdjustment: r.laborAdjustment ?? '0',
          aplicarEncargosSociais: r.aplicarEncargosSociais,
        }));
        
        return configs;
      }),
  }),

  // Budget Item Reordering (Melhoria 17)
  budgetItemReorder: router({
    moveUp: protectedProcedure
      .input(z.object({ itemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar o item
        const item = await database.select().from(budgetItems).where(eq(budgetItems.id, input.itemId)).limit(1);
        if (!item[0]) throw new Error("Item not found");
        
        // Verificar permissão
        const budget = await db.getBudgetById(item[0].budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar itens da mesma sub-etapa ordenados
        const siblings = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, item[0].budgetId),
            eq(budgetItems.stageId, item[0].stageId!)
          ))
          .orderBy(budgetItems.order);
        
        const currentIndex = siblings.findIndex(s => s.id === input.itemId);
        if (currentIndex <= 0) return { success: false, message: "Item já está no topo" };
        
        // Trocar ordem com item anterior
        const prevItem = siblings[currentIndex - 1];
        await database.update(budgetItems).set({ order: prevItem.order }).where(eq(budgetItems.id, item[0].id));
        await database.update(budgetItems).set({ order: item[0].order }).where(eq(budgetItems.id, prevItem.id));
        
        return { success: true };
      }),
    
    moveDown: protectedProcedure
      .input(z.object({ itemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar o item
        const item = await database.select().from(budgetItems).where(eq(budgetItems.id, input.itemId)).limit(1);
        if (!item[0]) throw new Error("Item not found");
        
        // Verificar permissão
        const budget = await db.getBudgetById(item[0].budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar itens da mesma sub-etapa ordenados
        const siblings = await database
          .select()
          .from(budgetItems)
          .where(and(
            eq(budgetItems.budgetId, item[0].budgetId),
            eq(budgetItems.stageId, item[0].stageId!)
          ))
          .orderBy(budgetItems.order);
        
        const currentIndex = siblings.findIndex(s => s.id === input.itemId);
        if (currentIndex >= siblings.length - 1) return { success: false, message: "Item já está no final" };
        
        // Trocar ordem com próximo item
        const nextItem = siblings[currentIndex + 1];
        await database.update(budgetItems).set({ order: nextItem.order }).where(eq(budgetItems.id, item[0].id));
        await database.update(budgetItems).set({ order: item[0].order }).where(eq(budgetItems.id, nextItem.id));
        
        return { success: true };
      }),
  }),

  // Budget Schedule (Cronograma Físico-Financeiro)
  budgetSchedule: router({
    // Salvar datas do projeto
    saveDates: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        startDate: z.string(), // ISO date string
        endDate: z.string(),
        periodType: z.enum(['monthly', 'biweekly', 'weekly']),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Calcular duração em meses
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        const months = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
        
        // Atualizar orçamento
        await database.update(budgets)
          .set({
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            durationMonths: months,
            periodType: input.periodType,
          })
          .where(eq(budgets.id, input.budgetId));
        
        return { success: true, durationMonths: months };
      }),
    
    // Gerar períodos automaticamente
    generatePeriods: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão e buscar dados
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        if (!budget.startDate || !budget.endDate) {
          throw new Error("Datas do projeto não configuradas");
        }
        
        // Limpar períodos existentes
        await database.delete(budgetSchedulePeriods).where(eq(budgetSchedulePeriods.budgetId, input.budgetId));
        
        // Gerar períodos
        const start = new Date(budget.startDate);
        const end = new Date(budget.endDate);
        const periods: any[] = [];
        
        let currentDate = new Date(start);
        let periodNumber = 1;
        
        while (currentDate <= end) {
          const periodStart = new Date(currentDate);
          let periodEnd: Date;
          
          if (budget.periodType === 'monthly') {
            // Período mensal
            periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            if (periodEnd > end) periodEnd = new Date(end);
          } else if (budget.periodType === 'weekly') {
            // Período semanal (7 dias)
            periodEnd = new Date(currentDate);
            periodEnd.setDate(periodEnd.getDate() + 6);
            if (periodEnd > end) periodEnd = new Date(end);
          } else {
            // Período quinzenal
            if (currentDate.getDate() === 1) {
              periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 15);
            } else {
              periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            }
            if (periodEnd > end) periodEnd = new Date(end);
          }
          
          const periodName = budget.periodType === 'monthly'
            ? `Mês ${periodNumber}`
            : budget.periodType === 'weekly'
            ? `Semana ${periodNumber}`
            : `Quinzena ${periodNumber}`;
          
          periods.push({
            budgetId: input.budgetId,
            periodNumber,
            periodName,
            startDate: periodStart.toISOString().split('T')[0],
            endDate: periodEnd.toISOString().split('T')[0],
          });
          
          // Avançar para próximo período
          if (budget.periodType === 'monthly') {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
          } else if (budget.periodType === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7);
          } else {
            if (currentDate.getDate() === 1) {
              currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 16);
            } else {
              currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            }
          }
          periodNumber++;
        }
        
        // Inserir períodos
        if (periods.length > 0) {
          await database.insert(budgetSchedulePeriods).values(periods);
        }
        
        return { success: true, periodsCount: periods.length };
      }),
    
    // Listar períodos
    getPeriods: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const periods = await database
          .select()
          .from(budgetSchedulePeriods)
          .where(eq(budgetSchedulePeriods.budgetId, input.budgetId))
          .orderBy(budgetSchedulePeriods.periodNumber);
        
        return periods;
      }),
    
    // Salvar distribuição percentual
    saveDistribution: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        periodId: z.number(),
        percentPlanned: z.string(), // decimal field
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Upsert
        const existing = await database
          .select()
          .from(budgetScheduleItems)
          .where(and(
            eq(budgetScheduleItems.stageId, input.stageId),
            eq(budgetScheduleItems.periodId, input.periodId)
          ))
          .limit(1);
        
        if (existing[0]) {
          await database
            .update(budgetScheduleItems)
            .set({ percentPlanned: input.percentPlanned.toString() })
            .where(eq(budgetScheduleItems.id, existing[0].id));
        } else {
          await database.insert(budgetScheduleItems).values({
            budgetId: input.budgetId,
            stageId: input.stageId,
            periodId: input.periodId,
            percentPlanned: input.percentPlanned,
            percentExecuted: "0",
          });
        }
        
        return { success: true };
      }),
    
    // Listar distribuição
    getDistribution: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const items = await database
          .select()
          .from(budgetScheduleItems)
          .where(eq(budgetScheduleItems.budgetId, input.budgetId));
        
        return items;
      }),
    
    // Distribuir automaticamente (geração inteligente completa com base de conhecimento)
    generateSmartDistribution: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Importar base de conhecimento
        const { classifyStage, getDependencies, estimateDuration, generateDistributionCurve, CONSTRUCTION_PHASES } = await import('../construction_knowledge_base');
        
        // Verificar permissão e buscar dados
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar períodos
        const periods = await database
          .select()
          .from(budgetSchedulePeriods)
          .where(eq(budgetSchedulePeriods.budgetId, input.budgetId))
          .orderBy(budgetSchedulePeriods.periodNumber);
        
        if (periods.length === 0) {
          throw new Error("Gere os períodos primeiro");
        }
        
        // Buscar TODAS as etapas (incluindo sub-etapas) com itens e valores COM BDI
        const stages = await database
          .select()
          .from(budgetStages)
          .where(eq(budgetStages.budgetId, input.budgetId))
          .orderBy(budgetStages.order, budgetStages.id);
        
        // Processar TODAS as etapas (incluindo sub-etapas)
        const allStages = stages;
        
        // Buscar itens de cada etapa para calcular valor COM BDI e classificar
        const stageValues = await Promise.all(
          allStages.map(async (stage) => {
            const items = await database
              .select()
              .from(budgetItems)
              .where(eq(budgetItems.stageId, stage.id));
            
            // Calcular valor total COM BDI da etapa
            let totalValue = 0;
            items.forEach(item => {
              const qty = parseFloat(item.quantity || "0");
              const material = parseFloat(item.materialCost || "0");
              const labor = parseFloat(item.laborCost || "0");
              const equipment = parseFloat(item.equipmentCost || "0");
              const service = parseFloat(item.serviceCost || "0");
              const other = parseFloat(item.otherCost || "0");
              
              // Aplicar BDI (simplificado - usar valores do orçamento)
              const socialCharges = parseFloat(budget.socialCharges || "0");
              const bdiTotal = parseFloat(budget.profit || "0") + parseFloat(budget.taxes || "0") + parseFloat(budget.risk || "0") + parseFloat(budget.warranty || "0");
              
              const laborWithCharges = labor * (1 + socialCharges / 100);
              const bdiMultiplier = 1 + bdiTotal / 100;
              
              const materialWithBDI = material * bdiMultiplier;
              const laborWithBDI = laborWithCharges * bdiMultiplier;
              const equipmentWithBDI = equipment * bdiMultiplier;
              const serviceWithBDI = service * bdiMultiplier;
              const otherWithBDI = other * bdiMultiplier;
              
              totalValue += (materialWithBDI + laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI) * qty;
            });
            
            // Classificar etapa usando base de conhecimento
            const category = classifyStage(stage.name);
            const phaseInfo = CONSTRUCTION_PHASES[category];
            
            return {
              stageId: stage.id,
              stageName: stage.name,
              totalValue,
              itemCount: items.length,
              category,
              phaseInfo,
              parentStageId: stage.parentStageId,
            };
          })
        );
        
        // Calcular valor total do orçamento
        const totalBudgetValue = stageValues.reduce((sum, s) => sum + s.totalValue, 0);
        
        // Estimar duração de cada etapa usando base de conhecimento
        const totalPeriods = periods.length;
        const stageEstimates = stageValues.map(sv => {
          // Usar estimativa técnica da base de conhecimento
          const estimatedMonths = estimateDuration(sv.category, sv.totalValue, totalBudgetValue);
          
          // Converter meses para número de períodos
          const monthsPerPeriod = (budget.durationMonths || 12) / totalPeriods;
          const estimatedPeriods = Math.max(1, Math.round(estimatedMonths / monthsPerPeriod));
          
          return {
            ...sv,
            estimatedPeriods,
            estimatedMonths,
          };
        });
        
        // Ordenar etapas respeitando dependências técnicas
        // Criar mapa de etapas por categoria para identificar dependências
        const categoryMap = new Map<string, typeof stageEstimates[0][]>();
        stageEstimates.forEach(stage => {
          const list = categoryMap.get(stage.category) || [];
          list.push(stage);
          categoryMap.set(stage.category, list);
        });
        
        // Calcular período de início para cada etapa baseado em dependências
        const stageStartPeriods = new Map<number, number>();
        
        stageEstimates.forEach(stage => {
          const deps = getDependencies(stage.category);
          let maxEndPeriod = 0;
          
          // Encontrar quando as dependências terminam
          deps.forEach((depCategory: string) => {
            const depStages = categoryMap.get(depCategory) || [];
            depStages.forEach(depStage => {
              const depStart = stageStartPeriods.get(depStage.stageId) || 0;
              const depEnd = depStart + depStage.estimatedPeriods;
              maxEndPeriod = Math.max(maxEndPeriod, depEnd);
            });
          });
          
          // Esta etapa começa quando suas dependências terminam
          stageStartPeriods.set(stage.stageId, maxEndPeriod);
        });
        
        // Limpar distribuição existente
        await database.delete(budgetScheduleItems).where(eq(budgetScheduleItems.budgetId, input.budgetId));
        
        // Gerar distribuição com curva realista baseada no tipo de serviço
        const distributions: any[] = [];
        
        stageEstimates.forEach(estimate => {
          const startPeriod = stageStartPeriods.get(estimate.stageId) || 0;
          const numPeriods = Math.min(estimate.estimatedPeriods, totalPeriods - startPeriod);
          
          if (numPeriods <= 0) return; // Não cabe no cronograma
          
          // Usar curva de produtividade da base de conhecimento
          const curve = generateDistributionCurve(estimate.phaseInfo.productivityCurve, numPeriods);
          
          // Distribuir nos períodos
          for (let i = 0; i < numPeriods && (startPeriod + i) < periods.length; i++) {
            const percentValue = curve[i];
            // Validar que o valor é um número válido
            if (typeof percentValue !== 'number' || isNaN(percentValue)) {
              console.error('Invalid percent value:', percentValue, 'for stage:', estimate.stageName);
              continue; // Pular este período
            }
            
            distributions.push({
              budgetId: input.budgetId,
              stageId: estimate.stageId,
              periodId: periods[startPeriod + i].id,
              percentPlanned: parseFloat(percentValue.toFixed(2)),
              percentExecuted: 0,
            });
          }
        });
        
        // Inserir distribuições
        if (distributions.length > 0) {
          await database.insert(budgetScheduleItems).values(distributions);
        }
        
        return { success: true, distributionsCount: distributions.length };
      }),
    
    // Atualizar valores (recalcula valores mantendo distribuição)
    updateValues: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Esta API apenas valida que os valores estão sincronizados
        // A sincronização real acontece no frontend ao recalcular com base nos valores COM BDI
        
        return { success: true, message: "Valores atualizados com base no orçamento" };
      }),
    
    // Salvar distribuição mensal de percentuais (Gantt)
    saveMonthlyDistribution: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
        distributions: z.array(z.object({
          periodIndex: z.number(),
          periodLabel: z.string(),
          percentage: z.number(),
          value: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Deletar distribuições existentes para esta etapa
        await database.delete(budgetMonthlyDistribution)
          .where(
            and(
              eq(budgetMonthlyDistribution.budgetId, input.budgetId),
              eq(budgetMonthlyDistribution.stageId, input.stageId)
            )
          );
        
        // Inserir novas distribuições
        if (input.distributions.length > 0) {
          await database.insert(budgetMonthlyDistribution).values(
            input.distributions.map(d => ({
              budgetId: input.budgetId,
              stageId: input.stageId,
              periodIndex: d.periodIndex,
              periodLabel: d.periodLabel,
              percentage: d.percentage.toString(),
              value: d.value.toString(),
            }))
          );
        }
        
        return { success: true };
      }),
    
    // Buscar distribuição mensal salva (Gantt)
    getMonthlyDistribution: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        stageId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const distributions = await database
          .select()
          .from(budgetMonthlyDistribution)
          .where(
            and(
              eq(budgetMonthlyDistribution.budgetId, input.budgetId),
              eq(budgetMonthlyDistribution.stageId, input.stageId)
            )
          )
          .orderBy(budgetMonthlyDistribution.periodIndex);
        
        return distributions.map(d => ({
          periodIndex: d.periodIndex,
          periodLabel: d.periodLabel,
          percentage: parseFloat(d.percentage),
          value: parseFloat(d.value),
        }));
      }),
    
    // Buscar TODAS as distribuições mensais de um orçamento de uma vez (para carregamento inicial)
    getAllMonthlyDistributions: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        const distributions = await database
          .select()
          .from(budgetMonthlyDistribution)
          .where(eq(budgetMonthlyDistribution.budgetId, input.budgetId))
          .orderBy(budgetMonthlyDistribution.stageId, budgetMonthlyDistribution.periodIndex);
        
        return distributions.map(d => ({
          stageId: d.stageId,
          periodIndex: d.periodIndex,
          periodLabel: d.periodLabel,
          percentage: parseFloat(d.percentage),
          value: parseFloat(d.value),
        }));
      }),

    // Recalcular todas as distribuições com nova lógica de defasagem
    recalculateAllDistributions: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar todas as etapas configuradas (com startDate e endDate)
        const stages = await database
          .select()
          .from(budgetStages)
          .where(
            and(
              eq(budgetStages.budgetId, input.budgetId),
              isNotNull(budgetStages.startDate),
              isNotNull(budgetStages.endDate)
            )
          );
        
        // Deletar todas as distribuições existentes
        await database.delete(budgetMonthlyDistribution)
          .where(eq(budgetMonthlyDistribution.budgetId, input.budgetId));
        
        // Nota: Não regeneramos as distribuições aqui porque a lógica de cálculo
        // (generateMonthsForStage + distribuição proporcional) está no frontend.
        // O frontend irá regenerar automaticamente ao expandir cada etapa.
        
        return { success: true, count: stages.length };
      }),
    
    // Rearranjar todas as etapas em cascata (ajustar datas de sucessoras)
    reloadStages: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar permissão
        const budget = await db.getBudgetById(input.budgetId, ctx.user.id);
        if (!budget) throw new Error("Budget not found");
        
        // Buscar todas as etapas configuradas
        const stages = await database
          .select()
          .from(budgetStages)
          .where(
            and(
              eq(budgetStages.budgetId, input.budgetId),
              isNotNull(budgetStages.startDate),
              isNotNull(budgetStages.endDate)
            )
          )
          .orderBy(budgetStages.order);
        
        // Função recursiva para ajustar sucessoras
        const adjustSuccessors = async (predecessorId: number, predecessorEndDate: string) => {
          // Encontrar etapas que dependem desta
          const successors = stages.filter(s => {
            if (!s.predecessors) return false;
            try {
              const preds = JSON.parse(s.predecessors);
              return preds.some((p: any) => (p.id || p) === predecessorId);
            } catch {
              return false;
            }
          });
          
          // Ajustar cada sucessora
          for (const successor of successors) {
            const newStartDate = new Date(predecessorEndDate);
            newStartDate.setDate(newStartDate.getDate() + 1); // Começa no dia seguinte
            
            const currentDuration = successor.duration || 1;
            const newEndDate = new Date(newStartDate);
            newEndDate.setDate(newEndDate.getDate() + currentDuration);
            
            // Atualizar etapa
            await database.update(budgetStages)
              .set({
                startDate: newStartDate,
                endDate: newEndDate,
              })
              .where(eq(budgetStages.id, successor.id));
            
            // Ajustar recursivamente as sucessoras desta sucessora
            await adjustSuccessors(successor.id, newEndDate.toISOString().split('T')[0]);
          }
        };
        
        // Percorrer etapas sem predecessoras e ajustar suas sucessoras
        let updatedCount = 0;
        for (const stage of stages) {
          if (!stage.predecessors || stage.predecessors === '[]') {
            // Etapa livre - mantém datas atuais, mas ajusta sucessoras
            if (stage.endDate) {
              const endDateStr = stage.endDate instanceof Date 
                ? stage.endDate.toISOString().split('T')[0]
                : String(stage.endDate);
              await adjustSuccessors(stage.id, endDateStr);
              updatedCount++;
            }
          }
        }
        
        // Deletar todas as distribuições existentes para forçar recalculo
        await database.delete(budgetMonthlyDistribution)
          .where(eq(budgetMonthlyDistribution.budgetId, input.budgetId));

        // Corrigir a ordem de exibição das etapas (independente das datas) —
        // ver comentário de normalizeStageOrder em db.ts.
        await db.normalizeStageOrder(input.budgetId);

        return { success: true, count: stages.length };
      }),
  }),

  // Company Settings
  companySettings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      
      const settings = await database.select().from(companySettings)
        .where(eq(companySettings.userId, ctx.user.id))
        .limit(1);
      
      return settings[0] || null;
    }),
  }),

  // Export procedures removidas - implementação movida para frontend (jsPDF + xlsx)

  // ============================================================
  // Gestão Financeira - Medições e Aditivos
  // ============================================================
  measurements: router({
    // Listar períodos de medição de um orçamento
    listPeriods: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        // Verificar acesso ao orçamento
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
        return database.select().from(measurementPeriods)
          .where(eq(measurementPeriods.budgetId, input.budgetId))
          .orderBy(measurementPeriods.periodNumber);
      }),

    // Criar período de medição
    createPeriod: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        name: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
        // Calcular próximo número de período
        const lastPeriod = await database.select({ periodNumber: measurementPeriods.periodNumber })
          .from(measurementPeriods)
          .where(eq(measurementPeriods.budgetId, input.budgetId))
          .orderBy(sql`${measurementPeriods.periodNumber} DESC`)
          .limit(1);
        const nextNumber = lastPeriod.length > 0 ? lastPeriod[0].periodNumber + 1 : 1;
        const [result] = await database.insert(measurementPeriods).values({
          budgetId: input.budgetId,
          periodNumber: nextNumber,
          name: input.name,
          startDate: input.startDate as any,
          endDate: input.endDate as any,
          notes: input.notes,
          status: "open",
        });
        return { id: Number(result.insertId), periodNumber: nextNumber };
      }),

    // Atualizar período de medição
    updatePeriod: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        status: z.enum(["open", "closed"]).optional(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const period = await database.select({ budgetId: measurementPeriods.budgetId })
          .from(measurementPeriods).where(eq(measurementPeriods.id, input.id)).limit(1);
        if (!period.length) throw new TRPCError({ code: "NOT_FOUND", message: "Período não encontrado" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, period[0].budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        const { id, ...updateData } = input;
        await database.update(measurementPeriods).set(updateData as any).where(eq(measurementPeriods.id, id));
        return { success: true };
      }),

    // Deletar período de medição
    deletePeriod: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const period = await database.select({ budgetId: measurementPeriods.budgetId })
          .from(measurementPeriods).where(eq(measurementPeriods.id, input.id)).limit(1);
        if (!period.length) throw new TRPCError({ code: "NOT_FOUND", message: "Período não encontrado" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, period[0].budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        await database.delete(measurementPeriods).where(eq(measurementPeriods.id, input.id));
        return { success: true };
      }),

    // Listar itens medidos de um período
    listItems: protectedProcedure
      .input(z.object({ periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        return database.select().from(measurementItems)
          .where(eq(measurementItems.periodId, input.periodId));
      }),

    // Salvar/atualizar medição de um item (upsert)
    upsertItem: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        budgetId: z.number(),
        budgetItemId: z.number(),
        percentMeasured: z.string(),
        quantityMeasured: z.string(),
        valueMeasured: z.string(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        // Verificar acesso
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        // Verificar se já existe
        const existing = await database.select({ id: measurementItems.id })
          .from(measurementItems)
          .where(and(
            eq(measurementItems.periodId, input.periodId),
            eq(measurementItems.budgetItemId, input.budgetItemId)
          )).limit(1);
        if (existing.length > 0) {
          await database.update(measurementItems).set({
            percentMeasured: input.percentMeasured,
            quantityMeasured: input.quantityMeasured,
            valueMeasured: input.valueMeasured,
            notes: input.notes,
          }).where(eq(measurementItems.id, existing[0].id));
          return { id: existing[0].id };
        } else {
          const [result] = await database.insert(measurementItems).values({
            periodId: input.periodId,
            budgetId: input.budgetId,
            budgetItemId: input.budgetItemId,
            percentMeasured: input.percentMeasured,
            quantityMeasured: input.quantityMeasured,
            valueMeasured: input.valueMeasured,
            notes: input.notes,
          });
          return { id: Number(result.insertId) };
        }
      }),

    // Salvar múltiplos itens de uma vez (batch upsert)
    batchUpsertItems: protectedProcedure
      .input(z.object({
        periodId: z.number(),
        budgetId: z.number(),
        items: z.array(z.object({
          budgetItemId: z.number(),
          percentMeasured: z.string(),
          quantityMeasured: z.string(),
          valueMeasured: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        for (const item of input.items) {
          const existing = await database.select({ id: measurementItems.id })
            .from(measurementItems)
            .where(and(
              eq(measurementItems.periodId, input.periodId),
              eq(measurementItems.budgetItemId, item.budgetItemId)
            )).limit(1);
          if (existing.length > 0) {
            await database.update(measurementItems).set({
              percentMeasured: item.percentMeasured,
              quantityMeasured: item.quantityMeasured,
              valueMeasured: item.valueMeasured,
            }).where(eq(measurementItems.id, existing[0].id));
          } else {
            await database.insert(measurementItems).values({
              periodId: input.periodId,
              budgetId: input.budgetId,
              budgetItemId: item.budgetItemId,
              percentMeasured: item.percentMeasured,
              quantityMeasured: item.quantityMeasured,
              valueMeasured: item.valueMeasured,
            });
          }
        }
        return { success: true, count: input.items.length };
      }),

    // Listar aditivos de um orçamento
    listAdditives: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
        return database.select().from(contractAdditives)
          .where(eq(contractAdditives.budgetId, input.budgetId))
          .orderBy(contractAdditives.createdAt);
      }),

    // Criar aditivo
    createAdditive: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        number: z.string().min(1),
        type: z.enum(["acrescimo", "supressao"]),
        description: z.string().min(1),
        value: z.string(),
        signedDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
        const [result] = await database.insert(contractAdditives).values({
          budgetId: input.budgetId,
          number: input.number,
          type: input.type,
          description: input.description,
          value: input.value,
          signedDate: input.signedDate as any,
          notes: input.notes,
        });
        return { id: Number(result.insertId) };
      }),

    // Atualizar aditivo
    updateAdditive: protectedProcedure
      .input(z.object({
        id: z.number(),
        number: z.string().min(1).optional(),
        type: z.enum(["acrescimo", "supressao"]).optional(),
        description: z.string().min(1).optional(),
        value: z.string().optional(),
        signedDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const additive = await database.select({ budgetId: contractAdditives.budgetId })
          .from(contractAdditives).where(eq(contractAdditives.id, input.id)).limit(1);
        if (!additive.length) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, additive[0].budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        const { id, ...updateData } = input;
        await database.update(contractAdditives).set(updateData as any).where(eq(contractAdditives.id, id));
        return { success: true };
      }),

    // Deletar aditivo
    deleteAdditive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const additive = await database.select({ budgetId: contractAdditives.budgetId })
          .from(contractAdditives).where(eq(contractAdditives.id, input.id)).limit(1);
        if (!additive.length) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, additive[0].budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        await database.delete(contractAdditives).where(eq(contractAdditives.id, input.id));
        return { success: true };
      }),

    // Busca TODOS os itens de medição de todos os períodos do orçamento
    // Usado para calcular o acumulado histórico no frontend
    listAllItemsForBudget: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        // Verificar acesso ao orçamento
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        // Buscar todos os itens de todos os períodos deste orçamento
        const allItems = await database
          .select({
            id: measurementItems.id,
            periodId: measurementItems.periodId,
            budgetItemId: measurementItems.budgetItemId,
            percentMeasured: measurementItems.percentMeasured,
            valueMeasured: measurementItems.valueMeasured,
          })
          .from(measurementItems)
          .innerJoin(measurementPeriods, eq(measurementItems.periodId, measurementPeriods.id))
          .where(eq(measurementPeriods.budgetId, input.budgetId));
        return allItems;
      }),
    // ── Boletim de Medição — dados completos para PDF ──────────────────────
    getBoletimData: protectedProcedure
      .input(z.object({ budgetId: z.number(), periodId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        // Verificar acesso
        const budgetRows = await database.select().from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budgetRows.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        const budget = budgetRows[0];
        // Dados do cliente
        const clientRows = budget.clientId
          ? await database.select().from(clients).where(eq(clients.id, budget.clientId)).limit(1)
          : [];
        const client = clientRows[0] || null;
        // Dados do projeto
        const projectRows = budget.projectId
          ? await database.select({ name: projects.name }).from(projects).where(eq(projects.id, budget.projectId)).limit(1)
          : [];
        const project = projectRows[0] || null;
        // Configurações da empresa
        const companyRows = await database.select().from(companySettings)
          .where(eq(companySettings.userId, ctx.user.id)).limit(1);
        const company = companyRows[0] || null;
        // Todos os períodos do orçamento
        const allPeriods = await database.select().from(measurementPeriods)
          .where(eq(measurementPeriods.budgetId, input.budgetId))
          .orderBy(measurementPeriods.periodNumber);
        // Período selecionado
        const selectedPeriod = allPeriods.find(p => p.id === input.periodId);
        if (!selectedPeriod) throw new TRPCError({ code: "NOT_FOUND", message: "Período não encontrado" });
        // Todos os itens de medição do orçamento (todos os períodos)
        const allMeasurementItems = await database
          .select({
            id: measurementItems.id,
            periodId: measurementItems.periodId,
            budgetItemId: measurementItems.budgetItemId,
            percentMeasured: measurementItems.percentMeasured,
            valueMeasured: measurementItems.valueMeasured,
          })
          .from(measurementItems)
          .innerJoin(measurementPeriods, eq(measurementItems.periodId, measurementPeriods.id))
          .where(eq(measurementPeriods.budgetId, input.budgetId));
        // Aditivos aprovados
        const approvedAdditives = await db.rawQuery(
          `SELECT * FROM budget_additives WHERE budgetId = ${input.budgetId} AND status = 'aprovado' ORDER BY createdAt ASC`
        );
        // Medições de aditivos (todos os períodos)
        const additiveMeasurements = approvedAdditives.length > 0
          ? await db.rawQuery(
              `SELECT am.*, mp.periodNumber FROM additive_measurements am
               JOIN measurement_periods mp ON mp.id = am.periodId
               WHERE am.additiveId IN (${approvedAdditives.map((a: any) => a.id).join(",")})
               ORDER BY mp.periodNumber ASC`
            )
          : [];
        // Etapas e itens do aditivo
        const additiveStagesAll = approvedAdditives.length > 0
          ? await db.rawQuery(
              `SELECT * FROM additive_stages WHERE additiveId IN (${approvedAdditives.map((a: any) => a.id).join(",")}) ORDER BY \`order\` ASC, id ASC`
            )
          : [];
        const additiveItemsAll = approvedAdditives.length > 0
          ? await db.rawQuery(
              `SELECT ai.* FROM additive_items ai WHERE ai.additiveId IN (${approvedAdditives.map((a: any) => a.id).join(",")}) ORDER BY ai.\`order\` ASC, ai.id ASC`
            )
          : [];
        return {
          budget: {
            id: budget.id,
            title: budget.title,
            socialCharges: Number(budget.socialCharges || 0),
            adminCentral: Number(budget.adminCentral || 0),
            profit: Number(budget.profit || 0),
            taxes: Number(budget.taxes || 0),
            risk: Number(budget.risk || 0),
            warranty: Number(budget.warranty || 0),
            includeMaterial: Number(budget.includeMaterial ?? 1) !== 0,
          },
          client: client ? { name: client.name, document: client.document } : null,
          projectName: project?.name || null,
          company: company ? {
            companyName: company.companyName,
            cnpj: company.cnpj,
            responsibleName: company.responsibleName,
            responsibleTitle: company.responsibleTitle,
            phone: company.phone,
            email: company.email,
            logoUrl: company.logoUrl || null,
          } : null,
          selectedPeriod: {
            id: selectedPeriod.id,
            name: selectedPeriod.name,
            periodNumber: selectedPeriod.periodNumber,
            startDate: selectedPeriod.startDate instanceof Date ? selectedPeriod.startDate.toISOString().split('T')[0] : (selectedPeriod.startDate ? String(selectedPeriod.startDate) : null),
            endDate: selectedPeriod.endDate instanceof Date ? selectedPeriod.endDate.toISOString().split('T')[0] : (selectedPeriod.endDate ? String(selectedPeriod.endDate) : null),
            status: selectedPeriod.status as "open" | "closed",
          },
          allPeriods: allPeriods.map(p => ({
            id: p.id,
            periodNumber: p.periodNumber,
            name: p.name,
            startDate: p.startDate instanceof Date ? p.startDate.toISOString().split('T')[0] : (p.startDate ? String(p.startDate) : null),
            endDate: p.endDate instanceof Date ? p.endDate.toISOString().split('T')[0] : (p.endDate ? String(p.endDate) : null),
            status: p.status as "open" | "closed",
          })),
          allMeasurementItems,
          approvedAdditives: approvedAdditives.map((a: any) => ({
            id: a.id,
            name: a.name,
            totalCostWithBdi: parseFloat(a.totalCostWithBdi || "0"),
          })),
          additiveStagesAll,
          additiveItemsAll,
          additiveMeasurements,
        };
      }),
    getCashFlow: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        // Verificar acesso ao orçamento
        const budget = await database.select({ id: budgets.id }).from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id))).limit(1);
        if (!budget.length) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        
        // Buscar desembolsos previstos do Gantt
        const schedulePeriods = await database.select().from(budgetSchedulePeriods)
          .where(eq(budgetSchedulePeriods.budgetId, input.budgetId));
        
        // Buscar medições realizadas
        const measurements = await database.select().from(measurementItems)
          .where(eq(measurementItems.budgetId, input.budgetId));
        
        // Buscar períodos de medição para datas
        const mPeriods = await database.select().from(measurementPeriods)
          .where(eq(measurementPeriods.budgetId, input.budgetId));
        
        // Buscar aditivos
        const additives = await database.select().from(contractAdditives)
          .where(eq(contractAdditives.budgetId, input.budgetId));
        
        // Agregar por mês
        const cashFlowByMonth: Record<string, { previsto: number; realizado: number; aditivos: number }> = {};
        
        // Adicionar desembolsos previstos
        schedulePeriods.forEach((sp: any) => {
          const date = new Date(sp.startDate || new Date());
          const month = date.toISOString().substring(0, 7);
          if (!cashFlowByMonth[month]) cashFlowByMonth[month] = { previsto: 0, realizado: 0, aditivos: 0 };
          cashFlowByMonth[month].previsto += Number(sp.financialAmount || 0);
        });
        
        // Adicionar desembolsos realizados
        measurements.forEach((m: any) => {
          const period = mPeriods.find((mp: any) => mp.id === m.periodId);
          const date = new Date(period?.createdAt || new Date());
          const month = date.toISOString().substring(0, 7);
          if (!cashFlowByMonth[month]) cashFlowByMonth[month] = { previsto: 0, realizado: 0, aditivos: 0 };
          cashFlowByMonth[month].realizado += Number(m.valueMeasured || 0);
        });
        
        // Adicionar aditivos
        additives.forEach((a: any) => {
          const date = new Date(a.date || new Date());
          const month = date.toISOString().substring(0, 7);
          if (!cashFlowByMonth[month]) cashFlowByMonth[month] = { previsto: 0, realizado: 0, aditivos: 0 };
          const valor = Number(a.value || 0);
          cashFlowByMonth[month].aditivos += a.type === 'acrescimo' ? valor : -valor;
        });
        
        // Converter para array e calcular acumulados
        const result = Object.entries(cashFlowByMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, values], idx, arr) => {
            const acumPrevisto = arr.slice(0, idx + 1).reduce((sum, [, v]) => sum + v.previsto, 0);
            const acumRealizado = arr.slice(0, idx + 1).reduce((sum, [, v]) => sum + v.realizado, 0);
            const acumAditivos = arr.slice(0, idx + 1).reduce((sum, [, v]) => sum + v.aditivos, 0);
            return {
              month,
              previsto: values.previsto,
              realizado: values.realizado,
              aditivos: values.aditivos,
              diferenca: values.realizado - values.previsto,
              acumPrevisto,
              acumRealizado,
              acumAditivos,
              acumDiferenca: acumRealizado - acumPrevisto,
            };
          });
        
        return result;
      }),

  }),

  // Cash Flow Entries
  cashFlow: router({
    create: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        month: z.string(),
        type: z.enum(['entrada', 'saida']),
        category: z.string(),
        description: z.string(),
        amount: z.number(),
        reference: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createCashFlowEntry(input.budgetId, input.month, input.type, input.category, input.description, input.amount, input.reference);
      }),

    list: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        month: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getCashFlowEntries(input.budgetId, input.month);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.deleteCashFlowEntry(input.id);
      }),

    getSummary: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        month: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getCashFlowSummary(input.budgetId, input.month || '');
      }),
  }),

  // ===== TRANSAÇÕES FINANCEIRAS =====
  transactions: router({
    list: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        type: z.enum(['entrada', 'saida']).optional(),
        category: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return await db.listFinancialTransactions(input.budgetId, {
          startDate: input.startDate,
          endDate: input.endDate,
          type: input.type,
          category: input.category,
        });
      }),

    getSummary: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ input }) => {
        return await db.getFinancialSummary(input.budgetId);
      }),

    create: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        date: z.string(),
        type: z.enum(['entrada', 'saida']),
        category: z.string().optional(),
        description: z.string().min(1),
        payeeName: z.string().optional(),
        value: z.number().positive(),
      }))
      .mutation(async ({ input }) => {
        return await db.createFinancialTransaction({
          budgetId: input.budgetId,
          date: input.date,
          type: input.type,
          category: input.category,
          description: input.description,
          payeeName: input.payeeName,
          value: input.value,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        date: z.string().optional(),
        type: z.enum(['entrada', 'saida']).optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        payeeName: z.string().optional(),
        value: z.number().positive().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateFinancialTransaction(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteFinancialTransaction(input.id);
      }),
  }),

  // ============================================================
  // MÓDULO FINANCEIRO CORPORATIVO
  // ============================================================

  bankAccounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.listBankAccounts(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        bank: z.string().min(1),
        type: z.enum(['corrente', 'poupanca', 'caixa']),
        agency: z.string().optional(),
        accountNumber: z.string().optional(),
        initialBalance: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createBankAccount(ctx.user.id, input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        bank: z.string().optional(),
        type: z.enum(['corrente', 'poupanca', 'caixa']).optional(),
        agency: z.string().optional(),
        accountNumber: z.string().optional(),
        initialBalance: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await db.updateBankAccount(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteBankAccount(input.id, ctx.user.id);
      }),

    getBalance: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getBankAccountBalance(input.id, ctx.user.id);
      }),
  }),

  fleetVehicles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.listFleetVehicles(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        type: z.enum(['veiculo', 'maquina']),
        description: z.string().min(1),
        plate: z.string().optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createFleetVehicle(ctx.user.id, input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        type: z.enum(['veiculo', 'maquina']).optional(),
        description: z.string().optional(),
        plate: z.string().optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        status: z.enum(['ativo', 'inativo']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await db.updateFleetVehicle(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteFleetVehicle(input.id, ctx.user.id);
      }),
  }),

  corporateFinance: router({
    list: protectedProcedure
      .input(z.object({
        costCenter: z.enum(['obra', 'administrativo', 'frota']).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        type: z.enum(['entrada', 'saida']).optional(),
        bankAccountId: z.number().optional(),
        vehicleId: z.number().optional(),
        budgetId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.listCorporateTransactions(ctx.user.id, input);
      }),

    create: protectedProcedure
      .input(z.object({
        costCenter: z.enum(['administrativo', 'frota']),
        date: z.string(),
        type: z.enum(['entrada', 'saida']),
        category: z.string(),
        description: z.string().min(1),
        value: z.number().positive(),
        bankAccountId: z.number().optional(),
        vehicleId: z.number().optional(),
        payeeName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createCorporateTransaction(ctx.user.id, input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        date: z.string().optional(),
        type: z.enum(['entrada', 'saida']).optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        value: z.number().positive().optional(),
        bankAccountId: z.number().optional(),
        vehicleId: z.number().optional(),
        payeeName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await db.updateCorporateTransaction(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteCorporateTransaction(input.id, ctx.user.id);
      }),

    summary: protectedProcedure
      .input(z.object({
        dateFrom: z.string(),
        dateTo: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getCorporateSummary(ctx.user.id, input.dateFrom, input.dateTo);
      }),
  }),

  budgetWorkStatus: router({
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        workStatus: z.enum(['orcamento', 'contrato', 'execucao', 'finalizada', 'nao_fechada']),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.updateBudgetWorkStatus(input.id, ctx.user.id, input.workStatus);
      }),
  }),

  // ---- Congelamento de Orçamento ----
  budgetFreeze: router({
    freeze: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const frozenBy = ctx.user.name || ctx.user.openId || 'Usuário';
        return await db.freezeBudget(input.budgetId, ctx.user.id, frozenBy);
      }),

    unfreeze: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.unfreezeBudget(input.budgetId, ctx.user.id);
      }),

    getStatus: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) return { frozen: false, frozenAt: null, frozenBy: null };
        const { budgets } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const result = await database
          .select({ frozenAt: budgets.frozenAt, frozenBy: budgets.frozenBy })
          .from(budgets)
          .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)))
          .limit(1);
        if (!result[0]) return { frozen: false, frozenAt: null, frozenBy: null };
        return {
          frozen: result[0].frozenAt !== null,
          frozenAt: result[0].frozenAt,
          frozenBy: result[0].frozenBy,
        };
      }),
  }),
});
export type AppRouter = typeof appRouter;
