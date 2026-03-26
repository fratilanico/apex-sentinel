# APEX-SENTINEL W17 — PRIVACY ARCHITECTURE

## Privacy in Demo Layer

W17 adds no new data collection. The demo API exposes:
- System performance metrics (no personal data)
- Coverage grid (geographic cells only, no individual tracking)
- Compliance scorecard (static data)
- Scenario events (synthetic, not from real sensor feeds)

## GDPR Compliance Claims (EudisComplianceScorecard C02-R06)

Evidenced in W17 scorecard:
- Detection data: `{ coordinate, threatType, confidence }` — no PII
- No civilian device identifiers stored
- 72-hour retention policy (PrivacyArchitecture W15)
- GDPR Art.22 explanations for automated AWNING decisions

## Coverage Map Privacy

The CoverageMapDataBuilder GeoJSON output:
- Contains: grid cell geometry + coverage status
- Does NOT contain: individual sensor hardware IDs in public output
- `coveringNodes` field uses anonymized IDs (Node-RO-01, Node-RO-02...)
- No location history of any civilian device

## Demo API Privacy

The /demo/* endpoints:
- Serve only computed aggregates
- No raw sensor data in responses
- Benchmark results contain timing only (no user or device data)
- Scenario events are synthetic (no real detections)

## EU AI Act Relevance (Art.5/10/13/14)

- Art.5: System does not use prohibited AI practices (no real-time civilian biometric surveillance)
- Art.10: Training data documented (Wild Hornets dataset, YAMNet transfer learning)
- Art.13: Transparency — confidence scores surfaced to operators
- Art.14: Human oversight — all RED alerts require human confirmation before kinetic action
