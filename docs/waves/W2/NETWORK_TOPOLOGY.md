# APEX-SENTINEL W2 — Network Topology

**Document ID:** NETWORK_TOPOLOGY-W2
**Wave:** W2 — Infrastructure Backbone
**Status:** IN PROGRESS
**Owner:** Nicolae Fratila
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2, London)

---

## 1. Overview

This document defines the physical and logical network architecture for APEX-SENTINEL Wave 2. It covers the NATS JetStream cluster topology, Supabase cloud endpoints, sensor node tiers and their connectivity requirements, geographic distribution considerations, mTLS certificate chain, firewall rules, DNS architecture, Tailscale mesh overlay, and bandwidth estimates per node tier.

The APEX-SENTINEL network is designed for deployment in urban and peri-urban environments in the United Kingdom, with primary coverage targeting the London metropolitan area and configurable for other regional deployments. All management plane traffic uses Tailscale VPN mesh for zero-trust access; all detection traffic uses mTLS-authenticated NATS JetStream.

---

## 2. Physical Network Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                        APEX-SENTINEL W2 — PHYSICAL NETWORK TOPOLOGY                         ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

  INTERNET / PUBLIC CLOUD
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                         Azure UK South (London)                                        │
  │                                                                                        │
  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
  │  │                    APEX-SENTINEL-NATS Resource Group                            │  │
  │  │                                                                                 │  │
  │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                      │  │
  │  │  │  nats1 VM     │  │  nats2 VM     │  │  nats3 VM     │                      │  │
  │  │  │  Standard_B2s │  │  Standard_B2s │  │  Standard_B2s │                      │  │
  │  │  │  2vCPU/4GB    │  │  2vCPU/4GB    │  │  2vCPU/4GB    │                      │  │
  │  │  │  50GB data    │  │  50GB data    │  │  50GB data    │                      │  │
  │  │  │  10.0.1.11    │  │  10.0.1.12    │  │  10.0.1.13    │                      │  │
  │  │  └───────────────┘  └───────────────┘  └───────────────┘                      │  │
  │  │  ┌───────────────┐  ┌───────────────┐                                         │  │
  │  │  │  nats4 VM     │  │  nats5 VM     │                                         │  │
  │  │  │  Standard_B2s │  │  Standard_B2s │  ← Raft cluster (all 5 nodes)           │  │
  │  │  │  2vCPU/4GB    │  │  2vCPU/4GB    │    cluster routes :6222                 │  │
  │  │  │  50GB data    │  │  50GB data    │    VNet subnet: 10.0.1.0/24             │  │
  │  │  │  10.0.1.14    │  │  10.0.1.15    │                                         │  │
  │  │  └───────────────┘  └───────────────┘                                         │  │
  │  │                                                                                 │  │
  │  │  ┌─────────────────────────────────────────────┐                               │  │
  │  │  │  fortress VM  (94.176.2.48 public)          │                               │  │
  │  │  │  TDoA correlation service (Deno/systemd)    │                               │  │
  │  │  │  DLQ processor service                      │                               │  │
  │  │  │  Meshtastic bridge (optional — if co-hosted)│                               │  │
  │  │  │  Intermediate CA (PKI)                      │                               │  │
  │  │  │  Tailscale: 100.68.152.56                   │                               │  │
  │  │  │  10.0.1.10  (VNet)                          │                               │  │
  │  │  └─────────────────────────────────────────────┘                               │  │
  │  └─────────────────────────────────────────────────────────────────────────────────┘  │
  │                                                                                        │
  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
  │  │                    Supabase (eu-west-2, London)                                 │  │
  │  │                    Project: bymfcnwfyxuivinuzurr                               │  │
  │  │                                                                                 │  │
  │  │  REST API:    https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/               │  │
  │  │  Auth API:    https://bymfcnwfyxuivinuzurr.supabase.co/auth/v1/               │  │
  │  │  Edge Fns:    https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/          │  │
  │  │  Realtime:    wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1              │  │
  │  │  Storage:     https://bymfcnwfyxuivinuzurr.supabase.co/storage/v1/            │  │
  │  │  DB direct:   postgresql://bymfcnwfyxuivinuzurr.supabase.co:5432              │  │
  │  │  pgbouncer:   postgresql://bymfcnwfyxuivinuzurr.supabase.co:6543              │  │
  │  └─────────────────────────────────────────────────────────────────────────────────┘  │
  └────────────────────────────────────────────────────────────────────────────────────────┘

  FIELD DEPLOYMENT (London Metropolitan Area)
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │  Coverage cell radius: 2km per Tier-1 node                                            │
  │                                                                                        │
  │  ┌───────────────────────────────────────────────────────────────────────────────┐    │
  │  │  Deployment Zone: London Central (example)                                    │    │
  │  │                                                                               │    │
  │  │  [APEX-NODE-001]          [APEX-NODE-002]          [APEX-NODE-003]           │    │
  │  │  Tier-1                   Tier-1                   Tier-2                    │    │
  │  │  RTL-SDR + Mic            RTL-SDR + Mic            Mic only                  │    │
  │  │  Smartphone               Raspberry Pi 5           Smartphone                │    │
  │  │  LTE: 4G/5G               WiFi: Home internet      LTE: 4G/5G                │    │
  │  │  51.5060°N 0.1250°W       51.5090°N 0.1200°W       51.5040°N 0.1300°W        │    │
  │  │       │                        │                        │                    │    │
  │  │       └────────────────────────┼────────────────────────┘                    │    │
  │  │                                │ NATS TCP/4222 over TLS                      │    │
  │  │                                │ (internet → Azure UK South)                 │    │
  │  │                                ▼                                              │    │
  │  │  [APEX-NODE-004]          NATS JetStream Cluster                             │    │
  │  │  Tier-3                   (nats1–nats5.apex-sentinel.internal)               │    │
  │  │  Meshtastic relay                                                             │    │
  │  │  LoRa 868MHz                                                                  │    │
  │  │  Serial → Python bridge                                                       │    │
  │  │  on Raspberry Pi                                                              │    │
  │  └───────────────────────────────────────────────────────────────────────────────┘    │
  └────────────────────────────────────────────────────────────────────────────────────────┘

  OPERATOR / C2
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │  C2 Dashboard (W4)                                                                     │
  │  Operator workstation / laptop                                                         │
  │  Browser → Supabase Realtime WebSocket                                                 │
  │  Telegram mobile app (alert notifications)                                             │
  │  ATAK/WinTAK (CoT via FreeTAKServer)                                                   │
  └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Logical Network Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                        APEX-SENTINEL W2 — LOGICAL NETWORK TOPOLOGY                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                    MANAGEMENT PLANE (Tailscale Mesh / WireGuard)             │
  │                                                                              │
  │   fortress:100.68.152.56 ──── nats1:100.x.x.x ──── nats2:100.x.x.x         │
  │          │                         │                      │                 │
  │          └──────── nats3:100.x.x.x ─┴───── nats4:100.x.x.x ── nats5        │
  │                                                                              │
  │   Access: SSH via Tailscale only. Public SSH ports CLOSED on all VMs.       │
  │   PKI management: fortress → nats1-5 via Tailscale SSH (cert push)          │
  │   Monitoring: Prometheus scrape fortress → nats1-5 :8222/varz               │
  └──────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                    DATA PLANE (NATS mTLS / JetStream)                        │
  │                                                                              │
  │   Sensor Nodes ──[mTLS/4222]──► NATS Cluster ──[internal]──► Edge Functions │
  │                                                                              │
  │   Subject routing (NATS internal):                                           │
  │     sentinel.detections.>  → DETECTIONS stream → ingest-event consumer     │
  │     sentinel.health.>      → NODE_HEALTH stream → node-health consumer     │
  │     sentinel.alerts.>      → ALERTS stream     → alert-router consumer     │
  │     sentinel.cot.>         → COT_EVENTS stream  → CoT relay consumer       │
  │     sentinel.dlq.>         → DLQ streams        → DLQ processor            │
  └──────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                 APPLICATION PLANE (Supabase / HTTPS)                         │
  │                                                                              │
  │   Node ──[HTTPS]──► register-node ──► nodes table ──► JWT response          │
  │   NATS bridge ──► ingest-event ──► detection_events ──► NOTIFY ──► TDoA    │
  │   NATS bridge ──► node-health ──► node_health_log ──► nodes.status update  │
  │   TDoA svc ──► tracks table ──► NATS ALERTS publish                         │
  │   NATS bridge ──► alert-router ──┬──► Telegram API                          │
  │                                  ├──► Supabase Realtime broadcast            │
  │                                  └──► FreeTAKServer TCP                      │
  └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. NATS JetStream Cluster Topology

