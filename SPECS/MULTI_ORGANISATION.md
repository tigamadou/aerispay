# Spec — Multi-organisation, multi-magasin, données locales & sauvegarde

> Ce document décrit la **cible produit** pour : une structure (groupe) qui exploite **plusieurs supermarchés / points de vente**, avec **plusieurs postes de caisse** et **plusieurs caissiers** par site, **base de données locale** en magasin, et **sauvegarde en ligne** + **accès à distance** pour la direction ou le support.  
> Le **MVP** actuel peut rester mono-site dans le schéma de données ; cette spec sert d’**alignement** pour les migrations futures et l’infrastructure. Elle complète `SPECS/COMPTOIR.md` (sessions, caissiers).

---

## 1. Vocabulaire

| Terme | Sens |
|--------|------|
| **Structure** (groupe, organisation) | L’entité légale ou le groupe de distribution qui regroupe **plusieurs magasins** sous la même gouvernance. |
| **Point de vente (PDV) / magasin** | Un supermarché (ou agence) où l’app AerisPay est **installée** : une **instance applicative** et typiquement **une base MySQL dédiée** (données locales). |
| **Caisse (poste de vente)** | Un **terminal** physique (PC, mini-PC) où tourne le navigateur POS : chaque poste a son **matériel** (imprimante, douchette) au sens de `SPECS/PERIPHERIQUES.md`. |
| **Caissier** | Rôle `CAISSIER` au **niveau point de vente** (cœur de l’équipe de vente) — `SPECS/COMPTOIR.md` et `SPECS/AUTH.md`. |
| **Sauvegarde en ligne** | Copie chiffrée de la base (ou des exports métier) vers un **stockage distant** (cloud objet, autre hébergeur) pour reprise, audit ou consultation. |
| **Accès à distance** | Accès autorisé aux **indicateurs / listes** (KPI, ventes, stock) **sans** nécessiter la présence physique, via un canal **sécurisé** (jamais une exposition directe de MySQL sur Internet). |

### 1.1 Rôles utilisateurs : groupe et point de vente

| Niveau | Rôles (MVP / cible) | Rôle opérationnel |
|--------|---------------------|-------------------|
| **Groupe (structure)** | Cible : p. ex. `ADMIN_RESEAU`, `LECTEUR_RESEAU` | **Peu** d’utilisateurs : pilotage, audit, **vues multi-magasins** ; pas d’opération de caisse quotidienne. |
| **Point de vente (magasin)** | `ADMIN`, `MANAGER`, `CAISSIER` (MVP = tous **PDV** sur l’instance) | **L’essentiel des comptes** : **caissiers** ; **gérant** (`MANAGER`) ; **administrateur local** (`ADMIN`) pour comptes et paramètres **du site**. |

Source normative (matrices, gouvernance, évolution d’`enum`) : **`SPECS/AUTH.md`**.

---

## 2. Périmètre fonctionnel visé

### 2.1 Plusieurs magasins pour la même structure

- Une **structure** peut gérer **N magasins** ; chaque magasin a son **périmètre opérationnel** (stock, ventes, caisses, clients locaux) **isolé** des autres pour éviter mélange de encaissements et de stocks.
- Côté **déploiement simple (recommandé en phase 1 “multi-sites”)** : **une installation AerisPay par magasin** (fichier Compose ou VM par site), chacun avec son propre `DATABASE_URL` : la **base reste locale** au réseau du supermarché. La “multi-appartenance” à la structure se fait par **naming**, **champs métier** (ex. `organisationId` / `magasinId` dans le schéma) et/ou **fédération légère** côté reporting, pas en mélangeant les bases.
- Côté **futur “tenant unique” (option avancée)** : une seule base avec **scoping** systématique `organisationId` + `magasinId` sur toutes les tables métier. Ce modèle exige règles d’isolation fortes, tests d’injection, et n’est **pas requis** pour le premier jalon.

### 2.2 Multi-caisses (plusieurs postes par magasin)

- Plusieurs **caisses** travaillent en **parallèle** le même jour, sur le **même stock logique** du magasin.
- Règles cibles :
  - Chaque poste a un identifiant de **contexte** (futur modèle : `Caisse` ou `PosteCaisse` : code, **magasin** parent, libellé).
  - Chaque `ComptoirSession` est rattachée au **caissier** *et* au **poste / magasin** (selon schéma retenu) pour l’audit et le rapprochement de fonds.
  - `SPECS/COMPTOIR.md` s’applique par caissier ; l’évolution consiste à **distinguer** les postes (numéro de caisse sur le ticket, rapports par poste).
- Cohérence stock : toutes les ventes du même magasin **décrémentent** le **même** inventaire (stock central du PDV) ; pas de conflit si les ventes passent par la même base locale et des transactions Prisma.

### 2.3 Multi-caissiers (plusieurs utilisateurs)

