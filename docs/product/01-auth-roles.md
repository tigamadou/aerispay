# Authentification, rôles & permissions

> **Source de vérité : le code.** Ce document décrit le comportement réellement
> implémenté dans `web/app/src/`. Les références sont au format `fichier:ligne`.
> En cas de divergence, le code prime.

---

## 1. Objectif

Le module d'authentification garantit que **seuls des utilisateurs authentifiés et
actifs** accèdent à AerisPay, et que chaque action sensible (gestion des comptes,
stock, sessions de caisse, annulation de vente, journal d'audit, paramètres) est
soumise à une **autorisation par rôle et par permission**.

Principes appliqués :

- **Pas d'inscription publique** : aucune route `register`. Les comptes sont créés
  exclusivement par un `ADMIN`.
- **Sessions JWT** signées, durée de vie bornée (8 h).
- **Mots de passe hachés** (bcrypt, coût 12), jamais renvoyés par l'API.
- **Comptes désactivables** (`actif=false`) : le login échoue immédiatement.
- **Matrice de permissions centralisée** (`lib/permissions.ts`), partagée par toutes
  les API Routes via les helpers `requireAuth` / `requireRole` / `hasPermission`.
- **Rate-limiting** des tentatives de connexion (anti brute-force).
- **Protection IDOR** : un caissier ne voit que ses propres ventes/sessions/tickets.

---

## 2. Rôles

Trois rôles, définis par l'enum Prisma `Role` (`prisma/schema.prisma:35-39`). Le rôle
par défaut d'un nouvel utilisateur est **`CAISSIER`** (`schema.prisma:21`).

| Rôle | Description | Portée |
|------|-------------|--------|
| `ADMIN` | Administrateur. Accès complet : gestion des comptes, stock, caisse (y compris clôture forcée et sessions correctives), paramètres, journaux. | Tout |
| `MANAGER` | Responsable de point de vente. Gère stock, sessions de caisse (y compris celles des autres et leur validation), mouvements/retraits/dépenses, annulation de ventes, rapports et journaux. **Ne gère pas** les comptes, ni la clôture forcée, ni les sessions correctives, ni les paramètres. | Point de vente |
| `CAISSIER` | Caissier. Vend et enregistre des mouvements de caisse manuels uniquement, sur **ses propres** sessions. | Sa caisse |

### Modèle `User` (`prisma/schema.prisma:16-33`)

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `String` (`cuid`) | Clé primaire |
| `nom` | `String` | |
| `email` | `String @unique` | Normalisé en minuscules/trim à la création et au login |
| `motDePasse` | `String` | Hash bcrypt — jamais exposé par l'API |
| `role` | `Role @default(CAISSIER)` | |
| `actif` | `Boolean @default(true)` | `false` = compte désactivé, login refusé |
| `createdAt` / `updatedAt` | `DateTime` | |

---

## 3. Matrice des permissions

Définie dans `web/app/src/lib/permissions.ts:24-59` (`ROLE_PERMISSIONS`). Le type
`Permission` énumère 15 permissions (`permissions.ts:7-22`).

| Permission | ADMIN | MANAGER | CAISSIER | Signification |
|------------|:-----:|:-------:|:--------:|---------------|
| `users:manage` | ✅ | ❌ | ❌ | Créer / modifier / désactiver des comptes |
| `stock:manage` | ✅ | ✅ | ❌ | Gérer produits, catégories, mouvements de stock |
| `comptoir:vendre` | ✅ | ✅ | ✅ | Vendre, ouvrir une session de caisse |
| `comptoir:gerer_session_autre` | ✅ | ✅ | ❌ | Agir sur la session d'un autre utilisateur |
| `comptoir:valider_session` | ✅ | ✅ | ❌ | Valider une session clôturée |
| `comptoir:force_close` | ✅ | ❌ | ❌ | Clôture forcée d'une session |
| `comptoir:session_corrective` | ✅ | ❌ | ❌ | Ouvrir une session corrective |
| `comptoir:verifier_integrite` | ✅ | ✅ | ❌ | Vérifier l'intégrité de la caisse |
| `comptoir:mouvement_manuel` | ✅ | ✅ | ✅ | Enregistrer un mouvement de caisse manuel |
| `comptoir:retrait_caisse` | ✅ | ✅ | ❌ | Retrait d'espèces |
| `comptoir:depense` | ✅ | ✅ | ❌ | Enregistrer une dépense |
| `ventes:annuler` | ✅ | ✅ | ❌ | Annuler une vente |
| `activity_logs:consulter` | ✅ | ✅ | ❌ | Consulter le journal d'audit |
| `rapports:consulter` | ✅ | ✅ | ❌ | Consulter les rapports / lister les mouvements |
| `parametres:manage` | ✅ | ❌ | ❌ | Gérer les paramètres |

`CAISSIER` ne dispose que de **deux** permissions : `comptoir:vendre` et
`comptoir:mouvement_manuel` (`permissions.ts:55-58`).

### Helpers d'autorisation (`lib/permissions.ts`)

| Fonction | Signature | Rôle | Référence |
|----------|-----------|------|-----------|
| `hasPermission` | `(role, permission) => boolean` | Teste une permission contre la matrice | `permissions.ts:61-63` |
| `hasRole` | `(userRole, requiredRoles[]) => boolean` | Teste l'appartenance à une liste de rôles | `permissions.ts:65-67` |
| `requireAuth` | `() => Promise<AuthResult>` | Vérifie la session ; renvoie `{authenticated:false, response: 401}` sinon | `permissions.ts:82-99` |
| `requireRole` | `(...roles) => Promise<AuthResult>` | `requireAuth` + vérifie le rôle ; renvoie `403` sinon | `permissions.ts:101-114` |

`AuthResult` est une union discriminée : soit `{ authenticated: true, user }`, soit
`{ authenticated: false, response }`. Les API Routes font systématiquement
`if (!result.authenticated) return result.response;`.

---

## 4. Authentification

Configuration NextAuth.js v5 : `web/app/src/auth.ts`.

| Aspect | Implémentation | Référence |
|--------|----------------|-----------|
| Provider | `Credentials` (email + mot de passe) | `auth.ts:18-68` |
| Secret | `AUTH_SECRET` puis fallback `NEXTAUTH_SECRET` | `auth.ts:10` |
| Stratégie de session | **JWT** | `auth.ts:11-12` |
| Durée de vie | **8 heures** (`maxAge: 8 * 60 * 60`) | `auth.ts:13` |
| Page de login | `/login` | `auth.ts:15-17` |
| `trustHost` | `true` | `auth.ts:9` |
| Hachage / vérification | `bcryptjs` — `compare()` au login, `hash()` coût 12 à la création | `auth.ts:3,43` ; `api/users/route.ts:7,69` |

### Flux `authorize` (`auth.ts:25-67`)

1. Vérifie que `email` et `password` sont des chaînes non vides → sinon `null`.
2. Normalise l'email (`trim().toLowerCase()`) puis `findUnique`.
3. Si l'utilisateur est **introuvable ou inactif** (`!user.actif`) → log
   `AUTH_LOGIN_FAILED` (`reason: unknown_email` ou `inactive_account`) puis `null`.
4. `compare(password, user.motDePasse)` ; si invalide → log `AUTH_LOGIN_FAILED`
   (`reason: invalid_password`) puis `null`.
5. Succès → log `AUTH_LOGIN_SUCCESS`, renvoie `{ id, name, email, role }`.

### Propagation du rôle dans le JWT/session

- `callbacks.jwt` injecte `id`, `role`, `email`, `name` dans le token (`auth.ts:80-88`).
- `callbacks.session` recopie ces champs dans `session.user` (`auth.ts:89-97`), ce qui
  permet à `requireAuth` de lire `session.user.role`.
- `events.signOut` journalise `AUTH_LOGOUT` (`auth.ts:70-78`).

### Rate-limiting (`lib/rate-limit.ts` + `middleware.ts`)

- Limiteur **en mémoire de processus**, fenêtre glissante par clé (IP).
- `authRateLimiter` : **5 tentatives / 60 s** (`rate-limit.ts:92-96`).
- Appliqué dans le middleware aux requêtes `POST /api/auth/*` (`middleware.ts:12-34`).
  L'IP est lue depuis `x-forwarded-for` puis `x-real-ip`, sinon `"unknown"`.
- Dépassement → réponse **429** avec en-tête `Retry-After` (secondes).
- Nettoyage périodique des entrées expirées toutes les 60 s, `interval.unref()` pour ne
  pas bloquer la sortie du process (`rate-limit.ts:44-59`).
- **Limite connue (mono-instance)** : le store étant une `Map` locale, en déploiement
  multi-instances la limite effective est multipliée par le nombre d'instances. Un
  backend partagé (Redis) serait requis pour un rate-limiting distribué
  (`rate-limit.ts:5-11`).

### Middleware d'accès (`middleware.ts`)

- Basé sur `auth((req) => …)` (`middleware.ts:5`).
- Les routes `/api/*` passent toujours (`NextResponse.next()`) — l'autorisation fine
  est faite dans chaque route via `requireRole` (`middleware.ts:36-38`).
- Pages : utilisateur non connecté → redirigé vers `/login` ; utilisateur connecté sur
  `/login` → redirigé vers `/` (`middleware.ts:40-46`).
- `matcher` exclut les assets statiques (`middleware.ts:51-55`).

---

## 5. Endpoints de gestion des utilisateurs

`web/app/src/app/api/users/` — **réservés à `ADMIN`** (`requireRole("ADMIN")`).

| Méthode / Chemin | Permission | Validation | Comportement | Référence |
|------------------|-----------|------------|--------------|-----------|
| `GET /api/users` | `ADMIN` | `page`/`pageSize` (1–100, défaut 20) | Liste paginée, mots de passe retirés (`sanitizeUser`) | `api/users/route.ts:15-43` |
| `POST /api/users` | `ADMIN` | `createUserSchema` (Zod) | Crée un compte ; **409** si email déjà pris ; hash bcrypt(12) ; log `USER_CREATED` ; renvoie **201** | `api/users/route.ts:45-95` |
| `GET /api/users/[id]` | `ADMIN` | — | Renvoie un compte ; **404** si introuvable | `api/users/[id]/route.ts:15-34` |
| `PUT /api/users/[id]` | `ADMIN` | `updateUserSchema` (Zod) | Mise à jour partielle (`nom`, `email`, `role`, `actif`, `motDePasse`) ; re-hash si mot de passe fourni ; log `USER_DEACTIVATED` si passage `actif:true→false`, sinon `USER_UPDATED` | `api/users/[id]/route.ts:36-94` |

> Pas de `DELETE` : la suppression d'un compte se fait par **désactivation**
> (`actif=false`) via `PUT`, ce qui bloque le login (cf. §4).

### Schémas de validation (`lib/validations/user.ts`)

| Champ | Règle | Référence |
|-------|-------|-----------|
| `nom` | 2–100 caractères | `user.ts:4-7,22-26` |
| `email` | format email, `trim().toLowerCase()` | `user.ts:8-11,27-31` |
| `motDePasse` | 8–72 caractères | `user.ts:12-15,32-36` |
| `role` | `ADMIN` \| `MANAGER` \| `CAISSIER` | `user.ts:16-18,37-41` |
| `actif` | booléen (update uniquement) | `user.ts:42` |

À la création, tous les champs sont requis ; en mise à jour, tous sont `optional`.

### Réponses normalisées

- Succès : `{ data, … }` (listing ajoute `total`, `page`, `pageSize`).
- Erreur : `{ error: string, details? }`. Codes utilisés : **400** (Zod), **401**
  (non authentifié), **403** (accès refusé), **404** (introuvable), **409** (email
  existant), **500** (erreur serveur). Toutes les opérations DB sont en `try/catch`.

---

## 6. Règles clés

1. **Pas d'inscription publique.** Aucune route `register` ; la création passe
   uniquement par `POST /api/users` réservé à `ADMIN`.
2. **Création/gestion des comptes = `ADMIN` uniquement** (`requireRole("ADMIN")` sur
   les 4 handlers de `api/users`).
3. **Comptes inactifs bloqués au login** (`!user.actif` → `null`, `auth.ts:35`).
4. **Mots de passe jamais exposés** : `sanitizeUser` retire `motDePasse` de toute
   réponse (`api/users/route.ts:9-13`).
5. **Protection IDOR** : sur les routes GET de lecture, un `CAISSIER` ne peut accéder
   qu'à ses propres ressources ; `ADMIN`/`MANAGER` accèdent à tout. Le listing des
   sessions filtre par `userId` pour un caissier (cf. tests §7).
6. **Autorisation côté serveur uniquement** : le middleware laisse passer `/api/*`,
   chaque route applique `requireRole` / `hasPermission`.
7. **Sécurité du seed** : en production, le seed exige `SEED_ADMIN_PASSWORD` (sinon il
   lève une erreur) — pas de mot de passe admin par défaut en prod.

---

## 7. Tests existants

Sous `web/app/src/__tests__/` :

| Fichier | Couverture |
|---------|-----------|
| `auth/authorize.test.ts` | Flux `authorize` : succès et rôle renvoyé (CAISSIER/MANAGER), normalisation email (trim/lowercase), utilisateur introuvable, **compte inactif**, mauvais mot de passe, credentials manquants/vides → `null` |
| `caisse/permissions.test.ts` | Vérifie que la matrice `ROLE_PERMISSIONS` correspond à la spec du module caisse (par rôle et par permission) |
| `security/idor-get-routes.test.ts` | IDOR sur `GET /api/ventes/[id]`, `GET /api/comptoir/sessions/[id]`, listing des sessions (filtre `userId` caissier), `GET /api/tickets/[id]/pdf` : caissier B → **403**, propriétaire → **200**, ADMIN/MANAGER → **200** |
| `security/session-opening-roles.test.ts` | `POST /api/comptoir/sessions` : ADMIN, MANAGER et CAISSIER peuvent ouvrir (ont `comptoir:vendre`) ; non authentifié refusé (P1-008) |
| `security/validate-session-roles.test.ts` | `POST …/sessions/[id]/validate` : CAISSIER ne peut pas valider la session d'un autre → **403** ; MANAGER et ADMIN → **200** (P2-007) |
| `security/caisse-mouvements-permission.test.ts` | `POST …/mouvements` : tous les rôles peuvent poster (ont `comptoir:mouvement_manuel`) ; **GET** réservé à ceux ayant `rapports:consulter` → CAISSIER refusé, ADMIN/MANAGER OK (P1-007) |
| `security/seed-password.test.ts` | En production, le seed lève une erreur si `SEED_ADMIN_PASSWORD` est absent (P1-010) |

---

## 8. Note — architecture desktop (cible)

Voir `docs/architecture-desktop/` (notamment `06-securite.md`,
`01-modele-trois-niveaux.md`, `05-synchronisation-cloud.md`).

- **`NEXTAUTH_SECRET` et clés serveur vivent uniquement sur le nœud magasin**, jamais
  sur les caisses (postes Electron). Le **login est servi par le nœud magasin** ; les
  caisses ne détiennent qu'un token de magasin scopé à leur poste, stocké dans le
  trousseau de l'OS.
- **Les utilisateurs / rôles / hash de mot de passe sont des données de référence
  descendantes** : le **cloud fait foi** et les diffuse vers les magasins
  (`cloud → magasin`). La **désactivation d'un compte est propagée** depuis le cloud.
  Le transactionnel (ventes, sessions) remonte en sens inverse (magasin fait foi).
- Conséquence : l'implémentation actuelle (NextAuth + table `users` locale) correspond
  au rôle du **nœud magasin** dans la cible multi-niveaux ; la création de comptes par
  `ADMIN` sera, à terme, alimentée/synchronisée depuis le cloud plutôt que purement
  locale.
