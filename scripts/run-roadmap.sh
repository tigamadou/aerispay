#!/usr/bin/env bash
#
# run-roadmap.sh — Implémentation autonome de la roadmap desktop AerisPay.
#
# Relance Claude Code en boucle (headless + /goal) jusqu'à ce que TOUTES les
# tâches de docs/architecture-desktop/00-ROADMAP-IMPLEMENTATION.md soient
# cochées et que les tests passent. Survit à la fin de session et aux limites
# d'usage (token/rate-limit) : il sleep puis relance automatiquement.
#
# Usage :
#   ./scripts/run-roadmap.sh
#   MAX_ITER=500 MODEL=claude-sonnet-4-6 ./scripts/run-roadmap.sh
#
# Arrêt : Ctrl-C, ou automatique quand la sentinelle ROADMAP_COMPLETE est émise.

set -u

# --- Configuration (surchargeable par variables d'env) -----------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="${WORKDIR:-$REPO_ROOT/web/app}"
ROADMAP="docs/architecture-desktop/00-ROADMAP-IMPLEMENTATION.md"
MODEL="${MODEL:-claude-opus-4-8}"
MAX_ITER="${MAX_ITER:-300}"          # plafond de sécurité (nombre de relances)
MAX_TURNS="${MAX_TURNS:-200}"        # tours max par invocation
COOLDOWN="${COOLDOWN:-10}"           # pause normale entre deux relances (s)
LIMIT_SLEEP="${LIMIT_SLEEP:-1800}"   # pause si limite d'usage atteinte (s = 30 min)
LOGDIR="${LOGDIR:-$REPO_ROOT/.roadmap-logs}"
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

SENTINEL="ROADMAP_COMPLETE"

# Consigne de concision injectée dans le system prompt pour économiser les tokens.
TERSE="Sois extrêmement bref dans ton texte. Pas de préambule, pas de récap, pas \
d'explication de ce que tu vas faire. Agis directement via les outils. Une ligne \
maximum entre deux actions. N'écris des phrases que si c'est strictement nécessaire."

# Condition de complétion évaluée par /goal — formulée comme un fait que la
# SORTIE de Claude doit démontrer (pas une commande à lancer).
GOAL="Toutes les cases de $ROADMAP sont cochées ([x]) et 'npx vitest run' passe \
sans échec. Quand c'est vrai, écris exactement le mot $SENTINEL sur la dernière ligne."

# Prompt de travail (une itération = avancer le plus loin possible).
read -r -d '' PROMPT <<EOF
/goal $GOAL

Tu travailles sur le nœud magasin AerisPay. Respecte STRICTEMENT CLAUDE.md
(TDD obligatoire, TypeScript strict, Zod, Prisma singleton, pas de any).

Boucle de travail :
1. Lis $ROADMAP et identifie la PROCHAINE tâche non cochée ([ ]) dans l'ordre.
2. Lis la doc produit du module concerné (docs/product/) et CONVENTIONS.md.
3. Écris/mets à jour les tests d'abord, vois-les échouer, puis le code minimal.
4. Lance 'npx vitest run' ; n'avance que si les tests passent.
5. Coche la tâche dans $ROADMAP et mets à jour le journal §10 de la roadmap.
6. 'git add -A && git commit' avec un message clair par tâche terminée.
7. Passe à la tâche suivante. Continue jusqu'à ce que tout soit coché.

Quand il ne reste plus aucune case [ ] et que les tests passent, écris $SENTINEL.
EOF

mkdir -p "$LOGDIR"
cd "$WORKDIR" || { echo "Répertoire introuvable : $WORKDIR"; exit 1; }

echo "▶ Démarrage roadmap autonome — repo: $WORKDIR — modèle: $MODEL"
echo "  Logs: $LOGDIR"

for ((i = 1; i <= MAX_ITER; i++)); do
  TS="$(date '+%Y-%m-%d_%H-%M-%S')"
  LOG="$LOGDIR/iter-$(printf '%03d' "$i")-$TS.log"
  echo ""
  echo "=== Itération $i / $MAX_ITER — $TS ==="

  # --continue : reprend la session précédente (contexte conservé, auto-compacté).
  # bypassPermissions : autonomie totale (édition/commande sans confirmation).
  if [[ "$STREAM" == "1" ]]; then
    # Tout voir en direct : flux d'événements (outils + raisonnement) formaté à
    # l'écran ; JSON brut conservé dans $LOG pour la détection sentinelle/limites.
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

  # Succès : sentinelle présente dans la sortie -> on s'arrête.
  if grep -q "$SENTINEL" "$LOG"; then
    echo ""
    echo "✅ Roadmap terminée à l'itération $i. Voir $LOG"
    exit 0
  fi

  # Limite d'usage / rate-limit détectée -> pause longue avant de réessayer.
  if grep -qiE "usage limit|rate limit|limit reached|429|quota|reset at" "$LOG"; then
    echo "⏳ Limite d'usage atteinte. Pause ${LIMIT_SLEEP}s avant relance…"
    sleep "$LIMIT_SLEEP"
  else
    sleep "$COOLDOWN"
  fi
done

echo "⚠ Plafond MAX_ITER=$MAX_ITER atteint sans $SENTINEL. Vérifie $LOGDIR."
exit 1
