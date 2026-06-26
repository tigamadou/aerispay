# Architecture AerisPay

> **Version :** 2.1 — Architecture desktop 3 niveaux (document d'architecture unique)
> **Date :** Juin 2026
> **Modules couverts :** Stock · Comptoir (POS) · Caisse & sessions · Taxes/Paramètres · Périphériques · Journal d'activité · Dashboard
> **Stack nœud magasin :** Next.js 16 (App Router) · React 19 · TypeScript · Prisma · MySQL · Tailwind CSS · shadcn/ui
> **Client caisse :** Electron (présentation + pont périphériques, **sans base de données**)

> **Où trouver quoi.**
> - **Le QUOI fonctionnel** (comportements réels dérivés du code) : `docs/product/` (auth/rôles, stock, comptoir/ventes, caisse/sessions, impression/périphériques, dashboard, journal, taxes/paramètres, pages & API).
> - **Le COMMENT + décisions** (architecture desktop 3 niveaux) : **ce document** — topologie, ADR, client desktop, nœud magasin, enrôlement, synchronisation cloud, sécurité, déploiement.
> - **L'exploitation** (supervision, sauvegardes/restauration, incidents) : `RUNBOOK.md` (racine).

---

## 1. Vue d'ensemble — topologie desktop à trois niveaux

AerisPay est un système de caisse enregistreuse et de gestion commerciale. Ce n'est **plus** une « application web mono-base » mais un **système desktop à trois niveaux** : un client de caisse (Electron) parle à un **nœud magasin** (le backend Next + Prisma + MySQL, tournant **en local** dans le magasin et **source de vérité du magasin**), lequel se synchronise vers un **cloud organisation** (agrégation multi-magasins + référence descendante).

```
┌─────────────────────────────────────────────────────────────┐
│ Niveau 3 — CLOUD / ORGANISATION (entité parente)             │
│   Base cloud agrégée · référence descendante · audit groupe  │
│   Enrôlement magasins/postes · sauvegardes · accès distant   │
└───────────────▲─────────────────────────────────────────────┘
                │  sync magasin ↔ cloud (worker, eventual consistency)
                │  montant = append-only · descendant = référence LWW
┌───────────────┴─────────────────────────────────────────────┐
│ Niveau 2 — NŒUD MAGASIN (source de vérité du magasin)        │
│   Backend Next 16 + Prisma + MySQL ACTUEL, tournant en local │
│   API HTTPS LAN · logique métier · worker de sync · outbox   │
└───────────────▲─────────────────────────────────────────────┘
                │  HTTPS LAN (token magasin scopé par poste)
┌───────────────┴─────────────────────────────────────────────┐
│ Niveau 1 — CAISSE / POSTE (client Electron, SANS BD)         │
│   Renderer = UI servie par le nœud · main = périphériques    │
│   ESC/POS · tiroir · douchette · BLOQUE si nœud indisponible │
└─────────────────────────────────────────────────────────────┘
```

| Niveau | Rôle | Embarque | Autorité |
|---|---|---|---|
| **1 — Caisse / poste** | Terminal de présentation + pont périphériques (imprimante ESC/POS, tiroir, douchette). Identifié par un `caisseId` fixé à l'enrôlement. | **Aucune BD, aucun serveur applicatif.** UI servie par le nœud. | Hash d'intégrité chaîné **par caisse**. |
| **2 — Nœud magasin** | Serveur applicatif (Next + Prisma) + base MySQL du magasin + worker de sync. Toutes les caisses lisent/écrivent **ici** en LAN. | **Le backend applicatif.** | **Transactionnel** : stock, ventes, sessions, mouvements caisse, journal. |
| **3 — Cloud organisation** | Agrégation inter-magasins, reporting consolidé, données de référence, enrôlement, sauvegardes en ligne, accès distant. | Base cloud MySQL managé (ADR-002). | **Référence** : catalogue, prix, utilisateurs/rôles, taxes, paramètres, seuils. |

Principe directeur : **référence descendante** (le cloud fait foi, diffusion vers les magasins) et **transactionnel montant** (le magasin fait foi, agrégé append-only par le cloud). Le cloud **ne réécrit jamais** le transactionnel d'un magasin.

### 1.1 Pourquoi ce modèle (et pas du local-first par caisse)

- **Stock strictement cohérent** : toutes les caisses d'un magasin partagent **une seule base**. Le décrément conditionnel atomique (anti-survente) s'exécute contre cette base unique → **pas de survente entre caisses**. Le problème du stock distribué n'apparaît pas.
- **Ledger de caisse intègre** : sessions, mouvements et réconciliation appartiennent à une caisse et vivent dans la base magasin → pas de conflit multi-maître.
- **Le distribué est confiné** à la frontière magasin ↔ cloud, où les flux montants sont **append-only** donc faciles à fusionner.
- **Périphériques fiables** : Electron pilote l'imprimante ESC/POS et le tiroir-caisse hors de portée d'un navigateur.

### 1.2 Disponibilité assumée

- Si le **nœud magasin** est injoignable, la caisse **bloque** (pas de file locale, pas de mode dégradé). C'est la contrepartie de la source de vérité unique — voir §5.
- Si le **cloud** est coupé, le magasin continue de fonctionner et rattrape la synchronisation au retour du WAN — le cloud n'est **jamais** sur le chemin critique d'une vente.

---

## 2. Carte d'autorité — qui écrit quoi, où

| Donnée | Autorité | Propagation | Remarque |
|---|---|---|---|
| Produits, prix, catégories | **Cloud** | Cloud → magasin | Édition centrale, diffusion descendante (LWW), pas d'édition magasin (ADR-006) |
| Utilisateurs, rôles, mots de passe (hash) | **Cloud** | Cloud → magasin | Login servi par le magasin ; désactivation propagée |
| Paramètres, taxes, seuils | **Cloud** | Cloud → magasin | Référence descendante stricte (ADR-006) |
| **Stock** (`Produit.stockActuel`, `MouvementStock`) | **Magasin** | Magasin → cloud (agrégation) | Cohérent au sein du magasin (base unique) |
| **Ventes** (`Vente`, `LigneVente`, `Paiement`) | **Magasin** | Magasin → cloud (append-only) | Générées par les caisses, persistées au magasin |
| **Sessions & mouvements caisse** | **Magasin** | Magasin → cloud (append-only) | Ledger, partitionné par caisse |
| **Hash d'intégrité de session** | **Caisse** (au magasin) | Magasin → cloud | Chaîné **par caisse** (§2.1) |
| **Journal d'activité** | **Magasin** | Magasin → cloud | Audit |

### 2.1 Conséquences sur l'identité et l'intégrité

- **Identifiants** : le code utilise `cuid()` → génération sans collision, compatible avec une agrégation cloud multi-magasins.
- **Numérotation des ventes** : préfixée **par poste** (`VTE-<codePoste>-YYYY-NNNNN`) pour rester unique à l'échelle organisation lors de l'agrégation cloud.
- **Chaîne de hash d'intégrité** : chaînée **par caisse** (et non globalement) — chaque caisse conserve une chaîne ordonnée et vérifiable ; le cloud stocke les chaînes des différentes caisses sans avoir à les ordonner entre elles.

---

## 3. Décisions d'architecture (ADR)

> **Statut : ☑ Actées le 2026-06-26.** Les six décisions ci-dessous tranchent les points ouverts de la conception initiale ; l'ADR-001 est structurante (elle supprime le « mode autonome » initialement envisagé).

### ADR-001 — Pas de mode autonome : le client Electron est toujours un client du nœud magasin

**Décision.** Il n'y a **pas de mode autonome**. Le client Electron est **toujours** un client léger qui communique avec l'**API du nœud magasin** ; le nœud magasin communique avec l'**API de l'organisation parente**. Le client n'embarque **jamais** de base de données ni de serveur applicatif.

**Conséquences.**
- Le nœud magasin est **toujours** déployé comme un service serveur distinct (machine dédiée, ou **co-localisé en `localhost`** sur la même machine qu'un poste pour un commerce mono-caisse — mais jamais empaqueté *dans* le client Electron).
- **2 modes** d'installation au lieu de 3 : *nœud magasin* (serveur) et *client* (Electron).
- **Packaging Electron allégé** : pas de Prisma/MySQL à packager → le dérisquage se limite aux **modules natifs ESC/POS** (`node-thermal-printer`, `serialport`) via `electron-rebuild`.
- Déploiement du nœud magasin **inchangé** (Next + Prisma + MySQL, ex. via Docker).

### ADR-002 — Base cloud : MySQL managé

**Décision.** Le cloud utilise **MySQL managé** (même dialecte que le magasin).

**Conséquences.** Le schéma Prisma cloud **réutilise** largement le schéma magasin + clés d'agrégation `magasinId`/`organisationId` ; un seul provider Prisma à maintenir ; migrations homogènes magasin ↔ cloud. L'analytique avancée type PostgreSQL n'est pas retenue en V1 (reporting agrégé suffisant).

### ADR-003 — Sécurité de transport : « Simple V1 »

**Décision.**
- **Token magasin** (caisse ↔ nœud) : longue durée de vie, **révocable au nœud** à tout moment ; pas de rotation automatique en V1.
- **Device token cloud** (nœud ↔ cloud) : **rotation manuelle** au renouvellement.
- **mTLS** : **différé en V2**. En V1, **HTTPS + token** sur le LAN.

**Conséquences.** La révocation est le mécanisme de sécurité principal (perte/vol d'un poste → on révoque son token). Tokens stockés en **trousseau OS**. mTLS et rotation automatique = backlog V2.

### ADR-004 — Rétention de l'outbox `EventCaisse` : 30 jours puis purge

**Décision.** Après accusé de réception du cloud, un événement reste **30 jours** puis est purgé (job de purge planifié).

**Conséquences.** Filet de **rejeu** en cas d'incident cloud + auditabilité courte ; table bornée. L'outbox inclut un champ d'horodatage de consommation et le job de purge.

### ADR-005 — Haute disponibilité du nœud magasin : aucune en V1

**Décision.** **Pas de haute disponibilité** en V1. Le nœud magasin tourne sur une machine, avec **sauvegardes** (dump planifié + réplication cloud comme filet). Pas de réplication MySQL primaire/réplica, pas de bascule.

**Conséquences.** Le nœud magasin reste un **SPOF assumé** : s'il tombe, les caisses bloquent. Mitigations matérielles (machine dédiée, UPS, Ethernet câblé) **recommandées mais non requises**. HA (réplication/bascule) = backlog ultérieur si la criticité l'exige.

### ADR-006 — Données de référence : descendantes strictes depuis le cloud

**Décision.** Catalogue, prix, catégories, utilisateurs/rôles, paramètres, taxes, seuils sont **strictement descendants** depuis le cloud (autorité unique, last-writer-wins). **Aucune édition au niveau magasin.**

**Conséquences.** Aucun conflit bidirectionnel sur la référence ; sync de référence = pull simple avec curseur. L'administration de la référence se fait via l'**app web du cloud**. Si un besoin d'édition locale émerge, il fera l'objet d'un nouvel ADR.

---

## 4. Client desktop & périphériques

> Code : `desktop/` à la racine du dépôt (monorepo avec `web/`).

### 4.1 Nature du client

Le client caisse est une **application Electron** qui joue **deux rôles, et uniquement ceux-là** :

1. **Coquille de présentation (kiosque)** : une `BrowserWindow` qui affiche l'UI **servie par le nœud magasin** (URL en réseau local).
2. **Pont périphériques** : le **process principal** Electron (Node) pilote le matériel branché sur **cette** machine — imprimante ESC/POS, tiroir-caisse, douchette.

Le client **n'embarque pas de base de données** et ne contient **aucune logique métier de données** : pas de Prisma local, pas de cache transactionnel, pas de moteur de synchronisation. Toute la donnée vient de l'API du nœud magasin.

### 4.2 Périmètre & rôles (V1)

En V1, l'application desktop est **réservée aux CAISSIERS**. Administrateurs et gérants utilisent l'**application web dans le navigateur** (servie par le nœud en LAN, et/ou le cloud).

- **Surface fonctionnelle** : comptoir/POS, ouverture/clôture de **ses** sessions, encaissement multi-mode, impression ticket, ouverture tiroir. Pas de stock, pas d'administration, pas de paramètres.
- **Validation à l'aveugle** : réalisable par un manager **depuis le navigateur**, ou par un caissier entrant **depuis le desktop** — l'API de validation est commune.
- **Impression / tiroir** : disponibles **uniquement** via le desktop (pont périphériques). Le navigateur (manager) génère un **PDF** mais ne pilote pas l'ESC/POS local.

> Cette restriction est un choix V1, pas une limite technique ; le périmètre desktop pourra s'élargir.

### 4.3 Règle « pas de base magasin = blocage »

Le caissier ne peut pas travailler sans la base du magasin ; le client **assume le blocage** au lieu d'un mode dégradé :

- Au démarrage et en continu, le client **vérifie la disponibilité** du nœud (health-check `GET /api/health`).
- Si le nœud est injoignable : écran de **blocage** explicite, aucune vente possible, pas de file locale.
- Dès que le nœud répond, l'app redevient opérationnelle.

Cela **élimine** la portabilité de schéma SQLite, la synchronisation caisse ↔ magasin et la convergence de stock distribuée.

### 4.4 Architecture interne du client

```
┌──────────────────────── Electron (poste caisse) ────────────────────────┐
│  Renderer (BrowserWindow)            Main process (Node)                  │
│  ┌───────────────────────┐           ┌────────────────────────────────┐  │
│  │ UI servie par le      │  IPC      │ Pont périphériques :           │  │
│  │ NŒUD MAGASIN (URL LAN)│ ◄───────► │  - printTicket(lines)          │  │
│  │                       │  (preload │  - openDrawer()                 │  │
│  │ window.aerisDevices.* │   bridge) │  - printerStatus()              │  │
│  └───────────────────────┘           │ node-thermal-printer (ESC/POS) │  │
│            │ HTTPS LAN                └────────────────────────────────┘  │
└────────────┼─────────────────────────────────────────────────────────────┘
             ▼
   API du nœud magasin (Next) ──► base MySQL du magasin
```

- **Renderer** : charge l'application servie par le magasin ; **aucun** accès Node direct.
- **Preload bridge** : expose un objet restreint (liste blanche `window.aerisDevices.printTicket/openDrawer/printerStatus`) via `contextBridge` ; canaux IPC `aeris:print-ticket` / `aeris:open-drawer` / `aeris:printer-status`.
- **Main process** : reçoit les appels IPC et pilote `node-thermal-printer` sur le port USB/série/réseau local.

### 4.5 Flux d'impression (fin de vente)

1. La vente est validée **côté nœud magasin** (transaction Prisma sur la base magasin).
2. L'API renvoie les **données du ticket** ; le nœud (`web/app/src/lib/receipt/buildReceiptContent`) met en forme les **lignes** ESC/POS.
3. Le renderer appelle `window.aerisDevices.printTicket(lines)`.
4. Le **main Electron de la caisse** envoie la séquence à **son** imprimante locale, puis déclenche l'impulsion **tiroir** si demandé.

Les données restent **centralisées au magasin**, l'impression et le tiroir sont pilotés **sur la bonne machine**. La douchette (HID clavier) est captée directement par l'UI.

### 4.6 Durcissement (sécurité du renderer)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer limité à l'API du **preload** (liste blanche de fonctions périphériques) — aucun accès `fs`/`child_process`/réseau brut.
- **CSP** stricte, **navigation restreinte** à l'origine du nœud magasin ; liens externes ouverts dans le navigateur système.
- Appels à l'API magasin en **HTTPS** avec le **token de magasin** (§8).
- **Signature de code** du binaire (Windows/macOS), requise aussi pour l'auto-update.

### 4.7 Pourquoi Electron (et pas navigateur, Tauri ou PWA)

- Un **navigateur** ne pilote pas l'ESC/POS et le tiroir de façon fiable (WebUSB/WebSerial limités).
- **Tauri** (Rust) serait plus léger, mais la périphérie (`node-thermal-printer`) et l'écosystème serveur sont **Node** ; Electron garde Node dans le main sans réécriture.
- Une **PWA** ne couvre pas le mode kiosque + périphériques natifs.

Electron est retenu **précisément** comme couche kiosque + périphériques, pas comme couche données.

---

## 5. Nœud magasin & disponibilité

### 5.1 Rôle

Le **nœud magasin** est la machine dédiée qui constitue la **source de vérité du magasin**. Il héberge le **serveur applicatif** (Next + Prisma) exposant l'**API** consommée par les caisses, la **base MySQL** du magasin, et le **worker de synchronisation** magasin ↔ cloud. Toutes les caisses s'y connectent en LAN. C'est lui qui exécute les transactions critiques (vente + décrément stock, ouverture/clôture de session, réconciliation, hash d'intégrité).

### 5.2 Pourquoi MySQL reste au niveau magasin

Conserver MySQL ici permet de **réutiliser le schéma Prisma existant sans modification** et de garder le comportement transactionnel actuel : anti-survente (décrément conditionnel atomique), sessions liées à leur caisse, fond de caisse et hash par caisse s'appliquent **tels quels** sur cette base.

### 5.3 Point unique de défaillance (SPOF) & mitigations

La contrepartie de « pas de base = blocage » est que **le nœud magasin est le SPOF du magasin** : s'il tombe, toutes les caisses bloquent. Choix assumé (ADR-005), compensé par la fiabilité opérationnelle.

**Mitigations recommandées (niveau PME) :** machine dédiée toujours allumée (mini-PC type NUC), réseau **câblé** (Ethernet) pour les caisses, **onduleur (UPS)** sur le nœud et le réseau, **sauvegardes** locales planifiées + réplication cloud, **supervision** simple (health-check + alerte). Mitigations avancées optionnelles : réplication MySQL + bascule, nœud de secours.

### 5.4 API exposée aux caisses

Le nœud expose l'application Next (UI + endpoints) en **HTTPS** sur le LAN. Les caisses chargent l'**UI**, consomment les **endpoints** existants (`/api/ventes`, `/api/comptoir/...`, `/api/stock/...`) avec le **token de magasin**, et reçoivent les **charges utiles d'impression** à exécuter localement. Aucune caisse n'accède directement à MySQL.

### 5.5 Disponibilité vue de la caisse

Health-check périodique ; indisponible → écran de blocage ; rétabli → reprise immédiate. La disponibilité **magasin ↔ cloud** n'impacte **pas** les caisses (si le WAN tombe, le magasin continue et rattrape le cloud ensuite).

---

## 6. Enrôlement & identité

### 6.1 Principe

À l'installation, le client est **enrôlé** : on lui fournit sa cible de données (nœud magasin) et son identité (poste). L'enrôlement produit des **secrets stockés dans le trousseau de l'OS**, jamais en clair dans le bundle.

### 6.2 Entrées requises

| Entrée | Rôle |
|---|---|
| **Endpoint + token du nœud magasin** | Indiquer à quel magasin (API LAN) se connecter et s'authentifier |
| **Identité du poste** (`caisseId` / code caisse) | Identifier la caisse pour le ledger et la numérotation |

> Recommandation forte : fournir un **endpoint + token de magasin**, **pas** les identifiants bruts de la base MySQL. Un poste est physiquement accessible ; il ne doit jamais détenir la chaîne de connexion DB. Le client parle à l'**API** du nœud (§8).

### 6.3 Chaîne de confiance

```
Organisation (cloud)
   │  enrôle
   ▼
Nœud magasin  ──(émet token de magasin scopé par poste)──►  Caisse (client Electron)
```

1. Le **nœud magasin** est enrôlé une fois auprès de l'organisation (détient le device token cloud).
2. Chaque **caisse** s'enrôle auprès du **nœud magasin**, qui délivre un **token de magasin** scopé à ce poste.
3. La caisse ne détient qu'un secret **local au magasin** ; la révocation se fait au niveau magasin (le magasin lui-même est révocable au niveau cloud).

### 6.4 Modes au premier lancement (2 modes — ADR-001)

Conformément à l'ADR-001, **deux** modes (pas de mode autonome embarqué) :

- **Nœud magasin** — installe et héberge la base + l'API pour le magasin (machine dédiée, ou co-localisée en `localhost` pour un mono-caisse). Déploiement Next + Prisma + MySQL.
- **Client de magasin** — caisse Electron **sans base**, qui se connecte à un nœud magasin existant.

### 6.5 Flux d'enrôlement (client de magasin)

1. Installation de l'application Electron sur le poste.
2. Écran d'enrôlement : saisie de l'**endpoint du nœud magasin** + **token de magasin** (pré-émis par un ADMIN via `POST /api/enrollment` côté nœud), et identité de poste.
3. Le client **vérifie** l'endpoint et le token auprès du nœud, **stocke le token dans le trousseau OS**, mémorise l'endpoint et le `caisseId`.
4. Health-check du nœud → l'application est prête (ou affiche le blocage si indisponible).

### 6.6 Ré-enrôlement & révocation

- **Changement de poste / réinstallation** : ré-enrôlement avec nouveau token ; l'ancien token est révocable au niveau magasin.
- **Perte / vol d'un poste** : révocation du token de magasin (le poste ne peut plus joindre l'API). Aucune donnée métier ne réside sur le poste.
- **Désactivation d'un magasin** : révocation au niveau cloud (le nœud ne synchronise plus).

---

## 7. Synchronisation magasin ↔ cloud

### 7.1 Une seule frontière distribuée

Le seul échange distribué est **magasin ↔ cloud** (jamais caisse ↔ cloud). Il est porté par le **worker de synchronisation du nœud magasin**. Un canal par magasin, tolérant aux coupures WAN.

```
Nœud magasin  ──(transactionnel ↑ : ventes, sessions, mouvements, logs)──►  Cloud
Nœud magasin  ◄──(référence ↓ : produits, prix, users, params, taxes, seuils)──  Cloud
```

### 7.2 Deux sens, deux politiques

- **Référence (cloud → magasin)** : catalogue, prix, utilisateurs/rôles (+ hash mot de passe), paramètres, taxes, seuils. Autorité **cloud**, **last-writer-wins**, **pas de surcharge magasin** (ADR-006).
- **Transactionnel (magasin → cloud)** : ventes, lignes, paiements, sessions, mouvements caisse, mouvements stock, journal, hash d'intégrité. **Append-only** : le cloud **ingère**, ne modifie jamais. Convergence triviale (insertion d'enregistrements idempotents).

