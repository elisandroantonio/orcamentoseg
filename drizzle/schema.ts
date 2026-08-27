import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, index, date, tinyint, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Categorias de composições
 */
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(), // PRE, DEM, FUN, EST, etc.
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("categories_userId_idx").on(table.userId),
  codeIdx: index("categories_code_idx").on(table.code),
}));

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Clientes - cadastro de clientes para orçamentos
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(), // Razão Social ou Nome
  documentType: mysqlEnum("documentType", ["cpf", "cnpj"]).notNull(),
  document: varchar("document", { length: 18 }).notNull(), // CPF ou CNPJ
  address: text("address"),
  zipCode: varchar("zipCode", { length: 10 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("clients_userId_idx").on(table.userId),
  documentIdx: index("clients_document_idx").on(table.document),
}));

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Insumos - materiais, mão de obra, equipamentos
 */
export const inputs = mysqlTable("inputs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 50 }),
  description: text("description").notNull(),
  type: mysqlEnum("type", ["material", "labor", "equipment"]).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("inputs_userId_idx").on(table.userId),
  typeIdx: index("inputs_type_idx").on(table.type),
}));

export type Input = typeof inputs.$inferSelect;
export type InsertInput = typeof inputs.$inferInsert;

/**
 * Composições de obra - itens base com custos de material e MO separados
 * BDI é aplicado no orçamento, não na composição
 */
export const compositions = mysqlTable("compositions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
  code: varchar("code", { length: 50 }), // Código automático: CAT-001
  description: text("description").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  materialCost: decimal("materialCost", { precision: 15, scale: 2 }).notNull().default("0"), // Custo de material
  laborCost: decimal("laborCost", { precision: 15, scale: 2 }).notNull().default("0"), // Custo de mão de obra
  equipmentCost: decimal("equipmentCost", { precision: 15, scale: 2 }).notNull().default("0"), // Custo de equipamento
  laborHours: decimal("laborHours", { precision: 10, scale: 3 }).notNull().default("0"), // HH por unidade
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("compositions_userId_idx").on(table.userId),
  categoryIdIdx: index("compositions_categoryId_idx").on(table.categoryId),
  codeIdx: index("compositions_code_idx").on(table.code),
}));

export type Composition = typeof compositions.$inferSelect;
export type InsertComposition = typeof compositions.$inferInsert;

/**
 * Insumos de cada composição (composição aberta)
 */
export const compositionInputs = mysqlTable("composition_inputs", {
  id: int("id").autoincrement().primaryKey(),
  compositionId: int("compositionId").notNull().references(() => compositions.id, { onDelete: "cascade" }),
  inputId: int("inputId").notNull().references(() => inputs.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  coefficient: decimal("coefficient", { precision: 10, scale: 6 }).notNull(), // coeficiente de consumo
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  compositionIdIdx: index("composition_inputs_compositionId_idx").on(table.compositionId),
  inputIdIdx: index("composition_inputs_inputId_idx").on(table.inputId),
}));

export type CompositionInput = typeof compositionInputs.$inferSelect;
export type InsertCompositionInput = typeof compositionInputs.$inferInsert;

/**
 * Projetos/Obras
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  client: varchar("client", { length: 255 }),
  location: text("location"),
  description: text("description"),
  startDate: date("startDate"),
  endDate: date("endDate"),
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("projects_userId_idx").on(table.userId),
}));

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Orçamentos - com BDI configurável
 */
