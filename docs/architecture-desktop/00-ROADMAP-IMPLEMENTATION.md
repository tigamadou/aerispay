# Roadmap d'implémentation — Migration desktop AerisPay

> **STATUT GLOBAL : 🟡 Vague 0 en cours — D0.1 ☑ actée, D0.2 + F1.1 à démarrer (2026-06-26)**
> **Document de pilotage + handoff inter-session.** Conçu pour qu'une session ultérieure
> reprenne sans contexte préalable. Voir [§9 Reprise de session](#9--reprise-de-session)
> et [§10 Journal d'avancement](#10--journal-davancement).

| | |
|---|---|
| **Créé le** | 26 juin 2026 |
| **Branche** | `feat/audit_refacto` |
| **Périmètre** | Transformer AerisPay (app web mono-base) en système 3 niveaux desktop |
| **Sources** | `docs/architecture-desktop/01..08`, `docs/product/` |

---

## 1. Cible

```
┌─────────────────────────────────────────────────────────────┐
│ Niveau 3 — CLOUD / ORGANISATION (entité parente)             │
│   Base cloud agrégée · référence descendante · audit groupe  │
└───────────────▲─────────────────────────────────────────────┘
                │  sync magasin↔cloud (worker, eventual consistency)
┌───────────────┴─────────────────────────────────────────────┐
│ Niveau 2 — NŒUD MAGASIN (source de vérité du magasin)        │
│   Backend Next+Prisma+MySQL ACTUEL, tournant en local        │
│   API HTTPS LAN · worker de sync · outbox EventCaisse         │
└───────────────▲─────────────────────────────────────────────┘
                │  HTTPS LAN (token magasin scopé par poste)
┌───────────────┴─────────────────────────────────────────────┐
│ Niveau 1 — CAISSE / POSTE (client Electron, SANS BD)         │
│   Renderer = UI servie par le nœud · main = périphériques    │
│   Bloque si nœud indisponible (pas de mode dégradé)          │
└─────────────────────────────────────────────────────────────┘
```

Principe clé (doc 08) : **le schéma Prisma du niveau magasin reste inchangé** ; les clés
d'agrégation `magasinId`/`organisationId` et les tables d'enrôlement vivent **au niveau cloud**.

---

## 2. État vérifié du code (snapshot 2026-06-26)

**Déjà livré (corrections d'audit, 839 tests verts) :**
- Lot A (solde théorique unifié `computeSoldeSession`), Lot B (anti-survente atomique),
  Lot D (seuils centralisés), Lot E (TVA globale + séquence numérotation), Lot F (Decimal),
  Lot G (fond de caisse Modèle 2 + levée). Détail fonctionnel : `docs/product/04-caisse-sessions.md`.

**Reste à faire, pertinent pour le desktop :**
- **Lot C — multi-caisse** : `ComptoirSession` **n'a PAS** de `caisseId` (vérifié sur schéma réel) ;
  caisse résolue par `findFirst({active:true})` dans **8 endpoints**. → Vague 1, tâche F1.1.
- **Numérotation** : séquence globale `VTE-YYYY-NNNNN`, **sans préfixe poste**. → F1.2.
- **Hash d'intégrité** : chaîné globalement, **pas par caisse**. → F1.3.
- **Outbox** : présence d'une table `EventCaisse` **à vérifier** (`prisma/schema.prisma`). → F1.4.
- **RULE-FOND-005** (caissier solo) : non implémenté. → F1.5.
- **`printReceipt`** (`lib/receipt/thermal-printer.ts`) : **STUB** (`TODO` ligne ~69). → C2.1.

> **Portée :** ce document couvre **uniquement la migration desktop**. Le backlog fonctionnel MVP
> restant (hors desktop) et la qualité sont suivis dans `docs/product/README.md` (backlog résiduel).

---

## 3. Décisions actées

**Lot C (F1.1) — actées en brainstorming 2026-06-26 :**
- Rattachement caisse : **sélecteur UI + fallback** côté web *(transitoire)* ; en cible desktop,
  `caisseId` = **identité de poste fixée à l'enrôlement** (le sélecteur web reste pour l'admin/mode web).
- Unicité : **1 session `OUVERTE` par caisse ET 1 par caissier**.
- Périmètre caisses : **seed 2 caisses + CRUD admin caisses** (`/api/caisse` + page `/caisses`, ADMIN).
- Stratégie de test : **(A)** seed dev/prod = 2 caisses ; les tests existants gardent 1 caisse active
  (fallback → restent verts) ; seul `multi-caissier.test.ts` seede 2 caisses.
- Spec détaillée existante : `docs/superpowers/specs/2026-06-26-lot-c-multi-caisse-design.md`
  *(à ajuster : `caisseId` = identité poste ; ne pas sur-investir le sélecteur/CRUD **web**)*.

**Architecture desktop — déjà tranché par la doc `01..08`** (ne pas re-débattre) :
client = Electron ; nœud magasin = backend actuel en local ; sync = magasin↔cloud uniquement
(outbox + référence LWW) ; tokens hiérarchiques en trousseau OS ; SPOF nœud assumé.

**🔒 6 décisions ouvertes — ACTÉES le 2026-06-26** → voir `09-adr.md`. Résumé :
- **ADR-001 (structurante)** : **pas de mode autonome** — le client Electron est toujours un client
  du nœud magasin ; le nœud n'est jamais embarqué dans le client. → 2 modes d'enrôlement, D0.2 allégé,
  P5.3 supprimé.
- **ADR-002** : base cloud = **MySQL managé**.
- **ADR-003** : tokens = **Simple V1** (longue durée + révocation ; mTLS/rotation auto → V2).
- **ADR-004** : rétention outbox `EventCaisse` = **30 jours puis purge**.
- **ADR-005** : **aucune HA** du nœud en V1 (basique : sauvegardes ; SPOF assumé).
- **ADR-006** : référence = **descendante stricte** depuis le cloud (pas d'édition magasin).

---

## 4. Vague 0 — Décisions & dérisquage *(préalable, 2 flux //)*

| ID | Tâche | Dépend | Statut |
|---|---|---|---|
| **D0.1** | ADR des 6 décisions ouvertes (§3) → `docs/architecture-desktop/09-adr.md` | — | ☑ **2026-06-26** |
| **D0.2** | PoC packaging **allégé** (ADR-001 : pas de Prisma dans Electron) : coquille Electron + `node-thermal-printer`/`serialport` recompilés (`electron-rebuild`) sur ≥1 OS. Spike jetable. | — | ☐ |

**Critère de sortie V0 :** ☑ décisions actées (`09-adr.md`) ; PoC prouve que les **modules natifs
ESC/POS** fonctionnent dans Electron packagé sur ≥1 OS cible.

---

## 5. Vague 1 — Fondation métier magasin *(code actuel, sans Electron)*

Prérequis « forts » (doc 08). Tournent sur le backend existant ; **livrables même sans desktop.**

| ID | Tâche | Dépend | Statut |
|---|---|---|---|
| **F1.1** | `caisseId` / multi-caisse (Lot C) — migration + backfill, unicité caisse+caissier, câbler les 8 `findFirst({active})` sur `session.caisseId`, seed 2 caisses, CRUD admin caisses, tests `multi-caissier` + `session-caisse-unicite` | — | ☑ **2026-06-26** |
| **F1.2** | Numérotation par poste `VTE-<codePoste>-YYYY-NNNNN` (étend la séquence) | F1.1 | ☑ **2026-06-26** |
| **F1.3** | Hash d'intégrité **par caisse** (`lib/services/integrity.ts`) | F1.1 | ☑ **2026-06-26** |
| **F1.4** | Outbox `EventCaisse` : table d'événements transactionnels (consumed/createdAt) + écriture sur ventes/mouvements/sessions | — | ☑ **2026-06-26** |
| **F1.5** | RULE-FOND-005 — caissier solo (auto-validation tracée sous seuil / clôture différée) | F1.1 | ☑ **2026-06-26** |

**Parallélisation interne :** F1.1 d'abord ; ensuite F1.2, F1.3, F1.5 en // ; F1.4 en // dès le départ.
**Critère de sortie V1 (= Jalon J1) :** multi-caisse cohérent sur le backend actuel, soldes/écarts
isolés par caisse, numéro & hash partitionnés par poste, suite de tests verte.

---

## 6. Vague 2 — Client Electron & pont périphériques

| ID | Tâche | Dépend | Statut |
|---|---|---|---|
| **C2.1** | Pont périphériques : construire le **reçu réel** (`printReceipt`) ; déplacer `tickets/[id]/print` + `cash-drawer/open` dans le **main Electron** ; IPC `window.aerisDevices.*` | D0.2 | ☑ **2026-06-26** *(reçu réel ; IPC Electron hors dépôt)* |
| **C2.2** | Coquille Electron : renderer charge l'UI du nœud ; durcissement (`contextIsolation`, `sandbox`, CSP, navigation restreinte) | D0.2 | ☐ |
| **C2.3** | Health-check du nœud + écran de blocage (pas de mode dégradé) | C2.2 | ☐ |

**Critère de sortie V2 (= Jalon J2) :** vente depuis Electron → nœud → impression locale + tiroir ;
blocage propre si nœud coupé. *(Combiné à D0.2 = PoC desktop validé.)*

---

## 7. Vagues 3–5

### Vague 3 — Enrôlement & identité poste
| ID | Tâche | Dépend | Statut |
|---|---|---|---|
| **E3.1** | Modèle d'enrôlement : **2 modes** (nœud magasin / client — pas d'autonome, ADR-001) ; `caisseId` = identité fixée à l'enrôlement | F1.1, C2.2 | ☐ |
| **E3.2** | Tokens & transport : tokens magasin scopés en trousseau OS, HTTPS LAN, révocation | D0.1 | ☑ **2026-06-26** *(logique nœud)* |
| **E3.3** | Flux d'installation : GUI premier lancement, association poste↔nœud | E3.1, E3.2 | ☐ |

**Jalon J3 :** magasin multi-caisse opérationnel en Electron avec enrôlement.

### Vague 4 — Synchronisation cloud
| ID | Tâche | Dépend | Statut |
|---|---|---|---|
| **S4.1** | Schéma cloud : base + clés `magasinId`/`organisationId` + tables enrôlement/curseurs | D0.1 | ☐ |
| **S4.2** | Worker push transactionnel : outbox → cloud, idempotent, par lots, accusé | F1.4, S4.1 | ☑ **2026-06-26** *(logique nœud)* |
| **S4.3** | Worker pull référence : catalogue/prix/users/taxes descendants (LWW, curseur) | S4.1 | ☑ **2026-06-26** *(logique nœud)* |
| **S4.4** | Résilience WAN : reprise sur coupure, rejeu | S4.2, S4.3 | ☑ **2026-06-26** *(logique nœud)* |

**Jalon J4 :** sync cloud opérationnelle (réplication transactionnelle + référence).

### Vague 5 — Packaging, distribution & exploitation
| ID | Tâche | Dépend | Statut |
|---|---|---|---|
| **P5.1** | electron-builder : installeurs 3 OS + CI multi-plateforme (`electron-rebuild`) | C2.*, D0.2 | ☐ |
| **P5.2** | Auto-update : electron-updater + S3 + signature de code | P5.1 | ☐ |
| ~~P5.3~~ | ~~Mode autonome packagé~~ — **supprimé (ADR-001 : pas de mode autonome)** | — | ✖ |
| **P5.4** | Runbook : supervision, sauvegardes/restauration testée (pas de HA, ADR-005), procédures incident | toutes | ☐ |

**Jalon J5 :** distribution packagée + exploitation → **release**.

---

## 8. Flux parallèles

| Flux | Contenu | Démarrage |
|---|---|---|
| **A — Backend métier** | V1 → alimente V4 | immédiat |
| **B — Desktop/Electron** | D0.2 → V2 → V5 | immédiat (PoC) |
| **C — Cloud/infra** | D0.1 → V4 → V5 | immédiat (ADR) |
| **D — Enrôlement/sécurité** | V3 | après J1 + J2 |

**Au démarrage, 3 chantiers en parallèle :** `D0.1` · `D0.2` · `F1.1`.

```
V0 (D0.1 ADR) ─────────────┐
V0 (D0.2 PoC) ───────┐     │
V1 F1.1 ─┬─ F1.2 ─┐  │     │
         ├─ F1.3 ─┤  │     │
         └─ F1.5 ─┤  │     │
   F1.4 ──────────┤  │     │
              [J1]─┘  │     │
                 V2 C2.1/C2.2/C2.3 ─[J2]─┐
                                 V3 E3.* ─[J3]─┐
                          V4 S4.* ────────[J4]─┤
                                   V5 P5.* ───[J5] → release
```

---

## 9. ▶ Reprise de session

**Si tu reprends ce programme dans une nouvelle session, fais exactement ceci :**

1. Lis ce document (surtout §2 état du code, §3 décisions, §10 journal).
2. Regarde le **Journal d'avancement (§10)** pour la dernière tâche traitée et la prochaine.
3. La **prochaine action par défaut** = lancer en parallèle `D0.1` (ADR), `D0.2` (PoC packaging),
   et **`F1.1`** (Lot C multi-caisse — c'est le premier incrément de code).
4. Pour `F1.1`, la spec détaillée est `docs/superpowers/specs/2026-06-26-lot-c-multi-caisse-design.md`
   (l'ajuster d'abord : `caisseId` = identité poste, ne pas sur-investir le sélecteur/CRUD **web**).
5. **TDD obligatoire** (cf. `web/app/AGENTS.md`) : tests d'abord, puis implémentation minimale.
6. Avant de coder Next.js, lire les guides `web/app/node_modules/next/dist/docs/` (Next 16, breaking changes).
7. Commande de validation : depuis `web/app/`, `npx vitest run` (baseline = 839 tests verts).
8. **Mettre à jour le Journal (§10) et les cases ☐/☑** à chaque tâche terminée.

**Conventions :** code sous `web/app/src/` · Prisma sous `web/app/prisma/` · docker compose à la racine.
Doc produit : `docs/product/`. Ne pas modifier `components/ui/` (shadcn).

---

## 10. Journal d'avancement

> Une ligne par évènement. La session en cours met à jour cette section avant de s'arrêter.

| Date | Tâche | Évènement |
|---|---|---|
| 2026-06-26 | — | Cadrage validé. Roadmap rédigée. Décisions Lot C actées. |
| 2026-06-26 | **D0.1** | ☑ **Terminée.** 6 décisions actées → `09-adr.md`. ADR-001 (pas de mode autonome) répercutée : D0.2 allégé, P5.3 supprimé, enrôlement = 2 modes. **Prochaine étape : D0.2 (PoC packaging) + F1.1 (Lot C) en parallèle.** |
| 2026-06-26 | **E3.2** | ☑ **Logique nœud livrée + testée.** Tokens de magasin scopés par poste : modèle `StoreToken` (migration `e3_2_store_token`, hash SHA-256 seul persisté, jamais le clair), service `lib/services/store-token.ts` (`issueStoreToken` scoppé caisse, `verifyStoreToken` actif+scope, `revokeStoreToken` perte/vol, `hashToken`). ADR-003 « Simple V1 » (longue durée + révocation). **Stockage trousseau OS + transport HTTPS/mTLS restent côté Electron.** Tests `store-token` (6 cas). **893 tests verts, tsc OK.** |
| 2026-06-26 | **C2.1** | ☑ **Reçu réel livré + testé.** STUB `printReceipt` résolu : `lib/receipt/receipt-content.ts` (`buildReceiptContent`) construit le contenu ESC/POS texte (en-tête commerce, méta vente, lignes produits, totaux/remise/taxes, paiements, largeur 32/48 bornée), fonction pure testée (`receipt-content.test.ts`). `printReceipt` imprime ces lignes ; route `tickets/[id]/print` alimente le contenu depuis la vente + paramètres. **Le déplacement vers le main Electron + IPC `window.aerisDevices.*` reste hors de ce dépôt backend.** **887 tests verts, tsc OK.** |
| 2026-06-26 | **S4.2/S4.3/S4.4** | ☑ **Logique nœud livrée + testée.** Service `lib/services/cloud-sync.ts` : `pushTransactionalEvents` (push outbox `EventCaisse` par lots, idempotent, accusé partiel géré, résilient — rien marqué consommé si échec transport), `pullReferenceUpdates` (référence descendante LWW, curseur non avancé en cas d'échec → rejeu), `withRetry` (reprise WAN). **Transport = port injectable** (l'impl HTTPS/mTLS réelle vers le cloud et le **schéma cloud S4.1** — base MySQL managée multi-magasins — restent hors de ce dépôt backend, par construction archi §38). Tests `cloud-push-worker` + `cloud-pull-worker` (11 cas). **881 tests verts, tsc OK.** |
| 2026-06-26 | **F1.5** | ☑ **Terminée.** RULE-FOND-005 caissier solo : seuil paramétrable `THRESHOLD_SOLO_AUTO_VALIDATION` (défaut 0 = désactivé). Quand > 0, le caissier propriétaire peut auto-valider sa propre session (contournement tracé de RULE-AUTH-003) tant que l'écart final ≤ seuil ; au-delà → 422 `SOLO_THRESHOLD_EXCEEDED` (clôture différée vers un tiers). Auto-validation tracée (`soloAutoValidation` dans log + outbox). Tests `solo-validation`. **870 tests verts, tsc OK. → Jalon J1 (Vague 1) atteint : multi-caisse cohérent, soldes/écarts isolés, numéro & hash partitionnés par poste, outbox câblé.** |
| 2026-06-26 | **F1.4** | ☑ **Terminée.** Outbox `EventCaisse` câblé : `emitEvent` (service existant, jamais bloquant) appelé sur ouverture session (`SESSION_OPENED`), mouvement caisse (`CASH_MOVEMENT_CREATED`), demande clôture (`SESSION_CLOSURE_REQUESTED`), validation (`SESSION_VALIDATED` + `DISCREPANCY_DETECTED`), contestation (`SESSION_DISPUTED`), force-close (`SESSION_FORCE_CLOSED`), correction (`SESSION_CORRECTED`). Test `event-outbox` + `event-emitter` existant. **867 tests verts, tsc OK.** |
| 2026-06-26 | **F1.3** | ☑ **Terminée.** Hash d'intégrité partitionné par caisse : `caisseId` intégré au `computeSessionHash` (lie le hash au poste) et le chaînage (`previousSession`) filtré par `caisseId` → chaque caisse a sa propre chaîne. Tests `integrity` + `integrity-service` mis à jour (caisseId, chaînage filtré). **865 tests verts, tsc OK.** |
| 2026-06-26 | **F1.2** | ☑ **Terminée.** Numérotation préfixée par poste `VTE-<codePoste>-YYYY-NNNNN`. Champ `code` (@unique) ajouté sur `Caisse` (migration `f1_2_code_poste` + backfill P1/P2). Séquence dédiée par poste (clé `VTE-<code>-<annee>`). `POST /api/caisse` exige `code`. Tests `numerotation-poste` + maj `numerotation-sequence` et tous les mocks de session des tests ventes. **863 tests verts, tsc OK.** |
| 2026-06-26 | **F1.1** | ☑ **Terminée.** `caisseId` ajouté sur `ComptoirSession` (migration `lot_c_session_caisse` + backfill `caisse-principale` + index `(caisseId, statut)`). Unicité Option B (1 OUVERTE par caisse ET par caissier). Les 7 résolutions `findFirst({active})` recâblées sur `session.caisseId` (ventes, annuler, sessions GET/PUT, validate, movements, correct). Ouverture : fallback 1 caisse, 400 si ≥2 sans `caisseId`, 422 si inactive/introuvable. CRUD admin caisses (`POST /api/caisse`, `PUT/DELETE /api/caisse/[id]`, ADMIN, soft-delete). Seed 2 caisses. Tests : `multi-caissier`, `session-caisse-unicite`, `session-fallback-caisse`, `caisse/crud` + maj tests existants. **860 tests verts, tsc OK.** |
