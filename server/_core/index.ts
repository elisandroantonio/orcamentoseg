import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoute } from "./devAuth";
import { registerStorageProxy } from "./storageProxy";
import { registerClientAuthRoutes } from "./clientAuth";
import { registerFieldAuthRoutes } from "./fieldAuth";
import { registerSiteDiaryPhotoRoute } from "./diaryPhotoRoute";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function runSafeMigrations() {
  try {
    const { rawQuery } = await import('../db');
    // Adicionar includeMaterial na tabela budgets se não existir
    await rawQuery(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS includeMaterial tinyint NOT NULL DEFAULT 1`);
    console.log('[Migration] includeMaterial column ensured in budgets table');
    // Ordem de exibição do Gantt, separada do `order` usado na planilha do
    // orçamento — ver comentário em drizzle/schema.ts.
    await rawQuery(`ALTER TABLE budget_stages ADD COLUMN IF NOT EXISTS scheduleOrder INT NULL`);
    console.log('[Migration] scheduleOrder column ensured in budget_stages table');
    // Adicionar laborAdjustment na tabela budget_items se não existir
    await rawQuery(`ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS laborAdjustment DECIMAL(10,2) NOT NULL DEFAULT 0`);
    console.log('[Migration] laborAdjustment column ensured in budget_items table');
    // Adicionar includeMaterial na tabela additive_items se não existir
    await rawQuery(`ALTER TABLE additive_items ADD COLUMN IF NOT EXISTS includeMaterial tinyint NOT NULL DEFAULT 1`);
    console.log('[Migration] includeMaterial column ensured in additive_items table');
    // Garantir que a tabela additive_measurements existe com periodId (FK para measurement_periods)
    await rawQuery(`CREATE TABLE IF NOT EXISTS additive_measurements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      additiveId INT NOT NULL,
      additiveItemId INT NOT NULL,
      periodId INT NOT NULL,
      measuredPercent DECIMAL(7,4) NOT NULL DEFAULT 0,
      measuredValue DECIMAL(15,2) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX additive_measurements_additiveId_idx (additiveId),
      INDEX additive_measurements_additiveItemId_idx (additiveItemId),
      INDEX additive_measurements_periodId_idx (periodId)
    )`);
    console.log('[Migration] additive_measurements table ensured');
    // Migrar coluna period (YYYY-MM) para periodId se a coluna period ainda existir
    try {
      await rawQuery(`ALTER TABLE additive_measurements ADD COLUMN IF NOT EXISTS periodId INT NOT NULL DEFAULT 0`);
      console.log('[Migration] periodId column ensured in additive_measurements');
    } catch (_) { /* já existe */ }

    // Criar tabelas do módulo Lista de Materiais
    await rawQuery(`CREATE TABLE IF NOT EXISTS material_lists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX material_lists_userId_idx (userId)
    )`);
    console.log('[Migration] material_lists table ensured');

    await rawQuery(`CREATE TABLE IF NOT EXISTS material_list_budgets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      materialListId INT NOT NULL,
      budgetId INT NOT NULL,
      \`order\` INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX material_list_budgets_listId_idx (materialListId),
      INDEX material_list_budgets_budgetId_idx (budgetId)
    )`);
    console.log('[Migration] material_list_budgets table ensured');

    await rawQuery(`CREATE TABLE IF NOT EXISTS material_list_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      materialListId INT NOT NULL,
      budgetId INT,
      stageId INT,
      stageName VARCHAR(255),
      inputId INT,
      sinapiCode VARCHAR(50),
      description TEXT NOT NULL,
      unit VARCHAR(20) NOT NULL,
      quantity DECIMAL(15,4) NOT NULL,
      unitCost DECIMAL(15,2) NOT NULL,
      totalCost DECIMAL(15,2) NOT NULL,
      itemType VARCHAR(20) NOT NULL DEFAULT 'input',
      \`order\` INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX material_list_items_listId_idx (materialListId),
      INDEX material_list_items_budgetId_idx (budgetId),
      INDEX material_list_items_stageId_idx (stageId)
    )`);
    console.log('[Migration] material_list_items table ensured');

    // Histórico mensal do CUB/SC (dashboard)
    await rawQuery(`CREATE TABLE IF NOT EXISTS cub_sc_values (
      id INT AUTO_INCREMENT PRIMARY KEY,
      year INT NOT NULL,
      month INT NOT NULL,
      value DECIMAL(10,2) NOT NULL,
      source VARCHAR(10) NOT NULL DEFAULT 'auto',
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX cub_sc_values_year_month_idx (year, month)
    )`);
    console.log('[Migration] cub_sc_values table ensured');

    // Regras de mesclagem manual de materiais na Lista de Materiais
    // (aba Resumo Geral) — ver comentário em drizzle/schema.ts.
    await rawQuery(`CREATE TABLE IF NOT EXISTS material_merge_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      sourceKey VARCHAR(300) NOT NULL,
      targetKey VARCHAR(300) NOT NULL,
      targetDescription TEXT,
      targetUnit VARCHAR(20),
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX material_merge_rules_userId_idx (userId),
      UNIQUE KEY material_merge_rules_user_source_uq (userId, sourceKey)
    )`);
    console.log('[Migration] material_merge_rules table ensured');

    // Diário de Obras — vínculo formal projeto→cliente (hoje projects.client
    // é texto livre; clientId é o que permite o portal do cliente saber
    // quais projetos ele pode ver).
    await rawQuery(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS clientId INT NULL`);
    console.log('[Migration] clientId column ensured in projects table');

    // Diário de Obras — login próprio do cliente (ver server/_core/clientAuth.ts)
    await rawQuery(`CREATE TABLE IF NOT EXISTS client_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      clientId INT NOT NULL,
      email VARCHAR(320) NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      isActive TINYINT NOT NULL DEFAULT 1,
      lastSignedIn TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY client_users_email_uq (email),
      INDEX client_users_clientId_idx (clientId)
    )`);
    console.log('[Migration] client_users table ensured');

    // Diário de Obras — entradas por dia, efetivo de M.O. por função e fotos
    await rawQuery(`CREATE TABLE IF NOT EXISTS site_diary_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      projectId INT NOT NULL,
      userId INT NOT NULL,
      budgetStageId INT NULL,
      entryDate DATE NOT NULL,
      weatherMorning VARCHAR(20),
      weatherAfternoon VARCHAR(20),
      equipmentUsed TEXT,
      activities TEXT NOT NULL,
      occurrences TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX site_diary_entries_projectId_idx (projectId),
      INDEX site_diary_entries_budgetStageId_idx (budgetStageId),
      INDEX site_diary_entries_entryDate_idx (entryDate)
    )`);
    console.log('[Migration] site_diary_entries table ensured');

    await rawQuery(`CREATE TABLE IF NOT EXISTS site_diary_labor_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      diaryEntryId INT NOT NULL,
      role VARCHAR(100) NOT NULL,
      count INT NOT NULL DEFAULT 0,
      INDEX site_diary_labor_entries_diaryEntryId_idx (diaryEntryId)
    )`);
    console.log('[Migration] site_diary_labor_entries table ensured');

    await rawQuery(`CREATE TABLE IF NOT EXISTS site_diary_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      diaryEntryId INT NOT NULL,
      fileName VARCHAR(255) NOT NULL,
      caption VARCHAR(255),
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX site_diary_photos_diaryEntryId_idx (diaryEntryId)
    )`);
    console.log('[Migration] site_diary_photos table ensured');

    // Diário de Obras — login de campo por obra (ver server/_core/fieldAuth.ts)
    await rawQuery(`CREATE TABLE IF NOT EXISTS site_diary_field_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      projectId INT NOT NULL,
      email VARCHAR(320) NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      lastSignedIn TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY site_diary_field_users_email_uq (email),
      INDEX site_diary_field_users_projectId_idx (projectId)
    )`);
    console.log('[Migration] site_diary_field_users table ensured');

    // Entradas feitas por login de campo guardam quem foi (fieldUserId);
    // userId continua apontando pro dono do projeto (NOT NULL).
    await rawQuery(`ALTER TABLE site_diary_entries ADD COLUMN IF NOT EXISTS fieldUserId INT NULL`);
    console.log('[Migration] fieldUserId column ensured in site_diary_entries');

    // O diário passou a ser POR ORÇAMENTO (não por projeto): entradas e logins
    // de campo ganham budgetId e projectId deixa de ser obrigatório.
    await rawQuery(`ALTER TABLE site_diary_entries ADD COLUMN IF NOT EXISTS budgetId INT NULL`);
    await rawQuery(`ALTER TABLE site_diary_entries MODIFY COLUMN projectId INT NULL`);
    await rawQuery(`ALTER TABLE site_diary_field_users ADD COLUMN IF NOT EXISTS budgetId INT NULL`);
    await rawQuery(`ALTER TABLE site_diary_field_users MODIFY COLUMN projectId INT NULL`);
    // Backfill (idempotente): registros antigos por projeto vão pro orçamento
    // em execução daquele projeto (o de menor id, se houver mais de um).
    await rawQuery(`UPDATE site_diary_entries SET budgetId = (
      SELECT MIN(b.id) FROM budgets b WHERE b.projectId = site_diary_entries.projectId AND b.workStatus = 'execucao'
    ) WHERE budgetId IS NULL AND projectId IS NOT NULL`);
    await rawQuery(`UPDATE site_diary_field_users SET budgetId = (
      SELECT MIN(b.id) FROM budgets b WHERE b.projectId = site_diary_field_users.projectId AND b.workStatus = 'execucao'
    ) WHERE budgetId IS NULL AND projectId IS NOT NULL`);
    console.log('[Migration] site diary budgetId columns ensured and backfilled');

    // Um login de campo pode acessar VÁRIAS obras (orçamentos): vínculo N:N.
    // A coluna site_diary_field_users.budgetId continua existindo (obra
    // "original" do login), mas a fonte de verdade do acesso é esta tabela.
    await rawQuery(`CREATE TABLE IF NOT EXISTS site_diary_field_user_budgets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fieldUserId INT NOT NULL,
      budgetId INT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE KEY site_diary_fub_uq (fieldUserId, budgetId),
      INDEX site_diary_fub_budget_idx (budgetId)
    )`);
    await rawQuery(`INSERT IGNORE INTO site_diary_field_user_budgets (fieldUserId, budgetId)
      SELECT id, budgetId FROM site_diary_field_users WHERE budgetId IS NOT NULL`);
    console.log('[Migration] site_diary_field_user_budgets table ensured and backfilled');

    // Login por USUÁRIO (nome de login) em vez de só e-mail: muita gente de
    // campo não tem e-mail. username é o identificador de login; email vira
    // opcional (só pra encaminhar o acesso). Logins antigos: username = email.
    for (const table of ['client_users', 'site_diary_field_users']) {
      await rawQuery(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL`);
      await rawQuery(`ALTER TABLE ${table} MODIFY COLUMN email VARCHAR(320) NULL`);
      await rawQuery(`UPDATE ${table} SET username = LOWER(email) WHERE username IS NULL AND email IS NOT NULL`);
      try {
        await rawQuery(`ALTER TABLE ${table} ADD UNIQUE KEY ${table}_username_uq (username)`);
      } catch (e: any) {
        // já existe (re-execução do boot) — ok
      }
    }
    console.log('[Migration] username login columns ensured');

  } catch (err: any) {
    console.warn('[Migration] Safe migration warning:', err?.message || err);
  }
}

async function startServer() {
  await runSafeMigrations();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Storage proxy for /manus-storage/* paths
  registerStorageProxy(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Local-only login bypass (no-op in production) — see devAuth.ts
  registerDevAuthRoute(app);
  // Login próprio do portal do cliente (Diário de Obras) — ver clientAuth.ts
  registerClientAuthRoutes(app);
  // Login de campo por obra (mestre/encarregado) — ver fieldAuth.ts
  registerFieldAuthRoutes(app);
  // Serve as fotos do Diário de Obras com checagem de permissão (equipe
  // interna dono do projeto, ou cliente com acesso àquele projeto)
  registerSiteDiaryPhotoRoute(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
