# 04 — Nœud magasin & disponibilité

[← Index](README.md)

## 1. Rôle

Le **nœud magasin** est la machine dédiée qui constitue la **source de vérité du magasin**. Il héberge :

- le **serveur applicatif** (Next + Prisma) exposant l'**API** consommée par les caisses ;
- la **base de données MySQL** du magasin (schéma Prisma **actuel, inchangé**) ;
- le **worker de synchronisation** magasin ↔ cloud (voir [05](05-synchronisation-cloud.md)).

Toutes les caisses du magasin s'y connectent en réseau local. C'est lui qui exécute les transactions critiques (vente + décrément stock, ouverture/clôture de session, réconciliation, hash d'intégrité).

## 2. Pourquoi MySQL reste au niveau magasin

Conserver MySQL ici permet de **réutiliser le schéma Prisma existant sans modification** et de garder le comportement transactionnel actuel. Les lots de correction en cours s'appliquent **tels quels** sur cette base :

- **Lot B (anti-survente)** : décrément conditionnel atomique → pas de survente entre caisses partageant la base.
- **Lot C (caisseId)** : chaque session liée à sa caisse ; identité de poste = client Electron.
- **Lot G (fond de caisse)** + hash : per-caisse, persistés au magasin.

## 3. Conséquence : point unique de défaillance (SPOF)

La contrepartie de la règle « pas de base = blocage » est que **le nœud magasin est le point unique de défaillance du magasin** : s'il tombe, toutes les caisses bloquent. C'est un choix assumé qui **doit** être compensé par la fiabilité opérationnelle.

### Mitigations recommandées (niveau PME)

- **Machine dédiée toujours allumée** : mini-PC type NUC réservé à ce rôle (pas un poste caisse).
- **Réseau câblé** pour les caisses (Ethernet), pas de Wi-Fi sur le chemin critique.
- **Onduleur (UPS)** sur le nœud magasin et l'équipement réseau.
- **Sauvegardes** locales planifiées + réplication vers le cloud (la sync sert aussi de filet).
- **Supervision simple** : health-check, alerte si le nœud ne répond plus.

### Mitigations avancées (optionnel, si continuité critique)

- **Réplication MySQL** (primaire/réplica) sur un second nœud + bascule.
- **Nœud de secours** prêt à reprendre l'adresse de service.

> Décision ouverte : niveau de HA retenu (mini-PC + UPS seul vs réplication/bascule). À acter selon la criticité du commerce — voir [08](08-impacts-glossaire.md).

## 4. API exposée aux caisses

Le nœud magasin expose l'application Next (UI + endpoints) en **HTTPS** sur le LAN. Les caisses :

- chargent l'**UI** depuis le nœud magasin ;
- consomment les **endpoints** existants (`/api/ventes`, `/api/comptoir/...`, `/api/stock/...`, etc.) avec le **token de magasin** ;
- reçoivent les **charges utiles d'impression** à exécuter localement.

Aucune caisse n'accède directement à MySQL.

## 5. Disponibilité vue de la caisse

- **Health-check** périodique du nœud par chaque caisse.
- Indisponible → **écran de blocage** (pas de file locale, pas de vente).
- Rétabli → reprise immédiate.

La disponibilité **magasin ↔ cloud**, elle, n'impacte **pas** les caisses : si le WAN tombe, le magasin continue de fonctionner et rattrape le cloud ensuite (voir [05](05-synchronisation-cloud.md)).
