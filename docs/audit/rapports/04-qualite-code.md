# Rapport d'Audit — Qualite Code & Pages UI

> **Agent :** Agent 4
> **Date :** 2026-05-04
> **Statut :** TERMINE

---

## Resume executif

L'application AerisPay presente une bonne qualite de code globale avec une structure claire, des composants bien types et une coherence UI satisfaisante. Les principaux problemes identifies sont : (1) l'absence totale de mapping Prisma FR vers DTO EN dans les reponses API, en violation directe de CONVENTIONS.md section 5.1 ; (2) l'utilisation systematique de `fetch()` brut sans TanStack Query dans les composants client, contrairement aux conventions ; (3) l'absence de toast notifications pour le feedback utilisateur ; (4) plusieurs composants et fichiers non references (code mort) ; (5) des pages hors spec (caisse, parametres, taxes) qui ajoutent du scope non documente. TypeScript strict est bien respecte (aucun `any`), et les props sont systematiquement typees avec des interfaces nommees.

---

## 1. Conformite PAGES_MVP.md

### Pages prevues vs implementees

| Page spec | Route implementee | Statut | Actions/Roles corrects |
|-----------|-------------------|--------|----------------------|
| `(dashboard)/layout.tsx` | `src/app/(dashboard)/layout.tsx` | OK | Oui - navigation conditionnelle par role, liens Users/Journal masques |
| `/login` | `src/app/(auth)/login/page.tsx` | OK | Oui - pas de lien inscription |
| `/` (dashboard) | `src/app/(dashboard)/page.tsx` | OK | Oui - vue differenciee CAISSIER vs ADMIN/MANAGER |
| `/users` | `src/app/(dashboard)/users/page.tsx` | OK | Oui - ADMIN seul verifie |
| `/users/nouveau` | `src/app/(dashboard)/users/nouveau/page.tsx` | OK | Oui - ADMIN seul |
| `/activity-logs` | `src/app/(dashboard)/activity-logs/page.tsx` | OK | Oui - ADMIN + MANAGER via `requireRole` dans API |
| `/stock` | `src/app/(dashboard)/stock/page.tsx` | PARTIEL | Roles: CAISSIER redirige vers `/` au lieu d'avoir lecture seule (spec dit lecture possible) |
| `/stock/nouveau` | `src/app/(dashboard)/stock/nouveau/page.tsx` | OK | Oui - ADMIN + MANAGER |
| `/stock/[id]` | `src/app/(dashboard)/stock/[id]/page.tsx` | OK | Oui |
| `/stock/categories` | `src/app/(dashboard)/stock/categories/page.tsx` | OK | Oui - ADMIN + MANAGER |
| `/stock/mouvements` | `src/app/(dashboard)/stock/mouvements/page.tsx` | OK | Oui - ADMIN + MANAGER |
| `/comptoir` | `src/app/(dashboard)/comptoir/page.tsx` | OK | Oui - session requise pour CAISSIER |
| `/comptoir/sessions` | `src/app/(dashboard)/comptoir/sessions/page.tsx` | OK | Oui |
| `/comptoir/ventes` | `src/app/(dashboard)/comptoir/ventes/page.tsx` | OK | Oui - annulation ADMIN/MANAGER |
| `/comptoir/tickets/[id]` | `src/app/(dashboard)/comptoir/tickets/[id]/page.tsx` | OK | Oui |

### Pages hors spec (ajoutees)

