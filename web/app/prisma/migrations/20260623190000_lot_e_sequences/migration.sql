-- Lot E — M3 : compteur de séquences transactionnel (numérotation des ventes).
-- Issu de docs/corrections/06-LOT-E-tva-numerotation.md.

CREATE TABLE `sequences` (
  `id` VARCHAR(191) NOT NULL,
  `valeur` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
