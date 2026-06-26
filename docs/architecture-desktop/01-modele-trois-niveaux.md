# 01 — Modèle à trois niveaux & carte d'autorité

[← Index](README.md)

## 1. Rôle de chaque niveau

### Niveau 3 — Cloud (organisation / groupe)
Base **parente**. Agrège tous les magasins de l'organisation. Responsabilités :
- Gestion **centrale des données de référence** (catalogue produits, prix, utilisateurs/rôles, paramètres, taxes, seuils) susceptibles d'être diffusées aux magasins.
- **Reporting consolidé** inter-magasins, tableaux de bord groupe.
- **Accès distant** contrôlé et **sauvegardes en ligne** (via S3, déjà présent dans le code).
- **Enrôlement** des magasins et des postes (émission des tokens, révocation).

Le cloud **n'écrit jamais** dans le ledger de caisse d'un magasin ; il l'**ingère** (lecture/agrégation).

### Niveau 2 — Nœud magasin (base locale du magasin)
**Source de vérité unique du magasin.** Une machine dédiée du magasin héberge :
- le **serveur applicatif** (Next + Prisma) exposant l'**API** consommée par les caisses ;
- la **base MySQL** du magasin (le schéma Prisma actuel, inchangé) ;
- le **worker de synchronisation** magasin ↔ cloud.

Toutes les caisses du magasin lisent et écrivent **ici**, en réseau local. C'est ce niveau qui garantit la cohérence (stock, sessions, intégrité). Détaillé dans [04](04-noeud-magasin.md).

### Niveau 1 — Caisse / poste (client desktop Electron)
**Terminal de présentation + pont périphériques**, **sans base de données**. Affiche l'UI servie par le nœud magasin et pilote l'imprimante / le tiroir / la douchette **localement**. Identifié par un `caisseId` (Lot C). Si le nœud magasin est injoignable → **blocage**. Détaillé dans [02](02-client-desktop.md).

## 2. Carte d'autorité (qui écrit quoi, où)

| Donnée | Autorité | Sens de propagation | Remarque |
|---|---|---|---|
| Produits, prix, catégories | **Cloud** | Cloud → magasin (référence) | Édition centrale ; diffusion descendante |
| Utilisateurs, rôles, mots de passe (hash) | **Cloud** | Cloud → magasin | Désactivation propagée ; login servi par le magasin |
| Paramètres, taxes, seuils | **Cloud** | Cloud → magasin | Référence descendante stricte : pas d'édition au magasin (ADR-006) |
| **Stock** (produit.stockActuel, mouvements) | **Magasin** | Magasin → cloud (agrégation) | Cohérent au sein du magasin (base unique) |
| **Ventes** (vente, lignes, paiements) | **Magasin** | Magasin → cloud (append-only) | Générées par les caisses, persistées au magasin |
| **Sessions de caisse, mouvements caisse** | **Magasin** | Magasin → cloud (append-only) | Ledger ; partitionné par caisse |
| **Hash d'intégrité de session** | **Caisse** (au sein du magasin) | Magasin → cloud | Chaîné **par caisse** (voir §4) |
| Journal d'activité | **Magasin** | Magasin → cloud | Audit |

Principe : **référence descendante** (cloud fait foi), **transactionnel montant** (magasin fait foi). Le cloud ne réécrit jamais le transactionnel.

## 3. Pourquoi ce modèle préserve la cohérence

- **Stock strictement cohérent** : toutes les caisses d'un magasin partagent **une seule base**. Le décrément conditionnel atomique du **Lot B** s'exécute contre cette base unique → **pas de survente** entre caisses. Le problème de stock distribué (qui existerait en local-first par caisse) **n'apparaît pas**.
- **Ledger de caisse intègre** : les sessions, mouvements et leur réconciliation appartiennent à une caisse (Lot C) et vivent dans la base magasin, écrits par un seul poste à la fois → pas de conflit.
- **Le distribué est confiné** à la frontière magasin ↔ cloud (chapitre [05](05-synchronisation-cloud.md)), où les données montantes sont **append-only** donc faciles à fusionner.

## 4. Conséquences sur l'identité et l'intégrité

- **Identifiants** : le code utilise déjà `cuid()` → génération sans collision, compatible avec une agrégation cloud multi-magasins. Aucun changement.
- **Numérotation des ventes** : doit être **préfixée par poste/caisse** (`VTE-<codePoste>-YYYY-NNNNN`) pour rester unique à l'échelle organisation et hors-collision (recoupe Lot E / M3).
- **Chaîne de hash d'intégrité** : chaîner **par caisse** plutôt que globalement (ajustement de `integrity.ts`). Chaque caisse conserve une chaîne ordonnée et vérifiable ; le cloud stocke les chaînes des différentes caisses sans avoir à les ordonner entre elles.

## 5. Modes de déploiement (même binaire)

- **Mono-caisse** : la machine fait à la fois nœud magasin **et** client (mode « autonome »). La règle de blocage est trivialement satisfaite.
- **Multi-caisse** : un nœud magasin dédié + N clients caisse.
- (Optionnel futur) **multi-magasin** : N nœuds magasin, chacun synchronisant vers le cloud.

Voir [03 — Enrôlement & installation](03-enrolement-installation.md) pour le choix du mode à l'installation.
