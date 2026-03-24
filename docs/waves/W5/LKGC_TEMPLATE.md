# APEX-SENTINEL W5 — LKGC TEMPLATE
## W5 | PROJECTAPEX Doc 16/20 | 2026-03-24

> LKGC = Last Known Good Configuration
> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## LKGC Definition

An LKGC snapshot is captured at exactly two points:
1. Before deploy (pre-deploy baseline)
2. After successful health verification (post-deploy confirmation)

A snapshot that fails Phase 5 of DEPLOY_CHECKLIST is NOT a valid LKGC.
Only a post-verification snapshot may be used as a rollback target.

---

## LKGC Fields (W5)

```
field                         type        required  description
──────────────────────────────────────────────────────────────────────────────
wave                          TEXT        YES       'W5'
git_sha                       TEXT(40)    YES       full SHA from `git rev-parse HEAD`
git_tag                       TEXT        YES       'v5.0.0-w5-lkgc' (exact tag)
captured_at                   TIMESTAMPTZ YES       UTC timestamp of capture
captured_by                   TEXT        YES       'Nico' or automated script name
systemd_unit_state            TEXT        YES       output of `systemctl is-active apex-sentinel-ekf`
                                                    must be 'active'
systemd_unit_enabled          BOOLEAN     YES       `systemctl is-enabled apex-sentinel-ekf` = enabled
node_version                  TEXT        YES       e.g. 'v20.11.1'
nats_consumer_lag             INTEGER     YES       current pending message count in ekf-predictor
                                                    MUST be < 100 to qualify as LKGC
nats_connected                BOOLEAN     YES       from /health endpoint
supabase_reachable            BOOLEAN     YES       from /health endpoint
ekf_rmse_benchmark_m          FLOAT8      YES       RMSE of EKF position vs. synthetic truth
                                                    in meters — see benchmark procedure below
                                                    MUST be < 10.0 m to qualify
prediction_latency_p99_ms     FLOAT8      YES       99th percentile EKF→publish latency
                                                    MUST be < 200ms to qualify
supabase_migration_version    TEXT        YES       highest applied migration name
                                                    MUST be '007_ekf_config'
test_count                    INTEGER     YES       passing test count at this SHA
                                                    MUST be ≥ 482 (cumulative W1-W5)
coverage_branches_pct         FLOAT8      NO        branch coverage % from last vitest run
active_tracks_count           INTEGER     NO        snapshot of active tracks at capture time
uptime_seconds                INTEGER     NO        seconds since service start at capture
notes                         TEXT        NO        freeform, e.g. 'post-deploy 30min soak'
```

---

## Supabase lkgc_snapshots Schema

```sql
-- This table exists from W1 — no W5 migration needed
-- Verify it exists:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'lkgc_snapshots'
ORDER BY ordinal_position;

-- If column ekf_rmse_benchmark_m missing, add it:
ALTER TABLE lkgc_snapshots
  ADD COLUMN IF NOT EXISTS ekf_rmse_benchmark_m FLOAT8,
  ADD COLUMN IF NOT EXISTS prediction_latency_p99_ms FLOAT8,
  ADD COLUMN IF NOT EXISTS supabase_migration_version TEXT,
  ADD COLUMN IF NOT EXISTS nats_consumer_lag INTEGER,
  ADD COLUMN IF NOT EXISTS systemd_unit_state TEXT;
```

---

## EKF RMSE Benchmark Procedure

```
Purpose: Verify EKF accuracy against synthetic ground truth before accepting LKGC.

Benchmark script: scripts/ekf-benchmark.ts

Method:
  1. Generate synthetic drone trajectory: 60-second straight-line flight
     at 20m/s heading 45°, altitude 150m descending at 1m/s
     Position updates every 1.0s with Gaussian noise (σ=5m lat/lon, σ=10m alt)
     → 60 noisy measurements

  2. Feed measurements to EKFInstance with:
     - Cold start: first measurement initializes state, P = R × 10
     - process each subsequent measurement with predict(1.0) + update()

  3. Compare EKF state position to noise-free ground truth at each step

  4. Compute RMSE:
     RMSE = sqrt(mean((lat_ekf - lat_true)² + (lon_ekf - lon_true)² + (alt_ekf - alt_true)²))
     (converted to metres: Δlat_m = Δlat_deg × 111320,
                           Δlon_m = Δlon_deg × 111320 × cos(lat),
                           Δalt_m = Δalt)

Acceptance threshold: RMSE < 10.0 m
Typical expected result: 4-6 m RMSE (EKF noise rejection against 5m input noise)

Run benchmark:
  npx tsx scripts/ekf-benchmark.ts
  # Output: RMSE: X.XX m [PASS/FAIL]
```

