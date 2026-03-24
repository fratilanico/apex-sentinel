# APEX-SENTINEL — Deploy Checklist
## W2 | PROJECTAPEX Doc 14/21 | 2026-03-24

---

## Operator Notes

- Run each section in sequence. Do not skip sections.
- Record each ✓/✗ in this document or in the deployment log.
- If any step marked CRITICAL fails, STOP and execute the rollback procedure for that section before proceeding.
- All SSH to NATS nodes via Tailscale or WireGuard — never direct public IP (fail2ban blocks).
- Supabase DDL via Management API with PAT — never via REST/anon key.
- `Restart=on-failure` on all worker systemd units — NEVER `Restart=always`.
- Include `timeout 300` wrapper before any `claude` invocations in worker loops.

---

## Section 0 — Pre-Deploy Checks

Execute before any deployment activity. All items must pass before proceeding to Section 1.

### 0.1 Environment Variables Verified
```bash
# On each deployment host:
[ -f .env ] && echo "OK" || echo "MISSING .env"
grep -qE "^SUPABASE_URL=https://" .env && echo "SUPABASE_URL OK" || echo "FAIL"
grep -qE "^NATS_URL=nats://" .env && echo "NATS_URL OK" || echo "FAIL"
grep -qE "^TELEGRAM_BOT_TOKEN=" .env && echo "TELEGRAM OK" || echo "FAIL"
grep -qE "^NATS_CREDS_PATH=" .env && echo "NATS_CREDS OK" || echo "FAIL"
```
- [ ] All variables present and non-empty

### 0.2 TLS Certificate Validity
```bash
# Check NATS CA cert validity (must be >14 days remaining)
openssl x509 -in infra/nats/certs/ca.crt -noout -dates
openssl x509 -in infra/nats/certs/ca.crt -noout -checkend 1209600 && echo "CA cert OK (>14 days)" || echo "CRITICAL: CA cert expires soon"

# Check each node cert (node-1 through node-5)
for i in 1 2 3 4 5; do
  openssl x509 -in infra/nats/node-$i/node.crt -noout -checkend 1209600 \
    && echo "node-$i cert OK" \
    || echo "CRITICAL: node-$i cert expires within 14 days"
done
```
- [ ] CA cert valid >14 days
- [ ] All 5 node certs valid >14 days

### 0.3 Supabase Migrations Dry-Run
```bash
# Against local Supabase (must be running)
supabase start
supabase db push --dry-run 2>&1 | tail -20
# Must show "No pending migrations" or list migrations to apply with no errors
```
- [ ] Dry-run exits 0
- [ ] No destructive operations listed (no DROP TABLE, no DROP COLUMN without review)

### 0.4 Supabase Project Reachable
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/nodes?limit=1"
# Must return 200
```
- [ ] Returns HTTP 200

### 0.5 Git Status Clean
```bash
git status --short
git log --oneline -3
```
- [ ] No uncommitted changes on deployment branch
- [ ] `main` branch at expected commit hash: ______________________
- [ ] Remote `origin/main` is at same hash (no unpushed commits)

### 0.6 NATS CLI Installed and Configured
```bash
nats --version   # must be >=0.1.4
nats server check --server nats://localhost:4222 2>&1 || echo "Not yet running (OK for pre-deploy)"
```
- [ ] NATS CLI installed

### 0.7 Mind-the-Gap Pre-Deploy Dimension Check
```bash
# Run mind-the-gap check against W2 docs
grep -r "cesium\|Gate4\|LSTM\|mobile app\|React Native" src/ && echo "SCOPE CREEP DETECTED" || echo "Scope clean"
npx tsc --noEmit && echo "TypeScript OK" || echo "FAIL: TypeScript errors"
```
- [ ] No W3 scope leaked into W2 src/
- [ ] TypeScript compilation clean

---

## Section 1 — NATS Cluster Deployment

### 1.1 Node-1 Bootstrap (CRITICAL)

**Start node-1 first. Do not start other nodes until node-1 is healthy.**

```bash
# SSH to NATS node-1 (Tailscale)
ssh -i ~/.ssh/azure_apex_os root@<nats-node-1-tailscale-ip>

