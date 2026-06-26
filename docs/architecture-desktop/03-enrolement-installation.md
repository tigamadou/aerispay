# 03 — Enrôlement & installation

[← Index](README.md)

## 1. Principe

À l'installation, le client est **enrôlé** : on lui fournit son rattachement (organisation), sa cible de données (nœud magasin) et son identité (poste). L'enrôlement produit des **secrets stockés dans le trousseau de l'OS**, jamais en clair dans le bundle.

## 2. Entrées requises à l'installation

| Entrée | Rôle | Cas concerné |
|---|---|---|
| **Credentials de l'organisation** | Authentifier l'appartenance au groupe ; obtenir l'identité cloud | Tous |
| **Endpoint + token du nœud magasin** | Indiquer à quel magasin (API LAN) se connecter | Multi-caisse |
| **Identité du poste** (`caisseId` / nom de caisse) | Identifier la caisse pour le ledger et la numérotation | Tous |

> Recommandation forte : fournir un **endpoint + token de magasin**, **pas** les identifiants bruts de la base MySQL. Un poste est physiquement accessible ; il ne doit jamais détenir la chaîne de connexion DB. Le client parle à l'**API** du nœud magasin (voir [06 — Sécurité](06-securite.md)).

## 3. Chaîne de confiance recommandée

```
Organisation (cloud)
   │  enrôle
   ▼
Nœud magasin  ──(émet token de magasin)──►  Caisse (client Electron)
```

1. Le **nœud magasin** est enrôlé une fois auprès de l'organisation (détient le device token cloud, gère la réplication).
2. Chaque **caisse** s'enrôle auprès du **nœud magasin**, qui lui délivre un **token de magasin** scoppé à ce poste.
3. La caisse ne détient donc qu'un secret **local au magasin** ; la révocation se fait au niveau magasin (et le magasin lui-même est révocable au niveau cloud).

Ce schéma évite de diffuser les credentials cloud sur chaque caisse tout en respectant la demande « fournir les credentials de l'organisation + la base locale » à l'installation.

## 4. Flux d'installation (multi-caisse)

1. Installation de l'application sur le poste.
2. Écran d'enrôlement :
   - saisie des **credentials d'organisation** (validés en ligne, ou délégués au nœud magasin) ;
   - saisie de l'**endpoint du nœud magasin** + activation (token) ;
   - choix/déclaration de l'**identité de poste** (caisse existante ou nouvelle).
3. Le nœud magasin **valide**, crée/associe la caisse (`caisseId`) et renvoie le **token de magasin**.
4. Le client **stocke le token dans le trousseau OS**, mémorise l'endpoint et le `caisseId`.
5. Health-check du nœud magasin → l'application est prête (ou affiche le blocage si indisponible).

## 5. Flux d'installation (mono-caisse / autonome)

1. Installation.
2. Écran d'enrôlement :
   - saisie des **credentials d'organisation** ;
   - mode **autonome** : la machine héberge **elle-même** le nœud magasin (serveur Next + MySQL embarqués) et la caisse.
3. Le binaire démarre le nœud magasin local, crée la base, s'enrôle auprès du cloud, puis ouvre la caisse.
4. La règle de blocage est satisfaite localement (la base est sur la même machine).

## 6. Sélection du mode au premier lancement

Le **même binaire** propose à l'enrôlement :

- **Autonome** — nœud magasin + caisse sur une seule machine (mono-caisse).
- **Nœud magasin** — héberge la base et l'API pour le magasin (machine dédiée).
- **Client de magasin** — caisse sans base, se connecte à un nœud magasin existant.

Le mode est figé après enrôlement (modifiable via une ré-initialisation administrée).

## 7. Ré-enrôlement & révocation

- **Changement de poste / réinstallation** : ré-enrôlement avec nouveau token ; l'ancien token est révocable au niveau magasin.
- **Perte / vol d'un poste** : révocation du token de magasin (le poste ne peut plus joindre l'API) ; voir [06 — Sécurité](06-securite.md).
- **Désactivation d'un magasin** : révocation au niveau cloud (le nœud magasin ne synchronise plus).
