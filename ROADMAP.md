# AerisPay — Roadmap de Développement

> **Méthodologie :** Sprints de 1 semaine · Chaque tâche = 1 ticket agent IA · **TDD obligatoire**  
> **Statuts :** `[ ]` À faire · `[→]` En cours · `[x]` Terminé · `[!]` Bloqué

---

## Vue d'Ensemble

```
Phase 0 — Fondations (Semaine 1)
  └─ Setup projet, DB, auth, layout de base

Phase 1 — Module Stock (Semaines 2–3)
  └─ CRUD produits, catégories, mouvements, alertes

Phase 2 — Module Caisse (Semaines 4–5)
  └─ Interface POS, ventes, paiements, sessions, douchette code-barres, tiroir-caisse

Phase 3 — Impression (Semaine 6)
  └─ Tickets PDF normalisés + imprimante thermique ESC/POS

Phase 4 — Dashboard & Rapports (Semaine 7)
  └─ KPIs, graphiques, exports

Phase 5 — Qualité & Déploiement (Semaine 8)
  └─ Tests, optimisations, mise en production
```

---

## Règle TDD

Chaque fonctionnalité de cette roadmap se développe en **tests d’abord** : écrire les tests Vitest, React Testing Library ou Playwright qui décrivent le comportement attendu, les faire échouer si possible, puis implémenter le code jusqu’à ce qu’ils passent. Les critères de succès incluent toujours les tests ciblés du ticket, même si la ligne ne le répète pas explicitement.

---

## Phase 0 — Fondations du Projet

**Objectif :** Avoir un projet Next.js fonctionnel avec auth et layout de base.  
**Critère de succès :** Un utilisateur peut se connecter et voir un dashboard vide.

### Sprint 0.1 — Initialisation
- [ ] **[SETUP-01]** Créer le projet Next.js 14 avec TypeScript, Tailwind, App Router
  - `npx create-next-app@latest aerispay --typescript --tailwind --app --src-dir`
  - Installer les dépendances : shadcn/ui, Prisma, NextAuth, Zod, etc.
  - Configurer ESLint + Prettier + `.editorconfig`
  - _Critère :_ `npm run dev` démarre sans erreur

- [ ] **[SETUP-02]** Configurer Prisma + MySQL
  - Démarrer la base : `docker compose up -d` depuis la racine (fichier `docker-compose.yml`, MySQL + phpMyAdmin) et reprendre `web/development.env.example` pour `DATABASE_URL` (`mysql://...`) / `.env.local`
  - Initialiser Prisma : `npx prisma init`
  - Écrire le schéma complet (`prisma/schema.prisma`) selon `ARCHITECTURE_MVP.md`
  - Créer la première migration : `npx prisma migrate dev --name init`
  - _Critère :_ `npx prisma studio` affiche toutes les tables

- [ ] **[SETUP-03]** Configurer NextAuth.js v5
  - Credentials provider (email + mot de passe hashé bcrypt)
  - Session JWT avec rôle utilisateur inclus
  - **Pas d’inscription publique** ; création de comptes réservée aux `ADMIN` (`/api/users`, pages `/users` — voir `SPECS/AUTH.md`)
  - Middleware de protection des routes `/dashboard/**`
  - _Critère :_ Login/logout fonctionnel, redirection protégée, seul un `ADMIN` peut créer des utilisateurs

- [ ] **[SETUP-04]** Layout principal (Sidebar + Navbar)
  - Sidebar responsive avec navigation : Dashboard, Stock, Caisse (et **Utilisateurs** pour le rôle `ADMIN` uniquement)
  - Navbar avec info utilisateur connecté + bouton déconnexion
  - Composant `KPICard` réutilisable
  - _Critère :_ Layout affiché correctement sur desktop et tablette