### 4.1 Cluster Node Configuration

```
Cluster name:  APEX-SENTINEL-PROD
Topology:      Full mesh (all nodes route to all others)
Consensus:     Raft (NATS native)
Quorum:        3 of 5 nodes (N/2 + 1 = 3)
Fault tolerance: 2 node failures tolerated

Node inventory:
┌──────┬───────────────────────────────────┬──────────────┬──────────────┬──────────────┐
│ Node │ Hostname (internal DNS)           │ Client port  │ Cluster port │ Monitor port │
├──────┼───────────────────────────────────┼──────────────┼──────────────┼──────────────┤
│ nats1│ nats1.apex-sentinel.internal      │ 4222         │ 6222         │ 8222         │
│ nats2│ nats2.apex-sentinel.internal      │ 4222         │ 6222         │ 8222         │
│ nats3│ nats3.apex-sentinel.internal      │ 4222         │ 6222         │ 8222         │
│ nats4│ nats4.apex-sentinel.internal      │ 4222         │ 6222         │ 8222         │
│ nats5│ nats5.apex-sentinel.internal      │ 4222         │ 6222         │ 8222         │
└──────┴───────────────────────────────────┴──────────────┴──────────────┴──────────────┘
```

### 4.2 JetStream Stream Distribution

```
Meta-leader election: one node holds meta-leader role at any time
Stream leader election: each stream has its own Raft group leader

Stream leaders at steady state (example distribution):
  DETECTIONS    → leader: nats1, replicas: nats2, nats3
  NODE_HEALTH   → leader: nats2, replicas: nats3, nats4
  ALERTS        → leader: nats3, replicas: nats1, nats2, nats4, nats5  (R5)
  COT_EVENTS    → leader: nats4, replicas: nats5, nats1
  DLQ streams   → leader: nats5, replicas: nats1, nats2

Note: Leader placement is determined by Raft; cannot be forced.
      R5 for ALERTS ensures availability even with 4-node partial failure.
```