| Route | Module | Utilite | Recommandation |
|-------|--------|---------|---------------|
| `/caisse` | caisse | Tableau de bord caisse (soldes, mouvements recents). Fonctionnel, bien integre dans la navigation. | Ajouter a PAGES_MVP.md |
| `/caisse/mouvements` | caisse | Liste complete des mouvements de caisse. Fonctionnel. | Ajouter a PAGES_MVP.md |
| `/caisse/mouvements/nouveau` | caisse | Formulaire apport/retrait/depense. Fonctionnel. | Ajouter a PAGES_MVP.md |
| `/comptoir/ecarts` | comptoir | Historique des ecarts de caisse par session. Utile, bien code. | Ajouter a PAGES_MVP.md |
| `/comptoir/discrepancies` | comptoir | Vue ecarts par mode de paiement (ecartsParMode JSON). Fonctionnel. | Consolider avec `/comptoir/ecarts` ou documenter |
| `/comptoir/discrepancies/recurring` | comptoir | Alertes caissiers recurrents. Fonctionnel. | Documenter dans la spec |
| `/parametres` | parametres | Configuration commerce (nom, adresse, modes paiement). Fonctionnel. | Ajouter a PAGES_MVP.md |
| `/taxes` | parametres | Configuration des taxes (TVA, AIB). Fonctionnel. | Ajouter a PAGES_MVP.md |
| `/activity-logs/[id]` | audit | Detail d'un log d'activite. | Non prevu dans spec mais utile |
| `/comptoir/sessions/[id]` | comptoir | Detail d'une session. Fonctionnel. | Ajouter a PAGES_MVP.md |
| `/comptoir/ventes/[id]` | comptoir | Detail d'une vente. | Non prevu dans spec mais utile |
| `/users/[id]` | users | Edition utilisateur. | Non prevu explicitement mais coherent avec API PUT |

---

## 2. Conformite CONVENTIONS.md

### Nommage

| Regle | Conforme | Fichiers non conformes |
|-------|----------|----------------------|
| Composants PascalCase | OUI | Tous les composants respectent PascalCase |
| Pages kebab-case | OUI | Dossiers kebab-case ou parametres dynamiques |
| Variables/fonctions anglais | PARTIEL | Variables mixtes FR/EN dans les pages (ex: `serialized`, `allClosed`, mais aussi `formatMontant`, `mouvementsAujourdhui`) |
| Stores camelCase+Store | OUI | `cartStore.ts`, `offlineStore.ts` |

### Mapping Prisma FR vers DTO EN

| Route API | Mapping correct | Champs exposes bruts |
|-----------|----------------|---------------------|
| `GET /api/produits` | NON | Retourne `nom`, `prixAchat`, `prixVente`, `stockActuel`, `stockMinimum`, `codeBarres`, `categorieId`, `actif` directement |
| `POST /api/produits` | NON | Retourne l'objet Prisma serialise (champs FR) |
| `GET /api/categories` | NON | Retourne `nom`, `description`, `couleur` |
| `GET /api/users` | NON | Retourne `nom`, `email`, `role`, `actif`, `motDePasse` (exclue mais pas remappee) |
| `GET /api/ventes` | NON | Retourne champs Prisma bruts (`dateVente`, `sousTotal`, `caissier.nom`) |
| `GET /api/activity-logs` | NON | Retourne champs Prisma bruts |
| `GET /api/comptoir/sessions` | NON | Retourne champs Prisma bruts |
| `GET /api/dashboard/kpis` | PARTIEL | Certains champs remappes EN (`revenue`, `salesCount`) mais inclut `ouvertureAt`, `montantOuvertureCash` |
| `GET /api/stock/mouvements` | NON | Retourne champs Prisma bruts |

**Conclusion :** Aucune route API ne respecte la convention 5.1 de mapping Prisma FR vers DTO EN. Toutes les reponses exposent directement les champs francais du schema Prisma.

### Structure fichiers (imports, types, composant)

- **Conformes :** La majorite des fichiers respectent l'ordre imports externes puis internes puis types puis composant. Exemples : `POSInterface.tsx`, `SessionManager.tsx`, `ProductForm.tsx`
- **Non conformes :** Les pages server-side (ex: `comptoir/ventes/page.tsx`) declarent des fonctions utilitaires (`fmt`, `KpiCard`, `VenteFilterSelect`) apres le composant principal, ce qui est acceptable mais non standard.

---

## 3. Patterns React

### Gestion de donnees

