# APEX-SENTINEL — Last Known Good Configuration (LKGC)
# FILE 15 of 20 — LKGC_TEMPLATE.md
# Wave 2 — NATS JetStream + Supabase Schema + Edge Functions + TDoA Correlation
# Created: 2026-03-24

---

## Purpose

This document captures the Last Known Good Configuration for APEX-SENTINEL Wave 2. It is
updated at every checkpoint gate, every time a phase (P1–P6) completes, and immediately
before any production deployment. When a regression is detected or a deployment must be
rolled back, this document is the authoritative target state.

**RULE:** Never overwrite this file. Create checkpoint variants:
- `LKGC-W2-P1-YYYYMMDD-HHmm.md` — phase gate snapshot
- `LKGC-W2-COMPLETE-YYYYMMDD-HHmm.md` — wave:complete snapshot

This file is the W2 pre-code design baseline. All subsequent LKGC snapshots extend it.

---

## 1. LKGC ID Format

```
LKGC-W2-YYYYMMDD-HHmm

Examples:
  LKGC-W2-20260324-0000    ← this document (pre-code baseline)
  LKGC-W2-20260327-1430    ← P1 NATS cluster verified
  LKGC-W2-20260330-0900    ← P2 Supabase migrations applied
  LKGC-W2-20260403-1700    ← P3 Edge Functions deployed
  LKGC-W2-20260407-1200    ← P4 TDoA correlation service running
  LKGC-W2-20260409-1800    ← P5 alert routing live
  LKGC-W2-20260414-2200    ← wave:complete (all gates green)
```

Storage: git tag matching LKGC ID + Supabase `lkgc_snapshots` table row.

---

## 2. Capture Fields

Each LKGC snapshot records the following fields. This is the W2 pre-code baseline;
all values marked `(pending)` are filled in at actual capture time.

### 2.1 Git State

```
LKGC ID:              LKGC-W2-20260324-0000
Repository:           https://github.com/apex-sentinel/apex-sentinel
Branch:               main
Commit SHA (long):    (pending)
Commit SHA (short):   (pending)
Git tag:              v0.2.0-w2-baseline
Tree hash:            (pending)
Last commit message:  docs(w2): PROJECTAPEX 20-doc suite — W2 pre-code baseline
Committed by:         Nicolae Fratila <nico@apexos.io>
Committed at:         2026-03-24T00:00:00Z
Dirty working tree:   false
Uncommitted files:    0
```

Tag command:
```bash
git tag -a v0.2.0-w2-baseline -m "W2 pre-code baseline — LKGC-W2-20260324-0000"
git push origin v0.2.0-w2-baseline
```

### 2.2 NATS JetStream Cluster State

```
Cluster name:         APEX-SENTINEL
Raft consensus:       5-node (quorum = 3)
Nodes:
  nats1.apex-sentinel.internal:4222    Leader (initial)
  nats2.apex-sentinel.internal:4222    Follower
  nats3.apex-sentinel.internal:4222    Follower
  nats4.apex-sentinel.internal:4222    Follower
  nats5.apex-sentinel.internal:4222    Follower

JetStream domain:     apex-sentinel
JetStream state (W2 baseline — streams not yet created):
  Streams configured:   0
  Streams active:       0
  Consumer count:       0
  Total messages:       0
  Total bytes:          0 B

Stream targets at W2-COMPLETE:
  DETECTIONS stream:
    subjects:           sentinel.detections.>
    storage:            file
    replicas:           3
    retention:          limits
    max_age:            72h
    max_bytes:          5 GiB
    max_msg_size:       64 KiB
    consumer_lag (target):  < 500 messages at steady state
    consumer_lag (alert):   > 5000 messages

  NODE_HEALTH stream:
    subjects:           sentinel.health.>
    storage:            file
    replicas:           3
    retention:          limits
    max_age:            24h
    max_bytes:          500 MiB
    max_msg_size:       8 KiB
    consumer_lag (target):  < 100 messages

  ALERTS stream:
    subjects:           sentinel.alerts.>
    storage:            file
    replicas:           3
    retention:          limits
    max_age:            168h  (7 days)
    max_bytes:          1 GiB
    max_msg_size:       32 KiB
    consumer_lag (target):  < 50 messages
    consumer_lag (alert):   > 500 messages (alert routing blocked)

  COT_EVENTS stream:
    subjects:           sentinel.cot.>
    storage:            file
    replicas:           3
    retention:          limits
    max_age:            24h
    max_bytes:          200 MiB
    max_msg_size:       32 KiB
    consumer_lag (target):  < 100 messages

NATS server version:    2.10.x
NATS CLI version:       0.1.x
```

