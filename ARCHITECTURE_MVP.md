# AerisPay — Architecture Technique MVP

> **Version :** 1.0 — MVP  
> **Date :** Avril 2026  
> **Modules couverts :** Gestion de Stock · Gestion de Caisse · Périphériques de caisse · Journal d’activité (audit)  
> **Stack :** Next.js 14 · TypeScript · Prisma · MySQL · Tailwind CSS

---

## 1. Vue d'ensemble

AerisPay MVP est une application web de caisse enregistreuse et de gestion commerciale conçue pour les petits et moyens commerces. La première version se concentre sur la **gestion de stock**, la **gestion de caisse**, la compatibilité avec les périphériques de caisse (imprimante ticket, douchette code-barres, tiroir-caisse), l’impression de tickets normalisés (PDF + thermique) et un **journal d’activité** centralisé pour l’audit des opérations.

```
┌─────────────────────────────────────────────────┐
│                  Navigateur Web                  │
│         Next.js 14 · App Router · React          │
│         Tailwind CSS · shadcn/ui                 │
└──────────────────────┬──────────────────────────┘
                       │ HTTP / API Routes
┌──────────────────────▼──────────────────────────┐
│               Next.js API Routes                 │
│         Logique métier · Validations             │
│         PDF · ESC/POS · Douchette · Tiroir       │
└──────────────────────┬──────────────────────────┘
                       │ Prisma ORM
┌──────────────────────▼──────────────────────────┐
│                 MySQL Database                    │
│   Produits · Stock · Ventes · Sessions · Users · Activity logs │
└─────────────────────────────────────────────────┘
```

### 1.1 Cible produit : structure, magasins, local & cloud (hors scope MVP complet)

En **objectif** (détaillé dans `SPECS/MULTI_ORGANISATION.md`) :

- Une **même structure** (groupe) peut déployer l’app sur **plusieurs points de vente** (supermarchés) : en pratique, **une base MySQL locale** par site est recommandée pour la **caisse** (latence, continuité si la liaison Internet tombe).
- Chaque site peut avoir **plusieurs postes de caisse** (multi-terminaux) et **plusieurs caissiers** (sessions de caisse par opérateur) — le schéma MVP actuel est **mono-magasin implicite** ; l’évolution passera par des clés `organisation` / `magasin` / `poste` au fil de la roadmap.
- **Sauvegarde en ligne** : copies chiffrées périodiques (ex. dump MySQL vers stockage objet) pour **reprise** et **contrôle** ; l’**accès à distance** (reporting, direction) doit passer par des **canaux applicatifs ou VPN** sécurisés, **pas** par une exposition directe de MySQL sur Internet.

Cette section n’impose pas encore toutes les tables du schéma Prisma : elle fixe l’**alignement** produit / infra pour les sprints “multi-PDV”.

---

## 2. Stack Technique Recommandée

### 2.1 Frontend
| Technologie | Rôle | Justification |
|---|---|---|
| **Next.js 14** (App Router) | Framework principal | SSR, routing, API intégrée |
| **TypeScript** | Typage statique | Sécurité du code, maintenabilité |
| **Tailwind CSS** | Styles | Rapidité de développement |
| **shadcn/ui** | Composants UI | Composants accessibles et personnalisables |
| **React Hook Form + Zod** | Formulaires & validation | Validation côté client robuste |
| **Zustand** | État global (panier POS) | Léger et simple |
| **TanStack Query** | Gestion des données async | Cache, refetch automatique |

### 2.2 Backend
| Technologie | Rôle | Justification |
|---|---|---|
| **Next.js API Routes** | API REST | Intégré au framework, zéro config |
| **Prisma ORM** | Accès base de données | Type-safe, migrations automatiques |
| **MySQL 8** | Base de données | Fiable, relationnel, support Prisma natif (via `provider = "mysql"`) |
| **NextAuth.js** | Authentification | Sessions sécurisées, multi-providers |

### 2.3 Impression
| Technologie | Rôle | Justification |
|---|---|---|
| **@react-pdf/renderer** | Génération PDF | Tickets PDF normalisés côté serveur |
| **node-thermal-printer** | Imprimante thermique | Support ESC/POS 58mm / 80mm |
| **qrcode** | QR Code sur ticket | Lien de vérification du ticket |

