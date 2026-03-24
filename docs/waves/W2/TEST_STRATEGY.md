# APEX-SENTINEL — Test Strategy
## W2 | PROJECTAPEX Doc 09/21 | 2026-03-24

---

## 1. Guiding Principles

TDD RED first for every FR. No implementation code is written before the test file exists and the failing test is committed. The commit message for the RED commit must contain `[TDD-RED FR-XX]`.

Test pyramid per FR:
- Unit: 10–20 tests per FR
- Component/Integration: 5–10 tests per FR
- API Integration: 3–5 tests per FR
- E2E: 1–3 tests per FR

Coverage gate: `npx vitest run --coverage` must report ≥80% branches, functions, lines, and statements across all W2 source files before M2.8 sign-off.

FR-named describe blocks enforced: `describe('FR-XX-00: Feature Name', () => {})`.

Stack: Vitest 1.x + Supertest (Edge Function mocking) + Playwright 1.x + nats.js test client + Supabase test client against local Supabase (Docker via `supabase start`).

---

## 2. Test Environment Setup

```
Local:
  supabase start              → local Postgres + Edge Functions (port 54321)
  nats-server -js --config    → local NATS JetStream (port 4222, no TLS for unit tests)
  vitest                      → unit + integration runner
  playwright                  → E2E runner against local stack

CI (GitHub Actions):
  services:
    nats:
      image: nats:2.10-alpine
      args: ["-js", "--name", "test-node"]
    supabase: pulled via supabase/supabase-local-dev action
  coverage uploaded to Codecov
  playwright runs against localhost:3000 (Next.js health dashboard)
```

Environment variables for tests:
```
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=<local-anon-key>
NATS_URL=nats://localhost:4222
NATS_CREDS=  # empty for local unit tests (no mTLS)
TEST_NODE_ID=test-node-001
TEST_NODE_TIER=1
```

---

## 3. Unit Tests

### 3.1 NATS Stream Config Validator

```
describe('FR-11-00: NATS stream config validator', () => {
  it('accepts valid stream config with replication factor 3')
  it('rejects stream config with replication factor < 3')
  it('rejects stream config missing retention policy')
  it('rejects stream config with memory storage (must be file)')
  it('accepts MaxAge: 7d for SENTINEL_EVENTS')
  it('rejects unknown stream name not in allowed list')
  it('validates consumer durable name format sentinel-{service}')
  it('rejects consumer without ack policy explicit')
  it('validates subject filter matches sentinel.* pattern')
  it('rejects max_deliver < 3')
  it('accepts AckWait: 30s boundary value')
  it('rejects AckWait: 0')
})
```

File: `src/nats/__tests__/stream-config-validator.test.ts`

### 3.2 Geo-Sector Hash Function

```
describe('FR-11-01: Geo-sector hash function', () => {
  it('produces consistent geohash for identical coordinates')
  it('produces length-6 geohash for standard precision')
  it('neighbouring coordinates produce adjacent geohash prefixes')
  it('coordinate (0,0) produces valid geohash')
  it('lat -90 lon -180 boundary produces valid geohash')
  it('lat 90 lon 180 boundary produces valid geohash')
  it('geohash string contains only base32 chars')
  it('NATS subject sentinel.gate3.detection.{geohash} is valid subject token')
  it('geohash decode round-trips within ±0.01 degree')
  it('sector lookup returns all neighbours (8-cell ring)')
  it('rejects lat > 90 with RangeError')
  it('rejects lon > 180 with RangeError')
  it('rejects NaN coordinates')
  it('precision 5 vs 6: precision 6 covers ~1.2km x 0.6km cell')
})
```

File: `src/geo/__tests__/geo-sector.test.ts`

### 3.3 TDoA Window Aggregator

