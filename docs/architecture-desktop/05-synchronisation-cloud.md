# 05 — Synchronisation magasin ↔ cloud

[← Index](README.md)

## 1. Une seule frontière distribuée

Grâce au modèle à trois niveaux, le seul échange distribué est **magasin ↔ cloud** (jamais caisse ↔ cloud). Il est porté par le **worker de synchronisation du nœud magasin**, pas par les caisses. Un canal par magasin, tolérant aux coupures WAN.

```
Nœud magasin  ──(transactionnel ↑ : ventes, sessions, mouvements, logs)──►  Cloud
Nœud magasin  ◄──(référence ↓ : produits, prix, users, params, taxes, seuils)──  Cloud
```

## 2. Deux sens, deux politiques

### Référence (cloud → magasin)
- Données : catalogue, prix, utilisateurs/rôles (+ hash mot de passe), paramètres, taxes, seuils.
- Autorité **cloud**. Le magasin applique les mises à jour reçues.
- Conflit : simple — **le cloud gagne** (last-writer-wins) ; **pas de surcharge magasin** sur la référence descendante (ADR-006).

### Transactionnel (magasin → cloud)
- Données : ventes, lignes, paiements, sessions, mouvements de caisse, mouvements de stock, journal d'activité, hash d'intégrité.
- **Append-only** : le cloud **ingère**, ne modifie jamais. Pas de conflit de fond (chaque enregistrement appartient à un magasin/une caisse).
- Convergence triviale : il s'agit d'insérer des enregistrements idempotents.

## 3. Réutiliser l'existant : outbox + idempotence

Le code possède déjà les briques nécessaires :

- **Table `EventCaisse` (`events_caisse`)** avec `consumed` / `createdAt` → support naturel d'un **pattern outbox** : chaque écriture métier émet un événement ; le worker consomme les non-consommés et les pousse au cloud.
- **File offline idempotente** (`comptoir/sync`) avec **clé d'opération** → modèle d'idempotence déjà éprouvé, à généraliser au canal magasin↔cloud.
- **Identifiants `cuid()`** → insertion sans collision côté cloud, multi-magasins.
- **SDK S3 présent** → sauvegardes et, si besoin, transport/stockage d'artefacts.

## 4. Boucle de synchronisation (nœud magasin)

1. **Push transactionnel** : lire les `EventCaisse` non consommés (ordre `createdAt`), les transmettre au cloud par lots, marquer `consumed` après accusé. Idempotence par identifiant d'événement/opération → un rejeu ne duplique rien.
2. **Pull référence** : demander au cloud les mises à jour de référence depuis un curseur (timestamp/version), les appliquer en base magasin.
3. **Reprise après coupure WAN** : le curseur et les `EventCaisse` non consommés garantissent qu'aucune donnée n'est perdue ; la sync rattrape au retour du réseau.
4. **Fréquence** : périodique (ex. quelques minutes) et/ou déclenchée par événement, configurable.

## 5. Garanties & cohérence

- **Au sein du magasin** : cohérence forte (base unique, transactions Prisma).
- **Vers le cloud** : cohérence **à terme** (eventual consistency), acceptable car le transactionnel est append-only et le reporting groupe tolère un léger décalage.
- **Intégrité** : le hash chaîné **par caisse** est calculé au magasin et répliqué tel quel ; le cloud peut **revérifier** les chaînes sans les réordonner entre caisses.
- **Numérotation** : préfixe **par poste** → unicité garantie à l'échelle organisation même en agrégeant plusieurs magasins.

## 6. Points à cadrer

- Modèle de **base cloud** (MySQL managé vs PostgreSQL) et schéma d'agrégation multi-magasins (clé `magasinId`/`organisationId` à ajouter au niveau cloud).
- **Édition des données de référence** au niveau magasin : autorisée (avec remontée) ou strictement descendante ?
- **Rétention / purge** des `EventCaisse` après consommation et accusé cloud.
- **Sécurité du transport** (mTLS, rotation des tokens) — voir [06](06-securite.md).
