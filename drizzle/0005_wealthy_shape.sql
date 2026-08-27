CREATE TABLE `additive_item_inputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`additiveItemId` int NOT NULL,
	`inputId` int NOT NULL,
	`coefficient` decimal(10,6) NOT NULL,
	`unitCost` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `additive_item_inputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `additive_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`additiveId` int NOT NULL,
	`stageId` int,
	`type` varchar(20) NOT NULL DEFAULT 'composition',
	`compositionId` int,
	`description` text NOT NULL,
	`unit` varchar(20) NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`materialCost` decimal(15,2) NOT NULL DEFAULT '0',
	`laborCost` decimal(15,2) NOT NULL DEFAULT '0',
	`equipmentCost` decimal(15,2) NOT NULL DEFAULT '0',
	`serviceCost` decimal(15,2) NOT NULL DEFAULT '0',
	`otherCost` decimal(15,2) NOT NULL DEFAULT '0',
	`unitCost` decimal(15,2) NOT NULL DEFAULT '0',
	`totalCost` decimal(15,2) NOT NULL DEFAULT '0',
	`order` int NOT NULL DEFAULT 0,
	`applyBdiToMaterial` tinyint NOT NULL DEFAULT 1,
	`applyBdiToLabor` tinyint NOT NULL DEFAULT 1,
	`additionalIncrement` decimal(7,2) NOT NULL DEFAULT '0',
	`discount` decimal(7,2) NOT NULL DEFAULT '0',
	`aplicarEncargosSociais` tinyint NOT NULL DEFAULT 1,
	`includeMaterial` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `additive_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `additive_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`additiveId` int NOT NULL,
	`additiveItemId` int NOT NULL,
	`periodId` int NOT NULL,
	`measuredPercent` decimal(7,4) NOT NULL DEFAULT '0',
	`measuredValue` decimal(15,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `additive_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `additive_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`additiveId` int NOT NULL,
	`parentStageId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`order` int NOT NULL DEFAULT 0,
	`totalCost` decimal(15,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `additive_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `budget_additives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('elaboracao','aprovado','negado') NOT NULL DEFAULT 'elaboracao',
	`frozenAt` timestamp,
	`frozenBy` varchar(255),
	`totalCostNoBdi` decimal(15,2) NOT NULL DEFAULT '0',
	`totalCostWithBdi` decimal(15,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_additives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_item_bdi_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetItemId` int NOT NULL,
	`applyBdiToMaterial` tinyint NOT NULL DEFAULT 1,
	`applyBdiToLabor` tinyint NOT NULL DEFAULT 1,
	`additionalIncrement` decimal(7,2) NOT NULL DEFAULT '0',
	`discount` decimal(7,2) NOT NULL DEFAULT '0',
	`materialAdjustment` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_item_bdi_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `budget_item_bdi_config_budgetItemId_unique` UNIQUE(`budgetItemId`)
);
--> statement-breakpoint
CREATE TABLE `budget_item_inputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetItemId` int NOT NULL,
	`inputId` int NOT NULL,
	`coefficient` decimal(10,6) NOT NULL,
	`unitCost` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_item_inputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`stageId` int,
	`type` varchar(20) NOT NULL DEFAULT 'composition',
	`parentItemId` int,
	`compositionId` int,
	`description` text NOT NULL,
	`unit` varchar(20) NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`materialCost` decimal(15,2) NOT NULL DEFAULT '0',
	`laborCost` decimal(15,2) NOT NULL DEFAULT '0',
	`equipmentCost` decimal(15,2) NOT NULL DEFAULT '0',
	`serviceCost` decimal(15,2) NOT NULL DEFAULT '0',
	`otherCost` decimal(15,2) NOT NULL DEFAULT '0',
	`unitCost` decimal(15,2) NOT NULL,
	`totalCost` decimal(15,2) NOT NULL,
	`laborHours` decimal(10,3) NOT NULL DEFAULT '0',
	`totalLaborHours` decimal(15,2) NOT NULL DEFAULT '0',
	`order` int NOT NULL DEFAULT 0,
	`aplicarEncargosSociais` tinyint NOT NULL DEFAULT 1,
	`laborAdjustment` decimal(10,2) NOT NULL DEFAULT '0',
	`materialAdjustment` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_monthly_distribution` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`stageId` int NOT NULL,
	`periodIndex` int NOT NULL,
	`periodLabel` varchar(50) NOT NULL,
	`percentage` decimal(5,2) NOT NULL DEFAULT '0',
	`value` decimal(15,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_monthly_distribution_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_schedule_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`stageId` int NOT NULL,
	`periodId` int NOT NULL,
	`percentPlanned` decimal(5,2) NOT NULL DEFAULT '0',
	`percentExecuted` decimal(5,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_schedule_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_schedule_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`periodNumber` int NOT NULL,
	`periodName` varchar(50) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_schedule_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`parentStageId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`order` int NOT NULL DEFAULT 0,
	`totalCost` decimal(15,2) NOT NULL DEFAULT '0.00',
	`serviceUnit` varchar(20),
	`serviceQuantity` decimal(15,4),
	`scheduleOrder` int,
	`startDate` date,
	`endDate` date,
	`duration` int,
	`predecessors` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_flow_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`type` enum('entrada','saida') NOT NULL,
	`category` varchar(50) NOT NULL,
	`description` text,
	`amount` decimal(15,2) NOT NULL,
	`reference` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_flow_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`code` varchar(10) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`responsibleName` varchar(255) NOT NULL,
	`responsibleTitle` varchar(100) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`email` varchar(320) NOT NULL,
	`logoUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `composition_inputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`compositionId` int NOT NULL,
	`inputId` int NOT NULL,
	`quantity` decimal(15,4) NOT NULL,
	`coefficient` decimal(10,6) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `composition_inputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_additives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`number` varchar(50) NOT NULL,
	`type` enum('acrescimo','supressao') NOT NULL DEFAULT 'acrescimo',
	`description` text NOT NULL,
	`value` decimal(15,2) NOT NULL DEFAULT '0',
	`signedDate` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contract_additives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cub_sc_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`source` enum('auto','manual') NOT NULL DEFAULT 'auto',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cub_sc_values_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disbursements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`description` text NOT NULL,
	`dueDate` date NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`category` varchar(100),
	`status` enum('planned','paid') NOT NULL DEFAULT 'planned',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disbursements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int,
	`bankAccountId` int,
	`vehicleId` int,
	`userId` int NOT NULL,
	`costCenter` enum('obra','administrativo','frota') NOT NULL DEFAULT 'obra',
	`date` date NOT NULL,
	`type` enum('entrada','saida') NOT NULL,
	`category` varchar(50),
	`description` varchar(255) NOT NULL,
	`payeeName` varchar(255),
	`value` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `material_list_budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialListId` int NOT NULL,
	`budgetId` int NOT NULL,
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `material_list_budgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `material_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialListId` int NOT NULL,
	`budgetId` int,
	`stageId` int,
	`stageName` varchar(255),
	`inputId` int,
	`sinapiCode` varchar(50),
	`description` text NOT NULL,
	`unit` varchar(20) NOT NULL,
	`quantity` decimal(15,4) NOT NULL,
	`unitCost` decimal(15,2) NOT NULL,
	`totalCost` decimal(15,2) NOT NULL,
	`itemType` varchar(20) NOT NULL DEFAULT 'input',
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `material_list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `material_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `material_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `material_merge_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceKey` varchar(300) NOT NULL,
	`targetKey` varchar(300) NOT NULL,
	`targetDescription` text,
	`targetUnit` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `material_merge_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `measurement_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodId` int NOT NULL,
	`budgetId` int NOT NULL,
	`budgetItemId` int NOT NULL,
	`percentMeasured` decimal(7,4) NOT NULL DEFAULT '0',
	`quantityMeasured` decimal(15,4) NOT NULL DEFAULT '0',
	`valueMeasured` decimal(15,2) NOT NULL DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `measurement_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `measurement_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`periodNumber` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`startDate` date,
	`endDate` date,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `measurement_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`client` varchar(255),
	`location` text,
	`description` text,
	`startDate` date,
	`endDate` date,
	`status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`budgetItemId` int,
	`description` text NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`totalCost` decimal(15,2) NOT NULL,
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`physicalProgress` decimal(5,2) NOT NULL,
	`financialAmount` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateStageId` int NOT NULL,
	`type` enum('composition','input','service') NOT NULL,
	`compositionId` int,
	`inputId` int,
	`code` varchar(50),
	`description` text NOT NULL,
	`unit` varchar(10) NOT NULL,
	`quantity` decimal(10,2) NOT NULL DEFAULT '1.00',
	`materialCost` decimal(15,2),
	`laborCost` decimal(15,2),
	`equipmentCost` decimal(15,2),
	`serviceCost` decimal(15,2),
	`otherCost` decimal(15,2),
	`aplicarBdiMaterial` boolean DEFAULT true,
	`aplicarBdiMaoObra` boolean DEFAULT true,
	`aplicarEncargosSociais` boolean DEFAULT true,
	`incrementoAdicional` decimal(5,2) DEFAULT '0.00',
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `template_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`parentId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `template_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `bdi_configs`;--> statement-breakpoint
DROP TABLE `stages`;--> statement-breakpoint
DROP TABLE `substages`;--> statement-breakpoint
ALTER TABLE `budgets` MODIFY COLUMN `projectId` int;--> statement-breakpoint
ALTER TABLE `budgets` MODIFY COLUMN `status` enum('draft','sent','approved','rejected') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `description` text NOT NULL;--> statement-breakpoint
ALTER TABLE `compositions` MODIFY COLUMN `unit` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `description` text NOT NULL;--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `unit` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `inputs` MODIFY COLUMN `type` enum('material','labor','equipment') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` text;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `budgets` ADD `code` varchar(50);--> statement-breakpoint
ALTER TABLE `budgets` ADD `socialCharges` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `adminCentral` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `profit` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `taxes` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `risk` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `warranty` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `totalMaterialCost` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `totalLaborCost` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `totalCost` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `totalLaborHours` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `startDate` date;--> statement-breakpoint
ALTER TABLE `budgets` ADD `endDate` date;--> statement-breakpoint
ALTER TABLE `budgets` ADD `durationMonths` int;--> statement-breakpoint
ALTER TABLE `budgets` ADD `periodType` enum('monthly','biweekly','weekly') DEFAULT 'monthly';--> statement-breakpoint
ALTER TABLE `budgets` ADD `workStatus` enum('orcamento','contrato','execucao','finalizada','nao_fechada') DEFAULT 'execucao' NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `frozenAt` timestamp;--> statement-breakpoint
ALTER TABLE `budgets` ADD `frozenBy` varchar(255);--> statement-breakpoint
ALTER TABLE `budgets` ADD `includeMaterial` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `budgets` ADD `initialPaymentPercent` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `documentType` enum('cpf','cnpj') NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `document` varchar(18) NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `zipCode` varchar(10);--> statement-breakpoint
ALTER TABLE `clients` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `compositions` ADD `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `compositions` ADD `categoryId` int;--> statement-breakpoint
ALTER TABLE `compositions` ADD `code` varchar(50);--> statement-breakpoint
ALTER TABLE `compositions` ADD `materialCost` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `compositions` ADD `laborCost` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `compositions` ADD `equipmentCost` decimal(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `compositions` ADD `laborHours` decimal(10,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `compositions` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `inputs` ADD `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `inputs` ADD `code` varchar(50);--> statement-breakpoint
ALTER TABLE `inputs` ADD `unitCost` decimal(15,2) NOT NULL;--> statement-breakpoint
ALTER TABLE `inputs` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_code_unique` UNIQUE(`code`);--> statement-breakpoint
ALTER TABLE `additive_item_inputs` ADD CONSTRAINT `additive_item_inputs_additiveItemId_additive_items_id_fk` FOREIGN KEY (`additiveItemId`) REFERENCES `additive_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_item_inputs` ADD CONSTRAINT `additive_item_inputs_inputId_inputs_id_fk` FOREIGN KEY (`inputId`) REFERENCES `inputs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_items` ADD CONSTRAINT `additive_items_additiveId_budget_additives_id_fk` FOREIGN KEY (`additiveId`) REFERENCES `budget_additives`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_items` ADD CONSTRAINT `additive_items_stageId_additive_stages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `additive_stages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_items` ADD CONSTRAINT `additive_items_compositionId_compositions_id_fk` FOREIGN KEY (`compositionId`) REFERENCES `compositions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_measurements` ADD CONSTRAINT `additive_measurements_additiveId_budget_additives_id_fk` FOREIGN KEY (`additiveId`) REFERENCES `budget_additives`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_measurements` ADD CONSTRAINT `additive_measurements_additiveItemId_additive_items_id_fk` FOREIGN KEY (`additiveItemId`) REFERENCES `additive_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_measurements` ADD CONSTRAINT `additive_measurements_periodId_measurement_periods_id_fk` FOREIGN KEY (`periodId`) REFERENCES `measurement_periods`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_stages` ADD CONSTRAINT `additive_stages_additiveId_budget_additives_id_fk` FOREIGN KEY (`additiveId`) REFERENCES `budget_additives`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `additive_stages` ADD CONSTRAINT `additive_stages_parentStageId_additive_stages_id_fk` FOREIGN KEY (`parentStageId`) REFERENCES `additive_stages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_additives` ADD CONSTRAINT `budget_additives_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_additives` ADD CONSTRAINT `budget_additives_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_item_bdi_config` ADD CONSTRAINT `budget_item_bdi_config_budgetItemId_budget_items_id_fk` FOREIGN KEY (`budgetItemId`) REFERENCES `budget_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_item_inputs` ADD CONSTRAINT `budget_item_inputs_budgetItemId_budget_items_id_fk` FOREIGN KEY (`budgetItemId`) REFERENCES `budget_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_item_inputs` ADD CONSTRAINT `budget_item_inputs_inputId_inputs_id_fk` FOREIGN KEY (`inputId`) REFERENCES `inputs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_stageId_budget_stages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `budget_stages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_compositionId_compositions_id_fk` FOREIGN KEY (`compositionId`) REFERENCES `compositions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_monthly_distribution` ADD CONSTRAINT `budget_monthly_distribution_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_monthly_distribution` ADD CONSTRAINT `budget_monthly_distribution_stageId_budget_stages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `budget_stages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_schedule_items` ADD CONSTRAINT `budget_schedule_items_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_schedule_items` ADD CONSTRAINT `budget_schedule_items_stageId_budget_stages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `budget_stages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_schedule_items` ADD CONSTRAINT `budget_schedule_items_periodId_budget_schedule_periods_id_fk` FOREIGN KEY (`periodId`) REFERENCES `budget_schedule_periods`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_schedule_periods` ADD CONSTRAINT `budget_schedule_periods_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_stages` ADD CONSTRAINT `budget_stages_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_stages` ADD CONSTRAINT `budget_stages_parentStageId_budget_stages_id_fk` FOREIGN KEY (`parentStageId`) REFERENCES `budget_stages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_templates` ADD CONSTRAINT `budget_templates_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow_entries` ADD CONSTRAINT `cash_flow_entries_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `composition_inputs` ADD CONSTRAINT `composition_inputs_compositionId_compositions_id_fk` FOREIGN KEY (`compositionId`) REFERENCES `compositions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `composition_inputs` ADD CONSTRAINT `composition_inputs_inputId_inputs_id_fk` FOREIGN KEY (`inputId`) REFERENCES `inputs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_additives` ADD CONSTRAINT `contract_additives_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disbursements` ADD CONSTRAINT `disbursements_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_bankAccountId_bank_accounts_id_fk` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_vehicleId_fleet_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `fleet_vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD CONSTRAINT `financial_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD CONSTRAINT `fleet_vehicles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_list_budgets` ADD CONSTRAINT `material_list_budgets_materialListId_material_lists_id_fk` FOREIGN KEY (`materialListId`) REFERENCES `material_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_list_budgets` ADD CONSTRAINT `material_list_budgets_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_list_items` ADD CONSTRAINT `material_list_items_materialListId_material_lists_id_fk` FOREIGN KEY (`materialListId`) REFERENCES `material_lists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_list_items` ADD CONSTRAINT `material_list_items_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_list_items` ADD CONSTRAINT `material_list_items_stageId_budget_stages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `budget_stages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_list_items` ADD CONSTRAINT `material_list_items_inputId_inputs_id_fk` FOREIGN KEY (`inputId`) REFERENCES `inputs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_lists` ADD CONSTRAINT `material_lists_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_merge_rules` ADD CONSTRAINT `material_merge_rules_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `measurement_items` ADD CONSTRAINT `measurement_items_periodId_measurement_periods_id_fk` FOREIGN KEY (`periodId`) REFERENCES `measurement_periods`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `measurement_items` ADD CONSTRAINT `measurement_items_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `measurement_items` ADD CONSTRAINT `measurement_items_budgetItemId_budget_items_id_fk` FOREIGN KEY (`budgetItemId`) REFERENCES `budget_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `measurement_periods` ADD CONSTRAINT `measurement_periods_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_budgetId_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_budgetItemId_budget_items_id_fk` FOREIGN KEY (`budgetItemId`) REFERENCES `budget_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_periods` ADD CONSTRAINT `schedule_periods_activityId_schedule_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_items` ADD CONSTRAINT `template_items_templateStageId_template_stages_id_fk` FOREIGN KEY (`templateStageId`) REFERENCES `template_stages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_items` ADD CONSTRAINT `template_items_compositionId_compositions_id_fk` FOREIGN KEY (`compositionId`) REFERENCES `compositions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_items` ADD CONSTRAINT `template_items_inputId_inputs_id_fk` FOREIGN KEY (`inputId`) REFERENCES `inputs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_stages` ADD CONSTRAINT `template_stages_templateId_budget_templates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `budget_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `additive_item_inputs_additiveItemId_idx` ON `additive_item_inputs` (`additiveItemId`);--> statement-breakpoint
CREATE INDEX `additive_item_inputs_inputId_idx` ON `additive_item_inputs` (`inputId`);--> statement-breakpoint
CREATE INDEX `additive_items_additiveId_idx` ON `additive_items` (`additiveId`);--> statement-breakpoint
CREATE INDEX `additive_items_stageId_idx` ON `additive_items` (`stageId`);--> statement-breakpoint
CREATE INDEX `additive_measurements_additiveId_idx` ON `additive_measurements` (`additiveId`);--> statement-breakpoint
CREATE INDEX `additive_measurements_additiveItemId_idx` ON `additive_measurements` (`additiveItemId`);--> statement-breakpoint
CREATE INDEX `additive_measurements_periodId_idx` ON `additive_measurements` (`periodId`);--> statement-breakpoint
CREATE INDEX `additive_stages_additiveId_idx` ON `additive_stages` (`additiveId`);--> statement-breakpoint
CREATE INDEX `additive_stages_parentStageId_idx` ON `additive_stages` (`parentStageId`);--> statement-breakpoint
CREATE INDEX `bank_accounts_userId_idx` ON `bank_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `budget_additives_budgetId_idx` ON `budget_additives` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budget_additives_userId_idx` ON `budget_additives` (`userId`);--> statement-breakpoint
CREATE INDEX `budget_item_bdi_config_budgetItemId_idx` ON `budget_item_bdi_config` (`budgetItemId`);--> statement-breakpoint
CREATE INDEX `budget_item_inputs_budgetItemId_idx` ON `budget_item_inputs` (`budgetItemId`);--> statement-breakpoint
CREATE INDEX `budget_item_inputs_inputId_idx` ON `budget_item_inputs` (`inputId`);--> statement-breakpoint
CREATE INDEX `budget_items_budgetId_idx` ON `budget_items` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budget_monthly_distribution_budgetId_idx` ON `budget_monthly_distribution` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budget_monthly_distribution_stageId_idx` ON `budget_monthly_distribution` (`stageId`);--> statement-breakpoint
CREATE INDEX `budget_monthly_distribution_unique` ON `budget_monthly_distribution` (`budgetId`,`stageId`,`periodIndex`);--> statement-breakpoint
CREATE INDEX `budget_schedule_items_budgetId_idx` ON `budget_schedule_items` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budget_schedule_items_stageId_idx` ON `budget_schedule_items` (`stageId`);--> statement-breakpoint
CREATE INDEX `budget_schedule_items_periodId_idx` ON `budget_schedule_items` (`periodId`);--> statement-breakpoint
CREATE INDEX `budget_schedule_periods_budgetId_idx` ON `budget_schedule_periods` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budget_stages_budgetId_idx` ON `budget_stages` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budget_stages_parentStageId_idx` ON `budget_stages` (`parentStageId`);--> statement-breakpoint
CREATE INDEX `budget_templates_userId_idx` ON `budget_templates` (`userId`);--> statement-breakpoint
CREATE INDEX `cash_flow_entries_budgetId_idx` ON `cash_flow_entries` (`budgetId`);--> statement-breakpoint
CREATE INDEX `cash_flow_entries_month_idx` ON `cash_flow_entries` (`month`);--> statement-breakpoint
CREATE INDEX `cash_flow_entries_budgetMonth_idx` ON `cash_flow_entries` (`budgetId`,`month`);--> statement-breakpoint
CREATE INDEX `categories_userId_idx` ON `categories` (`userId`);--> statement-breakpoint
CREATE INDEX `categories_code_idx` ON `categories` (`code`);--> statement-breakpoint
CREATE INDEX `company_settings_userId_idx` ON `company_settings` (`userId`);--> statement-breakpoint
CREATE INDEX `composition_inputs_compositionId_idx` ON `composition_inputs` (`compositionId`);--> statement-breakpoint
CREATE INDEX `composition_inputs_inputId_idx` ON `composition_inputs` (`inputId`);--> statement-breakpoint
CREATE INDEX `contract_additives_budgetId_idx` ON `contract_additives` (`budgetId`);--> statement-breakpoint
CREATE INDEX `cub_sc_values_year_month_idx` ON `cub_sc_values` (`year`,`month`);--> statement-breakpoint
CREATE INDEX `disbursements_budgetId_idx` ON `disbursements` (`budgetId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_budgetId_idx` ON `financial_transactions` (`budgetId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_userId_idx` ON `financial_transactions` (`userId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_costCenter_idx` ON `financial_transactions` (`costCenter`);--> statement-breakpoint
CREATE INDEX `financial_transactions_date_idx` ON `financial_transactions` (`date`);--> statement-breakpoint
CREATE INDEX `financial_transactions_type_idx` ON `financial_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `fleet_vehicles_userId_idx` ON `fleet_vehicles` (`userId`);--> statement-breakpoint
CREATE INDEX `material_list_budgets_listId_idx` ON `material_list_budgets` (`materialListId`);--> statement-breakpoint
CREATE INDEX `material_list_budgets_budgetId_idx` ON `material_list_budgets` (`budgetId`);--> statement-breakpoint
CREATE INDEX `material_list_items_listId_idx` ON `material_list_items` (`materialListId`);--> statement-breakpoint
CREATE INDEX `material_list_items_budgetId_idx` ON `material_list_items` (`budgetId`);--> statement-breakpoint
CREATE INDEX `material_list_items_stageId_idx` ON `material_list_items` (`stageId`);--> statement-breakpoint
CREATE INDEX `material_lists_userId_idx` ON `material_lists` (`userId`);--> statement-breakpoint
CREATE INDEX `material_merge_rules_userId_idx` ON `material_merge_rules` (`userId`);--> statement-breakpoint
CREATE INDEX `material_merge_rules_user_source_idx` ON `material_merge_rules` (`userId`,`sourceKey`);--> statement-breakpoint
CREATE INDEX `measurement_items_periodId_idx` ON `measurement_items` (`periodId`);--> statement-breakpoint
CREATE INDEX `measurement_items_budgetId_idx` ON `measurement_items` (`budgetId`);--> statement-breakpoint
CREATE INDEX `measurement_items_budgetItemId_idx` ON `measurement_items` (`budgetItemId`);--> statement-breakpoint
CREATE INDEX `measurement_items_unique` ON `measurement_items` (`periodId`,`budgetItemId`);--> statement-breakpoint
CREATE INDEX `measurement_periods_budgetId_idx` ON `measurement_periods` (`budgetId`);--> statement-breakpoint
CREATE INDEX `projects_userId_idx` ON `projects` (`userId`);--> statement-breakpoint
CREATE INDEX `schedule_activities_budgetId_idx` ON `schedule_activities` (`budgetId`);--> statement-breakpoint
CREATE INDEX `schedule_periods_activityId_idx` ON `schedule_periods` (`activityId`);--> statement-breakpoint
CREATE INDEX `template_items_templateStageId_idx` ON `template_items` (`templateStageId`);--> statement-breakpoint
CREATE INDEX `template_items_compositionId_idx` ON `template_items` (`compositionId`);--> statement-breakpoint
CREATE INDEX `template_items_inputId_idx` ON `template_items` (`inputId`);--> statement-breakpoint
CREATE INDEX `template_stages_templateId_idx` ON `template_stages` (`templateId`);--> statement-breakpoint
CREATE INDEX `template_stages_parentId_idx` ON `template_stages` (`parentId`);--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `compositions` ADD CONSTRAINT `compositions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `compositions` ADD CONSTRAINT `compositions_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inputs` ADD CONSTRAINT `inputs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `budgets_userId_idx` ON `budgets` (`userId`);--> statement-breakpoint
CREATE INDEX `budgets_projectId_idx` ON `budgets` (`projectId`);--> statement-breakpoint
CREATE INDEX `clients_userId_idx` ON `clients` (`userId`);--> statement-breakpoint
CREATE INDEX `clients_document_idx` ON `clients` (`document`);--> statement-breakpoint
CREATE INDEX `compositions_userId_idx` ON `compositions` (`userId`);--> statement-breakpoint
CREATE INDEX `compositions_categoryId_idx` ON `compositions` (`categoryId`);--> statement-breakpoint
CREATE INDEX `compositions_code_idx` ON `compositions` (`code`);--> statement-breakpoint
CREATE INDEX `inputs_userId_idx` ON `inputs` (`userId`);--> statement-breakpoint
CREATE INDEX `inputs_type_idx` ON `inputs` (`type`);--> statement-breakpoint
ALTER TABLE `clients` DROP COLUMN `cnpj`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `substageId`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `stageId`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `budgetId`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `quantity`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `unitValueMaterial`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `unitValueLabor`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `unitValueEquipment`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `unitValueService`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `unitValueOther`;--> statement-breakpoint
ALTER TABLE `compositions` DROP COLUMN `order`;--> statement-breakpoint
ALTER TABLE `inputs` DROP COLUMN `compositionId`;--> statement-breakpoint
ALTER TABLE `inputs` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `inputs` DROP COLUMN `coefficient`;--> statement-breakpoint
ALTER TABLE `inputs` DROP COLUMN `unitValue`;--> statement-breakpoint
ALTER TABLE `inputs` DROP COLUMN `order`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `avatar`;