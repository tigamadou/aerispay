# Spec — Module Authentification

## Objectif
Permettre à des utilisateurs avec des rôles différents de se connecter à AerisPay de manière sécurisée.

## Rôles

| Rôle | Description | Accès |
|---|---|---|
| `ADMIN` | Propriétaire / administrateur | Accès total |
| `MANAGER` | Responsable de magasin | Stock + Caisse + Rapports |
| `CAISSIER` | Employé caisse | Caisse uniquement (lecture stock) |

## Flux d'authentification

```
1. Utilisateur accède à /login
2. Saisie email + mot de passe
3. NextAuth vérifie les credentials en base (bcrypt.compare sur `passwordHash`)
4. Si valide → JWT avec { id, name, email, role }
5. Redirection vers le dashboard
6. Middleware vérifie le JWT sur toutes les routes protégées
```

**Aucune inscription publique** : il n’existe pas de route d’inscription libre. Les comptes sont uniquement **créés par un `ADMIN`**, via l’interface d’administration (voir ci-dessous) et les API `POST /api/users` (réservé `ADMIN`).

## Pages

### `(auth)/login` — `/login`
- Formulaire email + mot de passe
- Lien "Mot de passe oublié" (v1.1, pas MVP)
- Affichage erreur si credentials invalides
- Redirection vers `/` si déjà connecté
- Aucun lien vers une "création de compte" (inexistante)

### `(dashboard)/users` — réservé `ADMIN`
- **Liste** (`/users`) : tableau des utilisateurs (nom, email, rôle, actif)
- **Nouvel utilisateur** (`/users/nouveau`) : formulaire name, email, mot de passe, rôle
- L’API `POST /api/users` (et toute modification de comptes) est protégée : `getServerSession` + vérification `role === 'ADMIN'`
- `MANAGER` et `CAISSIER` : pas d’accès à ces routes (redirection 403 / dashboard)

## Sécurité
- Mots de passe hashés avec **bcrypt** (rounds: 12), stockés dans `passwordHash`
- Sessions JWT signées avec `NEXTAUTH_SECRET`
- Durée de session : 8 heures (1 journée de travail)
- Renouvellement automatique si activité détectée
- Middleware Next.js : routes publiques limitées à la connexion (`/login` et ressources auth nécessaires) ; le reste du site exige une session

## Modèle Prisma (référence)
```prisma
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  passwordHash  String
  role          Role     @default(CAISSIER)
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum Role { ADMIN MANAGER CAISSIER }
```

## Tests requis
- [ ] Login avec credentials valides → session créée
- [ ] Login avec mauvais mot de passe → erreur 401
- [ ] Accès route protégée sans session → redirection /login
- [ ] Token expiré → déconnexion automatique
- [ ] CAISSIER ne peut pas accéder à /stock/nouveau
- [ ] Aucun endpoint de création de compte utilisable sans rôle `ADMIN` (y compris `POST /api/users`)
- [ ] `MANAGER` ne peut pas accéder à `/users` ni créer d’utilisateur