- [ ] **[SETUP-05]** Seed de base de données
  - 1 utilisateur ADMIN de test
  - 5 catégories de produits
  - 20 produits de démonstration avec stock initial
  - _Critère :_ `npx prisma db seed` peuple la DB sans erreur

---

## Phase 1 — Module Gestion de Stock

**Objectif :** CRUD complet des produits et gestion des mouvements de stock.  
**Critère de succès :** Un manager peut gérer l'intégralité du stock depuis l'interface.

### Sprint 1.1 — API Stock
- [ ] **[STOCK-API-01]** API `GET/POST /api/produits`
  - Écrire d’abord les tests Vitest des cas nominaux, filtres, pagination, validation et permissions
  - Validation Zod, pagination, filtres (catégorie, statut, stock)
  - Réponse paginée : `{ data: Produit[], total, page, pageSize }`
  - _Critère :_ Tests Vitest passent

- [ ] **[STOCK-API-02]** API `GET/PUT/DELETE /api/produits/[id]`
  - PUT : mise à jour partielle (patch)
  - DELETE : désactivation logique (`actif = false`)
  - _Critère :_ Tests Vitest passent

- [ ] **[STOCK-API-03]** API `GET/POST /api/categories`
  - CRUD complet
  - _Critère :_ Tests Vitest passent

- [ ] **[STOCK-API-04]** API `GET/POST /api/stock/mouvements`
  - POST crée le mouvement ET met à jour `stockActuel` en transaction
  - GET avec filtres par produit, type, date
  - _Critère :_ Transaction atomique vérifiée (si erreur → rollback)

- [ ] **[STOCK-API-05]** API `GET /api/stock/alertes`
  - Retourne produits où `stockActuel <= stockMinimum`
  - Trié par urgence (stock le plus bas en premier)
  - _Critère :_ Retourne liste correcte avec données de seed

### Sprint 1.2 — Interface Stock
- [ ] **[STOCK-UI-01]** Page liste des produits (`/stock`)
  - Tableau avec colonnes : référence, nom, catégorie, prix vente, stock, statut
  - Filtres : catégorie, statut actif/inactif, recherche texte
  - Badge rouge si stock ≤ minimum, orange si stock ≤ 2× minimum
  - Boutons : Nouveau produit, Éditer, Voir détail
  - Pagination côté serveur
  - _Critère :_ Affiche les 20 produits de seed avec filtres fonctionnels

- [ ] **[STOCK-UI-02]** Formulaire création/édition produit (`/stock/nouveau`, `/stock/[id]`)
  - Champs : référence (auto-générée), nom, description, catégorie, prix achat, prix vente, TVA, unité, stock initial, stock minimum, stock maximum
  - Validation en temps réel avec Zod
  - _Critère :_ Création et édition fonctionnelles, validation affichée

- [ ] **[STOCK-UI-03]** Page gestion des catégories (`/stock/categories`)
  - Liste + formulaire inline création/édition
  - Sélecteur de couleur pour l'UI
  - _Critère :_ CRUD catégories fonctionnel

- [ ] **[STOCK-UI-04]** Page mouvements de stock (`/stock/mouvements`)
  - Formulaire d'entrée/sortie/ajustement rapide
  - Historique avec filtres date + type + produit
  - Export CSV de l'historique
  - _Critère :_ Mouvement créé, stock mis à jour, historique affiché

- [ ] **[STOCK-UI-05]** Tableau de bord alertes de rupture
  - Widget sur le dashboard principal
  - Liste des produits en rupture ou alerte
  - _Critère :_ Widget affiché sur `/` avec données correctes

---

## Phase 2 — Module Gestion de Caisse (POS)

**Objectif :** Interface POS complète permettant de réaliser une vente de bout en bout.  
**Critère de succès :** Un caissier peut ouvrir une session, scanner des produits avec une douchette, encaisser, imprimer un ticket et ouvrir le tiroir-caisse.