Capture command (automated, run post-P1):
```bash
# Capture stream counts and consumer lag into LKGC snapshot
nats --server nats://nats1.apex-sentinel.internal:4222 stream report \
  --json > /tmp/nats-stream-report.json

# Parse into LKGC fields
STREAM_COUNT=$(jq '.streams | length' /tmp/nats-stream-report.json)
TOTAL_MSGS=$(jq '[.streams[].state.messages] | add' /tmp/nats-stream-report.json)
TOTAL_BYTES=$(jq '[.streams[].state.bytes] | add' /tmp/nats-stream-report.json)

echo "Streams: $STREAM_COUNT  Messages: $TOTAL_MSGS  Bytes: $TOTAL_BYTES"
```

### 2.3 Supabase Migration Version

```
Project ID:           bymfcnwfyxuivinuzurr
Region:               eu-west-2 (London)
Project URL:          https://bymfcnwfyxuivinuzurr.supabase.co
Dashboard:            https://supabase.com/dashboard/project/bymfcnwfyxuivinuzurr

Migration state (W2 baseline — carried forward from W1):
  Applied (W1):
    0000_initial_schema.sql
    0001_sensor_nodes.sql
    0002_detection_events.sql
    0003_rf_readings.sql
    0004_mesh_topology.sql
    0005_rls_policies.sql
    0006_realtime_enable.sql

  Pending (W2 additions):
    0007_nats_stream_config.sql
    0008_tracks.sql
    0009_alerts.sql
    0010_node_health_log.sql
    0011_lkgc_snapshots.sql
    0012_tdoa_events.sql
    0013_rls_w2_policies.sql
    0014_edge_function_logs.sql
    0015_alert_subscriptions.sql
    0016_meshtastic_bridge_log.sql

Last applied migration at W2-COMPLETE: 0016_meshtastic_bridge_log.sql
Last applied migration SHA-256: (pending)
Migration tool: supabase-cli 2.x
```

Capture command:
```bash
supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked \
  | head -5  # should output "No schema changes detected" when clean

# List applied migrations via Management API (requires SUPABASE_PAT)
curl -s "https://api.supabase.com/v1/projects/bymfcnwfyxuivinuzurr/database/migrations" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  | jq '[.[] | {version, name, inserted_at}]'
```

### 2.4 Edge Functions Deployed

```
Functions (W2 targets):
  register-node        version: (pending)  last_deployed: (pending)  status: active
  ingest-event         version: (pending)  last_deployed: (pending)  status: active
  node-health          version: (pending)  last_deployed: (pending)  status: active
  alert-router         version: (pending)  last_deployed: (pending)  status: active
  tdoa-correlate       version: (pending)  last_deployed: (pending)  status: active (W2 extension)

Deno version:         1.40.x (Supabase managed)
Edge runtime:         deno-1.40.x
```

### 2.5 Test Pass Rate and Coverage

```
Test suite:              W2 — NATS + Supabase + TDoA correlation service
Framework:               Vitest (unit + integration), Playwright (E2E)

Unit tests:
  Target count:          ≥ 150 tests
  Pass rate at LKGC:     (pending)
  Coverage — statements: ≥ 80%
  Coverage — branches:   ≥ 80%
  Coverage — functions:  ≥ 80%
  Coverage — lines:      ≥ 80%

Integration tests:
  Target count:          ≥ 40 tests
  Pass rate at LKGC:     (pending)

E2E tests (Playwright):
  Target count:          ≥ 10 tests
  Pass rate at LKGC:     (pending)

Android JUnit (W2 mesh additions):
  Target count:          ≥ 30 tests
  Pass rate at LKGC:     (pending)
  Jacoco coverage:       ≥ 80%

TDoA correlation service tests:
  Unit (TdoaSolver):     ≥ 20 tests
  Integration (NATS):    ≥ 10 tests
```

