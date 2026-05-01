# Spec — Module Authentification

## Objectif
Permettre à des utilisateurs de se connecter à AerisPay de manière **sécurisée**, avec un modèle d’**autorisation** aligné sur **deux niveaux** : le **groupe (structure / réseau)** d’une part, et le **point de vente (magasin)** d’autre part — en majorité des **caissiers** au quotidien sur le site.

Toute évolution d’`enum` ou de schéma (ex. `niveau` + rôles étendus) reste **TDD** (tests des contrôles d’accès avant l’implémentation).

---

## 1. Deux niveaux d’utilisateurs

| Niveau | Périmètre typique | Qui s’y connecte (vocation) |
|--------|-------------------|----------------------------|
| **Groupe (structure)** | Stratégie, gouvernance, **synthèses multi-magasins**, comptes transverses (futur) | Très **peu** d’utilisateurs : direction, support réseau, rôles d’**audit** ou de **lecture** consolidée |
| **Point de vente (PDV)** | Opérations **quotidiennes** d’un seul supermarché (stock, comptoir, clôture, équipe de vente) | L’**équipe locale** : en **volume** surtout des **caissiers** ; complétée par le **gérant** (encadrement) et l’**administrateur local** (comptes, paramètres) |

- En **MVP** mono-déploiement (un magasin = une base), l’`enum` actuel ne contient que des rôles de **niveau point de vente** (sections 2 et 3 ci-dessous).
- L’introduction de comptes **groupe** (extranet, base centrale ou fédération) ajoutera des codes dédiés et un champ **`niveauCompte` (ou `scope`)** : voir la section 4 et `SPECS/MULTI_ORGANISATION.md`.

---

## 2. Rôles — Point de vente (MVP)

Ces rôles s’appliquent **au site sur lequel l’instance est installée** (un seul point de vente en MVP).

| Code (Prisma) | Dénomination métier | Rôle | Accès résumé |
|---------------|---------------------|------|--------------|
| `ADMIN` | **Administrateur du point de vente** | Tout l’**administratif** local : comptes utilisateurs **du magasin**, paramétrage, toutes opérations métier autorisées par l’appli. | Complet sur **ce** magasin. |
| `MANAGER` | **Gérant / responsable de magasin** | Encadrement, **stock**, **comptoir**, clôture de session d’autres opérateurs, rapports locaux, journal d’activité (lecture). | Pas de **création / désactivation** des comptes utilisateurs (réservé `ADMIN` au MVP). |
| `CAISSIER` | **Caissier** (cœur du poste) | Vente, session de comptoir, lecture stock, impression ticket. | Pas d’accès **gestion** du stock, pas d’annulation de vente, pas d’`activity-logs`, pas de **gestion des comptes**. |

**Aucune inscription publique** : il n’existe pas de route d’inscription libre. Les comptes **niveau PDV** sont créés par un utilisateur `ADMIN` (administrateur **local**), via l’UI `/users` et `POST /api/users` (voir la section 5). Les comptes **groupe** seront définis dans une phase ultérieure (provisionnement côté siège ou outil dédié — à spécifier en implémentation).

---

## 3. Matrice d’autorisations (MVP, niveau PDV)

| Fonctionnalité | `ADMIN` (PDV) | `MANAGER` (Gérant) | `CAISSIER` |
|----------------|:-------------:|:------------------:|:----------:|
| Créer / modifier / désactiver comptes **de ce magasin** | Oui | Non | Non |
| Créer / modifier produits, stock | Oui | Oui | Non |
| Vendre, ouvrir/fermer **sa** session de comptoir | Oui | Oui | Oui |
| Gérer / clôturer session **d’un autre** opérateur | Oui | Oui | Non |
| Annuler une vente | Oui | Oui | Non |
| Consulter le journal d’activité (audit) | Oui | Oui | Non |
| Rapports / KPIs **locaux** | Oui | Oui | Non |

*(Aligné sur le tableau de `ARCHITECTURE_MVP.md` §8 ; l’écart volontaire : seul l’`ADMIN` gère les utilisateurs.)*

---

## 4. Rôles cible — multi-organisation (hors scope MVP intégral)

Quand le mode **groupe** sera en base, ajouter notamment (noms de code indicatifs — à figer en migration) :

