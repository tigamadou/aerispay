# 02 — Client desktop & périphériques

[← Index](README.md)

## 1. Nature du client

Le client caisse est une **application Electron** qui joue deux rôles, et **uniquement** ces deux rôles :

1. **Coquille de présentation (kiosque)** : une `BrowserWindow` qui affiche l'UI **servie par le nœud magasin** (URL en réseau local).
2. **Pont périphériques** : le **process principal** Electron (Node) pilote le matériel branché sur **cette** machine — imprimante ticket ESC/POS, tiroir-caisse, douchette.

Le client **n'embarque pas de base de données** et ne contient **aucune logique métier de données** : pas de Prisma local, pas de cache transactionnel, pas de moteur de synchronisation. Toute la donnée vient de l'API du nœud magasin.

## 1 bis. Périmètre & rôles (V1)

En V1, l'application desktop est **réservée aux CAISSIERS**. Les administrateurs et gérants utilisent l'**application web dans le navigateur** (servie par le nœud magasin en LAN, et/ou le cloud).

- **Restriction d'usage** : le client desktop n'autorise que le rôle **CAISSIER**. À la connexion, un compte ADMIN/MANAGER est soit refusé avec un message explicite (« Utilisez l'application web »), soit limité au strict périmètre POS. L'enrôlement associe le poste à une caisse, pas à un compte d'administration.
- **Surface fonctionnelle** : comptoir/POS, ouverture/clôture de **ses** sessions, encaissement multi-mode, impression ticket, ouverture tiroir. Pas de stock, pas d'administration, pas de paramètres.
- **Validation à l'aveugle** : peut être réalisée par un manager **depuis le navigateur**, ou par un caissier entrant **depuis le desktop** — l'API de validation est commune aux deux surfaces.
- **Impression / tiroir** : disponibles **uniquement** via le desktop (pont périphériques). Le navigateur (manager) peut générer un **PDF** de ticket mais ne pilote pas l'imprimante ESC/POS locale ni le tiroir.

> Le périmètre desktop pourra s'élargir plus tard (ex. fonctions manager en magasin) ; cette restriction est un choix V1, pas une limite technique.

## 2. Conséquence de la règle « pas de base magasin = blocage »

Puisque le caissier ne peut pas travailler sans la base du magasin, le client **assume le blocage** au lieu de gérer un mode dégradé :

- Au démarrage et en continu, le client **vérifie la disponibilité** du nœud magasin (health-check).
- Si le nœud est injoignable : écran de **blocage** explicite (« Magasin indisponible — vérifiez la connexion réseau »), aucune vente possible, pas de file d'attente locale.
- Dès que le nœud répond, l'app redevient opérationnelle.

Cela **élimine** la portabilité de schéma SQLite, la synchronisation caisse↔magasin et la convergence de stock distribuée — simplification majeure assumée.

## 3. Architecture interne du client

```
┌──────────────────────── Electron (poste caisse) ────────────────────────┐
│                                                                          │
│  Renderer (BrowserWindow)            Main process (Node)                 │
│  ┌───────────────────────┐           ┌────────────────────────────────┐ │
│  │ UI servie par le      │  IPC      │ Pont périphériques :           │ │
│  │ NŒUD MAGASIN (URL LAN)│ ◄───────► │  - printTicket(payload)        │ │
│  │                       │  (preload │  - openDrawer()                 │ │
│  │ window.aerisDevices.* │   bridge) │  - statut imprimante/tiroir    │ │
│  └───────────────────────┘           │ node-thermal-printer (ESC/POS) │ │
│            │ HTTPS LAN                └────────────────────────────────┘ │
└────────────┼─────────────────────────────────────────────────────────────┘
             ▼
   API du nœud magasin (Next) ──► base MySQL du magasin
```

- **Renderer** : charge l'application servie par le magasin ; ne possède **aucun** accès Node direct.
- **Preload bridge** : expose un objet restreint (ex. `window.aerisDevices.printTicket(...)`, `openDrawer()`) vers le main, via `contextBridge`.
- **Main process** : reçoit les appels IPC et pilote `node-thermal-printer` sur le port USB/série/réseau local.

## 4. Flux d'impression (exemple : fin de vente)

1. La vente est validée **côté nœud magasin** (transaction Prisma sur la base magasin).
2. L'API renvoie au renderer les **données du ticket** (ou directement la séquence ESC/POS).
3. Le renderer appelle `window.aerisDevices.printTicket(payload)`.
4. Le **main Electron de la caisse** envoie la séquence à **son** imprimante locale, puis déclenche l'impulsion **tiroir** si demandé.

Ainsi les données restent **centralisées au magasin**, mais l'impression et le tiroir sont pilotés **sur la bonne machine**. La douchette, en HID clavier, est captée directement par l'UI.

> Migration depuis l'existant : aujourd'hui l'impression passe par les routes serveur `tickets/[id]/print` et `cash-drawer/open` (lib `node-thermal-printer` côté serveur). Dans le modèle desktop, cette logique se **déplace dans le main Electron de la caisse** (le périphérique est local au poste, pas au nœud magasin). Le nœud magasin se contente de **fournir la charge utile** du ticket.

## 5. Sécurité du client (durcissement renderer)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` activé.
- Le renderer ne reçoit que l'API exposée par le **preload** (liste blanche de fonctions périphériques) — aucun accès `fs`/`child_process`/réseau brut.
- Les appels à l'API magasin se font en **HTTPS** avec le **token de magasin** (voir [06 — Sécurité](06-securite.md)).
- Politique de chargement stricte (CSP, navigation restreinte à l'origine du nœud magasin).

## 6. Pourquoi Electron (et pas un navigateur, Tauri ou une PWA)

- Un **navigateur** ne pilote pas l'ESC/POS et le tiroir de façon fiable (WebUSB/WebSerial limités) → insuffisant pour une caisse.
- **Tauri** (Rust) serait plus léger, mais la périphérie (`node-thermal-printer`) et l'écosystème serveur sont **Node** ; Electron garde Node dans le main sans réécriture.
- Une **PWA** ne couvre pas le mode kiosque + périphériques natifs.

Electron est donc retenu **précisément** comme couche kiosque + périphériques, pas comme couche données.
