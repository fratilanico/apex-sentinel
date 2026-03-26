# W9 — IMPLEMENTATION_PLAN
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## Execution Order (Strict — TDD Red→Green)

### Step 1: TDD-RED Phase — Write All 9 Test Files

Write all test files before touching implementation code. Every new test must fail.

**Files to create:**
```
tests/feeds/FR-W9-01-adsb-exchange-client.test.ts       (~16 tests)
tests/feeds/FR-W9-02-open-meteo-client.test.ts           (~14 tests)
tests/feeds/FR-W9-03-civil-protection-client.test.ts     (~16 tests)
tests/feeds/FR-W9-04-gdelt-client.test.ts                (~12 tests)
tests/feeds/FR-W9-05-remote-id-receiver.test.ts          (~14 tests)
tests/feeds/FR-W9-06-data-feed-broker.test.ts            (~18 tests)
tests/detection/FR-W9-07-threat-context-enricher.test.ts (~22 tests)
tests/feeds/FR-W9-08-demo-dashboard-live-feed.test.ts    (~10 tests)
tests/integration/FR-W9-integration-feeds.test.ts        (~6 tests)
```

**Gate:** `npx vitest run` shows 128 new failing tests. Commit with message `test(W9): tdd-red — 128 failing tests for live feed integration`.

---

### Step 2: Implement src/feeds/ Modules (FR-W9-01 through FR-W9-06)

Implement in dependency order:

**2a. Individual feed clients (no interdependency — can be done in parallel):**

- `src/feeds/adsb-exchange-client.ts`
  - HTTP GET to `https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}`
  - Parse aircraft array, count squawk 7500/7600/7700, count no-transponder
  - Publish `feed.adsb.aircraft` NATS event
  - Graceful timeout handling (AbortController, 5s)

- `src/feeds/open-meteo-client.ts`
  - HTTP GET to `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=wind_speed_10m,wind_direction_10m,visibility,precipitation`
  - Parse current weather fields
  - Compute `acoustic_range_adjustment_pct`
  - Publish `feed.weather.current` NATS event

- `src/feeds/civil-protection-client.ts`
  - HTTP GET to `https://alerts.in.ua/api/v3/alerts/active`
  - Filter by `ALERTS_COUNTRIES` env var
  - Map alert types to AWNING levels
  - Publish `feed.alerts.active` NATS event on state change

- `src/feeds/gdelt-client.ts`
  - HTTP GET to `https://api.gdeltproject.org/api/v2/geo/geo?query=drone+UAV&format=json&timespan=15min&bbox={bbox}`
  - Aggregate event_count and top_keywords
  - Publish `feed.osint.events` NATS event

- `src/feeds/remote-id-receiver.ts`
  - Parse ASTM F3411 frame structure from BLE payload or mock fixture
  - Coarsen operator lat/lon: `Math.floor(lat * 20) / 20`
  - Hash UAS ID: `SHA256(uas_id + daily_salt)`
  - Deduplicate by hashed ID within 10s sliding window
  - Publish `feed.rf.remote_id` NATS event

**2b. DataFeedBroker (depends on all 5 clients):**

- `src/feeds/data-feed-broker.ts`
  - Instantiate and start all 5 feed clients
  - Subscribe to all `feed.*` NATS subjects
  - Maintain in-memory state: latest snapshot per feed type
  - Maintain in-memory buffer: last 10s of Remote ID beacons
  - Compute `feed.fused` event from combined state
  - Deduplicate by SHA-256 hash of serialised feed state
  - Publish `feed.broker.health` every 30s
  - Isolate per-feed failures — catch errors per client, continue others

**Gate after Step 2:** `npx vitest run tests/feeds/` shows FR-W9-01 through FR-W9-06 GREEN.

---

### Step 3: Implement ThreatContextEnricher (FR-W9-07)

- `src/detection/threat-context-enricher.ts`
  - Subscribe to `detection.*` NATS subject
  - On each event: fetch 5 signals in parallel (Promise.all with 150ms timeout per signal)
  - Compute context_score per AI_PIPELINE.md formula
  - Build `ThreatContext` struct
  - Publish `detection.enriched` NATS event
  - Write to `detection_enriched` Supabase table
  - Total latency budget: ≤200ms

**Gate after Step 3:** FR-W9-07 tests GREEN.

---

### Step 4: Wire Dashboard (FR-W9-08)

- `src/ui/demo-dashboard/live-feed-adapter.ts`
  - Subscribe to `feed.fused` NATS events
  - Maintain latest feed state in memory
  - Expose `getCurrentFeedState()` method

- Modify `src/ui/demo-dashboard/demo-dashboard-api.ts`
  - Accept `LiveFeedAdapter` as constructor dependency
  - Include `feed_state` in every SSE event payload
  - Handle LiveFeedAdapter unavailable: emit `feed_state: null`, do not disconnect

**Gate after Step 4:** FR-W9-08 tests GREEN.

---

### Step 5: Add Supabase Migration

- Create `supabase/migrations/YYYYMMDDHHMMSS_w9_feed_tables.sql` per DATABASE_SCHEMA.md
- Test locally: `supabase db reset` (dev only) or `supabase db push` (staging)

---

### Step 6: Update vitest.config.ts

- Add `tests/feeds/**/*.test.ts` to P0 or P1 project glob
- Add `tests/integration/FR-W9-*.test.ts` to P2 project glob
- Verify `tests/detection/FR-W9-07*.test.ts` included in existing detection test project

---

### Step 7: Final Verification Gate

Run all gates in sequence:

```bash
npx tsc --noEmit
npm run build
npx vitest run --coverage
```

**Expected output:**
- 1,988 tests GREEN (1860 + 128)
- Coverage: ≥80% statements/branches/functions/lines
- 0 TypeScript errors
- Build: clean

**On pass:** Pin LKGC-W9 commit hash. Update SESSION_STATE.md to phase COMPLETE. Update MEMORY.md.

---

## Estimated Effort

| Step | Complexity | Notes |
|---|---|---|
| Step 1: TDD-RED | Medium | 9 files, ~128 test stubs with correct imports |
| Step 2a: 5 feed clients | Medium | HTTP clients, NATS publish, error handling |
| Step 2b: DataFeedBroker | High | Orchestration, dedup, in-memory buffer |
| Step 3: ThreatContextEnricher | High | 200ms budget, parallel signal fetch, scoring |
| Step 4: Dashboard wire | Low | Adapter pattern, SSE extension |
| Step 5: Migration | Low | DDL per schema doc |
| Step 6: vitest config | Low | Config file update |
| Step 7: Verification | Low | Run commands |