### 7.3 Outbox + idempotence

- **Table `EventCaisse`** (`consumed` / `createdAt`) → **pattern outbox** : chaque écriture métier émet un événement ; le worker consomme les non-consommés et les pousse au cloud.
- **File offline idempotente** (`comptoir/sync`) avec clé d'opération → modèle d'idempotence éprouvé, généralisé au canal magasin ↔ cloud.
- **Identifiants `cuid()`** → insertion sans collision côté cloud, multi-magasins.

### 7.4 Boucle de synchronisation

1. **Push transactionnel** : lire les `EventCaisse` non consommés (ordre `createdAt`), les transmettre par lots, marquer `consumed` après accusé. Idempotence par identifiant → un rejeu ne duplique rien.
2. **Pull référence** : demander les mises à jour de référence depuis un curseur (timestamp/version), les appliquer en base magasin.
3. **Reprise après coupure WAN** : curseur + `EventCaisse` non consommés garantissent qu'aucune donnée n'est perdue ; la sync rattrape au retour du réseau.
4. **Fréquence** : périodique et/ou déclenchée par événement, configurable.

### 7.5 Garanties & cohérence

- **Au sein du magasin** : cohérence forte (base unique, transactions Prisma).
- **Vers le cloud** : cohérence **à terme** (eventual consistency), acceptable car le transactionnel est append-only.
- **Intégrité** : le hash chaîné **par caisse** est calculé au magasin et répliqué ; le cloud peut **revérifier** les chaînes sans les réordonner entre caisses.
- **Numérotation** : préfixe **par poste** → unicité garantie à l'échelle organisation.
- **Rétention `EventCaisse`** : 30 jours après accusé cloud puis purge (ADR-004).

