import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoute } from "./devAuth";
import { registerStorageProxy } from "./storageProxy";
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
