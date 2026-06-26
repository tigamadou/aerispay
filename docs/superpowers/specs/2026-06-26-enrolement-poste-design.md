# Enrôlement du poste au premier lancement — Design

| | |
|---|---|
| **Date** | 26 juin 2026 |
| **Statut** | Conception validée — à implémenter (TDD) |
| **Périmètre** | Client Electron `desktop/` + nœud `web/app/` |
| **Réf. archi** | `ARCHITECTURE_MVP.md` §6 (Enrôlement & identité), §3 (ADR), §8 (Sécurité) |

## 1. Objectif & contexte

Au **premier lancement** d'un poste de caisse (aucun serveur encore associé), afficher un **formulaire d'enrôlement** demandant l'**URL du nœud magasin**, un **code d'enrôlement** et le **nom de la caisse**. Une fois enrôlé et vérifié, le poste mémorise sa configuration et charge l'UI du nœud ; aux lancements suivants, il va directement en mode kiosque.

**État actuel (gaps).** La logique de validation (`desktop/src/config.ts`) et l'écran (`desktop/renderer/config.html`) existent mais **ne sont pas câblés** : `desktop/src/main.ts` lit `process.env.AERIS_NODE_URL` en dur, ne **persiste** ni ne **lit** aucune config, et n'affiche jamais le formulaire. Le formulaire est statique (aucun handler de soumission).

**Décisions de cadrage (brainstorming 2026-06-26).**
- Le formulaire **teste la connexion** au nœud avant d'enregistrer (sinon erreur, rien n'est enregistré).
- Le **token remis par l'admin est à usage unique** (token d'enrôlement), échangé une fois contre un **token de magasin** longue durée (révise l'ADR-003 → ADR-007).
- L'**installateur nomme la caisse** ; la caisse est **pré-créée** par l'admin, l'enrôlement met à jour son `nom` (le `code` de numérotation reste fixé par l'admin).
- Stockage : **`safeStorage` Electron** (trousseau OS) pour le secret + JSON `userData` pour le non-secret.
- Ré-enrôlement via un **item de menu** « Réinitialiser l'enrôlement ».

## 2. Modèle de tokens (ADR-007 — révise ADR-003)

Deux concepts distincts :

| | **Token d'enrôlement** (nouveau) | **Token de magasin** (existant) |
|---|---|---|
| Rôle | Remis par l'admin ; sert **une seule fois** à l'install | Credential **longue durée** du poste, conservé au trousseau OS |
| Durée | Courte (TTL, défaut 60 min) | Longue, **révocable** (`revokeStoreToken`) |
| Usage | **Single-use** : consommé à l'échange | Réutilisé pour l'auth (injection = hors périmètre, cf. §12) |
| Émis par | `POST /api/enrollment` (ADMIN) | Le nœud, lors de l'**échange** |
| Stockage nœud | Hash SHA-256 + `consumedAt` | Hash SHA-256 + `revoked` (inchangé) |

**Flux des tokens :** Admin génère un **token d'enrôlement** (scopé à une caisse pré-créée) → l'installateur le saisit au poste → le poste l'**échange** auprès du nœud → le nœud le marque **consommé**, (re)nomme la caisse, **émet un token de magasin** longue durée et le renvoie → le poste stocke le token de magasin au trousseau OS.

## 3. Flux d'enrôlement (bout en bout)

```
ADMIN (web)                  INSTALLATEUR (poste Electron)            NŒUD MAGASIN
   │ crée la caisse (nom/code)                                            │
   │ POST /api/enrollment ──────────────────────────────────────────────►│ crée EnrollmentToken (single-use, TTL)
   │ ◄── code d'enrôlement (affiché 1 fois) ─────────────────────────────│
   │ remet le code ───────────►│ 1er lancement : aucune config            │
   │                           │ formulaire : URL + code + nom            │
   │                           │ submit ──► POST /api/enrollment/exchange ►│ vérifie code (non consommé, non expiré)
   │                           │            { token, nom }                │ tx: consomme + Caisse.nom = nom
   │                           │                                          │     + émet StoreToken
   │                           │ ◄── { storeToken, caisseId, codePoste, nom } (200)
   │                           │ stocke nodeUrl+caisseId (JSON) + storeToken (safeStorage)
   │                           │ bascule en kiosque (UI du nœud)          │
```

Échec (code invalide/consommé/expiré, nœud injoignable) → message d'erreur dans le formulaire, **rien n'est enregistré**.

## 4. Côté nœud (`web/app/`)

### 4.1 Schéma Prisma — nouveau modèle `EnrollmentToken`