### 2.4 Périphériques de caisse
| Périphérique | Mode de support | Notes |
|---|---|---|
| **Imprimante ticket** | ESC/POS réseau, USB ou série | Réseau recommandé en production Docker ; USB/série nécessite exposition explicite du device |
| **Douchette code-barres** | USB/HID en mode clavier | Compatible navigateur sans driver ; scan capturé via champ recherche POS / buffer clavier |
| **Tiroir-caisse** | Impulsion ESC/POS via imprimante, ou interface directe configurée | Ouverture automatique après paiement espèces validé |

### 2.5 Infrastructure
| Technologie | Rôle |
|---|---|
| **Docker & Docker Compose** | Environnements reproductibles : `docker-compose.yml` (dev) et `docker-compose.prod.yml` (prod) — voir `DOCKER.md` |
| **MySQL 8** | Base de données (conteneur local, phpMyAdmin en dev, ou service managé) |
| **Vercel / PaaS** | Déploiement Next.js possible en alternative au conteneur applicatif |
| **Cloud DB** | MySQL / MariaDB managé (PlanetScale, AWS RDS, etc., hors Docker local) |
| **Cloudinary / S3** | Stockage images produits (optionnel MVP) |

---

## 2.6 Méthodologie TDD

Le MVP est développé en **Test-Driven Development**. Pour chaque fonctionnalité, correction métier ou régression :

1. Écrire d’abord les tests qui décrivent le comportement attendu.
2. Vérifier que les tests échouent lorsque le comportement n’existe pas encore, si le contexte le permet.
3. Implémenter le code minimal pour faire passer ces tests.
4. Refactorer sans affaiblir la couverture.

Les API Routes et transactions Prisma sont couvertes par Vitest, les composants et formulaires critiques par React Testing Library, et les parcours de caisse/stock/impression par Playwright lorsque le comportement est de bout en bout.

---

## 3. Structure du Projet

```
aerispay/
├── docker/
│   └── env/                      # Exemples .env pour Docker (dev / prod)
├── docker-compose.yml            # Dev : MySQL + phpMyAdmin
├── docker-compose.prod.yml       # Prod : app (Dockerfile) + MySQL
├── Dockerfile                    # Image production Next (standalone)
├── DOCKER.md                     # Guide conteneurisation
├── app/                          # App Router Next.js
│   ├── (auth)/                   # Pages authentification (pas d'inscription publique)
│   │   └── login/
│   ├── (dashboard)/              # Layout principal avec sidebar
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard / KPIs
│   │   ├── users/                # ADMIN : gestion des comptes utilisateurs
│   │   │   ├── page.tsx
│   │   │   └── nouveau/
│   │   ├── activity-logs/        # ADMIN + MANAGER : journal d’audit
│   │   │   └── page.tsx
│   │   ├── stock/                # Module Stock
│   │   │   ├── page.tsx          # Liste des produits
│   │   │   ├── [id]/page.tsx     # Détail produit
│   │   │   ├── nouveau/page.tsx  # Créer produit
│   │   │   ├── categories/       # Gestion catégories
│   │   │   └── mouvements/       # Historique mouvements
│   │   └── caisse/               # Module Caisse
│   │       ├── page.tsx          # Interface POS
│   │       ├── sessions/         # Gestion sessions
│   │       ├── ventes/           # Historique ventes
│   │       └── tickets/[id]/     # Visualisation ticket
│   └── api/                      # API Routes
│       ├── auth/[...nextauth]/
│       ├── users/                # CRUD utilisateurs (réservé ADMIN)
│       ├── activity-logs/        # GET liste (ADMIN + MANAGER)
│       ├── produits/
│       ├── categories/
│       ├── stock/mouvements/
│       ├── caisse/sessions/
│       ├── ventes/
│       └── tickets/[id]/pdf/     # Génération PDF ticket
│
├── components/                   # Composants réutilisables
│   ├── ui/                       # shadcn/ui components
│   ├── stock/                    # Composants module stock
│   │   ├── ProductCard.tsx
│   │   ├── ProductForm.tsx
│   │   ├── StockAlertBadge.tsx
│   │   └── MovementTable.tsx
│   ├── caisse/                   # Composants module caisse
│   │   ├── POSGrid.tsx           # Grille produits POS
│   │   ├── Cart.tsx              # Panier de vente
│   │   ├── PaymentModal.tsx      # Modale paiement
│   │   └── ReceiptPreview.tsx    # Prévisualisation ticket
│   ├── users/                    # ADMIN — gestion des comptes
│   │   ├── UserForm.tsx
│   │   └── UsersTable.tsx
│   ├── activity-logs/            # ADMIN + MANAGER
│   │   └── ActivityLogTable.tsx
│   └── shared/
│       ├── Navbar.tsx
│       ├── Sidebar.tsx
│       └── KPICard.tsx
│
├── lib/                          # Utilitaires & logique
│   ├── db.ts                     # Client Prisma singleton
│   ├── auth.ts                   # Config NextAuth
│   ├── activity-log.ts           # logActivity + catalogue d’actions
│   ├── validations/              # Schémas Zod
│   ├── receipt/
│   │   ├── pdf-generator.ts      # Génération PDF ticket
│   │   └── thermal-printer.ts    # Commandes ESC/POS
│   └── utils.ts
│
├── prisma/
│   ├── schema.prisma             # Modèle de données
│   └── migrations/
│
└── types/                        # Types TypeScript globaux
    └── index.ts
```