| Composant/Page | TanStack Query | Fetch brut | Commentaire |
|----------------|---------------|------------|-------------|
| DashboardCharts | NON | OUI | `fetch("/api/dashboard/kpis")` dans useEffect |
| CaissierDashboard | NON | OUI | `fetch("/api/dashboard/kpis")` dans useEffect |
| SessionManager | NON | OUI | `fetch("/api/comptoir/sessions")` + `fetch("/api/parametres/modes-paiement")` |
| MouvementsListe | NON | OUI | Multiples `fetch()` dans useEffect |
| NouveauMouvementForm | NON | OUI | `fetch("/api/caisse")` + `fetch("/api/parametres/modes-paiement")` |
| ProductForm | NON | OUI | `fetch("/api/upload")`, `fetch(url, ...)` |
| CategoryManager | NON | OUI | `fetch("/api/categories", ...)` |
| TaxesSection | NON | OUI | Multiples `fetch("/api/taxes/...")` |
| ModesPaiementSection | NON | OUI | Multiples `fetch("/api/parametres/modes-paiement/...")` |
| UsersTable | NON | OUI | `fetch("/api/users/...")` |
| POSInterface | NON | OUI | `fetch("/api/ventes", ...)` |

**Conclusion :** TanStack Query n'est jamais utilise dans le projet. Le repertoire `hooks/` n'existe meme pas. Tous les composants client utilisent `fetch()` brut avec `useState`/`useEffect`.

### Gestion d'erreurs client

| Page/Composant | Toast erreur | Fallback UI | Loading state |
|------|-------------|-------------|---------------|
| DashboardCharts | NON | NON (console.error) | OUI (squelette) |
| SessionManager | NON | NON (alert) | OUI |
| POSInterface | NON | NON (alert) | OUI |
| ProductForm | NON | NON (alert) | OUI |
| CategoryManager | NON | NON (alert) | OUI |
| UsersTable | NON | NON (alert) | NON |
| MouvementsListe | NON | NON | OUI |

**Conclusion :** Aucun composant n'utilise de toast notifications (ni sonner, ni react-hot-toast). La plupart utilisent `alert()` ou `console.error` pour les erreurs. Les conventions exigent l'utilisation de `toast.success()` / `toast.error()`.

### Hooks personnalises

| Hook | Fichier | Conforme | Commentaire |
|------|---------|----------|-------------|
| N/A | N/A | NON | Le repertoire `hooks/` n'existe pas. Aucun hook TanStack Query n'a ete cree. |

---

## 4. TypeScript strict

| Probleme | Fichier(s) | Ligne(s) |
|----------|-----------|----------|
| Usage de `any` | Aucun | 0 occurrence dans `src/` (hors tests) |
| Usage de `as unknown` | `src/lib/db.ts` | L:3 — Pattern singleton Prisma (acceptable, mentionne dans CONVENTIONS.md) |
| Usage de `as unknown` | `src/app/api/comptoir/discrepancies/route.ts` | L:25 — `null as unknown as undefined` (hack Prisma) |
| Usage de `as unknown` | `src/app/api/comptoir/discrepancies/recurring/route.ts` | L:31 — idem |
| Props non typees | Aucun | Tous les composants ont des interfaces Props nommees |
| Retour API non type | Toutes les routes API | Aucune route n'a de type de retour explicite sur les fonctions GET/POST |

---

## 5. Code mort & duplication

### Code mort

| Fichier | Description |
|---------|-------------|
| `src/components/stock/ProductsTable.tsx` | Composant jamais importe nulle part dans le code applicatif. Remplace par `ProductsGrid.tsx`. |
| `src/store/offlineStore.ts` | Store Zustand importe uniquement dans un fichier de test (`__tests__/caisse/offline-store.test.ts`), jamais utilise dans le code applicatif. |
| `src/components/shared/` | Le repertoire prevu par l'architecture (`Navbar.tsx`, `Sidebar.tsx`, `KPICard.tsx`, `DataTable.tsx`) n'existe pas. Ces composants sont soit inline dans les pages, soit non crees. |

### Duplication

