# APEX-SENTINEL W9 — Product Requirements Document

> Wave: W9 | Theme: Live Data Feed Integration
> Status: PLAN | Date: 2026-03-26
> Stakeholders: Nicolae Fratila (Founder), INDIGO AirGuard team (Cat/George), EUDIS evaluators

---

## Problem Statement

APEX-SENTINEL W1-W8 is blind to the broader operational picture. The system detects drones acoustically and by RF fingerprint with high recall, tracks multiple simultaneous threats, and outputs enriched detection events to operators. It does not know:

**1. Whether there are cooperative aircraft in the area.**
A Cessna at 300m AGL generates acoustic signatures that overlap with small drone profiles. Without ADS-B correlation, the system has no way to distinguish a legitimate general aviation aircraft from a rogue drone in the acoustic pipeline. Operators receive a false positive with no context to resolve it.

**2. Whether weather conditions are degrading sensor range.**
A 12 m/s headwind reduces acoustic detection range by up to 40%. Precipitation suppresses high-frequency harmonics. Temperature deviation shifts the speed of sound. The current pipeline applies nominal detection thresholds regardless of environmental conditions, producing false negatives in adverse weather without any operator warning.

**3. Whether an active air raid alert covers the deployment sector.**
An acoustic detection during an active Ukrainian air raid alert or Romanian civil protection advisory carries fundamentally different operational weight than the same signature on a calm day. The current system has no feed into national or EU alert infrastructure. Operators must manually cross-reference external sources, creating latency and cognitive load in exactly the moments when speed matters most.

**4. Whether OSINT signals indicate elevated threat windows.**
Military mobilisation, border incidents, and infrastructure attacks reported in news feeds are leading indicators of increased drone activity. GDELT provides geo-tagged event data in real time. Without OSINT correlation, the system cannot distinguish a baseline day from an elevated-threat day — it assigns the same prior probability to all detection events regardless of context.

**5. Whether detected drones are broadcasting Remote ID.**
EU Regulation 2019/945 mandates Remote ID broadcast (ASTM F3411) for all drones above 250g operating in controlled airspace. A drone not broadcasting Remote ID during a detection event is either rogue, jammed, or operating illegally. The current system has no RF receiver for Remote ID and cannot make this legal/compliance distinction.

The net result: a highly capable detection pipeline that delivers raw alerts to operators who lack the situational context to act on them confidently. W9 closes this gap entirely.

---

## Solution: 8-FR Live Data Feed Integration Layer

W9 introduces a layered feed architecture:

```
Layer 1 — Feed Producers (5 sources):
  AdsbFeedProducer, WeatherFeedProducer, AlertFeedProducer,
  GdeltFeedProducer, RemoteIdReceiver

Layer 2 — DataFeedBroker:
  Subscribes to all feed.* subjects
  Deduplicates, coarsens coordinates (±50m GDPR), publishes feed.fused

Layer 3 — ThreatContextEnricher:
  Correlates detection.raw events with feed.fused context
  Computes threat score modifiers
  Publishes detection.enriched

Layer 4 — Dashboard wiring:
  DemoDashboardApi exposes feed data via REST + SSE
  Operators see live ADS-B, weather, alerts, OSINT on the map
```

Every detection event that reaches an operator is an enriched event. Raw detections are never surfaced directly in W9+.

---

## User Stories

### Operator Stories (Tier 1 — Situational Awareness)

**US-W9-01** [P0]
> As a field operator, I need to know whether a detection event correlates with a cooperative aircraft broadcasting ADS-B, so that I can dismiss legitimate aviation traffic without escalating a false positive.

Acceptance: Dashboard shows ADS-B aircraft markers on the map. Detection events annotated with `cooperative: true` when a registered aircraft is within 500m. Cooperative detections displayed at reduced severity tier.

**US-W9-02** [P0]
> As a field operator, I need to see an active air raid alert banner on the dashboard when an official alert covers my deployment sector, so that I can escalate my response posture immediately without checking a separate application.

