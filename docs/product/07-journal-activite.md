# 07 — Journal d'activité (audit)

> Documentation produit dérivée du **code réel** (source de vérité). En cas de divergence,
> c'est l'implémentation décrite ici qui fait foi.
>
> Périmètre couvert : journalisation (`logActivity`), catalogue des actions, modèle de données,
> endpoint de consultation, composant d'affichage, tests existants.

---

## 1. Objectif

Le journal d'activité fournit une **trace d'audit** des opérations sensibles d'AerisPay :
authentification, gestion des utilisateurs, stock, comptoir (sessions de caisse, ventes,
mouvements de caisse, intégrité), tickets/périphériques et paramétrage.

Principes appliqués dans le code :

- **Non bloquant** : la journalisation ne doit jamais casser l'opération métier. `logActivity`
  est entièrement encapsulée dans un `try/catch` qui se contente de logger l'erreur en console
  (`activity-log.ts:107-110`).
- **Append-only** : chaque opération crée une ligne ; aucune mise à jour ni suppression de log
  n'est exposée par l'API.
- **Acteur optionnel** : une action peut être « Système » (sans acteur), par ex. un échec de
  connexion. La relation `actor` est `onDelete: SetNull` pour préserver l'historique même après
  suppression d'un utilisateur (`schema.prisma:409`).
- **Consultation restreinte** : lecture réservée aux rôles `ADMIN` et `MANAGER` ; l'adresse IP
  n'est visible que par `ADMIN`.

---

## 2. Modèle de données

Modèle Prisma `ActivityLog` (table `activity_logs`) — `prisma/schema.prisma:398-416` :

| Champ        | Type Prisma          | Contraintes / notes                                            |
| ------------ | -------------------- | -------------------------------------------------------------- |
| `id`         | `String`             | `@id @default(cuid())`                                         |
| `action`     | `String`             | Code d'action (voir catalogue §4)                              |
| `entityType` | `String?`            | Type d'entité concernée (`Product`, `User`, `Sale`, …)         |
| `entityId`   | `String?`            | Identifiant de l'entité concernée                              |
| `metadata`   | `Json?`              | Données contextuelles libres (nom, référence, montants, …)     |
| `ipAddress`  | `String?`            | `@db.VarChar(45)` (compatible IPv6)                            |
| `userAgent`  | `String?`            | `@db.Text` — tronqué à 512 caractères à l'écriture             |
| `createdAt`  | `DateTime`           | `@default(now())`                                              |
| `actorId`    | `String?`            | FK vers `User`                                                 |
| `actor`      | `User?`              | `@relation(... onDelete: SetNull)` → log conservé sans acteur  |

**Index** (`schema.prisma:411-414`) : `createdAt`, `actorId`, `action`, et composite
`(entityType, entityId)` — alignés sur les filtres et le tri de l'API.

---

## 3. Fonction `logActivity`

Fichier : `web/app/src/lib/activity-log.ts`.

### Signature (`activity-log.ts:79-89`)

```ts
interface LogActivityParams {
  action: ActionCode;                  // code typé issu de ACTIONS
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logActivity(params: LogActivityParams): Promise<void>
```

Comportement (`activity-log.ts:89-111`) :

- Insère une ligne via `prisma.activityLog.create`.
- Les champs optionnels absents sont normalisés à `null` (`actorId`, `entityType`, `entityId`,
  `ipAddress`).
- `metadata` : `undefined` si non fourni, sinon casté en `Prisma.InputJsonValue`.
- `userAgent` : **tronqué à 512 caractères** (`params.userAgent.slice(0, 512)`).
- En cas d'erreur DB : capturée, loggée en console `[logActivity]`, **jamais propagée**.

### Capture IP / User-Agent

Helpers exportés, appelés côté API Routes pour extraire l'origine de la requête :