| Niveau | Code cible (indicatif) | Rôle |
|--------|------------------------|------|
| Groupe | `ADMIN_RESEAU` | Administrateur **structure** : gouvernance, rattachement des points de vente, politique transverse (détails : releases futures). |
| Groupe | `LECTEUR_RESEAU` (ou équivalent) | **Consultation** d’indicateurs / exports **multi-magasins**, sans opération locale obligatoire (souvent lecture seule côté décision). |
| PDV | `ADMIN` *(inchangé ou alias `ADMIN_PDV` en doc seulement)* | Reste l’**admin local** de **son** point de vente. |
| PDV | `MANAGER` | Reste le **gérant** de **ce** point de vente. |
| PDV | `CAISSIER` | Rôle opérationnel inchangé. |

**Règles d’or** : un `CAISSIER` et un `MANAGER` n’agissent **jamais** sur le périmètre d’un autre magasin (isolation) ; seuls les rôles **groupe** ont un mandat explicite **transverse** — `SPECS/MULTI_ORGANISATION.md`.

---

## 5. Gouvernance de la création de comptes

| Action | QUI peut (MVP) | QUI pourra (cible) |
|--------|----------------|-------------------|
| Créer / modifier comptes **dans** un magasin (caissiers, gérants) | `ADMIN` **de ce** point de vente | Idem, ou compte `ADMIN_RESEAU` si politique groupe impose le provisionnement |
| Accès **lecture** transverse (plusieurs magasins) | — (non présent) | `LECTEUR_RESEAU` / rôle groupe équivalent |
| S’inscrire seul sur Internet | Personne (pas d’inscription publique) | Inchangé |

`MANAGER` : **pas** d’écran / API de création d’utilisateurs (évite la prolifération des comptes sans contrôle `ADMIN`).

---

## 6. Flux d'authentification (inchangé, principe)

```
1. Utilisateur accède à /login
2. Saisie email + mot de passe
3. NextAuth vérifie les credentials en base (bcrypt sur le hash)
4. Si valide → JWT (ou session) avec { id, name, email, role [, niveau / magasin / organisation si schéma étendu] }
5. Redirection vers le dashboard
6. Middleware vérifie la session sur les routes protégées ; chaque API métier re-valide rôle (et, plus tard, scope)
```

## Pages (MVP)

### `(auth)/login` — `/login`
- Formulaire email + mot de passe
- Lien "Mot de passe oublié" (v1.1, pas MVP)
- Aucun lien d’inscription publique

### `(dashboard)/users` — réservé `ADMIN` **(PDV)**
- Réservé à l’**administrateur du point de vente** : liste et création de comptes **pour ce site uniquement** (MVP)

## Sécurité
- Mots de passe : **bcrypt minimum 12 rounds**, jamais stockés en clair
- `NEXTAUTH_SECRET` pour la signature JWT (générer avec `openssl rand -base64 32`)
- Session : durée de travail d’une journée (ou configuration équivalente)
- Middleware : routes limitées ; APIs sensibles refont un contrôle de rôle
- **Rate limiting** : limiter les tentatives de connexion sur `POST /api/auth/callback/credentials` (ex. 10 tentatives / 15 min par IP) pour résister aux attaques par force brute. À implémenter via middleware Next.js ou reverse proxy (Nginx, Traefik)
- **CSRF** : géré automatiquement par NextAuth.js v5 (token CSRF inclus dans les callbacks)

## Modèle Prisma (MVP, référence)

```prisma
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  passwordHash  String
  role          Role     @default(CAISSIER)
  active        Boolean  @default(true)
  // Évolution cible (multi-organisation) :
  // niveau      NiveauCompte? @default(POINT_DE_VENTE)
  // magasinId   String?
  // organisationId String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum Role {
  ADMIN      // = administrateur du point de vente (MVP)
  MANAGER    // = gérant
  CAISSIER
  // Cible future : ADMIN_RESEAU, LECTEUR_RESEAU, etc.
}
```

## Tests requis (TDD)

- [ ] Login valide / invalide
- [ ] Route protégée sans session → redirection / 401
- [ ] Règles par rôle cohérentes avec le tableau §3
- [ ] Aucun `POST /api/users` sans `ADMIN`
- [ ] `MANAGER` : pas d’accès à `/users` (création de comptes)
- [ ] (Futur) isolation : un jeton d’un autre `magasinId` ne lève pas de données d’un autre site

---

*AerisPay — Spec authentification — v2 (deux niveaux) · Avril 2026*