```
describe('FR-15-00: TDoA window aggregator', () => {
  it('opens window on first TDoA-eligible event')
  it('closes window after 500ms with ≥3 events')
  it('closes window after 500ms with <3 events and marks insufficient')
  it('groups events by (geo_sector, gate3_event_id)')
  it('rejects duplicate (node_id, timestamp_us) within window')
  it('accepts events with timestamp_us within 500ms of window open')
  it('rejects events with timestamp_us > 500ms after window open')
  it('emits exactly one correlation request per closed window')
  it('window close does not leak state to next window')
  it('concurrent windows for different geo_sectors are independent')
  it('window ID is deterministic: hash(geo_sector + gate3_event_id)')
  it('stores raw arrival_us per node_id in window payload')
  it('timer fires even if no new events arrive after first')
  it('max_nodes_per_window capped at 16 (drops extras by arrival order)')
  it('emits window_insufficient metric when <3 nodes')
})
```

File: `src/tdoa/__tests__/window-aggregator.test.ts`

### 3.4 Event Deduplication Logic

```
describe('FR-11-02: Event deduplication', () => {
  it('rejects event with same (node_id, timestamp_us, gate) as existing')
  it('accepts event with same node_id + gate but different timestamp_us')
  it('accepts event with same node_id + timestamp_us but different gate')
  it('dedup key is hex(sha256(node_id + ":" + timestamp_us + ":" + gate))')
  it('cache TTL: dedup entry expires after 60s')
  it('LRU cache does not grow unbounded (max 10000 entries)')
  it('thread-safe: concurrent inserts do not cause false non-dup')
  it('dedup metric counter increments on duplicate detected')
  it('dedup miss metric increments on accepted event')
  it('returns { duplicate: true, original_id } on dedup hit')
})
```

File: `src/ingest/__tests__/event-deduplicator.test.ts`

### 3.5 Supabase Migration Idempotency

```
describe('FR-11-03: Supabase migration idempotency', () => {
  it('migration 001_nodes: running twice produces same schema')
  it('migration 002_detection_events: running twice does not duplicate partitions')
  it('migration 003_tdoa_windows: running twice leaves table unchanged')
  it('migration 004_tracks: running twice leaves indexes unchanged')
  it('migration 005_alerts: running twice leaves RLS policies unchanged')
  it('migration 006_mesh_topology: running twice is safe')
  it('migration 007_node_heartbeats: running twice is safe')
  it('migration 008_audit_log: running twice leaves triggers unchanged')
  it('migration 009_functions: running twice does not break functions')
  it('migration 010_retention: running twice does not duplicate pg_partman cron')
  it('all migrations run in sequence produce expected table list')
  it('rollback: each migration has a corresponding down migration')
})
```

File: `supabase/migrations/__tests__/idempotency.test.ts`

### 3.6 Edge Function Request Validation

```
describe('FR-11-04: Edge Function request validation', () => {
  // register-node
  it('register-node: rejects missing node_id')
  it('register-node: rejects invalid tier (not 0/1/2/4)')
  it('register-node: rejects lat out of range [-90, 90]')
  it('register-node: rejects lon out of range [-180, 180]')
  it('register-node: rejects time_precision_us = 0')
  it('register-node: rejects missing cert_fingerprint')
  it('register-node: rejects firmware_version not semver')
  // ingest-event
  it('ingest-event: rejects missing node_id')
  it('ingest-event: rejects timestamp_us in future by >5s')
  it('ingest-event: rejects gate not in [1,2,3]')
  it('ingest-event: rejects confidence outside [0,1]')
  it('ingest-event: rejects missing geo_sector when gate=3')
  it('ingest-event: accepts valid Gate 3 event payload')
  it('ingest-event: rejects unauthenticated request (no JWT)')
  it('ingest-event: rejects JWT from wrong issuer')
  it('ingest-event: rejects expired JWT')
})
```

File: `supabase/functions/__tests__/request-validation.test.ts`

### 3.7 mTLS Cert Loader