Acceptance: Alert banner appears within 30 seconds of alert activation. Colour-coded by severity (yellow=warning, red=critical). Banner auto-clears when alert expires.

**US-W9-03** [P1]
> As a threat analyst, I need detection events to carry weather context including estimated acoustic range reduction, so that I can assess whether a failure to detect in one sector is due to sensor failure or environmental degradation.

Acceptance: Every `detection.enriched` event carries `weather.acoustic_range_factor` (e.g. 0.74 = 26% range reduction). Dashboard weather widget shows current factor prominently.

**US-W9-04** [P1]
> As a legal officer reviewing a detection event, I need to know whether the detected drone was broadcasting Remote ID at the time of detection, so that I can establish whether it was operating legally and document the compliance status for the incident report.

Acceptance: `detection.enriched` carries `remote_id.present`, `remote_id.compliant`, `remote_id.uas_id` (when available). Incident export includes these fields.

**US-W9-05** [P1]
> As an INDIGO AirGuard team lead, I need an OSINT surge indicator on the dashboard when GDELT reports elevated military/conflict event activity in the Romania/Ukraine region in the past 15 minutes, so that I can raise team alert levels proactively.

Acceptance: OSINT badge appears on dashboard when surge is active (>10 MILITARY/ARMEDCONFLICT events in 15-min window). Badge shows event count and top themes.

### Engineering Stories (Tier 2 — Platform)

**US-W9-06** [P0]
> As a platform engineer, I need a DataFeedBroker that aggregates all feed.* subjects into a single feed.fused stream with deduplication and GDPR coarsening, so that downstream consumers do not need to handle individual feed subjects.

Acceptance: DataFeedBroker passes 20 tests covering subscription coverage, deduplication, coarsening, TTL eviction, health endpoint, back-pressure, and Prometheus metrics.

**US-W9-07** [P1]
> As a detection engineer, I need a ThreatContextEnricher that annotates ≥95% of detection events with feed context within 2 seconds, so that enriched events reach operators with minimal added latency.

Acceptance: Throughput test: inject 100 detection.raw events at 10 events/second; ≥95 events appear in detection.enriched within 2 seconds. No NATS queue overflow.

**US-W9-08** [P0]
> As a GDPR compliance officer, I need confirmation that all raw GPS coordinates from external feeds are coarsened to ±50m before any storage or onward transmission, and that raw event data is evicted after 4 hours.

Acceptance: DataFeedBroker coarsening unit tests (3) prove no lat/lon passes through feed.fused at higher precision than 0.0005°. NATS KV TTL eviction test confirms no raw event survives past 4h bucket boundary.

---

## Non-Functional Requirements

### Latency
- ADS-B data freshness: <5 seconds from adsb.lol source
- Alert banner appearance: <30 seconds from alert.in.ua API update
- Detection enrichment: ≥95% of events enriched within 2 seconds of receipt
- Dashboard feed data update: ≤5 seconds end-to-end from source event
- Remote ID correlation: event-driven, <100ms from frame receipt to NATS publish

### Reliability
- Feed producer failure (HTTP error, DNS failure, timeout) → broker marks producer `{ healthy: false }` and continues serving cached data; does not crash or stop processing other feeds
- DataFeedBroker restarts: NATS JetStream consumer groups resume from last acknowledged offset; no events lost
- Dashboard SSE disconnect: client auto-reconnects within 5 seconds
- All feed producers implement exponential back-off with jitter on transient errors (max retry interval: 60 seconds)

### Privacy
- No raw GPS coordinates in feed.fused or any downstream event (±50m grid coarsening enforced)
- No individual aircraft or vessel track history persisted beyond 4-hour rolling window
- Remote ID operator_id not persisted in any database; used only for detection correlation annotation
- No external feed data re-transmitted to third parties

### Scalability
- DataFeedBroker handles ≥500 ADS-B aircraft observations per 5-second polling cycle without queue backlog
- ThreatContextEnricher handles ≥10 simultaneous detection.raw events without enrichment latency exceeding 2 seconds
- Dashboard SSE endpoint handles ≥10 concurrent operator clients (carry-over from W8 requirement)