---

## 8. Sécurité

### 8.1 Modèle de confiance

```
Organisation (cloud)
   │  device token cloud (détenu par le nœud magasin uniquement)
   ▼
Nœud magasin  ──► token de magasin (scopé par poste)  ──►  Caisse (Electron)
```

Le **nœud magasin** détient le secret cloud et est le seul à parler au cloud. Chaque **caisse** ne détient qu'un **token de magasin** local, scopé à son poste. Aucune caisse ne détient les identifiants MySQL ni les secrets cloud.

### 8.2 Secrets & stockage

- **Tokens** (magasin, cloud) stockés dans le **trousseau de l'OS** (Keychain macOS / Credential Manager Windows / libsecret Linux), jamais en clair dans le bundle ni un `.env` embarqué.
- **`NEXTAUTH_SECRET` / clés serveur** : uniquement sur le **nœud magasin**, pas sur les caisses.
- **Rotation** : révocation + ré-émission au niveau magasin/cloud (ADR-003).

### 8.3 Transport & accès base

- **HTTPS** obligatoire sur le LAN entre caisse et nœud (mTLS possible, différé V2).
- **TLS** entre nœud et cloud.
- **Jamais** d'accès direct des caisses à MySQL ; elles passent par l'**API**. Le compte MySQL applicatif est scopé (droits minimaux) ; la base n'est pas exposée hors du nœud.

