# APEX-SENTINEL W5 — DEPLOY CHECKLIST
## W5 | PROJECTAPEX Doc 15/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Target: fortress VM (94.176.2.48 | Tailscale 100.68.152.56)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## PRE-DEPLOYMENT GATES (ALL MUST PASS)

```
[ ] npx vitest run --coverage  → ≥85 tests pass, ≥80% coverage all axes
[ ] npx tsc --noEmit           → zero TypeScript errors
[ ] npm run build              → clean build (no warnings treated as errors)
[ ] E2E suite passes           → docker-compose up + npx vitest run tests/e2e/
[ ] git tag v5.0.0-w5-lkgc    → LKGC captured before deploy
[ ] LKGC row inserted in Supabase lkgc_snapshots
[ ] 3 Supabase migrations reviewed and approved
[ ] W4 dashboard polyline integration smoke-tested on staging
```

---

## PHASE 1 — REPOSITORY PREP

```
Step 1.1 — Final commit on main
  git add -p                        # review each hunk
  git commit -m "feat(w5): EKF + polynomial predictor microservice"
  git push origin main
  git tag v5.0.0-w5-lkgc
  git push origin v5.0.0-w5-lkgc

Step 1.2 — Verify CI (if configured)
  gh run list --branch main --limit 3
  # Confirm latest run: status=completed, conclusion=success
  # If CI absent: manual verification only (proceed)

Step 1.3 — LKGC capture
  # Record in Supabase:
  INSERT INTO lkgc_snapshots (wave, git_sha, test_count, deployed_at, notes)
  VALUES ('W5', '<git rev-parse HEAD>', 482, now(), 'Pre-deploy LKGC');
```

---

## PHASE 2 — SUPABASE MIGRATIONS

```
Step 2.1 — Apply migration 005
  Method: Supabase Management API (PAT required — per CLAUDE.md rule 10)

  supabase db push --project-ref bymfcnwfyxuivinuzurr
  # OR via MCP tool:
  # mcp__supabase__apply_migration(project_id="bymfcnwfyxuivinuzurr",
  #   name="005_ekf_predicted_trajectory",
  #   query=<contents of supabase/migrations/005_ekf_predicted_trajectory.sql>)

  Verify:
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'tracks'
    AND column_name IN ('predicted_trajectory','prediction_updated_at',
                        'ekf_state','ekf_covariance_trace');
  # Expect: 4 rows returned

Step 2.2 — Apply migration 006
  supabase db push --project-ref bymfcnwfyxuivinuzurr

  Verify:
  SELECT COUNT(*) FROM ekf_track_events;   -- should return 0 (empty, new table)
  SELECT indexname FROM pg_indexes WHERE tablename = 'ekf_track_events';
  # Expect: idx_ekf_track_events_track_id present

Step 2.3 — Apply migration 007
  Verify:
  SELECT config_key, config_value FROM ekf_config ORDER BY config_key;
  # Expect: 7 rows (maneuver_spectral_density, sigma_*, track_dropout_seconds,
  #          confidence_gate, prediction_lambda)

Step 2.4 — Deploy Edge Functions
  supabase functions deploy get-track-predictions \
    --project-ref bymfcnwfyxuivinuzurr
  supabase functions deploy get-ekf-health \
    --project-ref bymfcnwfyxuivinuzurr

  Verify:
  curl -H "Authorization: Bearer <service_role_key>" \
    "https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/get-ekf-health"
  # Expect: 200 OK (may return zero counts — service not running yet)
```

---

## PHASE 3 — FORTRESS VM PREPARATION

