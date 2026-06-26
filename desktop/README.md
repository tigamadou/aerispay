# AerisPay Caisse — client Electron (D0.2 PoC + Vague 2/3/5)

Client caisse **sans base de données** : coquille kiosque qui affiche l'UI servie par le
**nœud magasin** (LAN) + **pont périphériques** (ESC/POS, tiroir). Voir
[`ARCHITECTURE_MVP.md` §4 (Client desktop & périphériques)](../ARCHITECTURE_MVP.md).

## Périmètre des fichiers

| Fichier | Rôle (réf. tâche) |
|---|---|
| `src/security.ts` | C2.2 — webPreferences durcies, navigation restreinte, CSP (testé) |
| `src/config.ts` | Validation de la saisie d'enrôlement (URL + code + nom) + `authHeaders` (testé) |
| `src/config-store.ts` | Persistance config (JSON userData) + token de magasin chiffré via **safeStorage** ; pure `encode/decode` testée |
| `src/enrollment-client.ts` | Échange du code d'enrôlement → token de magasin (`POST /api/enrollment/exchange`, testé) |
| `src/enroll-preload.ts` | Bridge `window.aerisEnroll.submit` (fenêtre d'enrôlement, preload isolé) |
| `src/main.ts` | Orchestration enrôlement→kiosque (2 fenêtres/preloads), health-check + blocage, IPC, menu réinitialiser, auto-update |
| `src/preload.ts` | C2.1 — bridge `window.aerisDevices.*` (liste blanche) |
| `src/devices.ts` | C2.1 — pont ESC/POS / tiroir (node-thermal-printer) |
| `renderer/blocked.html` | C2.3 — écran de blocage |
| `renderer/config.html` + `renderer/config.js` | Écran + handler d'enrôlement au premier lancement (URL + code + nom) |
| `electron-builder.yml` | P5.1 — installeurs 3 OS · P5.2 — publication S3 |
| `../.github/workflows/desktop-build.yml` | P5.1 — CI multi-plateforme · P5.2 — signature |

## D0.2 — PoC packaging (dérisquage)

Objectif : prouver que les **modules natifs ESC/POS** fonctionnent dans Electron packagé.

```bash
cd desktop
npm install
npm run build
npm run rebuild:native   # electron-rebuild de node-thermal-printer / serialport
npm run start            # AERIS_NODE_URL=https://magasin.local:3000
npm run dist             # installeur de l'OS courant (electron-builder)
```

> `npmRebuild: true` + le script `rebuild:native` recompilent les addons natifs pour l'ABI
> d'Electron — c'est le risque principal levé par le PoC. Pas de Prisma embarqué (ADR-001).

## Tests

```bash
npm run test   # vitest — logique pure (security, config)
```

Le runtime Electron (main/preload/devices) est validé manuellement / en CI ; la logique
pure (durcissement, validation d'enrôlement) est couverte par Vitest.