export const budgets = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: int("clientId").references(() => clients.id, { onDelete: "set null" }),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  code: varchar("code", { length: 50 }).unique(),
  title: varchar("title", { length: 255 }).notNull(),
  squareMeters: decimal("squareMeters", { precision: 10, scale: 2 }),
  description: text("description"),
  observations: text("observations"),
  // BDI - Benefícios e Despesas Indiretas (percentuais)
  socialCharges: decimal("socialCharges", { precision: 5, scale: 2 }).notNull().default("0"), // Encargos Sociais %
  adminCentral: decimal("adminCentral", { precision: 5, scale: 2 }).notNull().default("0"), // Administração Central % (AC) — numerador da fórmula TCU/SINAPI
  profit: decimal("profit", { precision: 5, scale: 2 }).notNull().default("0"), // Lucro %
  taxes: decimal("taxes", { precision: 5, scale: 2 }).notNull().default("0"), // Impostos %
  risk: decimal("risk", { precision: 5, scale: 2 }).notNull().default("0"), // Risco Sacado %
  warranty: decimal("warranty", { precision: 5, scale: 2 }).notNull().default("0"), // Garantia %
  // Totais calculados
  totalMaterialCost: decimal("totalMaterialCost", { precision: 15, scale: 2 }).notNull().default("0"),
  totalLaborCost: decimal("totalLaborCost", { precision: 15, scale: 2 }).notNull().default("0"),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).notNull().default("0"), // Com BDI aplicado
  totalLaborHours: decimal("totalLaborHours", { precision: 15, scale: 2 }).notNull().default("0"),
  // Cronograma físico-financeiro
  startDate: date("startDate"),
  endDate: date("endDate"),
  durationMonths: int("durationMonths"),
  periodType: mysqlEnum("periodType", ["monthly", "biweekly", "weekly"]).default("monthly"),
  workStatus: mysqlEnum("workStatus", ["orcamento", "contrato", "execucao", "finalizada", "nao_fechada"]).default("execucao").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "approved", "rejected"]).default("draft").notNull(),
  // Congelamento de orçamento (Snapshot Completo — Opção A)
  frozenAt: timestamp("frozenAt"),          // NULL = aberto; preenchido = congelado
  frozenBy: varchar("frozenBy", { length: 255 }), // Nome do usuário que congelou
  includeMaterial: tinyint("includeMaterial").notNull().default(1), // 1 = incluir material, 0 = apenas M.O.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("budgets_userId_idx").on(table.userId),
  projectIdIdx: index("budgets_projectId_idx").on(table.projectId),
}));
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = typeof budgets.$inferInsert;

/**
 * Etapas do orçamento (hierárquicas)
 */
export const budgetStages = mysqlTable("budget_stages", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  parentStageId: int("parentStageId").references((): any => budgetStages.id, { onDelete: "cascade" }), // Sub-etapa
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  order: int("order").notNull().default(0), // Ordem na ESTRUTURA DO ORÇAMENTO (planilha) — nunca mexer por causa do Gantt
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).default("0.00").notNull(),
  // Campos para Custo por Unidade de Serviço (ex: R$/m³ de estrutura de concreto armado)
  serviceUnit: varchar("serviceUnit", { length: 20 }), // Unidade de referência: m², m³, kg, m, vb, un, cj, hr
  serviceQuantity: decimal("serviceQuantity", { precision: 15, scale: 4 }), // Quantidade total do serviço
  // Campos para Cronograma Gantt
  scheduleOrder: int("scheduleOrder"), // Ordem de exibição SÓ no Gantt (independente do `order` da planilha)
  startDate: date("startDate"), // Data de início planejada
  endDate: date("endDate"), // Data de término planejada
  duration: int("duration"), // Duração em dias (calculado automaticamente)
  predecessors: text("predecessors"), // JSON array de IDs das atividades predecessoras: [{id: 1, type: "FS", lag: 0}]
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("budget_stages_budgetId_idx").on(table.budgetId),
  parentStageIdIdx: index("budget_stages_parentStageId_idx").on(table.parentStageId),
}));

export type BudgetStage = typeof budgetStages.$inferSelect;
export type InsertBudgetStage = typeof budgetStages.$inferInsert;

/**
 * Itens do orçamento (quantitativos)
 */
export const budgetItems = mysqlTable("budget_items", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  stageId: int("stageId").references(() => budgetStages.id, { onDelete: "set null" }),
  type: varchar("type", { length: 20 }).notNull().default("composition"), // composition | input | service | composite
  parentItemId: int("parentItemId"), // Para itens filhos de um serviço composto (FK gerenciada via SQL)
  compositionId: int("compositionId").references(() => compositions.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  materialCost: decimal("materialCost", { precision: 15, scale: 2 }).notNull().default("0"),
  laborCost: decimal("laborCost", { precision: 15, scale: 2 }).notNull().default("0"),
  equipmentCost: decimal("equipmentCost", { precision: 15, scale: 2 }).notNull().default("0"),
  serviceCost: decimal("serviceCost", { precision: 15, scale: 2 }).notNull().default("0"),
  otherCost: decimal("otherCost", { precision: 15, scale: 2 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).notNull(), // Material + MO + Equipment + Service + Other
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).notNull(), // Quantidade x UnitCost
  laborHours: decimal("laborHours", { precision: 10, scale: 3 }).notNull().default("0"),
  totalLaborHours: decimal("totalLaborHours", { precision: 15, scale: 2 }).notNull().default("0"),
  order: int("order").notNull().default(0),
  // Controle individual de BDI (Melhoria 16)
  aplicarEncargosSociais: tinyint("aplicarEncargosSociais").notNull().default(1), // 1 = true, 0 = false - Se false, não aplica Encargos Sociais neste item
  // Ajuste de M.O. por composição filha (Melhoria 17) - percentual de acréscimo (+) ou desconto (-) sobre M.O.
  laborAdjustment: decimal("laborAdjustment", { precision: 10, scale: 2 }).notNull().default("0"), // % de ajuste sobre M.O. (ex: 55.4 = +55,4%)
  // Ajuste de Material - percentual de acréscimo (+) ou desconto (-) sobre Material
  materialAdjustment: decimal("materialAdjustment", { precision: 10, scale: 2 }).notNull().default("0"), // % de ajuste sobre Material (ex: 9 = +9%, -5 = -5%)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("budget_items_budgetId_idx").on(table.budgetId),
}));

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;

