# APEX-SENTINEL W9 — Design Document

> Wave: W9 | Theme: Live Data Feed Integration
> Status: PLAN | Date: 2026-03-26

---

## Vision

W9 gives APEX-SENTINEL situational awareness beyond its own sensors. W1-W8 built a complete acoustic/RF detection pipeline (1860 tests, 96%+ coverage, field-trial ready). The system detects drones with high recall, tracks multiple threats simultaneously, and outputs enriched events to operators. What it cannot do is answer the questions an operator actually asks:

- "Is that sound a cooperative general aviation aircraft, not a drone?"
- "Is wind affecting how far the microphones can hear right now?"
- "Is there an active air raid alert in this sector?"
- "Has OSINT reported anything in this area in the last 24 hours?"

W9 answers all four by integrating 5 live external feed producers into a DataFeedBroker aggregation layer, which in turn feeds a ThreatContextEnricher that annotates every detection event with correlated context before it reaches the operator dashboard.

---

## Feed Layer Architecture

### Design Principle: Typed Producers → NATS Subjects → Single Fused Stream

Each external data source is encapsulated as a typed `FeedProducer` class. Producers are the only code that makes external HTTP/BLE/WiFi calls. They transform raw external payloads into internal schema types and publish to a namespaced NATS subject. No downstream code ever touches an external API directly.

```
External Sources                Producers                  NATS Subjects
────────────────                ─────────────              ────────────────────────
adsb.lol HTTPS API    →   AdsbFeedProducer        →   feed.adsb.aircraft
                                                        feed.adsb.emergency
                                                        feed.adsb.status

Open-Meteo HTTPS API  →   WeatherFeedProducer     →   feed.weather.current
                                                        feed.weather.acoustic_adjustment
                                                        feed.weather.advisory

alerts.in.ua API      →   AlertFeedProducer       →   feed.alerts.active
EU Civil Protection         (+ EU RSS parser)          feed.alerts.status

GDELT GKG API         →   GdeltFeedProducer       →   feed.osint.gdelt
                                                        feed.osint.surge

BLE/WiFi adapter      →   RemoteIdReceiver        →   feed.rf.remote_id
(ASTM F3411)
```

### NATS Subject Namespace

All feed subjects live under `feed.*`. The full subject tree:

```
feed.adsb.aircraft          — AdsbAircraft[] array, every 5s
feed.adsb.emergency         — aircraft squawking 7700/7600/7500
feed.adsb.status            — producer health { healthy, last_poll, error? }

feed.weather.current        — WeatherSnapshot (wind, temp, precip, visibility)
feed.weather.acoustic_adjustment — { range_factor: 0.82, reason: 'wind_15ms' }
feed.weather.advisory       — { degraded: true, reason: 'high_wind' }

feed.alerts.active          — AlertEvent[] currently active in geo-window
feed.alerts.status          — producer health

feed.osint.gdelt            — GdeltEvent[] batch, every 15 min
feed.osint.surge            — { active: true, count: N, themes: [...] }

feed.rf.remote_id           — RemoteIdObservation (event-driven, no polling)

feed.fused                  — unified coarsened envelope from DataFeedBroker
```

---

## DataFeedBroker

The `DataFeedBroker` is the aggregation hub. It is the only subscriber to raw `feed.*` subjects (except `feed.fused`, which it publishes). All downstream consumers — ThreatContextEnricher, dashboard, ATAK exporter — subscribe only to `feed.fused`.

### Responsibilities

**1. Aggregation**
Maintains an in-memory sliding-window cache per feed type:
- ADS-B: last 60s of aircraft observations, keyed by ICAO hex
- Weather: single current snapshot, updated on every `feed.weather.current` message
- Alerts: set of currently active alerts, keyed by `(source, region)`
- OSINT: last 15 minutes of GdeltEvents; surge state derived from count
- Remote ID: last 30s of observations, keyed by uas_id

**2. Deduplication**
Deduplication key: `SHA-256( source + event_id + floor(timestamp / 30000) )`.
Duplicate events within any 30-second bucket are dropped before publishing to `feed.fused`. This prevents feed polling jitter from producing duplicate enrichment entries.

**3. GDPR Coordinate Coarsening**
All lat/lon values in any incoming feed event are rounded to the nearest 0.0005° (~55m) before being written to `feed.fused`. Raw coordinates are never written to `feed.fused`. The coarsening function is the same ±50m grid function used in the core detection pipeline (imported from `lib/privacy/coarsen.ts`).

```typescript
// Coarsening: 0.0005° ≈ 55m at equator
function coarsen(coord: number): number {
  return Math.round(coord / 0.0005) * 0.0005;
}
```

**4. TTL Eviction**
The broker maintains a NATS JetStream KV bucket `feed_cache` with a 4-hour TTL for all raw event history. After 4 hours, raw event data is irrecoverably evicted. This satisfies the data minimisation requirement of GDPR Art.5(1)(e) for position-adjacent data.

