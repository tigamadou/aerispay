-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `motDePasse` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'MANAGER', 'CAISSIER') NOT NULL DEFAULT 'CAISSIER',
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `couleur` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produits` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `codeBarres` VARCHAR(191) NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `image` VARCHAR(191) NULL,
    `prixAchat` DECIMAL(10, 2) NOT NULL,
    `prixVente` DECIMAL(10, 2) NOT NULL,
    `tva` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `unite` VARCHAR(191) NOT NULL DEFAULT 'unité',
    `stockActuel` INTEGER NOT NULL DEFAULT 0,
    `stockMinimum` INTEGER NOT NULL DEFAULT 5,
    `stockMaximum` INTEGER NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `categorieId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `produits_reference_key`(`reference`),
    UNIQUE INDEX `produits_codeBarres_key`(`codeBarres`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mouvements_stock` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('ENTREE', 'SORTIE', 'AJUSTEMENT', 'RETOUR', 'PERTE') NOT NULL,
    `quantite` INTEGER NOT NULL,
    `quantiteAvant` INTEGER NOT NULL,
    `quantiteApres` INTEGER NOT NULL,
    `motif` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `produitId` VARCHAR(191) NOT NULL,
    `venteId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comptoir_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `ouvertureAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fermetureAt` DATETIME(3) NULL,
    `montantOuvertureCash` DECIMAL(10, 2) NOT NULL,
    `montantOuvertureMobileMoney` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `declarationsCaissier` JSON NULL,
    `demandeCloturAt` DATETIME(3) NULL,
    `declarationsValideur` JSON NULL,
    `montantFermetureCash` DECIMAL(10, 2) NULL,
    `montantFermetureMobileMoney` DECIMAL(10, 2) NULL,
    `soldeTheoriqueCash` DECIMAL(10, 2) NULL,
    `soldeTheoriqueMobileMoney` DECIMAL(10, 2) NULL,
    `ecartCash` DECIMAL(10, 2) NULL,
    `ecartMobileMoney` DECIMAL(10, 2) NULL,
    `ecartsParMode` JSON NULL,
    `hashIntegrite` VARCHAR(64) NULL,
    `hashSessionPrecedente` VARCHAR(64) NULL,
    `tentativesRecomptage` INTEGER NOT NULL DEFAULT 0,
    `motifForceClose` TEXT NULL,
    `statut` ENUM('OUVERTE', 'FERMEE', 'EN_ATTENTE_CLOTURE', 'EN_ATTENTE_VALIDATION', 'VALIDEE', 'CONTESTEE', 'FORCEE', 'CORRIGEE') NOT NULL DEFAULT 'OUVERTE',
    `notes` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `valideurId` VARCHAR(191) NULL,
    `sessionCorrigeeId` VARCHAR(191) NULL,

    UNIQUE INDEX `comptoir_sessions_sessionCorrigeeId_key`(`sessionCorrigeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mouvements_caisse` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('FOND_INITIAL', 'VENTE', 'REMBOURSEMENT', 'APPORT', 'RETRAIT', 'DEPENSE', 'CORRECTION') NOT NULL,
    `mode` ENUM('ESPECES', 'MOBILE_MONEY', 'MOBILE_MONEY_MTN', 'MOBILE_MONEY_MOOV', 'CARTE_BANCAIRE') NOT NULL,
    `montant` DECIMAL(10, 2) NOT NULL,
    `motif` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `justificatif` TEXT NULL,
    `offline` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sessionId` VARCHAR(191) NOT NULL,
    `venteId` VARCHAR(191) NULL,
    `auteurId` VARCHAR(191) NOT NULL,

    INDEX `mouvements_caisse_sessionId_idx`(`sessionId`),
    INDEX `mouvements_caisse_venteId_idx`(`venteId`),
    INDEX `mouvements_caisse_auteurId_idx`(`auteurId`),
    INDEX `mouvements_caisse_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seuils_caisse` (
    `id` VARCHAR(191) NOT NULL,
    `valeur` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ventes` (
    `id` VARCHAR(191) NOT NULL,
    `numero` VARCHAR(191) NOT NULL,
    `dateVente` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sousTotal` DECIMAL(10, 2) NOT NULL,
    `remise` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `tva` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `taxesDetail` JSON NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `statut` ENUM('VALIDEE', 'ANNULEE', 'REMBOURSEE') NOT NULL DEFAULT 'VALIDEE',
    `nomClient` VARCHAR(191) NULL,
    `notesCaissier` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ventes_numero_key`(`numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lignes_vente` (
    `id` VARCHAR(191) NOT NULL,
    `quantite` INTEGER NOT NULL,
    `prixUnitaire` DECIMAL(10, 2) NOT NULL,
    `remise` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `tva` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sousTotal` DECIMAL(10, 2) NOT NULL,
    `venteId` VARCHAR(191) NOT NULL,
    `produitId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paiements` (
    `id` VARCHAR(191) NOT NULL,
    `mode` ENUM('ESPECES', 'MOBILE_MONEY', 'MOBILE_MONEY_MTN', 'MOBILE_MONEY_MOOV', 'CARTE_BANCAIRE') NOT NULL,
    `montant` DECIMAL(10, 2) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `venteId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parametres` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `nomCommerce` VARCHAR(191) NOT NULL DEFAULT '',
    `adresse` VARCHAR(191) NOT NULL DEFAULT '',
    `telephone` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `rccm` VARCHAR(191) NOT NULL DEFAULT '',
    `nif` VARCHAR(191) NOT NULL DEFAULT '',
    `logo` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `taxes` (
    `id` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `taux` DECIMAL(5, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `ordre` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `parametresId` VARCHAR(191) NOT NULL DEFAULT 'default',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorId` VARCHAR(191) NULL,

    INDEX `activity_logs_createdAt_idx`(`createdAt`),
    INDEX `activity_logs_actorId_idx`(`actorId`),
    INDEX `activity_logs_action_idx`(`action`),
    INDEX `activity_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `produits` ADD CONSTRAINT `produits_categorieId_fkey` FOREIGN KEY (`categorieId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mouvements_stock` ADD CONSTRAINT `mouvements_stock_produitId_fkey` FOREIGN KEY (`produitId`) REFERENCES `produits`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mouvements_stock` ADD CONSTRAINT `mouvements_stock_venteId_fkey` FOREIGN KEY (`venteId`) REFERENCES `ventes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comptoir_sessions` ADD CONSTRAINT `comptoir_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comptoir_sessions` ADD CONSTRAINT `comptoir_sessions_valideurId_fkey` FOREIGN KEY (`valideurId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comptoir_sessions` ADD CONSTRAINT `comptoir_sessions_sessionCorrigeeId_fkey` FOREIGN KEY (`sessionCorrigeeId`) REFERENCES `comptoir_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mouvements_caisse` ADD CONSTRAINT `mouvements_caisse_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `comptoir_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mouvements_caisse` ADD CONSTRAINT `mouvements_caisse_venteId_fkey` FOREIGN KEY (`venteId`) REFERENCES `ventes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mouvements_caisse` ADD CONSTRAINT `mouvements_caisse_auteurId_fkey` FOREIGN KEY (`auteurId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventes` ADD CONSTRAINT `ventes_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `comptoir_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventes` ADD CONSTRAINT `ventes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lignes_vente` ADD CONSTRAINT `lignes_vente_venteId_fkey` FOREIGN KEY (`venteId`) REFERENCES `ventes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lignes_vente` ADD CONSTRAINT `lignes_vente_produitId_fkey` FOREIGN KEY (`produitId`) REFERENCES `produits`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paiements` ADD CONSTRAINT `paiements_venteId_fkey` FOREIGN KEY (`venteId`) REFERENCES `ventes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `taxes` ADD CONSTRAINT `taxes_parametresId_fkey` FOREIGN KEY (`parametresId`) REFERENCES `parametres`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