---

## Prediction Latency P99 Measurement

```
Purpose: Verify end-to-end latency from detection receipt to NATS prediction publish.

Method:
  1. Ensure service is running with real NATS
  2. Inject 200 synthetic detection messages at 5Hz (one per track ID for simplicity)
  3. Each message carries t_sent = Date.now() in metadata field
  4. Service stamps t_published in prediction message
  5. Calculate latency = t_published - t_sent for each message
  6. Sort and take 99th percentile

Measurement script:
  scripts/measure-prediction-latency.ts
  # Requires: NATS running, service running, 200 test messages
  # Output: P50: XXms, P95: XXms, P99: XXms [PASS/FAIL vs 200ms]

Acceptance threshold: P99 < 200ms
Typical expected: P50 ~15ms, P95 ~40ms, P99 ~80ms
(Dominated by NATS round-trip ~5ms + Supabase upsert ~20-50ms + EKF ~1ms)
```

---

## LKGC Capture Script

```bash
#!/usr/bin/env bash
# scripts/capture-lkgc.sh
# Run on fortress VM after successful deploy + health verification
# Usage: ./scripts/capture-lkgc.sh [pre-deploy|post-deploy]

set -euo pipefail

PHASE="${1:-post-deploy}"
SUPABASE_URL="https://bymfcnwfyxuivinuzurr.supabase.co"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"  # from env

GIT_SHA=$(git rev-parse HEAD)
GIT_TAG=$(git describe --exact-match --tags HEAD 2>/dev/null || echo "untagged")
NODE_VER=$(node --version)
SYSTEMD_STATE=$(systemctl is-active apex-sentinel-ekf.service 2>/dev/null || echo "inactive")
SYSTEMD_ENABLED=$(systemctl is-enabled apex-sentinel-ekf.service 2>/dev/null || echo "disabled")
NATS_LAG=$(nats consumer info SENTINEL ekf-predictor --json 2>/dev/null \
           | jq '.num_pending // -1' || echo "-1")

# Get health data
HEALTH=$(curl -sf http://127.0.0.1:9090/health 2>/dev/null || echo '{}')
NATS_CONNECTED=$(echo "$HEALTH" | jq '.natsConnected // false')
SUPABASE_OK=$(echo "$HEALTH" | jq '.supabaseReachable // false')
ACTIVE_TRACKS=$(echo "$HEALTH" | jq '.activeTracks // 0')
UPTIME=$(echo "$HEALTH" | jq '.uptimeSeconds // 0')

# Run benchmark (only for post-deploy)
EKF_RMSE="null"
P99_LATENCY="null"
if [ "$PHASE" = "post-deploy" ]; then
  EKF_RMSE=$(npx tsx scripts/ekf-benchmark.ts --json 2>/dev/null | jq '.rmse_m' || echo "null")
  P99_LATENCY=$(npx tsx scripts/measure-prediction-latency.ts --json 2>/dev/null \
                | jq '.p99_ms' || echo "null")
fi

# Get highest applied migration
MIGRATION_VER=$(curl -sf -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/schema_migrations?select=version&order=version.desc&limit=1" \
  2>/dev/null | jq -r '.[0].version // "unknown"')

# Get test count from last run (read from coverage summary if available)
TEST_COUNT=$(cat coverage/coverage-summary.json 2>/dev/null \
  | jq '.total.lines.covered // 0' || echo "0")

PAYLOAD=$(cat <<EOF
{
  "wave": "W5",
  "git_sha": "$GIT_SHA",
  "git_tag": "$GIT_TAG",
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "captured_by": "capture-lkgc.sh ($PHASE)",
  "systemd_unit_state": "$SYSTEMD_STATE",
  "systemd_unit_enabled": $([ "$SYSTEMD_ENABLED" = "enabled" ] && echo true || echo false),
  "node_version": "$NODE_VER",
  "nats_consumer_lag": $NATS_LAG,
  "nats_connected": $NATS_CONNECTED,
  "supabase_reachable": $SUPABASE_OK,
  "ekf_rmse_benchmark_m": $EKF_RMSE,
  "prediction_latency_p99_ms": $P99_LATENCY,
  "supabase_migration_version": "$MIGRATION_VER",
  "active_tracks_count": $ACTIVE_TRACKS,
  "uptime_seconds": $UPTIME,
  "notes": "$PHASE LKGC capture"
}
EOF
)

echo "Inserting LKGC snapshot..."
RESPONSE=$(curl -sf -X POST \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  "$SUPABASE_URL/rest/v1/lkgc_snapshots" \
  -d "$PAYLOAD")

echo "LKGC captured."
echo "SHA: $GIT_SHA"
echo "Tag: $GIT_TAG"
echo "Systemd state: $SYSTEMD_STATE"
echo "NATS lag: $NATS_LAG"
echo "EKF RMSE: ${EKF_RMSE}m"
echo "P99 latency: ${P99_LATENCY}ms"

# Validate LKGC thresholds
FAIL=0
[ "$SYSTEMD_STATE" != "active" ] && echo "FAIL: systemd not active" && FAIL=1
[ "$NATS_CONNECTED" != "true" ]  && echo "FAIL: NATS not connected"  && FAIL=1
[ "$SUPABASE_OK" != "true" ]     && echo "FAIL: Supabase unreachable" && FAIL=1
if [ "$PHASE" = "post-deploy" ]; then
  (( $(echo "$NATS_LAG > 100" | bc -l) ))   && echo "FAIL: NATS lag >100" && FAIL=1
  (( $(echo "$EKF_RMSE > 10.0" | bc -l) )) && echo "FAIL: EKF RMSE >10m" && FAIL=1
  (( $(echo "$P99_LATENCY > 200" | bc -l) )) && echo "FAIL: P99 >200ms" && FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "LKGC VALID — all thresholds passed"
  exit 0
else
  echo "LKGC INVALID — one or more thresholds failed"
  exit 1
fi
```