# Copy config
scp infra/nats/node-1/nats-server.conf root@<nats-node-1-ip>:/etc/nats/sentinel.conf
scp infra/nats/certs/ca.crt root@<nats-node-1-ip>:/etc/nats/certs/ca.crt
scp infra/nats/node-1/node.crt root@<nats-node-1-ip>:/etc/nats/certs/node.crt
scp infra/nats/node-1/node.key root@<nats-node-1-ip>:/etc/nats/certs/node.key
chmod 600 /etc/nats/certs/node.key

# Start NATS (systemd)
systemctl enable nats-server
systemctl start nats-server
systemctl status nats-server | grep "Active:"
# Must show: Active: active (running)

# Verify JetStream
nats --server nats://localhost:4222 --tlscert /etc/nats/certs/node.crt \
  --tlskey /etc/nats/certs/node.key --tlsca /etc/nats/certs/ca.crt \
  server info | grep -i "jetstream"
# Must show: JetStream: enabled
```
- [ ] node-1 nats-server.service active (running)
- [ ] JetStream enabled
- [ ] No TLS errors in systemd journal (`journalctl -u nats-server -n 50`)

**Rollback if node-1 fails to start:**
```bash
systemctl stop nats-server
journalctl -u nats-server -n 100 > /tmp/nats-node1-fail.log
# Check cert SANs match server hostname: openssl x509 -in node.crt -noout -text | grep DNS
# Common failure: server_name in config ≠ cert CN/SAN
```

### 1.2 Nodes 2 and 3 — Join Cluster

```bash
# Repeat for node-2 and node-3 (in sequence, not parallel)
for NODE in 2 3; do
  scp infra/nats/node-$NODE/nats-server.conf root@<nats-node-$NODE-ip>:/etc/nats/sentinel.conf
  # scp certs as above
  ssh root@<nats-node-$NODE-ip> "systemctl enable nats-server && systemctl start nats-server"
  sleep 5
  # Verify Raft sees N nodes
  nats server check cluster --expected $((NODE)) --server nats://localhost:4222 [--tls flags]
done
```
- [ ] node-2 active (running), Raft cluster size = 2
- [ ] node-3 active (running), Raft quorum achieved (leader elected), cluster size = 3

**Verify Raft leader after node-3:**
```bash
nats server report jetstream --server nats://<node-1>:4222 [--tls flags]
# Must show one node with "Leader: true" and all 3 nodes in Raft group
```
- [ ] Raft leader elected
- [ ] All 3 nodes in JetStream cluster report

### 1.3 Nodes 4 and 5 — Add Capacity

```bash
# Start node-4 and node-5 (can be parallel after quorum is confirmed)
for NODE in 4 5; do
  # scp config + certs
  ssh root@<nats-node-$NODE-ip> "systemctl enable nats-server && systemctl start nats-server"
done
sleep 10

nats server check cluster --expected 5 --server nats://<node-1>:4222 [--tls flags]
# Must show: Cluster OK
```
- [ ] node-4 active
- [ ] node-5 active
- [ ] `nats server check cluster --expected 5` returns OK

### 1.4 Stream Creation (CRITICAL)

**Run after all 5 nodes are healthy.**

```bash
./scripts/nats-streams-init.sh --server nats://<node-1>:4222 [--tls flags]
# Script output must show "Created" or "Already exists" for all 9 streams (8 + DLQ)
```

Verify:
```bash
nats stream ls --server nats://<node-1>:4222 [--tls flags]
# Must list: SENTINEL_EVENTS, SENTINEL_AUDIO_META, SENTINEL_TELEMETRY,
#            SENTINEL_TRACKS, SENTINEL_ALERTS, SENTINEL_NODE_REGISTRY,
#            SENTINEL_MESH_RELAY, SENTINEL_TDOA_WINDOWS, SENTINEL_DLQ
```
- [ ] All 9 streams listed
- [ ] Each stream shows Replicas: 3

### 1.5 Consumer Group Creation

```bash
# Consumer groups (durable) for each service
nats consumer add SENTINEL_TDOA_WINDOWS tdoa-workers \
  --ack=explicit --deliver=new --max-deliver=5 --ack-wait=30s \
  --server nats://<node-1>:4222 [--tls flags]

