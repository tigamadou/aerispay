# Documentation produit AerisPay

> **Le *QUOI* du produit.** Cette documentation décrit le **comportement fonctionnel** d'AerisPay
> (règles métier, modèles de données, endpoints), **dérivée du code réel** (`web/app/src/`) comme
> source de vérité — et non d'anciennes specs.
>
> Pour le ***COMMENT* c'est déployé** (architecture desktop 3 niveaux, synchronisation,
> décisions/ADR), voir [`../../ARCHITECTURE_MVP.md`](../../ARCHITECTURE_MVP.md) ; pour l'exploitation,
> [`../../RUNBOOK.md`](../../RUNBOOK.md).

## Contexte

AerisPay est une solution de **caisse (POS) et de gestion de stock** pour PME. Le comportement
documenté ici tourne sur le **nœud magasin** (le backend Next.js + Prisma + MySQL), quel que soit le
mode de déploiement. Le produit évolue vers une **architecture desktop à 3 niveaux** :

```
Client Electron (caisse) → Nœud magasin (ce backend) → Cloud organisation
```

Les règles métier ci-dessous **ne changent pas** avec ce pivot : c'est la topologie de déploiement
qui évolue (voir `../../ARCHITECTURE_MVP.md`).

## Index

| Fichier | Module | Contenu |
|---|---|---|
| [01-auth-roles.md](01-auth-roles.md) | Auth & rôles | NextAuth v5, rôles ADMIN/MANAGER/CAISSIER, matrice de permissions, rate-limit |
| [02-stock.md](02-stock.md) | Stock | Produits, catégories, mouvements, alertes de rupture, anti-survente atomique |
| [03-comptoir-ventes.md](03-comptoir-ventes.md) | Comptoir / Ventes | POS, panier, paiements, vente transactionnelle, annulation, numérotation |
| [04-caisse-sessions.md](04-caisse-sessions.md) | Caisse & sessions | Cycle de session, validation à l'aveugle, réconciliation, fond & levée, intégrité |
| [05-impression-peripheriques.md](05-impression-peripheriques.md) | Impression & périphériques | Ticket PDF/thermique ESC/POS, tiroir-caisse, douchette, pont Electron |
| [06-dashboard-reporting.md](06-dashboard-reporting.md) | Dashboard & reporting | KPI, visibilité par rôle, Z de caisse |
| [07-journal-activite.md](07-journal-activite.md) | Journal d'activité | `logActivity`, catalogue des actions, consultation ADMIN/MANAGER |
| [08-taxes-parametres.md](08-taxes-parametres.md) | Taxes & paramètres | Taxes (modèle global), paramètres commerce, upload |
| [09-pages-api.md](09-pages-api.md) | Pages & API | Cartographie des pages App Router et des endpoints (référence) |

## Glossaire rapide

- **Nœud magasin** — le backend Next.js + Prisma + MySQL d'un magasin ; source de vérité locale.
- **Session de comptoir** — shift de caisse (ouverture → ventes → clôture → validation à l'aveugle).
- **Solde théorique** — solde dérivé de la somme algébrique des `MouvementCaisse` d'une session
  (`computeSoldeSession`), jamais stocké/muté.
- **Validation à l'aveugle** — le valideur recompte le tiroir sans voir la déclaration du caissier ;
  le système réconcilie contre le théorique.
- **Fond de caisse (Modèle 2)** — `FOND_OUVERTURE` rattaché à la session ; à la clôture, les recettes
  sont **levées** (`LEVEE`), il reste le float.
- **Référence descendante** — données gérées par le cloud et répliquées vers le magasin (catalogue,
  prix, utilisateurs, taxes, paramètres, seuils) ; pas d'édition au magasin (ADR-006).

## Backlog fonctionnel résiduel (hors migration desktop)

La migration desktop 3 niveaux est **livrée** (voir [`../../ARCHITECTURE_MVP.md`](../../ARCHITECTURE_MVP.md)).
Manques fonctionnels connus restants, non couverts par le code actuel. À arbitrer séparément :

- **QR code sur ticket** — non implémenté.
- **Export inventaire CSV** — aucun endpoint.
- **Rapport de session PDF** — le Z de caisse existe en **JSON** seulement (voir
  [06-dashboard-reporting.md](06-dashboard-reporting.md)).
- **Qualité** — couverture de tests à compléter, RTL composants critiques, e2e, revue OWASP.

## Note sur les divergences code/comportement

Cette doc étant dérivée du code, plusieurs **écarts connus** y sont signalés dans les fichiers
concernés (ex. type de mouvement `RETOUR` présent dans l'enum mais rejeté par l'API ;
`ActivityLogTable` mappant d'anciens codes d'action ;
Z de caisse en JSON et non en PDF). Ils constituent de la **dette à arbitrer**, pas le comportement
cible — ils sont décrits là où ils apparaissent.