### 4.3 NATS Server Configuration (per node)

```
# /etc/nats/nats-server.conf (nats1 example)

server_name: nats1

listen: 0.0.0.0:4222

tls {
  cert_file: /etc/nats/tls/server.crt
  key_file:  /etc/nats/tls/server.key
  ca_file:   /etc/nats/tls/intermediate-ca.crt
  verify: true                    # require client cert
  timeout: 3
}

cluster {
  name: APEX-SENTINEL-PROD
  listen: 0.0.0.0:6222

  tls {
    cert_file: /etc/nats/tls/server.crt
    key_file:  /etc/nats/tls/server.key
    ca_file:   /etc/nats/tls/intermediate-ca.crt
  }

  routes: [
    nats-route://nats2.apex-sentinel.internal:6222
    nats-route://nats3.apex-sentinel.internal:6222
    nats-route://nats4.apex-sentinel.internal:6222
    nats-route://nats5.apex-sentinel.internal:6222
  ]
}

jetstream {
  store_dir:        /var/lib/nats/jetstream
  max_memory_store: 4GB
  max_file_store:   50GB
}

http: 8222

operator: /etc/nats/auth/sentinel-operator.jwt
system_account: SYS

accounts {
  SYS {
    users: [ { nkey: UABC... } ]
  }
  SENTINEL {
    users: [ { nkey: UDEF... } ]
    jetstream: enabled
  }
}

authorization {
  users: [
    {
      nkey: UXYZ...                # node agent key
      permissions: {
        publish: {
          allow: ["sentinel.detections.$", "sentinel.health.$"]
        }
        subscribe: {
          deny: [">"]
        }
      }
    }
  ]
}
```

### 4.4 Raft Leader Election Parameters

```
Heartbeat interval:  500ms
Election timeout:    1500ms–3000ms (randomised)
Quorum requirement:  3 of 5
Leader lease duration: 500ms

On leader loss:
  1. Surviving followers wait election_timeout (randomised 1.5–3s)
  2. First follower to timeout becomes candidate, increments term
  3. Candidate sends RequestVote to other nodes
  4. First candidate to receive 2 votes (quorum) becomes leader
  5. New leader starts heartbeating; followers revert to follower state
  Total failover time: typically 2–5s
```

---

## 5. Supabase eu-west-2 Endpoints

### 5.1 Public Endpoints

```
Region: eu-west-2 (London, AWS)
Project ID: bymfcnwfyxuivinuzurr

REST API:
  URL:     https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/
  Protocol: HTTPS/TLS 1.3
  Auth:    Anon key or Service-role key in Authorization header
  Timeout: 10s (Edge Function calls), 30s (direct REST)

Auth API:
  URL:     https://bymfcnwfyxuivinuzurr.supabase.co/auth/v1/
  Endpoints: /token, /signup, /logout, /user

Edge Functions:
  URL:     https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/{function-name}
  Runtime: Deno 1.40+
  Timeout: 150s hard limit (Pro plan)
  Cold start: 150–400ms
  Deployed via: supabase functions deploy

Realtime:
  WebSocket: wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket
  Protocol: WebSocket + Supabase Realtime protocol
  Auth: JWT in connect params or Authorization header
  Channels: sentinel:alerts, sentinel:tracks:{trackId}
  Max connections: 200 concurrent (Pro plan)

Database direct (from trusted VMs only):
  Host:   db.bymfcnwfyxuivinuzurr.supabase.co
  Port:   5432 (direct) / 6543 (pgbouncer transaction mode)
  DB:     postgres
  SSL:    required
  Only accessible from Supabase-whitelisted IPs (fortress VM IP must be added)

Storage:
  URL:     https://bymfcnwfyxuivinuzurr.supabase.co/storage/v1/
  Used for: W2 scope — not used (no file storage in W2)
```

### 5.2 Supabase Latency Characteristics (eu-west-2)

