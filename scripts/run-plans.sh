#!/usr/bin/env bash
#
# run-plans.sh — Exécution autonome des plans d'implémentation AerisPay.
#
# Relance Claude Code en boucle (headless) jusqu'à ce que TOUS les plans de
# docs/superpowers/plans/ soient exécutés. Un plan PRÉSENT dans ce dossier =
# un plan EN ATTENTE ; sa tâche finale le supprime une fois implémenté et vérifié
# (politique « specs/plans éphémères », CLAUDE.md §8.1).
#
# COMPLÉTION = le dossier des plans est vide (signal DÉTERMINISTE, basé sur l'état
# du système de fichiers — surtout PAS sur la présence d'un mot dans le log, qui
# produit des faux positifs car le prompt/raisonnement réécho ce mot et faisait
# sortir la boucle dès le 1er tour).
#
# Survit à la fin de session et aux limites d'usage : il sleep puis relance
# (--continue conserve le contexte, auto-compacté).
#
# Usage :
#   ./scripts/run-plans.sh
#   MAX_ITER=500 MODEL=claude-sonnet-4-6 ./scripts/run-plans.sh
#
# Arrêt : Ctrl-C ; automatiquement quand plus aucun plan ne reste ; ou après
# STALL_LIMIT tours consécutifs sans qu'un plan se termine.

set -u

# --- Configuration (surchargeable par variables d'env) -----------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Les plans touchent web/app ET desktop : on travaille depuis la RACINE du dépôt.
WORKDIR="${WORKDIR:-$REPO_ROOT}"
PLANS_DIR="docs/superpowers/plans"
MODEL="${MODEL:-claude-opus-4-8}"
MAX_ITER="${MAX_ITER:-300}"          # plafond de sécurité (nombre de relances)
MAX_TURNS="${MAX_TURNS:-200}"        # tours max par invocation
COOLDOWN="${COOLDOWN:-10}"           # pause normale entre deux relances (s)
LIMIT_SLEEP="${LIMIT_SLEEP:-1800}"   # pause si limite d'usage atteinte (s = 30 min)
STALL_LIMIT="${STALL_LIMIT:-4}"      # tours consécutifs sans progrès avant abandon
LOGDIR="${LOGDIR:-$REPO_ROOT/.plan-logs}"
STREAM="${STREAM:-1}"                # 1 = tout voir en direct (outils, raisonnement) ; 0 = sortie finale seule

