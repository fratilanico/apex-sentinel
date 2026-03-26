# APEX-SENTINEL W9 — Architecture Document

> Wave: W9 | Theme: Live Data Feed Integration
> Status: PLANNING | Date: 2026-03-26

---

## System Architecture Overview (Post-W9)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      LIVE FEED LAYER (W9 NEW)                        │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐  │
│  │  ADS-B Exchange  │  │   Open-Meteo API  │  │  Civil Protect.  │  │
│  │  (adsb.lol 5s)   │  │  (free, no key)   │  │  ERCC + alerts   │  │
│  │  Aircraft bbox   │  │  Wind/vis/temp     │  │  .in.ua CAP-like │  │
│  └────────┬─────────┘  └────────┬──────────┘  └────────┬─────────┘  │
│           │                     │                       │            │
│  ┌────────┴─────────┐  ┌────────┴──────────┐  ┌────────┴─────────┐  │
│  │   GdeltClient    │  │  RemoteIdReceiver │  │                  │  │
│  │  GDELT 2.0 geo   │  │  ASTM F3411 BLE   │  │                  │  │
│  │  bbox + keywords │  │  + WiFi beacons   │  │                  │  │
│  └────────┬─────────┘  └────────┬──────────┘  └──────────────────┘  │
└───────────┼─────────────────────┼────────────────────────────────────┘
            │ NATS JetStream feed.*│
            ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BROKER / ENRICHMENT LAYER (W9 NEW)             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  DataFeedBroker                                              │   │
│  │  - Consumes feed.* subjects (NATS JetStream)                 │   │
│  │  - Deduplication via SHA-256 content hash                    │   │
│  │  - Publishes deduplicated output to feed.fused               │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                          │ feed.fused                                │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │  ThreatContextEnricher                                        │  │
│  │  - Subscribes detection.* (existing pipeline output)          │  │
│  │  - Looks back 60s in feed.fused ring buffer                   │  │
│  │  - Attaches context: nearby aircraft, weather, active alerts  │  │
│  │  - Publishes detection.enriched                               │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────────┘
                            │ detection.enriched
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GATEWAY LAYER (fortress)                      │
│  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │  Dashboard API   │   │  CotRelay (ATAK) │   │  TelegramBot   │  │
│  │  + LiveFeedAdapt │   │  CoT XML output  │   │  alert push    │  │
│  │  SSE /feed/live  │   │                  │   │                │  │
│  └──────────────────┘   └──────────────────┘   └─────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  NATS JetStream Backbone  (mTLS, 5-node Raft, KV for OTA)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
┌────────────┐    ┌────────────┐    ┌────────────┐
│  Node A    │    │  Node B    │    │  Node C    │
│  RPi4/     │    │  Jetson    │    │  RPi4/     │
│  Jetson    │    │  Nano      │    │  Jetson    │
│  16kHz ✓   │    │  16kHz ✓   │    │  16kHz ✓   │
│  YAMNet    │    │  YAMNet    │    │  YAMNet    │
│  480KB     │    │  480KB     │    │  480KB     │
└──────┬─────┘    └──────┬─────┘    └──────┬─────┘
       │                 │                 │
       └─────────TDoA NATS events──────────┘
                         │
            ┌────────────▼─────────────┐
            │  SentinelPipelineV2      │
            │  TDoA → EKF → Terminal   │
            │  BearingTriangulator     │
            │  MultiNodeFusion         │
            │  FalsePositiveGuard      │
            └────────────┬─────────────┘
                         │ detection.*
                         ▼ (also consumed by ThreatContextEnricher)
            ┌────────────▼─────────────┐
            │  OUTPUT LAYER            │
            │  PTZ slave  (ONVIF)      │
            │  JammerActivation        │
            │  PhysicalIntercept       │
            │  BRAVE1 format           │
            └──────────────────────────┘
```

---

## W9 Architecture Changes

### 1. Feed Client Architecture

Each feed client is a standalone TypeScript class implementing the `FeedClient` interface:

```
interface FeedClient {
  readonly subject: string;    // NATS subject this client publishes to
  start(): Promise<void>;      // begin polling / listening
  stop(): Promise<void>;       // clean shutdown
}
```

Five feed clients are introduced in W9:

```
AdsbExchangeClient     → publishes to  feed.adsb.aircraft
OpenMeteoClient        → publishes to  feed.weather.current
CivilProtectionClient  → publishes to  feed.alerts.active
GdeltClient            → publishes to  feed.osint.events
RemoteIdReceiver       → publishes to  feed.rf.remote_id
```

All HTTP-backed clients (ADS-B, Open-Meteo, Civil Protection, GDELT) use the same
retry pattern: exponential backoff with jitter, max 3 retries per poll cycle,
fail-silent on exhaustion (event not published for that cycle, no crash).

RemoteIdReceiver is event-driven rather than polling: it binds to BLE + WiFi
interfaces and emits a `beacon` event for each F3411 frame decoded.

### 2. DataFeedBroker — Deduplication Architecture

```
DataFeedBroker:
  - Subscribes to feed.* wildcard via NATS JetStream consumer
  - Maintains in-memory dedup map: SHA-256(payload) → expiresAt (TTL: 30s)
  - On new message:
      1. Compute SHA-256 of raw payload string
      2. If hash present in dedup map → discard
      3. If hash absent → stamp with receivedAt, add source tag, publish feed.fused
      4. Insert hash into dedup map with expiresAt = now + 30s
  - Dedup map GC runs every 60s, purges expired entries
  - feed.fused message envelope:
      { source, subject, receivedAt, payload, contentHash }