### 8.4 Révocation & réponse aux incidents

- **Perte/vol d'un poste** : révoquer le **token de magasin** → le poste ne joint plus l'API. Exposition minimale (aucune donnée ni secret sur le poste).
- **Compromission d'un magasin** : révoquer le **device token cloud** → arrêt de la sync ; investigation via le journal d'activité et les hash d'intégrité.
- **Désactivation utilisateur** : propagée du cloud vers le magasin (référence descendante), prise en compte au login servi par le nœud.

### 8.5 Intégrité & audit

- **Chaîne de hash par caisse** (§2.1) : toute altération d'une session validée est détectable ; le cloud peut revérifier.
- **Journal d'activité** répliqué au cloud pour audit centralisé.
- Ne **jamais** journaliser de secrets (tokens, mots de passe).

---

## 9. Stack technique

### 9.1 Nœud magasin (backend + UI servie)
| Domaine | Technologie | Rôle |
|---|---|---|
| Framework | **Next.js 16** (App Router) · React 19 | SSR, routing, API Routes intégrées |
| Langage | **TypeScript** (strict) | Typage statique |
| ORM / BD | **Prisma** · **MySQL 8** | Accès type-safe, migrations, source de vérité magasin |
| Auth | **NextAuth.js v5** (credentials) | Sessions, login servi par le nœud |
| UI | **Tailwind CSS** · **shadcn/ui** | Styles, composants accessibles |
| Formulaires | **React Hook Form + Zod** | Validation client/serveur |
| État | **Zustand** (panier POS) · **TanStack Query** (data async) | UI locale persistante · cache/refetch |
| Impression | **@react-pdf/renderer** · **node-thermal-printer** · **qrcode** | Ticket PDF · ESC/POS 58/80 mm · QR vérification |
| Sync | Worker magasin ↔ cloud + outbox **`EventCaisse`** | Réplication transactionnelle + pull référence |
| Tests | **Vitest** · **React Testing Library** · **Cypress/Playwright** | Unitaires · composants · e2e |

