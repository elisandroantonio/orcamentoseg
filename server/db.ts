import { eq, and, desc, sql, or, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql2 from 'mysql2/promise';
// drizzle() espera o Pool "cru" (estilo callback) do pacote base mysql2
// quando recebe um objeto pronto em vez de string — ele mesmo chama
// `.promise()` internamente. Usado só pra montar o pool com keep-alive.
import mysql2Base from 'mysql2';
import {
  InsertUser, users,
  inputs, compositions, compositionInputs,
  projects, budgets, budgetItems, budgetItemInputs, budgetStages, budgetItemBdiConfig,
  scheduleActivities, schedulePeriods, disbursements, financialTransactions, FinancialTransaction
} from "../drizzle/schema";
import { ENV } from './_core/env';

// Bancos serverless (TiDB Cloud) fecham conexões ociosas em silêncio depois
// de um tempo sem uso — sem keep-alive, a próxima consulta cai numa conexão
// "morta" e falha do nada (era a causa de logins caindo no meio do
// trabalho). enableKeepAlive mantém a conexão TCP viva, reduzindo bastante
// a frequência disso.
const KEEP_ALIVE_OPTIONS = {
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
} as const;

let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!_db && dbUrl) {
    try {
      const pool = mysql2Base.createPool({
        uri: dbUrl,
        connectionLimit: 10,
        ...KEEP_ALIVE_OPTIONS,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Direct mysql2 query helper — bypasses Drizzle prepared statements (needed for TiDB compatibility with complex JOINs)
let _rawConn: mysql2.Connection | null = null;
async function getRawConn() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('No DATABASE_URL');
  if (!_rawConn) {
    _rawConn = await mysql2.createConnection({ uri: dbUrl, ...KEEP_ALIVE_OPTIONS });
  }
  return _rawConn;
}
// `params` opcional: quando presente, usa placeholders `?` no SQL e o driver
// (mysql2) escapa cada valor corretamente — evita quebrar/injetar SQL com
// texto livre (nomes com apóstrofo, etc.). Chamadas antigas sem `params`
// continuam funcionando exatamente como antes.
export async function rawQuery(sql: string, params?: any[]): Promise<any[]> {
  try {
    const conn = await getRawConn();
    const [rows] = await conn.query(sql, params);
    return rows as any[];
  } catch (err: any) {
    // reconnect once on connection error
    _rawConn = null;
    const conn = await getRawConn();
    const [rows] = await conn.query(sql, params);
    return rows as any[];
  }
}

export async function rawQueryParams(sql: string, params: any[]): Promise<any[]> {
  try {
    const conn = await getRawConn();
    const [rows] = await conn.execute(sql, params);
    return rows as any[];
  } catch (err: any) {
    _rawConn = null;
    const conn = await getRawConn();
    const [rows] = await conn.execute(sql, params);
    return rows as any[];
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

// Roda em toda requisição autenticada (verificação de sessão) — uma falha
// passageira de conexão aqui derrubava o usuário pro login no meio do
// trabalho. Tenta mais uma vez antes de desistir.
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  let result;
  try {
    result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  } catch (error) {
    console.warn("[Database] getUserByOpenId falhou, tentando de novo...", error);
    await new Promise(resolve => setTimeout(resolve, 400));
    result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  }

  return result.length > 0 ? result[0] : undefined;
}

// Read-only helper used only by the local dev login (devAuth.ts) to figure
// out which existing account actually owns the data in the connected
// database, instead of guessing an openId.
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users);
}

// Inputs
export async function getInputsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inputs).where(eq(inputs.userId, userId)).orderBy(desc(inputs.createdAt));
}

export async function getInputById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inputs).where(and(eq(inputs.id, id), eq(inputs.userId, userId))).limit(1);
  return result[0];
}

export async function searchInputs(userId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  
  // Construir condições de busca
  const conditions: any[] = [eq(inputs.userId, userId)];
  
  // Se houver busca, adicionar filtro por palavras-chave
  if (search && search.trim()) {
    const keywords = search.trim().split(/\s+/); // Dividir por espaços
    const searchConditions = keywords.map(keyword => 
      or(
        like(inputs.description, `%${keyword}%`),
        like(inputs.code, `%${keyword}%`)
      )
    );
    conditions.push(...searchConditions);
  }
  
  return db.select()
    .from(inputs)
    .where(and(...conditions))
    .orderBy(desc(inputs.createdAt));
}

// Compositions
export async function getCompositionsByUserId(userId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  
  // Construir condições de busca
  const conditions: any[] = [eq(compositions.userId, userId)];
  
  // Se houver busca, adicionar filtro por palavras-chave
  if (search && search.trim()) {
    const keywords = search.trim().split(/\s+/); // Dividir por espaços
    const searchConditions = keywords.map(keyword => 
      or(
        like(compositions.description, `%${keyword}%`),
        like(compositions.code, `%${keyword}%`)
      )
    );
    conditions.push(...searchConditions);
  }
  
  return db.select()
    .from(compositions)
    .where(and(...conditions))
    .orderBy(desc(compositions.createdAt));
}

export async function getCompositionById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(compositions).where(and(eq(compositions.id, id), eq(compositions.userId, userId))).limit(1);
  return result[0];
}

export async function getCompositionInputs(compositionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: compositionInputs.id,
    compositionId: compositionInputs.compositionId,
    inputId: compositionInputs.inputId,
    quantity: compositionInputs.quantity,
    coefficient: compositionInputs.coefficient,
    input: inputs,
  }).from(compositionInputs)
    .leftJoin(inputs, eq(compositionInputs.inputId, inputs.id))
    .where(eq(compositionInputs.compositionId, compositionId));
}

// Projects
export async function getProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

export async function getProjectById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
  return result[0];
}

