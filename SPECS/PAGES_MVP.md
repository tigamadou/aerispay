# Spec — Pages à implémenter (MVP)

> **Périmètre :** toutes les **routes page** (App Router) nécessaires pour livrer le MVP décrit dans `ROADMAP.md`, `ARCHITECTURE_MVP.md` et les SPECS par module.  
> **Racine des chemins de fichiers :** `web/app/` (ex. `app/(dashboard)/page.tsx`).  
> **Rôles** : `SPECS/AUTH.md` (MVP = niveau **point de vente** : `ADMIN`, `MANAGER`, `CAISSIER`).

**Légende rôles**

| Accès | Signification |
|--------|----------------|
| Tous | Tout utilisateur authentifié (`ADMIN`, `MANAGER`, `CAISSIER`) |
| `ADMIN` | Administrateur local du point de vente uniquement |
| `ADMIN` + `MANAGER` | Les deux ; `CAISSIER` exclu |
| `ADMIN` seul | Ni `MANAGER` ni `CAISSIER` |

---

## 0. Enveloppe : layout authentifié

### `app/(dashboard)/layout.tsx`

| | |
|---|---|
| **Rôle** | Shell du dashboard : sidebar, navbar, zone contenu. |
| **Actions** | Afficher la navigation selon le rôle ; afficher l’utilisateur connecté ; déconnexion. |
| **Règles** | Toute route sous `(dashboard)/` exige une **session valide** (middleware / layout). **Ne pas** afficher **Utilisateurs** si l’utilisateur n’est pas `ADMIN`. **Ne pas** afficher **Journal d’activité** si l’utilisateur n’est ni `ADMIN` ni `MANAGER`. Liens : Dashboard, Stock (sous-routes), Caisse (sous-routes), et les entrées conditionnelles ci-dessus. |

---

## 1. Authentification

### `/login` — `app/(auth)/login/page.tsx`

| | |
|---|---|
| **Accès** | Public (non connecté) ; si déjà connecté → redirection vers `/` (dashboard). |
| **Actions** | Saisir email + mot de passe ; soumettre ; afficher les erreurs de connexion. |
| **Règles** | Pas d’inscription publique, pas de lien « Créer un compte ». Mot de passe jamais loggé. En cas d’échec : message générique prudemment formulé. Sessions : `SPECS/AUTH.md`, `logActivity` sur succès/échec : `SPECS/ACTIVITY_LOG.md`. |

---

## 2. Tableau de bord

### `/` — `app/(dashboard)/page.tsx`

| | |
|---|---|
| **Accès** | Tous. |
| **Actions** | Afficher des **KPI** (CA du jour, nombre de ventes, etc.) — données via `GET /api/dashboard/kpis` (ou équivalent). Clics éventuels vers `/stock?…` (ruptures) si prévu. |
| **Règles** | `CAISSIER` voit un dashboard pertinent (caisse + indicateurs autorisés) ; pas d’exposition d’actions réservées `ADMIN` (`SPECS/AUTH.md`). Widgets type « produits en rupture » : alignés sur `SPECS/STOCK.md` (clic → liste filtrée). |

---

## 3. Utilisateurs (comptes du point de vente)

### `/users` — `app/(dashboard)/users/page.tsx`

| | |
|---|---|
| **Accès** | `ADMIN` seul. |
| **Actions** | Lister les utilisateurs (tableau) ; lien vers **Nouvel utilisateur** ; accès éventuel **édition** / **désactivation** (aligné sur API `PUT` / `users/[id]`). |
| **Règles** | `MANAGER` et `CAISSIER` : **403** ou redirection (pas d’aperçu). Données sensibles : pas d’affichage de hash de mot de passe. `SPECS/AUTH.md` ; `logActivity` : `USER_*`, `ACTIVITY_LOG.md`. |

### `/users/nouveau` — `app/(dashboard)/users/nouveau/page.tsx`

| | |
|---|---|
| **Accès** | `ADMIN` seul. |
| **Actions** | Formulaire : nom, email, mot de passe, rôle (liste dérivée de l’`enum` Prisma) ; soumission → `POST /api/users`. |
| **Règles** | Validation côté client (Zod) + serveur. Rôles autorisés à l’attribution : selon le modèle (ex. `CAISSIER`, `MANAGER`, `ADMIN` — ne pas promouvoir à la légère). Aucun compte sans action `ADMIN`. |

---

## 4. Journal d’activité (audit)

### `/activity-logs` — `app/(dashboard)/activity-logs/page.tsx`