```
From fortress VM (Azure UK South → AWS eu-west-2):
  REST API: 15–30ms typical RTT
  pgbouncer: 10–20ms typical RTT
  Realtime WebSocket: 20–40ms initial connect, <5ms message delivery

From sensor node (London, 4G/5G → AWS eu-west-2):
  Edge Function invoke: 30–80ms network + cold start overhead
  REST API: 30–60ms typical RTT

From NATS bridge (fortress → Supabase):
  Same as fortress above: 15–30ms
```

---

## 6. Node Tiers

### 6.1 Tier Definitions

```
┌────────┬─────────────────────────────────────────────────────────────────────────┐
│ Tier   │ Description                                                              │
├────────┼─────────────────────────────────────────────────────────────────────────┤
│ Tier 1 │ Full stack: RTL-SDR (RF) + Microphone (acoustic) + Smartphone/SBC host  │
│        │ Hardware: RTL-SDR V3, USB microphone, Raspberry Pi 5 or Android 12+     │
│        │ Connectivity: LTE 4G/5G (primary), WiFi (secondary)                     │
│        │ NATS: direct mTLS connection to cluster on port 4222                    │
│        │ Coverage: 2km radius acoustic, ~5km radius RF (2.4GHz drone signals)    │
│        │ Power: mains or 10,000mAh LiPo (8hr autonomy)                           │
│        │ GPS: onboard or network-assisted                                         │
├────────┼─────────────────────────────────────────────────────────────────────────┤
│ Tier 2 │ Acoustic only: Microphone + Smartphone host                             │
│        │ Hardware: Smartphone with USB-C audio interface, microphone              │
│        │ Connectivity: LTE 4G/5G                                                 │
│        │ NATS: direct mTLS connection on port 4222                               │
│        │ Coverage: 1km radius acoustic (no RF detection)                          │
│        │ Power: Smartphone battery (6–12hr autonomy depending on device)          │
│        │ GPS: network-assisted only                                               │
├────────┼─────────────────────────────────────────────────────────────────────────┤
│ Tier 3 │ RF relay only: Meshtastic radio module + host device                    │
│        │ Hardware: RAK4631 or Heltec V3, Raspberry Pi Zero 2W or smartphone       │
│        │ Connectivity: LoRa 868MHz mesh (UK ISM band) for RF relay               │
│        │              + LTE/WiFi on host for NATS forwarding                     │
│        │ NATS: indirect via Meshtastic bridge on host device                     │
│        │ Coverage: 3–5km LoRa range for relaying Meshtastic packets              │
│        │ Power: solar + LiPo (potentially permanent deployment)                  │
│        │ GPS: onboard LoRa module GPS (if equipped)                              │
│        │ Latency: +200–800ms relay overhead via Meshtastic                       │
└────────┴─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Tier Capability Matrix

```
Capability               │ Tier 1 │ Tier 2 │ Tier 3
─────────────────────────┼────────┼────────┼────────
Acoustic detection       │  YES   │  YES   │   NO
RF detection (2.4/5.8GHz)│  YES   │   NO   │   NO
RF relay (LoRa)          │   NO   │   NO   │  YES
TDoA participation       │  YES   │  YES   │ LIMITED
GPS position accuracy    │  HIGH  │  MED   │  MED
Clock accuracy           │  HIGH  │  MED   │  LOW
Direct NATS connection   │  YES   │  YES   │  via bridge
NATS auth method         │  mTLS  │  mTLS  │  bridge JWT
```

### 6.3 Coverage Model

```
For a deployment with N Tier-1 nodes:

Single Tier-1 node:
  Acoustic detection: 500m radius (typical drone motor noise SNR threshold)
  RF detection: 1–3km radius (depends on drone RF power, environment)
  TDoA capable: NO (single node, no timing differential)

Two Tier-1 nodes separated by D metres:
  TDoA capable: YES (2D positioning using 1 TDOA measurement = hyperbola)
  Position accuracy: poor (large uncertainty ellipse along hyperbola tangent)
  Minimum useful separation: 500m

Three Tier-1 nodes (minimum for reliable TDoA):
  TDoA capable: YES (3 TDOA measurements, 2D solution)
  Position accuracy: ±50m CEP90 for target within triangle
  Optimal geometry: equilateral triangle spacing 500m–2km per side
  Coverage area: ~3.14 × (2km)² = ~12.6 km² per triangle

Recommended deployments:
  Event security (stadium): 6 Tier-1 nodes in 3km × 3km perimeter
  Critical infrastructure: 9 Tier-1 nodes in 5km × 5km grid
  Urban corridor: 4 Tier-1 + 4 Tier-2 along 10km route