// Budgets
export async function getBudgetsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { clients } = await import("../drizzle/schema");
  return db.select({
    id: budgets.id,
    userId: budgets.userId,
    clientId: budgets.clientId,
    projectId: budgets.projectId,
    title: budgets.title,
    description: budgets.description,
    totalCost: budgets.totalCost,
    totalLaborHours: budgets.totalLaborHours,
    startDate: budgets.startDate,
    endDate: budgets.endDate,
    durationMonths: budgets.durationMonths,
    periodType: budgets.periodType,
    status: budgets.status,
    workStatus: budgets.workStatus,
    frozenAt: budgets.frozenAt,
    frozenBy: budgets.frozenBy,
    createdAt: budgets.createdAt,
    updatedAt: budgets.updatedAt,
    project: projects,
    client: clients,
  }).from(budgets)
    .leftJoin(projects, eq(budgets.projectId, projects.id))
    .leftJoin(clients, eq(budgets.clientId, clients.id))
    .where(eq(budgets.userId, userId))
    .orderBy(desc(budgets.createdAt));
}

export async function getBudgetById(id: number, userId: number) {
  // Usar rawQuery para evitar problema de JOIN varchar/int no TiDB
  // (budgets.projectId é varchar no banco mas projects.id é int)
  const rows = await rawQuery(
    `SELECT b.id, b.userId, b.clientId, b.projectId, b.title, b.squareMeters,
            b.description, b.observations, b.socialCharges, b.adminCentral,
            b.profit, b.taxes, b.risk, b.warranty,
            b.totalMaterialCost, b.totalLaborCost, b.totalCost, b.totalLaborHours,
            b.startDate, b.endDate, b.durationMonths, b.periodType,
            b.status, b.workStatus, b.frozenAt, b.frozenBy,
            b.includeMaterial, b.createdAt, b.updatedAt, b.code,
            p.id as proj_id, p.userId as proj_userId, p.name as proj_name,
            p.client as proj_client, p.location as proj_location,
            p.description as proj_description, p.startDate as proj_startDate,
            p.endDate as proj_endDate, p.status as proj_status,
            p.createdAt as proj_createdAt, p.updatedAt as proj_updatedAt
     FROM budgets b
     LEFT JOIN projects p ON CAST(b.projectId AS UNSIGNED) = p.id
     WHERE b.id = ${id} AND b.userId = ${userId}
     LIMIT 1`
  );
  if (!rows || rows.length === 0) return undefined;
  const row = rows[0] as any;
  const project = row.proj_id ? {
    id: row.proj_id,
    userId: row.proj_userId,
    name: row.proj_name,
    client: row.proj_client,
    location: row.proj_location,
    description: row.proj_description,
    startDate: row.proj_startDate,
    endDate: row.proj_endDate,
    status: row.proj_status,
    createdAt: row.proj_createdAt,
    updatedAt: row.proj_updatedAt,
  } : null;
  return {
    id: row.id,
    userId: row.userId,
    clientId: row.clientId,
    projectId: row.projectId,
    title: row.title,
    squareMeters: row.squareMeters,
    description: row.description,
    observations: row.observations,
    socialCharges: row.socialCharges,
    adminCentral: row.adminCentral,
    profit: row.profit,
    taxes: row.taxes,
    risk: row.risk,
    warranty: row.warranty,
    totalMaterialCost: row.totalMaterialCost,
    totalLaborCost: row.totalLaborCost,
    totalCost: row.totalCost,
    totalLaborHours: row.totalLaborHours,
    startDate: row.startDate,
    endDate: row.endDate,
    durationMonths: row.durationMonths,
    periodType: row.periodType,
    status: row.status,
    workStatus: row.workStatus,
    frozenAt: row.frozenAt,
    frozenBy: row.frozenBy,
    includeMaterial: row.includeMaterial,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    code: row.code,
    project,
  };
}

export async function getBudgetItems(budgetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetItems).where(eq(budgetItems.budgetId, budgetId)).orderBy(budgetItems.order);
}

// Recalcular custos da composição baseado nos insumos
export async function recalculateCompositionCosts(compositionId: number) {
  const db = await getDb();
  if (!db) return;
  
  const inputs = await getCompositionInputs(compositionId);
  
  let materialCost = 0;
  let laborCost = 0;
  let equipmentCost = 0;
  
  for (const item of inputs) {
    if (!item.input) continue;
    const cost = Number(item.input.unitCost) * Number(item.coefficient);
    if (item.input.type === "material") {
      materialCost += cost;
    } else if (item.input.type === "labor") {
      laborCost += cost;
    } else if (item.input.type === "equipment") {
      equipmentCost += cost;
    }
  }
  
  await db.update(compositions)
    .set({ 
      materialCost: materialCost.toFixed(2), 
      laborCost: laborCost.toFixed(2),
      equipmentCost: equipmentCost.toFixed(2)
    })
    .where(eq(compositions.id, compositionId));
}

// Recalcular totalCost de um item de composição baseado nos insumos customizados ou na composição
export async function recalculateItemTotalCost(budgetItemId: number) {
  const db = await getDb();
  if (!db) return;
  
  const item = await db.select().from(budgetItems).where(eq(budgetItems.id, budgetItemId)).limit(1);
  if (!item[0]) return;
  
  const budgetItem = item[0];
  
  // Se é uma composição, recalcular baseado nos insumos
  if (budgetItem.type === 'composition' && budgetItem.compositionId) {
    // Verificar se há customizações (budgetItemInputs)
    const customInputs = await db.select().from(budgetItemInputs).where(eq(budgetItemInputs.budgetItemId, budgetItemId));
    
    let materialCost = 0;
    let laborCost = 0;
    let equipmentCost = 0;
    
    if (customInputs.length > 0) {
      // Usar customizações
      for (const customInput of customInputs) {
        const input = await db.select().from(inputs).where(eq(inputs.id, customInput.inputId)).limit(1);
        if (input[0]) {
          const cost = Number(customInput.coefficient) * Number(customInput.unitCost);
          const inputType = input[0].type.toLowerCase();
          if (inputType === 'material') {
            materialCost += cost;
          } else if (inputType === 'labor') {
            laborCost += cost;
          } else if (inputType === 'equipment') {
            equipmentCost += cost;
          }
        }
      }
    } else {
      // Usar composição padrão
      const composition = await db.select().from(compositions).where(eq(compositions.id, budgetItem.compositionId)).limit(1);
      if (composition[0]) {
        materialCost = Number(composition[0].materialCost || 0);
        laborCost = Number(composition[0].laborCost || 0);
        equipmentCost = Number(composition[0].equipmentCost || 0);
      }
    }
    
    const unitCost = materialCost + laborCost + equipmentCost;
    const totalCost = Number(budgetItem.quantity) * unitCost;
    
    await db.update(budgetItems)
      .set({ 
        materialCost: materialCost.toFixed(2),
        laborCost: laborCost.toFixed(2),
        equipmentCost: equipmentCost.toFixed(2),
        unitCost: unitCost.toFixed(2),
        totalCost: totalCost.toFixed(2)
      })
      .where(eq(budgetItems.id, budgetItemId));
  }
}

