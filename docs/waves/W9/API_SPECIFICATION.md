# APEX-SENTINEL W9 — API Specification

> Wave: W9 | Theme: Live Data Feed Integration | Date: 2026-03-26

---

## Internal TypeScript APIs (W9 additions)

### Shared Types

```typescript
// Geographic bounding box (WGS-84 decimal degrees)
interface BoundingBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// Base interface all feed clients implement
interface FeedClient {
  readonly subject: string;        // NATS subject this client publishes to
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

---

### AdsbExchangeClient (FR-W9-01)

```typescript
interface AdsbExchangeConfig {
  boundingBox: BoundingBox;
  pollIntervalMs: number;          // recommended: 5000 (5s)
}

interface Aircraft {
  icao24: string;                  // 6-hex ICAO 24-bit address
  callsign: string | null;         // trimmed; null if not squawking callsign
  lat: number;                     // WGS-84 latitude
  lon: number;                     // WGS-84 longitude
  alt_baro: number | null;         // barometric altitude in feet; null if unknown
  velocity: number | null;         // ground speed in knots; null if unknown
  heading: number | null;          // true track in degrees [0, 360); null if unknown
  squawk: string | null;           // 4-digit octal squawk code; null if not set
  onGround: boolean;               // true if aircraft reports ground flag
}

class AdsbExchangeClient implements FeedClient {
  readonly subject = 'feed.adsb.aircraft';

  constructor(config: AdsbExchangeConfig);

  // Polls adsb.lol free API for aircraft within boundingBox.
  // Filters onGround=true aircraft before returning.
  // Returns [] on network error (after 3 retries with exponential backoff).
  // Does NOT persist raw positions to Supabase.
  getAircraft(): Promise<Aircraft[]>;

  start(): Promise<void>;  // begins polling at pollIntervalMs interval
  stop(): Promise<void>;   // halts polling; waits for in-flight request
}
```

---

### OpenMeteoClient (FR-W9-02)

```typescript
interface OpenMeteoConfig {
  lat: number;    // node coordinate — WGS-84 latitude
  lon: number;    // node coordinate — WGS-84 longitude
}

interface WeatherSnapshot {
  windSpeedMs: number;         // wind speed in m/s (converted from km/h)
  windDirectionDeg: number;    // meteorological direction [0, 360)
  visibilityM: number;         // visibility in metres; max 24000
  tempC: number;               // temperature in degrees Celsius
  precipMmh: number;           // precipitation rate mm/hour; 0 if none
  observedAt: Date;            // observation timestamp from Open-Meteo
}

class OpenMeteoClient implements FeedClient {
  readonly subject = 'feed.weather.current';

  constructor(config: OpenMeteoConfig);

  // Fetches current weather for configured coordinates.
  // Returns last known snapshot (max staleness: 120s) on network error.
  // Returns null if no prior snapshot exists and request fails.
  // Client-side 5s TTL cache: repeated calls within 5s return cached value
  // without hitting the API.
  getCurrent(): Promise<WeatherSnapshot | null>;

  start(): Promise<void>;
  stop(): Promise<void>;
}
```

---

### CivilProtectionClient (FR-W9-03)

```typescript
interface CivilProtectionConfig {
  countries: string[];    // ISO 3166-1 alpha-2 codes, e.g. ['RO', 'UA']
}

type AlertLevel = 'info' | 'warning' | 'critical';
type AlertType  = 'air_raid' | 'missile' | 'drone' | 'flood' |
                  'earthquake' | 'chemical' | 'nuclear' | 'other';

interface Alert {
  id: string;              // globally unique: "<source>:<original_id>"
  level: AlertLevel;       // mapped from CAP severity
  type: AlertType;         // mapped from CAP event code
  area: string;            // human-readable area name (from CAP areaDesc)
  validUntil: Date;        // expiry time (CAP expires field)
  source: 'ercc' | 'alerts_in_ua';
}

class CivilProtectionClient implements FeedClient {
  readonly subject = 'feed.alerts.active';

  constructor(config: CivilProtectionConfig);

  // Fetches active alerts from EU ERCC feed and alerts.in.ua JSON API.
  // Merges both sources; deduplicates by id.
  // Excludes alerts where validUntil < now.
  // Partial result returned if one source is unavailable.
  // Returns [] if both sources unavailable.
  getActiveAlerts(): Promise<Alert[]>;

  start(): Promise<void>;
  stop(): Promise<void>;
}
```

---

### GdeltClient (FR-W9-04)

```typescript
interface GdeltConfig {
  bbox: BoundingBox;           // geographic filter (Romania: 43.6-48.3N, 22.1-30.0E)
  keywords: string[];          // filter terms, e.g. ['drone', 'UAV', 'airspace', 'military']
  windowMinutes: number;       // look-back window for GDELT event stream
}