### Sprint 2.1 — Sessions de Caisse
- [ ] **[CAISSE-API-01]** API `GET/POST /api/caisse/sessions`
  - POST ouvre une session (vérifie qu'aucune session ouverte n'existe pour cet utilisateur)
  - _Critère :_ Impossible d'ouvrir 2 sessions simultanées

- [ ] **[CAISSE-API-02]** API `PUT /api/caisse/sessions/[id]`
  - Fermeture session avec montant de clôture
  - Calcul automatique du total des ventes de la session
  - _Critère :_ Session fermée, récapitulatif calculé

- [ ] **[CAISSE-UI-01]** Page gestion sessions (`/caisse/sessions`)
  - Bouton "Ouvrir une session" avec saisie du fond de caisse
  - Liste des sessions passées avec résumés
  - Bouton "Fermer la session" avec saisie du montant compté
  - _Critère :_ Ouverture/fermeture session fonctionnelle

### Sprint 2.2 — Interface POS
- [ ] **[CAISSE-UI-02]** Interface POS principale (`/caisse`)
  - Grille de produits (carte avec photo, nom, prix) — disposition par catégorie
  - Barre de recherche produit (nom, référence ou code-barres)
  - Support douchette lecteur code-barres USB/HID en mode clavier
  - Responsive : adapté aux écrans tactiles (tablette)
  - _Critère :_ Tous les produits actifs affichés, recherche et scan douchette fonctionnels

- [ ] **[CAISSE-UI-03]** Composant Panier (`Cart`)
  - Liste des articles avec quantité modifiable
  - Suppression article
  - Sous-total par ligne, total général
  - Champ remise globale (% ou montant fixe)
  - Affichage TVA
  - Bouton "Encaisser" activé si panier non vide
  - État géré par Zustand
  - _Critère :_ Panier persisté pendant navigation, calculs corrects

- [ ] **[CAISSE-UI-04]** Modale de paiement (`PaymentModal`)
  - Sélection mode de paiement (Espèces, Carte, Mobile Money, etc.)
  - Mode Espèces : saisie montant reçu → calcul monnaie rendue
  - Mode mixte : possibilité de combiner 2 modes de paiement
  - Bouton "Valider la vente"
  - _Critère :_ Calcul monnaie correct, validation bloquée si montant insuffisant

### Sprint 2.3 — Logique de Vente
- [ ] **[CAISSE-API-03]** API `POST /api/ventes`
  - Écrire d’abord les tests Vitest couvrant transaction, stock insuffisant et rollback
  - Transaction atomique :
    1. Créer `Vente` avec numéro séquentiel (VTE-2026-XXXXX)
    2. Créer `LigneVente` pour chaque article
    3. Créer `Paiement`(s)
    4. Décrémenter `stockActuel` de chaque `Produit`
    5. Créer `MouvementStock` (type: SORTIE) pour chaque produit
  - Vérifier stock suffisant avant transaction
  - Déclencher l’ouverture tiroir-caisse après vente espèces validée si activée
  - _Critère :_ Si stock insuffisant → erreur 422, aucune donnée créée ; si CASH → tiroir ouvert sans annuler la vente en cas d’échec matériel

- [ ] **[CAISSE-API-04]** API `GET /api/ventes` + `GET /api/ventes/[id]`
  - Liste avec filtres : date, caissier, session, statut
  - Détail complet avec lignes et paiements
  - _Critère :_ Données correctes retournées

- [ ] **[CAISSE-API-05]** API `PUT /api/ventes/[id]/annuler`
  - Annulation réservée à ADMIN/MANAGER
  - Remettre le stock (MouvementStock type: RETOUR)
  - _Critère :_ Stock restauré après annulation

- [ ] **[CAISSE-UI-05]** Page historique des ventes (`/caisse/ventes`)
  - Tableau avec filtres date, caissier, statut
  - Total journalier visible
  - Bouton "Voir le ticket" par vente
  - Bouton "Annuler" (selon rôle)
  - _Critère :_ Historique affiché, filtre par date fonctionnel