/**
 * Valores customizados de insumos por item de orçamento
 * Permite sobrescrever coeficiente e custo unitário temporariamente
 */
export const budgetItemInputs = mysqlTable("budget_item_inputs", {
  id: int("id").autoincrement().primaryKey(),
  budgetItemId: int("budgetItemId").notNull().references(() => budgetItems.id, { onDelete: "cascade" }),
  inputId: int("inputId").notNull().references(() => inputs.id, { onDelete: "cascade" }),
  coefficient: decimal("coefficient", { precision: 10, scale: 6 }).notNull(), // Coeficiente customizado
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).notNull(), // Custo unitário customizado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  budgetItemIdIdx: index("budget_item_inputs_budgetItemId_idx").on(table.budgetItemId),
  inputIdIdx: index("budget_item_inputs_inputId_idx").on(table.inputId),
}));

export type BudgetItemInput = typeof budgetItemInputs.$inferSelect;
export type InsertBudgetItemInput = typeof budgetItemInputs.$inferInsert;

/**
 * Configurações de BDI por item de orçamento
 * Permite desligar BDI de material/mão de obra, adicionar ajuste de material e ajuste de M.O.
 */
export const budgetItemBdiConfig = mysqlTable("budget_item_bdi_config", {
  id: int("id").autoincrement().primaryKey(),
  budgetItemId: int("budgetItemId").notNull().references(() => budgetItems.id, { onDelete: "cascade" }).unique(),
  applyBdiToMaterial: tinyint("applyBdiToMaterial").notNull().default(1), // 1 = aplicar BDI ao material, 0 = não aplicar
  applyBdiToLabor: tinyint("applyBdiToLabor").notNull().default(1), // 1 = aplicar BDI à mão de obra, 0 = não aplicar
  additionalIncrement: decimal("additionalIncrement", { precision: 7, scale: 2 }).notNull().default("0"), // Mantido por compatibilidade (não usado na UI)
  discount: decimal("discount", { precision: 7, scale: 2 }).notNull().default("0"), // Mantido por compatibilidade (não usado na UI)
  materialAdjustment: decimal("materialAdjustment", { precision: 10, scale: 2 }).notNull().default("0"), // % de ajuste sobre Material (ex: 9 = +9%, -5 = -5%)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetItemIdIdx: index("budget_item_bdi_config_budgetItemId_idx").on(table.budgetItemId),
}));

export type BudgetItemBdiConfig = typeof budgetItemBdiConfig.$inferSelect;
export type InsertBudgetItemBdiConfig = typeof budgetItemBdiConfig.$inferInsert;

/**
 * Cronograma físico-financeiro - atividades
 */
export const scheduleActivities = mysqlTable("schedule_activities", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  budgetItemId: int("budgetItemId").references(() => budgetItems.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).notNull(),
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("schedule_activities_budgetId_idx").on(table.budgetId),
}));

export type ScheduleActivity = typeof scheduleActivities.$inferSelect;
export type InsertScheduleActivity = typeof scheduleActivities.$inferInsert;

/**
 * Períodos do cronograma (distribuição mensal/semanal)
 */
export const schedulePeriods = mysqlTable("schedule_periods", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull().references(() => scheduleActivities.id, { onDelete: "cascade" }),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  physicalProgress: decimal("physicalProgress", { precision: 5, scale: 2 }).notNull(), // percentual
  financialAmount: decimal("financialAmount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  activityIdIdx: index("schedule_periods_activityId_idx").on(table.activityId),
}));

export type SchedulePeriod = typeof schedulePeriods.$inferSelect;
export type InsertSchedulePeriod = typeof schedulePeriods.$inferInsert;

/**
 * Desembolsos planejados
 */
export const disbursements = mysqlTable("disbursements", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  dueDate: date("dueDate").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }),
  status: mysqlEnum("status", ["planned", "paid"]).default("planned").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("disbursements_budgetId_idx").on(table.budgetId),
}));

export type Disbursement = typeof disbursements.$inferSelect;
export type InsertDisbursement = typeof disbursements.$inferInsert;