```

### 3. ThreatContextEnricher — Correlation Architecture

```
ThreatContextEnricher:
  - Subscribes to detection.* (existing acoustic detections from SentinelPipelineV2)
  - Maintains ring buffer of feed.fused messages (lookback: 60s, max: 500 entries)
  - On each detection.* message:
      1. Extract detection lat/lon, timestamp
      2. Query ring buffer for feed entries within lookback window
      3. ADS-B: find aircraft within 5km radius of detection position
      4. Weather: find most recent weather snapshot for nearest node
      5. Alerts: include all currently active government alerts matching
                 detection country code
      6. OSINT: include GDELT events from last 60s matching detection bbox
      7. Remote ID: include any F3411 beacons within 500m of detection position
      8. Assemble context object, attach to detection, publish detection.enriched
  - Latency target: enrichment adds <50ms to detection pipeline
  - If ring buffer empty (feeds not yet populated): publish detection as-is
    with context.available = false
```

### 4. LiveFeedAdapter — Dashboard SSE Architecture

```
LiveFeedAdapter (src/ui/demo-dashboard/live-feed-adapter.ts):
  - Subscribes to feed.fused via NATS
  - Maintains SSE connection pool (one EventSource per connected dashboard client)
  - Routes by subject:
      feed.adsb.aircraft   → SSE event: "adsb"
      feed.weather.current → SSE event: "weather"
      feed.alerts.active   → SSE event: "alert"
      feed.osint.events    → SSE event: "osint"
      feed.rf.remote_id    → SSE event: "remoteid"
  - Heartbeat every 15s to all SSE clients
  - Dashboard API route: GET /api/feed/live (SSE stream)
```

### 5. New NATS Subjects (W9)

```
feed.adsb.aircraft      — ADS-B aircraft positions within deployment bbox
feed.weather.current    — Open-Meteo snapshot for node coordinates
feed.alerts.active      — Civil protection + ERCC + alerts.in.ua active alerts
feed.osint.events       — GDELT 2.0 geo-filtered events (Romania bbox)
feed.rf.remote_id       — ASTM F3411 Remote ID beacons detected
feed.fused              — Aggregated, deduplicated, timestamped feed
detection.enriched      — Existing detections annotated with feed context
```

### 6. Privacy Constraints on Feed Data

ADS-B raw positions: logged to NATS ring buffer only, not persisted to Supabase.
GDELT events: no PII fields ingested; only event_type, bbox, date, url.
Remote ID operator location: coarsened to ±50m grid cell before any storage
  (same grid coarsening applied to detection positions in W7 GDPR layer).
Weather and civil protection feeds: no PII; stored normally.

---

## Data Flow: Enriched Detection Event (End-to-End W9)

```
Feed Sources           DataFeedBroker         ThreatContextEnricher    Operator
──────────────────────────────────────────────────────────────────────────────
1. ADS-B poll (5s)
2. Open-Meteo poll
3. Civil prot. poll
4. GDELT poll
5. Remote ID beacon
                       6. Dedup + fuse
                          → feed.fused
                                              7. SentinelPipelineV2
                                                 emits detection.*
                                              8. Enricher queries
                                                 60s ring buffer
                                              9. Attaches context
                                             10. Publishes
                                                 detection.enriched
                                                                      11. Dashboard
                                                                          map shows
                                                                          enriched
                                                                          track card
                                                                          (aircraft
                                                                          nearby,
                                                                          weather,
                                                                          active
                                                                          alerts)
```

---

## Dependency Map

```
W9-01 (ADS-B client)            ← adsb.lol public API (no key required)
W9-02 (Open-Meteo client)       ← open-meteo.com public API (no key required)
W9-03 (civil protection client) ← ERCC API + alerts.in.ua JSON (public)
W9-04 (GDELT client)            ← gdelt.gov GDELT 2.0 API (public)
W9-05 (Remote ID receiver)      ← node-ble + node-wifi-scanner npm
W9-06 (DataFeedBroker)          ← W9-01 to W9-05 (all feed clients)
W9-07 (ThreatContextEnricher)   ← W9-06 (DataFeedBroker), SentinelPipelineV2
W9-08 (dashboard live feeds)    ← W9-06 (DataFeedBroker), existing Dashboard API
W9-privacy-regression           ← W9-01, W9-04, W9-05 (privacy constraints)
```