interface OsintEvent {
  eventId: string;             // GDELT event ID
  eventDate: Date;             // event date (day resolution from GDELT)
  eventType: string;           // GDELT CAMEO event code, e.g. '190' = Use conventional military force
  lat: number;                 // event centroid latitude
  lon: number;                 // event centroid longitude
  sourceUrl: string;           // source article URL (domain only — no path; privacy)
  goldsteinScale: number;      // GDELT Goldstein conflict scale [-10, +10]
  numMentions: number;         // GDELT numMentions field
}

class GdeltClient implements FeedClient {
  readonly subject = 'feed.osint.events';

  constructor(config: GdeltConfig);

  // Queries GDELT 2.0 event stream for events within bbox and windowMinutes.
  // Applies keyword filter against GDELT actor1 and actor2 name fields.
  // Actor PII stripped: only domain retained from sourceUrl.
  // Returns [] on GDELT API unavailability (no throw).
  // Does not publish NATS message when result is empty.
  getEvents(): Promise<OsintEvent[]>;

  start(): Promise<void>;
  stop(): Promise<void>;
}
```

---

### RemoteIdReceiver (FR-W9-05)

```typescript
interface RemoteIdReceiverConfig {
  interfaces: string[];    // BLE + WiFi interface names, e.g. ['hci0', 'wlan1']
}

type UasIntent = 'recreational' | 'commercial' | 'emergency' | 'unknown';

interface RemoteIdBeacon {
  uasId: string;              // ASTM F3411 UAS ID, hex-encoded
  operatorLat: number;        // operator latitude coarsened to ±50m grid
  operatorLon: number;        // operator longitude coarsened to ±50m grid
  altM: number;               // GPS altitude in metres
  intent: UasIntent;          // mapped from F3411 operation_mode
  receivedAt: Date;           // wall-clock time beacon was received
}

class RemoteIdReceiver extends EventEmitter implements FeedClient {
  readonly subject = 'feed.rf.remote_id';

  constructor(config: RemoteIdReceiverConfig);

  // Binds to all specified interfaces. Continues on partial bind failure.
  // Emits 'beacon' event for each valid ASTM F3411 frame decoded.
  // Rate-limits: same uasId deduplicated within 5s window.
  // operatorLat/operatorLon coarsened to ±50m grid before emit (GDPR).
  // Raw F3411 operatorLat/operatorLon never stored or published.
  start(): void;
  stop(): void;

  // Event: 'beacon'
  on(event: 'beacon', listener: (beacon: RemoteIdBeacon) => void): this;
}
```

---

### DataFeedBroker (FR-W9-06)

```typescript
interface DataFeedBrokerConfig {
  nats: NatsConnection;        // connected NATS JetStream client
  feeds: FeedClient[];         // all feed client instances to manage
}

interface FusedMessage {
  source: string;              // originating NATS subject (e.g. feed.adsb.aircraft)
  subject: string;             // same as source (for router compatibility)
  receivedAt: Date;            // wall-clock time broker received message
  payload: unknown;            // parsed JSON payload from feed client
  contentHash: string;         // SHA-256 hex of raw payload string (dedup key)
}

class DataFeedBroker {
  constructor(config: DataFeedBrokerConfig);

  // Starts all registered FeedClients and begins consuming feed.* subjects
  // via NATS JetStream durable consumer.
  // Deduplicates by SHA-256(payload); TTL 30s per hash.
  // Publishes deduplicated, enveloped messages to feed.fused.
  start(): Promise<void>;

  // Stops all FeedClients and closes NATS consumer.
  // Waits for in-flight publishes to complete.
  stop(): Promise<void>;
}
```

---

### ThreatContextEnricher (FR-W9-07)

```typescript
interface ThreatContextEnricherConfig {
  nats: NatsConnection;
  feedBroker: DataFeedBroker;
  lookbackMs?: number;         // default: 60000 (60s)
  ringBufferMax?: number;      // default: 500 entries
}

interface FeedContext {
  available: boolean;          // false if ring buffer empty at enrichment time
  aircraft: Aircraft[];        // ADS-B: within 5km of detection position
  weather: WeatherSnapshot | null;
  alerts: Alert[];             // active civil protection alerts for detection country
  osint: OsintEvent[];         // GDELT events from last lookbackMs matching bbox
  remoteId: RemoteIdBeacon[];  // F3411 beacons within 500m of detection position
}

interface EnrichedDetection {
  // All original detection fields preserved unchanged
  [key: string]: unknown;
  // Plus:
  context: FeedContext;
  enrichedAt: Date;
}

class ThreatContextEnricher {
  constructor(config: ThreatContextEnricherConfig);

  // Subscribes to detection.* and feed.fused.
  // Maintains ring buffer of FusedMessages (last lookbackMs, max ringBufferMax).
  // For each incoming detection.* message, calls enrichDetection().
  // Publishes result to detection.enriched.
  start(): Promise<void>;
  stop(): Promise<void>;

  // Synchronously queries ring buffer, assembles FeedContext, returns
  // EnrichedDetection. Latency target: <50ms on populated ring buffer.
  // Does not publish NATS message (start() handles publishing).
  enrichDetection(detection: Record<string, unknown>): Promise<EnrichedDetection>;
}
```

---

### LiveFeedAdapter (FR-W9-08)

```typescript
// src/ui/demo-dashboard/live-feed-adapter.ts
// Adapts DataFeedBroker output to Dashboard SSE streams.