> ⚠️ **Next.js 16 introduit des breaking changes.** Avant d'écrire du code Next, consulter les guides versionnés dans `web/app/node_modules/next/dist/docs/` (cf. `web/app/AGENTS.md`).

### 9.2 Client caisse (Electron)
| Domaine | Technologie | Rôle |
|---|---|---|
| Coquille | **Electron** | Fenêtre, `contextIsolation`, `sandbox`, CSP, navigation restreinte |
| Renderer | UI **servie par le nœud magasin** | Aucune logique métier embarquée |
| Main process | **node-thermal-printer** · **serialport** | Pont périphériques ESC/POS / tiroir / douchette via IPC `window.aerisDevices.*` |
| Recompilation native | **electron-rebuild** + CI multi-OS | Modules natifs sur Windows/macOS/Linux |
| Distribution | **electron-builder** · **electron-updater** + S3 | Installeurs signés, auto-update |

### 9.3 Périphériques de caisse
| Périphérique | Mode | Notes |
|---|---|---|
| **Imprimante ticket** | ESC/POS USB, série ou réseau | Pilotée par le **main Electron** ; le nœud fournit le contenu du reçu |
| **Douchette code-barres** | USB/HID mode clavier | Sans driver ; scan capturé dans le champ recherche POS |
| **Tiroir-caisse** | Impulsion ESC/POS via imprimante, ou interface directe | Ouverture après paiement espèces validé |

> Une **panne périphérique APRÈS qu'une vente est validée ne doit jamais annuler la vente** (la vente est persistée au nœud ; l'impression/tiroir sont best-effort). Cf. `docs/product/05-impression-peripheriques.md`.

---

## 10. Méthodologie TDD

Développement en **Test-Driven Development** (obligatoire, cf. `web/app/AGENTS.md`) :

1. Écrire d'abord les tests décrivant le comportement attendu.
2. Vérifier l'échec attendu si le contexte le permet.
3. Implémenter le code minimal pour les faire passer.
4. Refactorer sans affaiblir la couverture.

API Routes et transactions Prisma → **Vitest** ; composants/formulaires critiques → **RTL** ; parcours de bout en bout → **Cypress/Playwright**. Baseline de référence : suite verte (≈ 899 tests nœud sur `feat/audit_refacto`, 7 tests desktop).

---

## 11. Structure du projet

> **Règle :** le code applicatif du nœud vit sous **`web/app/src/`** (App Router, composants, `lib`, tests dans `web/app/src/__tests__/`). Prisma sous `web/app/prisma/`. Docker Compose et docs à la **racine**. Commandes `npm`/`npx`/`prisma` depuis `web/app/`.

