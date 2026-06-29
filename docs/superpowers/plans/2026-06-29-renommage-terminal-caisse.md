# Renommage « Caisse » → « Terminal de caisse » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`) pour le suivi.

**Goal:** Lever la confusion conceptuelle entre le **terminal/poste de caisse** (la station où un caissier se connecte — actuellement modèle Prisma `Caisse`) et le **module de caisse** (la gestion d'argent : sessions, soldes, mouvements), en renommant le concept « terminal » en `TerminalCaisse` / `terminalId` dans tout le dépôt, sans casser le module de caisse ni perdre de données.

**Architecture:** Le modèle Prisma `Caisse` (table `caisses`) représente en réalité un terminal POS. On le renomme `TerminalCaisse` (table `terminaux_caisse`) et toutes ses clés étrangères `caisseId` → `terminalId`. Le **module de caisse** (modèles `ComptoirSession`, `MouvementCaisse`, `SeuilCaisse`, `EventCaisse`) garde son nom : ces entités décrivent la gestion d'argent, pas le terminal. Le renommage procède **couche par couche** en gardant la suite de tests verte à chaque étape : on renomme d'abord au niveau TypeScript/Prisma en conservant les noms physiques de la base via `@@map`/`@map` (aucune migration), puis on bascule la base physiquement en **dernière** étape via une migration de **renommage** (RENAME, données préservées).

**Tech Stack:** Next.js 16 (App Router) · Prisma · MySQL · TypeScript strict · Vitest · Electron (`desktop/`) · schéma cloud (`cloud/prisma/`).

---

## Suivi de progression (mise à jour automatique)

> **Mécanique de suivi** — ce plan vit dans `docs/superpowers/plans/`, l'emplacement câblé à `scripts/run-plans.sh` (runner autonome). La progression se met à jour **automatiquement** de trois façons, à appliquer par l'exécutant **après chaque étape** :
> 1. **Cases à cocher** : passer chaque `- [ ]` à `- [x]` dès l'étape réalisée (les compétences `executing-plans` / `subagent-driven-development` le font nativement).
> 2. **Tableau d'avancement ci-dessous** : mettre à jour la colonne *Statut* (`⬜ à faire` → `🟦 en cours` → `✅ fait`) à l'ouverture et à la clôture de chaque tâche.
> 3. **Suppression du plan** : la **dernière tâche** supprime ce fichier (politique « specs/plans éphémères », CLAUDE.md §8.1). Le dossier `docs/superpowers/plans/` redevient vide = signal déterministe de complétion pour `run-plans.sh`.

| #  | Tâche | Statut |
|----|-------|--------|
| 1  | Renommage modèle Prisma + balayage code & tests (nœud) | ⬜ à faire |
| 2  | Renommage des routes API `/api/caisse` → `/api/terminaux` + appelants | ⬜ à faire |
| 3  | Libellés UI + valeurs de seed | ⬜ à faire |
| 4  | Client desktop : champ config + en-tête HTTP | ⬜ à faire |
| 5  | Schéma cloud : `caisseId` → `terminalId` | ⬜ à faire |
| 6  | Migration physique de la base (RENAME, données préservées) | ⬜ à faire |
| 7  | Journal d'activité (`entityType`) + documentation produit | ⬜ à faire |
| 8  | Vérification finale + suppression du plan | ⬜ à faire |

---

## Global Constraints

Ces règles s'appliquent à **toutes** les tâches :

- **Vocabulaire cible (copier verbatim)** :
  - Modèle Prisma `Caisse` → `TerminalCaisse` ; table `caisses` → `terminaux_caisse`.
  - Client Prisma `prisma.caisse` → `prisma.terminalCaisse`.
  - Champ FK / propriété `caisseId` → `terminalId` (partout : `StoreToken`, `EnrollmentToken`, `ComptoirSession`, `MouvementCaisse`, services, API, desktop, cloud).
  - Relation Prisma `.caisse` → `.terminal`.
  - Type généré `Caisse` (import `@prisma/client`) → `TerminalCaisse`.
  - Route API `/api/caisse` → `/api/terminaux`.
  - Libellé utilisateur : « Caisse » (au sens station) → « Terminal de caisse » ; « Caisse 1/principale » → « Terminal 1/principal ».
- **NE PAS renommer** (= module de caisse, gestion d'argent) : modèles `ComptoirSession`, `MouvementCaisse`, `SeuilCaisse`, `EventCaisse` ; tables `comptoir_sessions`, `mouvements_caisse`, `seuils_caisse`, `events_caisse` ; routes `/api/comptoir/*` ; le mot « caisse » dans « module de caisse », « fond de caisse », « solde de caisse », « tiroir-caisse », « Z de caisse ». **Seul** le champ `caisseId` de ces modèles devient `terminalId` (il pointe vers un terminal).
- **Valeurs d'audit stables** : les **valeurs de chaîne** des actions du journal (`ACTIONS.*`) NE changent PAS (intégrité de l'historique d'audit). On peut renommer la **clé** de constante TS, mais pas la string stockée. Exception traitée en Tâche 7 : `entityType`.
- **TypeScript strict** : pas de `any`, pas de `as unknown`. Utiliser les types Prisma générés.
- **TDD / tests verts** : ce travail est un **refactor de renommage**. Les tests existants sont le filet de sécurité. Règle d'or : **chaque tâche se termine avec `npx vitest run` au vert** (et `npx tsc --noEmit` sans erreur) avant le commit. Aucune tâche ne laisse le dépôt rouge.
- **AUCUN commit automatique.** L'utilisateur réalise **lui-même** tous les commits. À la fin de chaque tâche : s'arrêter, signaler que la tâche est terminée et prête à être committée, puis **attendre** son instruction. Ne jamais lancer `git commit` (ni `git add` en vue d'un commit) sans une instruction explicite et précise de l'utilisateur. (Règle projet — CLAUDE.md §8.2.)
- **Exécution autonome** : `scripts/run-plans.sh` committe une tâche à la fois ; cette règle anti-commit le rend **inadapté** pour ce plan. Exécuter plutôt en mode supervisé (inline ou subagent-driven), avec arrêt à chaque point de contrôle pour commit manuel.
- **Baseline de référence** : `cd web/app && npx vitest run` (nœud) ; `cd desktop && npx vitest run` (client).

---

## File Structure

Fichiers créés / modifiés, par responsabilité :

- `web/app/prisma/schema.prisma` — renommage du modèle `Caisse` → `TerminalCaisse` et des FK (Tâche 1 : avec `@@map`/`@map` de transition ; Tâche 6 : suppression des `@@map`/`@map`).
- `web/app/prisma/migrations/<ts>_rename_caisse_to_terminal/migration.sql` — **créé** en Tâche 6 : migration manuelle de RENAME.
- `web/app/src/lib/services/*.ts`, `web/app/src/lib/seed/caisse.ts`, `web/app/src/lib/validations/*.ts` — balayage `caisse`→`terminal` (Tâche 1).
- `web/app/src/app/api/caisse/**` → **déplacé** en `web/app/src/app/api/terminaux/**` (Tâche 2).
- `web/app/src/app/api/comptoir/**`, `web/app/src/app/api/ventes/**`, `web/app/src/app/api/enrollment/**` — `caisseId`→`terminalId` (Tâche 1).
- `web/app/src/components/**`, `web/app/src/app/(dashboard)/**` — logique `caisseId`→`terminalId` (Tâche 1) ; libellés (Tâche 3).
- `web/app/src/__tests__/**`, `web/app/cypress/e2e/**` — balayage (Tâche 1, ajustement URL en Tâche 2).
- `desktop/src/config.ts`, `config-store.ts`, `main.ts`, `enrollment-client.ts` + tests — `caisseId`→`terminalId`, en-tête `X-Aeris-Caisse`→`X-Aeris-Terminal` (Tâche 4).
- `cloud/prisma/schema.prisma` — `caisseId`→`terminalId` (Tâche 5).
- `web/app/src/lib/activity-log.ts` + `docs/product/04-caisse-sessions.md`, `03-comptoir-ventes.md`, `09-pages-api.md`, `README.md` — (Tâche 7).

> **Note de décomposition** : la Tâche 1 est volontairement large (un renommage de modèle Prisma casse tout le code qui le référence ; il doit reland en un bloc cohérent pour repasser au vert). Les tâches 2 à 7 sont réellement indépendantes et chacune repasse au vert seule.

---

## Task 1 : Renommage du modèle Prisma + balayage code & tests (nœud)

**Files:**
- Modify: `web/app/prisma/schema.prisma:113-127` (modèle), `:141-142`, `:159-160`, `:221-222`, `:232`, `:260-261`, `:269` (FK + index)
- Modify (balayage `caisseId`→`terminalId`, `prisma.caisse`→`prisma.terminalCaisse`, `.caisse`→`.terminal`, type `Caisse`→`TerminalCaisse`) : tout `web/app/src/**` et `web/app/src/__tests__/**` listés ci-dessous.
- Test: suite complète `web/app` (`npx vitest run`).

**Interfaces:**
- Produces : modèle Prisma `TerminalCaisse` (accès `prisma.terminalCaisse`), champ FK `terminalId` et relation `terminal` sur `StoreToken`, `EnrollmentToken`, `ComptoirSession`, `MouvementCaisse`. Type `TerminalCaisse` importable depuis `@prisma/client`. **La base physique reste inchangée** (table `caisses`, colonnes `caisseId`) grâce aux `@@map`/`@map` — aucune migration dans cette tâche.

- [ ] **Étape 1 : Capturer la baseline verte**

```bash
cd web/app && npx vitest run
```
Attendu : suite au vert (noter le nombre de tests passants comme référence).

- [ ] **Étape 2 : Renommer le modèle et les FK dans `schema.prisma` (avec `@@map`/`@map` de transition)**

Dans `web/app/prisma/schema.prisma`, modèle `Caisse` (lignes 111-127) :

```prisma
// ─── MODULE TERMINAL DE CAISSE ────────────────────────
// Un terminal/poste de caisse : la station POS où un caissier se connecte pour
// vendre. À NE PAS confondre avec le « module de caisse » (gestion d'argent :
// ComptoirSession + MouvementCaisse + soldes), qui est rattaché à un terminal.

model TerminalCaisse {
  id        String   @id @default(cuid())
  // F1.2 — code poste court (ex. "P1") : préfixe de numérotation des ventes par poste.
  code      String   @unique
  nom       String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  mouvements       MouvementCaisse[]
  sessions         ComptoirSession[]
  storeTokens      StoreToken[]
  enrollmentTokens EnrollmentToken[]

  @@map("caisses") // TRANSITION (Tâche 6 : → "terminaux_caisse")
}
```

`StoreToken` (lignes 133-146) — remplacer le bloc relation :

```prisma
  terminalId String @map("caisseId") // TRANSITION (Tâche 6 : supprimer @map)
  terminal   TerminalCaisse @relation(fields: [terminalId], references: [id])

  @@index([terminalId])
  @@map("store_tokens")
```

`EnrollmentToken` (lignes 151-164) :

```prisma
  terminalId String @map("caisseId") // TRANSITION
  terminal   TerminalCaisse @relation(fields: [terminalId], references: [id])

  @@index([terminalId])
  @@map("enrollment_tokens")
```

`ComptoirSession` (lignes 221-222 et index 232) :

```prisma
  terminalId String @map("caisseId") // TRANSITION
  terminal   TerminalCaisse @relation(fields: [terminalId], references: [id])
```
et l'index :
```prisma
  @@index([terminalId, statut])
```

`MouvementCaisse` (lignes 260-261 et index 269) :

```prisma
  terminalId String @map("caisseId") // TRANSITION
  terminal   TerminalCaisse @relation(fields: [terminalId], references: [id])
```
et l'index :
```prisma
  @@index([terminalId])
```

- [ ] **Étape 3 : Régénérer le client Prisma**

```bash
cd web/app && npx prisma generate
```
Attendu : génération OK. `npx tsc --noEmit` est maintenant **rouge** partout où `prisma.caisse` / `caisseId` / type `Caisse` sont référencés — c'est attendu, l'étape suivante corrige.

- [ ] **Étape 4 : Balayer le code applicatif (`web/app/src`, hors tests)**

Renommer mécaniquement dans `web/app/src/**` (hors `__tests__`) :
- `prisma.caisse.` → `prisma.terminalCaisse.`
- l'accès relation `.caisse` (objet inclus) → `.terminal` (ex. `session.caisse` → `session.terminal`, `include: { caisse: ... }` → `include: { terminal: ... }`)
- la propriété/variable `caisseId` → `terminalId`
- le type `Caisse` importé de `@prisma/client` → `TerminalCaisse`

Commandes de repérage (à traiter fichier par fichier — **ne pas** `sed` aveuglément les modèles à conserver) :

```bash
cd web/app
grep -rln "prisma\.caisse\b\|caisseId\|: Caisse\b\|<Caisse>\|\.caisse\b" src --include=*.ts --include=*.tsx | grep -v __tests__
```

Fichiers attendus (cf. cartographie) : `src/lib/services/cash-movement.ts`, `store-token.ts`, `enrollment-token.ts`, `cloud-sync.ts`, `event-emitter.ts` ; `src/lib/seed/caisse.ts` ; `src/lib/validations/session.ts` ; `src/app/api/caisse/**` ; `src/app/api/comptoir/**` ; `src/app/api/ventes/**` ; `src/app/api/enrollment/**` ; `src/components/caisse/**` ; `src/app/(dashboard)/**`.

> ⚠️ Ne PAS toucher : `mouvementCaisse`, `seuilCaisse`, `eventCaisse`, `MouvementCaisse`, `SeuilCaisse`, `EventCaisse`, `computeSoldeCaisseParMode`, `cash-movement` (nom de fichier/fonctions du module caisse). Seul `caisseId`→`terminalId` s'y applique.

- [ ] **Étape 5 : Vérifier la compilation**

```bash
cd web/app && npx tsc --noEmit
```
Attendu : 0 erreur. Si des erreurs subsistent dans `src`, finir le balayage avant de passer aux tests.

- [ ] **Étape 6 : Balayer les tests**

Mêmes substitutions dans `web/app/src/__tests__/**` et `web/app/cypress/e2e/**` :
```bash
cd web/app
grep -rln "prisma\.caisse\b\|caisseId\|\bCaisse\b\|\.caisse\b" src/__tests__ cypress
```
Renommer `prisma.caisse`→`prisma.terminalCaisse`, `caisseId`→`terminalId`, fixtures de type `Caisse`→`TerminalCaisse`, `.caisse`→`.terminal`. **Ne pas** renommer les fichiers de test ni les noms de modèles du module caisse.

- [ ] **Étape 7 : Faire passer la suite au vert**

```bash
cd web/app && npx vitest run
```
Attendu : même nombre de tests passants qu'à l'étape 1 (aucune régression). Corriger jusqu'au vert.

- [ ] **Étape 8 : Point de contrôle (pas de commit)**

Tâche terminée, suite au vert. **Ne pas committer** : signaler à l'utilisateur que la Tâche 1 est prête à committer (suggestion de message : `refactor(caisse): renomme le modèle Caisse en TerminalCaisse (code + tests, base inchangée via @@map)`) et attendre son instruction.

---

## Task 2 : Renommage des routes API `/api/caisse` → `/api/terminaux` + appelants

**Files:**
- Move: `web/app/src/app/api/caisse/` → `web/app/src/app/api/terminaux/` (avec sous-dossiers `[id]/`, `[id]/soldes/`, `[id]/mouvements/`)
- Modify: tout appelant front (`fetch("/api/caisse...")`) + tests référençant ces URLs.
- Test: `web/app/src/__tests__/caisse/caisse-api.test.ts`, `movements-api.test.ts`, `list-movements-api.test.ts`, `solde-coherence.test.ts`.

**Interfaces:**
- Consumes : modèle `TerminalCaisse` (Tâche 1).
- Produces : endpoints `GET/POST /api/terminaux`, `GET/PUT/DELETE /api/terminaux/[id]`, `GET /api/terminaux/[id]/soldes`, `GET/POST /api/terminaux/[id]/mouvements`. Les routes `/api/comptoir/*` restent inchangées (module de caisse).

- [ ] **Étape 1 : Déplacer le dossier de routes**

```bash
cd web/app
git mv src/app/api/caisse src/app/api/terminaux
```

- [ ] **Étape 2 : Repérer et mettre à jour les appelants**

```bash
cd web/app
grep -rln '/api/caisse' src
```
Dans chaque résultat (composants, pages, hooks, tests), remplacer la chaîne `/api/caisse` par `/api/terminaux`. Mettre à jour les logs internes des handlers (ex. `console.error("[GET /api/caisse]"` → `"[GET /api/terminaux]"`).

- [ ] **Étape 3 : Tests au vert**

```bash
cd web/app && npx vitest run && npx tsc --noEmit
```
Attendu : vert + 0 erreur TS. Vérifier en particulier les tests qui construisent l'URL `/api/caisse/...`.

- [ ] **Étape 4 : Point de contrôle (pas de commit)**

Suite au vert. **Ne pas committer** : signaler que la Tâche 2 est prête (suggestion : `refactor(api): renomme les routes /api/caisse en /api/terminaux (+ appelants)`) et attendre l'instruction.

---

## Task 3 : Libellés UI + valeurs de seed

**Files:**
- Modify: `web/app/src/lib/seed/caisse.ts:23-37` (noms des terminaux seedés)
- Modify: composants/pages affichant « Caisse 1/principale », « Nouvelle caisse », « Sélectionner une caisse », titres de colonnes/sélecteurs liés au terminal — repérés ci-dessous.
- Test: `web/app/src/__tests__/caisse/**` (les assertions sur les libellés), e2e Cypress concernés.

**Interfaces:**
- Consumes : `prisma.terminalCaisse` (Tâche 1). Les `id` techniques de seed (`caisse-principale`, `caisse-2`) **restent inchangés** (référencés par des migrations et des fixtures) — seuls les `nom` et libellés affichés changent.

- [ ] **Étape 1 : Mettre à jour le seed**

Dans `web/app/src/lib/seed/caisse.ts`, conserver les `id` mais renommer les `nom` et la fonction :
- `seedDefaultCaisse` → `seedDefaultTerminal` (mettre à jour l'import dans le point d'entrée du seed)
- `nom: "Caisse principale"` → `nom: "Terminal principal"`
- `nom: "Caisse 2"` → `nom: "Terminal 2"`
- logs `console.log("  > Caisse: ...")` → `"  > Terminal: ..."`

```bash
cd web/app && grep -rn "seedDefaultCaisse" src   # mettre à jour l'appelant (prisma/seed)
```

- [ ] **Étape 2 : Repérer les libellés UI orientés terminal**

```bash
cd web/app
grep -rniE "caisse principale|caisse 1|caisse 2|nouvelle caisse|cr[ée]er.*caisse|s[ée]lectionner.*caisse|liste des caisses|gestion des caisses" src/components src/app
```
Pour chaque libellé qui désigne le **terminal** (création/sélection/liste de stations), remplacer « caisse » → « terminal » (ex. « Nouvelle caisse » → « Nouveau terminal », « Sélectionner une caisse » → « Sélectionner un terminal »).

> ⚠️ NE PAS renommer les libellés du **module de caisse** : « Fond de caisse », « Solde de caisse », « Mouvements de caisse », « Z de caisse », « Module Caisse », « Tiroir-caisse ». En cas de doute, le libellé désigne le module (gestion d'argent) → on le garde.

- [ ] **Étape 3 : Mettre à jour les tests dont l'assertion porte sur un libellé renommé**

```bash
cd web/app && npx vitest run
```
Ajuster les assertions `getByText("Caisse principale")` → `getByText("Terminal principal")`, etc. jusqu'au vert.

- [ ] **Étape 4 : Point de contrôle (pas de commit)**

Suite au vert. **Ne pas committer** : signaler que la Tâche 3 est prête (suggestion : `refactor(ui): libellés « terminal de caisse » (seed, composants, pages)`) et attendre l'instruction.

---

## Task 4 : Client desktop — champ config + en-tête HTTP

**Files:**
- Modify: `desktop/src/config.ts:10-14,60-64`, `config-store.ts:9,20,39,41`, `main.ts:134`, `enrollment-client.ts:6,26,37`
- Modify: `desktop/src/__tests__/config-store.test.ts`, `config.test.ts`, `enrollment-client.test.ts`
- Test: `cd desktop && npx vitest run`

**Interfaces:**
- Consumes : la réponse d'échange d'enrôlement du nœud renvoie toujours le champ `caisseId` dans son JSON **tant que** le contrat API n'est pas changé. **Décision** : on renomme le champ JSON du contrat d'enrôlement `caisseId` → `terminalId` côté nœud ET desktop de façon coordonnée (les deux sont dans ce monorepo). L'en-tête HTTP `X-Aeris-Caisse` → `X-Aeris-Terminal`.

- [ ] **Étape 1 : Aligner le contrat d'enrôlement côté nœud**

Vérifier le JSON renvoyé par l'échange d'enrôlement (nœud) :
```bash
cd /Users/amadou/Devs/projects/aerispay
grep -rn "caisseId\|codePoste" web/app/src/app/api/enrollment
```
Renommer la **clé de réponse** `caisseId` → `terminalId` dans `web/app/src/app/api/enrollment/exchange/route.ts` (et le test associé `web/app/src/__tests__/security/enrollment-exchange-api.test.ts`). Lancer `cd web/app && npx vitest run` → vert.

- [ ] **Étape 2 : Renommer dans le desktop**

Dans `desktop/src/**`, remplacer :
- `caisseId` → `terminalId` (type `PosteConfig`, `config-store`, `main`, `enrollment-client`)
- l'en-tête `"X-Aeris-Caisse"` → `"X-Aeris-Terminal"` (`config.ts:64`)
- commentaires « Identité de la caisse (poste) » → « Identité du terminal »

```bash
cd /Users/amadou/Devs/projects/aerispay/desktop
grep -rln "caisseId\|X-Aeris-Caisse" src
```

- [ ] **Étape 3 : Mettre à jour les tests desktop**

Dans `desktop/src/__tests__/**`, renommer `caisseId`→`terminalId` et `X-Aeris-Caisse`→`X-Aeris-Terminal` dans les fixtures et assertions.

- [ ] **Étape 4 : Tests desktop + nœud au vert**

```bash
cd /Users/amadou/Devs/projects/aerispay/desktop && npx vitest run
cd /Users/amadou/Devs/projects/aerispay/web/app && npx vitest run
```
Attendu : les deux suites au vert.

- [ ] **Étape 5 : Point de contrôle (pas de commit)**

Les deux suites au vert. **Ne pas committer** : signaler que la Tâche 4 est prête (suggestion : `refactor(desktop): config terminalId + en-tête X-Aeris-Terminal (contrat d'enrôlement aligné)`) et attendre l'instruction.

---

## Task 5 : Schéma cloud — `caisseId` → `terminalId`

**Files:**
- Modify: `cloud/prisma/schema.prisma:89,99,107,116` (modèles `VenteCloud`, `SessionCloud`)
- Test: `cd cloud && npx prisma validate` (le cloud n'a pas de suite de tests applicative).

**Interfaces:**
- Le cloud ingère `terminalId` comme **dimension d'agrégation** (pas de FK vers `TerminalCaisse`). Le champ JSON reçu du nœud (sync) doit donc émettre `terminalId` — vérifié en Tâche 1 (`event-emitter.ts`, `cloud-sync.ts`).

- [ ] **Étape 1 : Renommer le champ et l'index dans le schéma cloud**

Dans `cloud/prisma/schema.prisma`, modèles `VenteCloud` et `SessionCloud` :
- `caisseId String` → `terminalId String`
- commentaire « VTE-<codePoste>... » inchangé
- `@@index([magasinId, caisseId])` → `@@index([magasinId, terminalId])`

- [ ] **Étape 2 : Valider le schéma**

```bash
cd /Users/amadou/Devs/projects/aerispay/cloud && npx prisma validate
```
Attendu : « The schema is valid ».

- [ ] **Étape 3 : Vérifier le payload de sync émis par le nœud**

```bash
cd /Users/amadou/Devs/projects/aerispay
grep -rn "caisseId" web/app/src/lib/services/event-emitter.ts web/app/src/lib/services/cloud-sync.ts
```
Attendu : 0 occurrence (déjà renommé en Tâche 1). Si une subsiste, la corriger en `terminalId` et relancer `cd web/app && npx vitest run`.

- [ ] **Étape 4 : Point de contrôle (pas de commit)**

Schéma cloud valide, suite nœud au vert. **Ne pas committer** : signaler que la Tâche 5 est prête (suggestion : `refactor(cloud): dimension terminalId dans VenteCloud/SessionCloud`) et attendre l'instruction.

---

## Task 6 : Migration physique de la base (RENAME, données préservées)

**Files:**
- Modify: `web/app/prisma/schema.prisma` — **retirer** les `@@map("caisses")` / `@map("caisseId")` de transition.
- Create: `web/app/prisma/migrations/<timestamp>_rename_caisse_to_terminal/migration.sql`
- Test: `cd web/app && npx prisma migrate dev` + `npx vitest run`.

**Interfaces:**
- Consumes : modèle `TerminalCaisse` avec `@@map`/`@map` de transition (Tâche 1).
- Produces : table physique `terminaux_caisse`, colonnes `terminalId`. Aucune perte de données (RENAME, pas DROP/CREATE).

- [ ] **Étape 1 : Retirer les `@@map`/`@map` de transition dans `schema.prisma`**

- `model TerminalCaisse { ... @@map("caisses") }` → supprimer la ligne `@@map("caisses")` (la table devient `terminaux_caisse` par défaut → **non**, Prisma mappe par défaut sur le nom du modèle `TerminalCaisse`). Pour cibler `terminaux_caisse`, **remplacer** par `@@map("terminaux_caisse")`.
- Sur `StoreToken`, `EnrollmentToken`, `ComptoirSession`, `MouvementCaisse` : retirer `@map("caisseId")` des champs `terminalId` (la colonne devient `terminalId`).

- [ ] **Étape 2 : Générer le squelette de migration sans l'appliquer**

```bash
cd web/app
npx prisma migrate dev --create-only --name rename_caisse_to_terminal
```
Prisma génère un SQL **DROP/CREATE** (destructeur) — il sera **remplacé** à l'étape suivante.

- [ ] **Étape 3 : Remplacer le contenu du `migration.sql` par un RENAME non destructeur**

Écrire dans le `migration.sql` généré (MySQL 8) :

```sql
-- Renommage terminal de caisse : table + colonnes FK + index + contraintes.
-- Non destructeur (RENAME) : données préservées.

-- 1) Table principale
RENAME TABLE `caisses` TO `terminaux_caisse`;

-- 2) Colonnes FK caisseId -> terminalId (MySQL 8 : RENAME COLUMN conserve les données)
ALTER TABLE `comptoir_sessions` RENAME COLUMN `caisseId` TO `terminalId`;
ALTER TABLE `mouvements_caisse`  RENAME COLUMN `caisseId` TO `terminalId`;
ALTER TABLE `store_tokens`       RENAME COLUMN `caisseId` TO `terminalId`;
ALTER TABLE `enrollment_tokens`  RENAME COLUMN `caisseId` TO `terminalId`;

-- 3) Index (renommés pour rester alignés avec les noms générés par Prisma)
ALTER TABLE `comptoir_sessions` RENAME INDEX `comptoir_sessions_caisseId_statut_idx` TO `comptoir_sessions_terminalId_statut_idx`;
ALTER TABLE `mouvements_caisse`  RENAME INDEX `mouvements_caisse_caisseId_idx`        TO `mouvements_caisse_terminalId_idx`;
ALTER TABLE `store_tokens`       RENAME INDEX `store_tokens_caisseId_idx`             TO `store_tokens_terminalId_idx`;
ALTER TABLE `enrollment_tokens`  RENAME INDEX `enrollment_tokens_caisseId_idx`        TO `enrollment_tokens_terminalId_idx`;

-- 4) Contraintes FK (drop + recreate avec un nom aligné ; la cible devient terminaux_caisse)
ALTER TABLE `comptoir_sessions` DROP FOREIGN KEY `comptoir_sessions_caisseId_fkey`;
ALTER TABLE `comptoir_sessions` ADD CONSTRAINT `comptoir_sessions_terminalId_fkey` FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `mouvements_caisse` DROP FOREIGN KEY `mouvements_caisse_caisseId_fkey`;
ALTER TABLE `mouvements_caisse` ADD CONSTRAINT `mouvements_caisse_terminalId_fkey` FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `store_tokens` DROP FOREIGN KEY `store_tokens_caisseId_fkey`;
ALTER TABLE `store_tokens` ADD CONSTRAINT `store_tokens_terminalId_fkey` FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `enrollment_tokens` DROP FOREIGN KEY `enrollment_tokens_caisseId_fkey`;
ALTER TABLE `enrollment_tokens` ADD CONSTRAINT `enrollment_tokens_terminalId_fkey` FOREIGN KEY (`terminalId`) REFERENCES `terminaux_caisse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
```

> Note : si un nom de contrainte FK réel diffère, le retrouver via
> `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE COLUMN_NAME='caisseId' AND TABLE_SCHEMA=DATABASE();`
> avant d'écrire le `DROP FOREIGN KEY`.

- [ ] **Étape 4 : Appliquer la migration**

```bash
cd web/app && npx prisma migrate dev
```
Attendu : migration appliquée sans erreur ; `npx prisma generate` enchaîné par Prisma. Aucune dérive (`migrate dev` ne propose pas de nouvelle migration).

- [ ] **Étape 5 : Vérifier l'absence de dérive et les données**

```bash
cd web/app
npx prisma migrate status         # attendu : "Database schema is up to date"
npx prisma db seed                # le seed (Tâche 3) doit upsert sans erreur
npx vitest run                    # suite au vert
```

- [ ] **Étape 6 : Point de contrôle (pas de commit)**

Migration appliquée sans dérive, suite au vert. **Ne pas committer** : signaler que la Tâche 6 est prête (suggestion : `feat(db): migration RENAME caisses->terminaux_caisse, caisseId->terminalId (données préservées)`) et attendre l'instruction.

---

## Task 7 : Journal d'activité (`entityType`) + documentation produit

**Files:**
- Modify: `web/app/src/lib/activity-log.ts` (constante `ACTIONS.CAISSE_CREATED`, `entityType`)
- Modify: `web/app/src/app/api/terminaux/route.ts` (`entityType: "Caisse"` → `"TerminalCaisse"`)
- Modify: `docs/product/04-caisse-sessions.md`, `03-comptoir-ventes.md`, `09-pages-api.md`, `docs/product/README.md`
- Test: `web/app/src/__tests__/caisse/activity-log-actions.test.ts` + suite complète.

**Interfaces:**
- Consumes : routes `/api/terminaux` (Tâche 2). **Contrainte audit** : la **valeur string** de l'action journalisée reste stable (`"CAISSE_CREATED"`) pour ne pas fracturer l'historique ; seule la **clé de constante** TS et la valeur `entityType` (donnée de dev, base réinitialisable) sont alignées.

- [ ] **Étape 1 : Aligner la constante et `entityType`**

Dans `web/app/src/lib/activity-log.ts` :
- Renommer la **clé** `CAISSE_CREATED` → `TERMINAL_CREATED` **en conservant la valeur string** : `TERMINAL_CREATED: "CAISSE_CREATED"` (commentaire : « valeur historique conservée pour l'audit »). Mettre à jour l'unique appelant (`api/terminaux/route.ts`).
- Dans `api/terminaux/route.ts`, `entityType: "Caisse"` → `entityType: "TerminalCaisse"`.

```bash
cd web/app && grep -rn "CAISSE_CREATED" src
```

- [ ] **Étape 2 : Mettre à jour la documentation produit**

- `docs/product/04-caisse-sessions.md` : §2.1 — renommer la sous-section `Caisse` en **`TerminalCaisse` (terminal/poste de caisse)** ; ajouter une phrase liminaire distinguant **terminal** (la station) du **module de caisse** (sessions/soldes/mouvements). Renommer `caisseId`→`terminalId` dans les tableaux. Conserver le titre du document (« Module Caisse & Sessions ») — il décrit bien le module.
- `docs/product/03-comptoir-ventes.md` : numérotation « par poste » — préciser « code du terminal ».
- `docs/product/09-pages-api.md` : routes `/api/caisse` → `/api/terminaux`.
- `docs/product/README.md` : si le module « Caisse » y est listé, ajouter la mention du concept « terminal de caisse ».

- [ ] **Étape 3 : Tests au vert**

```bash
cd web/app && npx vitest run
```
Attendu : vert (dont `activity-log-actions.test.ts`).

- [ ] **Étape 4 : Point de contrôle (pas de commit)**

Suite au vert. **Ne pas committer** : signaler que la Tâche 7 est prête (suggestion : `docs(caisse): distingue terminal de caisse vs module caisse (doc produit + entityType)`) et attendre l'instruction.

---

## Task 8 : Vérification finale + suppression du plan

**Files:**
- Delete: `docs/superpowers/plans/2026-06-29-renommage-terminal-caisse.md` (ce fichier)
- Test: suites complètes nœud + desktop.

- [ ] **Étape 1 : Vérification globale**

```bash
cd /Users/amadou/Devs/projects/aerispay
# Plus aucune référence résiduelle au modèle terminal sous l'ancien nom :
grep -rn "prisma\.caisse\b" web/app/src && echo "RESTE À CORRIGER" || echo "OK prisma.caisse"
grep -rn "X-Aeris-Caisse" desktop/src web/app/src && echo "RESTE À CORRIGER" || echo "OK header"
grep -rn "/api/caisse\b" web/app/src && echo "RESTE À CORRIGER" || echo "OK routes"
cd web/app && npx tsc --noEmit && npx vitest run
cd ../desktop && npx vitest run
cd ../cloud && npx prisma validate
```
Attendu : tous « OK », `tsc` sans erreur, les deux suites au vert, schéma cloud valide.

> Les occurrences `caisseId` **résiduelles légitimes** : aucune ne doit subsister (toutes renommées). Les occurrences `caisse` légitimes restantes = module de caisse (`MouvementCaisse`, `SeuilCaisse`, `seuils_caisse`, « fond de caisse », etc.).

- [ ] **Étape 2 : Supprimer ce plan (politique éphémère, CLAUDE.md §8.1)**

```bash
cd /Users/amadou/Devs/projects/aerispay
rm docs/superpowers/plans/2026-06-29-renommage-terminal-caisse.md
```

- [ ] **Étape 3 : Point de contrôle final (pas de commit)**

Tout est vert, plan supprimé. **Ne pas committer** : signaler à l'utilisateur que le renommage est livré et que l'ensemble est prêt à committer (suggestion : `feat(caisse): renommage terminal de caisse + suppression du plan (éphémère)`), puis attendre son instruction. C'est lui qui réalise tous les commits.

---

## Self-Review (couverture de la cartographie)

- **Schéma Prisma** (modèle + 4 FK) → Tâche 1 (TS) + Tâche 6 (physique). ✔
- **Migrations** (table/colonnes/index/contraintes) → Tâche 6 avec SQL RENAME explicite. ✔
- **Routes API terminal** (`/api/caisse/**`) → Tâche 2. **Routes module** (`/api/comptoir/*`) volontairement inchangées. ✔
- **Services/lib/seed/validations** → Tâche 1 (logique) + Tâche 3 (seed `nom`/fonction). ✔
- **Composants & pages** → Tâche 1 (logique `terminalId`) + Tâche 3 (libellés). ✔
- **Tests** (nœud) → Tâche 1 (balayage) + Tâche 2 (URLs). **Tests desktop** → Tâche 4. ✔
- **Desktop** (config + en-tête + contrat enrôlement) → Tâche 4. ✔
- **Cloud** (`VenteCloud`/`SessionCloud`) → Tâche 5. ✔
- **Documentation produit** → Tâche 7. ✔
- **Journal d'activité** (`ACTIONS`, `entityType`) → Tâche 7, avec préservation des valeurs d'audit. ✔