| | |
|---|---|
| **Accès** | `ADMIN` + `MANAGER` (lecture seule). `CAISSIER` : ne doit pas atteindre la page (menu absent + 403 côté API). |
| **Actions** | Tableau paginé ; filtres (dates, type d’action, acteur, entité) ; affichage colonnes (date, acteur, action, entité, résumé, IP optionnelle). |
| **Règles** | Données de `ActivityLog` **append-only** côté métier ; pas de modification utilisateur. Pas de secrets dans l’affichage. `GET /api/activity-logs` : `SPECS/ACTIVITY_LOG.md`. |

---

## 5. Module Stock

### `/stock` — `app/(dashboard)/stock/page.tsx`

| | |
|---|---|
| **Accès** | Tous (lecture) ; `CAISSIER` : **pas** d’action de création/édition de fiche produit (boutons masqués + API 403). |
| **Actions** | Liste produits (colonnes, tri, pagination) ; **filtres** (catégorie, statut stock, actif/inactif, recherche) ; aller en **détail** / **créer** (si rôle) ; raccourci **entrée stock** si prévu. |
| **Règles** | 20 produits / page côté serveur ; statuts de stock (normal, alerte, rupture) : `SPECS/STOCK.md` ; `CAISSIER` ne modifie pas le catalogue. |

### `/stock/nouveau` — `app/(dashboard)/stock/nouveau/page.tsx`

| | |
|---|---|
| **Accès** | `ADMIN` + `MANAGER` uniquement. |
| **Actions** | Formulaire **création** (informations, prix & TVA, stock initial via mouvement si modèle) ; génération **référence** auto si vide ; aperçu marge. |
| **Règles** | `ProductSchema` : `SPECS/STOCK.md` (prix vente > achat, barcode unique, etc.). `CAISSIER` : **403** à la page et à l’API. `logActivity` : `PRODUCT_CREATED` si applicable. |

### `/stock/[id]` — `app/(dashboard)/stock/[id]/page.tsx`

| | |
|---|---|
| **Accès** | Même règle que **nouveau** : édition réservée `ADMIN` + `MANAGER` ; un `CAISSIER` pourrait n’avoir qu’une **vue lecture** si on le spécifie (par défaut MVP : pas d’édition pour `CAISSIER`). |
| **Actions** | Voir fiche produit ; **mettre à jour** ; **désactiver** (soft `active = false` — jamais suppression physique). |
| **Règles** | Produit inactif : invisible au POS, conservé en historique vente. Même validation Zod qu’en création. `PRODUCT_UPDATED` / `PRODUCT_DEACTIVATED`. |

### `/stock/categories` — `app/(dashboard)/stock/categories/page.tsx`

| | |
|---|---|
| **Accès** | `ADMIN` + `MANAGER`. `CAISSIER` : 403. |
| **Actions** | Liste des catégories (nombre de produits) ; création (inline ou modale) ; **suppression** seulement si **aucun** produit rattaché. |
| **Règles** | Nom de catégorie unique. `CATEGORY_*` : `ACTIVITY_LOG.md`. |

### `/stock/mouvements` — `app/(dashboard)/stock/mouvements/page.tsx`

| | |
|---|---|
| **Accès** | `ADMIN` + `MANAGER` uniquement (mouvements = gestion de stock, hors rôle `CAISSIER` au MVP : masquer l’entrée de menu + **403** côté API). |
| **Actions** | **Formulaire** : produit, type, quantité, référence, motif (obligatoire **ADJUSTMENT** / **LOSS**) ; **tableau** historique avec filtres (produit, type, période) ; **export CSV** (si spécifié). |
| **Règles** | Types `IN` / `OUT` / `ADJUSTMENT` / `RETURN` / `LOSS` : `SPECS/STOCK.md` ; pas de sortie > stock disponible (hors ajustement négocié) ; `STOCK_MOVEMENT_CREATED`. |

---

## 6. Module Caisse (POS)

### `/caisse` — `app/(dashboard)/caisse/page.tsx`

| | |
|---|---|
| **Accès** | Tous. |
| **Actions** | Recherche / **douchette** (focus, `Enter` fin de scan) ; **grille** produits (par catégorie) ; **panier** (Zustand) : lignes, quantités, remise globale, vider ; **ouvrir modale paiement** ; après succès : ticket / PDF / impression thermique / tiroir. |
| **Règles** | **Vente** uniquement si **session de caisse ouverte** pour l’utilisateur (ou règle `CAISSE.md` : pas de vente sans session). Scan : ordre `barcode` → `reference` → recherche ; **pas** d’ajout si produit inactif. Paiement : `POST /api/ventes` ; max 2 modes ; pas de vente stock insuffisant. Erreur imprimante/tiroir : **n’annule pas** la vente (`SPECS/PERIPHERIQUES.md`, `CAISSE.md`). |