---

## 4. Modèle de Données (Base de Données)

### 4.1 Schéma Prisma Complet

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ─── UTILISATEURS & AUTH ────────────────────────────

model User {
  id          String    @id @default(cuid())
  nom         String
  email       String    @unique
  motDePasse  String
  role        Role      @default(CAISSIER)
  actif       Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  sessions     CaisseSession[]
  ventes       Vente[]
  activityLogs ActivityLog[]

  @@map("users")
}

enum Role {
  ADMIN
  MANAGER
  CAISSIER
}

// ─── MODULE STOCK ───────────────────────────────────

model Categorie {
  id          String     @id @default(cuid())
  nom         String
  description String?
  couleur     String?    // code hex pour l'UI
  createdAt   DateTime   @default(now())

  produits    Produit[]

  @@map("categories")
}

model Produit {
  id              String   @id @default(cuid())
  reference       String   @unique
  codeBarres      String?  @unique
  nom             String
  description     String?
  image           String?  // URL image
  prixAchat       Decimal  @db.Decimal(10, 2)
  prixVente       Decimal  @db.Decimal(10, 2)
  tva             Decimal  @default(0) @db.Decimal(5, 2) // % TVA
  unite           String   @default("unité") // pcs, kg, litre...
  stockActuel     Int      @default(0)
  stockMinimum    Int      @default(5)   // seuil alerte
  stockMaximum    Int?
  actif           Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  categorieId     String
  categorie       Categorie   @relation(fields: [categorieId], references: [id])
  mouvements      MouvementStock[]
  lignesVente     LigneVente[]

  @@map("produits")
}

model MouvementStock {
  id          String          @id @default(cuid())
  type        TypeMouvement
  quantite    Int
  quantiteAvant Int
  quantiteApres Int
  motif       String?
  reference   String?         // référence bon livraison/commande
  createdAt   DateTime        @default(now())

  produitId   String
  produit     Produit         @relation(fields: [produitId], references: [id])
  venteId     String?
  vente       Vente?          @relation(fields: [venteId], references: [id])

  @@map("mouvements_stock")
}

enum TypeMouvement {
  ENTREE        // réapprovisionnement
  SORTIE        // vente ou consommation
  AJUSTEMENT    // correction inventaire
  RETOUR        // retour client
  PERTE         // casse, vol, expiration
}

// ─── MODULE CAISSE ──────────────────────────────────

model CaisseSession {
  id              String    @id @default(cuid())
  ouvertureAt     DateTime  @default(now())
  fermetureAt     DateTime?
  montantOuverture Decimal  @db.Decimal(10, 2)
  montantFermeture Decimal? @db.Decimal(10, 2)
  statut          StatutSession @default(OUVERTE)
  notes           String?

  userId          String
  utilisateur     User      @relation(fields: [userId], references: [id])
  ventes          Vente[]

  @@map("caisse_sessions")
}

enum StatutSession {
  OUVERTE
  FERMEE
}

