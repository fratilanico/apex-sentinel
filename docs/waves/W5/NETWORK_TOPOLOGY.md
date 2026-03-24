# APEX-SENTINEL W5 — NETWORK TOPOLOGY
## W5 | PROJECTAPEX Doc 20/20 (alt) | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## EKF Microservice Network Position

The EKF microservice is a pure consumer/publisher on the internal NATS JetStream
cluster. It has no inbound ports exposed to external networks. All external access
is via Tailscale (management) or Supabase API (data reads/writes).

---

## Network Diagram

```
─────────────────────────────────────────────────────────────────────────────────
  INTERNET / EXTERNAL
─────────────────────────────────────────────────────────────────────────────────
        │                    │                      │
        ▼                    ▼                      ▼
  Tailscale VPN         Vercel CDN            Supabase Cloud
  (100.x.x.x space)    (dashboard.apex-      (eu-west-2)
  Admin access only      sentinel.io)         bymfcnwfyxuivinuzurr
        │                    │                      │
        │              HTTPS (443)           HTTPS + WSS (443)
        │                    │                      │
─────────────────────────────────────────────────────────────────────────────────
  FORTRESS VM  (94.176.2.48 public | 100.68.152.56 Tailscale)
  RAM: 2GB | OS: Ubuntu 22.04 LTS | Node: v20 LTS
─────────────────────────────────────────────────────────────────────────────────
        │
        │  Internal network (127.0.0.1 + Tailscale mesh)
        │
  ┌─────┴────────────────────────────────────────────────────────────┐
  │  NATS JetStream Cluster (5 nodes, embedded in fortress)          │
  │                                                                  │
  │  nats://nats1.apex-sentinel.internal:4222  (primary)             │
  │  nats://nats2.apex-sentinel.internal:4222  (replica)             │
  │  nats://nats3.apex-sentinel.internal:4222  (replica)             │
  │  Cluster replication: 3 of 5 (tolerates 2 node failures)        │
  │  JetStream streams: SENTINEL, NODE_HEALTH, ALERTS                │
  │                                                                  │
  │  Leaf node (WebSocket proxy for mobile clients):                 │
  │  wss://fortress.apex-sentinel.io:9001  (TLS, nginx proxy)        │
  └──────────────────────────────────────────────────────────────────┘
        │
        │  nats://127.0.0.1:4222 (loopback — fastest path)
        │
  ┌─────┴────────────────────────────────────────────────────────────┐
  │  apex-sentinel-ekf.service (systemd)                             │
  │  PID: managed by systemd, User: root                             │
  │  WorkingDirectory: /opt/apex-sentinel/ekf                        │
  │  EnvironmentFile: /etc/apex-sentinel/ekf.env (mode 600)          │
  │                                                                  │
  │  OUTBOUND connections only:                                      │
  │  ├── NATS: nats://nats1.apex-sentinel.internal:4222 (PULL+PUB)  │
  │  └── HTTPS: bymfcnwfyxuivinuzurr.supabase.co:443 (REST/WS)      │
  │                                                                  │
  │  INBOUND (localhost only):                                       │
  │  └── HTTP: 127.0.0.1:9090  (health check — NOT 0.0.0.0)         │
  │                                                                  │
  │  NO inbound firewall rules needed for EKF service.               │
  └──────────────────────────────────────────────────────────────────┘
        │
        │  co-resident on fortress VM
        │
  ┌─────┴────────────────────────────────────────────────────────────┐
  │  apex-sentinel-tdoa.service  (TdoaCorrelator, W2)                │
  │  apex-sentinel-cot.service   (CoT relay, W2)                     │
  │  nats.service                (NATS server, W2)                   │
  └──────────────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────────────
  MOBILE SENSOR NODES (smartphones)
─────────────────────────────────────────────────────────────────────────────────
  Android/iOS devices running APEX Sentinel mobile app (W3)
  Connect via:  wss://fortress.apex-sentinel.io:9001  (NATS.ws leaf node)
  Publish to:   sentinel.detections.raw.{nodeId}
  Subscribe to: sentinel.alerts.{alertId} (push notifications)
  Auth:         NATS NKey credentials (per-node, rotatable)

─────────────────────────────────────────────────────────────────────────────────
  ATAK CLIENTS (Android tablets)
─────────────────────────────────────────────────────────────────────────────────
  Receive CoT XML from: apex-sentinel-cot.service on fortress
  Protocol: TCP (CoT streaming server on fortress :8087)
  Auth: ATAK certificate enrollment
```

---

## Port Map

