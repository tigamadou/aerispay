-- F1.2 — code poste sur Caisse (préfixe de numérotation VTE-<code>-YYYY-NNNNN)

ALTER TABLE `caisses` ADD COLUMN `code` VARCHAR(191) NULL;

-- Backfill : codes courts pour les caisses seedées, fallback = id pour les autres
UPDATE `caisses` SET `code` = 'P1' WHERE `id` = 'caisse-principale';
UPDATE `caisses` SET `code` = 'P2' WHERE `id` = 'caisse-2';
UPDATE `caisses` SET `code` = `id` WHERE `code` IS NULL;

ALTER TABLE `caisses` MODIFY `code` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `caisses_code_key` ON `caisses`(`code`);