model Vente {
  id              String    @id @default(cuid())
  numero          String    @unique // ex: VTE-2026-00001
  dateVente       DateTime  @default(now())
  sousTotal       Decimal   @db.Decimal(10, 2)
  remise          Decimal   @default(0) @db.Decimal(10, 2)
  tva             Decimal   @default(0) @db.Decimal(10, 2)
  total           Decimal   @db.Decimal(10, 2)
  statut          StatutVente @default(VALIDEE)
  nomClient       String?
  notesCaissier   String?
  createdAt       DateTime  @default(now())

  sessionId       String
  session         CaisseSession @relation(fields: [sessionId], references: [id])
  userId          String
  caissier        User      @relation(fields: [userId], references: [id])
  lignes          LigneVente[]
  paiements       Paiement[]
  mouvementsStock MouvementStock[]

  @@map("ventes")
}

enum StatutVente {
  VALIDEE
  ANNULEE
  REMBOURSEE
}

model LigneVente {
  id          String   @id @default(cuid())
  quantite    Int
  prixUnitaire Decimal @db.Decimal(10, 2)
  remise      Decimal  @default(0) @db.Decimal(10, 2)
  tva         Decimal  @default(0) @db.Decimal(10, 2)
  sousTotal   Decimal  @db.Decimal(10, 2)

  venteId     String
  vente       Vente    @relation(fields: [venteId], references: [id])
  produitId   String
  produit     Produit  @relation(fields: [produitId], references: [id])

  @@map("lignes_vente")
}

model Paiement {
  id          String       @id @default(cuid())
  mode        ModePaiement
  montant     Decimal      @db.Decimal(10, 2)
  reference   String?      // ref. mobile money, numéro carte...
  createdAt   DateTime     @default(now())

  venteId     String
  vente       Vente        @relation(fields: [venteId], references: [id])

  @@map("paiements")
}

enum ModePaiement {
  ESPECES
  CARTE_BANCAIRE
  MOBILE_MONEY   // Wave, Orange Money, etc.
  CHEQUE
  VIREMENT
  AUTRE
}

// ─── JOURNAL D’ACTIVITÉ (audit) ─────────────────────

model ActivityLog {
  id          String   @id @default(cuid())
  action      String
  entityType  String?
  entityId    String?
  metadata    Json?
  ipAddress   String?  @db.VarChar(45)
  userAgent   String?  @db.Text
  createdAt   DateTime @default(now())

  actorId     String?
  actor       User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([createdAt])
  @@index([actorId])
  @@index([action])
  @@index([entityType, entityId])
  @@map("activity_logs")
}
```

---

## 5. Architecture des Modules

### 5.1 Module Gestion de Stock

**Fonctionnalités :**
- Liste des produits avec filtres (catégorie, stock, statut)
- Fiche produit complète (prix achat/vente, TVA, unité, seuils)
- Tableau de bord stock avec alertes (produits sous seuil minimum)
- Mouvements de stock : entrée, sortie, ajustement, retour, perte
- Historique complet des mouvements avec filtres par date/produit
- Export CSV/PDF de l'inventaire

**Flux principal — Entrée de stock :**
```
Utilisateur → Formulaire Entrée Stock
→ POST /api/stock/mouvements
→ Validation Zod (quantité > 0, produit existant)
→ Transaction Prisma :
   ├── Créer MouvementStock (type: ENTREE)
   └── Incrémenter Produit.stockActuel
→ Réponse → Mise à jour UI (TanStack Query invalidation)
```

### 5.2 Module Gestion de Caisse (POS)

**Fonctionnalités :**
- Interface POS tactile avec grille de produits
- Recherche produit en temps réel (nom, référence, code-barres)
- Ajout rapide au panier par douchette lecteur de code-barres USB/HID
- Panier de vente (ajout, suppression, modification quantité)
- Application de remises (globale ou par ligne)
- Paiement multi-modes (espèces avec calcul monnaie, carte, mobile money)
- Historique des ventes avec filtres
- Gestion des sessions de caisse (ouverture/fermeture avec fonds)
- Impression ticket (PDF + thermique)
- Ouverture tiroir-caisse après paiement espèces validé

**Flux principal — Vente :**
```
Caissier → Interface POS
→ Sélection produits ou scan douchette → Panier (Zustand store)
→ Clic "Encaisser" → Modale paiement
→ Saisie montant reçu / mode paiement
→ POST /api/ventes
→ Transaction Prisma :
   ├── Créer Vente + LignesVente + Paiement(s)
   └── Décrémenter Produit.stockActuel pour chaque ligne
       └── Créer MouvementStock (type: SORTIE) par produit