| Helper                       | Source                                                     | Référence                  |
| ---------------------------- | --------------------------------------------------------- | -------------------------- |
| `getClientIp(req)`           | `x-forwarded-for` (1ʳᵉ valeur) sinon `x-real-ip`, sinon `null` | `activity-log.ts:115-119` |
| `getClientUserAgent(req)`    | en-tête `user-agent`, sinon `null`                        | `activity-log.ts:121-123`  |

### Non-journalisation des secrets

Le code ne place jamais de données sensibles dans les logs : `logActivity` n'enregistre que les
champs ci-dessus, et les appelants passent un `metadata` métier (nom, référence, montant,
quantité…). Aucun mot de passe, hash ou token n'est inséré — conforme à la règle de sécurité
projet « ne jamais logger de données sensibles ». Le `metadata` étant libre, les appelants
restent responsables de ne pas y injecter de secret.

---

## 4. Catalogue des actions tracées

Toutes les actions sont définies dans la constante `ACTIONS` (SCREAMING_SNAKE_CASE), typées via
`ActionCode` (`activity-log.ts:6-75`). Liste exhaustive groupée par domaine :

### Authentification (`activity-log.ts:7-10`)
| Code                  | Sens                         |
| --------------------- | ---------------------------- |
| `AUTH_LOGIN_SUCCESS`  | Connexion réussie            |
| `AUTH_LOGIN_FAILED`   | Échec de connexion           |
| `AUTH_LOGOUT`         | Déconnexion                  |

### Utilisateurs (`activity-log.ts:12-15`)
| Code               | Sens                    |
| ------------------ | ----------------------- |
| `USER_CREATED`     | Utilisateur créé        |
| `USER_UPDATED`     | Utilisateur modifié     |
| `USER_DEACTIVATED` | Utilisateur désactivé   |

### Stock — Produits (`activity-log.ts:17-20`)
| Code                  | Sens                |
| --------------------- | ------------------- |
| `PRODUCT_CREATED`     | Produit créé        |
| `PRODUCT_UPDATED`     | Produit modifié     |
| `PRODUCT_DEACTIVATED` | Produit désactivé   |

### Stock — Catégories (`activity-log.ts:22-25`)
| Code               | Sens                 |
| ------------------ | -------------------- |
| `CATEGORY_CREATED` | Catégorie créée      |
| `CATEGORY_UPDATED` | Catégorie modifiée   |
| `CATEGORY_DELETED` | Catégorie supprimée  |

### Stock — Mouvements (`activity-log.ts:27-28`)
| Code                     | Sens                       |
| ------------------------ | -------------------------- |
| `STOCK_MOVEMENT_CREATED` | Mouvement de stock créé    |

### Comptoir — Sessions de caisse (`activity-log.ts:30-38`)
| Code                         | Sens                                          |
| ---------------------------- | --------------------------------------------- |
| `COMPTOIR_SESSION_OPENED`    | Ouverture de session                          |
| `COMPTOIR_SESSION_CLOSED`    | Fermeture de session                          |
| `SESSION_CLOSURE_REQUESTED`  | Demande de clôture                            |
| `SESSION_VALIDATED`          | Session validée                               |
| `SESSION_DISPUTED`           | Session contestée (écart litigieux)           |
| `SESSION_FORCE_CLOSED`       | Clôture forcée                                |
| `SESSION_CORRECTED`          | Session corrigée                              |
| `BLIND_VALIDATION_SUBMITTED` | Validation en aveugle soumise                 |

### Comptoir — Ventes (`activity-log.ts:40-42`)
| Code             | Sens             |
| ---------------- | ---------------- |
| `SALE_COMPLETED` | Vente finalisée  |
| `SALE_CANCELLED` | Vente annulée    |

### Comptoir — Mouvements de caisse (`activity-log.ts:44-45`)
| Code                   | Sens                          |
| ---------------------- | ----------------------------- |
| `CASH_MOVEMENT_CREATED` | Mouvement de caisse créé      |

