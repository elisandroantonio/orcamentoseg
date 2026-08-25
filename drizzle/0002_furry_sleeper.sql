DROP INDEX `bdi_configs_budgetId_idx` ON `bdi_configs`;--> statement-breakpoint
DROP INDEX `budgets_userId_idx` ON `budgets`;--> statement-breakpoint
DROP INDEX `budgets_clientId_idx` ON `budgets`;--> statement-breakpoint
DROP INDEX `compositions_budgetId_idx` ON `compositions`;--> statement-breakpoint
DROP INDEX `compositions_stageId_idx` ON `compositions`;--> statement-breakpoint
DROP INDEX `compositions_substageId_idx` ON `compositions`;--> statement-breakpoint
DROP INDEX `inputs_compositionId_idx` ON `inputs`;--> statement-breakpoint
DROP INDEX `stages_budgetId_idx` ON `stages`;--> statement-breakpoint
DROP INDEX `substages_stageId_idx` ON `substages`;--> statement-breakpoint
ALTER TABLE `bdi_configs` MODIFY COLUMN `adminCosts` decimal(5,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `bdi_configs` MODIFY COLUMN `profit` decimal(5,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `bdi_configs` MODIFY COLUMN `taxes` decimal(5,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `bdi_configs` MODIFY COLUMN `risk` decimal(5,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `bdi_configs` MODIFY COLUMN `warranty` decimal(5,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `bdi_configs` MODIFY COLUMN `socialCharges` decimal(5,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `budgets` MODIFY COLUMN `status` enum('draft','sent','approved','rejected','completed') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `quantity` decimal(12,4) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unit` varchar(50) NOT NULL DEFAULT 'un';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unitValueMaterial` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unitValueLabor` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unitValueEquipment` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unitValueService` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unitValueOther` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `order` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `unit` varchar(50) NOT NULL DEFAULT 'un';--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `coefficient` decimal(8,4) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `unitValue` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `type` enum('material','labor','equipment','service','other') NOT NULL DEFAULT 'material';--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `order` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `stages` MODIFY COLUMN `order` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `substages` MODIFY COLUMN `order` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(255) DEFAULT '';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(100);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','user') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` varchar(512);