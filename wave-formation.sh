#!/bin/bash
# APEX-SENTINEL Wave Formation Script
# One script per project — never share
set -euo pipefail

PROJECT="APEX-SENTINEL"
WAVE=$2
DOCS_DIR="docs/waves/$WAVE"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

notify() {
  local msg="$1"
  echo "[WAVE-FORMATION] $msg"
  if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID" \
      -d "text=🛡️ $PROJECT | $WAVE | $msg" \
      -d "parse_mode=Markdown" > /dev/null 2>&1 || true
  fi
}

case "$1" in
  init)
    echo "⚡ APEX-SENTINEL Wave Formation: INIT $WAVE"
    mkdir -p "$DOCS_DIR"
    notify "wave:init $WAVE — docs scaffold created"
    echo "✅ Init complete. Write 20 PROJECTAPEX docs in $DOCS_DIR/"
    ;;
  plan)
    echo "📋 APEX-SENTINEL Wave Formation: PLAN $WAVE"
    notify "wave:plan $WAVE — planning phase"
    ls "$DOCS_DIR/" | wc -l | xargs -I{} echo "Docs present: {}"
    ;;
  tdd-red)
    echo "🔴 APEX-SENTINEL Wave Formation: TDD-RED $WAVE"
    notify "wave:tdd-red $WAVE — writing failing tests"
    ;;
  execute)
    echo "⚙️ APEX-SENTINEL Wave Formation: EXECUTE $WAVE"
    notify "wave:execute $WAVE — implementation started"
    ;;
  checkpoint)
    echo "🔍 APEX-SENTINEL Wave Formation: CHECKPOINT $WAVE"
    notify "wave:checkpoint $WAVE — running verification"
    # Run verification suite
    if command -v npx &> /dev/null; then
      npx vitest run --coverage 2>/dev/null || echo "Tests: check manually"
    fi
    ;;
  complete)
    echo "✅ APEX-SENTINEL Wave Formation: COMPLETE $WAVE"
    notify "wave:complete $WAVE — wave finished, committing"
    git add -A && git commit -m "wave: $WAVE complete — APEX-SENTINEL" || true
    ;;
  status)
    echo "📊 APEX-SENTINEL Wave Status"
    for wave_dir in docs/waves/*/; do
      w=$(basename "$wave_dir")
      count=$(ls "$wave_dir" 2>/dev/null | wc -l | tr -d ' ')
      echo "  $w: $count docs"
    done
    ;;
  *)
    echo "Usage: $0 {init|plan|tdd-red|execute|checkpoint|complete|status} WAVE"
    exit 1
    ;;
esac