### Comptoir — Intégrité & écarts (`activity-log.ts:47-49`)
| Code                          | Sens                            |
| ----------------------------- | ------------------------------- |
| `INTEGRITY_CHECK_PERFORMED`   | Contrôle d'intégrité effectué   |
| `DISCREPANCY_ALERT_TRIGGERED` | Alerte d'écart déclenchée       |

### Tickets / Périphériques (`activity-log.ts:51-56`)
| Code                              | Sens                                  |
| --------------------------------- | ------------------------------------- |
| `TICKET_PDF_DOWNLOADED`           | Ticket PDF téléchargé                 |
| `TICKET_THERMAL_PRINT_REQUESTED`  | Impression thermique demandée         |
| `CASH_DRAWER_OPENED`              | Tiroir-caisse ouvert                  |
| `CASH_DRAWER_OPEN_FAILED`         | Échec d'ouverture du tiroir-caisse    |
| `BARCODE_SCAN_NOT_FOUND`          | Code-barres scanné introuvable        |

### Synchronisation offline (`activity-log.ts:58-59`)
| Code                     | Sens                            |
| ------------------------ | ------------------------------- |
| `OFFLINE_SYNC_COMPLETED` | Synchronisation offline terminée |

### Paramètres (`activity-log.ts:61-62`)
| Code                 | Sens                  |
| -------------------- | --------------------- |
| `PARAMETRES_UPDATED` | Paramètres mis à jour |

### Taxes (`activity-log.ts:64-67`)
| Code           | Sens             |
| -------------- | ---------------- |
| `TAXE_CREATED` | Taxe créée       |
| `TAXE_UPDATED` | Taxe modifiée    |
| `TAXE_DELETED` | Taxe supprimée   |

### Modes de paiement (`activity-log.ts:69-72`)
| Code                     | Sens                       |
| ------------------------ | -------------------------- |
| `MODE_PAIEMENT_CREATED`  | Mode de paiement créé      |
| `MODE_PAIEMENT_UPDATED`  | Mode de paiement modifié   |
| `MODE_PAIEMENT_DELETED`  | Mode de paiement supprimé  |

> **Note d'affichage** : le composant `ActivityLogTable` ne fournit un libellé/couleur que pour un
> sous-ensemble d'actions (`ActivityLogTable.tsx:25-43`). Les codes non mappés s'affichent en
> brut avec un style neutre. À noter une divergence d'historique : la table d'affichage référence
> encore `CASH_SESSION_OPENED` / `CASH_SESSION_CLOSED` (`ActivityLogTable.tsx:39-40`) alors que le
> catalogue émet désormais `COMPTOIR_SESSION_OPENED` / `COMPTOIR_SESSION_CLOSED` — ces sessions
> s'affichent donc avec le libellé brut.

---

## 5. Consultation

### Endpoint

`GET /api/activity-logs` — `web/app/src/app/api/activity-logs/route.ts`.

### Permissions

- Garde via `requireRole("ADMIN", "MANAGER")` (`route.ts:5-6`). Sinon la réponse d'erreur de
  `requireRole` est renvoyée (401 non authentifié / 403 rôle insuffisant).
- La page `/activity-logs` applique la même règle côté serveur via
  `hasPermission(role, "activity_logs:consulter")`
  (`app/(dashboard)/activity-logs/page.tsx:28-33`).

### Pagination

| Paramètre  | Défaut | Bornes                          | Référence        |
| ---------- | ------ | ------------------------------- | ---------------- |
| `page`     | `1`    | min 1                           | `route.ts:9`     |
| `pageSize` | `20`   | min 1, **max 100**              | `route.ts:10`    |

Tri systématique `createdAt desc` (`route.ts:39`). La réponse renvoie
`{ data, total, page, pageSize }` (`route.ts:44`), `total` provenant d'un `count` parallèle
(`Promise.all`, `route.ts:31-42`).

### Filtres (`route.ts:11-29`)

