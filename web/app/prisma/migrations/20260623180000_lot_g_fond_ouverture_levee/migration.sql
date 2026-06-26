-- Lot G — Modèle de fond de caisse & levée (Modèle 2) + Lot B (défense en profondeur)
-- Issu de docs/corrections/01-LOT-G-fond-de-caisse.md et 03-LOT-B-anti-survente.md

-- 1. Nouveaux types de mouvement caisse : FOND_OUVERTURE (fond/float rattaché à la session)
--    et LEVEE (levée des recettes vers le coffre à la clôture).
ALTER TABLE `mouvements_caisse`
  MODIFY `type` ENUM(
    'FOND_INITIAL',
    'FOND_OUVERTURE',
    'LEVEE',
    'VENTE',
    'REMBOURSEMENT',
    'APPORT',
    'RETRAIT',
    'DEPENSE',
    'CORRECTION'
  ) NOT NULL;

-- 2. Imputation d'un écart d'ouverture à la session précédente (RULE-FOND-004).
ALTER TABLE `comptoir_sessions`
  ADD COLUMN `ecartOuvertureImputeSessionId` VARCHAR(191) NULL;

-- 3. Lot B — défense en profondeur : interdit tout stock négatif au niveau base.
ALTER TABLE `produits`
  ADD CONSTRAINT `chk_produits_stock_non_negatif` CHECK (`stockActuel` >= 0);
