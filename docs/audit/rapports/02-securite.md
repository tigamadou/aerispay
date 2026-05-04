# Rapport d'Audit -- Securite & Pentest Simule

> **Agent :** Agent 2 (Audit OWASP + Pentest simule)
> **Date :** 2026-05-04
> **Statut :** TERMINE

---

## Resume executif

L'application AerisPay presente une architecture de securite globalement coherente : chaque route API verifie l'authentification, les roles sont appliques via un systeme de permissions centralise (`requireAuth` / `requireRole` / `hasPermission`), les mots de passe sont hashes avec bcrypt (12 rounds), les inputs sont valides par Zod, et Prisma ORM protege contre l'injection SQL. Le conteneur Docker de production tourne sous un utilisateur non-root.

Cependant, l'audit revele **14 vulnerabilites** dont **2 critiques**, **4 hautes**, **5 moyennes** et **3 basses**. Les problemes les plus graves sont :

1. **CRITIQUE** : Le fichier `.env` racine contenant des mots de passe MySQL et un `NEXTAUTH_SECRET` statique est commit dans Git.
2. **CRITIQUE** : Aucun mecanisme de rate-limiting n'existe sur l'endpoint d'authentification, permettant le brute-force.
3. **HAUTE** : L'ouverture de session comptoir est restreinte au role `CAISSIER` uniquement via `requireRole("CAISSIER")`, excluant ADMIN et MANAGER.
4. **HAUTE** : Absence totale de headers de securite HTTP (CSP, HSTS, X-Frame-Options).
5. **HAUTE** : Plusieurs routes manquent de controle d'ownership (IDOR) permettant a un utilisateur authentifie d'acceder aux donnees d'un autre.

---

## 1. OWASP Top 10

### A01 -- Broken Access Control

#### 1.1 Verification auth par route (tableau exhaustif)

