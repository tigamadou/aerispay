-- Module Caisse Phase 7 : table événements métier

CREATE TABLE `events_caisse` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `consumed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `events_caisse_type_idx`(`type`),
    INDEX `events_caisse_sessionId_idx`(`sessionId`),
    INDEX `events_caisse_consumed_createdAt_idx`(`consumed`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
