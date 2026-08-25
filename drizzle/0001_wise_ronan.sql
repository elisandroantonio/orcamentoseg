CREATE TABLE `bdi_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`adminCosts` decimal(5,2) DEFAULT '0',
	`profit` decimal(5,2) DEFAULT '0',
	`taxes` decimal(5,2) DEFAULT '0',
	`risk` decimal(5,2) DEFAULT '0',
	`warranty` decimal(5,2) DEFAULT '0',
	`socialCharges` decimal(5,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bdi_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`observations` text,
	`squareMeters` decimal(10,2),
	`projectId` varchar(255),
	`status` enum('draft','sent','approved','rejected','completed') DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`cnpj` varchar(18),
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `compositions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`substageId` int,
	`stageId` int,
	`budgetId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`quantity` decimal(12,4) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`unitValueMaterial` decimal(12,2) DEFAULT '0',
	`unitValueLabor` decimal(12,2) DEFAULT '0',
	`unitValueEquipment` decimal(12,2) DEFAULT '0',
	`unitValueService` decimal(12,2) DEFAULT '0',
	`unitValueOther` decimal(12,2) DEFAULT '0',
	`order` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compositions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`compositionId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`unit` varchar(50) NOT NULL,
	`coefficient` decimal(8,4) NOT NULL,
	`unitValue` decimal(12,2) NOT NULL,
	`type` enum('material','labor','equipment','service','other') NOT NULL,
	`order` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`order` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `substages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stageId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`order` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `substages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `bdi_configs_budgetId_idx` ON `bdi_configs` (`budgetId`);--> statement-breakpoint
CREATE INDEX `budgets_userId_idx` ON `budgets` (`userId`);--> statement-breakpoint
CREATE INDEX `budgets_clientId_idx` ON `budgets` (`clientId`);--> statement-breakpoint
CREATE INDEX `compositions_budgetId_idx` ON `compositions` (`budgetId`);--> statement-breakpoint
CREATE INDEX `compositions_stageId_idx` ON `compositions` (`stageId`);--> statement-breakpoint
CREATE INDEX `compositions_substageId_idx` ON `compositions` (`substageId`);--> statement-breakpoint
CREATE INDEX `inputs_compositionId_idx` ON `inputs` (`compositionId`);--> statement-breakpoint
CREATE INDEX `stages_budgetId_idx` ON `stages` (`budgetId`);--> statement-breakpoint
CREATE INDEX `substages_stageId_idx` ON `substages` (`stageId`);