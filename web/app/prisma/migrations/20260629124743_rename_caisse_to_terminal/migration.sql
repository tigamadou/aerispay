-- Renommage « terminal de caisse » : table + colonnes FK + index + contraintes.
-- Non destructeur (RENAME) : données préservées.
-- Le modèle Prisma `Caisse` représentait en réalité un terminal/poste de caisse.

-- 1) Supprimer les contraintes FK (par leur nom actuel) avant le renommage
ALTER TABLE `comptoir_sessions` DROP FOREIGN KEY `comptoir_sessions_caisseId_fkey`;
ALTER TABLE `mouvements_caisse`  DROP FOREIGN KEY `mouvements_caisse_caisseId_fkey`;
ALTER TABLE `store_tokens`       DROP FOREIGN KEY `store_tokens_caisseId_fkey`;
ALTER TABLE `enrollment_tokens`  DROP FOREIGN KEY `enrollment_tokens_caisseId_fkey`;

-- 2) Renommer la table principale + son index unique
RENAME TABLE `caisses` TO `terminaux_caisse`;
ALTER TABLE `terminaux_caisse` RENAME INDEX `caisses_code_key` TO `terminaux_caisse_code_key`;

-- 3) Renommer les colonnes FK caisseId -> terminalId (MySQL 8 : données préservées)
ALTER TABLE `comptoir_sessions` RENAME COLUMN `caisseId` TO `terminalId`;
ALTER TABLE `mouvements_caisse`  RENAME COLUMN `caisseId` TO `terminalId`;
ALTER TABLE `store_tokens`       RENAME COLUMN `caisseId` TO `terminalId`;
ALTER TABLE `enrollment_tokens`  RENAME COLUMN `caisseId` TO `terminalId`;

-- 4) Renommer les index portant sur cette colonne (alignés sur la convention Prisma)
ALTER TABLE `comptoir_sessions` RENAME INDEX `comptoir_sessions_caisseId_statut_idx` TO `comptoir_sessions_terminalId_statut_idx`;
ALTER TABLE `mouvements_caisse`  RENAME INDEX `mouvements_caisse_caisseId_idx`        TO `mouvements_caisse_terminalId_idx`;
ALTER TABLE `store_tokens`       RENAME INDEX `store_tokens_caisseId_idx`             TO `store_tokens_terminalId_idx`;
ALTER TABLE `enrollment_tokens`  RENAME INDEX `enrollment_tokens_caisseId_idx`        TO `enrollment_tokens_terminalId_idx`;

-- 5) Recréer les contraintes FK avec un nom aligné, cible = terminaux_caisse
ALTER TABLE `comptoir_sessions` ADD CONSTRAINT `comptoir_sessions_terminalId_fkey` FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `mouvements_caisse`  ADD CONSTRAINT `mouvements_caisse_terminalId_fkey`  FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `store_tokens`       ADD CONSTRAINT `store_tokens_terminalId_fkey`       FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `enrollment_tokens`  ADD CONSTRAINT `enrollment_tokens_terminalId_fkey`  FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