nats consumer add SENTINEL_TRACKS track-manager \
  --ack=explicit --deliver=new --max-deliver=5 --ack-wait=30s \
  [--server ...]

nats consumer add SENTINEL_ALERTS alert-router \
  --ack=explicit --deliver=new --max-deliver=3 --ack-wait=15s \
  [--server ...]

nats consumer add SENTINEL_MESH_RELAY mesh-ingest \
  --ack=explicit --deliver=new --max-deliver=5 --ack-wait=30s \
  [--server ...]
```
- [ ] tdoa-workers consumer created
- [ ] track-manager consumer created
- [ ] alert-router consumer created
- [ ] mesh-ingest consumer created

### 1.6 NATS Cluster Health Baseline

```bash
nats server check cluster --expected 5 [--server ...] && echo "CLUSTER OK"
nats stream info SENTINEL_EVENTS [--server ...] | grep "State:"
# State: Messages: 0, Bytes: 0B, FirstSeq: 0, LastSeq: 0 (healthy empty stream)
```
- [ ] Cluster check passes
- [ ] All streams show empty state (no stale messages from previous runs)
- [ ] Prometheus NATS exporter scraping (curl http://<node-1>:7778/metrics | grep nats_)

**Section 1 NATS deployment complete.** Do not proceed to Section 2 if any CRITICAL item failed.

---

## Section 2 — Supabase Deployment

### 2.1 Migration Apply Sequence (CRITICAL)

```bash
# Apply to production Supabase project bymfcnwfyxuivinuzurr via CLI
# Requires SUPABASE_ACCESS_TOKEN (PAT) set in environment

export SUPABASE_ACCESS_TOKEN=<from-keychain>

# Dry-run first
supabase db push --db-url postgresql://postgres.<project-ref>:<password>@db.<project-ref>.supabase.co:5432/postgres --dry-run

# If dry-run clean:
supabase db push --db-url <connection-string>
```

Expected output (10 migrations applied in order):
```
Applying migration 001_nodes.sql...OK
Applying migration 002_detection_events.sql...OK
Applying migration 003_tdoa_windows.sql...OK
Applying migration 004_tracks.sql...OK
Applying migration 005_alerts.sql...OK
Applying migration 006_mesh_topology.sql...OK
Applying migration 007_node_heartbeats.sql...OK
Applying migration 008_audit_log.sql...OK
Applying migration 009_functions.sql...OK
Applying migration 010_retention.sql...OK
```
- [ ] All 10 migrations applied with no errors
- [ ] No migration rolled back

**Rollback if migration fails mid-sequence:**
```bash
# Identify failed migration
supabase migration list --db-url <connection-string>
# For each failed migration, apply the corresponding down migration:
psql <connection-string> -f supabase/migrations/<N>_<name>.down.sql
# Verify table state before re-attempting
```

### 2.2 RLS Policy Verification

```bash
# Test anon role cannot read restricted rows
psql <connection-string> << 'EOF'
SET ROLE anon;
SELECT count(*) FROM nodes;               -- must return 0 (no rows visible to anon)
SELECT count(*) FROM detection_events;    -- must return 0
SELECT lat_exact FROM tracks LIMIT 1;     -- must fail with permission denied
EOF
```
- [ ] `nodes` returns 0 rows for anon role
- [ ] `detection_events` returns 0 rows for anon role
- [ ] `lat_exact` column access denied for anon role

```bash
# Test service role has full access
psql <connection-string> << 'EOF'
SET ROLE service_role;
SELECT count(*) FROM nodes;               -- must return 0 (empty table, not blocked)
EXPLAIN SELECT lat_exact FROM tracks;     -- must show seq scan (not permission error)
EOF
```
- [ ] Service role can read all tables

### 2.3 pg_partman Verification

```bash
psql <connection-string> << 'EOF'
-- Verify detection_events partitioned
SELECT tablename FROM pg_tables WHERE tablename LIKE 'detection_events_%' ORDER BY tablename;
-- Should show at least 2 partitions (current month + next month pre-created)

-- Verify pg_cron job created
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'partman%';
-- Should show hourly maintenance job