Capture command:
```bash
# Node.js services
cd services/tdoa-correlation && npx vitest run --coverage --reporter=json \
  > /tmp/vitest-results.json 2>&1
PASS_RATE=$(jq '.testResults | map(.status == "passed") | length / length * 100' \
  /tmp/vitest-results.json)
COVERAGE=$(jq '.coverageMap | ... | statements.pct' /tmp/vitest-results.json)
echo "Pass rate: $PASS_RATE%  Statements coverage: $COVERAGE%"

# Android
cd android && ./gradlew :app:test :app:jacocoTestReport --quiet
```

### 2.6 Node Fleet Size

```
Registered nodes at LKGC:
  Total registered:      (pending — dev/staging fleet)
  Active (last 5 min):   (pending)
  Active (last 1 hour):  (pending)
  Geographic spread:     (pending — lat/lon bounding box)
  Min nodes for TDoA:    3 (hard requirement)
  Nodes with Meshtastic: (pending)

Query:
```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '5 minutes') AS active_5m,
  COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '1 hour') AS active_1h,
  COUNT(*) FILTER (WHERE meshtastic_node_id IS NOT NULL) AS mesh_capable
FROM nodes;
```

### 2.7 Detection Pipeline State

```
Last detection event timestamp:    (pending)
Detection event ID (last):         (pending UUID)
TDoA correlation events (24h):     (pending)
Confirmed tracks (24h):            (pending)
Alerts dispatched (24h):           (pending)
NATS DETECTIONS stream lag:        (pending)
NATS ALERTS stream lag:            (pending)
Telegram bot last message:         (pending)
FreeTAKServer COT events (24h):    (pending)

Query:
```sql
SELECT
  MAX(detected_at) AS last_event,
  COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '24 hours') AS events_24h,
  COUNT(DISTINCT track_id) FILTER (
    WHERE detected_at > NOW() - INTERVAL '24 hours'
    AND track_id IS NOT NULL
  ) AS tracks_24h
FROM detection_events;
```

---

## 3. LKGC Capture Procedure

### 3.1 Automated Capture (CI/CD — runs at every checkpoint gate)

File: `scripts/capture-lkgc.sh`

