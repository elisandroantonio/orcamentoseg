-- Create financial_transactions table
CREATE TABLE IF NOT EXISTS `financial_transactions` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `budgetId` int NOT NULL,
  `date` date NOT NULL,
  `type` enum('entrada','saida') NOT NULL,
  `category` varchar(50),
  `description` varchar(255) NOT NULL,
  `value` decimal(15, 2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `financial_transactions_budgetId_idx` (`budgetId`),
  KEY `financial_transactions_date_idx` (`date`),
  KEY `financial_transactions_type_idx` (`type`),
  CONSTRAINT `financial_transactions_ibfk_1` FOREIGN KEY (`budgetId`) REFERENCES `budgets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
