#!/usr/bin/env bash
#
# launch-desktop.sh — Lance l'application desktop AerisPay de bout en bout.
#
# Le client Electron n'a ni base ni UI propre : il affiche l'UI servie par le nœud
# magasin et se bloque si le nœud est injoignable (ADR-001, pas de mode dégradé).
#
# En dev, le nœud magasin (service `app`) tourne DANS docker compose, derrière Traefik
# (http://aerispay.localhost). Ce script orchestre donc le mono-poste de dev :
#   1. docker compose up -d   — db + nœud `app` + traefik + minio
#   2. attente du /api/health — Electron resterait bloqué sinon
#   3. build du client desktop — dist/main.js requis par Electron
#   4. Electron               — coquille kiosque pointée sur le nœud
#
# La stack docker est laissée tournante à la sortie (STOP_STACK=1 pour l'arrêter).
#
# Usage :
#   ./scripts/launch-desktop.sh                       # nœud = http://aerispay.localhost
#   AERIS_KIOSK=true ./scripts/launch-desktop.sh      # plein écran kiosque
#   AERIS_NODE_URL=https://magasin.local ./scripts/launch-desktop.sh   # nœud distant (LAN)
#   SKIP_STACK=1 ./scripts/launch-desktop.sh          # ne pas toucher à docker compose
#   STOP_STACK=1 ./scripts/launch-desktop.sh          # docker compose down à la sortie

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT/desktop"
NODE_URL="${AERIS_NODE_URL:-http://aerispay.localhost}"
HEALTH_RETRIES="${HEALTH_RETRIES:-150}"   # x2s ≈ 5 min (1er run : apt-get + npm install dans `app`)

log()  { printf '\033[1;36m[aerispay]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aerispay]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[aerispay]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ "${STOP_STACK:-0}" == "1" && "${SKIP_STACK:-0}" != "1" ]]; then
    log "Arrêt de la stack docker (docker compose down)…"
    (cd "$ROOT" && docker compose down) || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Stack docker (db + nœud `app` + traefik + minio) ------------------------
if [[ "${SKIP_STACK:-0}" != "1" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker introuvable (sinon : SKIP_STACK=1 + nœud lancé à part)."
  log "Démarrage de la stack (docker compose up -d)…"
  (cd "$ROOT" && docker compose up -d) || die "docker compose up a échoué."
else
  log "SKIP_STACK=1 — on suppose le nœud déjà disponible sur $NODE_URL."
fi

# 2. Attente du health-check -------------------------------------------------
log "Attente du nœud sur $NODE_URL/api/health (jusqu'à ~$((HEALTH_RETRIES * 2))s)…"
ready=0
for ((i = 1; i <= HEALTH_RETRIES; i++)); do
  if curl -sf -o /dev/null "$NODE_URL/api/health"; then
    ready=1
    log "Nœud prêt (après ${i} tentative(s))."
    break
  fi
  sleep 2
done
[[ "$ready" == "1" ]] || die "Le nœud n'a pas répondu sur $NODE_URL/api/health (timeout). Vérifie 'docker compose logs app'."

# 3. Build du client desktop -------------------------------------------------
[[ -d "$DESKTOP_DIR/node_modules" ]] || die "desktop/node_modules absent — lance 'npm install' dans desktop/."
needs_build=0
if [[ ! -f "$DESKTOP_DIR/dist/main.js" ]]; then
  needs_build=1
elif [[ -n "$(find "$DESKTOP_DIR/src" -newer "$DESKTOP_DIR/dist/main.js" 2>/dev/null)" ]]; then
  needs_build=1   # source modifiée depuis le dernier build
fi
if [[ "$needs_build" == "1" ]]; then
  log "Build du client desktop (tsc)…"
  npm --prefix "$DESKTOP_DIR" run build
else
  log "Build desktop à jour — étape ignorée."
fi

# 4. Electron ----------------------------------------------------------------
log "Lancement d'Electron (AERIS_NODE_URL=$NODE_URL)…"
AERIS_NODE_URL="$NODE_URL" npm --prefix "$DESKTOP_DIR" run start