```
SSH access:
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56  (Tailscale — always works)
  # fail2ban is active — NEVER use public IP directly

Step 3.1 — Verify Node.js version
  node --version   # Must be v20.x.x LTS
  # If not: nvm install 20 && nvm use 20 && nvm alias default 20

Step 3.2 — Verify NATS connectivity
  nats sub sentinel.detections.correlated --count=1 --timeout=5s
  # Should connect without error (even if no messages)
  # NATS cluster: nats1.apex-sentinel.internal:4222
  # If DNS fails: use 10.0.0.10:4222 (internal NATS IP — check /etc/hosts)

Step 3.3 — Create application directory
  mkdir -p /opt/apex-sentinel/ekf
  mkdir -p /etc/apex-sentinel

Step 3.4 — Create environment file (from vault — NEVER hardcode keys)
  # Read SUPABASE_SERVICE_ROLE_KEY from fortress vault:
  vault kv get -field=value secret/apex-sentinel/supabase-service-role-key
  # OR from systemd credential (if using systemd-creds):
  # systemd-creds encrypt --name=supabase-key -

  cat > /etc/apex-sentinel/ekf.env << 'EOF'
  NATS_URL=nats://nats1.apex-sentinel.internal:4222
  NATS_STREAM=SENTINEL
  NATS_CONSUMER_NAME=ekf-predictor
  NATS_DETECTION_SUBJECT=sentinel.detections.>
  NATS_PREDICTION_SUBJECT_PREFIX=sentinel.predictions
  SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<from vault>
  EKF_MANEUVER_SPECTRAL_DENSITY=0.1
  EKF_SIGMA_LAT_DEG=0.00005
  EKF_SIGMA_LON_DEG=0.00005
  EKF_SIGMA_ALT_M=10.0
  EKF_TRACK_DROPOUT_SECONDS=15
  EKF_CONFIDENCE_GATE=0.4
  HEALTH_PORT=9090
  ONNX_MODEL_PATH=
  LOG_LEVEL=info
  NODE_ENV=production
  EOF

  chmod 600 /etc/apex-sentinel/ekf.env
  chown root:root /etc/apex-sentinel/ekf.env

Step 3.5 — Clone / pull latest code
  cd /opt/apex-sentinel/ekf
  git clone git@github.com:nico/apex-sentinel.git . 2>/dev/null \
    || git pull origin main
  git checkout v5.0.0-w5-lkgc

Step 3.6 — Install dependencies (production only)
  npm ci --omit=dev
  # Verify: node_modules/@nats-io and @supabase present
  ls node_modules | grep -E "nats|supabase"
```

---

## PHASE 4 — SYSTEMD SERVICE INSTALLATION

```
Step 4.1 — Copy unit file
  cp /opt/apex-sentinel/ekf/infra/systemd/apex-sentinel-ekf.service \
     /etc/systemd/system/apex-sentinel-ekf.service

Step 4.2 — Review unit file (critical settings)
  cat /etc/systemd/system/apex-sentinel-ekf.service

  MUST VERIFY:
  ✓ Restart=on-failure          (NOT Restart=always — restart storm prevention)
  ✓ RestartSec=10               (10s back-off before retry)
  ✓ ExecStart uses timeout 300  (prevents eternal hang — CLAUDE.md rule)
  ✓ EnvironmentFile=/etc/apex-sentinel/ekf.env
  ✓ User=apex-sentinel (or root if service user not configured)
  ✓ WorkingDirectory=/opt/apex-sentinel/ekf

Step 4.3 — Reload systemd and enable
  systemctl daemon-reload
  systemctl enable apex-sentinel-ekf.service

Step 4.4 — Start service
  systemctl start apex-sentinel-ekf.service
  sleep 5
  systemctl status apex-sentinel-ekf.service
  # Expect: Active: active (running)

  # Check journal for startup errors:
  journalctl -u apex-sentinel-ekf.service -n 50 --no-pager
  # Look for:
  #   [INFO] NATS connected to nats://nats1.apex-sentinel.internal:4222
  #   [INFO] Bootstrapped X confirmed tracks from Supabase
  #   [INFO] Health server listening on 127.0.0.1:9090
  #   [INFO] NATS consumer ready: ekf-predictor
```