/**
 * Configurações da empresa (dados para cabeçalho de documentos)
 */
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }).notNull(),
  responsibleName: varchar("responsibleName", { length: 255 }).notNull(),
  responsibleTitle: varchar("responsibleTitle", { length: 100 }).notNull(), // Engenheiro Civil, Arquiteto, etc.
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  logoUrl: varchar("logoUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("company_settings_userId_idx").on(table.userId),
}));

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;

/**
 * Templates de orçamento - permite salvar estruturas reutilizáveis
 */
export const budgetTemplates = mysqlTable("budget_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("budget_templates_userId_idx").on(table.userId),
}));

export type BudgetTemplate = typeof budgetTemplates.$inferSelect;
export type InsertBudgetTemplate = typeof budgetTemplates.$inferInsert;

/**
 * Etapas do template
 */
export const templateStages = mysqlTable("template_stages", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull().references(() => budgetTemplates.id, { onDelete: "cascade" }),
  parentId: int("parentId"), // null para etapas principais, id da etapa pai para sub-etapas
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  templateIdIdx: index("template_stages_templateId_idx").on(table.templateId),
  parentIdIdx: index("template_stages_parentId_idx").on(table.parentId),
}));

export type TemplateStage = typeof templateStages.$inferSelect;
export type InsertTemplateStage = typeof templateStages.$inferInsert;

/**
 * Itens do template (composições, insumos, serviços)
 */
export const templateItems = mysqlTable("template_items", {
  id: int("id").autoincrement().primaryKey(),
  templateStageId: int("templateStageId").notNull().references(() => templateStages.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["composition", "input", "service"]).notNull(),
  compositionId: int("compositionId").references(() => compositions.id, { onDelete: "set null" }), // null se for insumo ou serviço
  inputId: int("inputId").references(() => inputs.id, { onDelete: "set null" }), // null se for composição ou serviço
  code: varchar("code", { length: 50 }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 10 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1.00"),
  // Custos consolidados (para insumos e serviços)
  materialCost: decimal("materialCost", { precision: 15, scale: 2 }),
  laborCost: decimal("laborCost", { precision: 15, scale: 2 }),
  equipmentCost: decimal("equipmentCost", { precision: 15, scale: 2 }),
  serviceCost: decimal("serviceCost", { precision: 15, scale: 2 }),
  otherCost: decimal("otherCost", { precision: 15, scale: 2 }),
  // Configurações de BDI
  aplicarBdiMaterial: boolean("aplicarBdiMaterial").default(true),
  aplicarBdiMaoObra: boolean("aplicarBdiMaoObra").default(true),
  aplicarEncargosSociais: boolean("aplicarEncargosSociais").default(true),
  incrementoAdicional: decimal("incrementoAdicional", { precision: 5, scale: 2 }).default("0.00"),
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  templateStageIdIdx: index("template_items_templateStageId_idx").on(table.templateStageId),
  compositionIdIdx: index("template_items_compositionId_idx").on(table.compositionId),
  inputIdIdx: index("template_items_inputId_idx").on(table.inputId),
}));

export type TemplateItem = typeof templateItems.$inferSelect;
export type InsertTemplateItem = typeof templateItems.$inferInsert;



/**
 * Períodos do cronograma físico-financeiro do orçamento
 */
export const budgetSchedulePeriods = mysqlTable("budget_schedule_periods", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  periodNumber: int("periodNumber").notNull(),
  periodName: varchar("periodName", { length: 50 }).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("budget_schedule_periods_budgetId_idx").on(table.budgetId),
}));

export type BudgetSchedulePeriod = typeof budgetSchedulePeriods.$inferSelect;
export type InsertBudgetSchedulePeriod = typeof budgetSchedulePeriods.$inferInsert;

/**
 * Distribuição de etapas por período (cronograma físico-financeiro)
 */
export const budgetScheduleItems = mysqlTable("budget_schedule_items", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  stageId: int("stageId").notNull().references(() => budgetStages.id, { onDelete: "cascade" }),
  periodId: int("periodId").notNull().references(() => budgetSchedulePeriods.id, { onDelete: "cascade" }),
  percentPlanned: decimal("percentPlanned", { precision: 5, scale: 2 }).notNull().default("0"),
  percentExecuted: decimal("percentExecuted", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("budget_schedule_items_budgetId_idx").on(table.budgetId),
  stageIdIdx: index("budget_schedule_items_stageId_idx").on(table.stageId),
  periodIdIdx: index("budget_schedule_items_periodId_idx").on(table.periodId),
}));

export type BudgetScheduleItem = typeof budgetScheduleItems.$inferSelect;
export type InsertBudgetScheduleItem = typeof budgetScheduleItems.$inferInsert;

/**
 * Distribuição mensal de percentuais por etapa (Cronograma Gantt)
 * Armazena os percentuais planejados de cada etapa distribuídos ao longo dos meses
 */