# Affiche le flux stream-json de façon lisible (texte, appels d'outils, résultats).
# Le JSON brut reste sauvegardé dans le log ; ici on ne formate que l'écran.
format_stream() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '
      if .type == "assistant" then
        ( .message.content[]? |
          if .type == "text" then .text
          elif .type == "tool_use" then "🔧 " + .name + "  " + ((.input | tostring)[0:160])
          else empty end )
      elif .type == "user" then
        ( .message.content[]? |
          if .type == "tool_result" then
            "← " + ( ( (.content // "") |
              if type == "array" then (map(.text? // "") | join(" ")) else tostring end )[0:200] )
          else empty end )
      elif .type == "result" then "──── fin de tour ────"
      else empty end
    ' 2>/dev/null
  else
    cat   # jq absent : on affiche le JSON brut
  fi
}

# Compte les plans encore en attente (fichiers .md hors README éventuel).
# C'est LE signal de complétion : 0 => terminé.
count_pending_plans() {
  find "$REPO_ROOT/$PLANS_DIR" -maxdepth 1 -type f -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' '
}

# Détecte une limite d'usage / rate-limit dans la FIN du log uniquement (le message
# d'erreur apparaît en queue de flux). Motifs stricts pour éviter les faux positifs
# venant du contenu métier (tests, code) au milieu du flux.
hit_usage_limit() {
  tail -n 80 "$1" | grep -qiE 'usage limit reached|rate.?limit|too many requests|429|overloaded|quota exceeded|reset at'
}

# Consigne de concision injectée dans le system prompt pour économiser les tokens.
TERSE="Sois extrêmement bref dans ton texte. Pas de préambule, pas de récap, pas \
d'explication de ce que tu vas faire. Agis directement via les outils. Une ligne \
maximum entre deux actions. N'écris des phrases que si c'est strictement nécessaire."

# Objectif (focalise le modèle ; la boucle, elle, décide de l'arrêt via l'état du dossier).
GOAL="Exécuter tous les plans de $PLANS_DIR jusqu'à ce que le dossier soit vide, en \
gardant les suites de tests vertes (web/app et desktop : 'npx vitest run')."

# Prompt de travail : une invocation doit avancer LE PLUS LOIN POSSIBLE (idéalement
# tout terminer), pas seulement une tâche.
read -r -d '' PROMPT <<EOF
/goal $GOAL

Tu travailles sur AerisPay (monorepo : web/app = nœud magasin, desktop = client Electron).
Respecte STRICTEMENT CLAUDE.md (TDD obligatoire, TypeScript strict, Zod, Prisma singleton,
pas de any ; commits SANS mention Co-Authored-By, CLAUDE.md §8.2).

Boucle de travail — NE T'ARRÊTE PAS après une seule tâche ni un seul plan, enchaîne :
1. Liste $PLANS_DIR. Tant qu'il reste un plan (.md), prends le PLUS ANCIEN (ordre du nom = chronologique).
2. Exécute-le tâche par tâche avec la compétence superpowers:executing-plans :
   pour chaque tâche, écris le test d'abord, vois-le échouer, code minimal, tests verts, commit.
3. La DERNIÈRE tâche du plan supprime la spec ET le plan correspondants (politique éphémère,
   CLAUDE.md §8.1) puis commit — le plan disparaît donc de $PLANS_DIR.
4. Passe IMMÉDIATEMENT au plan suivant. Continue jusqu'à ce que $PLANS_DIR ne contienne PLUS aucun plan.

N'avance jamais sur une tâche dont les tests échouent. Un commit par tâche terminée.
Va le plus loin possible dans cette invocation ; le superviseur te relancera si besoin.
EOF

mkdir -p "$LOGDIR"
cd "$WORKDIR" || { echo "Répertoire introuvable : $WORKDIR"; exit 1; }

echo "▶ Démarrage exécution autonome des plans — repo: $WORKDIR — modèle: $MODEL"
echo "  Plans en attente: $(count_pending_plans) ($PLANS_DIR)"
echo "  Logs: $LOGDIR"

stall=0

for ((i = 1; i <= MAX_ITER; i++)); do
  # === Autorité d'arrêt : plus aucun plan en attente -> terminé. ===
  current="$(count_pending_plans)"
  if [[ "$current" == "0" ]]; then
    echo ""
    echo "✅ Tous les plans sont exécutés (dossier $PLANS_DIR vide)."
    exit 0
  fi

  TS="$(date '+%Y-%m-%d_%H-%M-%S')"
  LOG="$LOGDIR/iter-$(printf '%03d' "$i")-$TS.log"
  echo ""
  echo "=== Itération $i / $MAX_ITER — $TS — plans restants: $current ==="

  # --continue : reprend la session précédente (contexte conservé, auto-compacté).
  # bypassPermissions : autonomie totale (édition/commande sans confirmation).
  if [[ "$STREAM" == "1" ]]; then
    claude -p "$PROMPT" \
      --continue \
      --model "$MODEL" \
      --max-turns "$MAX_TURNS" \
      --permission-mode bypassPermissions \
      --append-system-prompt "$TERSE" \
      --verbose --output-format stream-json 2>&1 | tee "$LOG" | format_stream
  else
    claude -p "$PROMPT" \
      --continue \
      --model "$MODEL" \
      --max-turns "$MAX_TURNS" \
      --permission-mode bypassPermissions \
      --append-system-prompt "$TERSE" \
      --output-format text 2>&1 | tee "$LOG"
  fi

  # Limite d'usage : pause longue puis on relance SANS compter comme stagnation.
  if hit_usage_limit "$LOG"; then
    echo "⏳ Limite d'usage atteinte. Pause ${LIMIT_SLEEP}s avant relance…"
    sleep "$LIMIT_SLEEP"
    continue
  fi

  # Progrès = au moins un plan terminé (donc supprimé) durant cette itération.
  after="$(count_pending_plans)"
  if [[ "$after" == "0" ]]; then
    echo ""
    echo "✅ Tous les plans sont exécutés (itération $i)."
    exit 0
  fi
  if (( after < current )); then
    stall=0
  else
    stall=$((stall + 1))
    echo "… aucun plan terminé à ce tour (sans progrès : $stall/$STALL_LIMIT)."
  fi

  if (( stall >= STALL_LIMIT )); then
    echo "⚠ $STALL_LIMIT tours consécutifs sans qu'un plan se termine — arrêt. Voir $LOG."
    exit 1
  fi

  sleep "$COOLDOWN"
done

echo "⚠ Plafond MAX_ITER=$MAX_ITER atteint. Plans restants: $(count_pending_plans). Vérifie $LOGDIR."
exit 1