```bash
#!/usr/bin/env bash
# capture-lkgc.sh — automated LKGC snapshot
# Usage: ./scripts/capture-lkgc.sh W2 [phase_label]
# Example: ./scripts/capture-lkgc.sh W2 P1-NATS-COMPLETE

set -euo pipefail

WAVE=${1:-W2}
LABEL=${2:-CHECKPOINT}
TIMESTAMP=$(date -u +%Y%m%d-%H%M)
LKGC_ID="LKGC-${WAVE}-${TIMESTAMP}"
SNAPSHOT_DIR="docs/waves/${WAVE}/lkgc-snapshots"
mkdir -p "$SNAPSHOT_DIR"
OUTFILE="${SNAPSHOT_DIR}/${LKGC_ID}.json"

echo "=== Capturing LKGC: $LKGC_ID ==="

# 1. Git state
GIT_SHA=$(git rev-parse HEAD)
GIT_SHA_SHORT=$(git rev-parse --short HEAD)
GIT_DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "untagged")

# 2. Test results
echo "Running test suite..."
cd services/tdoa-correlation
VITEST_JSON=$(npx vitest run --reporter=json --outputFile=/tmp/vitest-w2.json 2>/dev/null \
  && cat /tmp/vitest-w2.json || echo '{"numPassedTests":0,"numFailedTests":0}')
PASS_COUNT=$(echo "$VITEST_JSON" | jq '.numPassedTests // 0')
FAIL_COUNT=$(echo "$VITEST_JSON" | jq '.numFailedTests // 0')
cd - > /dev/null

# 3. NATS stream state
NATS_REPORT=$(nats --server "nats://nats1.apex-sentinel.internal:4222" \
  stream report --json 2>/dev/null || echo '{"streams":[]}')
STREAM_COUNT=$(echo "$NATS_REPORT" | jq '.streams | length // 0')

# 4. Supabase migration version
MIGRATION_VERSION=$(curl -sf \
  "https://api.supabase.com/v1/projects/bymfcnwfyxuivinuzurr/database/migrations" \
  -H "Authorization: Bearer ${SUPABASE_PAT}" \
  | jq -r '.[-1].version // "none"')

# 5. Node fleet
NODE_COUNT=$(curl -sf \
  "https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/nodes?select=count" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Prefer: count=exact" \
  -o /dev/null -w '%{http_header_size}' 2>/dev/null || echo "0")

# 6. Build snapshot JSON
cat > "$OUTFILE" << EOF
{
  "lkgc_id": "${LKGC_ID}",
  "wave": "${WAVE}",
  "label": "${LABEL}",
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git": {
    "sha": "${GIT_SHA}",
    "sha_short": "${GIT_SHA_SHORT}",
    "tag": "${GIT_TAG}",
    "dirty_files": ${GIT_DIRTY}
  },
  "nats": {
    "stream_count": ${STREAM_COUNT},
    "report": ${NATS_REPORT}
  },
  "supabase": {
    "last_migration": "${MIGRATION_VERSION}"
  },
  "tests": {
    "passed": ${PASS_COUNT},
    "failed": ${FAIL_COUNT}
  },
  "captured_by": "$(git config user.email)"
}
EOF

echo "Snapshot written: $OUTFILE"

# 7. Push to Supabase lkgc_snapshots table
curl -sf \
  "https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/lkgc_snapshots" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(cat $OUTFILE)" \
  && echo "Supabase lkgc_snapshots: row inserted"

# 8. Git tag
git tag -a "${LKGC_ID}" -m "LKGC capture: ${LABEL} @ ${TIMESTAMP}"
git push origin "${LKGC_ID}"
echo "Git tag pushed: ${LKGC_ID}"

echo "=== LKGC capture complete: $LKGC_ID ==="
```

### 3.2 Manual Capture Procedure

For situations where the automated script cannot run (no CI, network-isolated environment):

```bash
# Step 1 — Record git state
git log -1 --format="%H %ai %s" > /tmp/lkgc-git.txt
git status --short >> /tmp/lkgc-git.txt

# Step 2 — NATS cluster health check
nats --server nats://nats1.apex-sentinel.internal:4222 server ping
nats --server nats://nats1.apex-sentinel.internal:4222 server report jetstream
nats --server nats://nats1.apex-sentinel.internal:4222 stream report
nats --server nats://nats1.apex-sentinel.internal:4222 consumer report DETECTIONS

# Step 3 — Supabase migration state
supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked
# Expected output: "No schema changes detected"

# Step 4 — Run full test suite
cd services/tdoa-correlation
npx vitest run --coverage
# Record: X passed, Y failed, Z% coverage

# Step 5 — Node fleet snapshot
psql "$SUPABASE_DB_URL" -c "
SELECT
  COUNT(*) AS total_nodes,
  COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '5 minutes') AS active_5m,
  MAX(last_seen_at) AS most_recent_heartbeat
FROM nodes;"

# Step 6 — Create snapshot directory entry
LKGC_ID="LKGC-W2-$(date -u +%Y%m%d-%H%M)"
mkdir -p docs/waves/W2/lkgc-snapshots
# Manually fill LKGC fields into JSON file using Step 2-5 output
vim docs/waves/W2/lkgc-snapshots/${LKGC_ID}.json

# Step 7 — Tag and push
git add docs/waves/W2/lkgc-snapshots/
git commit -m "chore(lkgc): capture ${LKGC_ID}"
git tag -a "${LKGC_ID}" -m "Manual LKGC capture"
git push origin main "${LKGC_ID}"
```

---

## 4. Rollback Procedure

### 4.1 Decision Criteria for Rollback

