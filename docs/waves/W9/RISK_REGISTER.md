# W9 — RISK_REGISTER
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## RISK-W9-01: adsb.lol ToS Changes or Rate Limiting

**Likelihood:** Medium
**Impact:** High — ADS-B is the highest-weight external signal (30% of context_score)
**Status:** Open

**Description:** adsb.lol is a community-run service. ToS may change, rate limits may be introduced, or the service may become unavailable without notice.

**Mitigation:**
1. OpenSky Network configured as fallback in AdsbExchangeClient (`ADSB_FALLBACK_SOURCE=opensky`)
2. Graceful degradation: if ADS-B feed is down, `adsb_score` defaults to 0 (not null error) and context_score reflects this
3. Feed health exposed in `feed.broker.health` — operators notified immediately
4. Test suite uses fixtures, not live adsb.lol calls — tests remain GREEN even if service is down

**Contingency:** Switch to OpenSky Network (authenticated, 4000 credits/day — sufficient for 5s polling in low-aircraft-count bounding boxes).

---

## RISK-W9-02: alerts.in.ua API Format Change

**Likelihood:** Medium (active conflict zone — API may be updated rapidly)
**Impact:** High — RED alert detection is the highest-weight signal (40% of context_score)
**Status:** Open

**Description:** alerts.in.ua is a wartime service. API schema may change without versioning guarantees.

**Mitigation:**
1. Defensive parsing: all field accesses use optional chaining (`?.`) with explicit fallback values
2. Test suite uses pinned JSON fixtures — tests do NOT call live API, so format changes don't break CI
3. A dedicated fixture update process is documented: download fresh API response, pin as new fixture, update mapping if needed
4. `alert_type` field mapped via exhaustive switch with default fallback to `WHITE` (conservative, never silently drops an alert as NONE)

**Contingency:** If alerts.in.ua is unavailable: check RO-ALERT (Romanian national system) as secondary; document in incident runbook.

---

## RISK-W9-03: GDELT 15-Minute Latency Too Slow for Real-Time Alert

**Likelihood:** High (this is inherent to GDELT architecture)
**Impact:** Low — GDELT is explicitly labeled as early-warning/corroboration layer, not primary source
**Status:** Accepted (by design)

**Description:** GDELT 2.0 publishes event updates every 15 minutes. For a rapidly evolving incident, GDELT events will lag 15+ minutes behind.

**Mitigation:**
1. GDELT `osint_score` weight is 10% — lowest weight of all signals, by design
2. AI_PIPELINE.md explicitly documents GDELT as "early-warning layer, not primary source"
3. W10 adds Telegram monitoring for near-real-time social signal
4. `feed_osint_events` staleness is tracked — `feed.broker.health` reports last successful GDELT poll time

**Contingency:** None needed — accepted limitation. GDELT corroborates rather than leads.

---

## RISK-W9-04: Remote ID Requires Physical BLE/Wi-Fi Hardware

**Likelihood:** Certain in CI environment
**Impact:** Medium — Remote ID is 20% weight; losing it reduces context_score accuracy
**Status:** Mitigated (mock strategy confirmed)

**Description:** ASTM F3411 Remote ID reception requires a physical BLE or Wi-Fi adapter with monitor mode enabled. CI environments (GitHub Actions, Docker) do not have such hardware.

**Mitigation:**
1. `REMOTE_ID_INTERFACE=mock` env var enables full mock mode — RemoteIdReceiver reads from fixture files instead of hardware
2. All 14 RemoteIdReceiver tests run against mock fixtures in CI — 0 hardware dependencies in test suite
3. Hardware-dependent tests (actual BLE scan, actual Wi-Fi capture) are tagged `@hardware` and skipped with `--testPathIgnorePatterns` in CI config
4. Hardware integration test file (`tests/feeds/FR-W9-05-remote-id-hardware.test.ts`) documented separately from CI suite

**Contingency:** Deploy on Raspberry Pi 4 (or Jetson Nano — same EdgeDeployer target from W4) with USB BLE dongle for hardware validation outside CI.

---

## RISK-W9-05: Coverage Drops Below 80% Due to New Feed Modules

**Likelihood:** Medium (HTTP client code + error paths are harder to reach)
**Impact:** Medium — violates APEX-SENTINEL coverage gate, blocks LKGC-W9 pin
**Status:** Open

**Description:** Feed client modules contain HTTP error handling paths, timeout paths, and fallback logic that require specific mock setup to exercise. Coverage may drop below 80% if these paths are not explicitly tested.

**Mitigation:**
1. `tests/feeds/` directory is added to P0/P1 vitest project in Step 6 of IMPLEMENTATION_PLAN.md — feeds are covered in standard coverage run
2. Each test file includes explicit tests for: timeout path, HTTP error path, empty response path, malformed response path
3. Coverage is checked per-module as part of pre-deploy gates — not just aggregate
4. If aggregate coverage drops: identify which module is below threshold, add targeted tests before pinning LKGC-W9

**Contingency:** If a specific error path is architecturally difficult to test (e.g., NATS connection failure), mark with `/* c8 ignore next */` and document in test file. Do not inflate coverage artificially — only ignore genuinely untestable infrastructure paths.

---

## RISK-W9-06: ThreatContextEnricher 200ms Budget Exceeded Under Load

**Likelihood:** Low (signals fetched in parallel, all from local Supabase/in-memory)
**Impact:** Medium — detection.enriched events delayed, dashboard lag

**Description:** The 200ms budget requires all 5 signal fetches to complete within ~150ms (leaving 50ms for compute + publish). Under load (high detection rate + slow Supabase response), this may be exceeded.

**Mitigation:**
1. All 5 signals fetched in `Promise.all` — parallel, not sequential
2. Per-signal timeout: 100ms AbortController — if a signal times out, it returns a safe default (null or 0) rather than blocking the others
3. Supabase queries use indexed columns (node_id + ts) — query time should be <30ms
4. ADS-B and Remote ID signals read from in-memory buffers — 0ms network latency
5. Load testing in integration tests: simulate 10 concurrent detection events, verify all enriched within 200ms

**Contingency:** If budget consistently exceeded — move Supabase queries to in-memory cache with 5s TTL, reducing DB round-trips.