export const budgetMonthlyDistribution = mysqlTable("budget_monthly_distribution", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  stageId: int("stageId").notNull().references(() => budgetStages.id, { onDelete: "cascade" }),
  periodIndex: int("periodIndex").notNull(), // Índice do período/mês (0, 1, 2, ...)
  periodLabel: varchar("periodLabel", { length: 50 }).notNull(), // Ex: "fev. de 26", "mar. de 26"
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull().default("0"), // Percentual planejado
  value: decimal("value", { precision: 15, scale: 2 }).notNull().default("0"), // Valor calculado (% × total)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("budget_monthly_distribution_budgetId_idx").on(table.budgetId),
  stageIdIdx: index("budget_monthly_distribution_stageId_idx").on(table.stageId),
  uniqueDistribution: index("budget_monthly_distribution_unique").on(table.budgetId, table.stageId, table.periodIndex),
}));

export type BudgetMonthlyDistribution = typeof budgetMonthlyDistribution.$inferSelect;
export type InsertBudgetMonthlyDistribution = typeof budgetMonthlyDistribution.$inferInsert;

/**
 * Períodos de medição financeira (boletins de medição)
 * Cada período representa um boletim de medição (mensal, quinzenal, etc.)
 */
export const measurementPeriods = mysqlTable("measurement_periods", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  periodNumber: int("periodNumber").notNull(), // Número sequencial: 1, 2, 3...
  name: varchar("name", { length: 100 }).notNull(), // Ex: "Medição 01 - Janeiro/2026"
  startDate: date("startDate"),
  endDate: date("endDate"),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("measurement_periods_budgetId_idx").on(table.budgetId),
}));
export type MeasurementPeriod = typeof measurementPeriods.$inferSelect;
export type InsertMeasurementPeriod = typeof measurementPeriods.$inferInsert;

/**
 * Medições por item do orçamento (por composição/item individual)
 * Registra o % medido de cada item em cada período de medição
 */
export const measurementItems = mysqlTable("measurement_items", {
  id: int("id").autoincrement().primaryKey(),
  periodId: int("periodId").notNull().references(() => measurementPeriods.id, { onDelete: "cascade" }),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  budgetItemId: int("budgetItemId").notNull().references(() => budgetItems.id, { onDelete: "cascade" }),
  percentMeasured: decimal("percentMeasured", { precision: 7, scale: 4 }).notNull().default("0"), // % medido neste período
  quantityMeasured: decimal("quantityMeasured", { precision: 15, scale: 4 }).notNull().default("0"), // Quantidade medida neste período
  valueMeasured: decimal("valueMeasured", { precision: 15, scale: 2 }).notNull().default("0"), // Valor medido neste período (c/ BDI)
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  periodIdIdx: index("measurement_items_periodId_idx").on(table.periodId),
  budgetIdIdx: index("measurement_items_budgetId_idx").on(table.budgetId),
  budgetItemIdIdx: index("measurement_items_budgetItemId_idx").on(table.budgetItemId),
  uniqueMeasurement: index("measurement_items_unique").on(table.periodId, table.budgetItemId),
}));
export type MeasurementItem = typeof measurementItems.$inferSelect;
export type InsertMeasurementItem = typeof measurementItems.$inferInsert;

/**
 * Aditivos de contrato
 * Registra acréscimos ou supressões ao contrato original
 */
export const contractAdditives = mysqlTable("contract_additives", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  number: varchar("number", { length: 50 }).notNull(), // Ex: "Aditivo 01"
  type: mysqlEnum("type", ["acrescimo", "supressao"]).notNull().default("acrescimo"),
  description: text("description").notNull(),
  value: decimal("value", { precision: 15, scale: 2 }).notNull().default("0"), // Valor do aditivo
  signedDate: date("signedDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("contract_additives_budgetId_idx").on(table.budgetId),
}));
export type ContractAdditive = typeof contractAdditives.$inferSelect;
export type InsertContractAdditive = typeof contractAdditives.$inferInsert;

/**
 * Lançamentos de Caixa - Entradas e Saídas do Fluxo de Caixa
 */
export const cashFlowEntries = mysqlTable("cash_flow_entries", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  type: mysqlEnum("type", ["entrada", "saida"]).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // medição, aditivo, recebimento, impostos, pagamento_mao_obra, etc.
  description: text("description"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  reference: varchar("reference", { length: 255 }), // Ex: "Medição Jan/2026", "Gantt - Fase 1"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("cash_flow_entries_budgetId_idx").on(table.budgetId),
  monthIdx: index("cash_flow_entries_month_idx").on(table.month),
  budgetMonthIdx: index("cash_flow_entries_budgetMonth_idx").on(table.budgetId, table.month),
}));