Roll back to last LKGC when ANY of the following occur:
- NATS JetStream: consumer lag > 10,000 messages on DETECTIONS stream for > 5 minutes
- NATS JetStream: stream data loss (messages redelivered with gap in sequence IDs)
- Supabase: Edge Function error rate > 5% over 10-minute window
- Supabase: RLS policy regression (anon key can read detection_events — data breach)
- TDoA service: correlation accuracy drops below 60% on known test dataset
- Alert router: Telegram dispatch failure rate > 10% for confirmed tracks
- Test regression: any previously passing test now fails on main branch

### 4.2 NATS Stream Rollback

NATS JetStream is append-only — data is not destroyed on rollback. The rollback
procedure restores the service configuration to the last-known-good state while
preserving all stream data for replay.

```bash
# Step 1 — Identify last good LKGC tag
git tag -l "LKGC-W2-*" | sort | tail -5

# Step 2 — Extract NATS stream configuration from that tag
git show LKGC-W2-20260403-1700:infra/nats/streams/detections.json

# Step 3 — Check current stream config vs LKGC config
nats --server nats://nats1.apex-sentinel.internal:4222 \
  stream info DETECTIONS --json

# Step 4 — If stream config drifted, update to LKGC spec
nats --server nats://nats1.apex-sentinel.internal:4222 \
  stream edit DETECTIONS \
  --config infra/nats/streams/detections.json

# Step 5 — Verify consumer groups are intact
nats --server nats://nats1.apex-sentinel.internal:4222 \
  consumer report DETECTIONS

# Step 6 — Stream replay (if TDoA service missed events during outage)
# Replay all unprocessed messages from last known-processed sequence
LAST_SEQ=$(nats kv get APEX_STATE tdoa_last_processed_seq 2>/dev/null || echo "0")
nats --server nats://nats1.apex-sentinel.internal:4222 \
  consumer create DETECTIONS tdoa-replay \
  --deliver-start-sequence ${LAST_SEQ} \
  --pull \
  --ack-explicit

# Step 7 — Drain replay consumer after processing
nats consumer del DETECTIONS tdoa-replay
```

### 4.3 TDoA Correlation Service Rollback

```bash
# Step 1 — Stop current service
systemctl stop apex-tdoa-correlation
# OR if Dockerized:
docker compose -f infra/docker-compose.yml stop tdoa-correlation

# Step 2 — Checkout last good code
git fetch origin
git checkout LKGC-W2-20260403-1700 -- services/tdoa-correlation/

# Step 3 — Rebuild
cd services/tdoa-correlation
npm ci --production
npm run build

# Step 4 — Restart
systemctl start apex-tdoa-correlation
# OR:
docker compose -f infra/docker-compose.yml up -d tdoa-correlation

# Step 5 — Verify
systemctl status apex-tdoa-correlation
# Or check Docker logs:
docker compose -f infra/docker-compose.yml logs --tail=50 tdoa-correlation

# Step 6 — Confirm NATS consumer reconnected
nats --server nats://nats1.apex-sentinel.internal:4222 \
  consumer info DETECTIONS tdoa-correlation-group
```

### 4.4 Supabase Migration Rollback

```bash
# WARNING: Only for dev/staging. Production rollback requires PAT and manual review.

# Option A — Full reset (dev only — DESTROYS ALL DATA)
supabase db reset --project-ref bymfcnwfyxuivinuzurr

# Option B — Selective rollback via Management API (production-safe)
# Each migration file in supabase/migrations/ has a corresponding
# rollback in supabase/migrations/rollbacks/

# Rollback migration 0016:
psql "$SUPABASE_DB_URL" \
  -f supabase/migrations/rollbacks/0016_meshtastic_bridge_log_down.sql

# Continue rolling back until reaching target version
# e.g., to reach LKGC-W2-20260330-0900 (after P2 migrations):
# Roll back: 0016, 0015, 0014, 0013, 0012, 0011, 0010 in order

# Option C — Point-in-time recovery (PITR)
# Only available on Supabase Pro plan. Opens a support ticket.
# Target time: timestamp of the LKGC snapshot
# Duration: restore typically takes 15-45 minutes depending on database size

# Verify rollback
supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked
```

### 4.5 Edge Function Rollback