```
Port    Protocol  Binding          Service                    Exposed
──────────────────────────────────────────────────────────────────────
4222    TCP       127.0.0.1        NATS server (client port)  NO (internal only)
6222    TCP       127.0.0.1        NATS cluster routing       NO
8222    TCP       127.0.0.1        NATS monitoring HTTP       NO
9001    TCP       0.0.0.0          NATS WebSocket proxy       YES (nginx TLS)
9090    TCP       127.0.0.1        EKF health check HTTP      NO
8087    TCP       0.0.0.0          CoT streaming (ATAK)       YES (firewall: ATAK IP)
443     TCP       0.0.0.0          nginx (HTTPS frontend)     YES
22      TCP       Tailscale only   SSH                        NO (fail2ban blocks public)
```

---

## DNS / Internal Hostname Resolution

```
hostname                            resolves to         used by
──────────────────────────────────────────────────────────────────────────────────
nats1.apex-sentinel.internal        127.0.0.1           EKF service, TdoaCorrelator
nats2.apex-sentinel.internal        127.0.0.1 (or)      NATS cluster internal
nats3.apex-sentinel.internal        127.0.0.1           NATS cluster internal
fortress.apex-sentinel.io           94.176.2.48         Mobile clients (NATS.ws)
dashboard.apex-sentinel.io          Vercel CDN          Browser C2 clients
bymfcnwfyxuivinuzurr.supabase.co   Supabase CDN        All services (HTTPS API)

/etc/hosts on fortress (minimum required):
  127.0.0.1  nats1.apex-sentinel.internal
  127.0.0.1  nats2.apex-sentinel.internal
  127.0.0.1  nats3.apex-sentinel.internal

Verify:
  ping -c 1 nats1.apex-sentinel.internal  # must resolve to 127.0.0.1
  nats sub sentinel.test --server nats://nats1.apex-sentinel.internal:4222 --count=0 &
  sleep 1 && kill %1  # check: no connection error
```

---

## NATS Authentication and Authorization

```
EKF microservice NATS credentials:
  Type: NKey (ED25519 asymmetric — no password)
  Credential file: /etc/apex-sentinel/ekf-nats.creds
  Permission: SUBSCRIBE sentinel.detections.> + sentinel.node_health.*
              PUBLISH   sentinel.predictions.> + sentinel.tracks.dropped.*
  Scope: denied all other subjects (principle of least privilege)

Credential file format (/etc/apex-sentinel/ekf-nats.creds):
  -----BEGIN NATS USER JWT-----
  <JWT token>
  -----END NATS USER JWT-----
  -----BEGIN USER NKEY SEED-----
  <seed — treat as secret>
  -----END USER NKEY SEED-----
  chmod 600 /etc/apex-sentinel/ekf-nats.creds

Environment variable:
  NATS_CREDENTIALS_FILE=/etc/apex-sentinel/ekf-nats.creds
  (add to /etc/apex-sentinel/ekf.env)

NATS TLS:
  Server cert: /etc/nats/server-cert.pem (Let's Encrypt or self-signed CA)
  Client: NATS.js verifies server cert (NODE_EXTRA_CA_CERTS for self-signed CA)
  TLS mode: verify server cert only (no mutual TLS required for EKF client)
```

---

## Supabase Connection Details

```
URL:      https://bymfcnwfyxuivinuzurr.supabase.co
Region:   eu-west-2 (London)
RTT from fortress (Frankfurt/London): ~15-25ms

EKF service uses:
  SUPABASE_SERVICE_ROLE_KEY (from /etc/apex-sentinel/ekf.env)
  — bypasses RLS, can read/write all rows
  — NOT the anon key (anon key is for browser clients only)

Supabase endpoints used by EKF:
  REST:   /rest/v1/tracks (upsert, bootstrap query)
  REST:   /rest/v1/ekf_config (read on startup)
  REST:   /rest/v1/ekf_track_events (insert audit events)

Edge Functions (served from Supabase CDN):
  /functions/v1/get-track-predictions  (dashboard consumption)
  /functions/v1/get-ekf-health         (monitoring)

Connection pooling:
  @supabase/supabase-js maintains internal HTTP keep-alive connections
  No separate connection pooler needed (REST API, not direct PostgreSQL)

Supabase rate limits (free plan):
  REST API: 500 requests/second
  EKF write rate: max 20 tracks × 1 write/track/second = 20 writes/second
  → well within limit; no rate limit risk
```

---

## nginx Configuration Fragment (for NATS.ws proxy)

```nginx
# /etc/nginx/sites-available/apex-sentinel (existing from W2)
# No changes needed for W5 — EKF microservice has no external endpoints

server {
    listen 9001 ssl;
    server_name fortress.apex-sentinel.io;

    ssl_certificate     /etc/letsencrypt/live/fortress.apex-sentinel.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fortress.apex-sentinel.io/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9222;   # NATS WebSocket internal port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;          # long-lived WebSocket
    }
}

# EKF health check: NO nginx config — 127.0.0.1:9090 is localhost only
# To check health from admin Mac via Tailscale:
#   ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
#       'curl -s http://127.0.0.1:9090/health'
```

