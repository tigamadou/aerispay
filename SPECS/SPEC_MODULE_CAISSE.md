# Spécification Technique — Module Caisse

## 0. Métadonnées

| Champ | Valeur |
|-------|--------|
| Version | 1.0.0 |
| Date | 2026-05-01 |
| Statut | DRAFT |
| Auteur | Claude Code (IA) — commandité par Amadou Ibrahim |
| Module cible | Caisse (enrichissement du module Comptoir existant) |

### Conventions d'identifiants

| Préfixe | Signification | Exemple |
|---------|---------------|---------|
| `RULE-` | Règle métier | `RULE-OPEN-001` |
| `STATE-` | État du cycle de vie de la session | `STATE-OPEN` |
| `TRANS-` | Transition entre états | `TRANS-001` |
| `EVT-` | Événement métier émis | `EVT-SESSION-OPENED` |
| `ACT-` | Action exposée | `ACT-OPEN-SESSION` |
| `ROLE-` | Rôle utilisateur | `ROLE-CASHIER` |
| `PERM-COND-` | Condition de permission | `PERM-COND-001` |
| `PHASE-` | Phase d'implémentation | `PHASE-1` |
| `CONCEPT-` | Concept métier | `CONCEPT-CASH-MOVEMENT` |
| `EDGE-` | Cas limite | `EDGE-001` |
| `THRESHOLD-` | Seuil paramétrable | `THRESHOLD-DISCREPANCY-MINOR` |

---

## 1. Glossaire

| Terme | Définition |
|-------|-----------|
| **Caissier** | Utilisateur de rôle `CAISSIER` qui opère un comptoir, effectue des ventes, ouvre et ferme sa propre session. Ne dispose d'aucun droit d'annulation ni de gestion des sessions d'autrui. |
| **Caissier entrant** | Caissier qui prend la relève lors d'un changement de poste. Effectue un comptage physique indépendant (validation à l'aveugle) lors de la clôture de la session du caissier sortant. |
| **Comptoir** | Poste physique de vente (terminal + périphériques). Dans le MVP mono-magasin, un seul comptoir implicite existe. |
| **Écart** | Différence entre le montant physiquement compté et le solde théorique calculé par le système, pour un mode de paiement donné. Un écart positif est un excédent ; un écart négatif est un manquant. |
| **Fond de caisse** | Montant initial placé dans le comptoir à l'ouverture d'une session, déclaré par mode de paiement. Constitue le premier mouvement de la session. |
| **Gérant** | Utilisateur de rôle `ADMIN`. Dispose de tous les droits : sessions correctives, force-close, vérification d'intégrité, gestion des comptes. |
| **Hash d'intégrité** | Empreinte cryptographique SHA-256 calculée à partir des données d'une session clôturée et validée. Permet de détecter toute altération a posteriori. |
| **Manager** | Utilisateur de rôle `MANAGER`. Dispose des droits de supervision : validation des sessions, annulation de ventes, consultation des audits. Ne crée pas de comptes utilisateurs. |
| **Mode de paiement** | Canal par lequel un paiement est reçu. Modes supportés : `ESPECES`, `MOBILE_MONEY_MTN`, `MOBILE_MONEY_MOOV`, `CARTE_BANCAIRE`. Chaque mode a son propre solde théorique. |
| **Mouvement de caisse** | Enregistrement immuable d'une entrée ou sortie d'argent dans la caisse, lié à une session. Types : vente, remboursement, apport, retrait, dépense. Chaque mouvement est horodaté, attribué à un auteur, et référence un mode de paiement. |
| **Session** | Période d'activité d'un caissier sur un comptoir, de l'ouverture à la validation finale. Traverse plusieurs états (OPEN → PENDING_CLOSURE → PENDING_VALIDATION → VALIDATED ou DISPUTED). |
| **Session corrective** | Procédure exclusive du gérant permettant de corriger une session déjà validée via des mouvements compensatoires. Ne modifie jamais les mouvements originaux. |
| **Solde théorique** | Montant calculé par le système pour un mode de paiement donné, en sommant le fond de caisse et tous les mouvements enregistrés pendant la session. N'est jamais stocké comme valeur brute persistante — toujours recalculé à partir de l'historique des mouvements. |
| **Validation à l'aveugle** | Procédure de double comptage lors de la clôture : le caissier déclare ses montants, puis un tiers (manager ou caissier entrant) effectue son propre comptage sans avoir accès aux déclarations du caissier. Le système réconcilie les deux déclarations. |
| **Z de caisse** | Rapport de synthèse d'une session clôturée : fond initial, total mouvements par type et mode, solde théorique, montants déclarés, écarts, hash d'intégrité. Document non modifiable une fois la session validée. |

---

## 2. Périmètre

### 2.1 IN — Fonctionnalités couvertes

1. Ouverture de session de caisse avec fond initial multi-modes
2. Enregistrement automatique des mouvements de caisse lors des ventes et remboursements
3. Enregistrement manuel des mouvements : apports, retraits, dépenses (avec justificatif)
4. Calcul du solde théorique en temps réel, par mode de paiement
5. Clôture de session en 4 étapes : déclaration caissier, calcul théorique serveur, validation à l'aveugle par un tiers, réconciliation
6. Détection, catégorisation et suivi des écarts avec seuils paramétrables
7. Alertes automatiques pour écarts significatifs et récurrents
8. Verrouillage cryptographique des sessions validées (hash SHA-256)
9. Vérification d'intégrité a posteriori des sessions
10. Sessions correctives par le gérant avec audit complet
11. Force-close de session par le gérant avec audit obligatoire
12. Émission d'événements métier pour intégration future
13. Mode dégradé hors ligne avec synchronisation différée
14. Z de caisse (rapport de session) en PDF
15. Multi-modes de paiement : espèces, MTN Mobile Money, Moov Mobile Money, carte bancaire
16. Suivi des écarts récurrents par caissier

### 2.2 OUT — Hors périmètre

1. Toute logique comptable : écritures, journaux, plan comptable, bilan, compte de résultat
2. États financiers et rapports comptables
3. Réconciliation bancaire
4. Gestion multi-magasins (traitée dans `SPECS/MULTI_ORGANISATION.md`)
5. Gestion multi-comptoirs physiques (un seul comptoir implicite dans le MVP)
6. Gestion des devises (FCFA uniquement)
7. Remboursements partiels (à traiter dans une évolution future)
8. Programmes de fidélité ou bons de réduction
9. Création de comptes utilisateurs (module Auth existant, réservé ADMIN)

### 2.3 Dépendances

| Module | Rôle | Fichiers clés |
|--------|------|---------------|
| Auth (NextAuth v5) | Authentification, rôles, sessions HTTP | `web/app/src/auth.ts`, `web/app/src/lib/permissions.ts` |
| Stock | Produits, catégories, mouvements de stock | `web/app/prisma/schema.prisma` (modèles Produit, Categorie, MouvementStock) |
| Ventes | Création de ventes, lignes, paiements | `web/app/src/app/api/ventes/route.ts`, `web/app/src/app/api/ventes/[id]/annuler/route.ts` |
| Comptoir (existant) | Sessions, interface POS | `web/app/src/app/api/comptoir/sessions/route.ts`, `web/app/src/components/comptoir/` |
| Audit | Journal d'activité | `web/app/src/lib/activity-log.ts`, `web/app/src/app/api/activity-logs/route.ts` |
| Paramètres | Données commerce, taxes | `web/app/prisma/schema.prisma` (modèles Parametres, Taxe) |
| Impression | PDF et thermique | `web/app/src/lib/receipt/pdf-generator.tsx`, `web/app/src/lib/receipt/thermal-printer.ts` |

---

## 3. Analyse de l'existant

### 3.1 Inventaire

| Entité/Concept | Localisation | Rôle actuel | Complétude |
|----------------|-------------|-------------|------------|
| `ComptoirSession` | `web/app/prisma/schema.prisma` (l.107-127) | Session caissier avec ouverture/fermeture, montants par mode (cash + mobile money), écarts | Partielle — 2 états seulement (OUVERTE/FERMEE), pas de validation tierce, pas de hash |
| `StatutSession` | `web/app/prisma/schema.prisma` | Enum : OUVERTE, FERMEE | Insuffisant — manque PENDING_CLOSURE, PENDING_VALIDATION, VALIDATED, DISPUTED, FORCE_CLOSED |
| `Vente` | `web/app/prisma/schema.prisma` (l.134-157) | Vente complète avec lignes, paiements, taxes | Complète pour le MVP |
| `Paiement` | `web/app/prisma/schema.prisma` (l.181-192) | Paiement lié à une vente, mode ESPECES ou MOBILE_MONEY | Partielle — pas de distinction MTN/Moov, pas de carte bancaire |
| `ModePaiement` | `web/app/prisma/schema.prisma` | Enum : ESPECES, MOBILE_MONEY | Insuffisant — fusionner MTN et Moov empêche la réconciliation séparée |
| `User` / `Role` | `web/app/prisma/schema.prisma` (l.16-31) | Utilisateurs avec rôles ADMIN, MANAGER, CAISSIER | Suffisant pour le MVP |
| `ActivityLog` | `web/app/prisma/schema.prisma` (l.235-253) | Journal d'audit avec action, entité, metadata, IP, user-agent | Suffisant — à enrichir avec nouvelles actions caisse |
| `MouvementStock` | `web/app/prisma/schema.prisma` (l.79-95) | Mouvements de stock (ENTREE, SORTIE, AJUSTEMENT, RETOUR, PERTE) | N/A — concept différent des mouvements de caisse |
| API sessions | `web/app/src/app/api/comptoir/sessions/route.ts` et `[id]/route.ts` | Ouverture (POST) et fermeture (PUT) de session, calcul solde théorique | Partielle — fermeture en une étape, pas de validation tierce |
| API ventes | `web/app/src/app/api/ventes/route.ts` | Création de vente atomique avec stock | Complète — à enrichir pour créer automatiquement un mouvement de caisse |
| API annulation | `web/app/src/app/api/ventes/[id]/annuler/route.ts` | Annulation vente (ADMIN/MANAGER) avec restauration stock | Complète — à enrichir pour créer un mouvement de caisse compensatoire |
| Zustand cartStore | `web/app/src/store/cartStore.ts` | Panier POS avec calculs temps réel, persistance sessionStorage | Complète |
| POSInterface | `web/app/src/components/comptoir/POSInterface.tsx` | Interface POS complète (grille, panier, paiement, douchette) | Complète |
| SessionManager | `web/app/src/components/comptoir/SessionManager.tsx` | Gestion ouverture/fermeture de session | Partielle — à enrichir pour le flux de clôture en 4 étapes |
| Permissions | `web/app/src/lib/permissions.ts` | Matrice de permissions par rôle | Suffisante — à enrichir avec nouvelles permissions caisse |

### 3.2 Comportements existants