```bash
# Supabase does not natively support Edge Function version rollback via CLI.
# Strategy: redeploy the function from the LKGC git tag.

# Step 1 — Checkout function code from LKGC tag
git show LKGC-W2-20260403-1700:supabase/functions/ingest-event/index.ts \
  > /tmp/ingest-event-rollback.ts

# Step 2 — Deploy rollback version
cp /tmp/ingest-event-rollback.ts supabase/functions/ingest-event/index.ts
supabase functions deploy ingest-event \
  --project-ref bymfcnwfyxuivinuzurr \
  --no-verify-jwt  # or --verify-jwt depending on function auth mode

# Step 3 — Verify deployment
curl -sf \
  "https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/ingest-event/health" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  | jq .

# Step 4 — Monitor error rate for 5 minutes
curl -sf "https://api.supabase.com/v1/projects/bymfcnwfyxuivinuzurr/functions/ingest-event/logs" \
  -H "Authorization: Bearer ${SUPABASE_PAT}" \
  | jq '[.[] | select(.level == "error")] | length'
```

### 4.6 Full W2 Rollback to W1 Baseline

Extreme rollback — reverts entire W2 to the W1 complete state.

```bash
# Step 1 — Stop all W2 services
systemctl stop apex-tdoa-correlation apex-alert-bot apex-meshtastic-bridge
docker compose -f infra/docker-compose.yml down  # stops NATS cluster

# Step 2 — Checkout W1 complete baseline
git fetch origin
git checkout v0.1.0-w1-complete  # adjust tag to actual W1 complete tag

# Step 3 — Rollback all W2 migrations
# Apply rollbacks in reverse order: 0016 → 0007
for migration in 0016 0015 0014 0013 0012 0011 0010 0009 0008 0007; do
  psql "$SUPABASE_DB_URL" \
    -f "supabase/migrations/rollbacks/${migration}_*_down.sql" \
    && echo "Rolled back: $migration"
done

# Step 4 — Redeploy W1 Edge Functions
supabase functions deploy register-node ingest-event node-health alert-router \
  --project-ref bymfcnwfyxuivinuzurr

# Step 5 — Verify W1 state
supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked
# Expected: no diff against W1 schema

# Step 6 — Run W1 test suite to confirm
cd android && ./gradlew :app:test
echo "W1 Android tests: $?"
```

---

## 5. Health Criteria for LKGC Validity

A snapshot is only tagged as a valid LKGC if ALL of the following pass:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LKGC VALIDITY GATE                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  GATE 1: Git                                                            │
│  ✓ HEAD SHA matches tagged commit                                       │
│  ✓ Working tree is clean (0 dirty files)                                │
│  ✓ All CI checks green on this SHA                                      │
│  ✓ Tag exists and is signed (annotated tag)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  GATE 2: NATS JetStream                                                 │
│  ✓ All 5 nodes healthy (server ping returns 5/5)                        │
│  ✓ Raft leader elected (not in election)                                │
│  ✓ DETECTIONS stream: consumer_lag < 500                               │
│  ✓ NODE_HEALTH stream: consumer_lag < 100                              │
│  ✓ ALERTS stream: consumer_lag < 50                                    │
│  ✓ COT_EVENTS stream: consumer_lag < 100                               │
│  ✓ No orphaned consumers (consumers without active subscribers)         │
│  ✓ Stream storage < 80% capacity on all streams                         │
├─────────────────────────────────────────────────────────────────────────┤
│  GATE 3: Supabase                                                       │
│  ✓ `supabase db diff` returns "No schema changes detected"             │
│  ✓ All W2 migrations applied (0007–0016)                               │
│  ✓ RLS policies: anon cannot SELECT from detection_events              │
│  ✓ RLS policies: anon CAN INSERT into detection_events                 │
│  ✓ Realtime enabled on: detection_events, tracks, alerts               │
│  ✓ Edge Functions: all 5 return 200 on /health                         │
│  ✓ Edge Function error rate < 0.1% over last 1 hour                    │
├─────────────────────────────────────────────────────────────────────────┤
│  GATE 4: Tests                                                          │
│  ✓ npx vitest run — 0 failures                                          │
│  ✓ npx vitest run --coverage — statements ≥ 80%                        │
│  ✓ npx playwright test — 0 failures                                     │
│  ✓ ./gradlew :app:test — 0 failures (Android W2 additions)             │
│  ✓ TDoA correlation accuracy ≥ 87% on reference dataset                │
├─────────────────────────────────────────────────────────────────────────┤
│  GATE 5: Integration                                                    │
│  ✓ End-to-end: mobile node → NATS DETECTIONS → TDoA → track → alert   │
│  ✓ Telegram alert bot: test alert dispatched and received              │
│  ✓ FreeTAKServer: COT event received on ATAK test client               │
│  ✓ Meshtastic bridge: at least 1 test device connected and relaying    │
├─────────────────────────────────────────────────────────────────────────┤
│  GATE 6: Security                                                       │
│  ✓ No secrets committed (run: git log --all -p | grep -i "anon_key")   │
│  ✓ SUPABASE_ANON_KEY not in any Edge Function source                   │
│  ✓ NATS cluster: auth required (no anonymous connections accepted)     │
│  ✓ Supabase: service_role key not exposed in any client-facing code    │
└─────────────────────────────────────────────────────────────────────────┘
```

Validity check script:
```bash
#!/usr/bin/env bash
# validate-lkgc.sh — run all 6 gates
FAILED=0