- Comportement cible : plusieurs **comptes** sur le **même magasin** : en **volume** surtout des **caissiers** ; complétés par un **gérant** (`MANAGER`) et un **administrateur local** (`ADMIN`) — modèle des rôles : `SPECS/AUTH.md` (deux niveaux : **groupe** vs **point de vente**).
- Le modèle `User` + `ComptoirSession` : voir `SPECS/COMPTOIR.md` (une session active par caissier).
- **Création des comptes** sur un point de vente : typiquement par l’`ADMIN` **de ce** magasin ; les comptes **groupe** (direction, lecture consolidée) relèvent de rôles transverses décrits dans `SPECS/AUTH.md` (phase post-MVP intégral).

### 2.4 Base de données **locale** par magasin

- **Objectif** : latence faible, caisse opérationnelle **sans** dépendre d’Internet ; résilience en cas de coupure WAN.
- **Mise en œuvre** : MySQL sur le **LAN** du site (souvent via Docker, cf. `DOCKER.md`) — **pas** d’exigence que le POS lise/écrive une base cloud en temps réel.
- Toute couche “cloud” est **asynchrone** (sauvegarde, analytics, réplication) pour ne **pas** bloquer les ventes.

### 2.5 Sauvegarde en ligne

- **Objectifs** : reprise après sinistre, conservation, possibilité d’**analyse** sur une copie **hors site**.
- **Méthodes typiques** (à dimensionner en prod) :
  - `mysqldump` / `mariadb-dump` périodique, **fichier chiffré**, vers **S3** (ou compatible) ;
  - ou outil de **backup** managé si la base est hébergée chez un fournisseur.
- **Fréquence** : au minimum **quotidien** + **rétention** définie (7/30/365 jours) ; ajustable selon criticité.
- **Secrets** : clés de chiffrement et d’accès **hors** du dépôt ; pas de mots de passe S3 en clair dans les logs d’`activity-log`.

### 2.6 Accès à distance

- **Cas d’usage** : direction, comptabilité, support IT consultent **synthèses** ou **détail** d’un magasin sans se déplacer.
- **Pistes saines** (à implémenter avec TDD) :
  - **Extranet** ou module **reporting** sur l’**instance** d’un magasin exposé derrière **HTTPS** + authentification forte, **ou**
  - **Lecture** sur un **entrepôt** (data warehouse) alimenté par des **exports** ou la **restauration** d’une sauvegarde en environnement d’analyse, **ou**
  - **VPN** site-à-site vers le LAN, puis accès **comme** en local (sans publier MySQL :3306 sur Internet).  
- **À éviter** : ouvrir MySQL directement sur l’Internet public. Préférer API applicative, bastion, ou sync vers une base de lecture.

---

## 3. Impacts sur le modèle de données (guidage)

- **MVP** : le schéma `ARCHITECTURE_MVP.md` peut rester **mono-magasin implicite** (un déploiement = un site).
- **Évolution** (à planifier) :
  - `Organisation` (structure) → `Magasin` (PDV) ;
  - FK `magasinId` (ou `organisationId` seul si un seul site par base) sur `Produit`, `Vente`, `ComptoirSession`, etc. ;
  - `PosteCaisse` (option) pour le multi-terminaux,
  - numérotation des ventes **par année fiscale et par magasin** si nécessaire (préfixe par code magasin) — à valider en comptabilité.  
- Tant que **chaque site** a **sa propre base**, l’`id` de magasin peut tenir en **variable d’environnement** (`POINT_DE_VENTE_ID`, `MAGASIN_CODE`) pour l’impression de tickets et les exports.

---

## 4. Cohabitation avec périphériques et caisse

- Périphériques **par poste** : règles inchangées (`SPECS/PERIPHERIQUES.md`) : un PC caisse = une cible d’impression (env `PRINTER_*` sur ce nœud).
- En **multi-caisse** : chaque hôte a son `.env` local (ou sa config par terminal) — pas de partage d’IP imprimante entre conteneurs sans réseau LAN correct.

---

## 5. Tests (TDD) — orientation

- Tests unitaires d’isolation : un caissier / un magasin ne voit **pas** les entités d’un autre (quand le multi-tenant est en base).
- Tests des scripts / jobs de **backup** (mock stockage) : succès, échec, alerte, pas de fuite de secrets.
- e2e : scénario **2 sessions** (2 caissiers) sur le **même** magasin, ventes en parallèle, stock cohérent (sur une seule base de test).

---

## 6. Documents liés

- `SPECS/AUTH.md` — **deux niveaux** d’utilisateurs (groupe / point de vente), rôles, gouvernance de création de comptes.  
- `ARCHITECTURE_MVP.md` — modèle de données, diagrammes.  
- `SPECS/COMPTOIR.md` — sessions, caissiers, ventes.  
- `DOCKER.md` — stack locale par site.  
- `SPECS/ACTIVITY_LOG.md` — audit des accès distants / sauvegardes (actions à définir).  
- `ROADMAP.md` — jalons d’implémentation multi-boutiques et sauvegarde.

---

*AerisPay — Spec multi-organisation — Avril 2026*
