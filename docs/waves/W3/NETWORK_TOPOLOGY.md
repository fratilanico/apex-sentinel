# APEX-SENTINEL — Network Topology
## W3 | PROJECTAPEX Doc 21/21 | 2026-03-24

Wave 3: React Native (Expo) mobile app — Android + iOS

---

## 1. Overview: Three Connectivity Modes

APEX Sentinel mobile nodes operate in one of three network modes, automatically selected
based on available connectivity:

```
Mode 1: 4G/5G (Primary)
  NATS.ws → wss://nats.apex-sentinel.io:443
  Supabase → https://bymfcnwfyxuivinuzurr.supabase.co
  Full capability: detect, publish, receive alerts, map tiles

Mode 2: WiFi (Primary — identical to 4G path)
  Same endpoints as Mode 1. No protocol difference.
  Detection performance identical.

Mode 3: Offline → Meshtastic BLE → LoRa → Gateway → NATS
  Mobile node publishes via BLE to paired Meshtastic LoRa device
  LoRa mesh routes to gateway node with NATS connectivity
  Alert receipt via Meshtastic mesh (no push notifications)
  Map: offline tiles only (pre-cached in Mode 1/2)
```

Mode selection is automatic and transparent to the user. Status shown on home screen.

---

## 2. Mode 1: 4G/5G Primary Connectivity

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MODE 1: 4G/5G CONNECTIVITY                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌────────────────────┐                            │
│  │ APEX Sentinel│         │  Mobile Network    │                            │
│  │ Mobile App   │         │  (4G LTE / 5G NR)  │                            │
│  │              │ ──────▶ │                    │                            │
│  │  Android     │  TLS    │  RTT: 30–80ms      │                            │
│  │  or iOS      │  1.3    │  BW: 5–100Mbps     │                            │
│  └──────────────┘         └──────────┬─────────┘                            │
│                                      │                                      │
│           ┌──────────────────────────┼────────────────────────────┐         │
│           │                          │                            │         │
│           ▼                          ▼                            ▼         │
│  ┌─────────────────┐    ┌───────────────────────┐    ┌──────────────────┐  │
│  │  nginx WebSocket│    │  Supabase Edge         │    │  Mapbox CDN      │  │
│  │  Proxy          │    │  Functions             │    │  maps.mapbox.com │  │
│  │                 │    │  bymfcnwfyxuivinuzurr  │    │  Tile delivery   │  │
│  │  :443/ws        │    │  .supabase.co          │    │  ≤ 500ms P95     │  │
│  │  TLS terminate  │    │                        │    └──────────────────┘  │
│  │  WS upgrade     │    │  register-node         │                          │
│  └────────┬────────┘    │  node-health           │    ┌──────────────────┐  │
│           │              │  ingest-event          │    │  Expo Push API   │  │
│           ▼              │  alert-router          │    │  api.expo.dev    │  │
│  ┌─────────────────┐    └──────────┬─────────────┘    │  → APNS / FCM   │  │
│  │  NATS JetStream │               │                   └──────────────────┘  │
│  │  5-node cluster │               │                                         │
│  │  Raft consensus │               ▼                                         │
│  │                 │    ┌──────────────────────┐                             │
│  │  DETECTIONS     │    │  PostgreSQL           │                             │
│  │  ALERTS         │    │  (Supabase)           │                             │
│  │  NODE_HEALTH    │    │  bymfcnwfyxuivinuzurr │                             │
│  │  MODEL          │    │  eu-west-2            │                             │
│  └─────────────────┘    └──────────────────────┘                             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Connections from mobile app:
  1. wss://nats.apex-sentinel.io:443/ws     (NATS.ws — persistent WebSocket)
  2. https://bymfcnwfyxuivinuzurr.supabase.co  (HTTPS — request/response)
  3. https://api.mapbox.com                 (HTTPS — tile requests, cached)
  4. https://api.expo.dev/v2/push/send     (HTTPS — via W2 alert-router, not directly)
  5. https://o1234.ingest.sentry.io        (HTTPS — crash reports, batched)
  6. https://models.apex-sentinel.io       (HTTPS — model OTA, infrequent)