```
describe('FR-11-05: mTLS cert loader', () => {
  it('loads CA cert from PEM file at configured path')
  it('loads node cert and key from PEM files')
  it('rejects expired cert (NotAfter in past)')
  it('rejects cert with CN not matching node_id pattern')
  it('rejects self-signed cert when CA verification is required')
  it('returns TLS options object compatible with node-nats.js')
  it('cert loader logs warning when cert expires in <14 days')
  it('cert loader throws when cert expires in <0 days')
  it('cert loader handles cert chain (intermediate CA)')
  it('cert fingerprint matches SHA-256 of DER encoding')
  it('key must match cert public key or throws')
  it('cert loader is pure function — no side effects on filesystem')
})
```

File: `src/nats/__tests__/mtls-cert-loader.test.ts`

### 3.8 Heartbeat Timeout Detector

```
describe('FR-11-06: Heartbeat timeout detector', () => {
  it('marks node DEGRADED when last_seen > 90s')
  it('marks node OFFLINE when last_seen > 300s')
  it('does not re-emit OFFLINE alert if already OFFLINE')
  it('transitions OFFLINE → ONLINE on heartbeat receipt')
  it('transitions DEGRADED → ONLINE on heartbeat receipt')
  it('transition ONLINE → DEGRADED emits metric')
  it('transition DEGRADED → OFFLINE emits metric + Telegram alert')
  it('heartbeat receipt updates last_seen to current timestamp')
  it('heartbeat with stale timestamp_us < last_seen is rejected')
  it('detector processes heartbeat within 100ms of NATS delivery')
  it('detector handles 100 concurrent node heartbeats without queue backup')
  it('battery_pct ≤ 10 triggers separate LOW_BATTERY alert')
})
```

File: `src/heartbeat/__tests__/timeout-detector.test.ts`

---

## 4. Integration Tests

### 4.1 register-node → Supabase Insert → NATS Publish Flow

```
describe('FR-11-10: Registration integration', () => {
  beforeAll(async () => {
    await supabase.from('nodes').delete().match({ node_id: 'test-int-001' })
  })

  it('registers new node and inserts into nodes table', async () => {
    const resp = await fetch('/functions/v1/register-node', { body: validPayload })
    expect(resp.status).toBe(200)
    const { data } = await supabase.from('nodes').select().eq('node_id', 'test-int-001')
    expect(data).toHaveLength(1)
    expect(data[0].tier).toBe(1)
  })

  it('re-registration updates existing record, not duplicates', async () => {
    await fetch('/functions/v1/register-node', { body: validPayload })
    const { count } = await supabase.from('nodes').select('*', { count: 'exact' }).eq('node_id', 'test-int-001')
    expect(count).toBe(1)
  })

  it('NATS SENTINEL_NODE_REGISTRY receives enrollment event within 1s', async () => {
    const sub = nc.subscribe('sentinel.node.enrolled.test-int-001', { max: 1 })
    await fetch('/functions/v1/register-node', { body: validPayload })
    const msg = await Promise.race([sub.next(), timeout(1000)])
    expect(msg).toBeDefined()
  })

  it('audit_log table has entry for registration', async () => {
    const { data } = await supabase.from('audit_log').select().eq('entity_id', 'test-int-001').eq('action', 'REGISTER')
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  it('returned JWT is valid and scoped to node subjects', async () => {
    const { node_token } = await (await fetch('/functions/v1/register-node', { body: validPayload })).json()
    const decoded = jwtDecode(node_token)
    expect(decoded.sub).toBe('test-int-001')
    expect(decoded.nats_subjects).toContain('sentinel.node.test-int-001.>')
  })
})
```

File: `src/__tests__/integration/registration-flow.test.ts`

### 4.2 ingest-event Full Path