---

## PHASE 5 — HEALTH VERIFICATION

```
Step 5.1 — HTTP health check
  curl -s http://127.0.0.1:9090/health | jq .

  Expected response:
  {
    "status": "ok",
    "activeTracks": 0,         -- will grow as detections arrive
    "natsConnected": true,
    "supabaseReachable": true,
    "uptimeSeconds": <N>,
    "processedTotal": 0,
    "natsConsumerLag": 0,
    "lastProcessedAt": null
  }

  FAIL if: natsConnected=false OR supabaseReachable=false → check ENV vars

Step 5.2 — NATS consumer verification
  nats consumer info SENTINEL ekf-predictor
  # Expect:
  #   Consumer Name:          ekf-predictor
  #   Stream Name:            SENTINEL
  #   Filter Subject:         sentinel.detections.>
  #   Num Pending:            <current backlog — should be ≤100>
  #   Num Redelivered:        0  (or small number from service restart)

Step 5.3 — Inject synthetic test message
  # Publish a synthetic detection to NATS:
  nats pub sentinel.detections.correlated '{
    "trackId": "test-track-deploy-001",
    "lat": 51.5074,
    "lon": -0.1278,
    "alt": 120.0,
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
    "nodeIds": ["node-01","node-02","node-03"],
    "correlationScore": 0.92
  }'

  sleep 2

  # Verify NATS prediction published:
  nats sub sentinel.predictions.test-track-deploy-001 --count=1 --timeout=10s
  # Expect: JSON with horizons array (5 entries) — may not have impact estimate
  #         on single measurement (not enough history for polynomial fit)

  # Verify Supabase write:
  # SELECT predicted_trajectory, prediction_updated_at
  # FROM tracks WHERE id = 'test-track-deploy-001';
  # (Only if test-track-deploy-001 exists in tracks table)

Step 5.4 — W4 Dashboard smoke test
  # Open dashboard.apex-sentinel.io in browser (operator credentials)
  # Navigate to a track with recent detections
  # Verify: CesiumJS polyline visible on globe (prediction trajectory overlay)
  # Verify: polyline fades in confidence (more transparent at +10s horizon)
  # This is a visual smoke test — not automated at deploy time

Step 5.5 — Confirm journal is clean (no ERROR level logs after 60s)
  journalctl -u apex-sentinel-ekf.service --since "-60s" -p err --no-pager
  # Expect: zero output (no errors)
```

---

## PHASE 6 — MONITORING SETUP

```
Step 6.1 — Journal log monitoring (systemd-native)
  # Log persistence on fortress:
  mkdir -p /var/log/journal  (enables persistent journal)
  systemctl restart systemd-journald

  # Log rotation: journal max disk use = 500MB (fortress VM 2GB RAM)
  # Edit /etc/systemd/journald.conf:
  SystemMaxUse=500M
  MaxFileSec=7day

Step 6.2 — NATS consumer lag alert
  # Add cron (fortress): check lag every 5 minutes
  # /opt/apex-sentinel/ekf/scripts/check-nats-lag.sh:
  LAG=$(nats consumer info SENTINEL ekf-predictor --json 2>/dev/null \
        | jq '.num_pending // 0')
  if [ "$LAG" -gt 100 ]; then
    curl -s -X POST "https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/send-alert" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -d "{\"type\":\"ekf_lag\",\"value\":$LAG}"
  fi

  # Cron entry (not PM2 — PM2 is DEAD per CLAUDE.md):
  */5 * * * * /opt/apex-sentinel/ekf/scripts/check-nats-lag.sh

Step 6.3 — Supabase Logs
  # Monitor via Supabase Dashboard → Logs → Edge Functions
  # Filter: function_name = 'get-track-predictions'
  # Alert on: error_rate > 5% over 5 min window

Step 6.4 — systemd watchdog (optional post-W5 hardening)
  # Add to unit file:
  WatchdogSec=30s
  # Service must call sd_notify("WATCHDOG=1") every 30s
  # Triggers restart if health check hangs
```

