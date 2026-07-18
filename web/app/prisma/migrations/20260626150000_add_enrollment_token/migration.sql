-- CreateTable
CREATE TABLE `enrollment_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `label` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `caisseId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `enrollment_tokens_tokenHash_key`(`tokenHash`),
    INDEX `enrollment_tokens_caisseId_idx`(`caisseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `enrollment_tokens` ADD CONSTRAINT `enrollment_tokens_caisseId_fkey` FOREIGN KEY (`caisseId`) REFERENCES `caisses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