```
describe('FR-13-10: ingest-event integration', () => {
  it('Gate 3 event: writes to detection_events and publishes to NATS', async () => {
    const payload = validGate3Event()
    const resp = await fetch('/functions/v1/ingest-event', { headers: authHeader, body: payload })
    expect(resp.status).toBe(200)
    await expect(natsHasMessage('SENTINEL_EVENTS', payload.timestamp_us)).resolves.toBe(true)
    await expect(supabaseHasRow('detection_events', payload.node_id, payload.timestamp_us)).resolves.toBe(true)
  })

  it('Gate 3 TDoA-eligible: publishes to SENTINEL_TDOA_WINDOWS', async () => {
    const payload = validGate3Event({ tdoa_eligible: true })
    await fetch('/functions/v1/ingest-event', { headers: authHeader, body: payload })
    await expect(natsHasMessage('SENTINEL_TDOA_WINDOWS', payload.timestamp_us)).resolves.toBe(true)
  })

  it('writes to sentinel.gate3.detection.{geo_sector} subject', async () => {
    const payload = validGate3Event({ geo_sector: 'u10hb7' })
    const sub = nc.subscribe('sentinel.gate3.detection.u10hb7', { max: 1 })
    await fetch('/functions/v1/ingest-event', { headers: authHeader, body: payload })
    const msg = await Promise.race([sub.next(), timeout(500)])
    expect(msg).toBeDefined()
  })

  it('duplicate event returns 200 with duplicate: true and no second DB row', async () => {
    const payload = validGate3Event()
    await fetch('/functions/v1/ingest-event', { headers: authHeader, body: payload })
    const resp2 = await fetch('/functions/v1/ingest-event', { headers: authHeader, body: payload })
    const body2 = await resp2.json()
    expect(body2.duplicate).toBe(true)
    const { count } = await supabase.from('detection_events').select('*', { count: 'exact' }).eq('timestamp_us', payload.timestamp_us)
    expect(count).toBe(1)
  })

  it('write completes within 500ms p95 over 20 sequential events', async () => {
    const latencies: number[] = []
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now()
      await fetch('/functions/v1/ingest-event', { headers: authHeader, body: uniqueGate3Event() })
      latencies.push(performance.now() - t0)
    }
    const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
    expect(p95).toBeLessThan(500)
  })
})
```

File: `src/__tests__/integration/ingest-event-flow.test.ts`

### 4.3 TDoA 3-Node Correlation Test with Synthetic Timestamps

```
describe('FR-15-10: TDoA correlation integration', () => {
  // Fixture: tests/fixtures/3-node-tdoa-scenario.json
  // Ground truth: lat 51.5074, lon -0.1278 (City of London)
  // Node positions and synthetic arrival timestamps pre-computed for c=299792458 m/s

  it('3-node scenario resolves position within 62m of ground truth', async () => {
    const scenario = loadFixture('3-node-tdoa-scenario.json')
    await publishTDoAEvents(scenario.events)
    await wait(600) // window + processing
    const result = await getLastTdoaResult(scenario.window_id)
    expect(result.method).toBe('tdoa')
    const dist = haversine(result.lat, result.lon, scenario.ground_truth.lat, scenario.ground_truth.lon)
    expect(dist).toBeLessThan(62)
  })

  it('2-node scenario falls back to centroid method', async () => {
    const scenario = loadFixture('2-node-tdoa-scenario.json')
    await publishTDoAEvents(scenario.events)
    await wait(600)
    const result = await getLastTdoaResult(scenario.window_id)
    expect(result.method).toBe('centroid')
    expect(result.accuracy_m).toBeNull()
  })

  it('1-node scenario increments tdoa_insufficient_nodes metric', async () => {
    const before = await getMetric('tdoa_insufficient_nodes')
    await publishTDoAEvents(singleNodeEvents())
    await wait(600)
    const after = await getMetric('tdoa_insufficient_nodes')
    expect(after).toBe(before + 1)
  })

  it('collinear node geometry triggers divergence guard and centroid fallback', async () => {
    const scenario = loadFixture('collinear-3-node-scenario.json')
    await publishTDoAEvents(scenario.events)
    await wait(600)
    const result = await getLastTdoaResult(scenario.window_id)
    expect(result.method).toBe('centroid')
    expect(result.divergence_guard_triggered).toBe(true)
  })

  it('result is written to tdoa_windows table', async () => {
    const scenario = loadFixture('3-node-tdoa-scenario.json')
    await publishTDoAEvents(scenario.events)
    await wait(600)
    const { data } = await supabase.from('tdoa_windows').select().eq('window_id', scenario.window_id)
    expect(data).toHaveLength(1)
    expect(data[0].node_count).toBe(3)
  })

  it('result is published to SENTINEL_TRACKS stream', async () => {
    const scenario = loadFixture('3-node-tdoa-scenario.json')
    await publishTDoAEvents(scenario.events)
    await wait(600)
    await expect(natsHasMessage('SENTINEL_TRACKS', scenario.window_id)).resolves.toBe(true)
  })
})
```