---

## LKGC Rollback Decision Tree

```
Production incident detected
         │
         ▼
Is service running?
├── NO  → systemctl start → wait 30s → health check
│         If still fail → proceed to rollback
└── YES → Check journal: journalctl -u apex-sentinel-ekf -n 100

         │
         ▼
Error type?
├── NATS lag >100 → restart service: systemctl restart apex-sentinel-ekf
│   Wait 60s — if lag recovers → NOT a code bug → log and monitor
│
├── EKF divergence (RMSE spikes in logs) → check q_c:
│   Update ekf_config in Supabase: maneuver_spectral_density → 1.0
│   Restart service — if resolved: tuning issue, not rollback
│
├── Supabase unreachable → check SUPABASE_SERVICE_ROLE_KEY in env
│   If key expired: regenerate in Supabase dashboard, update env, restart
│
├── Persistent crashes (ExecStart fails >3 times in 5min) → ROLLBACK
│
└── Memory/CPU exhaustion (OOM kill) → check active track count
    If tracks >500: reduce EKF_TRACK_DROPOUT_SECONDS to 5 and restart

Rollback procedure: DEPLOY_CHECKLIST.md Phase 7 (steps R1-R5)
```

---

## LKGC History (to be filled at deploy time)

```
Version   SHA        Tag                    Captured              RMSE   P99   State
──────────────────────────────────────────────────────────────────────────────────────
W4        <sha>      v4.0.0-w4-lkgc        2026-XX-XX            N/A    N/A   VALID
W5-pre    <sha>      v5.0.0-w5-lkgc        PENDING               N/A    N/A   PENDING
W5-post   <sha>      v5.0.0-w5-lkgc        PENDING               <Xm>   <Yms> PENDING
```

---

## LKGC Schedule (Ongoing Operations)

