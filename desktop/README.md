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

## Build & distribution (Windows / macOS / Linux)

> **Règle d'or : chaque installeur se construit sur son OS natif.** L'app embarque des modules
> natifs (`node-thermal-printer`, `serialport`) recompilés **par OS/arch** (`electron-rebuild`) ;
> macOS exige macOS (+ certificat Apple), Windows exige Windows (Authenticode). Pas de cross-build fiable.

### Pour l'OS courant (local)

```bash
cd desktop
npm install
npm run rebuild:native   # recompile les modules natifs pour l'ABI Electron
npm run dist             # build TS + electron-builder → desktop/release/
```

Sorties dans **`desktop/release/`** selon l'OS (cf. `electron-builder.yml`) :

| OS | Cibles |
|---|---|
| macOS | `.dmg` + `.zip` |
| Windows | installeur **NSIS** (`.exe`) |
| Linux | **AppImage** + `.deb` |

Cibler explicitement (sur la machine correspondante) : `npx electron-builder --mac` | `--win` | `--linux`.

### Les trois OS → CI (recommandé)

Le workflow `.github/workflows/desktop-build.yml` build **en parallèle** sur macOS / Windows / Linux
(rebuild natif + tests + installeurs signés + publication S3). Déclenchement :

- **par tag** : `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`
- **manuellement** : onglet *Actions* → *desktop-build* → **Run workflow** (`workflow_dispatch`)

Les installeurs des 3 OS sont dans les **artifacts** du run.

### Signature & auto-update

Builds **signés** (requis pour l'auto-update `electron-updater` et pour éviter les alertes OS) : secrets
CI `CSC_LINK`, `CSC_KEY_PASSWORD`, `AERIS_UPDATE_BUCKET`, `AERIS_UPDATE_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`. Un build local **sans** ces secrets est **non signé** (test uniquement, pas d'auto-update).

> ⚠ Éviter `npm run dist:all` (`electron-builder -mwl`) : il ne recompile pas les modules natifs ni
> ne signe pour les autres OS depuis une seule machine. Pour le multi-OS, utiliser la **CI**.

## Tests

```bash
npm run test   # vitest — logique pure (security, config)
```

Le runtime Electron (main/preload/devices) est validé manuellement / en CI ; la logique
pure (durcissement, validation d'enrôlement) est couverte par Vitest.
