# AerisPay — Référence des Pages & API

> Document de référence **dérivé du code réel** (branche `feat/audit_refacto`).
> Source : `web/app/src/app/`.
> Les rôles applicatifs sont `ADMIN`, `MANAGER`, `CAISSIER` (enum Prisma `Role`).

---

## 0. Modèle d'autorisation

Deux mécanismes coexistent (définis dans `web/app/src/lib/permissions.ts`) :

- **`requireAuth()`** : exige uniquement une session valide (n'importe quel rôle authentifié), sinon `401 Non authentifié`.
- **`requireRole(...roles)`** : exige un rôle parmi la liste, sinon `403 Accès refusé`.
- **`hasPermission(role, permission)`** : vérification fine basée sur la matrice `ROLE_PERMISSIONS` (appelée **après** `requireAuth`, renvoie `403` si refusée).

### Matrice permission → rôles (`ROLE_PERMISSIONS`)

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

> Les pages côté serveur utilisent `auth()` (NextAuth v5) + `redirect()` si l'accès est refusé.

---

## 1. Pages

### 1.1 Authentification — `web/app/src/app/(auth)/`

| Route | Rôle requis | Description |
|---|---|---|
| `/login` | Public | Page de connexion (credentials NextAuth). |

### 1.2 Tableau de bord & administration — `web/app/src/app/(dashboard)/`

| Route | Rôle requis | Description |
|---|---|---|
| `/` | `rapports:consulter` (ADMIN, MANAGER) | Tableau de bord KPI ; le CAISSIER est redirigé. |
| `/users` | ADMIN | Liste des comptes utilisateurs. |
| `/users/nouveau` | ADMIN | Création d'un compte utilisateur. |
| `/users/[id]` | ADMIN | Détail / édition d'un utilisateur. |
| `/activity-logs` | `activity_logs:consulter` (ADMIN, MANAGER) | Journal d'audit paginé. |
| `/activity-logs/[id]` | `activity_logs:consulter` (ADMIN, MANAGER) | Détail d'une entrée du journal. |
| `/parametres` | `parametres:manage` (ADMIN) | Paramètres généraux du commerce (lien vers la page Modes de paiement). |
| `/modes-paiement` | `parametres:manage` (ADMIN) | Gestion des modes de paiement (libellé, activation, ordre). Page dédiée (extraite des paramètres). |
| `/taxes` | `parametres:manage` (ADMIN) | Gestion des taxes (TVA / taux). |

### 1.3 Stock — `web/app/src/app/(dashboard)/stock/`

| Route | Rôle requis | Description |
|---|---|---|
| `/stock` | `stock:manage` (ADMIN, MANAGER) | Liste des produits + alertes de rupture. |
| `/stock/nouveau` | `stock:manage` (ADMIN, MANAGER) | Création d'un produit. |
| `/stock/[id]` | `stock:manage` (ADMIN, MANAGER) | Détail / édition d'un produit. |
| `/stock/categories` | `stock:manage` (ADMIN, MANAGER) | Gestion des catégories. |
| `/stock/mouvements` | `stock:manage` (ADMIN, MANAGER) | Historique des mouvements de stock. |

### 1.4 Comptoir (POS) — `web/app/src/app/(dashboard)/comptoir/`

| Route | Rôle requis | Description |
|---|---|---|
| `/comptoir` | Authentifié (gère CAISSIER vs ADMIN/MANAGER) | Interface point de vente principale. |
| `/comptoir/sessions` | Authentifié (filtre selon `comptoir:gerer_session_autre`) | Liste des sessions de caisse. |
| `/comptoir/sessions/[id]` | Authentifié (actions selon permissions) | Détail d'une session : clôture, validation, force-close, intégrité. |
| `/comptoir/ventes` | Authentifié (CAISSIER voit ses ventes) | Liste des ventes. |
| `/comptoir/ventes/[id]` | Authentifié (annulation si `ventes:annuler`) | Détail d'une vente + annulation. |
| `/comptoir/tickets/[id]` | Authentifié | Aperçu / impression d'un ticket. |
| `/comptoir/discrepancies` | `rapports:consulter` (ADMIN, MANAGER) | Écarts de caisse (discrepancies). |
| `/comptoir/discrepancies/recurring` | `rapports:consulter` (ADMIN, MANAGER) | Écarts récurrents (par caissier/cause). |
| `/comptoir/ecarts` | `rapports:consulter` (ADMIN, MANAGER) | Vue synthèse des écarts. |

### 1.5 Caisse — `web/app/src/app/(dashboard)/caisse/`

| Route | Rôle requis | Description |
|---|---|---|
| `/caisse` | `rapports:consulter` (ADMIN, MANAGER) | Vue des caisses et soldes. |
| `/caisse/mouvements` | `rapports:consulter` (ADMIN, MANAGER) | Mouvements de caisse. |
| `/caisse/mouvements/nouveau` | `rapports:consulter` (ADMIN, MANAGER) | Saisie d'un mouvement de caisse. |

### 1.6 Terminaux de caisse — `web/app/src/app/(dashboard)/terminaux/`

> Gestion des **terminaux/postes de caisse** (≠ module de caisse). Lecture ADMIN+MANAGER ; créer / renommer / (dés)activer / enrôler / révoquer un jeton = ADMIN seul (actions masquées pour MANAGER).

| Route | Rôle requis | Description |
|---|---|---|
| `/terminaux` | `rapports:consulter` (ADMIN, MANAGER) | Liste des terminaux + état (session ouverte, caissier, solde espèces). |
| `/terminaux/nouveau` | ADMIN | Création d'un terminal (code + nom). Le **code est pré-suggéré** automatiquement (prochain `P<N>` libre) et reste **modifiable** (ex. code parlant `BAR`). |
| `/terminaux/[id]` | `rapports:consulter` (ADMIN, MANAGER) | Détail : renommer/(dés)activer (ADMIN), enrôlement desktop (code + jetons), liens soldes/mouvements/sessions. |

---

## 2. API

> Conventions communes en §3. Permission indiquée = garde explicite dans le `route.ts`.

### 2.1 Authentification

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth | Handlers NextAuth v5 (sign-in, callbacks, session). |

Fichier : `web/app/src/app/api/auth/[...nextauth]/route.ts`

### 2.2 Utilisateurs

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/users` | `requireRole(ADMIN)` | Liste des utilisateurs. |
| POST | `/api/users` | `requireRole(ADMIN)` | Création d'un utilisateur. |
| GET | `/api/users/[id]` | `requireRole(ADMIN)` | Détail d'un utilisateur. |
| PUT | `/api/users/[id]` | `requireRole(ADMIN)` | Mise à jour / désactivation. |

Fichiers : `web/app/src/app/api/users/route.ts`, `users/[id]/route.ts`

### 2.3 Journal d'activité

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/activity-logs` | `requireRole(ADMIN, MANAGER)` | Liste paginée du journal d'audit. |

Fichier : `web/app/src/app/api/activity-logs/route.ts`

### 2.4 Produits, Catégories & Stock

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/produits` | `requireAuth` | Liste / recherche des produits. |
| POST | `/api/produits` | `requireRole(ADMIN, MANAGER)` | Création d'un produit. |
| GET | `/api/produits/[id]` | `requireAuth` | Détail d'un produit. |
| PUT | `/api/produits/[id]` | `requireRole(ADMIN, MANAGER)` | Mise à jour d'un produit. |
| DELETE | `/api/produits/[id]` | `requireRole(ADMIN, MANAGER)` | Suppression d'un produit. |
| GET | `/api/categories` | `requireAuth` | Liste des catégories. |
| POST | `/api/categories` | `requireRole(ADMIN, MANAGER)` | Création d'une catégorie. |
| PUT | `/api/categories/[id]` | `requireRole(ADMIN, MANAGER)` | Mise à jour d'une catégorie. |
| DELETE | `/api/categories/[id]` | `requireRole(ADMIN, MANAGER)` | Suppression d'une catégorie. |
| GET | `/api/stock/alertes` | `requireAuth` | Produits en alerte de rupture. |
| GET | `/api/stock/mouvements` | `requireRole(ADMIN, MANAGER)` | Liste des mouvements de stock. |
| POST | `/api/stock/mouvements` | `requireRole(ADMIN, MANAGER)` | Création d'un mouvement de stock. |

Fichiers : `produits/route.ts`, `produits/[id]/route.ts`, `categories/route.ts`, `categories/[id]/route.ts`, `stock/alertes/route.ts`, `stock/mouvements/route.ts`

### 2.5 Ventes & Tickets

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/ventes` | `requireAuth` (CAISSIER → ses ventes uniquement) | Liste des ventes filtrable (userId, dates). |
| POST | `/api/ventes` | `requireAuth` | Création d'une vente (transaction + décrément stock). |
| GET | `/api/ventes/[id]` | `requireAuth` (CAISSIER → sa vente) | Détail d'une vente. |
| POST | `/api/ventes/[id]/annuler` | `requireRole(ADMIN, MANAGER)` | Annulation d'une vente. |
| GET | `/api/tickets/[id]/pdf` | `requireAuth` (CAISSIER → son ticket) | Génération PDF du ticket. |
| POST | `/api/tickets/[id]/print` | `requireAuth` | Impression thermique ESC/POS du ticket. |

Fichiers : `ventes/route.ts`, `ventes/[id]/route.ts`, `ventes/[id]/annuler/route.ts`, `tickets/[id]/pdf/route.ts`, `tickets/[id]/print/route.ts`

### 2.6 Comptoir — Sessions

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/comptoir/sessions` | `requireAuth` (CAISSIER → ses sessions) | Liste des sessions de caisse. |
| POST | `/api/comptoir/sessions` | `requireAuth` + `hasPermission(comptoir:vendre)` | Ouverture d'une session. |
| GET | `/api/comptoir/sessions/[id]` | `requireAuth` (CAISSIER → sa session) | Détail d'une session. |
| PUT | `/api/comptoir/sessions/[id]` | `requireAuth` (ADMIN/MANAGER pour session d'autrui) | Mise à jour d'une session. |
| POST | `/api/comptoir/sessions/[id]/closure` | `requireAuth` (ADMIN/MANAGER) | Clôture de session (comptage). |
| DELETE | `/api/comptoir/sessions/[id]/closure` | `requireAuth` (ADMIN/MANAGER) | Annulation/retour arrière de la clôture. |
| POST | `/api/comptoir/sessions/[id]/validate` | `requireAuth` + `hasPermission(comptoir:valider_session)` | Validation managériale de la session. |
| POST | `/api/comptoir/sessions/[id]/verify` | `requireAuth` + `hasPermission(comptoir:verifier_integrite)` | Vérification d'intégrité de la session. |
| POST | `/api/comptoir/sessions/[id]/correct` | `requireRole(ADMIN)` | Session corrective. |
| POST | `/api/comptoir/sessions/[id]/force-close` | `requireRole(ADMIN)` | Clôture forcée. |
| GET | `/api/comptoir/sessions/[id]/movements` | `requireAuth` | Mouvements d'une session. |
| GET | `/api/comptoir/sessions/[id]/z-report` | `requireAuth` + `hasPermission(rapports:consulter)` | Rapport Z de clôture. |

Fichiers : `comptoir/sessions/route.ts`, `comptoir/sessions/[id]/route.ts`, `.../closure/route.ts`, `.../validate/route.ts`, `.../verify/route.ts`, `.../correct/route.ts`, `.../force-close/route.ts`, `.../movements/route.ts`, `.../z-report/route.ts`

### 2.7 Comptoir — Mouvements, Écarts & Synchronisation

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/comptoir/movements` | `requireAuth` (CAISSIER → ses mouvements) | Liste des mouvements de caisse comptoir. |
| POST | `/api/comptoir/movements` | `requireAuth` + `hasPermission(comptoir:mouvement_manuel)` | Création d'un mouvement manuel. |
| GET | `/api/comptoir/discrepancies` | `requireAuth` + `hasPermission(rapports:consulter)` | Liste des écarts de caisse. |
| GET | `/api/comptoir/discrepancies/recurring` | `requireAuth` + `hasPermission(rapports:consulter)` | Écarts récurrents agrégés. |
| POST | `/api/comptoir/sync` | `requireAuth` | Synchronisation des données comptoir (offline → serveur). |

Fichiers : `comptoir/movements/route.ts`, `comptoir/discrepancies/route.ts`, `comptoir/discrepancies/recurring/route.ts`, `comptoir/sync/route.ts`

### 2.8 Terminaux de caisse

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/terminaux` | `requireAuth` + `hasPermission(rapports:consulter)` | Liste des terminaux. Paramètres optionnels : `includeInactive=1` (inclut les terminaux désactivés), `state=1` (enrichit chaque terminal de sa session ouverte `{ caissier, ouvertureAt }` et de son `soldeEspeces`). |
| POST | `/api/terminaux` | `requireRole(ADMIN)` | Création d'un terminal (`{ code, nom, active? }`). |
| PUT | `/api/terminaux/[id]` | `requireRole(ADMIN)` | Renommer (`nom`) / (dés)activer (`active`). Refuse la désactivation si une session est ouverte (409). |
| DELETE | `/api/terminaux/[id]` | `requireRole(ADMIN)` | Désactivation (passe `active:false`). |
| GET | `/api/terminaux/[id]/tokens` | `requireRole(ADMIN)` | Liste des jetons de poste (`StoreToken`) actifs (jamais le hash). |
| DELETE | `/api/terminaux/[id]/tokens/[tokenId]` | `requireRole(ADMIN)` | Révocation d'un jeton de poste (journal `STORE_TOKEN_REVOKED`). |
| GET | `/api/terminaux/[id]/mouvements` | `requireAuth` + `hasPermission(rapports:consulter)` | Mouvements d'un terminal. |
| POST | `/api/terminaux/[id]/mouvements` | `requireAuth` + `hasPermission(comptoir:mouvement_manuel)` | Saisie d'un mouvement de caisse. |
| GET | `/api/terminaux/[id]/soldes` | `requireAuth` + `hasPermission(rapports:consulter)` | Soldes (théorique/réel) d'un terminal. |

Fichiers : `terminaux/route.ts`, `terminaux/[id]/route.ts`, `terminaux/[id]/tokens/route.ts`, `terminaux/[id]/tokens/[tokenId]/route.ts`, `terminaux/[id]/mouvements/route.ts`, `terminaux/[id]/soldes/route.ts`

### 2.8 bis Enrôlement des postes (ADR-007)

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| POST | `/api/enrollment` | `requireRole(ADMIN)` | Émet un **code d'enrôlement à usage unique** pour un terminal pré-créé (`{ terminalId, label?, ttlMinutes? }` → `{ enrollmentToken, terminalId, codePoste, expiresAt }`). Code en clair renvoyé une seule fois. **`409`** si le terminal a déjà un jeton de magasin actif (règle 1:1, voir ci-dessous). |
| POST | `/api/enrollment/exchange` | Public (auth = le code) | Le poste **échange** le code (`{ token, nom? }`) : consomme le code, (re)nomme la caisse, émet un **token de magasin** (`{ storeToken, terminalId, codePoste, nom }`). `401` code invalide/expiré/consommé ; `422` caisse inactive ; **`409`** si un jeton actif existe déjà pour le terminal (garde 1:1). |

Fichiers : `enrollment/route.ts`, `enrollment/exchange/route.ts` ; services `lib/services/enrollment-token.ts`, `lib/services/store-token.ts`.

> **Règle 1:1 — un terminal n'est associé qu'à un seul poste à la fois.** « Associé » = le terminal possède un `StoreToken` **non révoqué**. Tant que c'est le cas, la génération d'un code d'enrôlement est refusée (`409`) et le bouton « Enrôler » est désactivé côté UI (message invitant à révoquer le jeton). Pour appairer une autre machine, l'admin **révoque** d'abord le jeton existant (`DELETE …/tokens/[tokenId]`), ce qui libère le terminal. L'échange applique la même garde en défense en profondeur (cas de deux codes générés puis échangés concurremment).

### 2.9 Périphériques

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| POST | `/api/cash-drawer/open` | `requireAuth` | Ouverture du tiroir-caisse (impulsion ESC/POS). |

Fichier : `cash-drawer/open/route.ts`

### 2.10 Paramètres, Taxes & Upload

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/parametres` | `requireAuth` | Lecture des paramètres généraux. |
| PUT | `/api/parametres` | `requireRole(ADMIN)` | Mise à jour des paramètres. |
| GET | `/api/parametres/modes-paiement` | `requireAuth` | Liste des modes de paiement. |
| POST | `/api/parametres/modes-paiement` | `requireRole(ADMIN)` | Création d'un mode de paiement. |
| PUT | `/api/parametres/modes-paiement/[code]` | `requireRole(ADMIN)` | Mise à jour d'un mode de paiement. |
| DELETE | `/api/parametres/modes-paiement/[code]` | `requireRole(ADMIN)` | Suppression d'un mode de paiement. |
| GET | `/api/taxes` | `requireAuth` | Liste des taxes. |
| POST | `/api/taxes` | `requireRole(ADMIN)` | Création d'une taxe. |
| PUT | `/api/taxes/[id]` | `requireRole(ADMIN)` | Mise à jour d'une taxe. |
| DELETE | `/api/taxes/[id]` | `requireRole(ADMIN)` | Suppression d'une taxe. |
| POST | `/api/upload` | `requireRole(ADMIN, MANAGER)` | Téléversement d'un fichier (ex. image produit). |
| DELETE | `/api/upload` | `requireRole(ADMIN, MANAGER)` | Suppression d'un fichier téléversé. |

Fichiers : `parametres/route.ts`, `parametres/modes-paiement/route.ts`, `parametres/modes-paiement/[code]/route.ts`, `taxes/route.ts`, `taxes/[id]/route.ts`, `upload/route.ts`

### 2.11 Tableau de bord

| Méthode | Chemin | Permission | Description |
|---|---|---|---|
| GET | `/api/dashboard/kpis` | `requireAuth` (KPI filtrés selon rôle) | Indicateurs : CA, ventes, alertes ; CAISSIER → périmètre restreint. |

Fichier : `dashboard/kpis/route.ts`

---

## 3. Conventions API

- **Authentification** : chaque route appelle `requireAuth()` / `requireRole()` (helpers de `lib/permissions.ts`, basés sur `auth()` de NextAuth v5). Aucune route métier n'est publique hormis `/api/auth/[...nextauth]`.
- **Autorisation fine** : après `requireAuth()`, certaines routes appellent `hasPermission(role, permission)` et renvoient `403` si la permission manque.
- **Validation des entrées** : les corps de requête sont validés avec **Zod** (`schema.safeParse(body)`) avant tout accès Prisma ; en cas d'échec → `400` avec `{ error: "Données invalides", details: parsed.error.flatten() }`.
- **Réponses succès** : `Response.json({ data: T }, { status: 200 | 201 })` (parfois `{ data, message }`).
- **Réponses erreur** : `Response.json({ error: string, code?: string }, { status })`. Codes usuels : `401 Non authentifié`, `403 Accès refusé`, `400` (validation), `404` (introuvable), `500 Erreur serveur`.
- **try/catch** : toute opération DB est encapsulée ; les erreurs serveur sont loggées (`console.error('[METHOD /api/...]', error)`) puis renvoient `500`.
- **Transactions** : opérations multi-tables (vente + stock, clôture, mouvements) via `prisma.$transaction()`.
- **Filtrage par rôle** : les CAISSIER ne voient que leurs propres ventes / sessions / mouvements (filtre `where.userId = result.user.id`).

---

*Référence générée à partir du code source — `web/app/src/app/`. Voir aussi `docs/product/01-auth-roles.md`.*
