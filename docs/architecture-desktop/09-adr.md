# ADR — Décisions d'architecture desktop (D0.1)

> **Statut : ☑ Actées le 2026-06-26.** Réf. roadmap `00-ROADMAP-IMPLEMENTATION.md` (§3, tâche D0.1).
> Ces décisions tranchent les 6 points ouverts laissés par `08-impacts-glossaire.md §3`,
> plus une décision structurante (ADR-001) qui révise la doc `02`/`03`/`07`.

---

## ADR-001 — Pas de mode autonome : le client Electron est toujours un client du nœud magasin

**Statut :** Actée — **révise** `02-client-desktop.md`, `03-enrolement-installation.md`, `07-deploiement-exploitation.md` (qui prévoyaient un « mode autonome » embarquant Next+MySQL).

**Contexte.** La doc initiale prévoyait 3 modes au premier lancement (autonome / nœud magasin /
client), le mode autonome embarquant le serveur Next + Prisma + MySQL dans le binaire Electron.

**Décision.** **Il n'y a pas de mode autonome.** Le client Electron est **toujours** un client léger
qui communique avec l'**API du nœud magasin** ; le nœud magasin communique avec l'**API de
l'organisation parente**. Le client n'embarque **jamais** de base de données ni de serveur applicatif.

**Conséquences.**
- Le nœud magasin est **toujours** déployé comme un service serveur distinct (machine dédiée, ou
  **co-localisé en `localhost`** sur la même machine qu'un poste pour un commerce mono-caisse — mais
  jamais empaqueté *dans* le client Electron).
- **2 modes** d'enrôlement au lieu de 3 : *nœud magasin* et *client*.
- **PoC packaging (D0.2) allégé** : plus de Prisma/MySQL à packager dans Electron → le dérisquage se
  limite aux **modules natifs ESC/POS** (`node-thermal-printer`, `serialport`) via `electron-rebuild`.
- **Tâche P5.3 (mode autonome packagé) supprimée** de la Vague 5.
- Déploiement du nœud magasin = **inchangé vs aujourd'hui** (Next + Prisma + MySQL, ex. via Docker).

---

## ADR-002 — Base cloud : MySQL managé

**Contexte.** Le niveau magasin est MySQL (Prisma). Le niveau cloud agrège plusieurs magasins.

**Décision.** Le cloud utilise **MySQL managé** (même dialecte que le magasin).

**Conséquences.**
- Schéma Prisma cloud **réutilise** largement le schéma magasin + clés d'agrégation
  `magasinId`/`organisationId` (tâche S4.1). Un seul provider Prisma à maintenir.
- Pas de divergence de dialecte ; migrations homogènes magasin↔cloud.
- Analytique avancée (jsonb/fenêtrage PostgreSQL) **non retenue** en V1 ; reporting agrégé suffisant.

---

## ADR-003 — Sécurité de transport : « Simple V1 »

**Décision.**
- **Token magasin** (caisse ↔ nœud) : longue durée de vie, **révocable au nœud** à tout moment ;
  pas de rotation automatique en V1.
- **Device token cloud** (nœud ↔ cloud) : **rotation manuelle** au renouvellement.
- **mTLS** : **différé en V2**. En V1, **HTTPS + token** sur le LAN.

**Conséquences.**
- Révocation = mécanisme de sécurité principal (perte/vol d'un poste → on révoque son token).
- Stockage des tokens en **trousseau OS** (inchangé vs `06-securite.md`).
- mTLS et rotation automatique = backlog V2 (à ré-acter quand la base est en production).

---

## ADR-004 — Rétention de l'outbox `EventCaisse` : 30 jours puis purge

**Décision.** Après accusé de réception du cloud, un événement reste **30 jours** puis est purgé
(job de purge planifié).

**Conséquences.**
- Filet de **rejeu** en cas d'incident cloud + auditabilité courte ; table bornée.
- Tâche F1.4 (outbox) inclut le champ d'horodatage de consommation et le job de purge.

---

## ADR-005 — Haute disponibilité du nœud magasin : aucune en V1 (le plus basique)

**Décision.** **Pas de haute disponibilité** en V1. Configuration la plus basique possible :
le nœud magasin tourne sur une machine, avec **sauvegardes** (dump planifié + réplication cloud
comme filet). Pas de réplication MySQL primaire/réplica, pas de bascule.

**Conséquences.**
- Le nœud magasin reste un **SPOF assumé** : s'il tombe, les caisses bloquent (cohérent avec la règle
  de disponibilité du client).
- Mitigations matérielles (machine dédiée, UPS, Ethernet câblé) **recommandées mais non requises**.
- HA (réplication/bascule) = backlog ultérieur si la criticité l'exige.

---

## ADR-006 — Données de référence : descendantes strictes depuis le cloud

**Décision.** Catalogue, prix, catégories, utilisateurs/rôles, paramètres, taxes, seuils sont
**strictement descendants** depuis le cloud (autorité unique, last-writer-wins). **Aucune édition au
niveau magasin.**

**Conséquences.**
- **Aucun conflit bidirectionnel** sur la référence ; sync de référence = pull simple avec curseur.
- L'administration de la référence (création produit, prix…) se fait via l'**app web du cloud**, pas
  au magasin. (Cohérent avec « desktop V1 = caissiers seulement ».)
- Si un besoin d'édition locale émerge, il fera l'objet d'un nouvel ADR (mode hybride par champ).

---

## Synthèse des impacts sur la roadmap

| ADR | Impact roadmap |
|---|---|
| 001 | D0.2 allégé · P5.3 supprimé · enrôlement = 2 modes (E3.1) · déploiement nœud inchangé |
| 002 | S4.1 : schéma cloud = MySQL + clés d'agrégation |
| 003 | E3.2 : tokens longue durée + révocation ; mTLS/rotation auto → backlog V2 |
| 004 | F1.4 : outbox avec purge à 30 j |
| 005 | P5.4 : runbook = sauvegardes basiques, pas de HA |
| 006 | S4.3 : pull référence simple ; pas d'édition magasin |