-- Verify retention config
SELECT parent_table, retention FROM partman.part_config WHERE parent_table = 'public.detection_events';
-- retention: 90 days
EOF
```
- [ ] ≥2 detection_events partitions visible
- [ ] pg_cron maintenance job present, schedule = hourly
- [ ] retention = 90 days

### 2.4 Supabase Realtime Enable

```bash
# Verify Realtime enabled for required tables
# Check via Supabase dashboard or API:
curl -s -H "apikey: $SUPABASE_SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/rpc/get_realtime_publication_tables" \
  | jq '.[].table_name'
# Must include: detection_events, alerts, tracks, nodes
```
- [ ] `detection_events` in Realtime publication
- [ ] `alerts` in Realtime publication
- [ ] `tracks` in Realtime publication
- [ ] `nodes` in Realtime publication

### 2.5 Edge Function Deploy

```bash
# Deploy all 4 Edge Functions
supabase functions deploy register-node --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy ingest-event --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy node-health --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy alert-router --project-ref bymfcnwfyxuivinuzurr

# Set secrets
supabase secrets set NATS_WS_URL=wss://<nats-cluster>:8080 --project-ref bymfcnwfyxuivinuzurr
supabase secrets set NATS_OPERATOR_KEY=<from-keychain> --project-ref bymfcnwfyxuivinuzurr
supabase secrets set TELEGRAM_BOT_TOKEN=<from-keychain> --project-ref bymfcnwfyxuivinuzurr
supabase secrets set TELEGRAM_ALERTS_CHAT_ID=<id> --project-ref bymfcnwfyxuivinuzurr
supabase secrets set TELEGRAM_OPS_CHAT_ID=<id> --project-ref bymfcnwfyxuivinuzurr
supabase secrets set TELEGRAM_SYSTEM_CHAT_ID=<id> --project-ref bymfcnwfyxuivinuzurr
```
- [ ] register-node deployed (check: `supabase functions list` shows version ≥ 1)
- [ ] ingest-event deployed
- [ ] node-health deployed
- [ ] alert-router deployed
- [ ] All 6 secrets set in Supabase Vault

### 2.6 Edge Function Smoke Test

```bash
# register-node
curl -s -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"node_id":"deploy-smoke-001","tier":1,"lat":51.5,"lon":-0.1,"alt":10,"time_precision_us":1,"cert_fingerprint":"deadbeef","firmware_version":"2.0.0"}' \
  https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/register-node
# Expect: {"enrolled":true,"node_token":"...","nats_creds":"..."}
```
- [ ] register-node returns HTTP 200 with `enrolled: true`
- [ ] Response time < 2000ms (check `curl -w "%{time_total}"`)

```bash
# node-health
curl -s \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/node-health
# Expect: {"nodes":[{"node_id":"deploy-smoke-001","tier":1,...}]}
```
- [ ] node-health returns HTTP 200 with enrolled test node visible

**Rollback if Edge Function deploy fails:**
```bash
# List previous versions
supabase functions list --project-ref bymfcnwfyxuivinuzurr
# Re-deploy from last known good commit
git checkout <last-good-sha> -- supabase/functions/<function-name>/
supabase functions deploy <function-name> --project-ref bymfcnwfyxuivinuzurr
```

---

## Section 3 — Mesh Bridge Deployment

### 3.1 Meshtastic Firmware Version Check

```bash
# On each Tier-4 / mesh bridge node, verify firmware via Meshtastic Python CLI
python3 -c "
import meshtastic
from meshtastic.serial_interface import SerialInterface
i = SerialInterface()
print(i.myInfo.firmware_version)
i.close()
"
# Must output 2.3.x (x >= 0)
```
- [ ] All mesh hardware running firmware 2.3.x

### 3.2 MQTT Broker Start (Mosquitto)

```bash
# On mesh-bridge host
systemctl enable mosquitto
systemctl start mosquitto
systemctl status mosquitto | grep "Active:"
# Must show active (running)

# Verify MQTT listening
ss -tlnp | grep 1883
```
- [ ] Mosquitto active on port 1883

### 3.3 Mesh Bridge Service Start

```bash
# Copy .env to bridge host
scp .env root@<mesh-bridge-host>:/opt/sentinel-mesh-bridge/.env

# Install and start
systemctl enable sentinel-mesh-bridge
systemctl start sentinel-mesh-bridge
systemctl status sentinel-mesh-bridge | grep "Active:"