```prisma
model EnrollmentToken {
  id         String    @id @default(cuid())
  tokenHash  String    @unique @db.VarChar(64)
  caisseId   String
  caisse     Caisse    @relation(fields: [caisseId], references: [id])
  label      String?
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([caisseId])
  @@map("enrollment_tokens")
}
```

`StoreToken` **inchangé**.

### 4.2 Service `enrollment-token.ts` (nouveau, logique pure + Prisma)

- `issueEnrollmentToken({ caisseId, label?, ttlMinutes = 60 })` → `{ token, id, expiresAt }` (token clair affiché une fois ; seul le hash est persisté).
- `consumeEnrollmentToken(token)` → en **transaction** : recherche par hash ; rejette si introuvable / consommé / expiré ; marque `consumedAt = now()` de façon atomique (garde anti-course via `updateMany` conditionnel) ; renvoie `{ valid, caisseId, tokenId }`.

### 4.3 Endpoints

**`POST /api/enrollment` (ADMIN) — modifié.** Émet désormais un **token d'enrôlement** (au lieu d'un token de magasin).
- Body : `{ caisseId: string, label?: string, ttlMinutes?: number }` (Zod).
- Vérifie caisse existante & active → `issueEnrollmentToken`.
- `201 { data: { enrollmentToken, caisseId, codePoste, expiresAt } }`. `logActivity` (sans le secret).

**`POST /api/enrollment/exchange` (public — auth = le token d'enrôlement lui-même) — nouveau.**
- Body : `{ token: string, nom?: string }` (Zod).
- En transaction : `consumeEnrollmentToken(token)` ; si invalide → `401` ; si caisse inactive → `422` ; si `nom` non vide → `prisma.caisse.update({ nom })` ; `issueStoreToken({ caisseId, label: nom })`.
- `200 { data: { storeToken, caisseId, codePoste, nom } }`. `logActivity` (jamais le token).

### 4.4 UI admin (génération du code)

Sur `(dashboard)/caisse/page.tsx`, action **« Générer un code d'enrôlement »** par caisse (ADMIN) → appelle `POST /api/enrollment` → affiche le code **une seule fois** (copiable) + l'expiration. Minimal, mais rend le flux complet (sans cela, aucun moyen de produire le code).

## 5. Côté client (`desktop/`)

### 5.1 Modules

| Fichier | Rôle |
|---|---|
| `src/config.ts` *(ajusté)* | `PosteConfig { nodeUrl, caisseId, codePoste?, nom? }` (le **storeToken** ne vit plus ici, il va au trousseau) ; `validateEnrollInput({ nodeUrl, token, nom })` (format URL + token requis) ; `authHeaders(nodeUrl, storeToken, caisseId)` |
| `src/config-store.ts` *(nouveau)* | Persistance. **Pur** : `encodeConfigFile(config, storeToken, encryptFn)` / `decodeConfigFile(raw, decryptFn)`. **IO** : `loadConfig()/saveConfig()/clearConfig()` (`fs` + `safeStorage`) — JSON `userData/poste-config.json` `{ nodeUrl, caisseId, codePoste, nom, storeTokenEnc }` (`storeTokenEnc` = base64 chiffré par safeStorage) |
| `src/enrollment-client.ts` *(nouveau)* | `exchangeEnrollment(nodeUrl, token, nom, fetchFn=fetch)` → `POST /api/enrollment/exchange` ; gère 200 / 401 / 422 / réseau ; renvoie `{ ok, storeToken?, caisseId?, codePoste?, nom?, error? }` |
| `src/enroll-preload.ts` *(nouveau)* | `contextBridge` → `window.aerisEnroll.submit({ nodeUrl, token, nom })` (canal `aeris:enroll-submit`) |
| `renderer/config.js` *(nouveau)* | Handler du formulaire : lit les champs, appelle `window.aerisEnroll.submit`, affiche erreur ou confirmation (chargé via `<script src>` ; CSP `'self'`) |
| `renderer/config.html` *(ajusté)* | 3 champs : URL du nœud · **code d'enrôlement** · **nom de la caisse** ; zone d'erreur/confirmation |
| `src/channels.ts` *(ajusté)* | + `ENROLL_CHANNELS = { submit: "aeris:enroll-submit" }` |
| `src/main.ts` *(ajusté)* | Orchestration (voir 5.2) |

### 5.2 Orchestration `main.ts`

- **Au lancement** : `loadConfig()`. Si **absente** → fenêtre d'enrôlement (preload `enroll-preload`, charge `config.html`). Si **présente** → fenêtre kiosque (preload `preload`, health-check + `loadURL(config.nodeUrl)` / `blocked.html`).
- **Handler IPC** `aeris:enroll-submit` : `validateEnrollInput` → `exchangeEnrollment` → si `ok` : `saveConfig()` (token au trousseau) + recréer la **fenêtre kiosque** ; sinon renvoyer l'erreur au renderer.
- **`NODE_URL`** vient désormais de `config.nodeUrl` (l'env `AERIS_NODE_URL` reste un override dev).
- **Menu** « Réinitialiser l'enrôlement » → `clearConfig()` + fermer kiosque + rouvrir la fenêtre d'enrôlement.

### 5.3 Frontière de sécurité (2 fenêtres / 2 preloads)

La fenêtre **kiosque** charge l'UI **distante** du nœud et n'expose que `aerisDevices`. La fenêtre **d'enrôlement** est **locale** (`file://`) et n'expose que `aerisEnroll`. Aucune ne voit l'API de l'autre → l'UI distante ne peut jamais lire/écrire le token. Le preload étant figé à la création, on **recrée** la fenêtre à la bascule enrôlement→kiosque.

## 6. UX du formulaire

3 champs : **URL du nœud magasin** (placeholder `https://magasin.local:3000`), **Code d'enrôlement** (fourni par l'admin), **Nom de la caisse** (optionnel ; vide → nom existant conservé). Bouton « Enrôler ce poste ». Sous le bouton : zone d'état (erreur en rouge / confirmation `Caisse "<nom>" (<codePoste>) enrôlée`). Rappel : « Le secret est stocké dans le trousseau de l'OS, jamais en clair. »

## 7. Sécurité

- **Token d'enrôlement** : single-use (consommé atomiquement), TTL court, **hash** seul persisté. Renommer la caisse est autorisé par le token valide (installateur de confiance à l'install).
- **Token de magasin** : longue durée, hash seul persisté, révocable ; côté poste, chiffré via `safeStorage` (trousseau OS), jamais en clair.
- `safeStorage` indisponible (Linux sans backend) → message explicite, **refus d'enregistrer en clair**.
- **Ne pas brûler le token pour rien** : le client **pré-vérifie `safeStorage.isEncryptionAvailable()` AVANT** d'appeler `exchange`. Le token d'enrôlement étant à usage unique, on ne le consomme pas si l'on ne pourra pas stocker le token de magasin renvoyé (sinon poste bloqué : code consommé, secret perdu).
- Aucun secret journalisé (ni côté nœud ni côté client).

