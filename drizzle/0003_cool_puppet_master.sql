-- Tabela de períodos de medição financeira
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
-- Tabela de itens de medição (por composição/item)
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
-- Tabela de aditivos de contrato
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
-- Foreign Keys
ALTER TABLE `measurement_periods` ADD CONSTRAINT `measurement_periods_budgetId_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `measurement_items` ADD CONSTRAINT `measurement_items_periodId_fk` FOREIGN KEY (`periodId`) REFERENCES `measurement_periods`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `measurement_items` ADD CONSTRAINT `measurement_items_budgetId_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `measurement_items` ADD CONSTRAINT `measurement_items_budgetItemId_fk` FOREIGN KEY (`budgetItemId`) REFERENCES `budget_items`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `contract_additives` ADD CONSTRAINT `contract_additives_budgetId_fk` FOREIGN KEY (`budgetId`) REFERENCES `budgets`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Índices
CREATE INDEX `measurement_periods_budgetId_idx` ON `measurement_periods` (`budgetId`);
--> statement-breakpoint
CREATE INDEX `measurement_items_periodId_idx` ON `measurement_items` (`periodId`);
--> statement-breakpoint
CREATE INDEX `measurement_items_budgetId_idx` ON `measurement_items` (`budgetId`);
--> statement-breakpoint
CREATE INDEX `measurement_items_budgetItemId_idx` ON `measurement_items` (`budgetItemId`);
--> statement-breakpoint
CREATE INDEX `measurement_items_unique` ON `measurement_items` (`periodId`,`budgetItemId`);
--> statement-breakpoint
CREATE INDEX `contract_additives_budgetId_idx` ON `contract_additives` (`budgetId`);