/**
 * Corrige o campo `scheduleOrder` de todas as etapas/sub-etapas de um
 * orçamento — a ordem de exibição usada SÓ na aba Gantt (seletores de
 * Etapa/Predecessora/Sucessora, tabela "Etapas Configuradas", setas de
 * mover, dropdown de Posição). Renumera em pré-ordem de árvore: cada etapa
 * raiz, seguida imediatamente de suas próprias sub-etapas, antes de passar
 * pra próxima raiz — a hierarquia (etapa > sub-etapa) é sempre respeitada.
 *
 * IMPORTANTE: isso NUNCA toca no campo `order` (esse é o número que aparece
 * na Estrutura do Orçamento/planilha, ex: "3 - BARRILHETE", "3.1 -
 * PAVIMENTAÇÃO" — reflete a ordem em que o orçamento foi montado, e é
 * assunto completamente separado do cronograma). Os dois já foram
 * confundidos numa versão anterior desta função, fazendo a numeração da
 * planilha mudar sozinha quando o Gantt era reorganizado — por isso agora
 * são campos diferentes.
 *
 * Dentro de cada grupo de irmãs (todas as etapas raiz entre si, e todas as
 * sub-etapas de uma mesma etapa-mãe entre si), a ordem é decidida pela Data
 * de Início: quem começa mais cedo vem primeiro. Etapas sem data (ou
 * empatadas na mesma data) usam o `scheduleOrder`/`order`/`id` anteriores
 * como critério de desempate, só pra manter alguma ordem estável.
 *
 * Chamada automaticamente ao final de createStage, então não depende do
 * usuário clicar em "Reorganizar Etapas" pra corrigir isso na hora.
 */
export async function normalizeStageOrder(budgetId: number): Promise<void> {
  const database = await getDb();
  if (!database) return;

  const allStages = await database
    .select({
      id: budgetStages.id,
      parentStageId: budgetStages.parentStageId,
      order: budgetStages.order,
      scheduleOrder: budgetStages.scheduleOrder,
      startDate: budgetStages.startDate,
    })
    .from(budgetStages)
    .where(eq(budgetStages.budgetId, budgetId));

  const byParent = new Map<number | null, typeof allStages>();
  for (const s of allStages) {
    const key = s.parentStageId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }
  for (const arr of Array.from(byParent.values())) {
    arr.sort((a, b) => {
      const aTime = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const bTime = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return (a.scheduleOrder ?? a.order ?? 0) - (b.scheduleOrder ?? b.order ?? 0) || a.id - b.id;
    });
  }
  const canonicalOrder: { id: number; scheduleOrder: number }[] = [];
  const visited = new Set<number>();
  const walk = (parentId: number | null) => {
    for (const child of byParent.get(parentId) || []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      canonicalOrder.push({ id: child.id, scheduleOrder: canonicalOrder.length });
      walk(child.id);
    }
  };
  walk(null);
  for (const s of allStages) {
    if (!visited.has(s.id)) canonicalOrder.push({ id: s.id, scheduleOrder: canonicalOrder.length });
  }

  const changed = canonicalOrder.filter((c) => {
    const original = allStages.find((s) => s.id === c.id);
    return original && original.scheduleOrder !== c.scheduleOrder;
  });
  if (changed.length === 0) return;

  const caseSql = changed.map(() => `WHEN ? THEN ?`).join(' ');
  const caseParams: any[] = [];
  for (const c of changed) caseParams.push(c.id, c.scheduleOrder);
  const ids = changed.map((c) => c.id);
  const inSql = ids.map(() => '?').join(',');
  await rawQuery(
    `UPDATE budget_stages SET scheduleOrder = CASE id ${caseSql} END WHERE id IN (${inSql})`,
    [...caseParams, ...ids]
  );
}