# Check MQTT subscription active
journalctl -u sentinel-mesh-bridge -n 20 | grep "Subscribed to msh/"
# Expect: Subscribed to msh/+/json/+/+
```
- [ ] sentinel-mesh-bridge active (running)
- [ ] MQTT subscription confirmed in journal

### 3.4 Meshtastic Channel Configuration

```bash
# Set channel config on each mesh node (must match channel key from register-node)
# Channel 0: LongFast, EU 868MHz
# Channel 1: MedFast, EU 868MHz, AES-256 key from Supabase Vault
python3 -c "
import meshtastic
from meshtastic.serial_interface import SerialInterface
i = SerialInterface()
# Channel config verification only — do not change without key distribution
print(i.localConfig.lora.region)  # Must be EU_868
print(i.channels[0].settings.name)  # Must be LongFast
i.close()
"
```
- [ ] Region = EU_868 confirmed on test node
- [ ] Channel 0 = LongFast, Channel 1 = MedFast

### 3.5 Offline Relay Test (CRITICAL functional test)

```bash
# Disconnect mesh-bridge host from internet (block egress via iptables)
iptables -A OUTPUT -d 0.0.0.0/0 -j DROP -m comment --comment "offline-test"

# Fire synthetic Gate 3 event from Tier-4 test device via LoRa

# Wait 5s then restore connectivity
iptables -D OUTPUT -d 0.0.0.0/0 -j DROP -m comment --comment "offline-test"

# Wait 30s then check Supabase
psql <connection-string> -c "SELECT count(*) FROM detection_events WHERE mesh_relay = true AND created_at > now() - interval '2 minutes';"
# Must return count >= 1
```
- [ ] Offline relay test: event appears in Supabase within 30s of reconnect

**Rollback if mesh bridge fails:**
```bash
systemctl stop sentinel-mesh-bridge
# Revert to previous binary/code version from git
git checkout <previous-sha> -- src/mesh/
npm run build
systemctl start sentinel-mesh-bridge
```

---

## Section 4 — TDoA Correlation Service Deployment

### 4.1 Deploy tdoa-correlator Service

```bash
# On TDoA host (can be same as mesh-bridge or separate VM)
npm run build

cp dist/tdoa-correlator.js /opt/sentinel-tdoa/
cp .env /opt/sentinel-tdoa/.env

systemctl enable sentinel-tdoa
systemctl start sentinel-tdoa
systemctl status sentinel-tdoa | grep "Active:"
# Must show active (running)