---

## PHASE 7 — ROLLBACK PROCEDURE

```
TRIGGER: health check fails, journal shows persistent errors, NATS lag >100 for >2min

Step R1 — Stop service immediately
  systemctl stop apex-sentinel-ekf.service
  systemctl disable apex-sentinel-ekf.service

  # EKF service is stateless (state in NATS + Supabase)
  # Stopping it does NOT lose track data — tracks persist in Supabase
  # W4 dashboard gracefully degrades: no prediction polylines, but tracks still show

Step R2 — Identify previous LKGC
  SELECT wave, git_sha, deployed_at, notes
  FROM lkgc_snapshots
  ORDER BY deployed_at DESC
  LIMIT 5;
  # Choose last known-good W5 SHA (or W4 LKGC if W5 never stabilized)

Step R3 — Redeploy previous version
  cd /opt/apex-sentinel/ekf
  git fetch origin
  git checkout <previous-lkgc-sha>
  npm ci --omit=dev
  systemctl enable apex-sentinel-ekf.service
  systemctl start apex-sentinel-ekf.service

  # Verify health within 30s:
  curl -s http://127.0.0.1:9090/health | jq .status

Step R4 — Supabase migration rollback (if needed)
  # Migrations 005-007 are additive (new columns + new tables)
  # They do NOT break W4 dashboard (W4 ignores predicted_trajectory columns)
  # Rollback only if migration caused query degradation:

  -- Migration 005 rollback (drops predicted_trajectory):
  ALTER TABLE tracks
    DROP COLUMN IF EXISTS predicted_trajectory,
    DROP COLUMN IF EXISTS prediction_updated_at,
    DROP COLUMN IF EXISTS ekf_state,
    DROP COLUMN IF EXISTS ekf_covariance_trace;

  -- Migration 006 rollback:
  DROP TABLE IF EXISTS ekf_track_events;

  -- Migration 007 rollback:
  DROP TABLE IF EXISTS ekf_config;

  # NOTE: run rollback only if migrations are confirmed to be the cause

Step R5 — Record rollback in LKGC
  INSERT INTO lkgc_snapshots (wave, git_sha, deployed_at, notes)
  VALUES ('W5-ROLLBACK', '<previous-sha>', now(), 'Rolled back from <failed-sha>');
```

---

## DEPLOY CHECKLIST SIGN-OFF

```
Pre-deploy:
[ ] All unit tests pass (≥85)
[ ] TypeScript clean
[ ] Coverage ≥80%
[ ] E2E pass
[ ] Git tagged v5.0.0-w5-lkgc
[ ] LKGC in Supabase

Supabase:
[ ] Migration 005 applied and verified
[ ] Migration 006 applied and verified
[ ] Migration 007 applied and verified
[ ] Edge function get-track-predictions deployed
[ ] Edge function get-ekf-health deployed

Fortress VM:
[ ] Node.js 20 confirmed
[ ] NATS connectivity verified
[ ] env file written to /etc/apex-sentinel/ekf.env (600 perms)
[ ] Code at v5.0.0-w5-lkgc
[ ] npm ci --omit=dev clean

Systemd:
[ ] Unit file copied to /etc/systemd/system/
[ ] Restart=on-failure confirmed (NOT Restart=always)
[ ] timeout 300 in ExecStart confirmed
[ ] daemon-reload done
[ ] Service enabled and started

Health:
[ ] HTTP /health returns status=ok, natsConnected=true, supabaseReachable=true
[ ] NATS consumer lag ≤100
[ ] Synthetic message processed (NATS prediction published)
[ ] Journal clean (no ERROR level logs for 60s)
[ ] W4 dashboard shows prediction polylines (visual smoke test)

Sign-off: _______________________ Date: ___________
```