File: `src/__tests__/integration/tdoa-correlation.test.ts`

### 4.4 Meshtastic Bridge Relay Test

```
describe('FR-09-10: Mesh bridge relay integration', () => {
  it('LoRa event received on MQTT reaches NATS SENTINEL_MESH_RELAY stream', async () => {
    const event = syntheticMeshEvent({ tier: 4, gate: 3 })
    await mqttPublish('msh/EU/json/LongFast/test-mesh-001', event)
    await expect(natsHasMessage('SENTINEL_MESH_RELAY', event.id)).resolves.toBe(true)
  })

  it('bridge forwards to ingest-event with mesh_relay: true flag', async () => {
    const event = syntheticMeshEvent({ tier: 4, gate: 3 })
    await mqttPublish('msh/EU/json/LongFast/test-mesh-001', event)
    await wait(200)
    const { data } = await supabase.from('detection_events').select().eq('node_id', event.node_id).eq('timestamp_us', event.timestamp_us)
    expect(data[0].mesh_relay).toBe(true)
  })

  it('bridge survives NATS disconnect and replays buffered events on reconnect', async () => {
    await nats.pause()
    const event = syntheticMeshEvent({ tier: 4, gate: 3 })
    await mqttPublish('msh/EU/json/LongFast/test-mesh-002', event)
    await wait(100)
    await nats.resume()
    await expect(natsHasMessage('SENTINEL_MESH_RELAY', event.id)).resolves.toBe(true, { timeout: 5000 })
  })

  it('bridge drops malformed LoRa packet and increments bridge_parse_error metric', async () => {
    const before = await getMetric('bridge_parse_error')
    await mqttPublish('msh/EU/json/LongFast/bad-node', 'not-json-{{')
    await wait(200)
    const after = await getMetric('bridge_parse_error')
    expect(after).toBe(before + 1)
  })
})
```

File: `src/__tests__/integration/mesh-bridge-relay.test.ts`

---

## 5. E2E Tests

### 5.1 Full Detection Path: NATS → Supabase → Realtime → Dashboard

```
describe('E2E-W2-01: Full detection event pipeline', () => {
  test('Gate 3 event flows NATS → Supabase → Realtime → fleet dashboard within 3s', async ({ page }) => {
    await page.goto('/dashboard/fleet')
    await page.waitForSelector('[data-testid="realtime-connected"]')

    const eventId = crypto.randomUUID()
    const t0 = Date.now()

    // Publish directly to NATS (simulating enrolled node)
    await publishGate3Event({ event_id: eventId, geo_sector: 'u10hb7' })

    // Verify Supabase write
    await expect.poll(
      () => supabase.from('detection_events').select().eq('event_id', eventId).single(),
      { timeout: 1500 }
    ).resolves.toBeTruthy()

    // Verify Realtime subscription delivers to dashboard
    await expect(page.locator(`[data-testid="event-${eventId}"]`)).toBeVisible({ timeout: 3000 })

    expect(Date.now() - t0).toBeLessThan(3000)
  })
})
```

File: `tests/e2e/full-detection-pipeline.spec.ts`

### 5.2 Node Registration and Health E2E

