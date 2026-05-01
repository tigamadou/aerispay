---
title: Génération de spécification — Module Caisse
type: prompt-spec-generation
target: Claude Code
output: SPECS/SPEC_MODULE_CAISSE.md
version: 1.0
date: 2026-05-01
author: Amadou Ibrahim
---

# Mission

Génère un document de spécification technique du **module Caisse** d'un logiciel de point de vente. Ce document sera consommé par une IA de développement (Claude Code) qui s'en servira comme référence pour implémenter, étendre et maintenir le module.

Le document doit être **optimisé pour la consommation par IA** :
- Structure prévisible et hiérarchisée
- Règles explicites et non-ambiguës (pas de "généralement", "souvent", "à voir selon le cas")
- Identifiants stables pour chaque règle, état, événement, action (référençables : `RULE-OPEN-001`, `STATE-PENDING_VALIDATION`, `EVT-CASH-MOVEMENT-CREATED`)
- Comportements définis sous forme de pré-conditions, actions, post-conditions
- Cas limites explicitement listés (pas implicites)
- Aucune phrase de transition narrative inutile
- Aucune justification métier en dehors d'une section dédiée

# Phase préalable obligatoire : analyse de l'existant

**Avant de rédiger quoi que ce soit, tu dois analyser le code source du projet** pour comprendre l'état actuel. Cette analyse est non-négociable et doit être méthodique.

## Procédure d'analyse

1. **Cartographie du projet** : explore la structure des dossiers, identifie le langage, le framework, l'organisation modulaire
2. **Identification des entités liées à la caisse** : recherche les concepts pertinents — comptoir, session, caissier, vente, paiement, remboursement, mode de paiement, mouvement, solde, ouverture, fermeture, etc. Adapte la recherche à la langue du code (anglais ou français selon ce qui est utilisé)
3. **Lecture des fichiers identifiés** : modèles, services, contrôleurs, migrations, routes, tests
4. **Cartographie des relations** : comment les entités sont connectées entre elles
5. **Identification des comportements existants** : que peut faire un caissier aujourd'hui ? quelles règles sont déjà en place ? quelles validations existent ?
6. **Identification des manques** par rapport aux objectifs listés ci-dessous
7. **Identification des conventions du projet** : nommage, structure, patterns architecturaux utilisés — la spec devra s'y conformer

## Restitution de l'analyse

Tu produiras la section "Évolution de l'existant" du document **uniquement à partir de cette analyse réelle**, en référençant les fichiers et entités effectivement trouvés (avec chemins relatifs). Aucune supposition : si un concept n'est pas clairement présent dans le code, considère-le comme absent. Si un concept est présent mais incomplet, décris précisément son état actuel avant de proposer son évolution.

Si l'analyse révèle des éléments inattendus (architecture spécifique, conventions inhabituelles, modules connexes), intègre-les dans le document — la spec doit s'adapter à la réalité du projet, pas l'inverse.

# Objectifs du module enrichi

Quel que soit l'état de l'existant, le module final doit atteindre les objectifs suivants :

1. **Traçabilité complète** : chaque mouvement d'argent (entrée/sortie) est enregistré avec auteur, motif, justificatif, horodatage. Les mouvements sont immuables après création.
2. **Solde théorique calculé en temps réel**, séparément par mode de paiement, jamais stocké brut, toujours recalculable à partir de l'historique des mouvements.
3. **Multi-modes de paiement** : espèces, Mobile Money (MTN, Moov), carte bancaire, et extensible. Chaque mode a son propre cycle de réconciliation.
4. **Double validation à l'aveugle lors de la clôture** : un caissier déclare un montant, un tiers (manager OU caissier entrant) déclare indépendamment son propre comptage sans voir celui du caissier. Le système réconcilie.
5. **Détection et catégorisation des écarts** avec seuils paramétrables, alertes automatiques, suivi des écarts récurrents par caissier.
6. **Intégrité cryptographique** : sessions clôturées verrouillées par hash, vérifiable a posteriori pour détecter toute altération.
7. **Mode dégradé hors ligne** : fonctionnement en cas de coupure réseau ou électrique (contexte Cotonou), avec synchronisation différée et résolution de conflits.
8. **Émission d'événements** pour intégration future avec un module Comptabilité (à développer séparément). **Aucune logique comptable n'est dans ce module.**
9. **Auditabilité totale** : un gérant doit pouvoir reconstituer toute l'histoire d'une session, vérifier son intégrité, et identifier qui a fait quoi à quel moment.
10. **Sessions correctives** : procédure exclusive du gérant pour corriger une session validée en cas d'erreur découverte a posteriori, avec audit complet.