### `/caisse/sessions` — `app/(dashboard)/caisse/sessions/page.tsx`

| | |
|---|---|
| **Accès** | Tous. |
| **Actions** | **Ouvrir** session (fond de caisse initial) si aucune session ouverte pour ce caissier ; vue **session active** : totaux live, comptage transactions, **fermer** session. **Clôturer la session d’un autre** : réservé `ADMIN` + `MANAGER` (`CAISSE.md`, `AUTH.md`). |
| **Règles** | **Une** session `OPEN` par caissier (conflit → 409). Clôture : saisie montant compté, écart théorique vs compté, `CASH_SESSION_CLOSED` ; export récap **PDF** si prévu. `CAISSE.md`. |

### `/caisse/ventes` — `app/(dashboard)/caisse/ventes/page.tsx`

| | |
|---|---|
| **Accès** | Tous (liste). |
| **Actions** | Tableau : n°, date, caissier, total, modes de paiement, statut ; **filtres** ; **voir ticket** (PDF) ; **annuler vente** (bouton seulement si rôle + statut). |
| **Règles** | **Annulation** : `ADMIN` + `MANAGER` uniquement ; `COMPLETED` uniquement ; **restauration stock** + `RETURN` ; `CAISSIER` → 403. `SALE_CANCELLED` ; `VENTES` / tickets : liens `SPECS/CAISSE.md`, `IMPRESSION.md`. |

### `/caisse/tickets/[id]` — `app/(dashboard)/caisse/tickets/[id]/page.tsx`

| | |
|---|---|
| **Accès** | Tous (tickets du périmètre de la base / droits de lecture). |
| **Actions** | Aperçu cohérent ticket ; **Télécharger PDF** → `GET /api/tickets/[id]/pdf` ; **Imprimer** thermique → `POST /api/tickets/[id]/print` ; retour. |
| **Règles** | `SPECS/IMPRESSION.md` ; en-têtes `Content-Disposition` ; erreur d’impression = message, pas rollback métier. |

---

## 7. Synthèse : matrice page × rôle (aperçu)

| Page | `ADMIN` | `MANAGER` | `CAISSIER` |
|------|:-------:|:---------:|:----------:|
| Login | ✓ (public) | idem | idem |
| Dashboard `/` | ✓ | ✓ | ✓ |
| `/users`, `/users/nouveau` | ✓ | — | — |
| `/activity-logs` | ✓ | ✓ (lecture) | — |
| `/stock` liste | ✓ (édition) | ✓ (édition) | ✓ (lecture si exposé) |
| `/stock/nouveau`, `/stock/[id]` (édit) | ✓ | ✓ | — |
| `/stock/categories` | ✓ | ✓ | — |
| `/stock/mouvements` | ✓ | ✓ | — |
| `/caisse` | ✓ | ✓ | ✓ |
| `/caisse/sessions` | ✓ | ✓ | ✓ |
| `/caisse/ventes` (annulation) | ✓ annul. | ✓ annul. | — |
| `/caisse/tickets/[id]` | ✓ | ✓ | ✓ |

*(Mouvements de stock : `CAISSIER` exclu — `SPECS/AUTH.md`.)*

---

## 8. Spécifications liées (par thème)

| Thème | Documents |
|--------|------------|
| Rôles & règles d’accès | `SPECS/AUTH.md`, `ARCHITECTURE_MVP.md` §8 |
| Stock & mouvements | `SPECS/STOCK.md` |
| Caisse, sessions, ventes, annulation | `SPECS/CAISSE.md` |
| PDF, thermique, tiroir | `SPECS/IMPRESSION.md`, `SPECS/PERIPHERIQUES.md` |
| Audit | `SPECS/ACTIVITY_LOG.md` |
| Multi-PDV (futur) | `SPECS/MULTI_ORGANISATION.md` |

---

## 9. TDD (rappel)

Pour chaque page, les **tests** (Playwright e2e pour les parcours critiques, React Testing Library pour l’interactivité, règles côté API en Vitest) doivent précéder ou accompagner strictement l’implémentation, conformément à `CONVENTIONS.md` et `ROADMAP.md`.

---

*AerisPay — Spec inventaire pages MVP — Avril 2026*