→ GET /api/tickets/[id]/pdf → Génération PDF
→ Option : envoi commande ESC/POS vers imprimante thermique
→ Si paiement espèces : impulsion ESC/POS d’ouverture tiroir-caisse
→ Réinitialisation panier
```

### 5.3 Journal d’activité (audit)

**Fonctionnalités :**
- Enregistrement append-only des actions sensibles et métier (auth, utilisateurs, stock, caisse, tickets)
- Consultation filtrée par période, acteur, type d’action et entité
- Détails techniques optionnels : IP, user-agent (audit réseau)

**Implémentation :**
- Table Prisma `ActivityLog` ; fonction serveur `logActivity()` dans `lib/activity-log.ts`
- Appels depuis les API Routes après succès métier (et depuis les événements NextAuth pour la connexion / déconnexion)

**Spécification détaillée :** `SPECS/ACTIVITY_LOG.md`

---

## 6. Format du Ticket de Caisse Normalisé

```
┌─────────────────────────────────┐
│         AERISPAY                │
│      [Nom de la boutique]       │
│   [Adresse] · [Téléphone]       │
│   RCCM: XXXX · NIF: XXXX        │
├─────────────────────────────────┤
│ Ticket N° : VTE-2026-00001      │
│ Date : 23/04/2026  14:35        │
│ Caissier : [Nom]                │
│ Session : #42                   │
├─────────────────────────────────┤
│ DÉSIGNATION   QTÉ  PU    TOTAL  │
├─────────────────────────────────┤
│ Produit A      2  5 000  10 000 │
│ Produit B      1  3 500   3 500 │
│ Produit C      3  1 200   3 600 │
├─────────────────────────────────┤
│              Sous-total : 17 100│
│              Remise (-5%) :  855│
│              TVA (18%) :  2 924 │
│              TOTAL :     19 169 │
├─────────────────────────────────┤
│ Paiement : Espèces              │
│ Reçu :             20 000 FCFA  │
│ Monnaie :             831 FCFA  │
├─────────────────────────────────┤
│         [QR Code vérification]  │
│   Merci de votre confiance !    │
│   Conservez ce ticket svp.      │
└─────────────────────────────────┘
```

**Informations obligatoires (normalisation) :**
- Nom et coordonnées du commerce (RCCM, NIF/IFU selon pays)
- Numéro de ticket séquentiel unique
- Date et heure de la transaction
- Identité du caissier
- Détail des articles (désignation, quantité, prix unitaire, sous-total)
- Sous-total, remises, TVA ventilée, total TTC
- Mode(s) de paiement
- Montant reçu et monnaie rendue (si espèces)
- QR code de vérification (optionnel mais recommandé)

---

## 7. API Routes — Endpoints Principaux

### Stock
| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/produits` | Liste produits (avec filtres) |
| POST | `/api/produits` | Créer un produit |
| GET | `/api/produits/[id]` | Détail produit |
| PUT | `/api/produits/[id]` | Modifier produit |
| DELETE | `/api/produits/[id]` | Désactiver produit |
| GET | `/api/categories` | Liste catégories |
| POST | `/api/categories` | Créer catégorie |
| GET | `/api/stock/mouvements` | Historique mouvements |
| POST | `/api/stock/mouvements` | Enregistrer mouvement |
| GET | `/api/stock/alertes` | Produits sous seuil |

### Utilisateurs (réservé `ADMIN`)
| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | Liste utilisateurs |
| POST | `/api/users` | Créer un utilisateur (name, email, password, role) |
| GET | `/api/users/[id]` | Détail utilisateur |
| PUT | `/api/users/[id]` | Mettre à jour (rôle, actif, etc.) |
| DELETE | `/api/users/[id]` | Désactiver compte (soft delete `active: false` recommandé) |

### Journal d’activité (`ADMIN` + `MANAGER`, lecture seule)
| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/activity-logs` | Liste paginée + filtres (période, action, acteur, entité) |

### Caisse
| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/caisse/sessions` | Liste sessions |
| POST | `/api/caisse/sessions` | Ouvrir session |
| PUT | `/api/caisse/sessions/[id]` | Fermer session |
| GET | `/api/ventes` | Historique ventes |
| POST | `/api/ventes` | Créer une vente |
| GET | `/api/ventes/[id]` | Détail vente |
| PUT | `/api/ventes/[id]/annuler` | Annuler vente |
| GET | `/api/tickets/[id]/pdf` | Générer PDF ticket |
| POST | `/api/tickets/[id]/print` | Imprimer ticket thermique |
| POST | `/api/cash-drawer/open` | Ouvrir tiroir-caisse configuré |