export type CashFlowEntry = typeof cashFlowEntries.$inferSelect;
export type InsertCashFlowEntry = typeof cashFlowEntries.$inferInsert;


/**
 * Contas Bancárias
 */
export const bankAccounts = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), // Ex: "Conta Principal Itaú"
  bank: varchar("bank", { length: 100 }).notNull(), // Ex: "Itaú"
  type: mysqlEnum("type", ["corrente", "poupanca", "caixa"]).notNull().default("corrente"),
  agency: varchar("agency", { length: 20 }),
  accountNumber: varchar("accountNumber", { length: 30 }),
  initialBalance: decimal("initialBalance", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("bank_accounts_userId_idx").on(table.userId),
}));

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

/**
 * Frota — Veículos e Máquinas
 */
export const fleetVehicles = mysqlTable("fleet_vehicles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["veiculo", "maquina"]).notNull().default("veiculo"),
  description: varchar("description", { length: 255 }).notNull(), // Ex: "Caminhão Mercedes 1620"
  plate: varchar("plate", { length: 10 }), // Placa (opcional para máquinas)
  model: varchar("model", { length: 100 }),
  year: int("year"),
  status: mysqlEnum("status", ["ativo", "inativo"]).notNull().default("ativo"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("fleet_vehicles_userId_idx").on(table.userId),
}));

export type FleetVehicle = typeof fleetVehicles.$inferSelect;
export type InsertFleetVehicle = typeof fleetVehicles.$inferInsert;

/**
 * Transações financeiras - lançamentos manuais de entradas e saídas
 * Serve tanto para lançamentos de obras (budgetId preenchido) quanto
 * para lançamentos administrativos e de frota (budgetId = NULL)
 */
export const financialTransactions = mysqlTable("financial_transactions", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").references(() => budgets.id, { onDelete: "cascade" }), // NULL = admin ou frota
  bankAccountId: int("bankAccountId").references(() => bankAccounts.id, { onDelete: "set null" }), // Conta bancária (opcional)
  vehicleId: int("vehicleId").references(() => fleetVehicles.id, { onDelete: "set null" }), // Veículo (apenas frota)
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  costCenter: mysqlEnum("costCenter", ["obra", "administrativo", "frota"]).notNull().default("obra"),
  date: date("date").notNull(),
  type: mysqlEnum("type", ["entrada", "saida"]).notNull(),
  category: varchar("category", { length: 50 }),
  description: varchar("description", { length: 255 }).notNull(),
  payeeName: varchar("payeeName", { length: 255 }),
  value: decimal("value", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("financial_transactions_budgetId_idx").on(table.budgetId),
  userIdIdx: index("financial_transactions_userId_idx").on(table.userId),
  costCenterIdx: index("financial_transactions_costCenter_idx").on(table.costCenter),
  dateIdx: index("financial_transactions_date_idx").on(table.date),
  typeIdx: index("financial_transactions_type_idx").on(table.type),
}));

export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = typeof financialTransactions.$inferInsert;


/**
 * Aditivos de Orçamento
 * Cada aditivo é vinculado a um orçamento pai e tem estrutura idêntica
 * (etapas → sub-etapas → itens), com BDI herdado do orçamento original.
 */
export const budgetAdditives = mysqlTable("budget_additives", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(), // Ex: "Aditivo 01 — Alvenaria sobre Janelas"
  status: mysqlEnum("status", ["elaboracao", "aprovado", "negado"]).notNull().default("elaboracao"),
  // Congelamento (snapshot) — igual ao orçamento
  frozenAt: timestamp("frozenAt"),
  frozenBy: varchar("frozenBy", { length: 255 }),
  // Totais calculados (atualizados ao salvar itens)
  totalCostNoBdi: decimal("totalCostNoBdi", { precision: 15, scale: 2 }).notNull().default("0"),
  totalCostWithBdi: decimal("totalCostWithBdi", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  budgetIdIdx: index("budget_additives_budgetId_idx").on(table.budgetId),
  userIdIdx: index("budget_additives_userId_idx").on(table.userId),
}));
export type BudgetAdditive = typeof budgetAdditives.$inferSelect;
export type InsertBudgetAdditive = typeof budgetAdditives.$inferInsert;

/**
 * Etapas dos Aditivos (hierárquicas, igual ao orçamento)
 */