```
aerispay/                              # Racine du dépôt
├── docker-compose.yml                 # Dev : MySQL + phpMyAdmin + app
├── docker-compose.prod.yml            # Prod : image buildée + MySQL
├── DOCKER.md · ARCHITECTURE_MVP.md · RUNBOOK.md
├── CLAUDE.md · CONVENTIONS.md · README.md
├── docs/
│   └── product/                       # Le QUOI fonctionnel (dérivé du code)
├── desktop/                           # Client Electron (niveau 1) : main périphériques + renderer kiosque
├── cloud/                             # Schéma cloud (niveau 3) : prisma/schema.prisma (agrégation)
└── web/
    ├── Dockerfile · development.env.example · production.env.example
    └── app/                           # Application Next.js (nœud magasin)
        ├── src/
        │   ├── app/                   # App Router : (auth)/, (dashboard)/, api/
        │   ├── components/            # ui/ (shadcn — ne pas modifier), stock/, comptoir/, …
        │   ├── hooks/                 # TanStack Query
        │   ├── store/                 # Zustand (panier POS)
        │   ├── lib/                   # db, auth, permissions, activity-log, services/, validations/, receipt/
        │   └── __tests__/             # Vitest + RTL
        ├── prisma/                    # schema.prisma (§12), migrations/, seed.ts
        └── types/
```

---

## 12. Modèle de données (nœud magasin)

> **Source de vérité du schéma : `web/app/prisma/schema.prisma`.** Le tableau reflète le schéma **réel** (branche `feat/audit_refacto`). **Au niveau magasin, le schéma reste celui-ci** ; les clés d'agrégation (`magasinId`/`organisationId`) et les tables d'enrôlement vivent **au niveau cloud** (ADR-002, schéma `cloud/prisma/`).

### 12.1 Inventaire des modèles

| Modèle | Rôle | Notes saillantes |
|---|---|---|
| `User` + enum `Role` | Comptes & rôles (`ADMIN`, `MANAGER`, `CAISSIER`) | Mot de passe haché ; relations sessions/ventes/mouvements/logs |
| `Categorie` | Catégories produits | Couleur UI |
| `Produit` | Catalogue | `Produit.tva` = attribut **catalogue informatif**, **non** utilisé pour le calcul de taxe (modèle de **taxe globale**, voir `Taxe`) |
| `MouvementStock` + enum `TypeMouvement` | Mouvements de stock | `ENTREE/SORTIE/AJUSTEMENT/RETOUR/PERTE` ; lien optionnel `vente` |
| **`Caisse`** | Poste de caisse physique | `active` ; relation `mouvements` ; `code` = code poste (numérotation) |
| `ComptoirSession` + enum `StatutSession` | Sessions de caisse | `caisseId` (Lot C) ; workflow clôture/validation à l'aveugle, écarts par mode, **hash d'intégrité** (`hashIntegrite`/`hashSessionPrecedente`), session corrective, fond d'ouverture (Lot G). Statuts : `OUVERTE`, `EN_ATTENTE_CLOTURE`, `EN_ATTENTE_VALIDATION`, `VALIDEE`, `CONTESTEE`, `FORCEE`, `CORRIGEE`, `FERMEE` |
| `MouvementCaisse` + enum `TypeMouvementCaisse` | Ledger de caisse | `FOND_INITIAL`, `FOND_OUVERTURE`, `LEVEE`, `VENTE`, `REMBOURSEMENT`, `APPORT`, `RETRAIT`, `DEPENSE`, `CORRECTION` ; rattaché à `caisseId`/`sessionId`/`auteurId` |
| `SeuilCaisse` | Seuils paramétrables | Seuils centralisés (Lot D) |
| **`EventCaisse`** | **Outbox** d'événements métier | `type`, `payload`, `consumed`, index `(consumed, createdAt)` → base du worker de sync (ADR-004 : purge à 30 j) |
| `Vente` + enum `StatutVente` | Ventes | `tva` + `taxesDetail` (taxe **globale**, M2) ; numéro `VTE-<codePoste>-YYYY-NNNNN` ; `VALIDEE/ANNULEE/REMBOURSEE` |
| `LigneVente` | Lignes de vente | Pas de taxation par-ligne (`tva` reste 0) |
| `Sequence` | Compteur transactionnel | Numérotation atomique **par poste/année** (clé `VTE-<codePoste>-<annee>`) |
| `Paiement` | Paiements | `mode` = code (cf. `ModePaiementConfig`) |
| `Parametres` | Identité commerce | RCCM, NIF, logo ; relations `taxes`, `modesPaiement` |
| `ModePaiementConfig` | Modes de paiement configurables | `code` unique, `active`, `ordre` |
| `Taxe` | Taxes configurables | Modèle de **taxe globale** (taux appliqué à la base, M2) |
| `ActivityLog` | Journal d'audit | Append-only ; index sur action/acteur/entité/date |
| `StoreToken` | Tokens de magasin (enrôlement poste) | Scopé `caisseId` ; `revoked` ; vérifié par `verifyStoreToken` |

### 12.2 Évolutions de schéma (migration desktop — livrées)

| Évolution | Niveau | Statut |
|---|---|---|
| `caisseId` sur `ComptoirSession` (multi-caisse, Lot C) ; unicité d'ouverture par caisse + caissier | Magasin | ☑ Livré |
| Numérotation **par poste** `VTE-<codePoste>-YYYY-NNNNN` (`api/ventes/route.ts`) | Magasin | ☑ Livré |
| Hash d'intégrité **chaîné par caisse** (`lib/services/integrity.ts`) | Magasin | ☑ Livré |
| Outbox `EventCaisse` : horodatage de consommation + purge 30 j (ADR-004) | Magasin | ☑ Livré |
| Clés `magasinId` / `organisationId` + tables d'enrôlement, tokens, curseurs de sync | **Cloud** | ☑ Livré (`cloud/prisma/`) |

---

## 13. Architecture des modules (fonctionnel)

Les comportements réels (règles métier, écrans, validations, rôles) sont documentés **module par module** dans `docs/product/`. Synthèse des renvois :