```

---

## 7. mTLS Certificate Chain

### 7.1 Certificate Hierarchy

```
Root CA
  Type:      RSA 4096-bit
  Validity:  10 years (2026-03-24 to 2036-03-24)
  CN:        APEX-SENTINEL Root CA
  O:         APEX-SENTINEL
  C:         GB
  Storage:   Offline, encrypted USB drive (VeraCrypt AES-256)
  Usage:     Signs Intermediate CA only. NEVER goes online.
  Backup:    Two copies, separate physical locations.

  └── Intermediate CA
        Type:      EC P-384
        Validity:  2 years (2026-03-24 to 2028-03-24)
        CN:        APEX-SENTINEL Intermediate CA
        O:         APEX-SENTINEL
        C:         GB
        Storage:   /etc/pki/sentinel/ on fortress VM
                   Key: /etc/pki/sentinel/intermediate-ca.key (chmod 400, root only)
                   Cert: /etc/pki/sentinel/intermediate-ca.crt
        Backup:    GPG-encrypted to Azure Blob Storage daily
        Usage:     Signs server certs and node client certs

        ├── NATS Server Certs (one per cluster node)
        │     Type:      EC P-256
        │     Validity:  365 days (renewed 30 days before expiry)
        │     CN:        nats{N}.apex-sentinel.internal
        │     SAN:       DNS:nats{N}.apex-sentinel.internal
        │                IP:{tailscale_ip}
        │                IP:{vnet_private_ip}
        │     Storage:   /etc/nats/tls/ on each NATS node
        │     Rotation:  Automated via infra/pki/rotate-server-cert.sh
        │
        └── Node Client Certs (one per sensor node)
              Type:      EC P-256
              Validity:  365 days (renewed 30 days before expiry)
              CN:        {node_id}  e.g. APEX-NODE-001
              OU:        sentinel-nodes
              O:         APEX-SENTINEL
              C:         GB
              SAN:       (none — client certs)
              Storage:   /etc/sentinel/certs/ on sensor node
                         Key: /etc/sentinel/certs/node.key (chmod 400)
                         Cert: /etc/sentinel/certs/node.crt
                         Chain: /etc/sentinel/certs/chain.pem (cert + intermediate)
              Rotation:  Fortress cron, pushes via Tailscale SSH
```

### 7.2 Certificate Generation Commands

```bash
# Root CA (run on air-gapped machine)
openssl genrsa -aes256 -out root-ca.key 4096
openssl req -new -x509 -days 3650 -key root-ca.key \
  -subj "/CN=APEX-SENTINEL Root CA/O=APEX-SENTINEL/C=GB" \
  -out root-ca.crt

# Intermediate CA (on fortress)
openssl ecparam -genkey -name secp384r1 -out intermediate-ca.key
openssl req -new -key intermediate-ca.key \
  -subj "/CN=APEX-SENTINEL Intermediate CA/O=APEX-SENTINEL/C=GB" \
  -out intermediate-ca.csr
# Sign with Root CA (on air-gapped machine, then return signed cert)
openssl x509 -req -days 730 -in intermediate-ca.csr \
  -CA root-ca.crt -CAkey root-ca.key -CAcreateserial \
  -extfile /dev/stdin <<EOF
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EOF

# NATS Server cert (nats1, run on fortress)
openssl ecparam -genkey -name prime256v1 -out nats1-server.key
openssl req -new -key nats1-server.key \
  -subj "/CN=nats1.apex-sentinel.internal/O=APEX-SENTINEL/C=GB" \
  -out nats1-server.csr
openssl x509 -req -days 365 -in nats1-server.csr \
  -CA intermediate-ca.crt -CAkey intermediate-ca.key -CAcreateserial \
  -extfile /dev/stdin <<EOF
subjectAltName=DNS:nats1.apex-sentinel.internal,IP:10.0.1.11
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF

# Node client cert (APEX-NODE-001)
openssl ecparam -genkey -name prime256v1 -out node-001.key
openssl req -new -key node-001.key \
  -subj "/CN=APEX-NODE-001/OU=sentinel-nodes/O=APEX-SENTINEL/C=GB" \
  -out node-001.csr
openssl x509 -req -days 365 -in node-001.csr \
  -CA intermediate-ca.crt -CAkey intermediate-ca.key -CAcreateserial \
  -extfile /dev/stdin <<EOF
keyUsage=digitalSignature
extendedKeyUsage=clientAuth
EOF
```

### 7.3 Certificate Rotation Procedure

```
Rotation trigger: cert expiry - now < 30 days (checked daily by cron on fortress)

For NATS server cert rotation:
  1. Generate new server cert (same CN/SAN) on fortress
  2. Push new cert/key to target NATS node via Tailscale SSH
     scp -i ~/.ssh/tailscale_key new-server.{crt,key} root@nats1:/etc/nats/tls/
  3. Reload NATS server config: nats-server --signal reload
     (This reloads TLS cert without dropping existing connections)
  4. Verify: openssl s_client -connect nats1.apex-sentinel.internal:4222 -verify 5
  5. Update cert inventory in /etc/pki/sentinel/cert-inventory.json

For node client cert rotation:
  1. Generate new client cert (same CN) on fortress
  2. Push to node via Tailscale SSH (or via Meshtastic OTA for Tier-3)
  3. Node NATS client reloads cert from disk on next TLS handshake
     (GetClientCertificate callback reads from disk — no restart required)
  4. Add new CN to NATS auth map, keep old CN for 24h overlap window
  5. After 24h: remove old CN from NATS auth map
  6. Issue NATS server reload on all cluster nodes