export async function recalculateBudgetTotals(
  budgetId: number,
  options?: { skipItemCostRecalc?: boolean }
) {
  const db = await getDb();
  if (!db) return;

  // Usar rawQuery para evitar cache de prepared statements do Drizzle
  const items = await rawQuery(`SELECT * FROM budget_items WHERE budgetId = ? ORDER BY \`order\``, [budgetId]);

  // Recalcular totalCost (material/mão de obra/equipamento por unidade) de
  // cada item de composição. Isso é caro (várias idas ao banco por item —
  // insumos customizados, composição base, etc.) e só é necessário quando
  // algo que afeta o CUSTO UNITÁRIO mudou (composição trocada, insumo
  // customizado editado). Quando a única mudança foi a QUANTIDADE de um
  // item (o caso mais comum, digitado a cada edição), o custo unitário de
  // ninguém mudou — pular esse loop evita recalcular o orçamento inteiro
  // a cada tecla, que deixava a edição de quantidade lenta.
  if (!options?.skipItemCostRecalc) {
    for (const item of items) {
      if (item.type === 'composition') {
        await recalculateItemTotalCost(item.id);
      }
    }
  }

  // Só refaz a busca dos itens quando algo pode ter mudado (o recalc acima).
  // Quando skipItemCostRecalc=true os itens não foram tocados — reusar
  // `items` evita mais uma ida ao banco (a conexão "crua" usada por
  // rawQuery é uma única conexão, não um pool, então cada ida extra é um
  // round-trip inteiro até o TiDB Cloud).
  const updatedItems = options?.skipItemCostRecalc
    ? items
    : await rawQuery(`SELECT * FROM budget_items WHERE budgetId = ? ORDER BY \`order\``, [budgetId]);

  // Recalcular totais das sub-etapas
  const stages = await db.select().from(budgetStages).where(eq(budgetStages.budgetId, budgetId));

  // PASSO 1: sub-etapas (que têm parentStageId) — calcula tudo em memória
  const stageTotals = new Map<number, string>();
  for (const stage of stages) {
    if (stage.parentStageId !== null) {
      const stageItems = updatedItems.filter((item: any) => item.stageId === stage.id);
      const stageTotalCost = stageItems.reduce((sum: number, item: any) => {
        const matAdj = 1 + Number(item.materialAdjustment || 0) / 100;
        const labAdj = 1 + Number(item.laborAdjustment || 0) / 100;
        const qty = Number(item.quantity || 1);
        const mat = Number(item.materialCost || 0) * matAdj;
        const lab = Number(item.laborCost || 0) * labAdj;
        const eq = Number(item.equipmentCost || 0);
        const svc = Number(item.serviceCost || 0);
        const oth = Number(item.otherCost || 0);
        return sum + (mat + lab + eq + svc + oth) * qty;
      }, 0);
      stageTotals.set(stage.id, stageTotalCost.toFixed(2));
    }
  }

  // PASSO 2: etapas pai (que NÃO têm parentStageId) — itens diretos + sub-etapas já calculadas acima
  for (const stage of stages) {
    if (stage.parentStageId === null) {
      const directItems = updatedItems.filter(item => item.stageId === stage.id);
      const childStages = stages.filter(s => s.parentStageId === stage.id);

      const directItemsTotal = directItems.reduce((sum, item) => {
        const matAdj = 1 + Number((item as any).materialAdjustment || 0) / 100;
        const labAdj = 1 + Number((item as any).laborAdjustment || 0) / 100;
        const qty = Number((item as any).quantity || 1);
        const mat = Number((item as any).materialCost || 0) * matAdj;
        const lab = Number((item as any).laborCost || 0) * labAdj;
        const eq = Number((item as any).equipmentCost || 0);
        const svc = Number((item as any).serviceCost || 0);
        const oth = Number((item as any).otherCost || 0);
        return sum + (mat + lab + eq + svc + oth) * qty;
      }, 0);
      const childStagesTotal = childStages.reduce((sum, child) => sum + Number(stageTotals.get(child.id) ?? child.totalCost), 0);

      const parentTotalCost = directItemsTotal + childStagesTotal;
      stageTotals.set(stage.id, parentTotalCost.toFixed(2));
    }
  }

  // Grava todas as etapas em UMA única ida ao banco (UPDATE ... CASE WHEN),
  // em vez de um UPDATE sequencial por etapa. Com N etapas isso trocava N
  // round-trips ao TiDB Cloud por 1 — era o maior gargalo restante na
  // demora ao alterar quantidade de composições/serviços.
  if (stageTotals.size > 0) {
    const ids = Array.from(stageTotals.keys());
    const caseSql = ids.map(() => `WHEN ? THEN ?`).join(' ');
    const caseParams: any[] = [];
    for (const id of ids) caseParams.push(id, stageTotals.get(id));
    const inSql = ids.map(() => '?').join(',');
    await rawQuery(
      `UPDATE budget_stages SET totalCost = CASE id ${caseSql} END WHERE id IN (${inSql})`,
      [...caseParams, ...ids]
    );
  }

  // Buscar parâmetros de BDI do orçamento
  const budget = await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1);
  if (!budget[0]) return;
  
  const socialCharges = Number(budget[0].socialCharges);
  const profit = Number(budget[0].profit);
  const taxes = Number(budget[0].taxes);
  const risk = Number(budget[0].risk);
  const warranty = Number(budget[0].warranty);
  
  // Buscar configurações de BDI de todos os itens (rawQuery para evitar cache de prepared statements)
  const bdiConfigs: Record<number, { applyBdiToMaterial: boolean; applyBdiToLabor: boolean; additionalIncrement: number }> = {};
  const allBdiConfigs = await rawQuery(
    `SELECT budgetItemId, applyBdiToMaterial, applyBdiToLabor, additionalIncrement
     FROM budget_item_bdi_config
     WHERE budgetItemId IN (${updatedItems.map(i => i.id).join(',') || '0'})`
  );
  for (const config of allBdiConfigs) {
    bdiConfigs[config.budgetItemId] = {
      applyBdiToMaterial: Boolean(config.applyBdiToMaterial),
      applyBdiToLabor: Boolean(config.applyBdiToLabor),
      additionalIncrement: Number(config.additionalIncrement || 0)
    };
  }
  
  // Calcular totalCost COM BDI aplicado
  let totalMaterialWithBDI = 0;
  let totalLaborWithBDI = 0;
  let totalLaborHours = 0;
  
  for (const item of updatedItems) {
    const qty = Number(item.quantity);
    const material = Number(item.materialCost || 0);
    const labor = Number(item.laborCost || 0);
    const equipment = Number(item.equipmentCost || 0);
    const service = Number(item.serviceCost || 0);
    const other = Number(item.otherCost || 0);
    
    // Buscar configuração de BDI para este item
    const itemConfig = bdiConfigs[item.id] || { applyBdiToMaterial: true, applyBdiToLabor: true, additionalIncrement: 0 };
    
    // BDI completo
    const bdiMultiplier = 1 + (profit + taxes + risk + warranty) / 100;
    
    // Aplicar ajuste de material e M.O. (equalização)
    const matAdjMultiplier = 1 + Number(item.materialAdjustment || 0) / 100;
    const labAdjMultiplier = 1 + Number(item.laborAdjustment || 0) / 100;
    const materialAdjusted = material * matAdjMultiplier;
    const laborAdjusted = labor * labAdjMultiplier;
    const laborWithChargesAdj = laborAdjusted * (1 + socialCharges / 100);
    
    // Aplicar BDI ao material apenas se configurado
    const materialWithBDI = itemConfig.applyBdiToMaterial ? materialAdjusted * bdiMultiplier : materialAdjusted;
    
    // Aplicar BDI à mão de obra apenas se configurado
    const laborWithBDI = itemConfig.applyBdiToLabor ? laborWithChargesAdj * bdiMultiplier : laborWithChargesAdj;
    
    // Equipment, service e other: aplicar BDI SEM encargos sociais
    const equipmentWithBDI = equipment * bdiMultiplier;
    const serviceWithBDI = service * bdiMultiplier;
    const otherWithBDI = other * bdiMultiplier;
    
    // Total de M.O. = labor com BDI + equipment/service/other com BDI
    let totalLaborItem = laborWithBDI + equipmentWithBDI + serviceWithBDI + otherWithBDI;
    
    // Aplicar incremento adicional se configurado
    if (itemConfig.additionalIncrement > 0) {
      const incrementMultiplier = 1 + itemConfig.additionalIncrement / 100;
      totalLaborItem = totalLaborItem * incrementMultiplier;
    }
    
    // Somar ao total geral
    totalMaterialWithBDI += materialWithBDI * qty;
    totalLaborWithBDI += totalLaborItem * qty;
    totalLaborHours += Number(item.totalLaborHours);
  }
  
  const totalCostWithBDI = totalMaterialWithBDI + totalLaborWithBDI;
  
  await db.update(budgets)
    .set({ totalCost: totalCostWithBDI.toFixed(2), totalLaborHours: totalLaborHours.toFixed(2) })
    .where(eq(budgets.id, budgetId));
}