| Pattern duplique | Fichiers concernes | Suggestion |
|-----------------|-------------------|------------|
| `formatMontant()` redefinie localement | `caisse/page.tsx` (L:44), `comptoir/discrepancies/page.tsx` (L:95), `comptoir/ventes/page.tsx` (L:27) | Utiliser `formatMontant` de `@/lib/utils` partout |
| `modeLabel` (mapping codes paiement vers labels) | `caisse/page.tsx`, `comptoir/ecarts/page.tsx`, `comptoir/discrepancies/page.tsx`, `comptoir/ventes/page.tsx` | Extraire dans `@/lib/constants.ts` |
| `statutLabel` (mapping statuts session) | `comptoir/sessions/page.tsx`, `comptoir/ecarts/page.tsx`, `comptoir/discrepancies/page.tsx` | Extraire dans `@/lib/constants.ts` |
| `KpiCard` composant local | `(dashboard)/page.tsx` (L:313), `comptoir/ventes/page.tsx` (L:368) | Extraire dans `@/components/shared/KPICard.tsx` |
| Logique calcul ecarts (totalExcedent/totalManquant) | `(dashboard)/page.tsx`, `comptoir/ecarts/page.tsx`, `api/dashboard/kpis/route.ts` | Extraire dans un utilitaire |

### Imports inutilises

| Fichier | Imports |
|---------|---------|
| `comptoir/ventes/page.tsx` | `VenteFilterDate` (composant local, parametre `filterUrl` declare dans le type mais non utilise dans le corps) |

---

## 6. Qualite UI / Tailwind

| Page | Coherence UI | Classes organisees | Responsive | Accessibilite |
|------|--------------|--------------------|------------|---------------|
| Dashboard `/` | Bonne | Oui | Oui (grid responsive) | Labels manquants sur KPI cards |
| Stock `/stock` | Bonne | Oui | Oui | Labels sur filtres OK |
| Comptoir `/comptoir` | Bonne | Oui | Partielle (POSInterface complexe) | SVG sans aria-label |
| Ventes `/comptoir/ventes` | Bonne | Oui | Oui | OK |
| Sessions | Bonne | Oui | Oui | OK |
| Caisse | Bonne | Oui | Oui | OK |
| Ecarts | Bonne | Oui | Oui | OK |
| Parametres | Bonne | Oui | Non (max-w-2xl fixe) | OK |

Les couleurs semantiques AerisPay (green/orange/red pour stock, indigo pour primaire) sont correctement appliquees. Le mode dark est supporte partout.

---

## 7. Problemes trouves