| Module | Doc produit | Points clés |
|---|---|---|
| Authentification & rôles | `docs/product/01-auth-roles.md` | NextAuth v5 ; matrice de permissions `lib/permissions.ts` ; pas d'inscription publique |
| Stock | `docs/product/02-stock.md` | Produits, catégories, mouvements, alertes de rupture, transactions Prisma |
| Comptoir & ventes | `docs/product/03-comptoir-ventes.md` | POS, panier (Zustand), paiement multi-modes, **anti-survente atomique** (Lot B), numérotation par poste, annulation |
| Caisse & sessions | `docs/product/04-caisse-sessions.md` | Multi-caisse (`caisseId`), ouverture/clôture/validation à l'aveugle, écarts, fond & levée (Lot G), hash par caisse, session corrective |
| Impression & périphériques | `docs/product/05-impression-peripheriques.md` | Ticket PDF + ESC/POS réel, tiroir, douchette ; pont Electron |
| Dashboard & reporting | `docs/product/06-dashboard-reporting.md` | KPI, périmètre par rôle |
| Journal d'activité | `docs/product/07-journal-activite.md` | `logActivity()`, consultation filtrée |
| Taxes & paramètres | `docs/product/08-taxes-parametres.md` | Taxe globale (M2), modes de paiement, identité commerce |

**Flux de vente (résumé)** : Caisse (Electron) → UI POS servie par le nœud → `POST /api/ventes` au **nœud magasin** → transaction Prisma (création `Vente` + `LigneVente` + `Paiement`, décrément stock conditionnel atomique, `MouvementStock` SORTIE, `MouvementCaisse` VENTE, écriture `EventCaisse`, numéro par poste) → réponse → impression locale (main Electron) + ouverture tiroir si espèces. La vente persiste **au magasin** ; l'impression/tiroir sont best-effort et ne rollback jamais la vente.

---

## 14. API Routes — endpoints

> **Référence exhaustive (dérivée du code), avec rôles et payloads : `docs/product/09-pages-api.md`.** Les routes sont servies par le **nœud magasin** et consommées par les caisses en LAN. Synthèse des familles :

| Famille | Base | Exemples |
|---|---|---|
| Auth | `/api/auth/[...nextauth]` | login NextAuth v5 |
| Santé | `/api/health` | health-check public (client Electron) |
| Enrôlement | `/api/enrollment` | émission de token de magasin scopé poste (ADMIN) |
| Utilisateurs (ADMIN) | `/api/users` | liste, création, détail, mise à jour, désactivation |
| Stock | `/api/produits`, `/api/categories`, `/api/stock/mouvements`, `/api/stock/alertes` | CRUD produits/catégories, mouvements, seuils |
| Comptoir | `/api/comptoir/sessions`, `/.../closure`, `/.../validate` | ouverture, clôture, validation à l'aveugle |
| Caisse | `/api/caisse`, mouvements caisse | CRUD caisses, fond/levée, apport/retrait/dépense |
| Ventes | `/api/ventes`, `/api/ventes/[id]`, `/api/ventes/[id]/annuler` | création, détail, annulation |
| Tickets | `/api/tickets/[id]/pdf`, `/api/tickets/[id]/print` | PDF, impression thermique |
| Tiroir | `/api/cash-drawer/open` | impulsion ESC/POS |
| Taxes & paramètres | `/api/taxes`, `/api/parametres` | taxe globale, modes de paiement, identité |
| Journal (ADMIN/MANAGER) | `/api/activity-logs` | liste paginée + filtres |
| Dashboard (ADMIN/MANAGER) | `/api/dashboard/kpis` | CA, ventes, panier moyen, alertes stock, séries |

**Conventions API** (cf. `CLAUDE.md` §5.3) : validation **Zod** avant Prisma, `try/catch`, erreurs `{ error, code? }`, succès `{ data, message? }`, transactions via `prisma.$transaction()`, vérification d'auth/rôle via `auth()` + `requireAuth`/`requireRole`/`hasPermission`.

---

## 15. Rôles & permissions

### 15.1 Matrice de permissions (réelle — `web/app/src/lib/permissions.ts`)

L'autorisation repose sur `requireAuth()` (session valide), `requireRole(...)` et `hasPermission(role, permission)` sur la matrice `ROLE_PERMISSIONS`.

| Permission | ADMIN | MANAGER | CAISSIER |
|---|:--:|:--:|:--:|
| `users:manage` | ✅ | — | — |
| `stock:manage` | ✅ | ✅ | — |
| `comptoir:vendre` | ✅ | ✅ | ✅ |
| `comptoir:gerer_session_autre` | ✅ | ✅ | — |
| `comptoir:valider_session` | ✅ | ✅ | — |
| `comptoir:force_close` | ✅ | — | — |
| `comptoir:session_corrective` | ✅ | — | — |
| `comptoir:verifier_integrite` | ✅ | ✅ | — |
| `comptoir:mouvement_manuel` | ✅ | ✅ | ✅ |
| `comptoir:retrait_caisse` | ✅ | ✅ | — |
| `comptoir:depense` | ✅ | ✅ | — |
| `ventes:annuler` | ✅ | ✅ | — |
| `activity_logs:consulter` | ✅ | ✅ | — |
| `rapports:consulter` | ✅ | ✅ | — |
| `parametres:manage` | ✅ | — | — |

Détail (mécanismes, pages, niveau groupe vs PDV) : `docs/product/01-auth-roles.md`.

### 15.2 Niveau groupe vs niveau point de vente

Les rôles `ADMIN`/`MANAGER`/`CAISSIER` sont des comptes **niveau point de vente**. En V1 desktop, le **client Electron est réservé aux caissiers** (POS + périphériques) ; **admins et gérants utilisent l'application web** (stock, validation, écarts, ventes, utilisateurs, taxes, paramètres, journal, dashboards), servie par le nœud en LAN et/ou par le cloud. Les rôles **niveau groupe** (lecture consolidée multi-magasins) relèvent du cloud — voir §1 et `docs/product/01-auth-roles.md`.

---

## 16. Déploiement & packaging

### 16.1 Conteneurisation du nœud magasin

Deux stacks Compose à la racine :

