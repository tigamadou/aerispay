# Spec — Périphériques de caisse (implémentation)

> Ce document consolide le **plan d’implémentation** des imprimantes tickets ESC/POS, de la douchette code-barres et du tiroir-caisse. Il complète `SPECS/CAISSE.md` et `SPECS/IMPRESSION.md`.

## Objectif

Permettre à l’équipe de mettre en œuvre les scénarios matériels de façon reproductible : ordre des appels, responsabilité navigateur / serveur, configuration, et comportement d’erreur. Le tout en **TDD** (tests d’abord) comme décrit dans `CONVENTIONS.md` et `TODO.md`.

## Responsabilité navigateur vs serveur

| Périphérique | Où ça s’exécute | Rôle de l’app |
|---|---|---|
| **Douchette code-barres** (mode clavier USB/HID) | **Navigateur** | Champ de recherche POS : buffer + fin de scan (souvent `Enter`) ; résolution `barcode` → `reference` → texte. Voir [Douchette](#douchette-code-barres) |
| **Imprimante ticket** ESC/POS | **Serveur** (Next.js API Routes) | `node-thermal-printer` ou bytes ESC/POS bruts ; cible idéale : **imprimante réseau** `tcp://IP:9100` |
| **Tiroir-caisse** (connecté à l’imprimante) | **Serveur** | Impulsion ESC/POS vers la **même** imprimante que pour le ticket ; jamais depuis le seul navigateur |
| **PDF** | **Serveur** | Fallback si `PRINTER_ENABLED=false` ou erreur d’impression ; voir `SPECS/IMPRESSION.md` |

Le navigateur **n’envoie jamais** d’ESC/POS directement à l’imprimante ; il appelle les API (`fetch`) qui, elles, parlent à l’imprimante / tiroir.

## Schéma de flux (vente + matériel)

```text
1) UI POST /api/ventes  →  transaction Prisma (vente validée, stock décrémenté)
2) Réponse 201/200 avec { vente / ticket id }
3) (Option) POST /api/tickets/[id]/print   →  ESC/POS vers PRINTER_INTERFACE
4) (Option) Après CASH : ouverture tiroir
      - soit intégrée à la fin du flux d’impression (même connexion)
      - soit POST /api/cash-drawer/open  →  mêmes cibles matérielles
5) Erreur en 3 ou 4 : la vente reste enregistrée ; l’utilisateur reçoit un message + idéalement log d’activité
```

Règle absolue : **ne pas annuler** une vente en base parce qu’imprimante ou tiroir a échoué. Idempotence côté UI : boutons « réimprimer » / « ouvrir tiroir » manuels si besoin.

## Configuration

Les variables d’environnement sont listées et commentées dans :

- `web/development.env.example` (copie racine en `.env` pour Compose)
- `web/production.env.example`
- section détaillée dans `SPECS/IMPRESSION.md`

Noms stables recommandés pour l’implémentation : `PRINTER_*`, `CASH_DRAWER_*` (déjà présents dans les exemples `.env`).

## Docker et réseau

- L’imprimante doit être joignable **depuis le process Node** : conteneur `app` en dev ou process Next en production.
- **Recommandation** : imprimante en **IP fixe** sur le LAN, port **9100** (RAW/JetDirect).
- Si l’imprimante est sur la machine hôte (macOS) et l’app dans Docker : le conteneur doit atteindre l’hôte, par ex. `tcp://host.docker.internal:9100` (à valider pour votre version de Docker ; sinon utiliser l’IP LAN de l’hôte).
- **USB / `/dev/usb/*` / série** dans un conteneur : configuration fragile (droits, mapping device). Préférer le réseau ; sinon exécuter l’intégration sur l’**hôte** (sans conteneur pour l’`app`).

Détails généraux : `DOCKER.md` → section *Périphériques de caisse*.

## Douchette code-barres

Comportement attendu (TDD) :

1. Focaliser le champ de recherche POS dès l’ouverture de l’écran (ou raccourci clavier).
2. Accumuler la saisie rapide, détecter la fin de scan (retour chariot / `Enter`).
3. Résolution **dans l’ordre** :
   - produit actif avec `barcode` (ou `codeBarres` en base, voir `SPECS/STOCK.md`) égal à la chaîne scannée ;
   - sinon `reference` unique parmi produits actifs ;
   - sinon requête type recherche (plusieurs résultats → ne pas ajouter, afficher la liste).
4. Aucun ajout si le produit est inactif (`active = false`).

Tests : simuler le buffer clavier (RTL) et les réponses d’API mockées (TanStack Query ou fetch mock).

## Imprimante et tiroir (côté serveur)

- Implémentation cible : `lib/receipt/thermal-printer.ts` (ou équivalent), appelé depuis `POST /api/tickets/[id]/print` et, si séparé, `POST /api/cash-drawer/open`.
- Après un paiement **CASH** et si `CASH_DRAWER_OPEN_ON_CASH=true` : enchaîner (ou appeler) l’ouverture tiroir **une fois** la vente persistée.
- Les endpoints et corps de requêtes : voir `SPECS/IMPRESSION.md`.

## Alignement des routes API (AerisPay)

Toutes les routes côté projet doivent suivre le préfixe et les noms de `CLAUDE.md` (français, kebab-case) : par ex. `POST /api/ventes`, `GET /api/tickets/[id]/pdf`, `POST /api/tickets/[id]/print` — **pas** de `/api/sales` en production sauf choix explicite de refactor global.

## Tests (TDD)

1. **Vitest** : routes d’impression / tiroir **mockent** l’ouverture TCP (ou le module d’impression) ; vérifier codes HTTP, idempotence, refus d’ouverture tiroir par un `CAISSIER` si la spec l’impose, etc.
2. **Playwright** : parcours vente → appel print mocké (réseau intercepté) ou bouchon d’environnement `PRINTER_ENABLED=false` pour valider l’UI de secours.
3. **Manuel** (checklist de démo) : une ligne dans la PR : imprimante réseelle + tiroir branché sur imprimante, scan réel, relevé des erreurs affichées.

## Références

| Sujet | Fichier |
|------|---------|
| Règles POS, scan, tiroir après CASH | `SPECS/CAISSE.md` |
| PDF, ESC/POS, API print / cash-drawer, variables | `SPECS/IMPRESSION.md` |
| Champ `barcode` / recherche | `SPECS/STOCK.md` |
| Schéma Prisma (noms de champs produit) | `ARCHITECTURE_MVP.md` |
| Docker, hosts, périphériques | `DOCKER.md` |
| Matériel dans la roadmap / tickets | `ROADMAP.md`, `TODO.md` |