**5. Back-Pressure**
If the `feed.fused` consumer group is >1000 messages behind (measured via NATS consumer pending count), the broker applies a token-bucket throttle at 200 messages/second. This prevents a slow dashboard client from causing unbounded NATS queue growth.

**6. Metrics**
Prometheus metrics exposed at `GET /metrics` (Prometheus text format):
```
feed_events_received_total{source="adsb|weather|alerts|osint|remote_id"}
feed_events_deduplicated_total{source="..."}
feed_events_published_total
feed_broker_queue_depth
feed_producer_last_event_age_seconds{producer="..."}
```

### DataFeedBroker Class Interface

```typescript
interface DataFeedBroker {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): FeedBrokerHealth;  // per-producer status + queue depth
  getSnapshot(): FeedSnapshot; // current cached state for enricher lookups
}

interface FeedSnapshot {
  aircraft: AdsbAircraft[];          // last 60s, ICAO-keyed
  weather: WeatherSnapshot | null;
  activeAlerts: AlertEvent[];
  osintSurge: OsintSurgeState;
  remoteIdObservations: RemoteIdObservation[]; // last 30s
}
```

---

## ThreatContextEnricher

The `ThreatContextEnricher` sits between the raw detection pipeline and all operator-facing outputs.

### Data Flow

```
SentinelPipelineV2
      │
      ▼
detection.raw  ──────────────────────────────────►  NATS KV (audit, 4h TTL)
      │
      ▼
ThreatContextEnricher
      │   ├── queries DataFeedBroker.getSnapshot()
      │   ├── applies spatial/temporal correlation
      │   ├── computes threat_score_modifier
      │   └── assembles DetectionEnriched
      │
      ▼
detection.enriched ─────────────────────────────►  DemoDashboardApi
                                                ►  ATAKExporter
                                                ►  AlertEscalator
```

### Correlation Windows

| Feed Type | Spatial Window | Temporal Window | Correlation Logic |
|-----------|---------------|-----------------|-------------------|
| ADS-B | 500m radius | ±30s | aircraft whose coarsened lat/lon is within 500m of detection coarsened lat/lon |
| Remote ID | 200m radius | ±10s | tighter window because Remote ID is position-precise |
| Alerts | polygon coverage | immediate | detection lat/lon point-in-polygon check against alert geometry |
| Weather | deployment-wide | rolling | single current snapshot applies to all detections (no geo-filter) |
| OSINT | 500m bounding box | rolling 15 min | GDELT event lat/lon within 500m |

### Threat Score Modifiers

Modifiers are multiplicative and applied in order:

```
base_score = detection.raw.threat_score

× 2.0  if active alert level = critical
× 1.5  if active alert level = warning
× 1.3  if remote_id.present = false  (uncooperative/rogue)
× 1.0  baseline (no active alert, no remote_id signal)
× 0.7  if remote_id.present = true AND remote_id.compliant = true
× 0.6  if adsb.cooperative_aircraft_count > 0 AND nearest_dist_m < 300

final_score = base_score × product(applicable_modifiers)
```

Score modifiers do not change the raw acoustic confidence values. They adjust only the composite `threat_score` on the enriched event, which governs alert escalation tier.

### Performance Target

≥95% of `detection.raw` events enriched and published to `detection.enriched` within 2 seconds of receipt. The enricher uses the in-memory `FeedSnapshot` from the broker (no additional network calls at enrichment time). The 2-second budget is dominated by NATS round-trip latency.

---

## GDAL/GeoJSON Zone Overlap Checks

Alert polygon coverage checks use GeoJSON `point-in-polygon` computation. The full GDAL dependency is not imported; instead, a lightweight TypeScript implementation of the ray-casting algorithm handles polygon containment.

```typescript
// Ray-casting point-in-polygon (no GDAL dependency)
function pointInPolygon(point: [number, number], polygon: GeoJsonPolygon): boolean
```

Alert geometries are fetched as GeoJSON `Polygon` or `MultiPolygon` features from the alert feed. For simple circular advisory zones (alerts.in.ua uses 25km radius circles), the check is a Haversine distance comparison instead.

Coordinate system: WGS-84 throughout. No projection required for the distances involved (<500 km).

---

## Polling Intervals

| Feed | Interval | Rationale |
|------|---------|-----------|
| ADS-B (adsb.lol) | 5 seconds | adsb.lol free tier allows 5s; aircraft move ~40m/s at low altitude |
| Weather (Open-Meteo) | 60 seconds | Atmospheric conditions change on minute scale; hourly forecast is sufficient |
| Active alerts (alerts.in.ua) | 30 seconds | Alert onset is the critical event; 30s lag is operationally acceptable |
| EU Civil Protection RSS | 5 minutes | RSS feed updates on 5-minute cadence |
| GDELT GKG | 15 minutes | GDELT publishes in 15-minute batches |
| Remote ID | Event-driven | BLE/WiFi frame arrival triggers immediate publish; no polling |