### Security
- All feed producer HTTP calls use TLS 1.2+ (enforced by Node https module)
- GDELT, Open-Meteo, adsb.lol: unauthenticated public APIs; no credentials to protect
- alerts.in.ua: unauthenticated public API; no credentials to protect
- Prometheus /metrics endpoint: localhost-only binding (not exposed externally)

---

## Out of Scope

The following are explicitly excluded from W9:

- **Paid commercial feeds.** FlightAware Firehose, FlightRadar24 Business API, MarineTraffic commercial API, and any API requiring a per-flight or per-vessel subscription are excluded. adsb.lol free tier is the only ADS-B source.
- **Classified or restricted feeds.** NATO AWACS data links, national military surveillance feeds, ITAR/EAR restricted aviation data, law enforcement intelligence feeds.
- **Active RF interrogation.** W9 only passively receives Remote ID broadcasts. No active RF interrogation of drones (IFF-style) is implemented. Active interrogation requires MoD/spectrum authority approval.
- **Social media ingestion.** Twitter/X, Telegram channel monitoring, or any social media scraping. These carry legal and GDPR risks that are out of scope for W9.
- **Weather-adaptive model retraining.** W9 provides weather context to operators and computes range-correction factors. It does not retrain the acoustic model based on live weather (that is a W10+ concern).
- **Predictive analytics on OSINT data.** GDELT data is used as an advisory indicator only; no ML models are trained on OSINT event history in W9.
- **Feed data persistence in Supabase.** Feed events are held in NATS KV with 4-hour TTL only. No migration adds feed tables to Supabase in W9.

---

## Success Metrics for W9

| Metric | Target | Measurement |
|--------|--------|-------------|
| Live feed sources active | 5/5 producers GREEN | DataFeedBroker.health() all healthy |
| Detection enrichment rate | ≥95% of detections | Throughput test in FR-W9-07 |
| Enrichment latency | ≥95% within 2s | Throughput test timing |
| Dashboard feed freshness | ≤5s from source event | E2E SSE timing test |
| ADS-B cooperative annotation | Correct on 100% of test cases | FR-W9-01 integration tests |
| Alert banner accuracy | Banner appears within 30s | FR-W9-03 integration tests |
| GDPR coarsening | 0 raw coordinates in feed.fused | DataFeedBroker unit tests |
| 4h TTL eviction | 0 raw events survive past 4h | NATS KV eviction test |
| False positive rate post-integration | No regression from W8 baseline | W8 FPR test suite re-run |
| Test count | ≥1988 tests | vitest output |
| Coverage | ≥95% stmt (slight regression acceptable for external HTTP stubs) | vitest coverage |
| mind-the-gap | All W9 FRs PASS | wave-formation.sh checkpoint |

---

## EUDIS Demo Value

The W9 integration layer is the primary visual differentiator in the EUDIS demo:

- **Live ADS-B on map**: Judges see cooperative aircraft as secondary markers alongside drone detection tracks. The distinction between "this is a Cessna, not a threat" and "this is an unregistered drone" is visually immediate.
- **Active alert banner**: If an alerts.in.ua advisory is active during the demo (a realistic possibility given the operational environment), it appears automatically. Judges see the system respond to the geopolitical context without operator input.
- **Weather widget**: Acoustic range factor displayed in real time. If wind conditions are significant, the "–18% range in current conditions" readout demonstrates that the system is not treating its sensors as infallible.
- **Remote ID compliance indicator**: A drone without Remote ID broadcast shown as "UNCOOPERATIVE — no Remote ID" on the detection card. Legal/compliance dimension made explicit.
- **OSINT surge badge**: If GDELT reports military activity during the demo window, the badge appears. Judges see a system that monitors open-source intelligence, not just its own sensors.

The combination of acoustic/RF detection (W1-W7) + field trial readiness (W8) + live situational awareness (W9) is the complete EUDIS demonstration story.