export const additiveStages = mysqlTable("additive_stages", {
  id: int("id").autoincrement().primaryKey(),
  additiveId: int("additiveId").notNull().references(() => budgetAdditives.id, { onDelete: "cascade" }),
  parentStageId: int("parentStageId").references((): any => additiveStages.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  order: int("order").notNull().default(0),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  additiveIdIdx: index("additive_stages_additiveId_idx").on(table.additiveId),
  parentStageIdIdx: index("additive_stages_parentStageId_idx").on(table.parentStageId),
}));
export type AdditiveStage = typeof additiveStages.$inferSelect;
export type InsertAdditiveStage = typeof additiveStages.$inferInsert;

/**
 * Itens dos Aditivos (composições, insumos, serviços)
 * Estrutura idêntica ao budgetItems, mas vinculada ao additiveId
 */
export const additiveItems = mysqlTable("additive_items", {
  id: int("id").autoincrement().primaryKey(),
  additiveId: int("additiveId").notNull().references(() => budgetAdditives.id, { onDelete: "cascade" }),
  stageId: int("stageId").references(() => additiveStages.id, { onDelete: "set null" }),
  type: varchar("type", { length: 20 }).notNull().default("composition"), // composition | input | service
  compositionId: int("compositionId").references(() => compositions.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 3 }).notNull(),
  materialCost: decimal("materialCost", { precision: 15, scale: 2 }).notNull().default("0"),
  laborCost: decimal("laborCost", { precision: 15, scale: 2 }).notNull().default("0"),
  equipmentCost: decimal("equipmentCost", { precision: 15, scale: 2 }).notNull().default("0"),
  serviceCost: decimal("serviceCost", { precision: 15, scale: 2 }).notNull().default("0"),
  otherCost: decimal("otherCost", { precision: 15, scale: 2 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).notNull().default("0"),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).notNull().default("0"),
  order: int("order").notNull().default(0),
  // Controle individual de BDI (igual ao orçamento)
  applyBdiToMaterial: tinyint("applyBdiToMaterial").notNull().default(1),
  applyBdiToLabor: tinyint("applyBdiToLabor").notNull().default(1),
  additionalIncrement: decimal("additionalIncrement", { precision: 7, scale: 2 }).notNull().default("0"),
  discount: decimal("discount", { precision: 7, scale: 2 }).notNull().default("0"),
  aplicarEncargosSociais: tinyint("aplicarEncargosSociais").notNull().default(1),
  includeMaterial: tinyint("includeMaterial").notNull().default(1), // 1 = incluir material, 0 = material por conta do cliente
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  additiveIdIdx: index("additive_items_additiveId_idx").on(table.additiveId),
  stageIdIdx: index("additive_items_stageId_idx").on(table.stageId),
}));
export type AdditiveItem = typeof additiveItems.$inferSelect;
export type InsertAdditiveItem = typeof additiveItems.$inferInsert;

/**
 * Valores customizados de insumos por item de aditivo
 * Permite sobrescrever coeficiente e custo unitário (igual ao budget_item_inputs)
 */
export const additiveItemInputs = mysqlTable("additive_item_inputs", {
  id: int("id").autoincrement().primaryKey(),
  additiveItemId: int("additiveItemId").notNull().references(() => additiveItems.id, { onDelete: "cascade" }),
  inputId: int("inputId").notNull().references(() => inputs.id, { onDelete: "cascade" }),
  coefficient: decimal("coefficient", { precision: 10, scale: 6 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  additiveItemIdIdx: index("additive_item_inputs_additiveItemId_idx").on(table.additiveItemId),
  inputIdIdx: index("additive_item_inputs_inputId_idx").on(table.inputId),
}));
export type AdditiveItemInput = typeof additiveItemInputs.$inferSelect;
export type InsertAdditiveItemInput = typeof additiveItemInputs.$inferInsert;

/**
 * Medições dos Aditivos
 * Planilha de medição separada por aditivo (disponível apenas se aprovado + fechado)
 */
export const additiveMeasurements = mysqlTable("additive_measurements", {
  id: int("id").autoincrement().primaryKey(),
  additiveId: int("additiveId").notNull().references(() => budgetAdditives.id, { onDelete: "cascade" }),
  additiveItemId: int("additiveItemId").notNull().references(() => additiveItems.id, { onDelete: "cascade" }),
  periodId: int("periodId").notNull().references(() => measurementPeriods.id, { onDelete: "cascade" }),
  measuredPercent: decimal("measuredPercent", { precision: 7, scale: 4 }).notNull().default("0"),
  measuredValue: decimal("measuredValue", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  additiveIdIdx: index("additive_measurements_additiveId_idx").on(table.additiveId),
  additiveItemIdIdx: index("additive_measurements_additiveItemId_idx").on(table.additiveItemId),
  periodIdIdx: index("additive_measurements_periodId_idx").on(table.periodId),
}));
export type AdditiveMeasurement = typeof additiveMeasurements.$inferSelect;
export type InsertAdditiveMeasurement = typeof additiveMeasurements.$inferInsert;

/**
 * Listas de Materiais
 * Cada lista agrupa materiais extraídos de um ou mais orçamentos
 */
export const materialLists = mysqlTable("material_lists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("material_lists_userId_idx").on(table.userId),
}));
export type MaterialList = typeof materialLists.$inferSelect;
export type InsertMaterialList = typeof materialLists.$inferInsert;

