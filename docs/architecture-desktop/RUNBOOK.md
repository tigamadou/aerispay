# Runbook d'exploitation — Nœud magasin AerisPay (P5.4)

[← Index](README.md) · complète [07 — Déploiement & exploitation](07-deploiement-exploitation.md) §6.

> Périmètre : exploitation du **nœud magasin** (backend Next + Prisma + MySQL).
> **Pas de HA** en V1 (ADR-005) : SPOF assumé, mitigé par les sauvegardes et une restauration testée.

---

## 1. Supervision

| Quoi | Comment | Seuil / action |
|---|---|---|
| Disponibilité du nœud | `GET /api/health` → `200 {status:"ok",db:true}` | `503` ou timeout → les caisses **bloquent** (ADR-001) : intervenir immédiatement. |
| Connectivité base | champ `db` de `/api/health` | `false` → voir §4 « base injoignable ». |
| Retard de sync cloud | nombre d'`EventCaisse` `consumed = false` | croissance continue → voir §4 « sync en retard » (sans impact caisse). |
| Espace disque | hôte du nœud (base + dumps) | < 15 % libre → purger les vieux dumps, étendre le volume. |

Sonde recommandée (cron/superviseur externe, toutes les 30 s) :

```bash
curl -fsS http://<noeud>:3000/api/health || alert "Nœud magasin indisponible"
```

---

## 2. Sauvegardes

- **Fréquence** : dump complet planifié (au moins quotidien, + avant toute mise à jour).
- **Filet cloud** : la réplication transactionnelle (push `EventCaisse`) sert de second niveau, **pas** de substitut à la sauvegarde locale.
- **Rétention** : conserver ≥ 7 jours de dumps ; purge au-delà.

Dump (depuis l'hôte, service Compose `db` — voir `DOCKER.md`) :

```bash
docker compose exec -T db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" aerispay \
  | gzip > backup-aerispay-$(date +%F-%H%M).sql.gz
```

---

## 3. Restauration (à tester régulièrement)

La sauvegarde n'a de valeur que si la **restauration est vérifiée**. Procédure de test (sur une base jetable, jamais en prod) :

```bash
# 1. Créer une base de test
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE aerispay_restore_test;"
# 2. Restaurer le dump
gunzip < backup-aerispay-<...>.sql.gz \
  | docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" aerispay_restore_test
# 3. Contrôles d'intégrité
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" aerispay_restore_test \
  -e "SELECT COUNT(*) FROM ventes; SELECT COUNT(*) FROM comptoir_sessions;"
# 4. Nettoyer
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE aerispay_restore_test;"
```

Vérifier en plus la **chaîne de hash par caisse** (F1.3) : les sessions validées restaurées doivent conserver un `hashIntegrite` recalculable (`GET /api/comptoir/sessions/[id]/verify`).

---

## 4. Procédures d'incident

### « Caisse bloquée »
Diagnostiquer **dans cet ordre** (du poste vers la base) :
1. Réseau LAN poste → nœud (`ping`, `curl http://<noeud>:3000/api/health`).
2. Service Next du nœud (process / logs conteneur `app`).
3. Connectivité base (`db: false` sur `/api/health`).
4. Base MySQL (service `db`, espace disque, logs).
→ Aucune donnée métier ne réside sur le poste (pas de BD locale) : une fois le nœud rétabli, le poste reprend sans perte.

### « Base injoignable »
- Vérifier le service `db` (`docker compose ps`, logs), l'espace disque, les connexions max.
- Redémarrer le service `db` puis `app` si nécessaire ; si corruption → restaurer (§3).

### « Sync cloud en retard »
- **Sans impact caisse** (le magasin fonctionne en autonomie locale).
- Vérifier la connectivité WAN et le worker de sync ; les `EventCaisse` non consommés seront rejoués automatiquement (idempotent, S4.2/S4.4) au retour du réseau.

### « Perte / vol d'un poste »
- Révoquer le **token de magasin** du poste (E3.2, `revokeStoreToken`) → le poste ne joint plus l'API. Exposition minimale (aucune donnée ni secret cloud sur le poste).

### « Compromission du magasin »
- Révoquer le device token cloud (arrêt de la sync), investiguer via le **journal d'activité** et les **hash d'intégrité** (revérification des chaînes par caisse).

---

## 5. Mises à jour

- Valider d'abord sur un **magasin pilote** ; planifier **hors heures d'ouverture**.
- Toujours **sauvegarder avant** (§2) et appliquer les migrations Prisma de façon contrôlée (`npx prisma migrate deploy`).
- Vérifier `GET /api/health` puis une vente de bout en bout après mise à jour.