```
describe('E2E-W2-02: Node registration and health', async ({ page }) => {
  test('registered node appears on fleet map within 5s', async () => {
    await page.goto('/dashboard/fleet')
    const nodeId = `e2e-${Date.now()}`
    await enrollNode(nodeId, { tier: 2, lat: 51.5, lon: -0.1 })
    await expect(page.locator(`[data-testid="node-marker-${nodeId}"]`)).toBeVisible({ timeout: 5000 })
  })

  test('node transitions to OFFLINE state after heartbeat gap >300s', async () => {
    await page.goto('/dashboard/fleet')
    const nodeId = `e2e-hb-${Date.now()}`
    await enrollNode(nodeId, { tier: 1, lat: 51.5, lon: -0.1 })
    await sendHeartbeat(nodeId)
    // Simulate 300s gap by setting last_seen to now - 301s in DB
    await supabase.from('nodes').update({ last_seen: new Date(Date.now() - 301000).toISOString() }).eq('node_id', nodeId)
    // Trigger heartbeat timeout check
    await triggerHeartbeatCheck()
    await expect(page.locator(`[data-testid="node-marker-${nodeId}"][data-status="OFFLINE"]`)).toBeVisible({ timeout: 5000 })
  })
})
```

File: `tests/e2e/node-health.spec.ts`

### 5.3 Telegram Alert E2E

```
describe('E2E-W2-03: Telegram alert bot', () => {
  test('Gate 3 detection triggers Telegram message within 10s', async () => {
    const before = await getTelegramMessageCount(process.env.TEST_CHAT_ID)
    await publishGate3Event({ confidence: 0.95, geo_sector: 'u10hb7' })
    await expect.poll(
      () => getTelegramMessageCount(process.env.TEST_CHAT_ID),
      { timeout: 10000, interval: 500 }
    ).toBeGreaterThan(before)
  })
})
```

File: `tests/e2e/telegram-alert.spec.ts`

---

## 6. Test Fixtures

### 6.1 `tests/fixtures/3-node-tdoa-scenario.json`

```json
{
  "scenario": "3-node-tdoa-standard",
  "ground_truth": { "lat": 51.5074, "lon": -0.1278, "alt": 100 },
  "nodes": [
    { "node_id": "tdoa-node-001", "tier": 1, "lat": 51.5100, "lon": -0.1200, "alt": 15, "time_precision_us": 1 },
    { "node_id": "tdoa-node-002", "tier": 1, "lat": 51.5050, "lon": -0.1350, "alt": 22, "time_precision_us": 1 },
    { "node_id": "tdoa-node-003", "tier": 1, "lat": 51.5020, "lon": -0.1180, "alt": 18, "time_precision_us": 1 }
  ],
  "events": [
    { "node_id": "tdoa-node-001", "arrival_us": 1711234567000001, "gate3_event_id": "evt-001", "geo_sector": "gcpvj" },
    { "node_id": "tdoa-node-002", "arrival_us": 1711234567000089, "gate3_event_id": "evt-001", "geo_sector": "gcpvj" },
    { "node_id": "tdoa-node-003", "arrival_us": 1711234567000143, "gate3_event_id": "evt-001", "geo_sector": "gcpvj" }
  ],
  "expected_accuracy_m": 62,
  "window_id": "test-window-3node-001"
}
```

### 6.2 `tests/fixtures/malformed-events.json`

Array of 15 payloads covering: missing fields, wrong types, out-of-range values, SQL injection attempts in string fields, oversized payloads (>64KB), timestamp in year 2000, timestamp in year 2100, confidence = -0.1, confidence = 1.1, gate = 0, gate = 4, node_id with path traversal `../../etc`, geo_sector = null when gate = 3, empty body `{}`, binary body.

### 6.3 `tests/fixtures/heartbeat-sequence.json`

