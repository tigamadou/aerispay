-- Lot C — F1.1 : rattachement caisseId sur ComptoirSession
-- Backfill toutes les sessions existantes sur la caisse principale avant la contrainte.

ALTER TABLE `comptoir_sessions` ADD COLUMN `caisseId` VARCHAR(191) NOT NULL DEFAULT 'caisse-principale';

UPDATE `comptoir_sessions` SET `caisseId` = 'caisse-principale' WHERE `caisseId` = 'caisse-principale';

ALTER TABLE `comptoir_sessions` ALTER COLUMN `caisseId` DROP DEFAULT;

ALTER TABLE `comptoir_sessions` ADD CONSTRAINT `comptoir_sessions_caisseId_fkey`
  FOREIGN KEY (`caisseId`) REFERENCES `caisses`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX `comptoir_sessions_caisseId_statut_idx` ON `comptoir_sessions`(`caisseId`, `statut`);

INSERT IGNORE INTO `caisses` (`id`, `nom`, `active`, `createdAt`) VALUES ('caisse-2', 'Caisse 2', 1, NOW());