---

## Firewall Rules (fortress VM — iptables / ufw)

```
Existing rules (W2) — no changes for W5:
  ALLOW TCP 443 (0.0.0.0/0)  → nginx HTTPS
  ALLOW TCP 9001 (0.0.0.0/0) → NATS.ws (nginx proxied)
  ALLOW TCP 8087 (<ATAK_IP>/32) → CoT streaming (restricted to ATAK client IPs)
  DENY  TCP 4222 (0.0.0.0/0) → NATS direct (internal only)
  DENY  TCP 8222 (0.0.0.0/0) → NATS monitoring (internal only)
  DENY  TCP 9090 (0.0.0.0/0) → EKF health (localhost only)
  DENY  TCP 22   (0.0.0.0/0) → SSH blocked by fail2ban (use Tailscale)
  ALLOW TCP 22 via Tailscale  → SSH admin access (Tailscale NATted)

W5 adds no new firewall rules. EKF microservice is purely outbound.

Verify firewall accepts EKF outbound to Supabase:
  curl -s https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/ekf_config?select=config_key \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq length
  # Expect: 7 (number of config rows)
```

---

## Tailscale Admin Access

```
Admin access to fortress VM (always use Tailscale — fail2ban blocks public SSH):
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56

Service management from admin Mac:
  # Check EKF service status:
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
    'systemctl status apex-sentinel-ekf.service'

  # View EKF logs (last 50 lines):
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
    'journalctl -u apex-sentinel-ekf -n 50 --no-pager'

  # Check NATS consumer lag:
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
    'nats consumer info SENTINEL ekf-predictor'

  # Check EKF health:
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
    'curl -s http://127.0.0.1:9090/health | jq .'

  # Emergency restart:
  ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
    'systemctl restart apex-sentinel-ekf.service'
```

---

## Network Latency Measurements (Baseline)

```
Measurement                          Expected     Acceptable
────────────────────────────────────────────────────────────────
fortress → Supabase eu-west-2         15-25ms      < 50ms
fortress → NATS localhost (loopback)  < 1ms        < 5ms
Mobile node → fortress NATS.ws        30-80ms      < 150ms
fortress → Vercel edge (NATS.ws pub)  N/A          (Vercel pulls from NATS.ws)
EKF service → NATS publish + ack      3-10ms       < 50ms
────────────────────────────────────────────────────────────────
EKF internal prediction loop:         1-3ms        < 10ms
Full pipeline (TdoaCorr → EKF → pub): ~15ms        < 200ms
```

---

## Service Dependency Graph (systemd)

```
network.target
      │
      ▼
nats.service         ← NATS server (W2)
      │
      ├──▶ apex-sentinel-tdoa.service    (W2 — TdoaCorrelator)
      │
      ├──▶ apex-sentinel-cot.service     (W2 — CoT relay)
      │
      └──▶ apex-sentinel-ekf.service     (W5 — THIS SERVICE)
              │
              └── Requires: network.target, nats.service
                  After: network.target, nats.service
                  # If NATS restarts: EKF reconnects automatically via nats.js
                  #   retry with exponential back-off (nats.js built-in)
                  # If EKF restarts: Restart=on-failure, RestartSec=10
                  # If NATS dies: EKF keeps running, NATS publish errors logged
                  #   service does NOT restart on NATS failure (by design)
```

---

## Environment File Reference

```
Location:   /etc/apex-sentinel/ekf.env
Permissions: -rw------- root root (600)
Never in git. Never in logs.

Contents:
  NATS_URL=nats://nats1.apex-sentinel.internal:4222
  NATS_CREDENTIALS_FILE=/etc/apex-sentinel/ekf-nats.creds
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
  EKF_CONFIDENCE_LAMBDA=0.07
  EKF_PREDICTOR_WINDOW_SIZE=5
  HEALTH_PORT=9090
  ONNX_MODEL_PATH=
  LOG_LEVEL=info
  NODE_ENV=production
  NODE_EXTRA_CA_CERTS=/etc/apex-sentinel/nats-ca.pem

Validation at startup (TrackEnrichmentService.validateConfig()):
  - NATS_URL: must start with nats://
  - SUPABASE_URL: must start with https://
  - SUPABASE_SERVICE_ROLE_KEY: must be non-empty
  - HEALTH_PORT: must be integer 1024-65535
  - EKF_*: numeric validation, reasonable ranges
  If validation fails: process.exit(1) with clear error message
```

---

## Network Troubleshooting Guide

### EKF service fails to connect to NATS