/**
 * Orçamentos vinculados a uma lista de materiais
 */
export const materialListBudgets = mysqlTable("material_list_budgets", {
  id: int("id").autoincrement().primaryKey(),
  materialListId: int("materialListId").notNull().references(() => materialLists.id, { onDelete: "cascade" }),
  budgetId: int("budgetId").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  materialListIdIdx: index("material_list_budgets_listId_idx").on(table.materialListId),
  budgetIdIdx: index("material_list_budgets_budgetId_idx").on(table.budgetId),
}));
export type MaterialListBudget = typeof materialListBudgets.$inferSelect;
export type InsertMaterialListBudget = typeof materialListBudgets.$inferInsert;

/**
 * Itens de uma lista de materiais (gerados automaticamente, editáveis manualmente)
 */
export const materialListItems = mysqlTable("material_list_items", {
  id: int("id").autoincrement().primaryKey(),
  materialListId: int("materialListId").notNull().references(() => materialLists.id, { onDelete: "cascade" }),
  budgetId: int("budgetId").references(() => budgets.id, { onDelete: "cascade" }), // null para itens manuais sem orçamento vinculado
  stageId: int("stageId").references(() => budgetStages.id, { onDelete: "set null" }),
  stageName: varchar("stageName", { length: 255 }), // Nome da etapa (snapshot)
  // Referência ao insumo original (null para serviços a preço informado)
  inputId: int("inputId").references(() => inputs.id, { onDelete: "set null" }),
  sinapiCode: varchar("sinapiCode", { length: 50 }), // Código SINAPI (snapshot)
  // Campos editáveis manualmente
  description: text("description").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }).notNull(),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }).notNull(),
  // Tipo do item: 'input' (insumo de composição) | 'service' (serviço a preço informado) | 'manual' (item adicionado manualmente)
  itemType: varchar("itemType", { length: 20 }).notNull().default("input"),
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  materialListIdIdx: index("material_list_items_listId_idx").on(table.materialListId),
  budgetIdIdx: index("material_list_items_budgetId_idx").on(table.budgetId),
  stageIdIdx: index("material_list_items_stageId_idx").on(table.stageId),
}));
export type MaterialListItem = typeof materialListItems.$inferSelect;
export type InsertMaterialListItem = typeof materialListItems.$inferInsert;

/**
 * Histórico mensal do CUB/SC (Custo Unitário Básico — Santa Catarina),
 * publicado mensalmente pelo Sinduscon-SC. "auto" = buscado automaticamente
 * da tabela pública do SENGE-SC; "manual" = corrigido/cadastrado pelo
 * usuário (nunca sobrescrito automaticamente).
 */
export const cubScValues = mysqlTable("cub_sc_values", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(), // 1-12
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  source: mysqlEnum("source", ["auto", "manual"]).default("auto").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  yearMonthIdx: index("cub_sc_values_year_month_idx").on(table.year, table.month),
}));
export type CubScValue = typeof cubScValues.$inferSelect;
export type InsertCubScValue = typeof cubScValues.$inferInsert;

/**
 * Regras de mesclagem manual de materiais na Lista de Materiais (aba Resumo
 * Geral). A consolidação automática agrupa por código SINAPI ou descrição
 * normalizada, mas alguns duplicados só um humano reconhece (ex: mesmo
 * material com código SINAPI de um lado e sem código do outro). Cada regra
 * redireciona um "sourceKey" (a chave de agrupamento calculada no cliente)
 * pro "targetKey" escolhido como canônico — sourceKey é único por usuário,
 * então um material só pode ser mesclado pra UM destino por vez.
 */
export const materialMergeRules = mysqlTable("material_merge_rules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceKey: varchar("sourceKey", { length: 300 }).notNull(),
  targetKey: varchar("targetKey", { length: 300 }).notNull(),
  targetDescription: text("targetDescription"),
  targetUnit: varchar("targetUnit", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("material_merge_rules_userId_idx").on(table.userId),
  userSourceIdx: index("material_merge_rules_user_source_idx").on(table.userId, table.sourceKey),
}));
export type MaterialMergeRule = typeof materialMergeRules.$inferSelect;
export type InsertMaterialMergeRule = typeof materialMergeRules.$inferInsert;