```
Capture schedule after initial deploy:
  - Immediately post-deploy (automated via capture-lkgc.sh post-deploy)
  - After any configuration change to ekf_config table
  - After each model update (when ONNX model deployed post-W5)
  - Weekly: if system stable, capture operational LKGC as baseline refresh
  - Before any Supabase schema change

Retention:
  - Keep all LKGC snapshots in Supabase indefinitely (small rows)
  - Keep last 3 valid LKGC git tags as branches: lkgc/v5-N
  - Archive older than 90 days to notes field: "archived LKGC"
```

---

## LKGC Benchmark Acceptance Matrix

```
Metric                      Threshold    Rationale
──────────────────────────────────────────────────────────────────────────────
EKF RMSE (m)                < 10.0 m     TdoaCorrelator noise floor ~5m CEP;
                                         EKF should reduce, not amplify noise
Prediction P99 latency      < 200ms      Full detection→publish pipeline SLA
                                         (EKF internal budget: 30ms of 200ms)
NATS consumer lag           < 100 msgs   At 5Hz × 20 tracks = 100 msgs/s;
                                         lag < 100 = < 1s behind real-time
systemd state               active       Service must be running at capture time
Supabase migration version  007          All 3 W5 migrations applied
Cumulative test count       ≥ 482        All 5 waves, all tests passing
Coverage branches           ≥ 80%        Per wave-formation TDD law
```

---

## LKGC: Multi-Wave Snapshot Comparison

Used to detect regressions between waves. After W5 LKGC is captured:

```
Wave  Test Count  EKF RMSE  P99 Latency  Migration  Notes
──────────────────────────────────────────────────────────────────
W1    102         N/A        N/A          001         On-device pipeline
W2    159         N/A        N/A          003         NATS + TdoaCorrelator
W3    342         N/A        N/A          003         Mobile app
W4    397         N/A        N/A          004         C2 dashboard
W5    ≥482        <10m       <200ms       007         EKF microservice FINAL
──────────────────────────────────────────────────────────────────
Regression check: test count must be monotonically increasing across waves.
If W5 LKGC shows fewer passing tests than W4 LKGC → block deploy → investigate.
```

---

## LKGC Automation Integration

The capture script integrates with the wave-formation.sh complete phase:

```bash
# In wave-formation.sh complete W5 (relevant section):
# After running verification gates:

echo "[wave-formation] Running LKGC capture..."
./scripts/capture-lkgc.sh post-deploy
LKGC_EXIT=$?

if [ $LKGC_EXIT -ne 0 ]; then
  echo "[wave-formation] LKGC capture FAILED — wave-formation complete W5 blocked"
  echo "Fix all failing thresholds before declaring W5 complete."
  exit 1
fi

echo "[wave-formation] LKGC captured successfully — W5 COMPLETE"
git tag v5.0.0-w5-lkgc
git push origin v5.0.0-w5-lkgc
```

---

## LKGC Incident Response Reference

```
If the LKGC script fails during post-deploy capture:

Failure: EKF RMSE > 10m
  → Check: what was the synthetic trajectory used for benchmark?
  → Verify: NATS cluster delivered all 60 test messages (no loss)
  → Check: EKFInstance q_c config — if too large, EKF over-trusts maneuver noise
  → Fix: tune maneuver_spectral_density in ekf_config table, restart, re-run benchmark

Failure: P99 latency > 200ms
  → Check: NATS round-trip time: ping nats1.apex-sentinel.internal
  → Check: Supabase write blocking the loop (should be fire-and-forget)
  → Check: Node.js GC pauses under load (add --expose-gc flag, monitor GC events)
  → Fix: confirm Supabase writes are non-blocking in PredictionPublisher

Failure: NATS consumer lag > 100
  → Check: how many tracks active? If > 50, pull consumer needs tuning
  → Fix: increase maxMessages per fetch from 10 to 50 in NatsClient config
  → After fix: restart service, wait 30s, re-check: nats consumer info SENTINEL ekf-predictor

Failure: systemd state != active
  → Check: journalctl -u apex-sentinel-ekf -n 100 --no-pager
  → Common causes: NATS_URL unreachable, SUPABASE_SERVICE_ROLE_KEY missing/invalid
  → Fix: verify /etc/apex-sentinel/ekf.env contents, restart service
```