// Schedule Activities
export async function getScheduleActivities(budgetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduleActivities).where(eq(scheduleActivities.budgetId, budgetId)).orderBy(scheduleActivities.order);
}

export async function getSchedulePeriods(activityId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(schedulePeriods).where(eq(schedulePeriods.activityId, activityId)).orderBy(schedulePeriods.periodStart);
}

// Disbursements
export async function getDisbursements(budgetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(disbursements).where(eq(disbursements.budgetId, budgetId)).orderBy(disbursements.dueDate);
}

/**
 * Calcula valores com BDI aplicado
 * 
 * Regras:
 * - Encargos Sociais: aplicado APENAS em Mão de Obra
 * - Lucro + Impostos + Risco + Garantia: aplicado em TUDO (Material + M.O. + Equipamento)
 * 
 * Fórmula:
 * - M.O. com BDI = M.O. × (1 + encargos/100) × (1 + bdiGeral/100)
 * - Material com BDI = Material × (1 + bdiGeral/100)
 * - Equipamento com BDI = Equipamento × (1 + bdiGeral/100)
 */
export function applyBDI(params: {
  materialCost: number;
  laborCost: number;
  socialCharges: number; // %
  profit: number; // %
  taxes: number; // %
  risk: number; // %
  warranty: number; // %
}): {
  materialWithBDI: number;
  laborWithBDI: number;
  totalWithBDI: number;
  bdiGeneral: number; // % (lucro + impostos + risco + garantia)
} {
  const { materialCost, laborCost, socialCharges, profit, taxes, risk, warranty } = params;
  
  // BDI Geral (aplicado em tudo)
  const bdiGeneral = profit + taxes + risk + warranty;
  const bdiGeneralMultiplier = 1 + (bdiGeneral / 100);
  
  // Encargos Sociais (aplicado apenas em M.O.)
  const socialChargesMultiplier = 1 + (socialCharges / 100);
  
  // Cálculos
  const materialWithBDI = materialCost * bdiGeneralMultiplier;
  const laborWithBDI = laborCost * socialChargesMultiplier * bdiGeneralMultiplier;
  const totalWithBDI = materialWithBDI + laborWithBDI;
  
  return {
    materialWithBDI,
    laborWithBDI,
    totalWithBDI,
    bdiGeneral,
  };
}


// ============ CASH FLOW ENTRIES ============

export async function createCashFlowEntry(
  budgetId: number,
  month: string,
  type: 'entrada' | 'saida',
  category: string,
  description: string,
  amount: number,
  reference?: string
) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql.raw(
    `INSERT INTO cash_flow_entries (budgetId, month, type, category, description, amount, reference)
     VALUES (${budgetId}, '${month}', '${type}', '${category}', '${description}', ${amount}, ${reference ? `'${reference}'` : 'NULL'})`
  ));
  
  return result;
}

export async function getCashFlowEntries(budgetId: number, month?: string) {
  const db = await getDb();
  if (!db) return [];

  let query = `SELECT * FROM cash_flow_entries WHERE budgetId = ${budgetId}`;

  if (month) {
    query += ` AND month = '${month}'`;
  }

  query += ` ORDER BY month DESC, createdAt DESC`;

  const result = await db.execute(sql.raw(query));
  return (result as any[])[0] || [];
}

export async function getCashFlowSummary(budgetId: number, month: string) {
  const db = await getDb();
  if (!db) return { entradas: 0, saidas: 0, saldo: 0 };

  const result = await db.execute(sql.raw(
    `SELECT 
      SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END) as entradas,
      SUM(CASE WHEN type = 'saida' THEN amount ELSE 0 END) as saidas
     FROM cash_flow_entries 
     WHERE budgetId = ${budgetId} AND month = '${month}'`
  ));

  const row = ((result as any[])[0] as any[])?.[0];
  if (!row) return { entradas: 0, saidas: 0, saldo: 0 };

  const entradas = Number(row.entradas) || 0;
  const saidas = Number(row.saidas) || 0;
  
  return {
    entradas,
    saidas,
    saldo: entradas - saidas
  };
}

export async function deleteCashFlowEntry(id: number) {
  const db = await getDb();
  if (!db) return false;

  await db.execute(sql.raw(
    `DELETE FROM cash_flow_entries WHERE id = ${id}`
  ));
  
  return true;
}

export async function clearCashFlowPeriod(budgetId: number, month: string) {
  const db = await getDb();
  if (!db) return 0;

  await db.execute(sql.raw(
    `DELETE FROM cash_flow_entries WHERE budgetId = ${budgetId} AND month = '${month}'`
  ));
  
  return 0;
}

export async function getTotalMeasurementByMonth(budgetId: number, month: string) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.execute(sql.raw(
    `SELECT SUM(valueMeasured) as total FROM measurement_items 
     WHERE budgetId = ${budgetId} AND DATE_FORMAT(createdAt, '%Y-%m') = '${month}'`
  ));

  const row = ((result as any[])[0] as any[])?.[0];
  return Number(row?.total) || 0;
}

export async function getGanttDisburseByMonth(budgetId: number, month: string) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.execute(sql.raw(
    `SELECT SUM(amount) as total FROM budget_monthly_distribution 
     WHERE budgetId = ${budgetId} AND month = '${month}'`
  ));

  const row = ((result as any[])[0] as any[])?.[0];
  return Number(row?.total) || 0;
}


// ===== TRANSAÇÕES FINANCEIRAS =====