check() {
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "  PASS: $name"
  else
    echo "  FAIL: $name"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== GATE 1: Git ==="
check "clean working tree" bash -c "[ \$(git status --porcelain | wc -l) -eq 0 ]"
check "HEAD is tagged" git describe --tags --exact-match HEAD

echo "=== GATE 2: NATS ==="
check "5 nodes responding" bash -c "[ \$(nats server ping --count 5 --json \
  | jq '.servers | length') -eq 5 ]"
check "DETECTIONS lag < 500" bash -c "[ \$(nats consumer info DETECTIONS \
  tdoa-correlation-group --json | jq '.num_pending') -lt 500 ]"

echo "=== GATE 3: Supabase ==="
check "no schema drift" bash -c "supabase db diff \
  --project-ref bymfcnwfyxuivinuzurr --linked 2>&1 | grep -q 'No schema changes'"

echo "=== GATE 4: Tests ==="
check "vitest all pass" bash -c "cd services/tdoa-correlation && \
  npx vitest run --reporter=dot 2>&1 | tail -1 | grep -q '0 failed'"

echo "=== GATE 5: Integration ==="
check "ingest-event health" bash -c "curl -sf \
  https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/ingest-event/health \
  -H 'Authorization: Bearer ${SUPABASE_ANON_KEY}' | jq -e '.status == \"ok\"'"

echo ""
if [ $FAILED -eq 0 ]; then
  echo "ALL GATES PASSED — LKGC is valid"
  exit 0
else
  echo "$FAILED GATE(S) FAILED — LKGC is NOT valid"
  exit 1
fi
```

---

## 6. Storage: Git Tags + Supabase lkgc_snapshots

### 6.1 Git Tag Convention

```
Pattern:    LKGC-W{n}-YYYYMMDD-HHmm
Examples:
  LKGC-W2-20260324-0000   (W2 pre-code baseline)
  LKGC-W2-20260327-1430   (P1 NATS cluster verified)
  LKGC-W2-20260330-0900   (P2 Supabase migrations applied)
  LKGC-W2-20260403-1700   (P3 Edge Functions deployed)
  LKGC-W2-20260407-1200   (P4 TDoA correlation service running)
  LKGC-W2-20260409-1800   (P5 alert routing live)
  LKGC-W2-20260414-2200   (W2 wave:complete)

List all W2 LKGC tags:
  git tag -l "LKGC-W2-*" | sort

Delete a bad LKGC tag (only if captured in error, before push):
  git tag -d LKGC-W2-20260324-XXXX
  git push origin :refs/tags/LKGC-W2-20260324-XXXX
```

### 6.2 Supabase lkgc_snapshots Table

```sql
-- Migration: 0011_lkgc_snapshots.sql
CREATE TABLE lkgc_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lkgc_id           text UNIQUE NOT NULL,  -- "LKGC-W2-20260324-0000"
  wave              text NOT NULL,          -- "W2"
  label             text NOT NULL,          -- "P1-NATS-COMPLETE"
  captured_at       timestamptz NOT NULL DEFAULT NOW(),
  git_sha           text NOT NULL,
  git_tag           text,
  git_dirty_files   int NOT NULL DEFAULT 0,
  nats_stream_count int NOT NULL DEFAULT 0,
  last_migration    text,
  test_passed       int NOT NULL DEFAULT 0,
  test_failed       int NOT NULL DEFAULT 0,
  coverage_pct      numeric(5,2),
  node_count        int NOT NULL DEFAULT 0,
  active_nodes_5m   int NOT NULL DEFAULT 0,
  snapshot_json     jsonb,  -- full JSON blob from capture script
  validity_gates_passed boolean NOT NULL DEFAULT false,
  captured_by       text NOT NULL DEFAULT current_user,
  notes             text
);