1. Un caissier ouvre une session avec un fond initial (espèces + mobile money) — une seule session ouverte par caissier (409 si déjà ouverte)
2. Pendant la session, le caissier effectue des ventes via l'interface POS — chaque vente crée des lignes, paiements, et mouvements de stock dans une transaction atomique
3. Le solde théorique est calculé à la volée (espèces encaissées - monnaie rendue + fond initial pour le cash ; fond initial + mobile money reçu pour MM)
4. Le caissier (ou un ADMIN/MANAGER) ferme la session en déclarant les montants physiques comptés — le système calcule les écarts
5. La session passe directement de OUVERTE à FERMEE (pas d'étape intermédiaire)
6. Un ADMIN ou MANAGER annule une vente, ce qui restaure le stock et crée des mouvements de type RETOUR
7. Toutes les opérations sensibles sont tracées dans ActivityLog
8. Les périphériques (imprimante thermique, tiroir-caisse) fonctionnent en mode fire-and-forget : une erreur n'annule pas la vente

### 3.3 Lacunes identifiées

| Objectif | État actuel | Lacune |
|----------|-------------|--------|
| 1. Traçabilité mouvements d'argent | Inexistant — seuls les mouvements de stock sont tracés | Aucun concept de mouvement de caisse ; les entrées/sorties d'argent ne sont pas enregistrées comme entités distinctes |
| 2. Solde théorique par mode, recalculable | Partiel — calculé à la volée dans l'API mais seulement 2 modes | Le calcul est correct mais limité à 2 modes ; pas de recalcul depuis un historique de mouvements immuables |
| 3. Multi-modes de paiement | Partiel — ESPECES et MOBILE_MONEY uniquement | Pas de distinction MTN/Moov ; pas de carte bancaire ; enum trop simple |
| 4. Double validation aveugle | Absent | Clôture en une seule étape (caissier déclare, système calcule, session fermée) |
| 5. Détection/catégorisation écarts | Basique — écarts calculés mais non catégorisés | Pas de seuils, pas d'alertes, pas de suivi récurrent par caissier |
| 6. Intégrité cryptographique | Absent | Aucun hash de session, aucun verrouillage |
| 7. Mode dégradé hors ligne | Absent | Aucune stratégie hors ligne |
| 8. Émission d'événements | Absent | Activity logs existent mais ne constituent pas un système d'événements métier découplés |
| 9. Auditabilité totale | Partiel | Activity logs présents mais pas de chaînage cryptographique, pas de reconstitution complète d'une session |
| 10. Sessions correctives | Absent | Aucune procédure de correction post-validation |

### 3.4 Conventions du projet

| Aspect | Convention identifiée |
|--------|----------------------|
| Langue du code | Français pour les noms de modèles Prisma et routes (ComptoirSession, Vente, Paiement, ModePaiement) ; anglais pour le code TypeScript (interface noms en anglais/français mixte) |
| Nommage fichiers | PascalCase composants, camelCase stores/hooks, kebab-case routes API |
| Tables DB | snake_case (`comptoir_sessions`, `lignes_vente`, `mouvements_stock`) |
| Enums Prisma | SCREAMING_SNAKE_CASE (OUVERTE, FERMEE, ESPECES, MOBILE_MONEY) |
| API responses | `{ data: T }` succès, `{ error: string, details?: object }` erreur |
| Validation | Zod schemas dans `lib/validations/` |
| Transactions | `prisma.$transaction()` pour opérations multi-modèles |
| Audit | `logActivity()` avec constantes SCREAMING_SNAKE_CASE dans `lib/activity-log.ts` |
| Montants | `Decimal(10,2)` en Prisma, conversion en `Number` côté API |
| Authentification | `requireAuth()` et `requireRole()` depuis `lib/permissions.ts` |
| Composants UI | shadcn/ui + Tailwind CSS ; pas de CSS modules |
| État | Zustand (panier), TanStack Query (données serveur) |

---

## 4. Évolution de l'existant

### 4.1 ComptoirSession

**CONSERVÉ :**
- Relation `user` (le caissier qui ouvre la session)
- Relation `ventes` (ventes effectuées pendant la session)
- Champs `ouvertureAt` et `notes`
- Table `comptoir_sessions`
- Contrainte : une seule session ouverte par caissier

**ENRICHI :**
- `StatutSession` : passe de 2 à 7 états (voir section 6)
- Ajout de champs conceptuels : hash d'intégrité, identifiant du valideur, horodatages des transitions, comptages du valideur
- Le calcul du solde théorique migre vers un recalcul depuis l'historique des mouvements de caisse (plus de stockage brut du solde)
- Les champs `montantFermeture*`, `soldeTheorique*`, `ecart*` deviennent des résultats de la réconciliation, pas des champs autonomes

**NOUVEAU :**
- Relation vers les mouvements de caisse (`CONCEPT-CASH-MOVEMENT`)
- Relation vers le valideur (user tiers qui effectue la validation à l'aveugle)
- Concept de session corrective liée à une session originale
- Hash d'intégrité SHA-256 calculé à la validation

### 4.2 Paiement / ModePaiement

**CONSERVÉ :**
- Structure Paiement (mode, montant, référence, lien vente)
- Table `paiements`

**ENRICHI :**
- `ModePaiement` passe de 2 à 4 valeurs : `ESPECES`, `MOBILE_MONEY_MTN`, `MOBILE_MONEY_MOOV`, `CARTE_BANCAIRE`
- Chaque paiement génère automatiquement un mouvement de caisse

**NOUVEAU :**
- Extensibilité : l'ajout d'un nouveau mode de paiement ne nécessite que l'ajout d'une valeur à l'enum et la configuration de ses règles de réconciliation

### 4.3 Vente / Annulation

**CONSERVÉ :**
- Logique complète de création de vente (lignes, paiements, stock, numérotation)
- Logique d'annulation avec restauration stock
- Statuts : VALIDEE, ANNULEE, REMBOURSEE

**ENRICHI :**
- La création d'une vente génère automatiquement un mouvement de caisse de type VENTE pour chaque paiement
- L'annulation d'une vente génère automatiquement un mouvement de caisse compensatoire de type REMBOURSEMENT

**NOUVEAU :**
- Rien de structurellement nouveau — l'enrichissement se fait via les mouvements de caisse

### 4.4 ActivityLog

**CONSERVÉ :**
- Structure existante (action, entityType, entityId, metadata, ipAddress, userAgent, actorId)
- Index existants

**ENRICHI :**
- Nouvelles actions : `CASH_MOVEMENT_CREATED`, `SESSION_CLOSURE_REQUESTED`, `SESSION_VALIDATED`, `SESSION_DISPUTED`, `SESSION_FORCE_CLOSED`, `SESSION_CORRECTED`, `BLIND_VALIDATION_SUBMITTED`, `INTEGRITY_CHECK_PERFORMED`, `DISCREPANCY_ALERT_TRIGGERED`

**NOUVEAU :**
- Rien de structurellement nouveau

### 4.5 Permissions

**CONSERVÉ :**
- Matrice existante dans `lib/permissions.ts`
- Helpers `requireAuth()` et `requireRole()`

**ENRICHI :**
- Nouvelles permissions : `comptoir:valider_session`, `comptoir:force_close`, `comptoir:session_corrective`, `comptoir:verifier_integrite`, `comptoir:mouvement_manuel`, `comptoir:retrait_caisse`, `comptoir:depense`

**NOUVEAU :**
- Concept de ré-authentification PIN pour certaines actions sensibles (`ACT-FORCE-CLOSE`, `ACT-CORRECTIVE-SESSION`)

---

## 5. Concepts métier introduits

### CONCEPT-CASH-MOVEMENT — Mouvement de caisse

- **Définition** : Enregistrement immuable d'une entrée ou sortie d'argent dans la caisse, lié à une session. Chaque mouvement capture le mode de paiement, le montant, le type, l'auteur, l'horodatage et un motif.
- **Rôle dans le système** : Constitue la source de vérité unique pour le calcul du solde théorique. Remplace le calcul à la volée par agrégation de paiements.
- **Propriétés clés** :
  - Type : FOND_INITIAL, VENTE, REMBOURSEMENT, APPORT, RETRAIT, DEPENSE, CORRECTION
  - Mode de paiement associé
  - Montant (positif pour entrée, négatif pour sortie)
  - Référence optionnelle (numéro de vente, justificatif)
  - Session parente
  - Auteur (utilisateur authentifié)
  - Horodatage serveur
- **Invariants** :
  - Un mouvement créé n'est jamais modifié ni supprimé
  - Les corrections se font par mouvements compensatoires (type CORRECTION)
  - Le solde théorique d'un mode de paiement = somme algébrique de tous les mouvements de ce mode dans la session
  - Chaque vente validée génère exactement un mouvement par paiement associé
  - Chaque annulation génère exactement un mouvement compensatoire par paiement de la vente annulée
- **Relations** : Session (parent obligatoire), Vente (optionnel, pour les mouvements automatiques), User (auteur)

### CONCEPT-PAYMENT-MODE — Mode de paiement étendu

- **Définition** : Canal de réception d'un paiement. Chaque mode a son propre solde théorique indépendant et son propre cycle de réconciliation à la clôture.
- **Rôle dans le système** : Permet la réconciliation séparée des espèces, du Mobile Money MTN, du Moov Mobile Money et de la carte bancaire.
- **Propriétés clés** :
  - Identifiant unique (valeur enum)
  - Nom d'affichage
  - Nécessite un comptage physique à la clôture (oui pour espèces, non pour électronique)
  - Nécessite une référence de transaction (non pour espèces, oui pour mobile money et carte)
- **Invariants** :
  - Un paiement référence exactement un mode
  - Chaque mouvement de caisse référence exactement un mode
  - Le solde théorique est calculé indépendamment par mode
  - L'ajout d'un nouveau mode ne modifie pas la logique des modes existants
- **Relations** : Paiement (via enum), MouvementCaisse (via enum)

### CONCEPT-BLIND-VALIDATION — Validation à l'aveugle

- **Définition** : Procédure de double comptage indépendant lors de la clôture d'une session. Le caissier et un tiers déclarent chacun leurs montants sans voir les déclarations de l'autre. Le système compare les deux séries de déclarations.
- **Rôle dans le système** : Garantit l'objectivité du comptage physique et détecte les erreurs ou fraudes lors du changement de poste.
- **Propriétés clés** :
  - Déclaration caissier : montants par mode de paiement (étape 1)
  - Déclaration valideur : montants par mode de paiement (étape 3, sans accès aux montants du caissier)
  - Valideur autorisé : MANAGER, ADMIN, ou CAISSIER (si caissier entrant, et différent du caissier de la session)
  - Réconciliation : comparaison des deux déclarations avec le solde théorique
- **Invariants** :
  - Le valideur ne voit jamais les déclarations du caissier avant d'avoir soumis les siennes
  - Un caissier ne valide jamais sa propre session
  - La session ne passe en VALIDATED que si les écarts sont dans les seuils acceptables ou acceptés explicitement
  - En cas de désaccord persistant, la session passe en DISPUTED
- **Relations** : Session (cible), User caissier (déclarant 1), User valideur (déclarant 2)

### CONCEPT-THEORETICAL-BALANCE — Solde théorique

- **Définition** : Montant d'argent qui devrait se trouver dans la caisse pour un mode de paiement donné, calculé à partir de l'historique complet des mouvements de caisse de la session.
- **Rôle dans le système** : Référence de comparaison pour le comptage physique lors de la clôture. N'est jamais stocké comme valeur autonome.
- **Propriétés clés** :
  - Calculé par mode de paiement
  - Formule : somme algébrique de tous les mouvements du mode dans la session
  - Recalculable à tout moment
  - Déterministe : le même historique produit toujours le même solde
- **Invariants** :
  - Le solde théorique n'est jamais modifié directement
  - Le solde théorique est toujours cohérent avec l'historique des mouvements
  - Si un mouvement est ajouté, le solde théorique change immédiatement
- **Relations** : Session (contexte), MouvementCaisse (source de calcul)

### CONCEPT-INTEGRITY-HASH — Hash d'intégrité

- **Définition** : Empreinte cryptographique SHA-256 calculée à partir des données essentielles d'une session validée. Permet de détecter toute modification non autorisée des données après validation.
- **Rôle dans le système** : Garantit l'intégrité des données historiques. Un gérant peut vérifier à tout moment qu'une session n'a pas été altérée.
- **Propriétés clés** :
  - Algorithme : SHA-256
  - Données incluses : identifiant session, identifiant caissier, horodatage ouverture, horodatage validation, tous les mouvements (triés par horodatage), déclarations caissier, déclarations valideur, écarts calculés
  - Stocké dans la session au moment de la validation
  - Vérifiable à tout moment par recalcul
- **Invariants** :
  - Le hash est calculé une seule fois, au moment du passage en VALIDATED
  - Toute modification des données incluses dans le hash rend la vérification invalide
  - Les sessions correctives ont leur propre hash, distinct du hash de la session originale
  - Le hash inclut le hash de la session précédente du même comptoir (chaînage)
- **Relations** : Session (porteur), MouvementCaisse (source de données)

### CONCEPT-CORRECTIVE-SESSION — Session corrective

- **Définition** : Procédure exclusive du gérant permettant de corriger une erreur découverte a posteriori dans une session déjà validée. Ne modifie aucun mouvement original — ajoute uniquement des mouvements compensatoires de type CORRECTION.
- **Rôle dans le système** : Permet de rectifier les erreurs sans compromettre l'intégrité de l'historique.
- **Propriétés clés** :
  - Liée à la session originale
  - Créée exclusivement par un ADMIN
  - Contient uniquement des mouvements de type CORRECTION
  - Motif obligatoire
  - Génère son propre hash d'intégrité
- **Invariants** :
  - Seul un ADMIN crée une session corrective
  - La session originale reste inchangée (son hash reste valide)
  - La session corrective est tracée dans l'audit
  - Le solde corrigé = solde original + mouvements correctifs
- **Relations** : Session originale (référence), MouvementCaisse de type CORRECTION, User ADMIN (auteur)

### CONCEPT-DISCREPANCY — Écart de caisse

- **Définition** : Différence entre le montant physiquement déclaré et le solde théorique pour un mode de paiement donné, à la clôture d'une session. Catégorisé selon des seuils paramétrables.
- **Rôle dans le système** : Alerte les gestionnaires sur les anomalies et permet le suivi des écarts récurrents par caissier.
- **Propriétés clés** :
  - Calculé par mode de paiement
  - Catégorisation : MINEUR (≤ `THRESHOLD-DISCREPANCY-MINOR`), MOYEN (≤ `THRESHOLD-DISCREPANCY-MEDIUM`), MAJEUR (> `THRESHOLD-DISCREPANCY-MEDIUM`)
  - Suivi récurrent : si un caissier cumule `THRESHOLD-RECURRING-COUNT` écarts en `THRESHOLD-RECURRING-PERIOD-DAYS` jours, une alerte est émise
- **Invariants** :
  - L'écart est calculé, jamais saisi manuellement
  - L'écart est enregistré au moment de la réconciliation et ne change plus
  - Les seuils sont paramétrables mais ont des valeurs par défaut
- **Relations** : Session (contexte), Mode de paiement (granularité), User caissier (suivi récurrent)

---

## 6. États et cycle de vie de la session

### 6.1 États

| ID | Nom | Description | Actions autorisées |
|----|-----|-------------|-------------------|
| `STATE-OPEN` | OUVERTE | Session active, le caissier effectue des ventes et mouvements manuels | `ACT-CREATE-SALE`, `ACT-MANUAL-MOVEMENT`, `ACT-REQUEST-CLOSURE`, `ACT-FORCE-CLOSE` |
| `STATE-PENDING_CLOSURE` | EN_ATTENTE_CLOTURE | Le caissier a soumis ses déclarations de montants physiques ; en attente du calcul serveur | `ACT-COMPUTE-THEORETICAL`, `ACT-FORCE-CLOSE` |
| `STATE-PENDING_VALIDATION` | EN_ATTENTE_VALIDATION | Le calcul théorique est fait ; en attente du comptage à l'aveugle par le valideur | `ACT-BLIND-VALIDATE`, `ACT-FORCE-CLOSE` |
| `STATE-VALIDATED` | VALIDEE | Session clôturée, réconciliée, hash calculé. Immuable. | `ACT-VERIFY-INTEGRITY`, `ACT-CORRECTIVE-SESSION`, `ACT-GENERATE-Z` |
| `STATE-DISPUTED` | CONTESTEE | Désaccord persistant entre caissier et valideur après `THRESHOLD-MAX-RECOUNT-ATTEMPTS` tentatives | `ACT-FORCE-CLOSE`, `ACT-RECOUNT` |
| `STATE-FORCE_CLOSED` | FORCEE | Fermée de force par le gérant (incident, abandon). Audit obligatoire. | `ACT-VERIFY-INTEGRITY`, `ACT-CORRECTIVE-SESSION`, `ACT-GENERATE-Z` |
| `STATE-CORRECTED` | CORRIGEE | Session validée ou forcée ayant fait l'objet d'une session corrective. Le hash original reste, un nouveau hash correctif existe. | `ACT-VERIFY-INTEGRITY`, `ACT-GENERATE-Z` |

### 6.2 Transitions

| ID | État source | État cible | Déclencheur | Conditions | Effets de bord |
|----|-------------|------------|-------------|------------|----------------|
| `TRANS-001` | `STATE-OPEN` | `STATE-PENDING_CLOSURE` | `ACT-REQUEST-CLOSURE` | Le caissier propriétaire soumet ses déclarations de montants physiques par mode | Déclarations caissier enregistrées ; horodatage demande clôture ; `EVT-SESSION-CLOSURE-REQUESTED` émis |
| `TRANS-002` | `STATE-PENDING_CLOSURE` | `STATE-PENDING_VALIDATION` | `ACT-COMPUTE-THEORETICAL` | Déclarations caissier présentes ; calcul des soldes théoriques terminé | Soldes théoriques calculés depuis les mouvements ; écarts préliminaires calculés |
| `TRANS-003` | `STATE-PENDING_VALIDATION` | `STATE-VALIDATED` | `ACT-RECONCILE` | Validation à l'aveugle soumise ; écarts dans les seuils acceptables OU acceptation explicite | Hash SHA-256 calculé et stocké ; écarts finaux enregistrés ; `EVT-SESSION-VALIDATED` émis ; mouvements verrouillés ; `EVT-DISCREPANCY-DETECTED` émis si écart ≠ 0 |
| `TRANS-004` | `STATE-PENDING_VALIDATION` | `STATE-DISPUTED` | `ACT-RECONCILE` | Écarts entre déclarations caissier et valideur dépassent les seuils ET `THRESHOLD-MAX-RECOUNT-ATTEMPTS` atteint | `EVT-SESSION-DISPUTED` émis ; notification manager/gérant |
| `TRANS-005` | `STATE-DISPUTED` | `STATE-PENDING_VALIDATION` | `ACT-RECOUNT` | Nouveau comptage autorisé par manager/gérant (le passage en DISPUTED réinitialise le compteur de tentatives) | Compteur tentatives remis à 0 et incrémenté à 1 ; anciennes déclarations archivées |
| `TRANS-006` | `STATE-DISPUTED` | `STATE-FORCE_CLOSED` | `ACT-FORCE-CLOSE` | Gérant décide de forcer la clôture ; motif obligatoire | Hash calculé avec données disponibles ; `EVT-SESSION-FORCE-CLOSED` émis ; motif enregistré dans audit |
| `TRANS-007` | `STATE-OPEN` | `STATE-FORCE_CLOSED` | `ACT-FORCE-CLOSE` | Gérant force la clôture (incident, abandon) ; motif obligatoire ; ré-authentification PIN | Solde théorique calculé au moment du force-close ; hash calculé ; `EVT-SESSION-FORCE-CLOSED` émis |
| `TRANS-008` | `STATE-VALIDATED` | `STATE-CORRECTED` | `ACT-CORRECTIVE-SESSION` | Gérant crée une session corrective ; motif obligatoire | Session corrective créée avec mouvements CORRECTION ; nouveau hash correctif ; `EVT-SESSION-CORRECTED` émis |
| `TRANS-009` | `STATE-FORCE_CLOSED` | `STATE-CORRECTED` | `ACT-CORRECTIVE-SESSION` | Gérant crée une session corrective ; motif obligatoire | Idem `TRANS-008` |
| `TRANS-010` | `STATE-PENDING_CLOSURE` | `STATE-OPEN` | `ACT-CANCEL-CLOSURE` | Le caissier annule sa demande de clôture avant la validation | Déclarations caissier effacées ; session revient en état actif |
| `TRANS-011` | `STATE-PENDING_CLOSURE` | `STATE-FORCE_CLOSED` | `ACT-FORCE-CLOSE` | Gérant force la clôture pendant la phase de calcul ; motif obligatoire ; ré-authentification PIN | Solde théorique calculé ; hash calculé ; `EVT-SESSION-FORCE-CLOSED` émis |
| `TRANS-012` | `STATE-PENDING_VALIDATION` | `STATE-FORCE_CLOSED` | `ACT-FORCE-CLOSE` | Gérant force la clôture pendant l'attente de validation ; motif obligatoire ; ré-authentification PIN | Hash calculé avec déclarations caissier uniquement ; `EVT-SESSION-FORCE-CLOSED` émis |

### 6.3 Diagramme textuel

```
                                    ACT-CANCEL-CLOSURE
                                 ┌──────────────────────┐
                                 │                      │
                                 ▼                      │
┌──────────┐  ACT-REQUEST-CLOSURE  ┌─────────────────┐  │  ACT-COMPUTE-THEORETICAL  ┌─────────────────────┐
│  STATE-  │──────────────────────►│  STATE-PENDING_  │──┘─────────────────────────►│  STATE-PENDING_     │
│  OPEN    │                       │  CLOSURE         │                             │  VALIDATION         │
└──────────┘                       └─────────────────┘                             └─────────────────────┘
     │                                    │                                          │              │
     │ ACT-FORCE-CLOSE                    │ ACT-FORCE-CLOSE              ACT-RECONCILE    ACT-RECONCILE
     │                                    │                              (accepté)        (rejeté + max)
     │                                    │                                          │              │
     │                                    │                                          ▼              ▼
     │                              ┌─────┴───────────┐                      ┌──────────┐   ┌───────────┐
     └─────────────────────────────►│  STATE-FORCE_   │◄── ACT-FORCE-CLOSE ──│          │   │  STATE-   │
          ACT-FORCE-CLOSE ─────────►│  CLOSED         │◄── ACT-FORCE-CLOSE ──│          │   │ DISPUTED  │
     (depuis PENDING_VALIDATION)    └─────────────────┘                      │  STATE-  │   └───────────┘
                                         │                                   │VALIDATED │        │
                                         │ ACT-CORRECTIVE-SESSION            │          │   ACT-RECOUNT
                                         │                                   └──────────┘        │
                                         ▼                                        │              │
                                    ┌─────────────────┐   ACT-CORRECTIVE-SESSION  │              │
                                    │  STATE-         │◄──────────────────────────┘              │
                                    │  CORRECTED      │                                          │
                                    └─────────────────┘                                          │
                                                                                                 │
                                                                        ┌────────────────────────┘
                                                                        │ (manager/gérant autorise)
                                                                        ▼
                                                                  STATE-PENDING_VALIDATION
```

---

## 7. Règles métier

### Ouverture de session

#### RULE-OPEN-001 — Unicité de session ouverte par caissier

- **ID** : `RULE-OPEN-001`
- **Titre** : Un caissier ne dispose que d'une seule session ouverte
- **Énoncé** : Le système interdit l'ouverture d'une nouvelle session si le caissier a déjà une session dans un état différent de `STATE-VALIDATED`, `STATE-FORCE_CLOSED` ou `STATE-CORRECTED`.
- **Pré-conditions** : L'utilisateur est authentifié avec le rôle CAISSIER
- **Post-conditions** : La session est créée en `STATE-OPEN` avec un mouvement de type FOND_INITIAL par mode de paiement déclaré
- **Exceptions** :
  - Si une session est en `STATE-PENDING_CLOSURE`, `STATE-PENDING_VALIDATION` ou `STATE-DISPUTED`, l'ouverture est refusée (409)
  - Si le montant d'ouverture est 0 pour tous les modes, la session est quand même créée (fond de caisse à zéro autorisé)
- **Règles liées** : `RULE-MVT-001`

#### RULE-OPEN-002 — Fond de caisse initial comme mouvement

- **ID** : `RULE-OPEN-002`
- **Titre** : Le fond de caisse génère un mouvement de type FOND_INITIAL
- **Énoncé** : À l'ouverture de la session, le système crée un mouvement de caisse de type `FOND_INITIAL` pour chaque mode de paiement dont le montant déclaré est supérieur à 0.
- **Pré-conditions** : Session créée en `STATE-OPEN`
- **Post-conditions** : Un mouvement FOND_INITIAL par mode > 0 ; solde théorique initial = fond déclaré
- **Exceptions** : Aucune
- **Règles liées** : `RULE-OPEN-001`, `RULE-MVT-001`

### Mouvements de caisse

#### RULE-MVT-001 — Immutabilité des mouvements

- **ID** : `RULE-MVT-001`
- **Titre** : Un mouvement de caisse est immuable
- **Énoncé** : Un mouvement de caisse, une fois créé, n'est jamais modifié ni supprimé. Toute correction se fait par création d'un mouvement compensatoire.
- **Pré-conditions** : Aucune
- **Post-conditions** : Le mouvement reste inchangé dans la base de données à perpétuité
- **Exceptions** : Aucune — cette règle est absolue
- **Règles liées** : `RULE-CORRECTION-001`

#### RULE-MVT-002 — Mouvement automatique à la vente

- **ID** : `RULE-MVT-002`
- **Titre** : Chaque paiement de vente génère un mouvement de caisse
- **Énoncé** : Lors de la création d'une vente, le système crée un mouvement de caisse de type `VENTE` pour chaque paiement, avec le montant et le mode de paiement correspondants. Le montant est positif (entrée d'argent).
- **Pré-conditions** : Vente validée dans une session `STATE-OPEN`
- **Post-conditions** : Un mouvement VENTE par paiement ; solde théorique mis à jour (recalculé)
- **Exceptions** : Si la vente échoue (stock insuffisant, paiement insuffisant), aucun mouvement n'est créé
- **Règles liées** : `RULE-MVT-001`

#### RULE-MVT-003 — Mouvement automatique à l'annulation

- **ID** : `RULE-MVT-003`
- **Titre** : L'annulation d'une vente génère des mouvements compensatoires
- **Énoncé** : Lors de l'annulation d'une vente, le système crée un mouvement de caisse de type `REMBOURSEMENT` pour chaque paiement de la vente annulée, avec un montant négatif (sortie d'argent).
- **Pré-conditions** : Vente en statut VALIDEE ; session `STATE-OPEN` ; acteur ADMIN ou MANAGER
- **Post-conditions** : Un mouvement REMBOURSEMENT par paiement annulé ; solde théorique diminué
- **Exceptions** :
  - Si la session de la vente est déjà en `STATE-VALIDATED` ou au-delà, l'annulation est refusée (la correction se fait via session corrective)
- **Règles liées** : `RULE-MVT-001`, `RULE-MVT-002`

#### RULE-MVT-004 — Mouvement manuel avec autorisation

- **ID** : `RULE-MVT-004`
- **Titre** : Les mouvements manuels nécessitent des autorisations selon le type
- **Énoncé** : Les mouvements manuels (APPORT, RETRAIT, DEPENSE) sont créés par l'utilisateur autorisé. Les retraits au-delà de `THRESHOLD-CASH-WITHDRAWAL-AUTH` et les dépenses au-delà de `THRESHOLD-EXPENSE-AUTH` nécessitent l'autorisation d'un MANAGER ou ADMIN.
- **Pré-conditions** : Session `STATE-OPEN` ; utilisateur authentifié
- **Post-conditions** : Mouvement créé ; solde théorique recalculé
- **Exceptions** :
  - APPORT : autorisé pour tout utilisateur de la session (montant positif)
  - RETRAIT : autorisé pour le caissier jusqu'à `THRESHOLD-CASH-WITHDRAWAL-AUTH` ; au-delà, validation MANAGER/ADMIN requise
  - DEPENSE : autorisée pour le caissier jusqu'à `THRESHOLD-EXPENSE-AUTH` ; au-delà, validation MANAGER/ADMIN requise ; justificatif facultatif (non bloquant)
  - Un retrait ne rend pas le solde théorique espèces négatif (refusé si montant > solde théorique espèces)
- **Règles liées** : `RULE-AUTH-001`, `RULE-AUTH-002`

#### RULE-MVT-005 — Mouvement de caisse et monnaie rendue

- **ID** : `RULE-MVT-005`
- **Titre** : La monnaie rendue est déduite du mouvement de vente espèces
- **Énoncé** : Lorsqu'une vente est payée en espèces et que le montant reçu dépasse le total, le mouvement de caisse de type VENTE enregistre uniquement le montant du total de la vente (pas le montant reçu). La monnaie rendue n'est pas un mouvement séparé.
- **Pré-conditions** : Vente avec paiement espèces, montant reçu ≥ total
- **Post-conditions** : Le mouvement VENTE enregistre le total de la vente comme montant, pas le montant reçu
- **Exceptions** : Aucune
- **Règles liées** : `RULE-MVT-002`

### Autorisations et seuils

#### RULE-AUTH-001 — Seuil de retrait sans autorisation

- **ID** : `RULE-AUTH-001`
- **Titre** : Retrait de caisse avec seuil d'autorisation
- **Énoncé** : Un caissier effectue un retrait de caisse sans autorisation supplémentaire tant que le montant est inférieur ou égal à `THRESHOLD-CASH-WITHDRAWAL-AUTH`. Au-delà, l'opération nécessite la validation d'un MANAGER ou ADMIN.
- **Pré-conditions** : Session `STATE-OPEN` ; montant retrait > 0
- **Post-conditions** : Mouvement RETRAIT créé ; solde théorique diminué
- **Exceptions** :
  - Le retrait est refusé si le montant dépasse le solde théorique espèces
  - Le MANAGER ou ADMIN n'a pas besoin d'autorisation supplémentaire pour ses propres retraits
- **Règles liées** : `RULE-MVT-004`

#### RULE-AUTH-002 — Seuil de dépense sans autorisation

- **ID** : `RULE-AUTH-002`
- **Titre** : Dépense de caisse avec seuil d'autorisation
- **Énoncé** : Un caissier enregistre une dépense sans autorisation supplémentaire tant que le montant est inférieur ou égal à `THRESHOLD-EXPENSE-AUTH`. Au-delà, l'opération nécessite la validation d'un MANAGER ou ADMIN.
- **Pré-conditions** : Session `STATE-OPEN` ; montant dépense > 0
- **Post-conditions** : Mouvement DEPENSE créé ; solde théorique diminué ; justificatif attaché si fourni
- **Exceptions** :
  - La dépense est refusée si le montant dépasse le solde théorique espèces
  - Le justificatif est facultatif (non bloquant)
- **Règles liées** : `RULE-MVT-004`

#### RULE-AUTH-003 — Interdiction d'auto-validation

- **ID** : `RULE-AUTH-003`
- **Titre** : Un caissier ne valide jamais sa propre session
- **Énoncé** : Le système interdit qu'un utilisateur soumette la validation à l'aveugle d'une session dont il est le caissier propriétaire. Le valideur est obligatoirement un utilisateur différent.
- **Pré-conditions** : Session en `STATE-PENDING_VALIDATION`
- **Post-conditions** : N/A (règle de rejet)
- **Exceptions** : Aucune — cette règle est absolue
- **Règles liées** : `RULE-CLOSE-003`

### Clôture de session

#### RULE-CLOSE-001 — Déclaration du caissier (étape 1)

- **ID** : `RULE-CLOSE-001`
- **Titre** : Le caissier déclare les montants physiques par mode
- **Énoncé** : Le caissier propriétaire de la session soumet ses montants physiques comptés pour chaque mode de paiement actif dans la session. Cette action fait passer la session de `STATE-OPEN` à `STATE-PENDING_CLOSURE`.
- **Pré-conditions** : Session en `STATE-OPEN` ; l'utilisateur est le caissier propriétaire
- **Post-conditions** : Déclarations caissier enregistrées ; session en `STATE-PENDING_CLOSURE`
- **Exceptions** :
  - Les modes sans mouvement dans la session sont autorisés à avoir un montant déclaré de 0
  - Le caissier annule sa demande de clôture avant la validation (`ACT-CANCEL-CLOSURE`)
- **Règles liées** : `RULE-CLOSE-002`

#### RULE-CLOSE-002 — Calcul théorique serveur (étape 2)

- **ID** : `RULE-CLOSE-002`
- **Titre** : Le serveur calcule les soldes théoriques
- **Énoncé** : Le système calcule le solde théorique pour chaque mode de paiement en sommant tous les mouvements de caisse de la session pour ce mode. Les écarts préliminaires (déclaration caissier - solde théorique) sont calculés. La session passe en `STATE-PENDING_VALIDATION`.
- **Pré-conditions** : Session en `STATE-PENDING_CLOSURE` ; déclarations caissier présentes
- **Post-conditions** : Soldes théoriques calculés ; écarts préliminaires disponibles ; session en `STATE-PENDING_VALIDATION`
- **Exceptions** : Aucune
- **Règles liées** : `RULE-CLOSE-001`, `RULE-CLOSE-003`

#### RULE-CLOSE-003 — Validation à l'aveugle par le tiers (étape 3)

- **ID** : `RULE-CLOSE-003`
- **Titre** : Un tiers effectue un comptage indépendant
- **Énoncé** : Un utilisateur différent du caissier propriétaire (MANAGER, ADMIN, ou autre CAISSIER) soumet ses propres montants physiques comptés pour chaque mode de paiement. Le système ne révèle pas les déclarations du caissier au valideur avant la soumission.
- **Pré-conditions** : Session en `STATE-PENDING_VALIDATION` ; valideur ≠ caissier propriétaire ; valideur authentifié avec rôle autorisé
- **Post-conditions** : Déclarations valideur enregistrées ; réconciliation déclenchée
- **Exceptions** :
  - Si le valideur est un CAISSIER, il est considéré comme caissier entrant (la session suivante lui incombe)
  - Le valideur voit les informations suivantes avant de compter : identité du caissier, horodatage d'ouverture, nombre de ventes ; il ne voit PAS les montants déclarés par le caissier ni les soldes théoriques
- **Règles liées** : `RULE-AUTH-003`, `RULE-CLOSE-004`

#### RULE-CLOSE-004 — Réconciliation (étape 4)

- **ID** : `RULE-CLOSE-004`
- **Titre** : Réconciliation des déclarations
- **Énoncé** : Le système compare les déclarations du caissier, du valideur et le solde théorique pour chaque mode de paiement. Quatre cas de réconciliation sont possibles (voir `RULE-RECONC-*`).
- **Pré-conditions** : Déclarations caissier et valideur présentes ; soldes théoriques calculés
- **Post-conditions** : Écarts finaux enregistrés ; session passe en `STATE-VALIDATED` ou `STATE-DISPUTED`
- **Exceptions** : Aucune
- **Règles liées** : `RULE-RECONC-001`, `RULE-RECONC-002`, `RULE-RECONC-003`, `RULE-RECONC-004`

### Réconciliation

#### RULE-RECONC-001 — Cas 1 : Concordance totale

- **ID** : `RULE-RECONC-001`
- **Titre** : Caissier, valideur et théorique concordent
- **Énoncé** : Si les déclarations du caissier et du valideur sont identiques ET correspondent au solde théorique (écart = 0 pour tous les modes), la session passe directement en `STATE-VALIDATED`.
- **Pré-conditions** : Pour chaque mode : montant_caissier = montant_valideur = solde_theorique
- **Post-conditions** : Session `STATE-VALIDATED` ; hash calculé ; aucune alerte
- **Exceptions** : Aucune
- **Règles liées** : `RULE-CLOSE-004`

#### RULE-RECONC-002 — Cas 2 : Caissier et valideur concordent, écart avec théorique

- **ID** : `RULE-RECONC-002`
- **Titre** : Caissier et valideur d'accord, mais écart avec le système
- **Énoncé** : Si les déclarations du caissier et du valideur sont identiques MAIS diffèrent du solde théorique, l'écart est catégorisé selon les seuils (`THRESHOLD-DISCREPANCY-*`). Si l'écart est MINEUR, la session passe en `STATE-VALIDATED` automatiquement. Si MOYEN ou MAJEUR, le système demande une acceptation explicite du valideur (MANAGER/ADMIN) avant validation.
- **Pré-conditions** : Pour au moins un mode : montant_caissier = montant_valideur ≠ solde_theorique
- **Post-conditions** : Session `STATE-VALIDATED` (après acceptation si nécessaire) ; écart enregistré ; `EVT-DISCREPANCY-DETECTED` émis ; alerte si MAJEUR
- **Exceptions** :
  - Le valideur refuse d'accepter l'écart → la session reste en `STATE-PENDING_VALIDATION` pour recomptage
- **Règles liées** : `RULE-CLOSE-004`, `THRESHOLD-DISCREPANCY-MINOR`, `THRESHOLD-DISCREPANCY-MEDIUM`

#### RULE-RECONC-003 — Cas 3 : Désaccord caissier/valideur dans les seuils

- **ID** : `RULE-RECONC-003`
- **Titre** : Déclarations différentes mais écart entre elles mineur
- **Énoncé** : Si les déclarations du caissier et du valideur diffèrent mais que l'écart entre les deux est inférieur ou égal à `THRESHOLD-DISCREPANCY-MINOR`, le système prend la moyenne des deux déclarations comme montant de référence, calcule l'écart avec le théorique, et traite comme `RULE-RECONC-002`.
- **Pré-conditions** : |montant_caissier - montant_valideur| ≤ `THRESHOLD-DISCREPANCY-MINOR`
- **Post-conditions** : Montant de référence = moyenne ; traitement idem `RULE-RECONC-002`
- **Exceptions** : Aucune
- **Règles liées** : `RULE-RECONC-002`

#### RULE-RECONC-004 — Cas 4 : Désaccord significatif

- **ID** : `RULE-RECONC-004`
- **Titre** : Déclarations significativement différentes
- **Énoncé** : Si l'écart entre les déclarations du caissier et du valideur dépasse `THRESHOLD-DISCREPANCY-MINOR`, un recomptage est demandé. Après `THRESHOLD-MAX-RECOUNT-ATTEMPTS` tentatives infructueuses, la session passe en `STATE-DISPUTED`.
- **Pré-conditions** : |montant_caissier - montant_valideur| > `THRESHOLD-DISCREPANCY-MINOR` pour au moins un mode
- **Post-conditions** : Recomptage demandé OU session `STATE-DISPUTED` si max tentatives atteint
- **Exceptions** :
  - Le gérant force la clôture via `ACT-FORCE-CLOSE`
- **Règles liées** : `RULE-CLOSE-004`, `THRESHOLD-MAX-RECOUNT-ATTEMPTS`

### Écarts récurrents

#### RULE-DISCREPANCY-001 — Suivi des écarts récurrents par caissier

- **ID** : `RULE-DISCREPANCY-001`
- **Titre** : Alerte en cas d'écarts récurrents
- **Énoncé** : Le système comptabilise les écarts non nuls de chaque caissier sur une fenêtre glissante de `THRESHOLD-RECURRING-PERIOD-DAYS` jours. Si un caissier cumule `THRESHOLD-RECURRING-COUNT` écarts ou plus dans cette fenêtre, le système émet une alerte à destination du gérant et du manager.
- **Pré-conditions** : Session passée en `STATE-VALIDATED` ou `STATE-FORCE_CLOSED` avec écart ≠ 0
- **Post-conditions** : Si le seuil de récurrence est atteint : `EVT-DISCREPANCY-DETECTED` émis avec flag récurrence = true ; notification manager/gérant
- **Exceptions** :
  - Les écarts de sessions correctives ne comptent pas dans le suivi de récurrence
  - Un écart MINEUR (≤ `THRESHOLD-DISCREPANCY-MINOR`) compte dans le suivi de récurrence au même titre qu'un écart MOYEN ou MAJEUR
- **Règles liées** : `RULE-RECONC-002`, `RULE-RECONC-003`, `RULE-RECONC-004`, `THRESHOLD-RECURRING-COUNT`, `THRESHOLD-RECURRING-PERIOD-DAYS`

#### RULE-DISCREPANCY-002 — Catégorisation des écarts avec THRESHOLD-DISCREPANCY-MAJOR

- **ID** : `RULE-DISCREPANCY-002`
- **Titre** : Catégorisation des écarts par seuils
- **Énoncé** : Chaque écart est catégorisé selon sa valeur absolue : MINEUR si ≤ `THRESHOLD-DISCREPANCY-MINOR`, MOYEN si > `THRESHOLD-DISCREPANCY-MINOR` et ≤ `THRESHOLD-DISCREPANCY-MAJOR`, MAJEUR si > `THRESHOLD-DISCREPANCY-MAJOR`. Un écart MAJEUR déclenche une notification immédiate au gérant.
- **Pré-conditions** : Écart calculé lors de la réconciliation
- **Post-conditions** : Catégorie enregistrée ; notification si MAJEUR
- **Exceptions** : Aucune
- **Règles liées** : `THRESHOLD-DISCREPANCY-MINOR`, `THRESHOLD-DISCREPANCY-MEDIUM`, `THRESHOLD-DISCREPANCY-MAJOR`, `RULE-RECONC-002`

### Intégrité

#### RULE-INTEGRITY-001 — Calcul du hash à la validation

- **ID** : `RULE-INTEGRITY-001`
- **Titre** : Hash SHA-256 calculé à la validation de session
- **Énoncé** : Au passage en `STATE-VALIDATED` ou `STATE-FORCE_CLOSED`, le système calcule un hash SHA-256 à partir des données suivantes, concaténées dans un ordre déterministe : identifiant session, identifiant caissier, horodatage ouverture, horodatage validation, liste triée de tous les mouvements (id + type + montant + mode + horodatage), déclarations caissier, déclarations valideur (si applicables), écarts calculés, hash de la session précédente du même comptoir (chaînage).
- **Pré-conditions** : Session en cours de transition vers `STATE-VALIDATED` ou `STATE-FORCE_CLOSED`
- **Post-conditions** : Hash stocké dans la session ; session verrouillée
- **Exceptions** :
  - Pour la première session du comptoir, le hash de la session précédente est une chaîne vide
  - Pour `STATE-FORCE_CLOSED`, les déclarations valideur sont absentes ; le hash est calculé sans
- **Règles liées** : `RULE-INTEGRITY-002`

#### RULE-INTEGRITY-002 — Vérification d'intégrité a posteriori

- **ID** : `RULE-INTEGRITY-002`
- **Titre** : Vérification du hash d'une session
- **Énoncé** : Un ADMIN ou MANAGER demande la vérification d'intégrité d'une session validée. Le système recalcule le hash à partir des données actuelles et le compare au hash stocké. Si les deux correspondent, l'intégrité est confirmée. Sinon, une alerte est émise.
- **Pré-conditions** : Session en `STATE-VALIDATED`, `STATE-FORCE_CLOSED` ou `STATE-CORRECTED`
- **Post-conditions** : Résultat de vérification (VALID / INVALID) enregistré dans ActivityLog
- **Exceptions** :
  - Si les données ont été altérées, le hash ne correspondra pas — alerte critique
- **Règles liées** : `RULE-INTEGRITY-001`

#### RULE-INTEGRITY-003 — Verrouillage des mouvements

- **ID** : `RULE-INTEGRITY-003`
- **Titre** : Mouvements d'une session validée sont verrouillés
- **Énoncé** : Aucun mouvement ne peut être ajouté, modifié ou supprimé dans une session dont le statut est `STATE-VALIDATED`, `STATE-FORCE_CLOSED` ou `STATE-CORRECTED`. Les corrections passent exclusivement par une session corrective.
- **Pré-conditions** : Session dans un état terminal
- **Post-conditions** : Toute tentative d'écriture est rejetée (422)
- **Exceptions** : Aucune — cette règle est absolue
- **Règles liées** : `RULE-MVT-001`, `RULE-CORRECTION-001`

### Sessions correctives

#### RULE-CORRECTION-001 — Création de session corrective

- **ID** : `RULE-CORRECTION-001`
- **Titre** : Seul le gérant crée une session corrective
- **Énoncé** : Un ADMIN crée une session corrective liée à une session validée ou forcée. La session corrective contient uniquement des mouvements de type CORRECTION. Le motif de la correction est obligatoire. La session originale n'est pas modifiée.
- **Pré-conditions** : Session originale en `STATE-VALIDATED` ou `STATE-FORCE_CLOSED` ; acteur ADMIN ; motif fourni ; ré-authentification PIN
- **Post-conditions** : Session corrective créée ; mouvements CORRECTION ajoutés ; hash correctif calculé ; session originale passe en `STATE-CORRECTED` ; `EVT-SESSION-CORRECTED` émis
- **Exceptions** :
  - Une session déjà en `STATE-CORRECTED` ne fait pas l'objet d'une nouvelle correction (une seule correction par session)
- **Règles liées** : `RULE-MVT-001`, `RULE-INTEGRITY-001`

#### RULE-CORRECTION-002 — Solde corrigé

- **ID** : `RULE-CORRECTION-002`
- **Titre** : Le solde corrigé intègre les mouvements correctifs
- **Énoncé** : Le solde effectif d'une session corrigée = solde théorique original + somme des mouvements de la session corrective. Les deux sont affichés séparément dans le Z de caisse.
- **Pré-conditions** : Session en `STATE-CORRECTED`
- **Post-conditions** : Solde corrigé calculable et affichable
- **Exceptions** : Aucune
- **Règles liées** : `RULE-CORRECTION-001`

### Seuils paramétrables

| ID | Nom | Valeur par défaut | Description |
|----|-----|-------------------|-------------|
| `THRESHOLD-DISCREPANCY-MINOR` | Écart mineur | 500 FCFA | Écart toléré automatiquement |
| `THRESHOLD-DISCREPANCY-MEDIUM` | Écart moyen | 5 000 FCFA | Écart nécessitant acceptation explicite |
| `THRESHOLD-DISCREPANCY-MAJOR` | Écart majeur | > 5 000 FCFA | Écart déclenchant une alerte |
| `THRESHOLD-RECURRING-COUNT` | Seuil récurrence | 3 | Nombre d'écarts déclenchant une alerte récurrence |
| `THRESHOLD-RECURRING-PERIOD-DAYS` | Période récurrence | 7 jours | Fenêtre glissante pour le comptage des écarts récurrents |
| `THRESHOLD-CASH-WITHDRAWAL-AUTH` | Seuil retrait | 10 000 FCFA | Retrait sans autorisation manager |
| `THRESHOLD-EXPENSE-AUTH` | Seuil dépense | 5 000 FCFA | Dépense sans autorisation manager |
| `THRESHOLD-MAX-RECOUNT-ATTEMPTS` | Tentatives recomptage | 3 | Nombre max de recomptages avant DISPUTED |
| `THRESHOLD-OFFLINE-READONLY-HOURS` | Lecture seule hors ligne | 4 heures | Durée avant passage en lecture seule en mode hors ligne |

---

## 8. Actions et parcours

### 8.1 Catalogue des actions

| ID | Nom | Acteur autorisé | État requis | Pré-conditions | Effets | Événements émis |
|----|-----|----------------|-------------|----------------|--------|----------------|
| `ACT-OPEN-SESSION` | Ouvrir une session | `ROLE-CASHIER` | Aucune session active | Aucune session non terminale pour ce caissier | Session créée en `STATE-OPEN` ; mouvements FOND_INITIAL créés | `EVT-SESSION-OPENED` |
| `ACT-CREATE-SALE` | Enregistrer une vente | `ROLE-CASHIER`, `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-OPEN` | Stock suffisant ; paiements ≥ total | Vente créée ; mouvements VENTE créés ; stock décrémenté | `EVT-CASH-MOVEMENT-CREATED` |
| `ACT-CANCEL-SALE` | Annuler une vente | `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-OPEN` | Vente en statut VALIDEE ; session encore OPEN | Vente annulée ; mouvements REMBOURSEMENT créés ; stock restauré | `EVT-CASH-MOVEMENT-CREATED` |
| `ACT-MANUAL-MOVEMENT` | Créer un mouvement manuel | `ROLE-CASHIER`, `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-OPEN` | Selon type et seuils (`RULE-MVT-004`) | Mouvement créé (APPORT, RETRAIT ou DEPENSE) | `EVT-CASH-MOVEMENT-CREATED` |
| `ACT-REQUEST-CLOSURE` | Demander la clôture | `ROLE-CASHIER` (propriétaire) | `STATE-OPEN` | Le caissier est propriétaire de la session | Déclarations caissier enregistrées ; session → `STATE-PENDING_CLOSURE` | `EVT-SESSION-CLOSURE-REQUESTED` |
| `ACT-CANCEL-CLOSURE` | Annuler la demande de clôture | `ROLE-CASHIER` (propriétaire) | `STATE-PENDING_CLOSURE` | Le caissier est propriétaire | Déclarations effacées ; session → `STATE-OPEN` | — |
| `ACT-COMPUTE-THEORETICAL` | Calculer les soldes théoriques | Système (automatique) | `STATE-PENDING_CLOSURE` | Déclarations caissier présentes | Soldes théoriques calculés ; session → `STATE-PENDING_VALIDATION` | — |
| `ACT-BLIND-VALIDATE` | Soumettre validation aveugle | `ROLE-MANAGER`, `ROLE-GERANT`, `ROLE-CASHIER` (entrant) | `STATE-PENDING_VALIDATION` | Valideur ≠ caissier propriétaire | Déclarations valideur enregistrées | — |
| `ACT-RECONCILE` | Réconcilier les déclarations | Système (automatique) | `STATE-PENDING_VALIDATION` | Déclarations caissier + valideur présentes | Session → `STATE-VALIDATED` ou `STATE-DISPUTED` | `EVT-SESSION-VALIDATED` ou `EVT-SESSION-DISPUTED` ; `EVT-DISCREPANCY-DETECTED` |
| `ACT-RECOUNT` | Demander un recomptage | `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-DISPUTED` | Autorisation manager/gérant (le compteur est réinitialisé au passage en DISPUTED) | Compteur tentatives remis à 0 ; anciennes déclarations archivées ; session → `STATE-PENDING_VALIDATION` | — |
| `ACT-FORCE-CLOSE` | Forcer la clôture | `ROLE-GERANT` | `STATE-OPEN`, `STATE-PENDING_CLOSURE`, `STATE-PENDING_VALIDATION`, `STATE-DISPUTED` | Motif obligatoire ; ré-authentification PIN | Session → `STATE-FORCE_CLOSED` ; hash calculé | `EVT-SESSION-FORCE-CLOSED` |
| `ACT-CORRECTIVE-SESSION` | Créer une session corrective | `ROLE-GERANT` | `STATE-VALIDATED`, `STATE-FORCE_CLOSED` | Motif obligatoire ; ré-authentification PIN | Session corrective créée ; session originale → `STATE-CORRECTED` | `EVT-SESSION-CORRECTED` |
| `ACT-VERIFY-INTEGRITY` | Vérifier l'intégrité | `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-VALIDATED`, `STATE-FORCE_CLOSED`, `STATE-CORRECTED` | Aucune | Résultat VALID/INVALID ; log audit | — |
| `ACT-GENERATE-Z` | Générer le Z de caisse | `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-VALIDATED`, `STATE-FORCE_CLOSED`, `STATE-CORRECTED` | Aucune | PDF Z de caisse généré | — |
| `ACT-VIEW-THEORETICAL` | Consulter le solde théorique temps réel | `ROLE-CASHIER` (propriétaire), `ROLE-MANAGER`, `ROLE-GERANT` | `STATE-OPEN` | Aucune | Solde théorique recalculé et affiché | — |

### 8.2 Parcours par rôle

#### ROLE-CASHIER — Caissier

1. `ACT-OPEN-SESSION` — Ouvrir la session avec fond de caisse
2. `ACT-CREATE-SALE` — Effectuer des ventes (répété)
3. `ACT-MANUAL-MOVEMENT` — Enregistrer apports/retraits/dépenses (selon besoin)
4. `ACT-VIEW-THEORETICAL` — Consulter le solde théorique en cours de journée
5. `ACT-REQUEST-CLOSURE` — Déclarer les montants physiques en fin de service
6. (attente validation par un tiers)

#### ROLE-INCOMING_CASHIER — Caissier entrant

1. `ACT-BLIND-VALIDATE` — Effectuer le comptage physique à l'aveugle de la session du caissier sortant
2. `ACT-OPEN-SESSION` — Ouvrir sa propre session

#### ROLE-MANAGER — Manager

1. `ACT-BLIND-VALIDATE` — Valider les sessions des caissiers (comptage aveugle)
2. `ACT-CANCEL-SALE` — Annuler des ventes si nécessaire
3. `ACT-MANUAL-MOVEMENT` — Autoriser des retraits/dépenses au-delà des seuils
4. `ACT-RECOUNT` — Demander un recomptage en cas de désaccord
5. `ACT-VERIFY-INTEGRITY` — Vérifier l'intégrité des sessions
6. `ACT-GENERATE-Z` — Générer les rapports Z de caisse

#### ROLE-GERANT — Gérant (ADMIN)

1. Toutes les actions du MANAGER
2. `ACT-FORCE-CLOSE` — Forcer la clôture d'une session (incident, abandon)
3. `ACT-CORRECTIVE-SESSION` — Créer une session corrective
4. Consultation et vérification de toutes les sessions historiques
5. Gestion des seuils paramétrables
6. Consultation des alertes d'écarts récurrents

---

## 9. Permissions

### Matrice des permissions

| Action | `ROLE-CASHIER` | `ROLE-INCOMING_CASHIER` | `ROLE-MANAGER` | `ROLE-GERANT` |
|--------|:--------------:|:-----------------------:|:--------------:|:--------------:|
| `ACT-OPEN-SESSION` | ALLOWED | ALLOWED | ALLOWED | ALLOWED |
| `ACT-CREATE-SALE` | ALLOWED | DENIED | ALLOWED | ALLOWED |
| `ACT-CANCEL-SALE` | DENIED | DENIED | ALLOWED | ALLOWED |
| `ACT-MANUAL-MOVEMENT` | CONDITIONAL (`PERM-COND-001`) | DENIED | ALLOWED | ALLOWED |
| `ACT-REQUEST-CLOSURE` | CONDITIONAL (`PERM-COND-002`) | DENIED | CONDITIONAL (`PERM-COND-002`) | CONDITIONAL (`PERM-COND-002`) |
| `ACT-CANCEL-CLOSURE` | CONDITIONAL (`PERM-COND-002`) | DENIED | CONDITIONAL (`PERM-COND-002`) | CONDITIONAL (`PERM-COND-002`) |
| `ACT-COMPUTE-THEORETICAL` | DENIED (système) | DENIED (système) | DENIED (système) | DENIED (système) |
| `ACT-BLIND-VALIDATE` | CONDITIONAL (`PERM-COND-003`) | CONDITIONAL (`PERM-COND-003`) | CONDITIONAL (`PERM-COND-003`) | CONDITIONAL (`PERM-COND-003`) |
| `ACT-RECONCILE` | DENIED (système) | DENIED (système) | DENIED (système) | DENIED (système) |
| `ACT-RECOUNT` | DENIED | DENIED | ALLOWED | ALLOWED |
| `ACT-FORCE-CLOSE` | DENIED | DENIED | DENIED | ALLOWED |
| `ACT-CORRECTIVE-SESSION` | DENIED | DENIED | DENIED | ALLOWED |
| `ACT-VERIFY-INTEGRITY` | DENIED | DENIED | ALLOWED | ALLOWED |
| `ACT-GENERATE-Z` | DENIED | DENIED | ALLOWED | ALLOWED |
| `ACT-VIEW-THEORETICAL` | CONDITIONAL (`PERM-COND-004`) | DENIED | ALLOWED | ALLOWED |

### Conditions

| ID | Condition |
|----|-----------|
| `PERM-COND-001` | CAISSIER autorisé pour APPORT sans limite ; RETRAIT ≤ `THRESHOLD-CASH-WITHDRAWAL-AUTH` ; DEPENSE ≤ `THRESHOLD-EXPENSE-AUTH`. Au-delà, validation MANAGER/ADMIN requise. |
| `PERM-COND-002` | L'utilisateur est le propriétaire de la session (le caissier qui l'a ouverte). |
| `PERM-COND-003` | Le valideur est différent du caissier propriétaire de la session (`RULE-AUTH-003`). |
| `PERM-COND-004` | Le CAISSIER ne voit le solde théorique que de sa propre session. |

### Note sur ROLE-INCOMING_CASHIER

`ROLE-INCOMING_CASHIER` n'est pas un rôle distinct dans le modèle de données. C'est un `ROLE-CASHIER` qui intervient dans le contexte de la validation à l'aveugle d'une session dont il n'est pas propriétaire. Après la validation, il ouvre sa propre session et redevient un `ROLE-CASHIER` standard.

---

## 10. Événements émis

### EVT-SESSION-OPENED

- **Identifiant** : `EVT-SESSION-OPENED`
- **Nom** : Session de caisse ouverte
- **Déclencheur** : `ACT-OPEN-SESSION` exécuté avec succès
- **Données transportées** : identifiant session, identifiant caissier, horodatage ouverture, fond de caisse par mode de paiement
- **Consommateurs prévus** : module Audit, module Comptabilité (futur)
- **Garanties** : au moins une fois, idempotent (identifiant session unique)

### EVT-CASH-MOVEMENT-CREATED

- **Identifiant** : `EVT-CASH-MOVEMENT-CREATED`
- **Nom** : Mouvement de caisse créé
- **Déclencheur** : Création d'un mouvement de caisse (automatique ou manuel)
- **Données transportées** : identifiant mouvement, identifiant session, type mouvement, mode paiement, montant, motif, identifiant vente (si applicable), identifiant auteur, horodatage
- **Consommateurs prévus** : module Comptabilité (futur), module Audit
- **Garanties** : au moins une fois, idempotent (identifiant mouvement unique), ordonné par session (horodatage croissant)

### EVT-SESSION-CLOSURE-REQUESTED

- **Identifiant** : `EVT-SESSION-CLOSURE-REQUESTED`
- **Nom** : Demande de clôture de session
- **Déclencheur** : `ACT-REQUEST-CLOSURE` — transition `TRANS-001`
- **Données transportées** : identifiant session, identifiant caissier, horodatage demande, montants déclarés par mode
- **Consommateurs prévus** : module Audit, notifications (alerte manager pour validation)
- **Garanties** : au moins une fois

### EVT-SESSION-VALIDATED

- **Identifiant** : `EVT-SESSION-VALIDATED`
- **Nom** : Session de caisse validée
- **Déclencheur** : `ACT-RECONCILE` — transition `TRANS-003`
- **Données transportées** : identifiant session, identifiant caissier, identifiant valideur, horodatage ouverture, horodatage validation, soldes théoriques par mode, montants déclarés caissier, montants déclarés valideur, écarts par mode, catégorisation des écarts, hash d'intégrité
- **Consommateurs prévus** : module Comptabilité (futur), module Audit, notifications
- **Garanties** : au moins une fois, idempotent (identifiant session unique)

### EVT-DISCREPANCY-DETECTED

- **Identifiant** : `EVT-DISCREPANCY-DETECTED`
- **Nom** : Écart de caisse détecté
- **Déclencheur** : `ACT-RECONCILE` lorsque l'écart ≠ 0 pour au moins un mode
- **Données transportées** : identifiant session, identifiant caissier, écarts par mode, catégorisation (MINEUR/MOYEN/MAJEUR), flag récurrence (si caissier a atteint `THRESHOLD-RECURRING-COUNT`)
- **Consommateurs prévus** : module Audit, notifications (alerte manager/gérant), dashboard
- **Garanties** : au moins une fois

### EVT-SESSION-DISPUTED

- **Identifiant** : `EVT-SESSION-DISPUTED`
- **Nom** : Session contestée
- **Déclencheur** : `ACT-RECONCILE` — transition `TRANS-004`
- **Données transportées** : identifiant session, identifiant caissier, identifiant valideur, nombre de tentatives, écarts entre déclarations caissier et valideur
- **Consommateurs prévus** : module Audit, notifications (alerte gérant — action requise)
- **Garanties** : au moins une fois

### EVT-SESSION-FORCE-CLOSED

- **Identifiant** : `EVT-SESSION-FORCE-CLOSED`
- **Nom** : Session fermée de force
- **Déclencheur** : `ACT-FORCE-CLOSE` — transitions `TRANS-006` ou `TRANS-007`
- **Données transportées** : identifiant session, identifiant caissier, identifiant gérant (acteur), motif, horodatage, soldes théoriques au moment du force-close, hash d'intégrité
- **Consommateurs prévus** : module Audit, module Comptabilité (futur), notifications
- **Garanties** : au moins une fois

### EVT-SESSION-CORRECTED

- **Identifiant** : `EVT-SESSION-CORRECTED`
- **Nom** : Session corrigée
- **Déclencheur** : `ACT-CORRECTIVE-SESSION` — transitions `TRANS-008` ou `TRANS-009`
- **Données transportées** : identifiant session originale, identifiant session corrective, identifiant gérant (acteur), motif, mouvements correctifs (type, montant, mode), hash correctif
- **Consommateurs prévus** : module Comptabilité (futur), module Audit
- **Garanties** : au moins une fois, idempotent

---

## 11. Architecture fonctionnelle

### 11.1 Services métier

| ID | Service | Responsabilité | Statut | Fichier existant |
|----|---------|----------------|--------|-----------------|
| SVC-01 | SessionService | Gestion du cycle de vie des sessions (ouverture, transitions d'état, fermeture, force-close) | ENRICHI | `web/app/src/app/api/comptoir/sessions/route.ts`, `web/app/src/app/api/comptoir/sessions/[id]/route.ts` |
| SVC-02 | CashMovementService | Création et consultation des mouvements de caisse (automatiques et manuels) ; calcul du solde théorique | NOUVEAU | — |
| SVC-03 | ClosureService | Orchestration de la clôture en 4 étapes (déclaration, calcul, validation aveugle, réconciliation) | NOUVEAU | — |
| SVC-04 | ReconciliationService | Comparaison des déclarations caissier/valideur/théorique ; catégorisation des écarts ; décision VALIDATED/DISPUTED | NOUVEAU | — |
| SVC-05 | IntegrityService | Calcul et vérification des hash SHA-256 ; chaînage des sessions | NOUVEAU | — |
| SVC-06 | CorrectiveSessionService | Création et gestion des sessions correctives | NOUVEAU | — |
| SVC-07 | DiscrepancyService | Suivi des écarts par caissier ; détection des récurrences ; émission des alertes | NOUVEAU | — |
| SVC-08 | EventEmitterService | Émission et dispatch des événements métier `EVT-*` | NOUVEAU | — |
| SVC-09 | OfflineService | Gestion du mode dégradé, queue de synchronisation, résolution de conflits | NOUVEAU | — |
| SVC-10 | ZReportService | Génération du Z de caisse (PDF) à partir des données d'une session | NOUVEAU | — |
| SVC-11 | SaleService | Création de ventes avec mouvements de caisse automatiques | ENRICHI | `web/app/src/app/api/ventes/route.ts` |
| SVC-12 | SaleCancellationService | Annulation de ventes avec mouvements compensatoires | ENRICHI | `web/app/src/app/api/ventes/[id]/annuler/route.ts` |

### 11.2 Endpoints API

| Méthode | Chemin | Action | Rôle requis | Notes |
|---------|--------|--------|-------------|-------|
| POST | `/api/comptoir/sessions` | `ACT-OPEN-SESSION` | CAISSIER | Existant — à enrichir (mouvements FOND_INITIAL) |
| GET | `/api/comptoir/sessions` | Liste des sessions | Tout authentifié | Existant |
| GET | `/api/comptoir/sessions/[id]` | Détail session + solde théorique (`ACT-VIEW-THEORETICAL`) | Tout authentifié (CAISSIER : sa session uniquement) | Existant — enrichir avec données mouvements |
| POST | `/api/comptoir/sessions/[id]/closure` | `ACT-REQUEST-CLOSURE` | CAISSIER (propriétaire) | NOUVEAU |
| DELETE | `/api/comptoir/sessions/[id]/closure` | `ACT-CANCEL-CLOSURE` | CAISSIER (propriétaire) | NOUVEAU |
| POST | `/api/comptoir/sessions/[id]/validate` | `ACT-BLIND-VALIDATE` | MANAGER, ADMIN, CAISSIER (entrant) | NOUVEAU |
| POST | `/api/comptoir/sessions/[id]/force-close` | `ACT-FORCE-CLOSE` | ADMIN | NOUVEAU |
| POST | `/api/comptoir/sessions/[id]/verify` | `ACT-VERIFY-INTEGRITY` | MANAGER, ADMIN | NOUVEAU |
| GET | `/api/comptoir/sessions/[id]/z-report` | `ACT-GENERATE-Z` | MANAGER, ADMIN | NOUVEAU |
| POST | `/api/comptoir/sessions/[id]/correct` | `ACT-CORRECTIVE-SESSION` | ADMIN | NOUVEAU |
| GET | `/api/comptoir/sessions/[id]/movements` | Liste mouvements d'une session | Tout authentifié | NOUVEAU |
| POST | `/api/comptoir/movements` | `ACT-MANUAL-MOVEMENT` | CAISSIER, MANAGER, ADMIN | NOUVEAU |
| GET | `/api/comptoir/movements/[id]` | Détail d'un mouvement | Tout authentifié | NOUVEAU |
| POST | `/api/ventes` | `ACT-CREATE-SALE` | Tout authentifié | Existant — à enrichir (mouvements VENTE) |
| POST | `/api/ventes/[id]/annuler` | `ACT-CANCEL-SALE` | MANAGER, ADMIN | Existant — à enrichir (mouvements REMBOURSEMENT) |
| GET | `/api/comptoir/discrepancies` | Consultation écarts avec filtres | MANAGER, ADMIN | NOUVEAU |
| GET | `/api/comptoir/discrepancies/recurring` | Écarts récurrents par caissier | MANAGER, ADMIN | NOUVEAU |

### 11.3 Interactions avec modules existants

| Interaction | Type | Direction | Point de couplage |
|-------------|------|-----------|-------------------|
| Vente → Mouvement de caisse | Écriture | Vente → CashMovementService | `web/app/src/app/api/ventes/route.ts` — après création vente, créer mouvements VENTE |
| Annulation → Mouvement de caisse | Écriture | Annulation → CashMovementService | `web/app/src/app/api/ventes/[id]/annuler/route.ts` — après annulation, créer mouvements REMBOURSEMENT |
| Session → Permissions | Lecture | SessionService → permissions.ts | `web/app/src/lib/permissions.ts` — nouvelles permissions caisse |
| Session → ActivityLog | Écriture | SessionService → logActivity | `web/app/src/lib/activity-log.ts` — nouvelles actions |
| Mouvements → Produit/Stock | Aucune | — | Les mouvements de caisse ne modifient pas le stock (le stock est géré par MouvementStock existant) |
| Session → User | Lecture | SessionService → User | `web/app/prisma/schema.prisma` modèle User — relation caissier et valideur |

---

## 12. Sécurité

### 12.1 Authentification

| Contexte | Mécanisme | Actions concernées |
|----------|-----------|-------------------|
| Standard | `requireAuth()` via NextAuth session | Toutes les API routes |
| Rôle | `requireRole(...)` via `lib/permissions.ts` | Actions restreintes (annulation, force-close, etc.) |
| Ré-authentification PIN | Saisie du PIN/mot de passe avant exécution | `ACT-FORCE-CLOSE`, `ACT-CORRECTIVE-SESSION` |

La ré-authentification PIN utilise le mécanisme existant de NextAuth (credentials provider dans `web/app/src/auth.ts`). Le client envoie le mot de passe de l'utilisateur avec la requête ; le serveur vérifie le hash bcrypt avant d'exécuter l'action.

### 12.2 Logs d'audit

- Chaque action `ACT-*` génère une entrée `ActivityLog` via `logActivity()` (`web/app/src/lib/activity-log.ts`)
- Les entrées d'audit sont immuables (pas de UPDATE ni DELETE sur la table `activity_logs`)
- Contenu minimal d'une entrée : action (constante SCREAMING_SNAKE_CASE), actorId, entityType, entityId, metadata (JSON sans secrets), ipAddress, userAgent, createdAt
- Les mouvements de caisse ne sont pas des logs d'audit — ce sont des entités métier à part entière. Le log d'audit trace la création du mouvement, pas le mouvement lui-même
- Chaînage cryptographique des sessions validées via `RULE-INTEGRITY-001` (le hash d'une session inclut le hash de la session précédente)

### 12.3 Intégrité

- **Algorithme** : SHA-256
- **Données incluses dans le calcul** (concaténées, séparées par `|`, dans cet ordre) :
  1. Identifiant session
  2. Identifiant caissier
  3. Horodatage ouverture (ISO 8601)
  4. Horodatage validation (ISO 8601)
  5. Liste triée des mouvements : pour chaque mouvement `{id}:{type}:{montant}:{mode}:{createdAt_ISO}`
  6. Déclarations caissier : `{mode}:{montant}` triées par mode
  7. Déclarations valideur : `{mode}:{montant}` triées par mode (vide si force-close)
  8. Écarts : `{mode}:{ecart}` triés par mode
  9. Hash de la session précédente du même comptoir (chaîne vide si première session)
- **Procédure de vérification** : recalculer le hash avec les mêmes données et comparer avec le hash stocké. Si identiques → intégrité confirmée (VALID). Si différents → alerte critique (INVALID).

---

## 13. Mode dégradé

### 13.1 Hors ligne

- La session de caisse reste fonctionnelle en cas de coupure réseau ou de perte de connexion à la base de données distante (contexte de base locale MySQL LAN)
- En mode hors ligne, les opérations suivantes restent disponibles :
  - Consultation du solde théorique (calculé localement)
  - Création de ventes (stockées localement)
  - Création de mouvements manuels (stockés localement)
  - Impression de tickets (si imprimante accessible sur le réseau local)
- En mode hors ligne, les opérations suivantes sont indisponibles :
  - Ouverture de nouvelle session
  - Clôture de session (nécessite validation tierce)
  - Annulation de vente
  - Vérification d'intégrité
- Après `THRESHOLD-OFFLINE-READONLY-HOURS` heures sans reconnexion, le système passe en lecture seule : plus aucune vente ni mouvement ne peut être créé
- Les données créées hors ligne sont marquées avec un flag `offline: true` et l'horodatage local

### 13.2 Synchronisation

- Les opérations créées hors ligne sont stockées dans une queue locale (IndexedDB côté client ou table temporaire côté serveur)
- À la reconnexion, la queue est dépilée dans l'ordre chronologique (FIFO)
- Chaque opération est rejouée comme un appel API standard
- En cas de conflit (ex. produit devenu inactif entre-temps, stock insuffisant) :
  - Le conflit est enregistré dans un journal de synchronisation
  - L'opération conflictuelle est marquée comme échouée
  - Le gérant est notifié pour résolution manuelle
- La synchronisation est idempotente : chaque opération porte un identifiant unique généré hors ligne, et le serveur rejette les doublons

### 13.3 Reprise sur incident

| Incident | Procédure |
|----------|-----------|
| Crash applicatif (serveur Next.js) | Au redémarrage, les sessions restent dans leur dernier état persisté. Le panier côté client est restauré depuis sessionStorage. Les transactions Prisma non commitées sont annulées automatiquement par MySQL. |
| Coupure de courant | Idem crash applicatif. Le caissier retrouve sa session ouverte au redémarrage. La dernière vente non commitée est perdue (la transaction Prisma garantit l'atomicité). |
| Coupure réseau prolongée | Le système passe en mode hors ligne (section 13.1). Après `THRESHOLD-OFFLINE-READONLY-HOURS`, passage en lecture seule. À la reconnexion, synchronisation (section 13.2). |
| Abandon de session | Le gérant utilise `ACT-FORCE-CLOSE` avec motif "abandon". Les données sont préservées, le solde théorique est calculé au moment du force-close. |

### 13.4 Force-close

- Procédure exclusive du gérant (`ROLE-GERANT` / ADMIN)
- Disponible depuis les états `STATE-OPEN` et `STATE-DISPUTED`
- Exige :
  1. Ré-authentification PIN (mot de passe de l'ADMIN)
  2. Motif obligatoire (champ texte, min 10 caractères)
- Effets :
  1. Le solde théorique est calculé au moment du force-close
  2. Le hash d'intégrité est calculé (sans déclarations valideur)
  3. La session passe en `STATE-FORCE_CLOSED`
  4. Un `ActivityLog` détaillé est créé (acteur, motif, horodatage, état précédent)
  5. `EVT-SESSION-FORCE-CLOSED` est émis
- Le gérant peut ensuite créer une session corrective si nécessaire (`ACT-CORRECTIVE-SESSION`)

---

## 14. Plan d'implémentation

### PHASE-1 — Fondations

- **Objectif** : Préparer le terrain pour le module caisse enrichi en alignant le code existant et en introduisant les concepts de base.
- **Pré-requis** : Aucun
- **Livrables** :
  1. Enum `ModePaiement` étendu : `ESPECES`, `MOBILE_MONEY_MTN`, `MOBILE_MONEY_MOOV`, `CARTE_BANCAIRE`
  2. Enum `StatutSession` étendu : `OUVERTE`, `EN_ATTENTE_CLOTURE`, `EN_ATTENTE_VALIDATION`, `VALIDEE`, `CONTESTEE`, `FORCEE`, `CORRIGEE`
  3. Concept de mouvement de caisse (`MouvementCaisse`) ajouté au schéma Prisma
  4. Migration rétroactive : création de mouvements de caisse pour les sessions et ventes historiques existantes
  5. Table de seuils paramétrables avec valeurs par défaut
  6. Nouvelles constantes d'actions dans `lib/activity-log.ts`
  7. Nouvelles permissions dans `lib/permissions.ts`
- **Critères d'acceptation** :
  - Les tests de migration passent (données historiques converties)
  - L'enum ModePaiement étendu est utilisable dans les formulaires
  - Le schéma Prisma est cohérent et les types générés sont corrects
  - Les sessions existantes conservent leur fonctionnement
- **Durée estimée** : Phase fondatrice
- **Risques** : Migration rétroactive sur données existantes ; changement d'enum ModePaiement cassant pour les paiements existants MOBILE_MONEY → nécessite un script de migration de données

### PHASE-2 — Service de mouvements

- **Objectif** : Capturer automatiquement tous les mouvements d'argent lors des ventes et remboursements.
- **Pré-requis** : `PHASE-1`
- **Livrables** :
  1. CashMovementService opérationnel
  2. Création automatique de mouvements VENTE lors de `POST /api/ventes`
  3. Création automatique de mouvements REMBOURSEMENT lors de `POST /api/ventes/[id]/annuler`
  4. Création de mouvements FOND_INITIAL lors de `POST /api/comptoir/sessions`
  5. Calcul du solde théorique par mode depuis les mouvements (remplacement du calcul par agrégation de paiements)
  6. Endpoint `GET /api/comptoir/sessions/[id]/movements`
  7. Affichage des mouvements dans l'interface session
- **Critères d'acceptation** :
  - Chaque vente génère un mouvement par paiement
  - Chaque annulation génère un mouvement compensatoire par paiement
  - Le solde théorique est identique au calcul précédent (tests de non-régression)
  - Les mouvements sont immuables (pas d'UPDATE/DELETE exposés)
- **Durée estimée** : Phase critique
- **Risques** : Régression sur le calcul du solde théorique ; performance des agrégations sur sessions avec beaucoup de mouvements

### PHASE-3 — Mouvements manuels

- **Objectif** : Permettre l'enregistrement manuel des apports, retraits et dépenses avec contrôle d'autorisation.
- **Pré-requis** : `PHASE-2`
- **Livrables** :
  1. Endpoint `POST /api/comptoir/movements` (types APPORT, RETRAIT, DEPENSE)
  2. Validation des seuils (`THRESHOLD-CASH-WITHDRAWAL-AUTH`, `THRESHOLD-EXPENSE-AUTH`)
  3. Mécanisme d'autorisation manager pour les dépassements de seuils
  4. Interface UI pour les mouvements manuels dans la page session
  5. Upload de justificatif pour les dépenses
  6. Mise à jour du solde théorique en temps réel après mouvement manuel
- **Critères d'acceptation** :
  - Un caissier crée un retrait ≤ seuil sans autorisation
  - Un retrait > seuil est refusé sans validation manager
  - Le solde théorique intègre les mouvements manuels
  - Le justificatif est stocké et consultable
- **Durée estimée** : Phase standard
- **Risques** : UX du mécanisme d'autorisation manager (temps réel vs asynchrone)

### PHASE-4 — Clôture étape 1

- **Objectif** : Remplacer la fermeture directe par la déclaration multi-modes du caissier.
- **Pré-requis** : `PHASE-3`
- **Livrables** :
  1. Endpoint `POST /api/comptoir/sessions/[id]/closure` (déclaration caissier)
  2. Endpoint `DELETE /api/comptoir/sessions/[id]/closure` (annulation clôture)
  3. Transition `STATE-OPEN` → `STATE-PENDING_CLOSURE` → `STATE-PENDING_VALIDATION`
  4. Interface UI de déclaration multi-modes (formulaire par mode de paiement actif dans la session)
  5. Affichage des écarts préliminaires après calcul théorique
  6. Remplacement de l'ancien PUT de fermeture (compatibilité transitoire)
- **Critères d'acceptation** :
  - Le caissier déclare ses montants par mode
  - Le système calcule les soldes théoriques depuis les mouvements
  - Les écarts sont affichés par mode
  - Le caissier peut annuler sa demande et revenir en OPEN
- **Durée estimée** : Phase standard
- **Risques** : Compatibilité avec l'interface existante de fermeture (SessionManager.tsx)

### PHASE-5 — Double validation

- **Objectif** : Implémenter la validation à l'aveugle, la réconciliation et le hash d'intégrité.
- **Pré-requis** : `PHASE-4`
- **Livrables** :
  1. Endpoint `POST /api/comptoir/sessions/[id]/validate` (validation aveugle)
  2. ReconciliationService avec les 4 cas (`RULE-RECONC-001` à `RULE-RECONC-004`)
  3. Gestion des recomptages (`ACT-RECOUNT`, `THRESHOLD-MAX-RECOUNT-ATTEMPTS`)
  4. Transition vers `STATE-DISPUTED` et `ACT-FORCE-CLOSE`
  5. IntegrityService : calcul hash SHA-256, chaînage
  6. Détection et catégorisation des écarts (`THRESHOLD-DISCREPANCY-*`)
  7. DiscrepancyService : suivi récurrences par caissier
  8. Interface UI de validation (formulaire aveugle pour le valideur)
  9. Notifications en cas d'écart MAJEUR ou récurrence
- **Critères d'acceptation** :
  - Le valideur ne voit pas les déclarations du caissier
  - Les 4 cas de réconciliation fonctionnent correctement
  - Le hash est calculé et vérifiable
  - Les sessions disputées nécessitent un force-close par le gérant
  - Les écarts récurrents déclenchent une alerte
- **Durée estimée** : Phase complexe
- **Risques** : UX de la validation à l'aveugle (le valideur doit comprendre la procédure) ; complexité de la réconciliation avec 4 modes de paiement

### PHASE-6 — Audit et reporting

- **Objectif** : Fournir au gérant les outils de supervision, vérification et reporting.
- **Pré-requis** : `PHASE-5`
- **Livrables** :
  1. Endpoint `POST /api/comptoir/sessions/[id]/verify` (vérification intégrité)
  2. Endpoint `GET /api/comptoir/sessions/[id]/z-report` (Z de caisse PDF)
  3. Endpoint `POST /api/comptoir/sessions/[id]/correct` (session corrective)
  4. CorrectiveSessionService
  5. ZReportService (génération PDF)
  6. Interface dashboard gérant : sessions historiques, écarts, vérification d'intégrité
  7. Endpoint `GET /api/comptoir/discrepancies` et `/recurring`
  8. Page de consultation des écarts récurrents par caissier
- **Critères d'acceptation** :
  - Le gérant vérifie l'intégrité d'une session (VALID/INVALID)
  - Le Z de caisse est généré en PDF avec toutes les données
  - La session corrective crée des mouvements CORRECTION sans modifier la session originale
  - Les écarts récurrents sont visibles par caissier
- **Durée estimée** : Phase standard
- **Risques** : Complexité du Z de caisse (mise en page PDF) ; performance de la vérification d'intégrité sur sessions avec beaucoup de mouvements

### PHASE-7 — Mode dégradé et durcissement

- **Objectif** : Assurer le fonctionnement hors ligne et renforcer la sécurité.
- **Pré-requis** : `PHASE-6`
- **Livrables** :
  1. OfflineService : détection de perte de connexion, mode dégradé
  2. Queue de synchronisation (IndexedDB côté client)
  3. Résolution de conflits à la reconnexion
  4. Passage en lecture seule après `THRESHOLD-OFFLINE-READONLY-HOURS`
  5. Ré-authentification PIN pour actions sensibles (force-close, session corrective)
  6. EventEmitterService : émission des événements `EVT-*`
  7. Tests de charge et de résilience
  8. Documentation opérationnelle (procédures d'incident)
- **Critères d'acceptation** :
  - Les ventes sont créées hors ligne et synchronisées à la reconnexion
  - Les conflits sont détectés et signalés
  - Le système passe en lecture seule après le délai configuré
  - La ré-authentification fonctionne pour les actions sensibles
  - Les événements sont émis et consommables
- **Durée estimée** : Phase complexe
- **Risques** : Complexité de la synchronisation hors ligne (conflits, doublons) ; fiabilité de IndexedDB sur navigateurs cibles

---

## 15. Critères de qualité

### 15.1 Tests unitaires

| Service | Couverture minimale | Focus |
|---------|-------------------|-------|
| CashMovementService | 90% | Création, immutabilité, calcul solde théorique |
| ClosureService | 90% | Transitions d'état, validations |
| ReconciliationService | 95% | Les 4 cas de réconciliation, seuils |
| IntegrityService | 95% | Calcul hash, vérification, chaînage |
| CorrectiveSessionService | 90% | Création, mouvements compensatoires |
| DiscrepancyService | 85% | Catégorisation, récurrences |
| SessionService | 85% | Ouverture, unicité, transitions |

### 15.2 Tests d'intégration

| Scénario | Règles couvertes |
|----------|-----------------|
| Ouverture session → mouvements FOND_INITIAL créés | `RULE-OPEN-001`, `RULE-OPEN-002`, `RULE-MVT-001` |
| Vente → mouvements VENTE créés avec bon montant | `RULE-MVT-002`, `RULE-MVT-005` |
| Annulation → mouvements REMBOURSEMENT créés | `RULE-MVT-003` |
| Retrait < seuil → autorisé | `RULE-AUTH-001`, `RULE-MVT-004` |
| Retrait > seuil sans autorisation → refusé | `RULE-AUTH-001` |
| Retrait > solde théorique → refusé | `RULE-MVT-004` |
| Déclaration caissier → transition PENDING_CLOSURE | `RULE-CLOSE-001` |
| Calcul théorique → transition PENDING_VALIDATION | `RULE-CLOSE-002` |
| Auto-validation → refusée | `RULE-AUTH-003` |
| Réconciliation cas 1 → VALIDATED | `RULE-RECONC-001` |
| Réconciliation cas 2 (écart mineur) → VALIDATED auto | `RULE-RECONC-002` |
| Réconciliation cas 2 (écart majeur) → acceptation requise | `RULE-RECONC-002` |
| Réconciliation cas 3 → moyenne et traitement | `RULE-RECONC-003` |
| Réconciliation cas 4 → recomptage puis DISPUTED | `RULE-RECONC-004` |
| Hash calculé → vérification VALID | `RULE-INTEGRITY-001`, `RULE-INTEGRITY-002` |
| Mouvement sur session validée → refusé | `RULE-INTEGRITY-003` |
| Session corrective → mouvements CORRECTION + hash | `RULE-CORRECTION-001`, `RULE-CORRECTION-002` |
| Force-close → hash + audit | `ACT-FORCE-CLOSE` |

### 15.3 Tests end-to-end

| Parcours | Actions |
|----------|---------|
| Journée complète caissier | Ouverture → 5 ventes (espèces + mobile money) → 1 retrait → déclaration → validation aveugle → VALIDATED |
| Changement de poste | Caissier A déclare → Caissier B valide → Caissier B ouvre sa session |
| Écart et recomptage | Déclaration avec écart → recomptage → 2e tentative → VALIDATED |
| Force-close | Session ouverte → force-close par gérant → Z de caisse |
| Session corrective | Session VALIDATED → correction par gérant → vérification intégrité |

### 15.4 Tests de résilience

| Scénario | Comportement attendu |
|----------|---------------------|
| Coupure réseau pendant vente | Transaction Prisma rollback ; pas de mouvement orphelin |
| Coupure courant pendant clôture | Session reste dans son dernier état persisté ; reprise possible |
| Deux caissiers ouvrent simultanément | Un seul réussit (contrainte unicité) |
| Tentative de modification de mouvement verrouillé | Rejeté avec erreur 422 |
| Charge : 100 ventes/minute | Temps de réponse < 500ms ; pas de deadlock |

### 15.5 Audit de sécurité

- Vérifier que `requireAuth()` est appelé sur chaque route
- Vérifier que `requireRole()` est appelé sur les routes restreintes
- Vérifier qu'aucun mot de passe ou token n'apparaît dans les ActivityLog metadata
- Vérifier que la ré-authentification PIN est effective pour force-close et session corrective
- Vérifier que le hash SHA-256 est calculé correctement (tests vectoriels)
- Vérifier que les mouvements de caisse sont réellement immuables (pas de route UPDATE/DELETE)
- Vérifier que le valideur ne peut pas voir les déclarations du caissier avant soumission

---

## 16. Cas limites et scénarios critiques

### EDGE-001 — Crash en plein milieu d'une transaction de vente

- **Description** : Le serveur Next.js crash après la création de la vente mais avant la création des mouvements de caisse.
- **Règles applicables** : `RULE-MVT-002`
- **Comportement attendu** : La transaction Prisma (`$transaction`) garantit l'atomicité. Si le crash survient avant le commit, toutes les opérations sont annulées (vente, lignes, paiements, mouvements stock, mouvements caisse). Aucune donnée partielle ne subsiste.
- **Comportement à éviter** : Vente créée sans mouvement de caisse correspondant (désynchronisation solde théorique).

### EDGE-002 — Deux caissiers tentent d'ouvrir simultanément le même comptoir

- **Description** : Deux requêtes POST /api/comptoir/sessions arrivent en même temps pour le même caissier.
- **Règles applicables** : `RULE-OPEN-001`
- **Comportement attendu** : La vérification d'unicité (session ouverte existante) est effectuée dans la requête. La première requête réussit, la seconde reçoit un 409 Conflict. Dans le MVP mono-comptoir, la contrainte est par caissier, pas par comptoir physique.
- **Comportement à éviter** : Deux sessions ouvertes pour le même caissier.

### EDGE-003 — Mode hors ligne dépassant le seuil

- **Description** : Le réseau est coupé pendant plus de `THRESHOLD-OFFLINE-READONLY-HOURS` heures.
- **Règles applicables** : Section 13.1
- **Comportement attendu** : Après le délai, le système passe en lecture seule. Les ventes créées avant le délai sont en queue de synchronisation. Le caissier voit un message clair indiquant le mode lecture seule. À la reconnexion, la synchronisation reprend.
- **Comportement à éviter** : Continuation des ventes après le délai (risque de divergence trop importante).

### EDGE-004 — Désaccord persistant entre caissier et valideur

- **Description** : Le caissier et le valideur déclarent des montants significativement différents à chaque recomptage, et le maximum de tentatives est atteint.
- **Règles applicables** : `RULE-RECONC-004`, `THRESHOLD-MAX-RECOUNT-ATTEMPTS`
- **Comportement attendu** : La session passe en `STATE-DISPUTED`. Le gérant est notifié. Seul le gérant peut résoudre la situation via `ACT-FORCE-CLOSE` avec motif obligatoire.
- **Comportement à éviter** : Boucle infinie de recomptages ; clôture automatique malgré le désaccord.

### EDGE-005 — Session abandonnée sans clôture

- **Description** : Un caissier quitte son poste sans fermer sa session (fin de journée, urgence).
- **Règles applicables** : `ACT-FORCE-CLOSE`
- **Comportement attendu** : La session reste en `STATE-OPEN`. Le gérant utilise `ACT-FORCE-CLOSE` avec motif "abandon". Le solde théorique est calculé au moment du force-close. Le hash est calculé sans déclarations.
- **Comportement à éviter** : Session qui reste ouverte indéfiniment bloquant le caissier pour les jours suivants.

### EDGE-006 — Tentative de modification d'un mouvement verrouillé

- **Description** : Une requête tente de modifier ou supprimer un mouvement de caisse d'une session validée.
- **Règles applicables** : `RULE-MVT-001`, `RULE-INTEGRITY-003`
- **Comportement attendu** : La requête est rejetée avec erreur 422. Aucune route UPDATE ou DELETE n'existe pour les mouvements de caisse.
- **Comportement à éviter** : Modification silencieuse d'un mouvement ; invalidation du hash sans détection.

### EDGE-007 — Mouvement créé pendant la transition vers PENDING_VALIDATION

- **Description** : Une vente est en cours de finalisation au moment exact où le caissier demande la clôture.
- **Règles applicables** : `RULE-CLOSE-001`, `RULE-MVT-002`
- **Comportement attendu** : La transition `STATE-OPEN` → `STATE-PENDING_CLOSURE` est atomique. Si une vente est en cours de création (transaction Prisma), la demande de clôture attend ou est rejetée (la session doit être en `STATE-OPEN` au moment de la transition, pas en cours de modification). Le calcul théorique inclut le mouvement de la vente finalisée si elle a été commitée avant la transition.
- **Comportement à éviter** : Mouvement créé après le calcul du solde théorique mais avant le hash (incohérence).

### EDGE-008 — Justificatif de dépense non uploadé

- **Description** : Un mouvement DEPENSE est créé sans justificatif attaché.
- **Règles applicables** : `RULE-MVT-004`
- **Comportement attendu** : Le mouvement est créé (le justificatif est facultatif, non bloquant). L'ActivityLog enregistre l'absence de justificatif. Le gérant est informé lors de la revue de session.
- **Comportement à éviter** : Blocage de la dépense pour absence de justificatif (nuirait à l'opérationnel).

### EDGE-009 — Caissier qui valide sa propre session

- **Description** : Un caissier tente de soumettre la validation à l'aveugle de sa propre session.
- **Règles applicables** : `RULE-AUTH-003`
- **Comportement attendu** : La requête est rejetée avec erreur 403. Le système vérifie que l'identifiant du valideur est différent de l'identifiant du caissier propriétaire de la session.
- **Comportement à éviter** : Validation acceptée (compromet la double vérification).

### EDGE-010 — Paiement mixte avec montant espèces supérieur au total

- **Description** : Une vente de 10 000 FCFA est payée avec 15 000 FCFA en espèces et 0 en mobile money. Le mouvement de caisse VENTE enregistre 10 000 FCFA (total de la vente), pas 15 000 FCFA (montant reçu).
- **Règles applicables** : `RULE-MVT-005`
- **Comportement attendu** : Le mouvement de caisse de type VENTE pour le mode ESPECES enregistre le total de la part espèces de la vente, pas le montant reçu. La monnaie rendue (5 000 FCFA) n'apparaît pas comme mouvement séparé — elle est implicite dans la différence entre montant reçu et total.
- **Comportement à éviter** : Enregistrer le montant reçu comme mouvement (gonflerait le solde théorique).

### EDGE-011 — Session avec aucune vente

- **Description** : Un caissier ouvre une session, n'effectue aucune vente, puis demande la clôture.
- **Règles applicables** : `RULE-CLOSE-001`, `RULE-OPEN-002`
- **Comportement attendu** : La clôture est autorisée. Le seul mouvement est le FOND_INITIAL. Le solde théorique = fond initial. Si le comptage physique confirme le fond, écart = 0.
- **Comportement à éviter** : Refus de clôture pour absence de ventes.

### EDGE-012 — Hash chaîné : vérification d'une session intermédiaire

- **Description** : Le gérant vérifie l'intégrité de la session N, mais la session N-1 a été altérée.
- **Règles applicables** : `RULE-INTEGRITY-001`, `RULE-INTEGRITY-002`
- **Comportement attendu** : La vérification de la session N réussit si ses propres données n'ont pas été altérées (le hash de N-1 stocké dans N est celui qui a été calculé au moment de la validation de N). Pour détecter l'altération de N-1, il faut vérifier N-1 directement. Le chaînage permet de détecter une altération en vérifiant la chaîne complète.
- **Comportement à éviter** : Faux négatif (dire qu'une session est valide alors que la chaîne est brisée en amont).

---

## 17. Annexes

### 17.1 Justifications métier

| Choix | Justification |
|-------|---------------|
| **Double validation à l'aveugle** | Dans le contexte des commerces béninois, le changement de poste est fréquent (plusieurs caissiers par jour). La validation par un tiers indépendant réduit les risques de fraude et d'erreur de comptage. Le comptage aveugle garantit l'objectivité. |
| **Immutabilité des mouvements** | Principe comptable fondamental : un enregistrement financier ne doit jamais être modifié après création. Les corrections se font par mouvements compensatoires, préservant la traçabilité complète. Conforme aux principes OHADA. |
| **Solde théorique recalculé, pas stocké** | Évite les incohérences entre un solde stocké et l'historique des mouvements. Le recalcul depuis les mouvements garantit la cohérence à tout moment. |
| **Hash d'intégrité chaîné** | Inspiré du principe blockchain : chaque session inclut le hash de la précédente, rendant toute altération rétroactive détectable. Adapté au contexte d'audit OHADA. |
| **Posting comptable différé (événements)** | Le module caisse ne doit pas dépendre du module comptabilité (pas encore développé). L'émission d'événements permet un découplage strict tout en préparant l'intégration future. |
| **Mode dégradé hors ligne** | Les coupures de courant et de réseau sont fréquentes à Cotonou. Le commerce doit pouvoir continuer à fonctionner pendant les interruptions, avec une resynchronisation fiable à la reprise. |
| **Sessions correctives (pas de modification directe)** | Préserve l'intégrité de l'historique tout en permettant les rectifications nécessaires. L'audit complet de la correction (qui, quand, pourquoi) est garanti. |
| **Seuils paramétrables** | Les marges d'erreur acceptables varient selon le type de commerce, le volume de transactions et la politique interne. Les valeurs par défaut sont adaptées au contexte FCFA des petits commerces béninois. |

### 17.2 Références

| Référence | Contexte |
|-----------|----------|
| OHADA — Acte Uniforme relatif au droit comptable et à l'information financière | Principes d'immutabilité des écritures, traçabilité, justification des mouvements |
| FCFA (Franc CFA — Zone UEMOA) | Monnaie sans sous-unités (pas de centimes) — tous les montants sont entiers en FCFA |
| MTN Mobile Money (Bénin) | Service de paiement mobile MTN, référence de transaction obligatoire |
| Moov Money (Bénin) | Service de paiement mobile Moov Africa, référence de transaction obligatoire |

### 17.3 Synthèse de l'analyse de l'existant

#### Fichiers explorés

| Fichier | Contenu clé |
|---------|-------------|
| `web/app/prisma/schema.prisma` | 13 modèles dont ComptoirSession, Vente, Paiement, LigneVente, MouvementStock, User, ActivityLog, Parametres, Taxe |
| `web/app/src/app/api/comptoir/sessions/route.ts` | POST (ouverture session CAISSIER) et GET (liste sessions) |
| `web/app/src/app/api/comptoir/sessions/[id]/route.ts` | GET (détail + solde théorique) et PUT (fermeture avec écarts) |
| `web/app/src/app/api/ventes/route.ts` | GET (liste paginée) et POST (création vente atomique avec stock + taxes) |
| `web/app/src/app/api/ventes/[id]/route.ts` | GET (détail vente) |
| `web/app/src/app/api/ventes/[id]/annuler/route.ts` | POST (annulation ADMIN/MANAGER avec restauration stock) |
| `web/app/src/app/api/tickets/[id]/pdf/route.ts` | GET (génération PDF ticket) |
| `web/app/src/app/api/tickets/[id]/print/route.ts` | POST (impression thermique ESC/POS) |
| `web/app/src/app/api/cash-drawer/open/route.ts` | POST (ouverture tiroir-caisse) |
| `web/app/src/app/api/dashboard/kpis/route.ts` | GET (KPIs avec filtrage par rôle et période) |
| `web/app/src/components/comptoir/POSInterface.tsx` | Interface POS complète (grille, panier, paiement, douchette) |
| `web/app/src/components/comptoir/SessionManager.tsx` | Gestion ouverture/fermeture sessions |
| `web/app/src/components/comptoir/CancelButton.tsx` | Bouton annulation vente |
| `web/app/src/components/comptoir/TicketActions.tsx` | Actions ticket (PDF, impression) |
| `web/app/src/store/cartStore.ts` | Zustand store panier POS avec persistance sessionStorage |
| `web/app/src/lib/permissions.ts` | Matrice RBAC (ADMIN, MANAGER, CAISSIER) |
| `web/app/src/lib/activity-log.ts` | logActivity() + constantes d'actions |
| `web/app/src/auth.ts` | NextAuth v5 credentials provider |
| `web/app/src/lib/validations/session.ts` | Zod schemas ouverture/fermeture session |
| `web/app/src/lib/validations/vente.ts` | Zod schemas création vente |
| `web/app/src/lib/receipt/thermal-printer.ts` | Impression ESC/POS + tiroir-caisse |
| `web/app/src/lib/receipt/pdf-generator.tsx` | Génération PDF ticket (@react-pdf/renderer) |

#### Conclusions principales

1. **Le module comptoir existant est fonctionnel et bien structuré** — les conventions sont cohérentes, le code suit les patterns établis (Zod validation, Prisma transactions, ActivityLog, RBAC).
2. **Le principal manque est l'absence de mouvements de caisse** — le solde théorique est calculé par agrégation directe des paiements, ce qui est correct mais ne permet pas la traçabilité fine ni les mouvements manuels.
3. **La clôture en une étape est la lacune fonctionnelle majeure** — pas de validation tierce, pas de double comptage, pas de détection d'écarts sophistiquée.
4. **L'architecture existante est extensible** — l'ajout de nouveaux modèles, routes et services s'intègre naturellement dans la structure actuelle.
5. **Les enum Prisma limitent les modes de paiement** — le passage de MOBILE_MONEY à MTN/Moov nécessite une migration de données pour les paiements existants.