---

## Phase 3 — Impression des Tickets

**Objectif :** Générer et imprimer des tickets de caisse normalisés.  
**Critère de succès :** Un ticket PDF est généré à chaque vente ; l'impression thermique fonctionne en réseau local ; le tiroir-caisse peut être ouvert via ESC/POS.

### Sprint 3.1 — Ticket PDF
- [ ] **[PRINT-01]** Générateur de PDF (`lib/receipt/pdf-generator.ts`)
  - Utiliser `@react-pdf/renderer`
  - Format : A4 ou reçu (80mm simulé)
  - Contenu normalisé : en-tête commerce, numéro ticket, date/heure, caissier, articles, totaux, paiement, QR code, pied de page
  - _Critère :_ PDF généré conforme au format défini dans `SPECS/IMPRESSION.md`

- [ ] **[PRINT-02]** API `GET /api/tickets/[id]/pdf`
  - Retourne un PDF binaire (`Content-Type: application/pdf`)
  - _Critère :_ PDF téléchargeable depuis le navigateur

- [ ] **[PRINT-03]** Aperçu ticket dans l'interface (`/caisse/tickets/[id]`)
  - Rendu HTML du ticket (prévisualisation)
  - Bouton "Télécharger PDF"
  - Bouton "Imprimer" (via `window.print()`)
  - _Critère :_ Aperçu fidèle au ticket imprimé

- [ ] **[PRINT-04]** QR Code sur ticket
  - Contient : numéro vente + total + date
  - Généré avec `qrcode` lib
  - _Critère :_ QR code lisible et données correctes

### Sprint 3.2 — Impression Thermique
- [ ] **[PRINT-05]** Pilote imprimante thermique (`lib/receipt/thermal-printer.ts`)
  - Utiliser `node-thermal-printer`
  - Support ESC/POS 58mm et 80mm
  - Configuration : IP réseau ou port série (via env `PRINTER_TYPE`, `PRINTER_IP`, `PRINTER_PORT`)
  - _Critère :_ Test d'impression en-tête fonctionne

- [ ] **[PRINT-06]** API `POST /api/tickets/[id]/print`
  - Envoie les commandes ESC/POS à l'imprimante configurée
  - Retourne `{ success: boolean, error?: string }`
  - _Critère :_ Ticket imprimé physiquement depuis l'interface

- [ ] **[PRINT-07]** Bouton "Imprimer" dans l'interface POS
  - Après validation vente : modale avec choix PDF ou thermique
  - Option "Imprimer automatiquement" (config utilisateur)
  - _Critère :_ Déclenchement impression depuis le bouton

- [ ] **[PRINT-08]** Ouverture tiroir-caisse
  - Support impulsion ESC/POS via imprimante ticket
  - Ouverture automatique après paiement espèces validé
  - Ouverture manuelle réservée `ADMIN` / `MANAGER`
  - _Critère :_ Tiroir ouvert en test manuel ; échec matériel affiché sans annuler la vente

- [ ] **[POS-HW-01]** Validation matériel caisse
  - Tester une douchette code-barres USB/HID en mode clavier
  - Tester une imprimante ticket 58mm ou 80mm
  - Tester un tiroir-caisse connecté à l’imprimante
  - _Critère :_ Scénario complet scan → vente CASH → ticket → ouverture tiroir validé

---

## Phase 4 — Dashboard & Rapports

**Objectif :** Tableau de bord avec KPIs clés et rapports exportables.  
**Critère de succès :** Un manager voit les indicateurs clés de la journée en 1 coup d'œil.

- [ ] **[DASH-01]** API `GET /api/dashboard/kpis`
  - Chiffre d'affaires du jour / semaine / mois
  - Nombre de ventes du jour
  - Produits en rupture / alerte
  - Top 5 produits les plus vendus (semaine)
  - _Critère :_ Données correctes comparées à la DB