| ID | Impact | Description | Fichier(s) | Recommandation |
|----|--------|-------------|-----------|----------------|
| QUAL-001 | Haute | Aucun mapping Prisma FR vers DTO EN dans les reponses API. Toutes les routes retournent les champs francais bruts (`nom`, `prixVente`, `stockActuel`, etc.) contrairement a CONVENTIONS.md section 5.1. | Toutes les routes dans `src/app/api/` | Implementer un mapping systematique dans chaque route ou creer des fonctions de serialisation par entite |
| QUAL-002 | Haute | TanStack Query jamais utilise. Le repertoire `hooks/` n'existe pas. Tous les composants client utilisent `fetch()` brut avec useEffect, sans cache, sans invalidation, sans retry. | Tous les composants `"use client"` | Creer le repertoire `hooks/` et migrer vers TanStack Query comme indique dans CONVENTIONS.md section 4 |
| QUAL-003 | Moyenne | Aucune toast notification implementee. Les composants utilisent `alert()` natif pour le feedback utilisateur. Ni `sonner` ni `react-hot-toast` ne sont utilises. | Composants client (ProductForm, CategoryManager, SessionManager, etc.) | Installer sonner, ajouter le Toaster au layout, remplacer les alert() |
| QUAL-004 | Moyenne | `ProductsTable.tsx` est un composant mort — jamais importe. Remplace par `ProductsGrid.tsx`. | `src/components/stock/ProductsTable.tsx` | Supprimer le fichier ou le referencier |
| QUAL-005 | Basse | `offlineStore.ts` n'est utilise que dans un test. Le store n'est jamais importe dans du code applicatif. | `src/store/offlineStore.ts` | Soit l'integrer dans le composant POS (feature offline), soit le supprimer si non prevu au MVP |
| QUAL-006 | Moyenne | `formatMontant()` redefinit localement dans 3 pages au lieu d'utiliser la version centralisee de `@/lib/utils`. | `caisse/page.tsx:44`, `comptoir/discrepancies/page.tsx:95`, `comptoir/ventes/page.tsx:27` | Remplacer par import de `@/lib/utils` |
| QUAL-007 | Basse | Dictionnaires `modeLabel`, `statutLabel` dupliques dans 4+ fichiers. | Pages caisse, ecarts, discrepancies, ventes | Extraire dans `@/lib/constants.ts` |
| QUAL-008 | Basse | Le composant `KpiCard` est defini localement dans 2 pages distinctes. Architecture prevoit `components/shared/KPICard.tsx` qui n'existe pas. | `(dashboard)/page.tsx:313`, `comptoir/ventes/page.tsx:368` | Creer le composant partage |
| QUAL-009 | Basse | Les routes API n'ont pas de type de retour explicite sur les fonctions exportees (`GET`, `POST`). TypeScript infere correctement mais les conventions demandent un type explicite. | Toutes les routes API | Ajouter `: Promise<Response>` ou un type specifique |
| QUAL-010 | Basse | `null as unknown as undefined` utilise comme hack Prisma pour filtrer les champs JSON non-null. | `api/comptoir/discrepancies/route.ts:25`, `api/comptoir/discrepancies/recurring/route.ts:31` | Utiliser une approche Prisma native (`isNot: null` via `JsonNullableFilter`) ou documenter le workaround |
| QUAL-011 | Moyenne | La page `/stock` redirige les CAISSIER vers `/` au lieu de leur offrir un acces lecture seule comme indique dans PAGES_MVP.md (section 5, tableau recapitulatif). | `src/app/(dashboard)/stock/page.tsx:37-39` | Permettre lecture seule en masquant les boutons d'action |
| QUAL-012 | Basse | Le repertoire `components/shared/` prevu par l'architecture (Navbar, Sidebar, KPICard, DataTable) n'existe pas. La navigation est directement dans le layout. | Architecture non respectee | Acceptable (navbar dans layout est un pattern Next.js valide) mais documenter la divergence |
| QUAL-013 | Moyenne | 9 pages/routes implementees ne sont pas documentees dans PAGES_MVP.md (caisse, parametres, taxes, ecarts, discrepancies, sessions/[id], ventes/[id], activity-logs/[id], users/[id]). | Fichiers SPECS/ | Mettre a jour PAGES_MVP.md pour refleter la realite du code |

---

## 8. Recommandations

### Priorite haute

1. **QUAL-001 — Mapping API** : Creer des fonctions de serialisation (`toProduitDTO`, `toUserDTO`, `toVenteDTO`, etc.) dans `lib/dto/` et les appliquer dans toutes les routes. C'est une violation majeure de CONVENTIONS.md qui impacte la coherence de l'API publique.

2. **QUAL-002 — TanStack Query** : Installer `@tanstack/react-query`, creer le repertoire `hooks/` avec un hook par ressource (`useProduits.ts`, `useVentes.ts`, etc.), et migrer progressivement les composants client. Cela apportera cache, invalidation, retry automatique et une meilleure UX.

### Priorite moyenne

3. **QUAL-003 — Toast notifications** : Installer `sonner`, ajouter `<Toaster />` dans le layout racine, remplacer tous les `alert()` par `toast.success/error`.

4. **QUAL-006/007/008 — Deduplication** : Creer `lib/constants.ts` pour les dictionnaires partages et `components/shared/KPICard.tsx` pour le composant reutilisable.

5. **QUAL-011 — Acces stock CAISSIER** : Modifier la page stock pour permettre la lecture sans boutons d'action pour les CAISSIER.

6. **QUAL-013 — Documentation** : Mettre a jour PAGES_MVP.md pour inclure les pages ajoutees.

### Priorite basse

7. **QUAL-004/005 — Code mort** : Supprimer `ProductsTable.tsx`. Evaluer si `offlineStore.ts` est prevu pour une feature future ou doit etre retire.

8. **QUAL-009/010** : Ajouter types de retour explicites sur les routes API. Remplacer les hacks `as unknown`.