```

---

## 8. Firewall Rules and Port Matrix

### 8.1 Inbound Rules — NATS Cluster Nodes (nats1–nats5)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Source                    │ Destination port │ Protocol │ Purpose          │ Action  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Any (sensor nodes)        │ 4222             │ TCP/TLS  │ NATS client conn │ ALLOW   │
│ nats{1-5} cluster nodes   │ 6222             │ TCP/TLS  │ NATS cluster     │ ALLOW   │
│ fortress (10.0.1.10)      │ 8222             │ TCP      │ NATS monitoring  │ ALLOW   │
│ Tailscale mesh            │ 22               │ TCP      │ SSH (mgmt only)  │ ALLOW   │
│ Prometheus (fortress)     │ 8222             │ TCP      │ metrics scrape   │ ALLOW   │
│ Any                       │ 22               │ TCP      │ Public SSH       │ DENY    │
│ Any                       │ 80, 443          │ TCP      │ HTTP/S (no web)  │ DENY    │
│ Any                       │ 0-4221           │ TCP/UDP  │ All other ports  │ DENY    │
│ Any                       │ 4223-6221        │ TCP/UDP  │ All other ports  │ DENY    │
│ Any                       │ 6223-8221        │ TCP/UDP  │ All other ports  │ DENY    │
│ Any                       │ 8223-65535       │ TCP/UDP  │ All other ports  │ DENY    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Inbound Rules — Fortress VM

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Source                    │ Destination port │ Protocol │ Purpose          │ Action  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Tailscale mesh            │ 22               │ TCP      │ SSH (Tailscale)  │ ALLOW   │
│ Any (public)              │ 22               │ TCP      │ Public SSH       │ DENY    │
│ Any                       │ all others       │ TCP/UDP  │ No public svc    │ DENY    │
└──────────────────────────────────────────────────────────────────────────────────────┘

Outbound from fortress:
  → NATS cluster :4222        (TDoA service, DLQ processor, cert rotation)
  → NATS cluster :6222        (cluster monitoring)
  → NATS cluster :8222        (Prometheus scrape)
  → Supabase REST/pgbouncer   (track writes, node position reads)
  → Telegram API :443         (keep-warm, DLQ processor alerts)
  → FreeTAKServer :8087       (CoT relay)
  → Azure Blob Storage :443   (PKI backups)
```

### 8.3 Inbound Rules — Sensor Nodes (conceptual; actual firewall = OS iptables)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Source                    │ Destination port │ Protocol │ Purpose          │ Action  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Tailscale (mgmt)          │ 22               │ TCP      │ SSH for cert push│ ALLOW   │
│ Any                       │ all              │ TCP/UDP  │ No listening svc │ DENY    │
└──────────────────────────────────────────────────────────────────────────────────────┘

Sensor node outbound:
  → NATS cluster :4222        (detection/health publish)
  → Supabase Edge Fns :443    (register-node, ingest-event)
  → NTP server :123/UDP       (time sync)
  → DNS :53/UDP               (resolve nats1.apex-sentinel.internal)
```

### 8.4 Azure Network Security Group Rules (for NATS subnet)

```
Priority | Name                  | Port  | Protocol | Source     | Action
---------|----------------------|-------|----------|------------|-------
100      | Allow-NATS-Client    | 4222  | TCP      | *          | Allow
110      | Allow-NATS-Cluster   | 6222  | TCP      | 10.0.1.0/24| Allow
120      | Allow-NATS-Monitor   | 8222  | TCP      | 10.0.1.0/24| Allow
130      | Allow-Tailscale-SSH  | 22    | TCP      | 100.0.0.0/8| Allow
900      | Deny-All-Inbound     | *     | *        | *          | Deny
```

---

## 9. DNS Architecture

### 9.1 Internal DNS (apex-sentinel.internal)

```
Zone: apex-sentinel.internal
Authoritative: Azure Private DNS Zone (linked to NATS VNet)
TTL: 60s (low TTL for failover scenarios)

Records:
┌──────────────────────────────────────────────────────────────────────┐
│ Hostname                        │ Type │ Value                        │
├──────────────────────────────────────────────────────────────────────┤
│ nats1.apex-sentinel.internal    │ A    │ 10.0.1.11                    │
│ nats2.apex-sentinel.internal    │ A    │ 10.0.1.12                    │
│ nats3.apex-sentinel.internal    │ A    │ 10.0.1.13                    │
│ nats4.apex-sentinel.internal    │ A    │ 10.0.1.14                    │
│ nats5.apex-sentinel.internal    │ A    │ 10.0.1.15                    │
│ fortress.apex-sentinel.internal │ A    │ 10.0.1.10                    │
│ nats.apex-sentinel.internal     │ A    │ 10.0.1.11 (primary client)   │
│                                 │ A    │ 10.0.1.12 (round-robin)      │
│                                 │ A    │ 10.0.1.13 (round-robin)      │
└──────────────────────────────────────────────────────────────────────┘

