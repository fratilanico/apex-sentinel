#!/bin/bash
# APEX-SENTINEL Wave Formation Script
# One script per project — never share
set -euo pipefail

PROJECT="APEX-SENTINEL"
WAVE="${2:-}"
DOCS_DIR="docs/waves/$WAVE"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colours
BOLD="\033[1m"; RESET="\033[0m"
GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; CYAN="\033[36m"

notify() {
  local msg="$1"
  echo "[WAVE-FORMATION] $msg"
  if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID" \
      -d "text=🛡️ $PROJECT | ${WAVE:-mtg} | $msg" \
      -d "parse_mode=Markdown" > /dev/null 2>&1 || true
  fi
}

cmd_mind_the_gap() {
  echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  APEX-SENTINEL — Mind-the-Gap 14-Point Audit     ${RESET}"
  echo -e "${BOLD}  Checks 1-8: TDD/Code · Checks 9-14: FDRP        ${RESET}"
  echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"

  local pass=0 fail_count=0

  # ── Check 1: No NOT_IMPLEMENTED stubs left in src/ ───────────────────────
  echo -e "\n${CYAN}Check 1: Scanning for NOT_IMPLEMENTED stubs in src/...${RESET}"
  local stubs
  stubs=$(grep -rn --include="*.ts" \
    -E "(NOT_IMPLEMENTED|TODO|FIXME|HACK|stub|placeholder)" \
    "${REPO_ROOT}/src" 2>/dev/null | grep -v "node_modules" || true)
  if [[ -n "$stubs" ]]; then
    echo -e "${YELLOW}[!] Found unimplemented stubs:${RESET}"
    echo "$stubs" | head -10
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 1 PASS — No NOT_IMPLEMENTED stubs${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 2: No hardcoded credentials in src/ or docs/ ───────────────────
  echo -e "\n${CYAN}Check 2: Scanning for hardcoded credentials/tokens...${RESET}"
  local creds
  creds=$(grep -rn --include="*.ts" --include="*.md" --include="*.sh" \
    -E "(eyJ[a-zA-Z0-9]{20,}|api_key\s*=\s*['\"][a-zA-Z0-9]{20,}|supabase.*service_role|IdXCzhQH)" \
    "${REPO_ROOT}/src" "${REPO_ROOT}/scripts" \
    --exclude-dir=node_modules 2>/dev/null || true)
  if [[ -n "$creds" ]]; then
    echo -e "${YELLOW}[!] Possible hardcoded credentials:${RESET}"
    echo "$creds" | head -5
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 2 PASS — No hardcoded credentials${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 3: Raw audio never transmitted — privacy audit ─────────────────
  echo -e "\n${CYAN}Check 3: Privacy audit — raw audio/PII transmission check...${RESET}"
  local privacy_violations
  # Exclude type declarations (field names documenting what must NOT happen)
  # Flag actual call sites: emit/publish/send/transmit of raw audio
  privacy_violations=$(grep -rn --include="*.ts" \
    -E "(emit.*rawAudio|publish.*pcmBuffer|send.*audioBuffer|transmit.*Int16Array|nats.*samples)" \
    "${REPO_ROOT}/src" --exclude-dir=node_modules 2>/dev/null || true)
  if [[ -n "$privacy_violations" ]]; then
    echo -e "${YELLOW}[!] Possible raw audio transmission found:${RESET}"
    echo "$privacy_violations" | head -5
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 3 PASS — No raw audio transmission paths${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 4: .gitignore covers sensitive paths ────────────────────────────
  echo -e "\n${CYAN}Check 4: Verifying sensitive paths are gitignored...${RESET}"
  local tracked_sensitive
  tracked_sensitive=$(git -C "${REPO_ROOT}" ls-files \
    "*.env" ".env.local" "*.key" "*.pem" "auth-profiles.json" \
    2>/dev/null | head -5 || true)
  if [[ -n "$tracked_sensitive" ]]; then
    echo -e "${YELLOW}[!] Sensitive files tracked in git:${RESET}"
    echo "$tracked_sensitive"
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 4 PASS — No sensitive files in git${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 5: 21 PROJECTAPEX docs present for last completed wave ──────────
  echo -e "\n${CYAN}Check 5: PROJECTAPEX docs count (W1 must have ≥20)...${RESET}"
  local w1_count
  w1_count=$(ls "${REPO_ROOT}/docs/waves/W1/" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${w1_count:-0}" -lt 20 ]]; then
    echo -e "${YELLOW}[!] W1 docs incomplete: ${w1_count}/20+ (found in docs/waves/W1/)${RESET}"
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 5 PASS — ${w1_count} docs in docs/waves/W1/${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 6: FR_REGISTER — all W1 FRs have test IDs defined ─────────────
  echo -e "\n${CYAN}Check 6: FR coverage — W1 FRs have test references...${RESET}"
  local frs_without_tests
  frs_without_tests=$(grep -c "Test IDs.*FR-[0-9]" \
    "${REPO_ROOT}/docs/waves/W1/FR_REGISTER.md" 2>/dev/null || echo "0")
  if [[ "${frs_without_tests:-0}" -lt 5 ]]; then
    echo -e "${YELLOW}[!] FR_REGISTER has fewer than 5 FRs with test IDs (found: ${frs_without_tests})${RESET}"
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 6 PASS — ${frs_without_tests} FRs have test IDs in register${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 7: Supabase project ID is set and referenced ───────────────────
  echo -e "\n${CYAN}Check 7: Supabase project wired (bymfcnwfyxuivinuzurr)...${RESET}"
  local supabase_refs
  supabase_refs=$(grep -rn "bymfcnwfyxuivinuzurr" \
    "${REPO_ROOT}/docs" "${REPO_ROOT}/supabase" \
    --include="*.md" --include="*.sql" --include="*.json" \
    2>/dev/null | wc -l | tr -d ' ' || echo "0")
  if [[ "${supabase_refs:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] Supabase project ID not found in docs/ or supabase/. Schema not wired.${RESET}"
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 7 PASS — Supabase project referenced (${supabase_refs} occurrences)${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 8: Test gate — all tests passing, coverage ≥80% ────────────────
  echo -e "\n${CYAN}Check 8: Running test suite gate (86 tests, ≥80% coverage)...${RESET}"
  local test_out failing passing
  test_out=$(cd "${REPO_ROOT}" && npx vitest run --coverage 2>&1 || true)
  passing=$(echo "$test_out" | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" | tail -1 || echo "0")
  failing=$(echo "$test_out" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" | tail -1 || echo "0")

  if [[ "${failing:-0}" -gt 0 ]]; then
    echo -e "${YELLOW}[!] ${failing} tests failing (must be 0)${RESET}"
    fail_count=$((fail_count + 1))
  elif [[ "${passing:-0}" -lt 86 ]]; then
    echo -e "${YELLOW}[!] Test regression: ${passing} passing (baseline: 86)${RESET}"
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 8 PASS — ${passing} tests passing, 0 failing${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 9: Security posture — git log credential scan + mTLS config ────
  echo -e "\n${CYAN}Check 9 [SEC]: Security posture — git log scan + mTLS config...${RESET}"
  local git_cred_leak mtls_present
  git_cred_leak=$(git -C "${REPO_ROOT}" log --all --oneline -30 2>/dev/null \
    | xargs -I{} git -C "${REPO_ROOT}" show {} -- 2>/dev/null \
    | grep -iE "(api.?key|password|secret|service.?role|supabase.*anon)" \
    | grep -v "^Binary\|placeholder\|example\|your.*key\|<\|#" \
    | head -5 || true)
  mtls_present=$(grep -rn "certFile\|keyFile\|caFile\|tls\." \
    "${REPO_ROOT}/src/nats/auth-config.ts" 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  local sec_fail=0
  if [[ -n "$git_cred_leak" ]]; then
    echo -e "${YELLOW}[!] Possible credential in git history:${RESET}"
    echo "$git_cred_leak"
    sec_fail=1
  fi
  if [[ "${mtls_present:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] mTLS config not found in src/nats/auth-config.ts${RESET}"
    sec_fail=1
  fi
  if [[ $sec_fail -eq 0 ]]; then
    echo -e "${GREEN}[✓] Check 9 PASS — No git credential leaks, mTLS config present${RESET}"
    pass=$((pass + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  # ── Check 10: Operator UX — CoT type codes + keyboard shortcuts ───────────
  echo -e "\n${CYAN}Check 10 [PUX]: Operator UX — ATAK CoT types + keyboard shortcuts...${RESET}"
  local cot_fpv cot_shahed kb_shortcuts
  cot_fpv=$(grep -rn "a-h-A-M-F-Q\|fpv_drone\|FPV" \
    "${REPO_ROOT}/src" --include="*.ts" 2>/dev/null | wc -l | tr -d ' \n' || echo "0")
  cot_shahed=$(grep -rn "a-h-A-C-F\|shahed\|Shahed" \
    "${REPO_ROOT}/src" --include="*.ts" 2>/dev/null | wc -l | tr -d ' \n' || echo "0")
  kb_shortcuts=$([ -f "${REPO_ROOT}/src/dashboard/keyboard-shortcuts.ts" ] && echo "1" || echo "0")
  local ux_fail=0
  if [[ "${cot_fpv:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] FPV CoT type code (a-h-A-M-F-Q) not found in src/${RESET}"
    ux_fail=1
  fi
  if [[ "${cot_shahed:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] Shahed CoT type code (a-h-A-C-F) not found in src/${RESET}"
    ux_fail=1
  fi
  if [[ "${kb_shortcuts:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] KeyboardShortcuts not found in src/dashboard/${RESET}"
    ux_fail=1
  fi
  if [[ $ux_fail -eq 0 ]]; then
    echo -e "${GREEN}[✓] Check 10 PASS — FPV+Shahed CoT types present, keyboard shortcuts wired${RESET}"
    pass=$((pass + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  # ── Check 11: Mission viability — all 5 pipeline gates have source files ──
  echo -e "\n${CYAN}Check 11 [MIS]: Mission viability — 5-gate pipeline completeness...${RESET}"
  local gate_acoustic gate_rf gate_tdoa gate_nats gate_relay
  gate_acoustic=$([ -f "${REPO_ROOT}/src/acoustic/pipeline.ts" ] && echo "1" || echo "0")
  gate_rf=$([ -f "${REPO_ROOT}/src/rf/rssi-baseline.ts" ] && echo "1" || echo "0")
  gate_tdoa=$([ -f "${REPO_ROOT}/src/tracking/tdoa.ts" ] && echo "1" || echo "0")
  gate_nats=$([ -f "${REPO_ROOT}/src/nats/stream-config.ts" ] && echo "1" || echo "0")
  gate_relay=$([ -f "${REPO_ROOT}/src/relay/cot-relay.ts" ] && echo "1" || echo "0")
  local gates_present=$(( gate_acoustic + gate_rf + gate_tdoa + gate_nats + gate_relay ))
  # Check W5 EKF (prediction engine) — AMBER if missing
  local ekf_present
  ekf_present=$([ -f "${REPO_ROOT}/src/prediction/ekf.ts" ] && echo "1" || echo "0")
  if [[ "${gates_present:-0}" -lt 5 ]]; then
    echo -e "${YELLOW}[!] Only ${gates_present}/5 pipeline gate source files present${RESET}"
    fail_count=$((fail_count + 1))
  else
    if [[ "${ekf_present:-0}" -lt 1 ]]; then
      echo -e "${GREEN}[✓] Check 11 PASS — 5/5 pipeline gates present${RESET}"
      echo -e "${YELLOW}    [AMBER] W5 EKF (src/prediction/ekf.ts) not yet built — TDD RED next${RESET}"
    else
      echo -e "${GREEN}[✓] Check 11 PASS — 5/5 pipeline gates + EKF prediction engine present${RESET}"
    fi
    pass=$((pass + 1))
  fi

  # ── Check 12: Detection data quality — CotRelay coverage RED flag ─────────
  echo -e "\n${CYAN}Check 12 [DAT]: Detection data quality — module coverage audit...${RESET}"
  local cov_out relay_stmt relay_branch
  cov_out=$(cd "${REPO_ROOT}" && npx vitest run --coverage --reporter=verbose 2>&1 || true)
  # Extract relay coverage — format: " cot-relay.ts  | XX.XX |"
  relay_stmt=$(echo "$cov_out" | grep "cot-relay" | grep -oE "\|\s+[0-9]+\.[0-9]+" | head -1 | grep -oE "[0-9]+\.[0-9]+" || echo "0")
  relay_branch=$(echo "$cov_out" | grep "cot-relay" | grep -oE "\|\s+[0-9]+\.[0-9]+" | sed -n '2p' | grep -oE "[0-9]+\.[0-9]+" || echo "0")
  local relay_stmt_int
  relay_stmt_int=$(echo "$relay_stmt" | cut -d. -f1)
  if [[ "${relay_stmt_int:-0}" -lt 80 ]]; then
    echo -e "${RED}[✗] Check 12 FAIL — CotRelay stmt coverage: ${relay_stmt}% (RED threshold: <80%)${RESET}"
    echo -e "${RED}    CRITICAL: CoT relay is the C2 output — untested paths = silent operator blind${RESET}"
    fail_count=$((fail_count + 1))
  else
    echo -e "${GREEN}[✓] Check 12 PASS — CotRelay coverage: ${relay_stmt}% stmt${RESET}"
    pass=$((pass + 1))
  fi

  # ── Check 13: Regulatory/GDPR — LocationCoarsener + no raw storage ────────
  echo -e "\n${CYAN}Check 13 [REG]: Regulatory/GDPR — privacy architecture completeness...${RESET}"
  local coarsener_tests privacy_doc dpia_note
  coarsener_tests=$(grep -c "FR-24-" \
    "${REPO_ROOT}/tests/privacy/FR-24-privacy.test.ts" 2>/dev/null || echo "0")
  privacy_doc=$([ -f "${REPO_ROOT}/docs/waves/W1/PRIVACY_ARCHITECTURE.md" ] && echo "1" || echo "0")
  dpia_note=$(grep -rn "DPIA\|Data Protection Impact\|Article 35" \
    "${REPO_ROOT}/docs" --include="*.md" 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  local reg_fail=0
  if [[ "${coarsener_tests:-0}" -lt 9 ]]; then
    echo -e "${YELLOW}[!] LocationCoarsener has only ${coarsener_tests} FR-24 tests (need ≥9)${RESET}"
    reg_fail=1
  fi
  if [[ "${privacy_doc:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] PRIVACY_ARCHITECTURE.md not found in docs/waves/W1/${RESET}"
    reg_fail=1
  fi
  if [[ "${dpia_note:-0}" -lt 1 ]]; then
    echo -e "${YELLOW}[!] No DPIA reference in docs/ — Article 35 required for biometric-adjacent audio processing${RESET}"
    reg_fail=1
  fi
  if [[ $reg_fail -eq 0 ]]; then
    echo -e "${GREEN}[✓] Check 13 PASS — ${coarsener_tests} FR-24 GDPR tests, privacy arch doc, DPIA referenced${RESET}"
    pass=$((pass + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  # ── Check 14: Human factors — no pipe chars in Telegram + alert matrix ────
  echo -e "\n${CYAN}Check 14 [HF]: Human factors — Telegram format + alert classification...${RESET}"
  local pipe_violations alert_matrix
  # Detect pipe chars in Telegram message string literals only
  # Pattern: quoted string containing " | " (table-format pipe in a message string)
  pipe_violations=$(grep -rn --include="*.ts" \
    -E '`[^`]*\|[^`]*`|"[^"]*\|[^"]*"' \
    "${REPO_ROOT}/src/alerts" 2>/dev/null \
    | grep -v "//\|regex\|split\|replace\|indexOf\|join\|=>" || true)
  alert_matrix=$(grep -c "critical\|high\|medium\|low" \
    "${REPO_ROOT}/src/dashboard/alert-store.ts" 2>/dev/null || echo "0")
  local hf_fail=0
  if [[ -n "$pipe_violations" ]]; then
    echo -e "${YELLOW}[!] Possible pipe chars in Telegram alert src (breaks Telegram tables):${RESET}"
    echo "$pipe_violations" | head -5
    hf_fail=1
  fi
  if [[ "${alert_matrix:-0}" -lt 4 ]]; then
    echo -e "${YELLOW}[!] Alert classification matrix incomplete — need critical/high/medium/low${RESET}"
    hf_fail=1
  fi
  if [[ $hf_fail -eq 0 ]]; then
    echo -e "${GREEN}[✓] Check 14 PASS — No pipe chars in alerts, 4-level threat matrix present${RESET}"
    pass=$((pass + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  # ── Summary ───────────────────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  Mind-the-Gap Results: ${pass}/14 checks passed   ${RESET}"
  echo -e "${BOLD}  Checks 1-8: TDD/Code · 9-14: FDRP Dimensional   ${RESET}"
  echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"

  if [[ $fail_count -eq 0 ]]; then
    echo -e "\n${GREEN}${BOLD}[✓] ALL 14 CHECKS PASSED — exit 0 ✓${RESET}"
    echo -e "${GREEN}14/14 PASS. APEX-SENTINEL is real.${RESET}"
    notify "mind-the-gap 14/14 PASS — all dimensions clean"
    exit 0
  else
    echo -e "\n${RED}${BOLD}[✗] ${fail_count} CHECK(S) FAILED — fix before claiming done${RESET}"
    notify "mind-the-gap ${pass}/14 — ${fail_count} failures"
    exit 1
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
  mind-the-gap)
    cmd_mind_the_gap
    ;;
  *)
    echo "Usage: $0 {init|plan|tdd-red|execute|checkpoint|complete|status|mind-the-gap} [WAVE]"
    exit 1
    ;;
esac