```

### 2.1 NATS.ws Proxy (nginx WebSocket Upgrade)

The NATS cluster exposes native TCP port 4222 (NATS protocol). The nginx proxy converts
WebSocket connections to NATS TCP for mobile clients.

```
nginx config (excerpt):
  server {
    listen 443 ssl http2;
    server_name nats.apex-sentinel.io;

    ssl_certificate     /etc/letsencrypt/live/nats.apex-sentinel.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nats.apex-sentinel.io/privkey.pem;
    ssl_protocols TLSv1.3;
    ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;

    location /ws {
      proxy_pass http://127.0.0.1:4222;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_read_timeout 86400s;   # 24h — keep WS alive
      proxy_send_timeout 86400s;
      proxy_buffering off;

      # WebSocket connection rate limit
      limit_conn ws_perip 5;        # 5 concurrent WS per IP
      limit_req zone=ws_ratelimit burst=10 nodelay;
    }
  }

  # Rate limiting zones
  limit_conn_zone $binary_remote_addr zone=ws_perip:10m;
  limit_req_zone $binary_remote_addr zone=ws_ratelimit:10m rate=10r/s;
```

### 2.2 TLS Certificate Chain

```
Certificate Authority:
  Root CA: ISRG Root X1 (Let's Encrypt)
  Intermediate: E5 or R10 (Let's Encrypt)
  Leaf: nats.apex-sentinel.io

Certificate pinning (mobile app):
  SHA-256 SPKI pin of intermediate cert stored in NATSConfig.certSpkiPinSha256
  Pin verified in custom TLS validation callback (nats.ws tls option)
  If pin mismatch: connection rejected, Sentry event fired

Certificate renewal:
  Let's Encrypt auto-renews every 60 days via certbot systemd timer
  Pin update: deployed via EAS OTA update (JS-only change)
  Pin rotation window: deploy new pin while old pin still valid (overlap period ≥ 14 days)
```

### 2.3 Bandwidth Estimates (Mode 1, per active node per hour)

```
Connection           Direction    Rate        Hourly
─────────────────────────────────────────────────────
NATS WS detection    Upstream     1Hz × 512B  1.8 KB
NATS WS heartbeat    Upstream     1/30s × 128B 15 KB
NATS WS alerts       Downstream   ~0.1/s × 1KB 360 KB
NATS WS keepalive    Both         PING/PONG   <1 KB
Supabase (node reg)  Upstream     Once/launch ~2 KB
Supabase (health)    Upstream     1/5min × 256B 3 KB
Mapbox tiles         Downstream   Cached       ~0 KB (after initial dl)
Sentry               Upstream     Batched      <10 KB
─────────────────────────────────────────────────────
TOTAL (passive)                               ~392 KB/hr
TOTAL (active, 4Hz)                           ~450 KB/hr

Data use per month (passive, 24/7): 392KB × 730h = 286 MB/month
```

---

## 3. Mode 2: WiFi Connectivity

WiFi mode is functionally identical to 4G mode. The NATS.ws connection, Supabase calls,
and push notification path are unchanged.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MODE 2: WIFI CONNECTIVITY                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────────────┐ │
│  │ APEX Sentinel│       │  WiFi AP     │       │  Internet            │ │
│  │ Mobile App   │──────▶│  802.11ac/ax │──────▶│  (same as Mode 1)   │ │
│  │              │ TLS   │              │  DHCP  │                      │ │
│  └──────────────┘  1.3  └──────────────┘        └──────────────────────┘ │
│                                                                          │
│  RTT: typically 5–30ms (lower than 4G)                                  │
│  Bandwidth: typically 10–300Mbps                                         │
│                                                                          │
│  Behavioral differences vs 4G:                                           │
│  • Lower NATS.ws connection latency                                       │
│  • Offline tile download recommended over WiFi (120MB for full region)  │
│  • iOS: WiFi uses different network interface, App may switch between    │
│    WiFi and cellular if WiFi signal weak → NATS reconnect triggered      │
│    → handled by auto-reconnect logic (FR-W3-05-02)                      │
│                                                                          │
│  Network transitions (WiFi ↔ 4G):                                        │
│  iOS Network.framework handles transparently with multipath TCP support  │
│  Android: NetworkCallback triggers on network change                      │
│  In both cases: NATS.ws detects socket close → reconnect in ≤ 2s        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Mode 3: Offline — Meshtastic BLE → LoRa → Gateway → NATS

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MODE 3: OFFLINE / MESHTASTIC MESH                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐                                                          │
│  │  APEX Sentinel │  No cellular/WiFi                                        │
│  │  Mobile App    │  NATS CircuitBreaker OPEN > 60s                          │
│  │  (Tier-4 Node) │                                                          │
│  └───────┬────────┘                                                          │
│          │                                                                   │
│          │  BLE 5.0 (GATT)                                                  │
│          │  Service: 6ba1b218-15a8-461f-9fa8-5d6646c0be5b                   │
│          │  Range: ≤ 30m                                                     │
│          ▼                                                                   │
│  ┌────────────────┐                                                          │
│  │  Meshtastic    │                                                          │
│  │  LoRa Device   │  (e.g. Heltec LoRa 32 V3, RAK WisBlock)               │
│  │  (Paired)      │                                                          │
│  │                │  Firmware: Meshtastic ≥ 2.5.0                           │
│  └───────┬────────┘                                                          │
│          │                                                                   │
│          │  LoRa (915MHz USA / 868MHz EU / 433MHz AS)                        │
│          │  Bandwidth: 250 kHz, SF7–SF12, CR 4/8                            │
│          │  Range: 1–15km (line of sight)                                   │
│          │  Data rate: 0.98–5.47 kbps (SF12 vs SF7)                         │
│          ▼                                                                   │
│  ┌────────────────┐     Optional:    ┌──────────────────┐                  │
│  │  LoRa Mesh     │     relay hops   │  Relay Node 1    │                  │
│  │  Network       │◀────────────────▶│  (another        │                  │
│  │                │                  │  Meshtastic      │                  │
│  │  Self-healing, │                  │  device)         │                  │
│  │  AODV routing  │                  └──────────────────┘                  │
│  └───────┬────────┘                                                          │
│          │                                                                   │
│          │  LoRa → BLE → WiFi/4G                                             │
│          ▼                                                                   │
│  ┌────────────────┐                                                          │
│  │  Gateway Node  │  Meshtastic device with internet connectivity           │
│  │  (Fixed)       │  (WiFi or 4G router)                                   │
│  │                │  Runs: meshtastic-nats-bridge service                   │
│  │  Tier-4 always │                                                          │
│  │  online node   │                                                          │
│  └───────┬────────┘                                                          │
│          │                                                                   │
│          │  wss://nats.apex-sentinel.io:443                                  │
│          │  TLS 1.3                                                          │
│          ▼                                                                   │
│  ┌────────────────┐                                                          │
│  │  NATS JetStream│                                                          │
│  │  Cluster (W2)  │                                                          │
│  │                │  Detection event reaches NATS via gateway               │
│  │  sentinel.     │  with additional latency vs direct path                 │
│  │  detections.   │                                                          │
│  │  {nodeId}      │                                                          │
│  └────────────────┘                                                          │
│                                                                              │
│  ALERT RECEIPT IN OFFLINE MODE:                                              │
│  NATS → alert-router → Meshtastic gateway → LoRa → mobile Meshtastic →     │
│  BLE → app                                                                  │
│  (No APNS/FCM — push requires internet. Alert visible in-app only.)         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 LoRa Radio Parameters

```
Frequency: 868.0 MHz (EU), 915.0 MHz (US), 433.175 MHz (AS)
Bandwidth: 250 kHz (Meshtastic default for long-range mode)
Spreading factor: SF12 (maximum range, ~730 bps) or SF7 (shorter range, ~5470 bps)
Coding rate: 4/8
Max payload: 255 bytes (LoRa physical layer)
Meshtastic max packet: 237 bytes (after headers)

Detection event payload (encoded for LoRa transmission):
  Using msgpack compact encoding:
  { n: nodeId, t: timestamp_us, c: threat_class, s: confidence }
  Estimated size: ~60 bytes → fits in single LoRa packet
```

### 4.2 LoRa Range Estimates

```
Environment                 Range (868MHz, SF12, 250kHz, 14dBm)
────────────────────────────────────────────────────────────────
Open field (line-of-sight)  10–15 km
Suburban (partial obstruct) 3–8 km
Urban (buildings)           1–3 km
Dense forest                0.5–2 km
```

### 4.3 Meshtastic-NATS Bridge (Gateway Service)

Running on gateway Meshtastic node (Linux, Python):

```bash
# Service: meshtastic-nats-bridge
# Location: /etc/systemd/system/meshtastic-nats-bridge.service
# Script: /opt/apex/meshtastic-nats-bridge/bridge.py

# Function: listen on Meshtastic BLE/serial → decode packet →
#           publish to NATS sentinel.mesh.inbound.{nodeId}
#           OR: re-encode as sentinel.detections.{nodeId} if detection packet

# W2 Meshtastic bridge handles this service (deployed in W2 infra layer)
```

---

## 5. Connectivity Mode Detection + Switching

```typescript
// src/network/ConnectivityManager.ts

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { NATSClient } from '../nats/NATSClient';
import { MeshtasticBridge } from '../ble/MeshtasticBridge';

export type ConnectivityMode = 'ONLINE_4G' | 'ONLINE_WIFI' | 'OFFLINE_MESH' | 'OFFLINE_NO_MESH';

const CIRCUIT_OPEN_THRESHOLD_MS = 60_000; // 60s before switching to mesh mode

export class ConnectivityManager {
  private mode: ConnectivityMode = 'ONLINE_4G';
  private circuitOpenAt: number | null = null;

  constructor(
    private nats: NATSClient,
    private mesh: MeshtasticBridge,
  ) {}

  async startMonitoring(): Promise<void> {
    // NetInfo: track WiFi vs cellular
    NetInfo.addEventListener((state: NetInfoState) => {
      if (!state.isConnected) {
        this.handleOffline();
      } else if (state.type === 'wifi') {
        this.setMode('ONLINE_WIFI');
      } else {
        this.setMode('ONLINE_4G');
      }
    });

    // NATS circuit breaker: track open duration
    setInterval(() => {
      if (this.nats.state === 'OPEN') {
        if (!this.circuitOpenAt) {
          this.circuitOpenAt = Date.now();
        } else if (Date.now() - this.circuitOpenAt > CIRCUIT_OPEN_THRESHOLD_MS) {
          this.activateMeshMode();
        }
      } else {
        this.circuitOpenAt = null;
        if (this.mode === 'OFFLINE_MESH') {
          this.deactivateMeshMode();
        }
      }
    }, 5000);
  }

  private handleOffline(): void {
    if (this.mesh.isConnected) {
      this.setMode('OFFLINE_MESH');
    } else {
      this.setMode('OFFLINE_NO_MESH');
      this.mesh.startScan();
    }
  }

  private activateMeshMode(): void {
    this.mesh.startScan();
    this.setMode('OFFLINE_MESH');
  }

  private deactivateMeshMode(): void {
    this.setMode(this.getOnlineType());
  }

  private getOnlineType(): ConnectivityMode {
    // Re-check NetInfo
    return 'ONLINE_4G'; // simplified
  }

  private setMode(mode: ConnectivityMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      // Notify Zustand store → home screen status indicator updates
    }
  }

  get currentMode(): ConnectivityMode { return this.mode; }
}
```

---

## 6. DNS + IP Configuration

```
Public endpoints (mobile app connects to):
  nats.apex-sentinel.io       → load balancer / nginx proxy VIP
  bymfcnwfyxuivinuzurr.supabase.co → Supabase (managed, Cloudflare edge)
  api.mapbox.com              → Mapbox CDN (managed)
  api.expo.dev                → Expo services (managed)
  models.apex-sentinel.io     → BunnyCDN origin pull

DNS TTL:
  nats.apex-sentinel.io: 300s (5 minutes) — low TTL for failover
  models.apex-sentinel.io: 3600s (1 hour) — CDN, high TTL acceptable

Mobile DNS behavior:
  Android: uses system resolver (typically ISP or Google 8.8.8.8)
  iOS: uses system resolver
  No custom DNS configured in app — relies on system resolver
  DNSSEC: not enforced (relying on TLS certificate pinning instead)
```

---

## 7. Firewall + Port Requirements

```
Required outbound ports (mobile device to internet):
  443/TCP — NATS.ws (WebSocket over TLS), Supabase HTTPS, Mapbox HTTPS,
             Expo Push HTTPS, Sentry HTTPS, CDN HTTPS
  All other ports: NOT required

Blocked by typical corporate firewalls (and mitigations):
  Port 4222/TCP (native NATS): NOT used by mobile app — we use 443/TCP via nginx WS proxy
  Port 9090/TCP (Prometheus): NOT used by mobile app

Enterprise WiFi with deep packet inspection:
  TLS 1.3 prevents DPI payload inspection
  WebSocket upgrade may be blocked by some enterprise proxies
  Mitigation: if WS upgrade blocked, show error "Corporate firewall detected.
  Please use mobile data for detection."
```

---

## 8. Latency Budget Summary

```
Path                                    P50    P95    P99    Limit
────────────────────────────────────────────────────────────────────
PCM frame → TFLite inference (Android)  70ms   100ms  150ms  150ms ✓
PCM frame → CoreML inference (iOS)      60ms   90ms   150ms  150ms ✓
Gate3 fire → NATS publish initiate       5ms    10ms   20ms   50ms  ✓
NATS publish → ACK (4G, 50ms RTT)      120ms  250ms  350ms  500ms ✓
NATS alert publish → app receipt       150ms  300ms  500ms  1000ms ✓
App alert receipt → push notification  100ms  200ms  300ms  500ms ✓
APNS/FCM → device lock screen         300ms  800ms  1500ms 2000ms ✓
Registration POST → node_id received   400ms  800ms  1500ms 5000ms ✓
BLE write → LoRa transmit               30ms   50ms   80ms   200ms ✓
LoRa → gateway → NATS (1 hop, 2km)    100ms  200ms  400ms  1000ms ✓
```