Note: Sensor nodes are NOT in the internal DNS zone.
      They resolve nats1–nats5 via public DNS (see §9.2).
      Internal DNS is only for NATS cluster-internal routes and fortress.
```

### 9.2 External DNS (apex-sentinel.io)

```
Zone: apex-sentinel.io
Registrar: Cloudflare (DNS management)
TTL: 300s (standard)

Records:
┌──────────────────────────────────────────────────────────────────────┐
│ Hostname                        │ Type  │ Value                       │
├──────────────────────────────────────────────────────────────────────┤
│ api.apex-sentinel.io            │ CNAME │ bymfcnwfyxuivinuzurr.       │
│                                 │       │ supabase.co                 │
│ nats.apex-sentinel.io           │ A     │ {nats1_public_ip}           │
│                                 │ A     │ {nats2_public_ip}           │
│                                 │ A     │ {nats3_public_ip}           │
│ status.apex-sentinel.io         │ CNAME │ {uptime-kuma or similar}    │
└──────────────────────────────────────────────────────────────────────┘

Sensor nodes use nats.apex-sentinel.io for NATS connection:
  - Round-robin DNS across nats1, nats2, nats3 public IPs
  - NATS client reconnects to next IP on connection failure
  - Port 4222 must be open on public IP of nats1–nats3
    (nats4, nats5 are cluster-internal only — no public IP)
```

### 9.3 DNS Resolution for Sensor Nodes

```
Sensor node startup sequence:
  1. Node starts, checks internet connectivity
  2. Resolves nats.apex-sentinel.io → [{nats1_ip}, {nats2_ip}, {nats3_ip}]
  3. Attempts NATS connection to first IP :4222 with mTLS
  4. On connection failure: tries next IP in list
  5. On all IPs failed: backs off 30s, retries

NATS client URL in node agent config:
  nats_url: nats://nats.apex-sentinel.io:4222
  tls_cert: /etc/sentinel/certs/node.crt
  tls_key:  /etc/sentinel/certs/node.key
  tls_ca:   /etc/sentinel/certs/intermediate-ca.crt
```

---

## 10. Tailscale Mesh Overlay

### 10.1 Tailscale Topology

```
Tailscale network: apex-sentinel (tailnet)
All infrastructure VMs are Tailscale nodes:

┌──────────────────────────────────────────────────────────────────────┐
│ Device                   │ Tailscale IP   │ Role                     │
├──────────────────────────────────────────────────────────────────────┤
│ fortress                 │ 100.68.152.56  │ Management hub, CA host  │
│ nats1                    │ 100.x.x.x      │ NATS cluster node        │
│ nats2                    │ 100.x.x.x      │ NATS cluster node        │
│ nats3                    │ 100.x.x.x      │ NATS cluster node        │
│ nats4                    │ 100.x.x.x      │ NATS cluster node        │
│ nats5                    │ 100.x.x.x      │ NATS cluster node        │
│ nico-macbook             │ 100.x.x.x      │ Developer workstation    │
└──────────────────────────────────────────────────────────────────────┘

Tailscale ACL policy (tailscale-acl.json):
  - fortress can SSH to all VMs
  - nico-macbook can SSH to all VMs
  - NATS nodes can SSH to each other (cert push during rotation)
  - All nodes can reach Tailscale MagicDNS
  - Sensor nodes are NOT Tailscale members (too resource constrained)
    Sensor node management: SSH via direct IP when on same network,
    or via fortress as bastion (Tailscale → fortress → sensor SSH)

Tailscale subnet router: fortress is configured as subnet router,
advertising 10.0.1.0/24 to Tailscale peers.
This allows nico-macbook to reach nats VNet private IPs
without being in the Azure VNet.
```

### 10.2 Certificate Push via Tailscale

```
When a node client cert is rotated:
  fortress → Tailscale SSH → sensor node (if Tier-1/2 has Tailscale)
           OR
  fortress → internet SSH to sensor node (requires sensor node to be
             reachable — fallback when Tailscale not running on sensor)

Cert push script: /root/infra/pki/push-node-cert.sh {node_id}
  Steps:
    1. ssh-agent with tailscale SSH key
    2. scp {node_id}.crt {node_id}.key root@{sensor_tailscale_ip}:/etc/sentinel/certs/
    3. ssh root@{sensor_tailscale_ip} "systemctl reload sentinel-node-agent"
    4. Verify new cert active: openssl s_client -connect ... | grep CN
    5. Log rotation in cert-inventory.json
```

---

## 11. Bandwidth Estimates

### 11.1 Per-Node Event Rate and Message Size

```
Event rates by node tier (steady-state, no threat):
  Tier 1: 1–5 detection events/minute (background environmental detections)
           1 health heartbeat/30s
  Tier 2: 1–3 detection events/minute
           1 health heartbeat/30s
  Tier 3: 1–2 relayed packets/minute (Meshtastic POSITION_APP)
           1 health heartbeat/30s (via bridge)