export async function listFinancialTransactions(
  budgetId: number,
  filters?: {
    startDate?: string;
    endDate?: string;
    type?: 'entrada' | 'saida';
    category?: string;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [eq(financialTransactions.budgetId, budgetId)];

  if (filters?.startDate) {
    conditions.push(sql`${financialTransactions.date} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`${financialTransactions.date} <= ${filters.endDate}`);
  }
  if (filters?.type) {
    conditions.push(eq(financialTransactions.type, filters.type));
  }
  if (filters?.category) {
    conditions.push(eq(financialTransactions.category, filters.category));
  }

  return await db.select()
    .from(financialTransactions)
    .where(and(...conditions))
    .orderBy(desc(financialTransactions.date));
}

export async function getFinancialSummary(budgetId: number) {
  const db = await getDb();
  if (!db) return { totalEntradas: 0, totalSaidas: 0, saldoLiquido: 0 };

  const entradas = await db.select({ total: sql<number>`SUM(value)` })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.budgetId, budgetId),
      eq(financialTransactions.type, 'entrada')
    ));

  const saidas = await db.select({ total: sql<number>`SUM(value)` })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.budgetId, budgetId),
      eq(financialTransactions.type, 'saida')
    ));

  const totalEntradas = Number(entradas[0]?.total) || 0;
  const totalSaidas = Number(saidas[0]?.total) || 0;

  return {
    totalEntradas,
    totalSaidas,
    saldoLiquido: totalEntradas - totalSaidas,
  };
}

export async function createFinancialTransaction(data: {
  budgetId: number;
  date: string;
  type: 'entrada' | 'saida';
  category?: string;
  description: string;
  payeeName?: string;
  value: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let finalDescription = data.description;
  if (data.payeeName) {
    finalDescription = `${data.description} (${data.payeeName})`;
  }

  // Use sql raw to insert date string directly, avoiding mysql2 timezone conversion
  // new Date(dateString) in UTC-4 server would shift '2026-05-02' to '2026-05-01'
  const result = await db.execute(
    sql`INSERT INTO financial_transactions (budgetId, date, type, category, description, value) VALUES (${data.budgetId}, ${data.date}, ${data.type}, ${data.category || null}, ${finalDescription}, ${data.value.toString()})`
  );

  return result;
}

export async function updateFinancialTransaction(
  id: number,
  data: Partial<{
    date: string;
    type: 'entrada' | 'saida';
    category: string;
    description: string;
    payeeName: string;
    value: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Build update object for non-date fields (Drizzle ORM handles these correctly)
  const updateObj: any = {};
  if (data.type) updateObj.type = data.type;
  if (data.category !== undefined) updateObj.category = data.category;
  if (data.description !== undefined || data.payeeName !== undefined) {
    const desc = data.description || '';
    const payee = data.payeeName || '';
    updateObj.description = payee ? `${desc} (${payee})` : desc;
  }
  if (data.value !== undefined) updateObj.value = data.value;

  // Update non-date fields first
  if (Object.keys(updateObj).length > 0) {
    await db.update(financialTransactions).set(updateObj).where(eq(financialTransactions.id, id));
  }

  // Update date separately using raw SQL to avoid mysql2 timezone conversion
  // mysql2 driver converts Date objects to local timezone (America/New_York = UTC-4)
  // which would shift '2026-05-02' to '2026-05-01' in the database
  if (data.date) {
    const dateStr = data.date; // e.g. '2026-05-02' - pass as string literal
    // sql.raw() below bypasses normal parameter escaping on purpose (needed
    // to dodge mysql2's timezone conversion — see comment above). Since it's
    // not escaped, enforce a strict YYYY-MM-DD shape first so nothing else
    // can ever reach the query as raw SQL text.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new Error(`Data inválida: ${dateStr}`);
    }
    return await db.execute(
      sql`UPDATE financial_transactions SET date = ${sql.raw(`'${dateStr}'`)} WHERE id = ${id}`
    );
  }
}

export async function deleteFinancialTransaction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(financialTransactions)
    .where(eq(financialTransactions.id, id));
}

// ============================================================
// MÓDULO FINANCEIRO CORPORATIVO
// ============================================================

// ---- Bank Accounts ----

export async function listBankAccounts(userId: number) {
  return rawQuery(`SELECT * FROM bank_accounts WHERE userId = ? ORDER BY name`, [userId]);
}

export async function createBankAccount(userId: number, data: {
  name: string; bank: string; type: 'corrente' | 'poupanca' | 'caixa';
  agency?: string; accountNumber?: string; initialBalance: number;
}) {
  return rawQuery(
    `INSERT INTO bank_accounts (userId, name, bank, type, agency, accountNumber, initialBalance, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [userId, data.name, data.bank, data.type, data.agency ?? null, data.accountNumber ?? null, data.initialBalance]
  );
}

export async function updateBankAccount(id: number, userId: number, data: Partial<{
  name: string; bank: string; type: 'corrente' | 'poupanca' | 'caixa';
  agency: string; accountNumber: string; initialBalance: number; isActive: boolean;
}>) {
  const parts: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { parts.push(`name = ?`); values.push(data.name); }
  if (data.bank !== undefined) { parts.push(`bank = ?`); values.push(data.bank); }
  if (data.type !== undefined) { parts.push(`type = ?`); values.push(data.type); }
  if (data.agency !== undefined) { parts.push(`agency = ?`); values.push(data.agency); }
  if (data.accountNumber !== undefined) { parts.push(`accountNumber = ?`); values.push(data.accountNumber); }
  if (data.initialBalance !== undefined) { parts.push(`initialBalance = ?`); values.push(data.initialBalance); }
  if (data.isActive !== undefined) { parts.push(`isActive = ?`); values.push(data.isActive ? 1 : 0); }
  if (parts.length === 0) return;
  values.push(id, userId);
  return rawQuery(`UPDATE bank_accounts SET ${parts.join(', ')} WHERE id = ? AND userId = ?`, values);
}

export async function deleteBankAccount(id: number, userId: number) {
  return rawQuery(`DELETE FROM bank_accounts WHERE id = ? AND userId = ?`, [id, userId]);
}

export async function getBankAccountBalance(id: number, userId: number) {
  const accounts = await rawQuery(`SELECT * FROM bank_accounts WHERE id = ? AND userId = ? LIMIT 1`, [id, userId]);
  const account = accounts[0];
  if (!account) return null;
  const txRows = await rawQuery(
    `SELECT COALESCE(SUM(CASE WHEN type='entrada' THEN value ELSE 0 END), 0) as totalIn, COALESCE(SUM(CASE WHEN type='saida' THEN value ELSE 0 END), 0) as totalOut FROM financial_transactions WHERE bankAccountId = ? AND userId = ?`,
    [id, userId]
  );
  const row = txRows[0] || { totalIn: 0, totalOut: 0 };
  const balance = parseFloat(account.initialBalance) + parseFloat(row.totalIn) - parseFloat(row.totalOut);
  return { ...account, currentBalance: balance };
}

// ---- Fleet Vehicles ----

export async function listFleetVehicles(userId: number) {
  return rawQuery(`SELECT * FROM fleet_vehicles WHERE userId = ? ORDER BY description`, [userId]);
}

export async function createFleetVehicle(userId: number, data: {
  type: 'veiculo' | 'maquina'; description: string; plate?: string;
  model?: string; year?: number; notes?: string;
}) {
  return rawQuery(
    `INSERT INTO fleet_vehicles (userId, type, description, plate, model, year, status, notes) VALUES (?, ?, ?, ?, ?, ?, 'ativo', ?)`,
    [userId, data.type, data.description, data.plate ?? null, data.model ?? null, data.year ?? null, data.notes ?? null]
  );
}

export async function updateFleetVehicle(id: number, userId: number, data: Partial<{
  type: 'veiculo' | 'maquina'; description: string; plate: string;
  model: string; year: number; status: 'ativo' | 'inativo'; notes: string;
}>) {
  const parts: string[] = [];
  const values: any[] = [];
  if (data.type) { parts.push(`type = ?`); values.push(data.type); }
  if (data.description !== undefined) { parts.push(`description = ?`); values.push(data.description); }
  if (data.plate !== undefined) { parts.push(`plate = ?`); values.push(data.plate ?? null); }
  if (data.model !== undefined) { parts.push(`model = ?`); values.push(data.model ?? null); }
  if (data.year !== undefined) { parts.push(`year = ?`); values.push(data.year ?? null); }
  if (data.status) { parts.push(`status = ?`); values.push(data.status); }
  if (data.notes !== undefined) { parts.push(`notes = ?`); values.push(data.notes ?? null); }
  if (parts.length === 0) return;
  values.push(id, userId);
  return rawQuery(`UPDATE fleet_vehicles SET ${parts.join(', ')} WHERE id = ? AND userId = ?`, values);
}

export async function deleteFleetVehicle(id: number, userId: number) {
  return rawQuery(`DELETE FROM fleet_vehicles WHERE id = ? AND userId = ?`, [id, userId]);
}

// ---- Corporate Financial Transactions (Admin + Frota) ----

export async function createCorporateTransaction(userId: number, data: {
  costCenter: 'administrativo' | 'frota';
  date: string;
  type: 'entrada' | 'saida';
  category: string;
  description: string;
  value: number;
  bankAccountId?: number;
  vehicleId?: number;
  payeeName?: string;
}) {
  return rawQuery(
    `INSERT INTO financial_transactions (userId, costCenter, date, type, category, description, value, bankAccountId, vehicleId, payeeName)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, data.costCenter, data.date, data.type, data.category, data.description,
      data.value, data.bankAccountId ?? null, data.vehicleId ?? null, data.payeeName ?? null,
    ]
  );
}

export async function updateCorporateTransaction(id: number, userId: number, data: Partial<{
  date: string; type: 'entrada' | 'saida'; category: string;
  description: string; value: number; bankAccountId: number; vehicleId: number; payeeName: string;
}>) {
  const setClauses: string[] = [];
  const values: any[] = [];
  if (data.date) { setClauses.push(`date = ?`); values.push(data.date); }
  if (data.type) { setClauses.push(`type = ?`); values.push(data.type); }
  if (data.category !== undefined) { setClauses.push(`category = ?`); values.push(data.category); }
  if (data.description !== undefined) { setClauses.push(`description = ?`); values.push(data.description); }
  if (data.value !== undefined) { setClauses.push(`value = ?`); values.push(data.value); }
  if (data.bankAccountId !== undefined) { setClauses.push(`bankAccountId = ?`); values.push(data.bankAccountId); }
  if (data.vehicleId !== undefined) { setClauses.push(`vehicleId = ?`); values.push(data.vehicleId); }
  if (data.payeeName !== undefined) { setClauses.push(`payeeName = ?`); values.push(data.payeeName ?? null); }
  if (setClauses.length > 0) {
    values.push(id, userId);
    await rawQuery(`UPDATE financial_transactions SET ${setClauses.join(', ')} WHERE id = ? AND userId = ?`, values);
  }
}

export async function deleteCorporateTransaction(id: number, userId: number) {
  return rawQuery(`DELETE FROM financial_transactions WHERE id = ? AND userId = ?`, [id, userId]);
}

export async function listCorporateTransactions(userId: number, filters: {
  costCenter?: 'obra' | 'administrativo' | 'frota';
  dateFrom?: string; dateTo?: string;
  type?: 'entrada' | 'saida';
  bankAccountId?: number;
  vehicleId?: number;
  budgetId?: number;
}) {
  let whereClause = `userId = ?`;
  const values: any[] = [userId];
  if (filters.costCenter) { whereClause += ` AND costCenter = ?`; values.push(filters.costCenter); }
  if (filters.dateFrom) { whereClause += ` AND date >= ?`; values.push(filters.dateFrom); }
  if (filters.dateTo) { whereClause += ` AND date <= ?`; values.push(filters.dateTo); }
  if (filters.type) { whereClause += ` AND type = ?`; values.push(filters.type); }
  if (filters.bankAccountId) { whereClause += ` AND bankAccountId = ?`; values.push(filters.bankAccountId); }
  if (filters.vehicleId) { whereClause += ` AND vehicleId = ?`; values.push(filters.vehicleId); }
  if (filters.budgetId) { whereClause += ` AND budgetId = ?`; values.push(filters.budgetId); }

  return rawQuery(
    `SELECT ft.*, b.title as budgetTitle, ba.name as bankAccountName, fv.description as vehicleName
     FROM financial_transactions ft
     LEFT JOIN budgets b ON ft.budgetId = b.id
     LEFT JOIN bank_accounts ba ON ft.bankAccountId = ba.id
     LEFT JOIN fleet_vehicles fv ON ft.vehicleId = fv.id
     WHERE ft.${whereClause}
     ORDER BY ft.date DESC, ft.createdAt DESC`,
    values
  );
}

// ---- Corporate Finance Summary (Painel Geral) ----

export async function getCorporateSummary(userId: number, dateFrom: string, dateTo: string) {
  const kpiRows = await rawQuery(
    `SELECT costCenter, type, COALESCE(SUM(value), 0) as total
     FROM financial_transactions
     WHERE userId = ? AND date >= ? AND date <= ?
     GROUP BY costCenter, type`,
    [userId, dateFrom, dateTo]
  );

  const byBudget = await rawQuery(
    `SELECT b.id as budgetId, b.title as budgetTitle, b.workStatus,
      COALESCE(SUM(CASE WHEN ft.type='entrada' THEN ft.value ELSE 0 END), 0) as totalIn,
      COALESCE(SUM(CASE WHEN ft.type='saida' THEN ft.value ELSE 0 END), 0) as totalOut
     FROM budgets b
     LEFT JOIN financial_transactions ft ON ft.budgetId = b.id AND ft.userId = ? AND ft.date >= ? AND ft.date <= ?
     WHERE b.userId = ? AND b.workStatus IN ('contrato', 'execucao')
     GROUP BY b.id, b.title, b.workStatus
     ORDER BY b.title`,
    [userId, dateFrom, dateTo, userId]
  );

  const adminByCategory = await rawQuery(
    `SELECT category, type, COALESCE(SUM(value), 0) as total
     FROM financial_transactions
     WHERE userId = ? AND costCenter = 'administrativo' AND date >= ? AND date <= ?
     GROUP BY category, type`,
    [userId, dateFrom, dateTo]
  );

  const monthly = await rawQuery(
    `SELECT DATE_FORMAT(date, '%Y-%m') as month, type, COALESCE(SUM(value), 0) as total
     FROM financial_transactions
     WHERE userId = ? AND date >= DATE_SUB(?, INTERVAL 12 MONTH) AND date <= ?
     GROUP BY DATE_FORMAT(date, '%Y-%m'), type
     ORDER BY month ASC`,
    [userId, dateTo, dateTo]
  );

  return { kpiRows, byBudget, adminByCategory, monthly };
}

// ---- Update Budget workStatus ----

export async function updateBudgetWorkStatus(id: number, userId: number, workStatus: 'orcamento' | 'contrato' | 'execucao' | 'finalizada' | 'nao_fechada') {
  await rawQuery(`UPDATE budgets SET workStatus = ? WHERE id = ? AND userId = ?`, [workStatus, id, userId]);
  return { success: true };
}

// ---- Congelamento de Orçamento (Snapshot Completo) ----

/**
 * Copia todos os insumos de todas as composições do orçamento para budget_item_inputs.
 * Preserva customizações já existentes (não sobrescreve).
 * Após o snapshot, o orçamento é independente da base global.
 */
export async function snapshotBudgetInputs(budgetId: number): Promise<{ snapshotted: number; skipped: number }> {
  // Buscar todos os itens do orçamento que são composições (usando rawQuery para evitar prepared statements no TiDB)
  const items = await rawQuery(`SELECT id, compositionId FROM budget_items WHERE budgetId = ? AND type = 'composition'`, [budgetId]);

  let snapshotted = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.compositionId) continue;

    // Buscar insumos da composição base
    const compInputs = await getCompositionInputs(item.compositionId);
    if (!compInputs || compInputs.length === 0) continue;

    for (const ci of compInputs) {
      if (!ci.inputId || !ci.input) continue;

      // Verificar se já existe customização para este insumo neste item
      const existing = await rawQuery(`SELECT id FROM budget_item_inputs WHERE budgetItemId = ? AND inputId = ? LIMIT 1`, [item.id, ci.inputId]);

      if (existing.length > 0) {
        // Já customizado — preservar valor existente
        skipped++;
        continue;
      }

      // Inserir snapshot com valores atuais da base
      const coeff = String(ci.coefficient ?? '0');
      const cost = String(ci.input?.unitCost ?? '0');
      await rawQuery(`INSERT INTO budget_item_inputs (budgetItemId, inputId, coefficient, unitCost) VALUES (?, ?, ?, ?)`, [item.id, ci.inputId, coeff, cost]);
      snapshotted++;
    }
  }

  return { snapshotted, skipped };
}

/**
 * Congela o orçamento: faz snapshot de todos os insumos e marca frozenAt/frozenBy.
 */
export async function freezeBudget(budgetId: number, userId: number, frozenBy: string): Promise<{ success: boolean; snapshotted: number; skipped: number }> {
  // Verificar se o orçamento pertence ao usuário (usando rawQuery para evitar problema de prepared statements no TiDB)
  const rows = await rawQuery(`SELECT id FROM budgets WHERE id = ? AND userId = ? LIMIT 1`, [budgetId, userId]);
  if (!rows[0]) return { success: false, snapshotted: 0, skipped: 0 };

  // Fazer snapshot dos insumos
  const { snapshotted, skipped } = await snapshotBudgetInputs(budgetId);

  // Marcar como congelado
  await rawQuery(`UPDATE budgets SET frozenAt = NOW(), frozenBy = ? WHERE id = ? AND userId = ?`, [frozenBy, budgetId, userId]);

  return { success: true, snapshotted, skipped };
}

/**
 * Descongela o orçamento: limpa frozenAt/frozenBy (mantém budget_item_inputs para preservar histórico).
 */
export async function unfreezeBudget(budgetId: number, userId: number): Promise<{ success: boolean }> {
  // Verificar se o orçamento pertence ao usuário (usando rawQuery para evitar problema de prepared statements no TiDB)
  const rows = await rawQuery(`SELECT id FROM budgets WHERE id = ? AND userId = ? LIMIT 1`, [budgetId, userId]);
  if (!rows[0]) return { success: false };

  await rawQuery(`UPDATE budgets SET frozenAt = NULL, frozenBy = NULL WHERE id = ? AND userId = ?`, [budgetId, userId]);

  return { success: true };
}
