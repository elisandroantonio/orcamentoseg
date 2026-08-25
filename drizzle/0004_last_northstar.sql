-- Custom SQL migration file, put your code below! --

-- Adicionar workStatus na tabela budgets
ALTER TABLE `budgets` ADD COLUMN `workStatus` enum('orcamento','contrato','execucao','finalizada','nao_fechada') NOT NULL DEFAULT 'execucao';
--> statement-breakpoint
-- Criar tabela bank_accounts
CREATE TABLE `bank_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `bank` varchar(100) NOT NULL,
  `type` enum('corrente','poupanca','caixa') NOT NULL DEFAULT 'corrente',
  `agency` varchar(20),
  `accountNumber` varchar(30),
  `initialBalance` decimal(15,2) NOT NULL DEFAULT '0',
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Criar tabela fleet_vehicles
CREATE TABLE `fleet_vehicles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `type` enum('veiculo','maquina') NOT NULL DEFAULT 'veiculo',
  `description` varchar(255) NOT NULL,
  `plate` varchar(10),
  `model` varchar(100),
  `year` int,
  `status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fleet_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Adicionar novos campos na tabela financial_transactions
ALTER TABLE `financial_transactions`
  ADD COLUMN `bankAccountId` int,
  ADD COLUMN `vehicleId` int,
  ADD COLUMN `userId` int NOT NULL DEFAULT 1,
  ADD COLUMN `costCenter` enum('obra','administrativo','frota') NOT NULL DEFAULT 'obra',
  ADD COLUMN `payeeName` varchar(255),
  MODIFY COLUMN `budgetId` int;
--> statement-breakpoint
-- Foreign keys para bank_accounts
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Foreign keys para fleet_vehicles
ALTER TABLE `fleet_vehicles` ADD CONSTRAINT `fleet_vehicles_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Foreign keys para financial_transactions (novos campos)
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_bankAccountId_fk` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_vehicleId_fk` FOREIGN KEY (`vehicleId`) REFERENCES `fleet_vehicles`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Indices
CREATE INDEX `bank_accounts_userId_idx` ON `bank_accounts` (`userId`);
--> statement-breakpoint
CREATE INDEX `fleet_vehicles_userId_idx` ON `fleet_vehicles` (`userId`);
--> statement-breakpoint
CREATE INDEX `financial_transactions_userId_idx` ON `financial_transactions` (`userId`);
--> statement-breakpoint
CREATE INDEX `financial_transactions_costCenter_idx` ON `financial_transactions` (`costCenter`);