| Param        | Effet                                                       |
| ------------ | ---------------------------------------------------------- |
| `action`     | Égalité sur `action`                                       |
| `actorId`    | Égalité sur `actorId`                                      |
| `entityType` | Égalité sur `entityType`                                   |
| `dateDebut`  | `createdAt >= dateDebut`                                   |
| `dateFin`    | `createdAt <= dateFin`                                     |

`dateDebut` et `dateFin` se combinent en une plage. Chaque log inclut l'acteur
(`actor: { id, nom, email }`) via `include` (`route.ts:34-36`).

### Visibilité de l'IP

L'adresse IP est **réservée aux ADMIN**. La page calcule `isAdmin = role === "ADMIN"` et passe
`showIp={isAdmin}` au composant (`page.tsx:33,165`). Dans `ActivityLogTable`, la colonne IP n'est
rendue que si `showIp` est vrai (`ActivityLogTable.tsx:89,126-130`) ; pour un MANAGER, la colonne
n'apparaît pas du tout.

### Affichage (`ActivityLogTable.tsx`)

- Colonnes : Date, Acteur (« Système » si pas d'acteur), Action (badge libellé+couleur), Entité
  (lien selon type), Résumé (extrait de `metadata`), IP (ADMIN seulement), Détail.
- Liens entité par type (`entityLink`, `ActivityLogTable.tsx:57-66`) : `Product` →
  `/stock/{id}`, `Category` → `/stock/categories`, `StockMovement` → `/stock/mouvements`,
  `User` → `/users/{id}`.
- Résumé dérivé de `metadata` (`summarize`, lignes 45-55) : champs `nom`, `reference`, `type`,
  `quantite`, `email`.
- Pagination par liens préservant les filtres de l'URL (`paginationHref`, lignes 71-76).
- Page de détail par log : `/activity-logs/[id]`
  (`app/(dashboard)/activity-logs/[id]/page.tsx`).

---

## 6. Tests existants

Dossier : `web/app/src/__tests__/activity-logs/` (Vitest).

### `logging.test.ts` — émission des logs
Vérifie que les API Routes appellent bien `logActivity` (mocké) avec le bon code d'action :

- `USER_CREATED` sur `POST /api/users`, `USER_DEACTIVATED` (passage `actif=false`),
  `USER_UPDATED` (mise à jour standard).
- `SALE_CANCELLED` sur `POST /api/ventes/[id]/annuler`.
- `COMPTOIR_SESSION_OPENED` sur `POST /api/comptoir/sessions`.
- `CASH_DRAWER_OPENED` / `CASH_DRAWER_OPEN_FAILED` selon le résultat d'ouverture du tiroir.
- `TICKET_THERMAL_PRINT_REQUESTED` à l'impression thermique.

### `api.test.ts` — endpoint `GET /api/activity-logs`
- `401` si non authentifié, `403` pour `CAISSIER`.
- Renvoie les logs pour `ADMIN` et pour `MANAGER`.
- Pagination, filtres `action`, `actorId`, plage de dates, `entityType`.
- `500` en cas d'erreur DB.

### `detail-page.test.ts` — page détail `/activity-logs/[id]`
- Redirige les non authentifiés et les `CAISSIER` (pas de permission).
- Renvoie les données pour `ADMIN` et `MANAGER`.
- Appelle `notFound()` si le log n'existe pas.
- Gère un `metadata` complet avec objets imbriqués.

---

## 7. Note architecture desktop (réplication cloud)

Dans la cible **desktop / multi-magasins**, le journal d'activité fait partie des données
**transactionnelles répliquées du nœud magasin vers le cloud** pour un audit centralisé. La
réplication est **append-only** (le cloud ingère, ne modifie jamais), via le pattern outbox
(`EventCaisse`) et l'idempotence par identifiant ; la cohérence est forte au sein du magasin et
**à terme** vers le cloud. Détails : `../../ARCHITECTURE_MVP.md` §7
(et §8 pour le transport).

---

*AerisPay — Journal d'activité · documentation dérivée du code (juin 2026).*