### Dashboard
| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/kpis` | KPIs du jour (CA, nb ventes, stock) |

---

## 8. Sécurité & Rôles

Les rôles `ADMIN`, `MANAGER` et `CAISSIER` en **MVP** sont des comptes **niveau point de vente** (un seul site par base). Détails, dénomination métier (administrateur local, gérant, caissier) et rôles **cible** pour le **niveau groupe** : `SPECS/AUTH.md`.

| Fonctionnalité | `ADMIN` (admin. PDV) | `MANAGER` (gérant) | `CAISSIER` |
|---|:---:|:---:|:---:|
| Créer/modifier produits | ✅ | ✅ | ❌ |
| Voir le stock | ✅ | ✅ | ✅ |
| Faire une vente | ✅ | ✅ | ✅ |
| Annuler une vente | ✅ | ✅ | ❌ |
| Gérer les sessions | ✅ | ✅ | ✅ |
| Voir les rapports | ✅ | ✅ | ❌ |
| Gérer les utilisateurs **du site** | ✅ | ❌ | ❌ |
| Consulter le journal d’activité | ✅ | ✅ | ❌ |

*Les rôles de **niveau groupe** (ex. lecture consolidée multi-magasins) n’entrent qu’à l’évolution multi-organisation — voir `SPECS/MULTI_ORGANISATION.md`.*

---

## 9. Roadmap MVP → Versions Futures

```
MVP v1.0 (Actuel)
├── ✅ Gestion de stock
├── ✅ Gestion de caisse POS
├── ✅ Périphériques caisse (imprimante ticket, douchette, tiroir-caisse)
├── ✅ Impression tickets (PDF + thermique)
└── ✅ Journal d’activité (audit)

v1.1 — Rapports & Analytics
├── Rapports de ventes (journalier, hebdo, mensuel)
├── Rapport d'inventaire
└── Export Excel/PDF

v2.0 — Gestion RH
├── Gestion employés & plannings
├── Gestion des paies
└── Présences & congés

v3.0 — Comptabilité Générale
├── Plan comptable
├── Journal des opérations
├── Bilan & compte de résultat
└── Déclarations fiscales
```

---

## 10. Prochaines Étapes

1. **Initialisation du projet** — `npx create-next-app@latest aerispay --typescript --tailwind --app`
2. **Conteneurisation locale (option recommandée)** — `docker compose up -d` (MySQL + phpMyAdmin), configurer `DATABASE_URL` (`mysql://...`) puis Prisma
3. **Configuration Prisma** — Connexion MySQL, migration initiale
4. **Authentification** — Mise en place NextAuth.js avec email/password
5. **Tests d’abord** — écrire les tests du module avant les API, composants ou flux associés
6. **Module Stock** — Modèles, API Routes, interfaces CRUD
7. **Module Caisse** — Interface POS, flux de vente, paiements, scan code-barres
8. **Impression** — Génération PDF avec @react-pdf/renderer
9. **Périphériques caisse** — Imprimante ticket ESC/POS, douchette USB/HID, tiroir-caisse
10. **Impression thermique** — Intégration node-thermal-printer
11. **Journal d’activité** — modèle `ActivityLog`, `logActivity`, page `/activity-logs`, `GET /api/activity-logs` (voir `SPECS/ACTIVITY_LOG.md`)

---

## 11. Conteneurisation (Docker)

Le dépôt inclut **deux stacks Compose** :

- **Développement** (`docker-compose.yml`) : services `db` (MySQL) et `phpmyadmin` (UI web). L’app Next.js est lancée en local (`npm run dev`) avec `DATABASE_URL` (`mysql://...`) pointant vers le conteneur.
- **Production** (`docker-compose.prod.yml`) : services `db` + `app` (image construite par le `Dockerfile`, sortie Next **standalone**).

Détails, commandes, variables et bonnes pratiques (migrations, réseau `db`, reverse proxy) : **`DOCKER.md`**.

---

*Document généré avec Claude · AerisPay MVP Architecture v1.0*