- **Développement** (`docker-compose.yml`) : services `db` (MySQL) + `phpmyadmin`. L'app Next est lancée en local (`npm run dev`) avec `DATABASE_URL` → conteneur MySQL.
- **Production** (`docker-compose.prod.yml`) : services `db` + `app` (image `Dockerfile`, sortie Next **standalone**) — le nœud magasin déployé localement.

Commandes, variables, réseau `db`, reverse proxy, migrations : `DOCKER.md`. Pas de HA en V1 (ADR-005) : sauvegardes (dump planifié + réplication cloud comme filet — voir `RUNBOOK.md`). Le client Electron (niveau 1) et le cloud (niveau 3) **ne sont pas** dans ces stacks (ADR-001).

### 16.2 Packaging du client Electron

- **Electron + electron-builder** : installeurs Windows (`.exe`/MSI), macOS (`.dmg`), Linux (`AppImage`/`.deb`). Le client embarque la **coquille** + le **pont périphériques** (pas de serveur, ADR-001).
- **Modules natifs** : `node-thermal-printer` (ESC/POS) et `serialport` éventuel → recompilés par OS/arch (`electron-rebuild`), CI sur les 3 plateformes.
- **Auto-update** : `electron-updater`, flux hébergé sur **S3**. **Signature de code** (Windows/macOS) obligatoire. Mises à jour planifiées hors heures d'ouverture.

### 16.3 Topologies de déploiement

| Topologie | Nœud magasin | Caisses | Usage |
|---|---|---|---|
| **Mono-caisse** | service co-localisé en `localhost` sur la machine du poste (service distinct, ADR-001) | 1 | Petit commerce |
| **Magasin** | mini-PC dédié | N clients Electron | Multi-caisse |
| **Multi-magasin** | 1 nœud par magasin | N par magasin | Groupe (sync cloud par magasin) |

### 16.4 Pré-requis matériels (recommandés)

- **Nœud magasin** : mini-PC dédié toujours allumé, **onduleur (UPS)**, **Ethernet** vers les caisses.
- **Caisses** : poste Windows/Linux, imprimante ESC/POS (USB/série/réseau), tiroir piloté par l'imprimante, douchette HID.

---

## 17. Migration desktop — livrée (2026-06-26)

La migration de l'application web mono-base vers le système desktop à 3 niveaux est **livrée**. Synthèse des vagues :

```
V0 — Décisions & dérisquage   : ADR actés (§3) · PoC packaging Electron
V1 — Fondation métier magasin : caisseId/multi-caisse (Lot C) · numéro par poste · hash par caisse · outbox EventCaisse
V2 — Client Electron          : pont périphériques · coquille durcie · health-check + blocage
V3 — Enrôlement & identité    : 2 modes (nœud/client) · tokens trousseau OS · installation
V4 — Synchronisation cloud    : schéma cloud (cloud/prisma/) · worker push transactionnel · pull référence · résilience WAN
V5 — Packaging & exploitation : electron-builder 3 OS · auto-update · runbook sauvegardes (pas de HA)
```

Code : nœud magasin sous `web/app/`, client Electron sous `desktop/`, schéma cloud sous `cloud/prisma/`. Exploitation : `RUNBOOK.md`. Le backlog fonctionnel résiduel (hors desktop) est suivi dans `docs/product/README.md`.

---

## 18. Glossaire & FAQ

### 18.1 Glossaire

- **Organisation / groupe** : entité de plus haut niveau (cloud), regroupe plusieurs magasins.
- **Nœud magasin** : machine hébergeant le serveur applicatif + la base du magasin ; source de vérité du magasin.
- **Caisse / poste** : terminal Electron sans base, identifié par `caisseId`.
- **Token de magasin** : secret scopé délivré à une caisse pour appeler l'API du nœud.
- **Device token cloud** : secret détenu par le nœud magasin pour parler au cloud.
- **Référence (descendante)** : données dont le cloud fait autorité (catalogue, users, paramètres…).
- **Transactionnel (montant)** : données append-only dont le magasin fait autorité (ventes, sessions, mouvements…).
- **Outbox** : pattern d'émission fiable d'événements pour la synchronisation (basé sur `EventCaisse`).
- **SPOF** : point unique de défaillance.

### 18.2 FAQ

**Une caisse peut-elle vendre si le nœud magasin est coupé ?** Non. Règle assumée : pas de base magasin = **blocage**. Aucune file locale, pas de mode dégradé caisse.

**Une caisse peut-elle vendre si le cloud est coupé ?** Oui. Le cloud n'est pas sur le chemin critique ; le magasin fonctionne et rattrape la synchronisation au retour du WAN.

**Le schéma de base change-t-il ?** Pas au niveau magasin (MySQL conservé). Des ajouts ont lieu au niveau cloud (clés d'agrégation, enrôlement) et pour la numérotation par poste.

**Pourquoi pas du local-first par caisse ?** Cela casserait la source de vérité unique (stock, hash chaîné, numérotation) et imposerait un moteur de réplication multi-maître complexe. Le nœud magasin confine le distribué à la frontière magasin ↔ cloud.

**Pourquoi Electron et pas un navigateur ?** Pour piloter de façon fiable l'imprimante ESC/POS et le tiroir-caisse, hors de portée d'un navigateur.

**Qui utilise le desktop, qui utilise le navigateur ?** En V1, le **desktop est réservé aux caissiers** (POS + périphériques). Les **admins et gérants utilisent l'application web** dans le navigateur, servie par le nœud en LAN et/ou le cloud.

**Un manager peut-il valider une session sans desktop ?** Oui. La validation à l'aveugle se fait via le navigateur (manager) ou via le desktop (caissier entrant) — même API. Seules l'impression et l'ouverture du tiroir nécessitent le desktop.

---

## 19. Exploitation

La supervision, les sauvegardes/restauration (testée) et les procédures d'incident du nœud magasin sont décrites dans **`RUNBOOK.md`** (racine).

---

*Architecture AerisPay v2.1 — modèle desktop 3 niveaux. Le QUOI : `docs/product/` · le COMMENT + ADR : ce document · l'exploitation : `RUNBOOK.md`.*