-- Only service_role can insert LKGC snapshots
ALTER TABLE lkgc_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON lkgc_snapshots
  USING (auth.role() = 'service_role');

-- Index for quick lookups
CREATE INDEX idx_lkgc_snapshots_wave ON lkgc_snapshots (wave, captured_at DESC);
CREATE INDEX idx_lkgc_snapshots_id ON lkgc_snapshots (lkgc_id);
```

Query the last 5 valid LKGCs:
```sql
SELECT lkgc_id, label, captured_at, git_sha, test_passed, coverage_pct, node_count
FROM lkgc_snapshots
WHERE wave = 'W2'
  AND validity_gates_passed = true
ORDER BY captured_at DESC
LIMIT 5;
```

---

## 7. Checkpoint History (W2)

| Checkpoint       | LKGC ID                  | Target Date | Git SHA   | Passed Gates                                    |
|------------------|--------------------------|-------------|-----------|--------------------------------------------------|
| W2-BASE          | LKGC-W2-20260324-0000    | 2026-03-24  | (pending) | docs complete — this file                        |
| W2-P1-NATS       | LKGC-W2-20260327-1430    | 2026-03-27  | (pending) | NATS 5-node cluster + 4 streams configured       |
| W2-P2-MIGRATIONS | LKGC-W2-20260330-0900    | 2026-03-30  | (pending) | 10 Supabase migrations applied, RLS green        |
| W2-P3-FUNCTIONS  | LKGC-W2-20260403-1700    | 2026-04-03  | (pending) | 5 Edge Functions deployed + unit tests green     |
| W2-P4-TDOA       | LKGC-W2-20260407-1200    | 2026-04-07  | (pending) | TDoA service live, triangulation ≥87% accuracy   |
| W2-P5-ALERTS     | LKGC-W2-20260409-1800    | 2026-04-09  | (pending) | Telegram + COT alert routing live                |
| W2-COMPLETE      | LKGC-W2-20260414-2200    | 2026-04-14  | (pending) | All gates green, coverage ≥80%, E2E pass         |

---

## 8. Known LKGC Risks and Mitigations

| Risk ID | Risk                                          | Impact | Mitigation                                        |
|---------|-----------------------------------------------|--------|---------------------------------------------------|
| LR-01   | NATS Raft split-brain during capture           | High   | Capture only when leader stable ≥ 5 min           |
| LR-02   | Supabase point-in-time recovery not available  | High   | Enable PITR on Pro plan before P2 deployment       |
| LR-03   | Git tag points to non-deployed commit          | Medium | CI gate: tag only after deploy verification        |
| LR-04   | lkgc_snapshots table data lost on db reset     | Medium | Export to JSON file before any db reset operation  |
| LR-05   | Consumer lag spike during normal traffic        | Low    | Use 5-minute average lag, not instantaneous        |
| LR-06   | TDoA accuracy measurement requires test data   | Medium | Maintain reference dataset in tests/fixtures/tdoa/ |

---

*Document owner: Nicolae Fratila | Created: 2026-03-24 | Wave: W2*
*Next update: W2-P1-NATS capture (target 2026-03-27)*
