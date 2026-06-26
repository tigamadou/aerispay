# Architecture Desktop & Multi-magasin — AerisPay

> Documentation de référence de l'architecture desktop **livrée** : **application desktop (Electron)** organisée en **trois niveaux** — caisse, magasin, cloud — avec base de données **locale au magasin** et **base parente dans le cloud**.
> Statut : **implémentée** (2026-06-26). Cette documentation décrit l'architecture cible désormais réalisée ; son articulation avec les lots de correction est détaillée au chapitre 08.

## Objectifs

- Déployer AerisPay comme **client desktop installable** sur chaque poste de caisse, pilotant les **périphériques** locaux (imprimante ticket ESC/POS, tiroir, douchette).
- Faire reposer chaque magasin sur une **base de données locale** (source de vérité du magasin), partagée par toutes ses caisses en réseau local.
- Synchroniser chaque magasin avec une **base parente dans le cloud** (niveau organisation / groupe) pour l'agrégation, le reporting, l'accès distant et les sauvegardes.
- **Règle de disponibilité forte** : si la base du magasin n'est pas joignable, le client **bloque** (pas de mode dégradé au niveau caisse).

## Les trois niveaux en un coup d'œil

```
                    ┌─────────────────────────────┐
                    │   NIVEAU 3 — CLOUD (groupe) │
                    │  Base parente · agrégation  │
                    │  reporting · accès distant  │
                    │  sauvegardes (S3)           │
                    └──────────────┬──────────────┘
                                   │  sync magasin ↔ cloud
                                   │  (référence ↓ / transactionnel ↑)
                    ┌──────────────┴──────────────┐
                    │  NIVEAU 2 — NŒUD MAGASIN     │
                    │  Serveur applicatif (Next)   │
                    │  + base MySQL du magasin     │
                    │  = SOURCE DE VÉRITÉ MAGASIN  │
                    └───┬───────────┬───────────┬──┘
                        │ LAN       │ LAN       │ LAN  (API + token magasin)
                  ┌─────┴───┐ ┌─────┴───┐ ┌─────┴───┐
                  │ CAISSE 1│ │ CAISSE 2│ │ CAISSE 3│   NIVEAU 1 — CLIENTS
                  │ Electron│ │ Electron│ │ Electron│   (UI + périphériques,
                  │ sans BD │ │ sans BD │ │ sans BD │    SANS base de données)
                  └─────────┘ └─────────┘ └─────────┘
```

## Périmètre par rôle (V1)

| Surface | Rôles | Usage |
|---|---|---|
| **Application desktop (Electron)** | **CAISSIER uniquement** | Comptoir/POS, sessions du caissier, encaissement, périphériques |
| **Application web (navigateur)** | **ADMIN, MANAGER** | Stock, validation des sessions, écarts, ventes, utilisateurs, taxes, paramètres, journal, tableaux de bord |

En V1, **seuls les caissiers utilisent l'application desktop**. Les administrateurs et gérants passent par l'**application web dans le navigateur** (servie par le nœud magasin en LAN, et/ou par le cloud pour l'accès distant et le niveau groupe). Le périmètre desktop pourra s'élargir ultérieurement.

> Conséquence : la **validation à l'aveugle** d'une session peut être faite par un manager **depuis le navigateur**, ou par un caissier entrant depuis le desktop — l'API est la même.

## Principes directeurs

1. **Source de vérité unique par magasin.** Toute la cohérence (stock, ledger de caisse, intégrité) vit dans la base du magasin → le modèle actuel à source unique est préservé.
2. **Client sans base de données.** La caisse est un terminal de présentation + un pont périphériques ; elle ne stocke pas de données métier et **bloque** si le magasin est indisponible.
3. **Le distribué se limite à une frontière : magasin ↔ cloud.** Un seul canal de synchronisation par magasin, tolérant aux coupures WAN.
4. **Autorité partitionnée.** Données de référence : autorité cloud (descendantes). Données transactionnelles : autorité magasin (montantes, append-only). Trésorerie/intégrité : partitionnées par caisse.
5. **Electron = couche périphériques + kiosque**, pas couche données.
6. **Desktop = caissiers seulement (V1)** ; admins/managers via le navigateur.

## Sommaire

| # | Document | Contenu |
|---|---|---|
| 01 | [Modèle à trois niveaux & carte d'autorité](01-modele-trois-niveaux.md) | Rôles des niveaux, qui fait autorité, classification des données |
| 02 | [Client desktop & périphériques](02-client-desktop.md) | Electron, kiosque, pont périphériques (IPC), absence de BD, blocage |
| 03 | [Enrôlement & installation](03-enrolement-installation.md) | Flux d'installation, entrées requises, modes de déploiement |
| 04 | [Nœud magasin & disponibilité](04-noeud-magasin.md) | Serveur applicatif + BD, point unique de défaillance, mitigations |
| 05 | [Synchronisation cloud](05-synchronisation-cloud.md) | Canaux, outbox `EventCaisse`, idempotence, conflits, offline WAN |
| 06 | [Sécurité](06-securite.md) | Tokens, trousseau OS, TLS, comptes scoppés, révocation, durcissement |
| 07 | [Déploiement & exploitation](07-deploiement-exploitation.md) | Packaging Electron, modules natifs, auto-update, runbook |
| 08 | [Impacts, décisions & glossaire](08-impacts-glossaire.md) | Articulation avec les lots de correction, décisions actées (ADR), glossaire/FAQ |

## Emplacement dans le dépôt

L'application desktop (client Electron) vit dans un dossier **`desktop/` à la racine du dépôt**, à côté de l'application web existante :

```
aerispay/                     ← racine du dépôt
├── web/                      ← application Next.js (sert de NŒUD MAGASIN : serveur applicatif + Prisma + MySQL)
│   └── app/src/…
├── desktop/                  ← NOUVEAU : client Electron (coquille kiosque + pont périphériques)
├── docs/
│   ├── product/             ← documentation produit (dérivée du code)
│   └── architecture-desktop/ ← cette documentation
└── docker-compose*.yml
```

`web/` reste la base de code applicative (et fournit l'image du nœud magasin) ; `desktop/` consomme cette application (la charge depuis le nœud magasin) et ajoute la couche périphériques. Structure interne de `desktop/` : voir [07 — Déploiement & exploitation](07-deploiement-exploitation.md) §0 et `desktop/README.md`.

## Décisions structurantes déjà actées

- Trois niveaux **caisse / magasin / cloud** (et non local-first par caisse).
- **Client sans BD**, blocage si magasin indisponible.
- Le client se connecte à l'**API du nœud magasin** (pas à la base directement).
- **MySQL conservé au niveau magasin** → le schéma Prisma actuel ne change pas à ce niveau.
- **Electron** retenu (plutôt que Tauri/PWA) car la périphérie et Prisma sont en écosystème Node.
- Code du client desktop localisé dans **`desktop/`** à la racine du dépôt (monorepo avec `web/`).

## Décisions actées (voir [09 — ADR](09-adr.md))

- **Haute disponibilité** du nœud magasin : aucune HA en V1, SPOF assumé + sauvegardes (ADR-005).
- **Base cloud** : MySQL managé réutilisant le schéma magasin + clés d'agrégation (ADR-002).
- **Données de référence** : référence descendante stricte, pas d'édition au niveau magasin (ADR-006).

Détail et impacts : [09 — ADR](09-adr.md) et [08 — Impacts, décisions & glossaire](08-impacts-glossaire.md).