# Contraintes

- **Pas de modèle de données détaillé** dans le document : aucune table, aucun champ, aucun DDL SQL. Décrire les concepts au niveau fonctionnel uniquement. L'équipe technique fera l'implémentation.
- **Principe d'immutabilité** : un mouvement enregistré n'est jamais modifié ni supprimé. Corrections par mouvements compensatoires uniquement.
- **Découplage strict avec la comptabilité** : émission d'événements uniquement, aucune écriture comptable, aucun plan comptable, aucun journal comptable dans ce module.
- **Phasage incrémental** : 7 phases livrables indépendamment, chacune apportant une valeur déployable.
- **Conformité aux conventions du projet existant** identifiées lors de l'analyse.
- Contexte béninois : FCFA, Mobile Money MTN et Moov, zone OHADA.

# Structure exigée du document

Le document doit suivre **exactement** cette structure, dans cet ordre :

## 0. Métadonnées
- Version du document
- Date
- Statut
- Conventions de nommage des identifiants utilisés (`RULE-*`, `STATE-*`, `EVT-*`, `ACT-*`, `ROLE-*`, `PERM-*`, `PHASE-*`, `CONCEPT-*`, `EDGE-*`, `THRESHOLD-*`)

## 1. Glossaire
Liste alphabétique de tous les termes métier utilisés, avec définition stricte d'une à deux phrases. Chaque terme défini ici doit être utilisé de manière cohérente partout ailleurs. Inclure au minimum : Caissier, Caissier entrant, Comptoir, Écart, Fond de caisse, Gérant, Hash d'intégrité, Manager, Mode de paiement, Mouvement de caisse, Session, Session corrective, Solde théorique, Validation à l'aveugle, Z de caisse. Ajouter tout terme spécifique au projet identifié pendant l'analyse.

