-- Crée la base de test au premier démarrage du conteneur MySQL.
CREATE DATABASE IF NOT EXISTS `aerispay_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `aerispay_test`.* TO 'aerispay'@'%';
FLUSH PRIVILEGES;
