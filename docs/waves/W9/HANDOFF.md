# W9 — HANDOFF
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## What W9 Delivers

W9 is the first wave where APEX-SENTINEL ingests live external data and uses it to enrich detection events. Prior to W9, detection events were purely acoustic/RF signals with no external context.

### Delivered Capabilities

1. **5 live data feeds** — ADS-B aircraft, weather conditions, civil protection alerts, GDELT OSINT events, UAS Remote ID beacons
2. **DataFeedBroker** — unified feed orchestrator with health monitoring, graceful failure isolation, and content-hash deduplication
3. **ThreatContextEnricher** — deterministic multi-source correlation engine, ≤200ms enrichment SLA, context_score 0-100
4. **Dashboard integration** — DemoDashboardApi SSE stream now includes live feed state, alert polygons visible on map
5. **5 new Supabase tables** — feed snapshots, active alerts, OSINT events, enriched detections, with RLS and retention policies
6. **8 new NATS subjects** — full feed.* and detection.enriched subject tree in JetStream

### Test Coverage

- 128 new tests (W9 FRs)
- Total: 1,988 tests GREEN
- Coverage: ≥80% all metrics maintained

---

## What W10 Receives

W10 inherits a running operational system with:

- **DataFeedBroker running** — all 5 feeds live, `feed.fused` events published continuously
- **NATS feed.* subjects active** — W10 can subscribe to any existing subject
- **`detection_enriched` table populated** — accumulating real enriched detection records from W9 deployment
- **ThreatContextEnricher wired** — every detection has feed context attached
- **GDELT client running** — polling on 15-minute cycle, aggregated event counts in `feed_osint_events`

---

## W10 Builds On

### GDELT NLP Deepening

W9 stores `top_keywords` as an array of event-type codes. W10 enriches this with:
- NLP classification of raw event headlines (drone/UAV taxonomy: recon, strike, swarm, interdiction)
- Entity extraction for operator/manufacturer attribution where present in news text
- Confidence scoring for event relevance to current theater

### Telegram Monitoring

W9 does not include social media monitoring. W10 adds:
- Public Telegram channel monitoring (military/civil defense channels for RO/UA)
- Keyword alert matching (configurable per theater)
- Cross-reference Telegram signal with active alerts from `feed_alerts_active`

### Social Corroboration Layer

W10 introduces a corroboration score: how many independent sources (GDELT + Telegram + civil alerts) report activity in the same area within the same time window. This feeds into W13 ML Fusion as an additional feature.

---

## Interface Contracts Inherited by W10

**NATS subjects W10 may subscribe to:**
- `feed.fused` — unified feed state snapshot
- `feed.osint.events` — GDELT event aggregates (W10 may add NLP enrichment and republish)
- `detection.enriched` — fully enriched detection events
- `feed.broker.health` — per-feed health status

**Supabase tables W10 may read:**
- `feed_alerts_active` — current active alerts
- `feed_osint_events` — GDELT event history (24h window)
- `detection_enriched` — enriched detection history

**Do not modify in W10 without schema migration:**
- `ThreatContext` struct interface — W13 depends on this as ML feature vector
- `DataFeedBroker` public API — other modules depend on `start()`, `stop()`, `getCurrentState()`

---

## Known Limitations (Carried Forward)

| Limitation | Wave to Address |
|---|---|
| GDELT 15-minute latency — not real-time | W10 (Telegram adds near-real-time social signal) |
| Remote ID requires physical BLE hardware — mock only in CI | W11 (hardware integration environment) |
| No satellite imagery for visual confirmation | W12 |
| ThreatContextEnricher uses deterministic rules — no learned patterns | W13 (ML Fusion) |
| No persistent threat pattern memory across sessions | W14 (AgentDB) |