```bash
# 1. Verify NATS is running
systemctl status nats.service
# If inactive: systemctl start nats.service

# 2. Verify DNS resolves
ping -c 1 nats1.apex-sentinel.internal
# If NXDOMAIN: check /etc/hosts — entry missing
echo "127.0.0.1  nats1.apex-sentinel.internal" >> /etc/hosts

# 3. Verify NATS port open on loopback
nc -z 127.0.0.1 4222 && echo "NATS reachable" || echo "NATS unreachable"

# 4. Verify NATS accepts connections
nats server ping --server nats://127.0.0.1:4222
# If credentials error: check ekf-nats.creds file path and permissions

# 5. Check NATS server log
journalctl -u nats.service -n 50 --no-pager | grep -E "ERR|error"

# 6. Verify SENTINEL stream exists
nats stream info SENTINEL
# If not found: W2 stream setup incomplete — run W2 NATS provisioning script
```

### EKF service fails to reach Supabase

```bash
# 1. Test basic HTTPS connectivity
curl -s https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/ekf_config?select=config_key \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq length
# Expect: 7

# 2. If 401 Unauthorized: SUPABASE_SERVICE_ROLE_KEY has expired or is wrong
#    Regenerate in Supabase Dashboard → Settings → API → service_role
#    Update /etc/apex-sentinel/ekf.env → systemctl restart apex-sentinel-ekf

# 3. If connection timeout: fortress outbound HTTPS blocked
#    Check firewall: ufw status | grep 443 (outbound not usually blocked)
#    Verify DNS: nslookup bymfcnwfyxuivinuzurr.supabase.co

# 4. If Supabase 503/429: Supabase rate limit or service degradation
#    Check https://status.supabase.com
#    EKF service circuit breaker should activate after 5 failures (RISK-W5-05)
```

### High NATS consumer lag

```bash
# Check current lag
nats consumer info SENTINEL ekf-predictor

# Check processing rate
journalctl -u apex-sentinel-ekf --since "-60s" --no-pager | \
  grep "processed" | wc -l
# Lines per minute = approximate messages/minute

# If lag growing: increase pull consumer batch size
# Edit /opt/apex-sentinel/ekf/src/nats/NatsClient.ts:
#   maxMessages: 10 → 50
# Rebuild and restart
npm run build
systemctl restart apex-sentinel-ekf.service

# Emergency: if lag > 1000 and growing fast (swarm attack scenario)
# Temporarily pause non-critical processing: increase EKF_TRACK_DROPOUT_SECONDS=5
# This drops tracks faster → fewer active EKF instances → higher throughput
```

---

## VM Resource Baseline (Pre-Deploy Measurement)

```
Record before deploying EKF service (run on fortress via SSH):

  free -h
  # Expected: ~800MB-1.2GB used by existing services (NATS, TdoaCorrelator, CoT relay)
  # Available for EKF: ≥600MB (MemoryLimit=256M is conservative)

  df -h /opt
  # Expected: ≥2GB free (EKF code + node_modules ~300MB)

  top -bn1 | grep -E "Cpu|Mem"
  # Expected CPU idle: >50% (EKF prediction loop at 5Hz is low CPU)

  nats server report jetstream
  # Expected: stream storage < 500MB (work-queue: messages ack'd and deleted)

Post-deploy baseline (capture after 1hr of operation):
  - EKF service memory: systemctl status | grep Memory → expect ~50-80MB
  - CPU: top -p $(pgrep -f main.js) -bn1 | tail -1 → expect < 5% CPU
  - NATS consumer lag: nats consumer info SENTINEL ekf-predictor → < 20 msgs
```

---

## Security Hardening Notes

```
EKF service attack surface: near-zero
  - No inbound ports (except 127.0.0.1:9090 — unreachable from network)
  - All connections are outbound (NATS + Supabase)
  - Service user: root (acceptable on fortress — single-tenant VM)
    Post-W5 hardening: create apex-sentinel user, restrict NATS creds to that user

NATS credential rotation:
  - NKey seed in /etc/apex-sentinel/ekf-nats.creds
  - Rotation: generate new NKey pair, update NATS server auth config, replace file
  - Zero downtime: service reconnects automatically after SIGTERM→restart
  - Schedule: rotate every 90 days (calendar reminder in ops notes)

Supabase service_role key rotation:
  - Rotate in Supabase Dashboard → Settings → API
  - Update /etc/apex-sentinel/ekf.env immediately after rotation
  - Restart service: systemctl restart apex-sentinel-ekf
  - Verify: curl /health → supabaseReachable=true
  - Schedule: rotate every 180 days or on personnel change

Audit logging:
  - All prediction events logged to ekf_track_events table (Supabase)
  - RLS on ekf_track_events: service_role only (no client can read directly)
  - systemd journal: rotate weekly, keep 7 days (JournalMaxFileSec=7day)
  - No PII in logs: trackId is UUID, positions are coordinates (not addresses)
```