Event rates during drone incursion:
  Tier 1: 10–60 detection events/minute (high confidence classifier firing)
  Tier 2: 10–40 detection events/minute
  Tier 3: unchanged (relay rate limited by LoRa duty cycle)

Message sizes:
  Detection event JSON:  400–800 bytes (compressed NATS payload)
  Health heartbeat JSON: 200–350 bytes
  Alert event JSON:      300–600 bytes
  CoT XML:               600–1200 bytes

Tier-1 bandwidth (steady-state):
  Outbound to NATS: 5 events/min × 600 bytes + 2 health/min × 275 bytes
                  = 3000 + 550 = 3550 bytes/min = ~60 bytes/sec
  This is negligible on 4G (typical 20+ Mbps)

Tier-1 bandwidth (incursion, 60 events/min):
  Outbound: 60 × 600 + 2 × 275 = 36,550 bytes/min = ~610 bytes/sec
  Still negligible on 4G

NATS cluster inbound (100-node deployment, incursion):
  100 nodes × 60 events/min × 600 bytes = 3,600,000 bytes/min = 480 KB/s
  Well within 1 Gbps VNet capacity

NATS JetStream storage (DETECTIONS stream, retention 100GB):
  At 480 KB/s sustained: 100GB / 480KB/s = ~58 hours of continuous incursion
  Normal ops (60 bytes/s, 100 nodes): 100 × 60 = 6KB/s → 100GB lasts months
```

### 11.2 Supabase Bandwidth

```
ingest-event Edge Function:
  NATS batch: 100 events × 600 bytes = 60KB per batch invocation
  Batch rate: depends on event rate
  At 100 nodes × 60 events/min = 6000 events/min ÷ 100 per batch = 60 batches/min
  Supabase ingress: 60 batches/min × 60KB = 3.6 MB/min = 60 KB/s

Supabase Realtime:
  alert broadcasts: 1 per drone incursion × 1KB = minimal
  track updates: 1 per TDoA solve × 0.5KB, TDoA rate = 1/5s = 12/min
  At 10 concurrent tracks: 10 × 12/min × 0.5KB = 60KB/min = 1KB/s

Total Supabase bandwidth: ~100 KB/s inbound, ~20 KB/s outbound
Well within Supabase Pro plan limits (100GB transfer/month = 38 KB/s average)
```

---

## 12. Network Failure Modes and Recovery

### 12.1 NATS Cluster Network Failures

```
Failure: Single NATS node unreachable from cluster peers
  Detection: Raft heartbeat timeout (1.5–3s)
  Effect: Raft re-elects leader if affected node was leader; otherwise continues
  Recovery: Automatic, within 5s
  Node data: Catching up via Raft log replication on rejoin

Failure: Network partition splitting cluster into 2+3 groups
  Detection: Raft quorum loss on smaller partition (2-node group)
  Effect: 2-node group becomes read-only (no writes); 3-node group continues
  Recovery: Automatic when partition heals
  Node data: 2-node group replays Raft journal entries on rejoin

Failure: All NATS nodes unreachable from sensor nodes (internet outage)
  Detection: NATS client connection timeout (30s)
  Effect: Sensor nodes buffer events in local ring buffer (10,000 events)
  Recovery: On reconnect, buffered events are published to NATS
  Data loss: Ring buffer overflow (>10,000 events) causes oldest to be dropped

Failure: Supabase unreachable from fortress
  Detection: HTTP timeout (10s) from TDoA service or DLQ processor
  Effect: Track writes fail; TDoA solves are logged locally (no Supabase write)
  Recovery: On reconnect, locally buffered solves are replayed
  Local buffer: /var/lib/sentinel/tdoa-buffer.jsonl (10MB ring file)
```

### 12.2 Latency Degradation Thresholds

```
Metric                                    │ Normal   │ Warning  │ Critical
──────────────────────────────────────────┼──────────┼──────────┼─────────
NATS publish RTT (node → cluster)         │ <10ms    │ >50ms    │ >200ms
ingest-event Edge Fn p95 latency          │ <200ms   │ >500ms   │ >1000ms
TDoA solve time                           │ <100ms   │ >300ms   │ >1000ms
alert-router p95 latency                  │ <300ms   │ >700ms   │ >1500ms
Telegram send latency                     │ <500ms   │ >1000ms  │ >3000ms
Total detect → Telegram pipeline          │ <1500ms  │ >2000ms  │ >4000ms
Supabase pgbouncer connect time           │ <20ms    │ >100ms   │ >500ms
NATS cluster leader election time         │ <3s      │ >5s      │ >10s
```

All thresholds are monitored via Prometheus alerts configured on fortress. Warning thresholds send to TELEGRAM_ENGINEERING_CHAT_ID; Critical thresholds page the on-call operator.