## 8. Gestion d'erreurs

| Cas | Comportement |
|---|---|
| Champs invalides (URL/format) | Message champ par champ, pas d'appel réseau |
| Nœud injoignable | « Serveur injoignable à cette adresse » |
| Code invalide / expiré | `401` → « Code d'enrôlement invalide ou expiré » |
| Code déjà consommé | `401`/`409` → « Code déjà utilisé » |
| Caisse inactive | `422` → « Caisse inactive — contactez l'administrateur » |
| `safeStorage` indisponible | « Trousseau OS indisponible — enrôlement impossible » |

## 9. Tests (TDD)

**Nœud :**
- `enrollment-token.ts` : émission (hash, TTL) ; consommation OK ; rejet consommé / expiré / inconnu ; atomicité (double consommation → un seul succès).
- `POST /api/enrollment` : ADMIN requis ; émet un token d'enrôlement ; caisse inexistante/inactive → `422`. *(adapter `enrollment-api.test.ts` existant)*
- `POST /api/enrollment/exchange` : 200 (consomme + renomme + émet store token) ; 401 (invalide/expiré/consommé) ; 422 (caisse inactive) ; nom vide → nom conservé.

**Client :**
- `config.ts` : `validateEnrollInput` (URL/token) ; `authHeaders`.
- `config-store.ts` : round-trip encode/decode (faux chiffrement) ; fichier absent/corrompu ; `clearConfig`.
- `enrollment-client.ts` : exchange OK / 401 / 422 / réseau (fetch simulé).

## 10. Docs à mettre à jour

- `ARCHITECTURE_MVP.md` : §3 — **ADR-007** (token d'enrôlement à usage unique, révise ADR-003) ; §6 — flux d'échange ; §12 — modèle `EnrollmentToken`.
- `docs/product/09-pages-api.md` : `POST /api/enrollment` (modifié), `POST /api/enrollment/exchange` (nouveau).

## 11. Non-objectifs (cette itération)

- **Injection du token dans chaque requête** de l'UI chargée (le nœud n'impose pas encore l'auth par store-token sur ses routes) — suivi ultérieur.
- mTLS / rotation automatique des tokens (backlog V2, ADR-003).
- Mode d'enrôlement « nœud magasin » (installation serveur) — ce design couvre le mode **client**.
