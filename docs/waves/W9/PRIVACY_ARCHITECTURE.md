# W9 — PRIVACY_ARCHITECTURE
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## Privacy-by-Design Principles

All W9 data feeds are assessed under GDPR Regulation (EU) 2016/679. No feed introduces natural person data into the APEX-SENTINEL pipeline.

---

## Feed-by-Feed Assessment

### ADS-B (adsb.lol)

**Data nature:** Aircraft transponder broadcasts on 1090 MHz. Public broadcast by definition — legally equivalent to a radio emission anyone may receive.

**What we receive:** ICAO24 hex, callsign, lat/lon, altitude, squawk code, track, speed.

**What we store:** Aggregate counts only — `aircraft_count`, `squawk_7500_count`, `no_transponder_count` per 5s polling window per node.

**What we discard:** Individual ICAO24 identifiers, individual positions, callsigns. Not written to any database table.

**GDPR Art.4 assessment:** Aircraft registration numbers may be linked to legal persons (operators) in theory; however aggregate counts with no individual identifiers contain no personal data. Compliant.

**Retention:** 4h rolling delete on feed_adsb_snapshots.

---

### Open-Meteo (Weather)

**Data nature:** Environmental sensor data aggregated from meteorological stations. No personal data by definition.

**What we store:** wind_speed_ms, wind_dir_deg, visibility_m, precip_mmh per polling interval per node.

**GDPR assessment:** N/A — no natural person data. No privacy controls required beyond standard access control.

**Retention:** 4h rolling delete on feed_weather_snapshots.

---

### alerts.in.ua / Civil Protection

**Data nature:** Officially published public emergency alerts. Area polygons from government sources.

**What we store:** alert_id (from source), level, area_geojson (polygon only), valid_until. No recipient lists, no contact data, no individual notification records.

**GDPR assessment:** Public administrative data. No personal data. Area polygons describe geographic zones, not individuals.

**Anonymous read:** feed_alerts_active is publicly readable via RLS (public safety data, no privacy risk).

**Retention:** Rows deleted when valid_until passes.

---

### GDELT 2.0 (OSINT)

**Data nature:** Structured event database derived from global news media. GDELT publishes aggregate geo-coded event records.

**What we receive:** Event codes, actor types, geo coordinates (centroid), date, source URL.

**What we store:** bbox_key, event_count, top_keywords (event-type terms only — e.g. "UAV", "drone", "attack"). No individual names, no social media posts, no author attribution.

**GDPR assessment:** Event metadata is public news record data. We store only statistical aggregates. No natural person identifiers stored. Compliant.

**Retention:** 24h rolling delete on feed_osint_events.

---

### Remote ID (BLE / Wi-Fi Aware — ASTM F3411)

**Data nature:** UAS Remote ID broadcast includes UAS ID (serial or session ID), operator location, takeoff location, altitude, velocity.

**Privacy risk:** Operator GPS coordinates (± a few meters) can identify an individual's location — this IS personal data under GDPR Art.4 where the operator is a natural person.

**Mitigations applied:**

1. **Operator coordinates coarsened to ±50m grid before storage** — floor(lat * 20) / 20 and floor(lon * 20) / 20 applied before any persistence.
2. **UAS ID hashed:** SHA-256(UAS_ID + daily_salt) stored. Raw UAS ID never written to database. Daily salt rotated at 00:00 UTC to prevent cross-day correlation.
3. **No operator name stored** — ASTM F3411 does not include name; we do not attempt reverse lookup.
4. **Session IDs preferred over serial numbers** — where UAS transmits a rotating session ID, that is used; serial-number-bearing records are hashed.

**GDPR Art.22 compliance:** No automated individual profiling. UAS ID hashing prevents re-identification.

**Retention:** feed_alerts_active cascade or 24h max.

---

### detection_enriched

**Data nature:** Composite context snapshot attached to a detection event. Contains: nearest aircraft distance (aggregate, no ICAO24), active alert overlap (polygon name/level), weather values, OSINT event count, Remote ID beacon count in radius (aggregate count, no hashed IDs).

**GDPR assessment:** No personal data in feed_context_json. Compliant.

---

## Data Flow Summary

```
ADS-B raw       → aggregate counts only    → feed_adsb_snapshots
Weather raw     → sensor values            → feed_weather_snapshots
Alerts raw      → polygon + level          → feed_alerts_active
GDELT raw       → event counts + keywords  → feed_osint_events
Remote ID raw   → coarsened coords + hash  → NATS only (feed.rf.remote_id)
                  (not persisted to DB in W9)
Detection event → context snapshot         → detection_enriched
```

---

## DPIA Status

Formal DPIA not required for W9 — no high-risk processing (GDPR Art.35: no large-scale processing of special category data, no systematic monitoring of public areas in scope of this wave). Reassess at W13 when ML Fusion layer is introduced.

---

## Data Controller
APEX-SENTINEL operational entity. Supabase project: bymfcnwfyxuivinuzurr (eu-west-2, London — EU jurisdiction).