interface LiveFeedAdapterConfig {
  nats: NatsConnection;
  heartbeatIntervalMs?: number;    // default: 15000 (15s)
}

class LiveFeedAdapter {
  constructor(config: LiveFeedAdapterConfig);

  // Subscribes to feed.fused via NATS.
  // Routes to SSE event types:
  //   feed.adsb.aircraft   → SSE event: 'adsb'
  //   feed.weather.current → SSE event: 'weather'
  //   feed.alerts.active   → SSE event: 'alert'
  //   feed.osint.events    → SSE event: 'osint'
  //   feed.rf.remote_id    → SSE event: 'remoteid'
  // Sends heartbeat every heartbeatIntervalMs.
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

---

## HTTP API (Dashboard additions — W9)

### GET /api/feed/live (SSE stream)

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: adsb
data: {
  "aircraft": [
    {
      "icao24": "3c6790",
      "callsign": "DLH123",
      "lat": 47.4934,
      "lon": 28.8576,
      "alt_baro": 34000,
      "velocity": 440,
      "heading": 182.5,
      "squawk": "2341",
      "onGround": false
    }
  ],
  "receivedAt": "2026-03-26T10:01:23.456Z"
}

event: weather
data: {
  "windSpeedMs": 8.3,
  "windDirectionDeg": 270,
  "visibilityM": 12000,
  "tempC": 4.1,
  "precipMmh": 0,
  "observedAt": "2026-03-26T10:00:00.000Z"
}

event: alert
data: {
  "id": "alerts_in_ua:UA-20260326-001",
  "level": "critical",
  "type": "air_raid",
  "area": "Odessa Oblast",
  "validUntil": "2026-03-26T12:00:00.000Z",
  "source": "alerts_in_ua"
}

event: osint
data: {
  "eventId": "1234567890",
  "eventDate": "2026-03-26T00:00:00.000Z",
  "eventType": "190",
  "lat": 46.8,
  "lon": 29.6,
  "sourceUrl": "reuters.com",
  "goldsteinScale": -8.0,
  "numMentions": 15
}

event: remoteid
data: {
  "uasId": "fa3b9c01d2e4",
  "operatorLat": 47.052,
  "operatorLon": 28.862,
  "altM": 85.0,
  "intent": "unknown",
  "receivedAt": "2026-03-26T10:01:22.000Z"
}

event: heartbeat
data: {"ts": "2026-03-26T10:01:38.000Z"}
```

Reconnection: client should reconnect with `Last-Event-ID` header if stream
drops. Adapter resumes from last published message per subject.

---

## NATS Subjects (W9 additions)

```
feed.adsb.aircraft       — Aircraft positions within deployment bbox
                           Published by: AdsbExchangeClient
                           Consumed by:  DataFeedBroker, LiveFeedAdapter

feed.weather.current     — Open-Meteo snapshot for node coordinates
                           Published by: OpenMeteoClient
                           Consumed by:  DataFeedBroker, LiveFeedAdapter

feed.alerts.active       — Civil protection + ERCC + alerts.in.ua alerts
                           Published by: CivilProtectionClient
                           Consumed by:  DataFeedBroker, LiveFeedAdapter

feed.osint.events        — GDELT 2.0 geo-filtered events (Romania bbox)
                           Published by: GdeltClient
                           Consumed by:  DataFeedBroker, LiveFeedAdapter

feed.rf.remote_id        — ASTM F3411 Remote ID beacons detected
                           Published by: RemoteIdReceiver
                           Consumed by:  DataFeedBroker, LiveFeedAdapter

feed.fused               — Deduplicated, enveloped feed messages
                           Published by: DataFeedBroker
                           Consumed by:  ThreatContextEnricher, LiveFeedAdapter

detection.enriched       — Existing detection.* events with FeedContext attached
                           Published by: ThreatContextEnricher
                           Consumed by:  Dashboard API, CotRelay, TelegramBot
```

---

## Error Codes

```typescript
// All feed clients use these error codes in thrown errors and log entries

type FeedErrorCode =
  | 'FEED_NETWORK_ERROR'        // HTTP request failed after retries
  | 'FEED_PARSE_ERROR'          // Response could not be parsed (JSON/XML)
  | 'FEED_AUTH_ERROR'           // API returned 401/403 (should not occur for
                                //   no-key APIs; logged as anomaly)
  | 'FEED_RATE_LIMITED'         // API returned 429; backoff triggered
  | 'FEED_EMPTY'                // Successful response but zero events/aircraft
  | 'BROKER_NATS_UNAVAILABLE'   // DataFeedBroker cannot publish (NATS down)
  | 'ENRICHER_TIMEOUT'          // enrichDetection() exceeded 50ms budget
  | 'REMOTEID_BIND_FAILED'      // RemoteIdReceiver could not bind to interface
  | 'REMOTEID_FRAME_MALFORMED'; // F3411 frame failed validation
```