---

## Privacy Architecture

### Principles
- **No raw GPS stored beyond 4 hours.** All raw coordinates from external feeds are evicted from NATS KV after 4 hours via TTL.
- **±50m grid coarsening on all outbound data.** The `coarsen()` function (0.0005° resolution) is applied by DataFeedBroker before publishing to `feed.fused`. Raw coordinates never appear in `feed.fused` or any downstream event.
- **No individual vessel or aircraft tracking.** ADS-B data is used for area-level correlation only. Individual aircraft track histories are not persisted. The in-memory cache holds the last 60s of aircraft positions; nothing is written to Supabase.
- **No operator ID retention.** Remote ID `operator_id` fields are used only for the correlation annotation on `detection.enriched`. They are not stored in any database, logged to file, or transmitted to external services.
- **No third-party data re-transmission.** GDELT, Open-Meteo, and adsb.lol data is consumed and used for enrichment only. It is not re-published to any external endpoint. Enriched detection events sent to EUDIS demo observers contain only APEX-SENTINEL's own detection data plus non-identifying context fields.

### GDPR Basis
- ADS-B: public broadcast data; no personal data involved (aircraft registration is legal-entity data, not personal)
- Weather: non-personal environmental data
- Alerts: government-published public safety information
- GDELT: aggregated news data; no personal data processed
- Remote ID: operator_id is potentially personal data → coarsened, not stored, used for correlation only; basis: legitimate interest (public safety) under GDPR Art.6(1)(f)

---

## Architecture Delta from W8

```
W8 (complete):
  SentinelPipelineV2 (TerminalPhaseDetector, TDOA, 16kHz)
  AcousticProfileLibrary (Shahed-131/238, Gerbera, Quad)
  Per-profile recall gates (BRAVE1-v2.3-16khz)
  YAMNetFineTuner.promoteModel() safety gate
  TrackManager (8 concurrent tracks)
  Demo Dashboard API (Node HTTP only)
  PTZ ONVIF integration
  OTA firmware controller
  Wild Hornets augmentation

W9 adds:
  AdsbFeedProducer           (adsb.lol → feed.adsb.*)
  WeatherFeedProducer        (Open-Meteo → feed.weather.*)
  AlertFeedProducer          (alerts.in.ua + EU CP → feed.alerts.*)
  GdeltFeedProducer          (GDELT GKG → feed.osint.*)
  RemoteIdReceiver           (ASTM F3411 BLE/WiFi → feed.rf.remote_id)
  DataFeedBroker             (feed.* → feed.fused)
  ThreatContextEnricher      (detection.raw + feed.fused → detection.enriched)
  DemoDashboardApi feed wiring (feed.fused → /api/feed/* + /api/feed/live SSE)
```

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ADS-B source | adsb.lol (free tier) | No API key, covers Romania/Ukraine, 5s update, JSON |
| Weather source | Open-Meteo | No API key, GDPR-clean (EU-hosted), hourly forecast + current |
| Alert source | alerts.in.ua + EU CP RSS | Ukraine alerts are operationally critical; EU CP covers Romania |
| OSINT source | GDELT GKG | Free, public, geo-tagged, machine-readable, 15-min cadence |
| Remote ID protocol | ASTM F3411-22a | EU mandate (Reg 2019/945); BLE 5.0 Long Range + WiFi NaN |
| Message bus | NATS JetStream (existing) | Already in stack from W2; KV for TTL eviction is native |
| Geo operations | Ray-casting (TypeScript) | No GDAL binary dependency; polygon sizes are small |
| Deduplication | SHA-256 + 30s bucket | Deterministic, stateless per bucket, no external state store |
| Metrics | Prometheus text | Standard format; compatible with existing fortress monitoring |

---

## Risk Register (Design-Level)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| adsb.lol rate-limits free tier | Medium | Medium | Add exponential back-off; fall back to cached aircraft set; alert dashboard with `feed.adsb.status: { healthy: false }` |
| alerts.in.ua API changes schema | Medium | High | Schema validation with Zod; test fixtures pinned to known-good response; monitor CI |
| GDELT 15-min lag misses fast-moving events | Low | Low | GDELT is advisory/OSINT only; not used for real-time threat scoring |
| Remote ID BLE adapter unavailable in CI | Low | High | `RemoteIdSimulator` injects synthetic F3411 frames; physical adapter only needed for field trial |
| Polygon point-in-polygon regression on large MultiPolygons | Low | Medium | Benchmark with Ukraine oblast polygons (largest case); fall back to bounding-box check if >500 vertices |
| 4h TTL eviction misses edge case (leap second, clock skew) | Low | Low | NATS KV TTL is server-side; clock skew guard in broker: evict on `age > 3h55m` client-side too |
