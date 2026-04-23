# AerisPay — TODO Sprint Actuel

> **Phase en cours :** Phase 0 — Fondations  
> **Dernière mise à jour :** 23 Avril 2026  
> **Prochain ticket :** SETUP-01

---

## 🔴 En cours

_Aucune tâche en cours — prêt à démarrer_

---

## 🟡 À faire — Phase 0 (Fondations)

### SETUP-01 — Initialisation du projet Next.js
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Spec :** `CLAUDE.md` section 2 (Stack)

**Instructions :**
```bash
npx create-next-app@latest aerispay \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd aerispay

# Installer les dépendances principales
npm install @prisma/client prisma next-auth@beta \
  @auth/prisma-adapter zod react-hook-form \
  @hookform/resolvers zustand @tanstack/react-query \
  @tanstack/react-query-devtools bcryptjs

# Installer shadcn/ui
npx shadcn@latest init
# Sélectionner: Default style, Slate color, CSS variables: Yes
npx shadcn@latest add button input label card table \
  dialog sheet badge select toast form

# Dépendances développement
npm install -D @types/bcryptjs vitest @vitejs/plugin-react \
  @testing-library/react @testing-library/user-event \
  @playwright/test prettier eslint-config-prettier
```

**Critères d'acceptation :**
- [ ] `npm run dev` démarre sans erreur sur `localhost:3000`
- [ ] TypeScript strict mode activé dans `tsconfig.json`
- [ ] Prettier configuré avec `.prettierrc`
- [ ] ESLint configuré avec règles strictes
- [ ] Alias `@/*` fonctionnel

---

### SETUP-02 — Configuration Prisma + MySQL
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Dépend de :** SETUP-01  
**Spec :** `ARCHITECTURE_MVP.md` section 4

**Instructions :**
1. Copier le schéma Prisma complet depuis `ARCHITECTURE_MVP.md` section 4.1
2. Créer `lib/db.ts` avec le singleton Prisma (voir `CONVENTIONS.md` section 6)
3. Configurer `.env.local` avec `DATABASE_URL`
4. Lancer `npx prisma migrate dev --name init`
5. Vérifier avec `npx prisma studio`

**Critères d'acceptation :**
- [ ] Toutes les tables créées en DB
- [ ] `npx prisma studio` accessible et tables visibles
- [ ] Pas d'erreur TypeScript sur les types Prisma générés

---

### SETUP-03 — Authentification NextAuth.js v5
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Dépend de :** SETUP-02  
**Spec :** `SPECS/AUTH.md`

**Fichiers à créer :**
- `lib/auth.ts` — configuration NextAuth
- `app/api/auth/[...nextauth]/route.ts`
- `middleware.ts` — protection des routes
- `app/(auth)/login/page.tsx`
- `app/(auth)/login/LoginForm.tsx`
- **Pas** de page `/register` ni d'inscription publique
- `app/api/users/route.ts` + `app/api/users/[id]/route.ts` — CRUD restreint au rôle `ADMIN` uniquement
- `app/(dashboard)/users/page.tsx` + `nouveau/page.tsx` + composants (voir `SPECS/AUTH.md`)

**Critères d'acceptation :**
- [ ] Login email/password fonctionnel
- [ ] Session JWT avec `{ id, name, email, role }` (aligner les clés sur le modèle)
- [ ] Route `/` redirige vers `/login` si non connecté
- [ ] Route `/login` redirige vers `/` si déjà connecté
- [ ] Logout fonctionnel
- [ ] Seul un `ADMIN` peut lister / créer / modifier des utilisateurs (403 pour les autres rôles)

---

### SETUP-04 — Layout principal
**Assigné à :** Agent  
**Priorité :** 🟡 Haute  
**Dépend de :** SETUP-03  

**Fichiers à créer :**
- `app/(dashboard)/layout.tsx`
- `components/shared/Sidebar.tsx`
- `components/shared/Navbar.tsx`
- `components/shared/KPICard.tsx`
- `app/(dashboard)/page.tsx` (dashboard vide)

**Critères d'acceptation :**
- [ ] Sidebar avec liens : Dashboard, Stock, Caisse ; **Utilisateurs** si `ADMIN` ; **Journal d’activité** si `ADMIN` ou `MANAGER` (cf. `SPECS/ACTIVITY_LOG.md`)
- [ ] Navbar avec nom utilisateur et bouton déconnexion
- [ ] Layout responsive (mobile: sidebar collapsible)
- [ ] Page dashboard affiche "Bienvenue, [Nom]"

---

### SETUP-05 — Seed de base de données
**Assigné à :** Agent  
**Priorité :** 🟡 Haute  
**Dépend de :** SETUP-02  

**Fichier à créer :** `prisma/seed.ts`

**Données à créer :**
- 1 Admin : `admin@aerispay.com` / `Admin@1234` / rôle ADMIN
- 1 Manager : `manager@aerispay.com` / `Manager@1234` / rôle MANAGER
- 1 Caissier : `caissier@aerispay.com` / `Caissier@1234` / rôle CAISSIER
- 5 catégories : Alimentation, Boissons, Hygiène, Électronique, Divers
- 20 produits réalistes avec prix et stock variés (certains en alerte)

**Critères d'acceptation :**
- [ ] `npx prisma db seed` sans erreur
- [ ] 3 utilisateurs créés avec hash bcrypt correct
- [ ] 20 produits avec stock varié (certains sous seuil minimum)
- [ ] Les 3 comptes peuvent se connecter

---

## ✅ Terminé

- [x] Architecture définie (`ARCHITECTURE_MVP.md`)
- [x] Schéma Prisma complet rédigé
- [x] Roadmap complète (`ROADMAP.md`)
- [x] Specs fonctionnelles rédigées (`SPECS/`)
- [x] Conventions de code définies (`CONVENTIONS.md`)
- [x] Fichier de consignes agents (`CLAUDE.md`)

---

## 📋 Instructions pour l'Agent qui prend ce TODO

1. **Commence toujours par lire** `CLAUDE.md` en entier
2. **Prends le premier ticket** non commencé de la section "À faire"
3. **Lis la spec** correspondante avant de coder
4. **Respecte les conventions** de `CONVENTIONS.md`
5. **Marque la tâche ✅** une fois terminée et les critères validés
6. **Passe au ticket suivant** dans l'ordre de priorité

> ⚠️ Ne jamais créer de fichiers en dehors de la structure définie dans `CLAUDE.md`  
> ⚠️ Ne jamais modifier les fichiers de documentation (CLAUDE.md, ROADMAP.md, SPECS/)  
> ⚠️ Toujours écrire des tests pour le code produit

---

*Mis à jour le : 23 Avril 2026*
