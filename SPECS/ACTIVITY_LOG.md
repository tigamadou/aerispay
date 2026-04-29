# Spec — Journal d’activité (Activity log)

## Objectif
Conserver une **trace horodatée et consultable** de l’essentiel des actions effectuées dans AerisPay (authentification, gestion des utilisateurs, stock, caisse, tickets, etc.), à des fins d’**audit**, de **support** et de **conformité** opérationnelle.

- **Journalisation append-only** : les entrées ne sont ni modifiées ni supprimées par l’application (hors maintenance DBA / rétention future).
- **Pas d’écriture par les utilisateurs finaux** : seul le **système** (via le code serveur) crée des lignes de log.

## Modèle de données (champs en base en anglais)

### `ActivityLog`
| Field | Type | Règles |
|---|---|---|
| `id` | String (cuid) | Identifiant |
| `action` | String | Code d’action stable (voir catalogue ci-dessous) |
| `entityType` | String? | Type d’entité métier concernée (ex. `Product`, `Sale`, `User`) |
| `entityId` | String? | Identifiant de l’entité (souvent le `cuid` Prisma) |
| `metadata` | JSON? | Détails structurés (avant/après, libellés, montants, codes d’erreur, etc.) — **ne jamais y mettre de secrets** (mot de passe, token, secret) |
| `ipAddress` | String? | Adresse IP client (si disponible, ex. `X-Forwarded-For` / `req`) |
| `userAgent` | String? | En-tête `User-Agent` (tronqué si besoin, ex. 512 car.) |
| `createdAt` | DateTime | Horodatage serveur (`@default(now())`) |
| `actorId` | String? | Utilisateur authentifié à l’origine de l’action ; `null` si action **système** ou **tentative de connexion sans compte** |

Index recommandés : `createdAt`, `actorId`, `action`, couple `(entityType, entityId)`.

## Catalogue d’actions (exemples)

Les valeurs `action` sont des **chaînes stables** (SCREAMING_SNAKE_CASE), listées dans un module TypeScript partagé (ex. `lib/activity-log/actions.ts`) pour éviter les fautes de frappe.

| Domaine | Exemples `action` |
|---|---|
| Auth | `AUTH_LOGIN_SUCCESS`, `AUTH_LOGOUT`, `AUTH_LOGIN_FAILED` |
| Utilisateurs | `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED` |
| Stock | `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DEACTIVATED`, `CATEGORY_CREATED`, `STOCK_MOVEMENT_CREATED` |
| Caisse | `CASH_SESSION_OPENED`, `CASH_SESSION_CLOSED`, `SALE_COMPLETED`, `SALE_CANCELLED` |
| Tickets / matériel | `TICKET_PDF_DOWNLOADED`, `TICKET_THERMAL_PRINT_REQUESTED`, `CASH_DRAWER_OPENED`, `CASH_DRAWER_OPEN_FAILED`, `BARCODE_SCAN_NOT_FOUND` |

Le catalogue peut s’étendre ; toute nouvelle route ou action sensible doit déclarer **au moins** un appel à `logActivity` lorsque c’est pertinent.

## Où écrire le log

- **API Routes** : après succès (ou échec critique) de l’opération, appeler une fonction utilitaire serveur unique, ex. `logActivity({ ... })` dans `lib/activity-log.ts`.
- **NextAuth** : hooks / callbacks (ex. `events` ou post-auth) pour `AUTH_LOGIN_*` / `AUTH_LOGOUT` sans dupliquer la logique dans chaque page.
- **Transactions Prisma** : de préférence enregistrer le log **après** la transaction métier réussie (ou dans un second `prisma.$transaction` si besoin de cohérence stricte).

## API de consultation

| Méthode | Endpoint | Rôle |
|---|---|---|
| GET | `/api/activity-logs` | Liste paginée, filtres : période, `action`, `actorId`, `entityType` / `entityId`, recherche texte sur `metadata` (optionnel, limité) |

- **Accès** : `ADMIN` et `MANAGER` en **lecture seule** ; `CAISSIER` : **403** (ou masquer l’entrée de menu).
- **Pagination** : `page`, `pageSize` (ex. 20), tri par `createdAt` desc.
- **Export** (hors MVP possible) : CSV pour audit externe.

## Interface utilisateur

- **Route** : `(dashboard)/activity-logs/page.tsx` (ou `/audit` si vous préférez un libellé court).
- **Contenu** : tableau avec colonnes Date, Acteur, Action, Entité, Résumé (dérivé de `metadata`), IP (optionnel pour MANAGER selon politique).
- **Filtres** : plage de dates, type d’action, utilisateur.
- **Navigation** : entrée dans la sidebar pour `ADMIN` et `MANAGER` uniquement.

## Sécurité & confidentialité

- Ne jamais logger mots de passe, tokens, ni `NEXTAUTH_SECRET`.
- Données personnelles dans `metadata` : minimiser (ex. email partiel seulement si besoin de debug).
- Les échecs de login : logger `AUTH_LOGIN_FAILED` avec `actorId: null` et `metadata: { reason, email?: normalisé }` — éviter de stocker le mot de passe en clair.

## Tests requis

Ces tests sont à écrire avant l’implémentation du journal d’activité selon la démarche **TDD**. Ils doivent guider le modèle Prisma, l’utilitaire `logActivity`, les permissions API et les règles de confidentialité.

- [ ] Création d’une ressource métier → au moins une ligne `ActivityLog` avec le bon `action` et `actorId`
- [ ] `GET /api/activity-logs` : `ADMIN` / `MANAGER` → 200 ; `CAISSIER` → 403
- [ ] Pagination et filtres date cohérents
- [ ] Aucun secret dans les champs persistés (revue manuelle ou test sur patterns interdits)
- [ ] Erreur matériel caisse (imprimante / tiroir / scan inconnu) → action pertinente sans donnée sensible