- [ ] **[DASH-02]** Page dashboard principal (`/`)
  - 4 KPI cards : CA jour, Nb ventes, Panier moyen, Alertes stock
  - Graphique ventes 7 derniers jours (Recharts)
  - Liste alertes rupture
  - _Critère :_ Dashboard affiché en < 2 secondes

- [ ] **[DASH-03]** Rapport journalier caisse
  - Récapitulatif de session : total ventes, par mode de paiement, nb transactions
  - Exportable en PDF
  - _Critère :_ Rapport généré pour session fermée

- [ ] **[DASH-04]** Export inventaire
  - Export CSV/Excel de tous les produits avec stock actuel
  - _Critère :_ Fichier téléchargeable et lisible dans Excel

- [ ] **[LOG-01]** Journal d’activité — données & utilitaire
  - Modèle Prisma `ActivityLog` (cf. `ARCHITECTURE_MVP.md`) + migration
  - `lib/activity-log.ts` : `logActivity`, constantes d’actions (`SPECS/ACTIVITY_LOG.md`)
  - _Critère :_ insertion de test via `logActivity` visible en base

- [ ] **[LOG-02]** Journal d’activité — instrumentation
  - Appels `logActivity` sur les flux auth (NextAuth), utilisateurs, stock, caisse, tickets (succès + échecs de login pertinents)
  - _Critère :_ actions réelles couvertes par au moins un log chacune (liste dans la PR)

- [ ] **[LOG-03]** Journal d’activité — UI & API
  - `GET /api/activity-logs` (pagination, filtres) — `ADMIN` + `MANAGER` uniquement
  - Page `app/(dashboard)/activity-logs/page.tsx` + entrée sidebar conditionnelle
  - _Critère :_ `CAISSIER` reçoit 403 sur l’API et ne voit pas le menu

---

## Phase 5 — Qualité & Déploiement

**Objectif :** Application stable, testée et déployée en production.

- [ ] **[QA-01]** Tests unitaires API (Vitest) — couverture ≥ 80%
- [ ] **[QA-02]** Tests composants (React Testing Library) — composants critiques
- [ ] **[QA-03]** Tests e2e Playwright — flux complet vente + impression + scan code-barres simulé
- [ ] **[QA-04]** Vérification TDD — chaque feature livrée référence les tests écrits avant l’implémentation
- [ ] **[QA-05]** Audit performance (Lighthouse ≥ 90)
- [ ] **[QA-06]** Audit sécurité (OWASP checklist)
- [ ] **[DEPLOY-01]** Valider le déploiement avec `docker-compose.prod.yml` + `Dockerfile` (build réel, migrations, secrets) — fichiers de base décrits dans `DOCKER.md`
- [ ] **[DEPLOY-02]** Variables d'environnement production + secrets
- [ ] **[DEPLOY-03]** Déploiement Vercel OU VPS (selon choix infrastructure)
- [ ] **[DEPLOY-04]** Monitoring basique (logs, uptime)

---

## Backlog — Versions Futures

Ces fonctionnalités sont **hors scope MVP** mais documentées pour la roadmap future.

### v1.1 — Rapports avancés
- Rapport mensuel comparatif
- Graphiques tendances stock
- Alertes email rupture de stock

### v2.0 — Gestion RH
- Fiche employé (informations, poste, salaire)
- Gestion des plannings
- Suivi des présences
- Calcul et édition des bulletins de paie

### v3.0 — Comptabilité Générale
- Plan comptable personnalisable
- Journal des opérations
- Grand livre
- Bilan comptable + Compte de résultat
- Déclarations TVA automatisées

### v4.0 — Multi-boutiques
- Gestion multi-points de vente
- Stock centralisé + transferts inter-boutiques
- Reporting consolidé

---

*AerisPay Roadmap · Version 1.0 · Avril 2026*
