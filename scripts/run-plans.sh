#!/usr/bin/env bash
#
# run-plans.sh — Exécution autonome des plans d'implémentation AerisPay.
#
# Relance Claude Code en boucle (headless + /goal) jusqu'à ce que TOUS les plans
# de docs/superpowers/plans/ soient exécutés. Un plan PRÉSENT dans ce dossier =
# un plan EN ATTENTE ; sa tâche finale le supprime une fois implémenté et vérifié
# (politique « specs/plans éphémères », CLAUDE.md §8.1). Le runner s'arrête donc
# quand le dossier ne contient plus aucun plan.
#
# Survit à la fin de session et aux limites d'usage (token/rate-limit) : il sleep
# puis relance automatiquement (--continue conserve le contexte, auto-compacté).
#
# Usage :
#   ./scripts/run-plans.sh
#   MAX_ITER=500 MODEL=claude-sonnet-4-6 ./scripts/run-plans.sh
#
# Arrêt : Ctrl-C, automatiquement quand plus aucun plan ne reste (ou sentinelle
# PLANS_COMPLETE émise par Claude).

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

SENTINEL="PLANS_COMPLETE"

# Compte les plans encore en attente (fichiers .md hors README éventuel).
count_pending_plans() {
  find "$REPO_ROOT/$PLANS_DIR" -maxdepth 1 -type f -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' '
}

# Consigne de concision injectée dans le system prompt pour économiser les tokens.
TERSE="Sois extrêmement bref dans ton texte. Pas de préambule, pas de récap, pas \
d'explication de ce que tu vas faire. Agis directement via les outils. Une ligne \
maximum entre deux actions. N'écris des phrases que si c'est strictement nécessaire."

# Condition de complétion évaluée par /goal — formulée comme un fait que la
# SORTIE de Claude doit démontrer (pas une commande à lancer).
GOAL="Le dossier $PLANS_DIR ne contient plus aucun plan (.md) et les suites de tests \
passent (web/app : 'npx vitest run' ; desktop : 'npx vitest run'). Quand c'est vrai, \
écris exactement le mot $SENTINEL sur la dernière ligne."

# Prompt de travail (une itération = exécuter le plus loin possible le plan courant).
read -r -d '' PROMPT <<EOF
/goal $GOAL

Tu travailles sur AerisPay (monorepo : web/app = nœud magasin, desktop = client Electron).
Respecte STRICTEMENT CLAUDE.md (TDD obligatoire, TypeScript strict, Zod, Prisma singleton,
pas de any ; commits SANS mention Co-Authored-By, CLAUDE.md §8.2).

Boucle de travail :
1. Liste $PLANS_DIR. S'il ne reste aucun plan (.md), vérifie que les tests passent puis écris $SENTINEL.
2. Sinon, prends le PLUS ANCIEN plan (ordre alphabétique du nom de fichier = ordre chronologique).
3. Exécute-le tâche par tâche avec la compétence superpowers:executing-plans :
   pour chaque tâche, écris le test d'abord, vois-le échouer, code minimal, tests verts, commit.
4. La DERNIÈRE tâche du plan supprime la spec ET le plan correspondants (politique éphémère,
   CLAUDE.md §8.1) puis commit. Le plan disparaît donc de $PLANS_DIR quand il est terminé.
5. Passe au plan suivant. Continue jusqu'à ce que $PLANS_DIR soit vide et les tests verts.

N'avance jamais sur une tâche dont les tests échouent. Un commit par tâche terminée.
Quand $PLANS_DIR ne contient plus aucun plan et que les tests passent, écris $SENTINEL.
EOF

mkdir -p "$LOGDIR"
cd "$WORKDIR" || { echo "Répertoire introuvable : $WORKDIR"; exit 1; }

PENDING="$(count_pending_plans)"
echo "▶ Démarrage exécution autonome des plans — repo: $WORKDIR — modèle: $MODEL"
echo "  Plans en attente: $PENDING ($PLANS_DIR)"
echo "  Logs: $LOGDIR"

if [[ "$PENDING" == "0" ]]; then
  echo "✅ Aucun plan en attente. Rien à faire."
  exit 0
fi

for ((i = 1; i <= MAX_ITER; i++)); do
  # Arrêt déterministe : plus aucun plan en attente -> terminé.
  if [[ "$(count_pending_plans)" == "0" ]]; then
    echo ""
    echo "✅ Tous les plans sont exécutés (dossier $PLANS_DIR vide)."
    exit 0
  fi

  TS="$(date '+%Y-%m-%d_%H-%M-%S')"
  LOG="$LOGDIR/iter-$(printf '%03d' "$i")-$TS.log"
  echo ""
  echo "=== Itération $i / $MAX_ITER — $TS — plans restants: $(count_pending_plans) ==="

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

  # Succès explicite : sentinelle présente -> on revérifie le dossier et on s'arrête.
  if grep -q "$SENTINEL" "$LOG" && [[ "$(count_pending_plans)" == "0" ]]; then
    echo ""
    echo "✅ Plans terminés à l'itération $i. Voir $LOG"
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

echo "⚠ Plafond MAX_ITER=$MAX_ITER atteint. Plans restants: $(count_pending_plans). Vérifie $LOGDIR."
exit 1
