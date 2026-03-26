# APEX-SENTINEL W11 — Privacy Architecture

**Wave:** W11
**Date:** 2026-03-26

---

## Data Classification

| Data Type | Classification | Retention | Notes |
|-----------|---------------|-----------|-------|
| Detection lat/lon | RESTRICTED | In-memory only | Grid-quantised to 0.1° for SectorThreatMap |
| GDELT OSINT events | PUBLIC | In-memory, < 24h window | Publicly sourced |
| ADS-B transponder data | PUBLIC | In-memory, event-driven | ICAO hex is aircraft-level, not personal |
| AWNING levels | INTERNAL | In-memory, timeline ring | No PII |
| IntelBrief | RESTRICTED | In-memory, last 1 only | Operator-facing, Telegram channel gated |
| AlertDedup history | INTERNAL | Ring buffer 500, no PII | Keys only: type:level:sector:bucket |

---

## GDPR Considerations

W11 processes no personal data. ADS-B identifiers are aircraft registration data (public), not personal identifiers under GDPR Art. 4.

OSINT data from GDELT is machine-generated news aggregation — no individual-level data.

---

## EU AI Act (W11 Scope)

W11 fusion algorithms are deterministic rule-based and probabilistic (D-S). They do not constitute "AI systems" under EU AI Act Art. 3(1) as defined (no ML training/inference). No conformity assessment required for W11 components.

AWNING level output (which W11 consumes) remains under W10 privacy guarantees.

---

## Operator Data Protection

- IntelBriefs sent to Telegram use existing W8 channel controls (operator-only channels)
- AlertDeduplicationEngine ring buffer contains no location data — keys only
- SectorThreatMap grid cells use 0.1° quantisation — 11km resolution, not street-level
