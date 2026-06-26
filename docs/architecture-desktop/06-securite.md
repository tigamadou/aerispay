# 06 — Sécurité

[← Index](README.md)

## 1. Modèle de confiance

```
Organisation (cloud)
   │  device token cloud (détenu par le nœud magasin uniquement)
   ▼
Nœud magasin  ──► token de magasin (scoppé par poste)  ──►  Caisse (Electron)
```

- Le **nœud magasin** détient le secret cloud et est le seul à parler au cloud.
- Chaque **caisse** ne détient qu'un **token de magasin** local, scoppé à son poste.
- Aucune caisse ne détient les identifiants de la base MySQL ni les secrets cloud.

## 2. Secrets & stockage

- **Tokens** (magasin, cloud) stockés dans le **trousseau de l'OS** (Keychain macOS / Credential Manager Windows / libsecret Linux), jamais en clair dans le bundle ni dans un fichier `.env` embarqué.
- **`NEXTAUTH_SECRET` / clés serveur** : présents uniquement sur le **nœud magasin**, pas sur les caisses.
- **Rotation** des tokens prévue (révocation + ré-émission au niveau magasin/cloud).

## 3. Transport

- **HTTPS** obligatoire sur le LAN entre caisse et nœud magasin (certificat de magasin ; possibilité de **mTLS** pour authentifier le poste).
- **TLS** entre nœud magasin et cloud ; envisager **mTLS** et rotation de tokens pour le canal de sync.

## 4. Accès à la base de données

- **Jamais** d'accès direct des caisses à MySQL. Les caisses passent par l'**API** du nœud magasin.
- Le compte MySQL applicatif du nœud magasin est **scoppé** (droits minimaux), distinct d'un compte d'administration.
- Base du magasin non exposée hors du nœud (pas de port MySQL ouvert sur le LAN large).

## 5. Durcissement du client Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer limité à l'API du **preload** (liste blanche de fonctions périphériques) ; pas d'accès `fs`/`child_process`.
- **CSP** stricte, navigation restreinte à l'origine du nœud magasin.
- **Signature de code** du binaire (Windows/macOS) — requise aussi pour l'auto-update.

## 6. Révocation & réponse aux incidents

- **Perte/vol d'un poste** : révoquer le **token de magasin** → le poste ne joint plus l'API. Aucune donnée métier ne réside sur le poste (pas de BD locale) → exposition minimale.
- **Compromission d'un magasin** : révoquer le **device token cloud** → arrêt de la synchronisation ; investigation via le journal d'activité et les hash d'intégrité.
- **Désactivation utilisateur** : propagée du cloud vers le magasin (référence descendante), prise en compte au login servi par le nœud magasin.

## 7. Intégrité & audit

- **Chaîne de hash par caisse** (chapitre [01](01-modele-trois-niveaux.md) §4) : toute altération d'une session validée est détectable ; le cloud peut revérifier.
- **Journal d'activité** répliqué au cloud pour audit centralisé.
- Ne jamais journaliser de secrets (tokens, mots de passe) — règle déjà en vigueur dans le code.
