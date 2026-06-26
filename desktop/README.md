# AerisPay Caisse — client Electron (D0.2 PoC + Vague 2/3/5)

Client caisse **sans base de données** : coquille kiosque qui affiche l'UI servie par le
**nœud magasin** (LAN) + **pont périphériques** (ESC/POS, tiroir). Voir
[`ARCHITECTURE_MVP.md` §4 (Client desktop & périphériques)](../ARCHITECTURE_MVP.md).

## Périmètre des fichiers

| Fichier | Rôle (réf. tâche) |
|---|---|
| `src/security.ts` | C2.2 — webPreferences durcies, navigation restreinte, CSP (testé) |
| `src/config.ts` | E3.3 — validation/normalisation config d'enrôlement (testé) |
| `src/main.ts` | C2.2 (durcissement), C2.3 (health-check + blocage), C2.1 (IPC), P5.2 (auto-update) |
| `src/preload.ts` | C2.1 — bridge `window.aerisDevices.*` (liste blanche) |
| `src/devices.ts` | C2.1 — pont ESC/POS / tiroir (node-thermal-printer) |
| `renderer/blocked.html` | C2.3 — écran de blocage |
| `renderer/config.html` | E3.3 — écran d'enrôlement premier lancement |
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