```json
{
  "sequences": [
    {
      "name": "normal-operation",
      "events": [
        { "t_offset_s": 0,   "node_id": "hb-001", "battery_pct": 85, "status": "ONLINE" },
        { "t_offset_s": 60,  "node_id": "hb-001", "battery_pct": 84, "status": "ONLINE" },
        { "t_offset_s": 120, "node_id": "hb-001", "battery_pct": 83, "status": "ONLINE" }
      ],
      "expected_final_status": "ONLINE"
    },
    {
      "name": "degraded-transition",
      "events": [
        { "t_offset_s": 0,  "node_id": "hb-002", "battery_pct": 90 },
        { "t_offset_s": 95, "node_id": "hb-002", "battery_pct": 89 }
      ],
      "expected_final_status": "DEGRADED",
      "expected_alerts": ["DEGRADED_TRANSITION"]
    },
    {
      "name": "offline-transition",
      "events": [
        { "t_offset_s": 0,   "node_id": "hb-003", "battery_pct": 75 },
        { "t_offset_s": 310, "node_id": "hb-003", "battery_pct": 74 }
      ],
      "expected_final_status": "OFFLINE",
      "expected_alerts": ["DEGRADED_TRANSITION", "OFFLINE_TRANSITION", "TELEGRAM_ALERT"]
    },
    {
      "name": "low-battery",
      "events": [
        { "t_offset_s": 0, "node_id": "hb-004", "battery_pct": 8 }
      ],
      "expected_alerts": ["LOW_BATTERY"]
    }
  ]
}
```

### 6.4 `tests/fixtures/quota-exceeded-scenario.json`

Simulates Supabase Edge Function rate limit (HTTP 429) response from ingest-event. Tests that the caller SDK queues the event and retries with exponential backoff (1s, 2s, 4s, cap 30s). Does not re-send duplicate events. `created_at` in the queued payload is NOT updated on retry.

### 6.5 `tests/fixtures/network-partition-simulation.json`

Describes a test script for NATS cluster: kill nodes 4 and 5 sequentially; verify cluster still serves (Raft quorum = 3); restore nodes; verify JetStream replay catchup < 5s. Used in M2.1 acceptance testing.

---

## 7. Coverage Targets Per Module

| Module | File Pattern | Branch | Function | Line | Statement |
|--------|-------------|--------|----------|------|-----------|
| NATS config | `src/nats/**` | ≥85% | ≥90% | ≥85% | ≥85% |
| Geo sector | `src/geo/**` | ≥90% | ≥95% | ≥90% | ≥90% |
| TDoA correlator | `src/tdoa/**` | ≥80% | ≥85% | ≥80% | ≥80% |
| Ingest/dedup | `src/ingest/**` | ≥85% | ≥90% | ≥85% | ≥85% |
| Edge Functions | `supabase/functions/**` | ≥80% | ≥85% | ≥80% | ≥80% |
| Heartbeat | `src/heartbeat/**` | ≥85% | ≥90% | ≥85% | ≥85% |
| Mesh bridge | `src/mesh/**` | ≥80% | ≥85% | ≥80% | ≥80% |
| Alert router | `src/alerts/**` | ≥80% | ≥85% | ≥80% | ≥80% |

Global gate: ALL metrics ≥80%. CI fails if any module falls below 80% on any metric.

---

## 8. CI Pipeline

```yaml
# .github/workflows/w2-tests.yml
name: W2 Tests
on: [push, pull_request]
jobs:
  unit-integration:
    runs-on: ubuntu-latest
    services:
      nats:
        image: nats:2.10-alpine
        options: >-
          --health-cmd "nats-server --help"
        ports: ["4222:4222"]
        env: { }
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db push
      - run: npm ci
      - run: npx vitest run --coverage --reporter=verbose
      - uses: codecov/codecov-action@v4
      - run: npm run build
      - run: npx tsc --noEmit

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 9. TDD Red Commit Protocol

For every FR, the RED commit must:
1. Contain `[TDD-RED FR-XX]` in commit message
2. Have all describe blocks defined
3. All `it()` tests defined with bodies (not `.todo()`)
4. All tests failing with appropriate errors (not undefined/import errors)
5. `npx tsc --noEmit` must still pass (types correct even if logic absent)

The GREEN commit follows implementation. No skipping. No `it.skip()` in GREEN.

Reviewer checklist before GREEN merge: confirm RED commit exists in git history for every new test file.
