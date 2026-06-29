-- E3.2 — Tokens de magasin scopés par poste (révocables). Seul le hash est stocké.

CREATE TABLE `store_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `label` VARCHAR(191) NULL,
  `revoked` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NULL,
  `caisseId` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `store_tokens_tokenHash_key`(`tokenHash`),
  INDEX `store_tokens_caisseId_idx`(`caisseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `store_tokens` ADD CONSTRAINT `store_tokens_caisseId_fkey`
  FOREIGN KEY (`caisseId`) REFERENCES `caisses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