# Verify NATS consumer attached
journalctl -u sentinel-tdoa -n 20 | grep "Consumer attached"
# Expect: Consumer attached: SENTINEL_TDOA_WINDOWS / tdoa-workers
```
- [ ] sentinel-tdoa.service active (running)
- [ ] NATS consumer tdoa-workers attached

### 4.2 Deploy track-manager Service

```bash
systemctl enable sentinel-track-manager
systemctl start sentinel-track-manager
journalctl -u sentinel-track-manager -n 20 | grep "Hash ring initialized"
# Expect: Hash ring initialized with N=3 instances, 150 virtual nodes
```
- [ ] sentinel-track-manager.service active (running)
- [ ] Hash ring initialisation confirmed

### 4.3 Deploy heartbeat-consumer Service

```bash
systemctl enable sentinel-heartbeat
systemctl start sentinel-heartbeat
journalctl -u sentinel-heartbeat -n 20 | grep "Subscribed to sentinel.node.heartbeat"
```
- [ ] sentinel-heartbeat.service active (running)
- [ ] Heartbeat wildcard subscription confirmed

### 4.4 Deploy cert-rotator Timer

```bash
systemctl enable sentinel-cert-rotator.timer
systemctl start sentinel-cert-rotator.timer
systemctl status sentinel-cert-rotator.timer | grep "Active:"
# Show: active (waiting) next trigger: ...
```
- [ ] sentinel-cert-rotator.timer active (waiting)

**Rollback for TDoA service:**
```bash
systemctl stop sentinel-tdoa sentinel-track-manager
# Re-deploy previous version
git checkout <previous-sha> -- src/tdoa/ src/tracks/
npm run build && cp dist/*.js /opt/sentinel-tdoa/
systemctl start sentinel-tdoa sentinel-track-manager
```

---

## Section 5 — Post-Deploy Verification

### 5.1 Register 3 Test Nodes

```bash
for i in 1 2 3; do
  RESULT=$(curl -s -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"node_id\":\"verify-node-00$i\",\"tier\":1,\"lat\":51.50$i,\"lon\":-0.1$i,\"alt\":10,\"time_precision_us\":1,\"cert_fingerprint\":\"test$i\",\"firmware_version\":\"2.0.0\"}" \
    https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/register-node)
  echo "Node $i: $(echo $RESULT | jq .enrolled)"
done
# All 3 must show: true
```
- [ ] verify-node-001 enrolled: true
- [ ] verify-node-002 enrolled: true
- [ ] verify-node-003 enrolled: true

### 5.2 Send Synthetic Gate 3 Detection

```bash
# Use JWT from verify-node-001 registration
JWT=$(curl -s -X POST ... register-node ... | jq -r .node_token)

GATE3_RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "node_id":"verify-node-001",
    "timestamp_us":'"$(date +%s%6N)"',
    "gate":3,
    "confidence":0.92,
    "geo_sector":"gcpvj5",
    "gate3_event_id":"verify-e2e-001",
    "tdoa_eligible":true,
    "timing_weight":1.0,
    "audio_meta":{"hash":"abc123","duration_ms":100}
  }' \
  https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/ingest-event)

echo "Gate 3 write: $(echo $GATE3_RESULT | jq .written)"
# Must show: true
```
- [ ] ingest-event returns `written: true`
- [ ] `detection_events` has 1 new row (verify via psql)
- [ ] NATS `SENTINEL_EVENTS` stream has 1 new message: `nats stream view SENTINEL_EVENTS`

### 5.3 Verify TDoA Fires for 3-Node Scenario

```bash
# Send events from all 3 test nodes with same gate3_event_id within 500ms
T=$(date +%s%6N)
for i in 1 2 3; do
  JWT_I=<JWT for verify-node-00$i>
  curl -s -X POST -H "Authorization: Bearer $JWT_I" \
    -d "{...\"node_id\":\"verify-node-00$i\",\"timestamp_us\":$((T + i*50)),\"gate3_event_id\":\"verify-tdoa-001\",...}" \
    .../ingest-event &
done
wait
sleep 1

# Verify TDoA window result written
psql <connection-string> -c "SELECT window_id, method, node_count FROM tdoa_windows WHERE gate3_event_id = 'verify-tdoa-001';"
# Must show: 1 row, method=tdoa, node_count=3
```
- [ ] TDoA window result present in `tdoa_windows` table
- [ ] method = tdoa, node_count = 3
- [ ] Track written to `tracks` table: `SELECT * FROM tracks ORDER BY created_at DESC LIMIT 1;`

### 5.4 Verify Supabase Realtime Delivers Event

```bash
# Open realtime subscriber in background (Node.js script)
node scripts/test-realtime-subscriber.js &
SUB_PID=$!

# Insert test row
psql <connection-string> -c "INSERT INTO alerts (alert_id, alert_type, entity_id, confidence, channel, status) VALUES (gen_random_uuid(), 'THREAT_DETECTED', 'verify-tdoa-001', 0.92, 'sentinel-alerts', 'SENT');"

# Wait 1s and check subscriber log
sleep 1
kill $SUB_PID
# Subscriber log must show "Received INSERT on alerts: THREAT_DETECTED"
```
- [ ] Realtime subscriber received alert row within 500ms

### 5.5 Verify Telegram Alert Received

```bash
# Check Telegram ops channel for deploy-smoke node heartbeat gap alert
# (Stop verify-node-001 heartbeat and wait)
# OR manually trigger via alert-router Edge Function
curl -s -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -d '{"node_id":"verify-node-001","alert_type":"NODE_OFFLINE"}' \
  https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/alert-router
```
- [ ] Telegram message received in `#sentinel-ops` within 10s
- [ ] Message uses box-drawing chars (no pipe tables)
- [ ] Coordinates in message are coarsened (not exact)

### 5.6 Fleet Dashboard Node Map

```bash
# Start fleet dashboard (if not already running as systemd service)
npm run start:dashboard &

# Open http://localhost:3000/dashboard/fleet
# Verify all 3 verify-node-00x appear as green markers
# Verify Realtime status indicator shows "connected"
```
- [ ] 3 test nodes visible on fleet map
- [ ] Realtime indicator: connected
- [ ] Node tier colours correct (Tier 1 = green)

---

## Section 6 — Mind-the-Gap Final Gate

**This is the final step before declaring W2 COMPLETE. Do not skip.**

### 6.1 FDRP 8-Dimension Check

```
Dimension 1 — Functional
  [ ] All FR-09 through FR-20 ACs verified (ACCEPTANCE_CRITERIA.md sign-off matrix complete)
  [ ] No AC marked with partial pass

Dimension 2 — Data
  [ ] Migration idempotency tests pass (run migrations twice on local Supabase)
  [ ] RLS policies verified (Section 2.2 checks green)
  [ ] pg_partman partition pruning: EXPLAIN ANALYZE on detection_events shows partition scan

Dimension 3 — Resilience
  [ ] NATS 2-node kill test: kill nodes 4+5, verify cluster serves (Raft quorum = 3)
  [ ] Restore nodes 4+5: verify catchup < 5s
  [ ] Offline relay test: event delivered within 30s of reconnect (Section 3.5)

Dimension 4 — Performance
  [ ] ingest-event p95 < 500ms (measured over 50 calls)
  [ ] register-node p95 < 2000ms (measured over 50 calls)
  [ ] TDoA window-to-result < 800ms (measured from window open to tracks write)

Dimension 5 — Privacy
  [ ] Raw audio: grep -r "audio_data\|raw_pcm\|wav_bytes" src/mesh/ → zero results
  [ ] Geo coarsening: verify anon query returns coarsened coords (Section 2.2)
  [ ] Timestamp coarsening: anon query rounds to nearest 100μs
  [ ] Telegram messages: coordinates ≠ exact GPS (Section 5.5 verified)

Dimension 6 — Modularity
  [ ] Each W2 service independently deployable (tested by stopping/starting individually)
  [ ] No circular imports: npx madge --circular src/ → no cycles

Dimension 7 — Accessibility
  [ ] Fleet dashboard: axe-core scan on /dashboard/fleet → 0 critical violations
  [ ] Keyboard navigation: all interactive elements reachable via Tab
  [ ] Screen reader: node marker alt text present

Dimension 8 — Gap (No W3 Scope in W2)
  [ ] grep -ri "cesium" src/ → 0 results
  [ ] grep -ri "Gate4\|gate_4" src/ → 0 results
  [ ] grep -ri "LSTM\|pytorch\|tensorflow" src/ → 0 results
  [ ] grep -ri "react native\|expo\|flutter" src/ → 0 results
```

### 6.2 Test Suite Final Run

```bash
npx vitest run --coverage 2>&1 | tail -30
# Must show: all tests PASS, coverage ≥80% all metrics

npx playwright test 2>&1 | tail -20
# Must show: 3 passed (0 failed)

npm run build && echo "Build OK"
npx tsc --noEmit && echo "TypeScript OK"
```
- [ ] Vitest: all tests pass
- [ ] Coverage: branches ≥80%, functions ≥80%, lines ≥80%, statements ≥80%
- [ ] Playwright: 3/3 E2E tests pass
- [ ] Build clean
- [ ] TypeScript clean

### 6.3 Artefact Registry Final Status

```bash
# Verify all 45 artifacts are status: complete in ARTIFACT_REGISTRY.md
grep -c "Status:** planned" docs/waves/W2/ARTIFACT_REGISTRY.md
# Must return 0
```
- [ ] 0 artifacts with status "planned"
- [ ] 0 artifacts with status "in-progress"
- [ ] SESSION_STATE.md wave status updated to COMPLETE

### 6.4 W2 Close Commit

```bash
git add docs/waves/W2/ memory/MEMORY.md
git commit -m "feat(W2): wave complete — NATS cluster, Supabase migrations, TDoA service, mesh bridge, fleet dashboard [wave:complete W2]"
git push origin main
```
- [ ] Commit pushed to origin/main
- [ ] CI passes (GitHub Actions W2 test workflow green)

**W2 COMPLETE. W3 entry criteria met.**
