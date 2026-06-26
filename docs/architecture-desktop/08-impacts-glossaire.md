# 08 — Impacts, décisions ouvertes & glossaire

[← Index](README.md)

## 1. Articulation avec les lots de correction

Cette architecture **réutilise** les lots de correction d'audit sans les contredire ; plusieurs lots ont constitué des **prérequis naturels** du passage desktop (tous livrés au 2026-06-26).

| Lot | Impact dans l'architecture desktop |
|---|---|
| **B — Anti-survente** | S'exécute sur la base **magasin** unique → empêche la survente entre caisses partageant la base. Prérequis fort. |
| **C — caisseId / multi-caisse** | Le `caisseId` **devient l'identité de poste** fixée à l'enrôlement. Brique d'identité du client. Prérequis fort. |
| **G — Fond de caisse & levée** | Inchangé, exécuté au magasin ; le ledger par caisse est répliqué au cloud. |
| **A — Solde théorique unifié** | Inchangé (logique au magasin). |
| **E / M3 — Numérotation** | **Livrée par poste** (`VTE-<codePoste>-YYYY-NNNNN`, séquence par poste/année) pour rester unique à l'échelle organisation — prérequis du multi-magasin. |
| **Hash d'intégrité** | **Chaîné par caisse** (`integrity.ts`, lien via `caisseId`). |

> Tous ces lots (B, C, G/A, numérotation par poste, hash par caisse) sont **livrés** et intégrés au périmètre desktop.

## 2. Changements de schéma induits (niveau cloud surtout)

- **Niveau magasin** : schéma Prisma **inchangé** (MySQL conservé).
- **Niveau cloud** : ajout de clés d'agrégation **`magasinId` / `organisationId`** sur les entités répliquées, et de tables d'**enrôlement** (magasins, postes, tokens, curseurs de sync).
- **Numérotation** : champ/code **poste** intégré au format de numéro.
- **Intégrité** : chaînage scoppé par caisse (donnée déjà présente, logique à adapter).

## 3. Décisions encore à acter

1. **Haute disponibilité du nœud magasin** : mini-PC + UPS seul, ou réplication MySQL + bascule ? (cf. [04](04-noeud-magasin.md))
2. **Base cloud** : MySQL managé vs PostgreSQL ; stratégie de réplication et schéma multi-magasin.
3. **Données de référence** : éditables au niveau magasin (avec remontée) ou strictement descendantes depuis le cloud ?
4. **Politique de tokens** : durée de vie, rotation, mTLS pour caisse↔magasin et magasin↔cloud.
5. **Rétention `EventCaisse`** après consommation et accusé cloud.
6. **Mode autonome** : MySQL embarqué vs MySQL/MariaDB installé séparément vs SQLite (impliquerait une portabilité de schéma).

## 4. Risques principaux & parades

| Risque | Parade |
|---|---|
| Nœud magasin = SPOF | Machine dédiée, UPS, LAN câblé, sauvegardes ; HA optionnelle |
| Packaging Prisma dans Electron | Dérisquer au PoC (moteur *library*, engine par plateforme) |
| Modules natifs multi-OS (`node-thermal-printer`) | `electron-rebuild` + CI 3 OS |
| Diffusion de secrets sur les postes | Token de magasin scoppé en trousseau OS ; pas de creds DB sur les caisses |
| Divergence cloud (référence) | Autorité cloud claire (LWW) ; périmètre de référence bien défini |
| Coût signature/certificats | Budget à prévoir (Windows/macOS) pour distribution + auto-update |

## 5. Glossaire

- **Organisation / groupe** : entité de plus haut niveau (cloud), regroupe plusieurs magasins.
- **Nœud magasin** : machine dédiée hébergeant le serveur applicatif + la base du magasin ; source de vérité du magasin.
- **Caisse / poste** : terminal Electron sans base, identifié par `caisseId`.
- **Token de magasin** : secret scoppé délivré à une caisse pour appeler l'API du nœud magasin.
- **Device token cloud** : secret détenu par le nœud magasin pour parler au cloud.
- **Référence (descendante)** : données dont le cloud fait autorité (catalogue, users, paramètres…).
- **Transactionnel (montant)** : données append-only dont le magasin fait autorité (ventes, sessions, mouvements…).
- **Outbox** : pattern d'émission fiable d'événements pour la synchronisation (basé sur `EventCaisse`).
- **SPOF** : point unique de défaillance.

## 6. FAQ

**Une caisse peut-elle vendre si le nœud magasin est coupé ?**
Non. Règle assumée : pas de base magasin = **blocage**. Aucune file locale, pas de mode dégradé caisse.

**Une caisse peut-elle vendre si le cloud est coupé ?**
Oui. Le cloud n'est pas sur le chemin critique ; le magasin fonctionne et rattrape la synchronisation au retour du WAN.

**Le schéma de base change-t-il ?**
Pas au niveau magasin (MySQL conservé). Des ajouts ont lieu au niveau cloud (clés d'agrégation, enrôlement) et pour la numérotation par poste.

**Pourquoi pas du local-first par caisse ?**
Cela casserait la source de vérité unique (stock, hash chaîné, numérotation) et imposerait un moteur de réplication multi-maître complexe. Le nœud magasin résout le problème en confinant le distribué à la frontière magasin↔cloud.

**Pourquoi Electron et pas un navigateur ?**
Pour piloter de façon fiable l'imprimante ESC/POS et le tiroir-caisse, hors de portée d'un navigateur.

**Qui utilise le desktop, qui utilise le navigateur ?**
En V1, le **desktop est réservé aux caissiers** (POS + périphériques). Les **admins et gérants utilisent l'application web** dans le navigateur (stock, validation, écarts, ventes, utilisateurs, taxes, paramètres, journal, tableaux de bord), servie par le nœud magasin en LAN et/ou le cloud.

**Un manager peut-il valider une session sans desktop ?**
Oui. La validation à l'aveugle se fait via le navigateur (manager) ou via le desktop (caissier entrant) — même API. Seules l'impression et l'ouverture du tiroir nécessitent le desktop.