| Route | Methode | Auth check | Role requis (spec) | Role effectif (code) | Correct ? |
|-------|---------|------------|-------------------|---------------------|-----------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth interne | Public | Public | OUI |
| `/api/users` | GET | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/users` | POST | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/users/[id]` | GET | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/users/[id]` | PUT | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/activity-logs` | GET | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/produits` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/produits` | POST | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/produits/[id]` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/produits/[id]` | PUT | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/produits/[id]` | DELETE | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/categories` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/categories` | POST | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/categories/[id]` | PUT | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/categories/[id]` | DELETE | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/stock/mouvements` | GET | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/stock/mouvements` | POST | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/stock/alertes` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/ventes` | GET | `requireAuth()` + filtre userId si CAISSIER | Tous (filtre par role) | Tous (filtre par role) | OUI |
| `/api/ventes` | POST | `requireAuth()` | Tous auth (comptoir:vendre) | Tous auth | VOIR SECU-005 |
| `/api/ventes/[id]` | GET | `requireAuth()` | Tous auth | Tous auth | VOIR SECU-006 |
| `/api/ventes/[id]/annuler` | POST | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/comptoir/sessions` | GET | `requireAuth()` | Tous auth | Tous auth | VOIR SECU-007 |
| `/api/comptoir/sessions` | POST | `requireRole("CAISSIER")` | CAISSIER | **CAISSIER seul** | VOIR SECU-004 |
| `/api/comptoir/sessions/[id]` | GET | `requireAuth()` | Tous auth | Tous auth | VOIR SECU-007 |
| `/api/comptoir/sessions/[id]` | PUT | `requireAuth()` + ownership check | Owner ou ADMIN/MANAGER | Owner ou ADMIN/MANAGER | OUI |
| `/api/comptoir/sessions/[id]/closure` | POST | `requireAuth()` + ownership check | Owner ou ADMIN/MANAGER | Owner ou ADMIN/MANAGER | OUI |
| `/api/comptoir/sessions/[id]/closure` | DELETE | `requireAuth()` + ownership check | Owner ou ADMIN/MANAGER | Owner ou ADMIN/MANAGER | OUI |
| `/api/comptoir/sessions/[id]/validate` | POST | `requireAuth()` + `hasPermission("comptoir:valider_session")` ou CAISSIER | ADMIN+MANAGER+CAISSIER (pas le proprio) | ADMIN+MANAGER+CAISSIER (pas le proprio) | OUI |
| `/api/comptoir/sessions/[id]/force-close` | POST | `requireRole("ADMIN")` + re-auth mdp | ADMIN | ADMIN | OUI |
| `/api/comptoir/sessions/[id]/correct` | POST | `requireRole("ADMIN")` + re-auth mdp | ADMIN | ADMIN | OUI |
| `/api/comptoir/sessions/[id]/verify` | POST | `requireAuth()` + `hasPermission("comptoir:verifier_integrite")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/comptoir/sessions/[id]/z-report` | GET | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/comptoir/sessions/[id]/movements` | GET | `requireAuth()` | Tous auth | Tous auth | VOIR SECU-007 |
| `/api/comptoir/movements` | GET | `requireAuth()` + filtre CAISSIER | Tous (filtre par role) | Tous (filtre par role) | OUI |
| `/api/comptoir/movements` | POST | `requireAuth()` + `hasPermission("comptoir:mouvement_manuel")` | CAISSIER+MANAGER+ADMIN | CAISSIER+ADMIN+MANAGER | OUI |
| `/api/comptoir/discrepancies` | GET | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/comptoir/discrepancies/recurring` | GET | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/comptoir/sync` | POST | `requireAuth()` | Tous auth | Tous auth | VOIR SECU-008 |
| `/api/tickets/[id]/pdf` | GET | `requireAuth()` | Tous auth | Tous auth | VOIR SECU-006 |
| `/api/tickets/[id]/print` | POST | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/cash-drawer/open` | POST | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/dashboard/kpis` | GET | `requireAuth()` + filtre CAISSIER | Tous (filtre par role) | Tous (filtre par role) | OUI |
| `/api/upload` | POST | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/upload` | DELETE | `requireRole("ADMIN", "MANAGER")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/parametres` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/parametres` | PUT | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/parametres/modes-paiement` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/parametres/modes-paiement` | POST | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/parametres/modes-paiement/[code]` | PUT | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/parametres/modes-paiement/[code]` | DELETE | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/taxes` | GET | `requireAuth()` | Tous auth | Tous auth | OUI |
| `/api/taxes` | POST | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/taxes/[id]` | PUT | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/taxes/[id]` | DELETE | `requireRole("ADMIN")` | ADMIN | ADMIN | OUI |
| `/api/caisse` | GET | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/caisse/[id]/mouvements` | GET | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |
| `/api/caisse/[id]/mouvements` | POST | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | **VOIR SECU-009** |
| `/api/caisse/[id]/soldes` | GET | `requireAuth()` + `hasPermission("rapports:consulter")` | ADMIN+MANAGER | ADMIN+MANAGER | OUI |

#### 1.2 Escalade de privileges

| Test | Resultat | Severite |
|------|----------|----------|
| CAISSIER appelle POST `/api/users` | **BLOQUE** (403) -- `requireRole("ADMIN")` | -- |
| CAISSIER appelle POST `/api/ventes/[id]/annuler` | **BLOQUE** (403) -- `requireRole("ADMIN", "MANAGER")` | -- |
| CAISSIER appelle POST `/api/comptoir/sessions/[id]/force-close` | **BLOQUE** (403) -- `requireRole("ADMIN")` | -- |
| CAISSIER appelle POST `/api/comptoir/sessions/[id]/validate` | **PASSE** si pas le proprietaire -- le check `hasPermission` a un fallback `result.user.role !== "CAISSIER"` qui est faux, MAIS la condition est `!hasPermission(...) && result.user.role !== "CAISSIER"` ce qui revient a: si CAISSIER et sans permission => passe quand meme car la condition `!== "CAISSIER"` est false donc le AND echoue et le check est saute. **ATTENTION : CAISSIER peut valider la session d'un autre** | VOIR SECU-010 |
| IDOR sur vente : CAISSIER accede a GET `/api/ventes/[id]` d'un autre caissier | **NON BLOQUE** -- pas de check ownership sur le GET unitaire | VOIR SECU-006 |
| IDOR sur session : CAISSIER accede a GET `/api/comptoir/sessions/[id]` d'un autre | **NON BLOQUE** -- pas de check ownership | VOIR SECU-007 |

#### 1.3 IDOR

Les routes suivantes ne verifient pas que l'utilisateur accede a ses propres donnees :
- `GET /api/ventes/[id]` -- tout utilisateur authentifie peut voir n'importe quelle vente
- `GET /api/tickets/[id]/pdf` -- tout utilisateur authentifie peut telecharger le ticket PDF de n'importe quelle vente
- `GET /api/comptoir/sessions/[id]` -- tout utilisateur authentifie peut voir n'importe quelle session
- `GET /api/comptoir/sessions/[id]/movements` -- tout utilisateur authentifie peut voir les mouvements de n'importe quelle session

### A02 -- Cryptographic Failures

- **Hashage mots de passe :** bcrypt avec 12 rounds -- CONFORME (fichier `web/app/src/app/api/users/route.ts` ligne 7, `web/app/src/auth.ts` ligne 43).
- **NEXTAUTH_SECRET :** Configure via variable d'environnement (`process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET`). Le secret est lu dynamiquement mais un secret statique `"changez-moi-en-dev"` est present dans le fichier `.env` **commit dans Git** (VOIR SECU-001).
- **JWT :** Sessions JWT avec `maxAge: 8h`. Pas de rotation de token.

### A03 -- Injection

- **SQL Injection (Prisma raw queries) :** Aucun `$queryRaw` ou `$executeRaw` trouve dans le code. Toutes les requetes passent par l'ORM Prisma parametre. **CONFORME.**
- **NoSQL Injection :** Non applicable (MySQL).
- **XSS :** React echappe par defaut le rendu. Les inputs sont valides par Zod. Pas de `dangerouslySetInnerHTML` detecte dans les routes API. Risque faible.

### A04 -- Insecure Design

- **Logique metier exploitable :**
  - La remise sur une vente (`remise` dans `createVenteSchema`) accepte `z.number().min(0).default(0)` **sans borne superieure**. Un attaquant pourrait envoyer `remise: 999999` pour obtenir un total negatif ou nul. VOIR SECU-011.
  - Le numero de vente sequentiel est genere par une lecture `findFirst` + increment dans la transaction. Sous charge concurrente elevee, deux transactions simultanees pourraient lire le meme `lastSeq` et generer le meme numero (la contrainte `@unique` sur `numero` causerait une erreur 500 au lieu d'un retry). VOIR SECU-012.

### A05 -- Security Misconfiguration

- **Headers HTTP :** Le fichier `next.config.ts` ne definit **aucun header de securite** (pas de CSP, pas de HSTS, pas de X-Frame-Options, pas de X-Content-Type-Options). VOIR SECU-003.
- **Stack traces exposees :** Les blocs `catch` font `console.error(...)` cote serveur et renvoient `{ error: "Erreur serveur" }` au client -- pas de fuite de stack trace. **CONFORME.**
- **Configuration NextAuth :** `trustHost: true` est defini. C'est acceptable en production derriere un reverse proxy mais represente un risque si l'app est exposee directement.
- **Traefik API dashboard en dev :** `--api.insecure=true` expose le dashboard Traefik sur le port 8081 sans authentification. Acceptable en dev mais dangereux si le compose dev est utilise en production.

### A06 -- Vulnerable Components

- **Dependances avec CVE connues :** Audit non execute (`npm audit` non lance). Recommandation : integrer `npm audit` dans la CI. La CI actuelle (`.github/workflows/ci.yml`) ne semble pas inclure cette etape.

### A07 -- Authentication Failures

- **Brute-force protection :** **AUCUNE.** Pas de rate-limiting, pas de lockout apres N tentatives echouees, pas de CAPTCHA. L'endpoint `/api/auth/[...nextauth]` est accessible sans aucune limitation. Les echecs de connexion sont logues (`AUTH_LOGIN_FAILED`) mais aucune action automatique n'en decoule. VOIR SECU-002.
- **Session management :** JWT avec duree de 8h. Pas de mecanisme de revocation immediate (par design avec JWT sans blacklist). Le logout detruit le cookie cote client mais le token reste valide jusqu'a expiration.
- **Politique de mot de passe :** Minimum 8 caracteres, maximum 72 (limite bcrypt). Pas de regles de complexite (majuscule, chiffre, caractere special) au niveau Zod -- seule la longueur est verifiee.

### A08 -- Data Integrity Failures

- **Manipulation de transactions :** Voir section 3 detaillee ci-dessous.
- **Integrite des sessions :** Un hash HMAC est calcule pour les sessions fermees/validees. La verification d'integrite est reservee ADMIN/MANAGER. Bon mecanisme.

### A09 -- Logging & Monitoring

- **Activity logs suffisants :** Le systeme de logging est complet et couvre : connexions, deconnexions, CRUD utilisateurs, CRUD produits/categories, ventes, annulations, sessions comptoir (ouverture, cloture, validation, force-close, correction), mouvements de caisse, ecarts, tickets PDF/thermique, tiroir-caisse. **CONFORME et bien implemente.**
- Les logs des echecs de connexion incluent la raison (`unknown_email`, `inactive_account`, `invalid_password`). Cependant, logger `invalid_password` avec l'ID utilisateur pourrait etre utilise pour des attaques par enumeration temporelle.

### A10 -- SSRF

- **Requetes serveur exploitables :** La route `/api/comptoir/sync` effectue des `fetch()` internes vers `/api/ventes` et `/api/comptoir/movements` en utilisant `new URL("/api/ventes", req.url).href`. L'URL de base provient de `req.url` qui est controle par le client (header `Host`). Avec `trustHost: true`, un attaquant pourrait potentiellement rediriger les requetes internes. VOIR SECU-013.

---

## 2. Pentest simule -- Controle d'acces

| Test | Endpoint | Methode | Resultat | Severite |
|------|----------|---------|----------|----------|
| CAISSIER accede a /api/users | GET /api/users | GET sans role ADMIN | **BLOQUE 403** | -- |
| CAISSIER cree un user | POST /api/users | POST sans role ADMIN | **BLOQUE 403** | -- |
| CAISSIER annule une vente | POST /api/ventes/[id]/annuler | POST role CAISSIER | **BLOQUE 403** | -- |
| CAISSIER force-close session | POST /api/comptoir/sessions/[id]/force-close | POST role CAISSIER | **BLOQUE 403** | -- |
| CAISSIER cree session corrective | POST /api/comptoir/sessions/[id]/correct | POST role CAISSIER | **BLOQUE 403** | -- |
| Session d'un autre user (IDOR) | GET /api/comptoir/sessions/[id] | GET avec ID etranger | **NON BLOQUE** -- pas de check ownership | Moyenne |
| Vente d'un autre user (IDOR) | GET /api/ventes/[id] | GET avec ID etranger | **NON BLOQUE** -- pas de check ownership | Moyenne |
| Ticket PDF d'un autre user | GET /api/tickets/[id]/pdf | GET avec ID etranger | **NON BLOQUE** | Moyenne |
| ADMIN/MANAGER ouvre une session | POST /api/comptoir/sessions | POST role ADMIN | **BLOQUE 403** (`requireRole("CAISSIER")` exclut ADMIN/MANAGER) | Haute |
| CAISSIER valide session d'un autre | POST /api/comptoir/sessions/[id]/validate | POST role CAISSIER | **PASSE** (le check exclut seulement l'auto-validation) | Basse (par design) |
| CAISSIER cree mouvement sur caisse directe | POST /api/caisse/[id]/mouvements | POST role CAISSIER | **BLOQUE** (`rapports:consulter` non dans permissions CAISSIER) | -- |

---

## 3. Pentest simule -- Manipulation de transactions

| Test | Payload | Resultat | Severite |
|------|---------|----------|----------|
| Montant negatif paiement | `{ montant: -1000 }` | **BLOQUE** par Zod : `z.number().positive()` sur `paiementSchema.montant` | -- |
| Quantite 0 vente | `{ quantite: 0 }` | **BLOQUE** par Zod : `z.number().int().positive()` sur `ligneVenteSchema.quantite` | -- |
| Quantite negative | `{ quantite: -5 }` | **BLOQUE** par Zod : `.positive()` | -- |
| Produit inexistant | `{ produitId: "fake-id" }` | **BLOQUE** par le code : `if (!p \|\| !p.actif)` dans la transaction vente (ligne 113-114 de `ventes/route.ts`) | -- |
| Remise > 100% | `{ remise: 99999 }` | **NON BLOQUE** par Zod (`z.number().min(0).default(0)` sans max). Le code calcule `base = sousTotal - montantRemise` qui peut devenir negatif. Les taxes seront 0 (check `if (base.gt(0))`). Le total pourrait etre negatif. | **Haute** |
| Double soumission vente (race condition) | POST rapide x2 | **PARTIELLEMENT PROTEGE** : la contrainte `@unique` sur `numero` empeche les doublons, mais la seconde requete recoit une erreur 500 au lieu d'un message propre. Le stock pourrait etre decremente deux fois avant que la contrainte unique ne soit verifiee. | Moyenne |
| Paiement avec montant 0 | `{ montant: 0 }` | **BLOQUE** par Zod : `.positive()` | -- |
| Prix unitaire 0 dans ligne de vente | `{ prixUnitaire: 0 }` | **BLOQUE** par Zod : `.positive()` | -- |
| Remise par ligne > 100% | `{ remise: 150 }` | **BLOQUE** par Zod : `.max(100)` sur `ligneVenteSchema.remise` | -- |
| Montant mouvement caisse negatif | `{ montant: -500 }` | **BLOQUE** par Zod : `.positive()` sur `createMouvementManuelSchema.montant` | -- |
| Mouvement correctif avec montant non borne | `{ montant: 0 }` dans correction | **PASSE** : `correctiveSessionSchema` utilise `z.number()` sans `.positive()` ni min -- 0 est accepte. Les montants negatifs sont aussi acceptes (potentiellement voulu pour les corrections). | Basse |

---

## 4. Infrastructure

### Headers HTTP

- **CSP :** ABSENT -- `next.config.ts` ne definit aucun header Content-Security-Policy.
- **HSTS :** ABSENT.
- **X-Frame-Options :** ABSENT -- l'application peut etre chargee dans une iframe (clickjacking).
- **X-Content-Type-Options :** ABSENT.
- **Referrer-Policy :** ABSENT.
- **Permissions-Policy :** ABSENT.

### Docker

- **Permissions conteneur (prod) :** L'image de production (`web/Dockerfile`) utilise `USER nextjs` (uid 1001) -- **CONFORME**, l'app ne tourne pas en root.
- **Permissions conteneur (dev) :** Le service `app` du `docker-compose.yml` utilise l'image `node:20-bookworm-slim` et tourne en **root** (pas de `USER`). Acceptable en dev uniquement.
- **Ports exposes (prod) :** Le port MySQL 3306 **n'est pas expose** dans `docker-compose.prod.yml` (commente avec une note). **CONFORME.**
- **phpMyAdmin (prod) :** phpMyAdmin n'est **pas present** dans `docker-compose.prod.yml`. **CONFORME.**
- **MySQL securise (prod) :** Les variables `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD` utilisent la syntaxe `${VAR:?message}` qui **oblige** a definir ces variables. **CONFORME.**
- **MySQL (dev) :** Mot de passe root par defaut `root`, expose sur le port 3306. Acceptable en dev.
- **Traefik (dev) :** Dashboard API expose sans authentification (`--api.insecure=true`, port 8081).
- **MinIO (dev) :** Credentials par defaut `minioadmin/minioadmin`. Acceptable en dev.

### Secrets

- **Fichiers scannes :** `web/app/src/`, `.env`, `docker-compose.yml`, `docker-compose.prod.yml`, `web/app/src/lib/seed/`
- **Resultats :**
  - **CRITIQUE** : Le fichier `/.env` est **commit dans Git** (`git ls-files .env` le confirme). Il contient : `MYSQL_ROOT_PASSWORD=rootsecret`, `MYSQL_PASSWORD=aerispay`, `NEXTAUTH_SECRET="changez-moi-en-dev"`, `DATABASE_URL` avec identifiants. Le fichier `.gitignore` a la racine du depot **n'existe pas** (seuls `web/.gitignore` et `web/app/.gitignore` existent). VOIR SECU-001.
  - **Mots de passe seed en dur :** `web/app/src/lib/seed/users.ts` contient `"Admin@1234"`, `"Gerant@1234"`, `"Caissier@1234"`. Le seed admin utilise `process.env.SEED_ADMIN_EMAIL ?? "admin@aerispay.com"` et `process.env.SEED_ADMIN_PASSWORD ?? "Admin@1234"` avec des fallbacks en dur. VOIR SECU-014.
  - **`docker-compose.yml`** contient le fallback `NEXTAUTH_SECRET:-devsecret-change-me`. Acceptable en dev si le compose dev n'est jamais utilise en prod.

---

## 5. Vulnerabilites trouvees

| ID | Severite | Categorie OWASP | Description | PoC (fichier et ligne) | Recommandation |
|----|----------|-----------------|-------------|------------------------|----------------|
| SECU-001 | **CRITIQUE** | A02 Cryptographic Failures | Le fichier `.env` a la racine du depot est **commit dans Git** et contient des mots de passe MySQL (`rootsecret`, `aerispay`), un `NEXTAUTH_SECRET` statique, et un `DATABASE_URL` complet. Il n'existe pas de `.gitignore` a la racine du depot. | `/.env` lignes 17-39 ; `git ls-files .env` retourne `.env` | 1. Ajouter un `.gitignore` a la racine du depot avec `.env*`. 2. Supprimer le fichier de l'historique Git (`git filter-branch` ou `bfg`). 3. Rotater tous les mots de passe et secrets exposes. |
| SECU-002 | **CRITIQUE** | A07 Auth Failures | Aucun rate-limiting ni protection anti brute-force sur l'endpoint d'authentification NextAuth. Un attaquant peut tester des milliers de mots de passe par minute. Le middleware (`src/middleware.ts` ligne 10-12) laisse passer toutes les requetes API sans controle : `if (isApi) return NextResponse.next()`. | `web/app/src/middleware.ts` lignes 10-12 ; `web/app/src/auth.ts` -- aucun mecanisme de throttle | 1. Implementer un rate-limiter (ex: `@upstash/ratelimit` ou middleware custom) avec un maximum de 5-10 tentatives par minute par IP. 2. Ajouter un lockout temporaire apres N echecs consecutifs par compte. 3. Considerer un CAPTCHA apres 3 echecs. |
| SECU-003 | **HAUTE** | A05 Security Misconfiguration | Aucun header de securite HTTP n'est configure dans `next.config.ts`. L'application est vulnerable au clickjacking (pas de X-Frame-Options), au MIME sniffing (pas de X-Content-Type-Options), et n'impose pas HTTPS (pas de HSTS). | `web/app/next.config.ts` -- fichier de 9 lignes, aucun header configure | Ajouter dans `next.config.ts` : `headers()` avec CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. |
| SECU-004 | **HAUTE** | A01 Broken Access Control | L'ouverture de session comptoir utilise `requireRole("CAISSIER")` qui **exclut** les roles ADMIN et MANAGER. Un ADMIN ou MANAGER ne peut pas ouvrir de session de comptoir, ce qui est probablement un bug fonctionnel et un probleme de conception d'acces. | `web/app/src/app/api/comptoir/sessions/route.ts` ligne 25 : `const result = await requireRole("CAISSIER");` | Changer en `requireAuth()` puis verifier `hasPermission(result.user.role, "comptoir:vendre")` qui inclut ADMIN, MANAGER et CAISSIER. |
| SECU-005 | **BASSE** | A01 Broken Access Control | POST `/api/ventes` utilise `requireAuth()` sans verifier la permission `comptoir:vendre`. Bien que tous les roles aient cette permission dans la matrice actuelle, le controle explicite est absent, ce qui pourrait devenir un probleme si de nouveaux roles sont ajoutes. | `web/app/src/app/api/ventes/route.ts` ligne 69 : `const result = await requireAuth();` | Ajouter `hasPermission(result.user.role, "comptoir:vendre")` apres l'authentification. |
| SECU-006 | **MOYENNE** | A01 Broken Access Control (IDOR) | Les routes GET `/api/ventes/[id]` et GET `/api/tickets/[id]/pdf` ne verifient pas l'ownership. Un CAISSIER peut consulter et telecharger le ticket de n'importe quelle vente, y compris celles d'autres caissiers. Alors que le listing (`GET /api/ventes`) filtre correctement par userId pour les CAISSIER, la consultation unitaire ne le fait pas. | `web/app/src/app/api/ventes/[id]/route.ts` -- aucun check `vente.userId === result.user.id` ; `web/app/src/app/api/tickets/[id]/pdf/route.ts` -- idem | Ajouter un check : si le role est CAISSIER, verifier que `vente.userId === result.user.id`. Les ADMIN/MANAGER conservent l'acces total. |
| SECU-007 | **MOYENNE** | A01 Broken Access Control (IDOR) | Les routes GET `/api/comptoir/sessions/[id]`, GET `/api/comptoir/sessions/[id]/movements`, et GET `/api/comptoir/sessions` (listing) ne filtrent pas par userId pour les CAISSIER. Un CAISSIER peut voir les sessions et mouvements de tous les autres caissiers. | `web/app/src/app/api/comptoir/sessions/[id]/route.ts` -- aucun filtre ownership pour GET ; `web/app/src/app/api/comptoir/sessions/route.ts` -- listing retourne toutes les sessions | Pour le listing : filtrer `where: { userId: result.user.id }` si CAISSIER. Pour le GET unitaire : verifier `session.userId === result.user.id` si CAISSIER. |
| SECU-008 | **MOYENNE** | A01 Broken Access Control | La route POST `/api/comptoir/sync` utilise seulement `requireAuth()`. Le payload `operations` contient un `payload` de type `z.record(z.unknown())` qui est passe directement aux appels internes `/api/ventes` et `/api/comptoir/movements`. La validation Zod du sync ne valide pas le contenu du payload -- elle est deleguee aux routes en aval, ce qui est correct en profondeur, mais l'absence de validation du `type` dans le payload `operations[].payload` signifie qu'un attaquant pourrait envoyer des payloads malformes en masse. | `web/app/src/app/api/comptoir/sync/route.ts` lignes 8-9 | Ajouter une validation plus stricte du payload dans le schema de sync, ou au minimum limiter le rate de synchronisation. |
| SECU-009 | **MOYENNE** | A01 Broken Access Control | POST `/api/caisse/[id]/mouvements` utilise `hasPermission("rapports:consulter")` pour proteger la **creation** de mouvements. La permission `rapports:consulter` est semantiquement destinee a la lecture, pas a l'ecriture. Un MANAGER avec permission de consulter les rapports peut creer des mouvements sur n'importe quelle caisse sans restriction. | `web/app/src/app/api/caisse/[id]/mouvements/route.ts` lignes 88-90 | Utiliser une permission dediee comme `comptoir:mouvement_manuel` pour le POST, et conserver `rapports:consulter` uniquement pour le GET. |
| SECU-010 | **BASSE** | A01 Broken Access Control | La route POST `/api/comptoir/sessions/[id]/validate` (validation aveugle) autorise les CAISSIER par un check explicit : `!hasPermission(...) && result.user.role !== "CAISSIER"`. Cela signifie qu'un CAISSIER (qui n'a pas `comptoir:valider_session`) est **autorise** a valider la session d'un autre caissier. C'est potentiellement voulu (le caissier entrant valide la session du caissier sortant) mais devrait etre documente et controle plus finement. | `web/app/src/app/api/comptoir/sessions/[id]/validate/route.ts` lignes 22-23 | Documenter explicitement ce comportement. Si les CAISSIER ne devraient pas valider, retirer le `&& result.user.role !== "CAISSIER"`. Si c'est voulu, ajouter un commentaire et potentiellement une permission dediee. |
| SECU-011 | **HAUTE** | A04 Insecure Design | Le champ `remise` dans `createVenteSchema` est defini comme `z.number().min(0).default(0)` **sans limite superieure**. Un attaquant peut envoyer `{ remise: 999999 }` pour creer une vente avec un total negatif (`total = sousTotal - remise + tva`). Bien que le paiement soit verifie (`totalPaiements >= total`), un total negatif rend le check inutile (n'importe quel paiement > 0 suffit). | `web/app/src/lib/validations/vente.ts` ligne 28 : `remise: z.number().min(0).default(0)` ; `web/app/src/app/api/ventes/route.ts` ligne 143 : `const montantRemise = new Prisma.Decimal(remise)` | Ajouter une validation que `remise <= sousTotal` dans le code metier (apres calcul du sous-total), ou borner la remise dans le schema Zod (ex: `.max(sous_total)` dynamiquement, ou une limite raisonnable fixe). Verifier que `total > 0` avant de creer la vente. |
| SECU-012 | **MOYENNE** | A04 Insecure Design | Le numero de vente sequentiel est genere dans la transaction par `findFirst` + increment. Sous forte concurrence, deux transactions pourraient lire le meme `lastSeq` et tenter de creer le meme numero. La contrainte `@unique` sur `numero` causerait une erreur Prisma non geree proprement (erreur 500 generique au lieu d'un retry). | `web/app/src/app/api/ventes/route.ts` lignes 172-180 | Utiliser une table de sequence avec un `UPDATE ... SET seq = seq + 1` atomique, ou une boucle retry sur conflit de contrainte unique. |
| SECU-013 | **BASSE** | A10 SSRF | La route `/api/comptoir/sync` utilise `new URL("/api/ventes", req.url).href` pour construire l'URL des appels internes. Avec `trustHost: true` dans NextAuth, l'URL de base peut etre influencee par le header `Host` du client. Cependant, le fetch interne re-passe les cookies de la requete originale, ce qui limite l'exploitabilite a des scenarios ou l'attaquant controle un serveur qui re-route vers une cible interne. | `web/app/src/app/api/comptoir/sync/route.ts` lignes 48, 68 | Utiliser une URL absolue fixe (ex: `http://localhost:3000/api/ventes`) au lieu de `new URL("/api/...", req.url)` pour les appels internes. |
| SECU-014 | **HAUTE** | A02 Cryptographic Failures | Le seed admin utilise un mot de passe par defaut `"Admin@1234"` en fallback quand `SEED_ADMIN_PASSWORD` n'est pas defini. Si le seed est execute en production sans definir cette variable d'environnement, le compte admin aura un mot de passe trivial et connu publiquement (present dans le code source). | `web/app/src/lib/seed/users.ts` lignes 11 : `password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@1234"` | 1. Rendre `SEED_ADMIN_PASSWORD` obligatoire en production (lever une erreur si absent au lieu d'un fallback). 2. Forcer le changement de mot de passe au premier login. 3. Ne jamais utiliser le seed avec les fallbacks en production. |

---

## 6. Recommandations

### Priorite critique (a traiter immediatement)

1. **SECU-001** : Creer un `.gitignore` a la racine du depot, y ajouter `.env*`, retirer `.env` de l'index Git (`git rm --cached .env`), et nettoyer l'historique. Rotater tous les secrets exposes (mots de passe MySQL, NEXTAUTH_SECRET).

2. **SECU-002** : Implementer un rate-limiter sur l'endpoint d'authentification. Options recommandees :
   - Middleware Next.js avec compteur en memoire (pour MVP) ou Redis/Upstash pour la production.
   - Maximum 5 tentatives par minute par IP sur `/api/auth`.
   - Lockout progressif par compte (15 min apres 5 echecs, 1h apres 10).

### Priorite haute (a traiter dans le sprint courant)

3. **SECU-003** : Ajouter les headers de securite dans `next.config.ts` :
   ```ts
   async headers() {
     return [{
       source: "/(.*)",
       headers: [
         { key: "X-Frame-Options", value: "DENY" },
         { key: "X-Content-Type-Options", value: "nosniff" },
         { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
         { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
       ]
     }]
   }
   ```

4. **SECU-004** : Corriger `POST /api/comptoir/sessions` pour accepter tous les roles ayant la permission `comptoir:vendre`.

5. **SECU-011** : Ajouter une validation `remise <= sousTotal` et `total > 0` dans la logique de creation de vente.

6. **SECU-014** : Rendre les variables d'environnement seed obligatoires en production.

### Priorite moyenne (a planifier)

7. **SECU-006, SECU-007** : Ajouter des checks d'ownership (IDOR) sur les routes GET unitaires pour les CAISSIER.

8. **SECU-009** : Utiliser la permission semantiquement correcte pour POST `/api/caisse/[id]/mouvements`.

9. **SECU-012** : Implementer un mecanisme atomique pour la generation de numeros de vente.

10. **SECU-008** : Renforcer la validation du schema de synchronisation offline.

### Priorite basse (amelioration continue)

11. **SECU-005, SECU-010, SECU-013** : Renforcer les controles d'acces explicites et la construction d'URL internes.

12. **Politique de mot de passe** : Ajouter des regles de complexite dans le schema Zod (`createUserSchema`).

13. **npm audit** : Integrer `npm audit --audit-level=high` dans le pipeline CI.

14. **Revocation de session** : Considerer un mecanisme de blacklist JWT pour les cas de deconnexion forcee (ex: desactivation de compte).

---

*Fin du rapport -- 14 vulnerabilites identifiees (2 critiques, 4 hautes, 5 moyennes, 3 basses)*