## 2. Périmètre
- **2.1 IN** : liste exhaustive des fonctionnalités couvertes
- **2.2 OUT** : liste exhaustive de ce qui n'est PAS dans ce module (notamment toute logique comptable, états financiers, plan comptable)
- **2.3 Dépendances** : modules existants requis avec leur rôle exact (références aux fichiers/dossiers identifiés lors de l'analyse)

## 3. Analyse de l'existant
Section produite à partir de l'exploration du code source. Pour chaque concept pertinent trouvé :

- **3.1 Inventaire** : tableau listant les entités/concepts existants liés à la caisse, avec leur localisation dans le code (chemin relatif), leur rôle actuel, leur niveau de complétude
- **3.2 Comportements existants** : ce que le système permet déjà de faire aujourd'hui, sous forme de liste structurée
- **3.3 Lacunes identifiées** : pour chaque objectif listé en section "Objectifs", indiquer ce qui manque ou est insuffisant dans l'existant
- **3.4 Conventions du projet** : patterns architecturaux, nommage, structures à respecter pour rester cohérent

## 4. Évolution de l'existant
Pour chaque entité ou concept existant identifié en section 3, trois sous-sections strictes :
- **CONSERVÉ** : ce qui ne change pas
- **ENRICHI** : ce qui doit être étendu (au niveau conceptuel)
- **NOUVEAU** : nouveaux concepts à introduire en lien avec cette entité

## 5. Concepts métier introduits
Pour chaque nouveau concept (Mouvement de caisse, Mode de paiement, Validation de session, Solde théorique, Hash d'intégrité, et tout autre concept pertinent identifié), une fiche structurée :
- **Identifiant** : `CONCEPT-XXX`
- **Définition** : 1 à 3 phrases
- **Rôle dans le système**
- **Propriétés clés** (conceptuelles, pas champs de données)
- **Invariants** : règles toujours vraies, sous forme de liste
- **Relations avec autres concepts**

## 6. États et cycle de vie de la session
- **6.1 États** : tableau exhaustif avec identifiant `STATE-XXX`, nom, description, actions autorisées dans cet état
- **6.2 Transitions** : tableau exhaustif `TRANS-XXX` avec : état source, état cible, déclencheur, conditions, effets de bord
- **6.3 Diagramme textuel** : représentation ASCII des transitions

## 7. Règles métier
Chaque règle est numérotée `RULE-CATEGORIE-NNN` et structurée ainsi :
- **ID**
- **Titre court**
- **Énoncé** : phrase impérative non-ambiguë
- **Pré-conditions** : liste
- **Post-conditions** : liste
- **Exceptions** : liste explicite des cas limites
- **Règles liées** : références par ID

Catégories de règles à couvrir au minimum :
- `RULE-OPEN-*` : ouverture de session
- `RULE-MVT-*` : création de mouvements
- `RULE-AUTH-*` : autorisations et seuils
- `RULE-CLOSE-*` : clôture (4 étapes : déclaration caissier, calcul théorique serveur, validation à l'aveugle, réconciliation)
- `RULE-RECONC-*` : les 4 cas de réconciliation
- `RULE-INTEGRITY-*` : verrouillage et hash
- `RULE-CORRECTION-*` : sessions correctives par le gérant

Inclure les seuils paramétrables sous forme de constantes nommées avec valeurs par défaut :
- `THRESHOLD-DISCREPANCY-MINOR` (défaut : 500 FCFA)
- `THRESHOLD-DISCREPANCY-MEDIUM` (défaut : 5 000 FCFA)
- `THRESHOLD-DISCREPANCY-MAJOR` (défaut : > 5 000 FCFA)
- `THRESHOLD-RECURRING-COUNT` (défaut : 3)
- `THRESHOLD-RECURRING-PERIOD-DAYS` (défaut : 7)
- `THRESHOLD-CASH-WITHDRAWAL-AUTH` (défaut : 10 000 FCFA)
- `THRESHOLD-EXPENSE-AUTH` (défaut : 5 000 FCFA)
- `MAX-CLOSURE-RECOUNT-ATTEMPTS` (défaut : 3)
- `OFFLINE-READONLY-AFTER-HOURS` (défaut : 4)

## 8. Actions et parcours
- **8.1 Catalogue des actions** : tableau de toutes les actions exposées, identifiées `ACT-XXX`, avec : nom, acteur autorisé, état requis, pré-conditions, effets, événements émis
- **8.2 Parcours par rôle** : pour chaque rôle (Caissier, Caissier entrant, Manager, Gérant), séquence d'actions sous forme de liste numérotée référençant les `ACT-XXX`

## 9. Permissions
Matrice exhaustive sous forme de tableau :
- Lignes : actions `ACT-XXX`
- Colonnes : rôles identifiés (`ROLE-CASHIER`, `ROLE-INCOMING_CASHIER`, `ROLE-MANAGER`, `ROLE-GERANT`, plus tout rôle pertinent identifié dans l'existant)
- Cellules : `ALLOWED` / `DENIED` / `CONDITIONAL` (avec référence à la condition)
- Pour chaque cellule `CONDITIONAL`, détailler la condition exacte sous l'identifiant `PERM-COND-XXX`

## 10. Événements émis
Catalogue exhaustif sous forme de fiches `EVT-XXX` avec :
- Identifiant
- Nom
- Déclencheur exact (action ou transition d'état)
- Données conceptuelles transportées (sans schéma JSON, juste la liste des informations)
- Consommateurs prévus (préciser : module Comptabilité futur, audit, notifications)
- Garanties (au moins une fois, idempotent, ordonné par session, etc.)

Inclure au minimum : `EVT-SESSION-OPENED`, `EVT-CASH-MOVEMENT-CREATED`, `EVT-SESSION-CLOSURE-REQUESTED`, `EVT-SESSION-VALIDATED`, `EVT-DISCREPANCY-DETECTED`, `EVT-SESSION-DISPUTED`, `EVT-SESSION-CORRECTED`.

## 11. Architecture fonctionnelle
- **11.1 Services métier** : liste des services à créer ou enrichir, chacun avec identifiant, responsabilité unique, opérations exposées. Préciser pour chaque service s'il est nouveau ou s'il enrichit un service existant (avec chemin du fichier).
- **11.2 Endpoints API** : liste sous forme de tableau (méthode HTTP conceptuelle, chemin, action déclenchée `ACT-XXX`, rôle requis). Suivre les conventions de nommage d'API identifiées dans l'existant.
- **11.3 Interactions avec modules existants** : pour chaque interaction, type (lecture/écriture/événement), direction, point de couplage (référence aux fichiers existants).

## 12. Sécurité
- **12.1 Authentification** : règles d'authentification standard et renforcée (ré-authentification PIN obligatoire pour quelles actions). S'appuyer sur le mécanisme d'authentification existant identifié dans l'analyse.
- **12.2 Logs d'audit** : règles d'immuabilité, chaînage cryptographique, contenu minimal d'une entrée
- **12.3 Intégrité** : algorithme de hash, données incluses dans le calcul, procédure de vérification

## 13. Mode dégradé
- **13.1 Hors ligne** : règles de fonctionnement, données mises en cache, limites
- **13.2 Synchronisation** : stratégie de queue, ordre, résolution de conflits
- **13.3 Reprise sur incident** : procédures pour : crash applicatif, coupure de courant, coupure réseau prolongée, abandon de session
- **13.4 Force-close** : procédure exclusive du gérant avec audit obligatoire

## 14. Plan d'implémentation
**7 phases**, chacune sous forme de fiche structurée :
- **PHASE-N**
- Objectif (1 phrase)
- Pré-requis (références aux phases précédentes)
- Livrables (liste numérotée, chaque livrable est une capacité fonctionnelle observable)
- Critères d'acceptation (liste de conditions vérifiables)
- Durée estimée
- Risques principaux

Les 7 phases imposées :
1. **PHASE-1** : Fondations (préparation du terrain, alignement avec l'existant, migration rétroactive si nécessaire)
2. **PHASE-2** : Service de mouvements (capture automatique des ventes/remboursements existants)
3. **PHASE-3** : Mouvements manuels (apports, retraits, dépenses, autorisations)
4. **PHASE-4** : Clôture étape 1 (déclaration caissier multi-modes)
5. **PHASE-5** : Double validation (validation à l'aveugle, réconciliation, hash)
6. **PHASE-6** : Audit et reporting (dashboard gérant, vérification d'intégrité)
7. **PHASE-7** : Mode dégradé et durcissement (hors ligne, sécurité, charge)

## 15. Critères de qualité
- **15.1 Tests unitaires** : couverture minimale par catégorie de service
- **15.2 Tests d'intégration** : scénarios obligatoires à couvrir (liste exhaustive référençant les `RULE-XXX` et `ACT-XXX`)
- **15.3 Tests end-to-end** : parcours complets à valider
- **15.4 Tests de résilience** : scénarios de coupure, hors ligne, charge
- **15.5 Audit de sécurité** : checklist de vérifications

## 16. Cas limites et scénarios critiques
Liste exhaustive de cas limites identifiés, chacun avec identifiant `EDGE-XXX` :
- Description du cas
- Règles applicables (références)
- Comportement attendu
- Comportement à éviter

Inclure au minimum :
- Crash en plein milieu d'une transaction
- Deux caissiers tentent d'ouvrir simultanément le même comptoir
- Mode hors ligne dépassant le seuil
- Désaccord persistant entre caissier et valideur
- Session abandonnée sans clôture
- Tentative de modification d'un mouvement verrouillé
- Mouvement créé pendant que la session passe en pending_validation
- Justificatif de dépense non uploadé mais mouvement créé
- Caissier qui valide sa propre session (à interdire explicitement)
- Tout autre cas limite identifié pendant l'analyse de l'existant

## 17. Annexes
- **17.1 Justifications métier** : pour les choix non-évidents (pourquoi double validation, pourquoi validation à la clôture, pourquoi posting comptable différé, etc.)
- **17.2 Références** : standards évoqués (OHADA, etc.)
- **17.3 Synthèse de l'analyse de l'existant** : récapitulatif des fichiers explorés et des conclusions principales

# Exigences de forme

- **Langue** : français
- **Format** : Markdown strict
- **Style** : impératif, déterministe, sans ambiguïté ; éviter "peut", "pourrait", "généralement"
- **Identifiants** : chaque règle, état, événement, action, rôle, phase, cas limite porte un identifiant unique stable et auto-référençable
- **Tableaux systématiques** pour : états, transitions, permissions, endpoints, événements, phases
- **Pas de pseudo-code, pas de SQL, pas de schéma de données**
- **Référencement croisé** : utiliser systématiquement les identifiants pour référencer d'autres parties du document
- **Références au code existant** : quand pertinent, citer les chemins relatifs des fichiers du projet
- **Longueur** : aussi long que nécessaire pour l'exhaustivité

# Procédure d'exécution

1. **Phase 1 — Analyse** : explore le projet de manière méthodique, lis les fichiers pertinents, construis ta compréhension de l'existant. Ne rédige rien tant que cette phase n'est pas terminée.
2. **Phase 2 — Synthèse** : structure mentalement les évolutions nécessaires en croisant l'existant et les objectifs.
3. **Phase 3 — Rédaction** : produis le document selon la structure exigée, en t'appuyant sur l'analyse réelle.
4. **Phase 4 — Vérification** : relis le document pour vérifier la cohérence des identifiants, la complétude des références croisées, l'absence d'ambiguïté.

# Livrable

Un fichier unique : `SPECS/SPEC_MODULE_CAISSE.md`

Démarre par l'analyse du projet, puis génère le document. Pas de préambule conversationnel, pas de commentaire de méta-niveau dans le document final.