# W12 DESIGN — RF Spectrum Deepening + ELRS Fingerprinting v2

## Overview
Wave 12 deepens the RF intelligence layer of APEX-SENTINEL. The existing W7 ELRS
fingerprint is a single-protocol, single-receiver component. W12 builds a full RF
classification, fusion, and session-tracking stack on top of it, housed in `src/rf2/`.

## Design Goals
1. Detect FHSS patterns across ELRS 900/2400, DJI OcuSync 2.4/5G, TBS Crossfire.
2. Multi-protocol classifier with ranked confidence output.
3. RSSI-based bearing estimation from ≥3 nodes (least-squares).
4. Jamming, GPS-spoofing, and replay-attack detection.
5. RF + acoustic fusion with spatial/temporal agreement scoring.
6. Persistent RF session tracking with pre-terminal silence flag.
7. Privacy filter: MAC hashing, no raw packet content published.
8. Full integration with AWNING stage classifier and ThreatContextEnricher.

## Architecture Principles
- Pure TypeScript; no new npm packages.
- Each component is independently testable.
- Immutable input types; results returned as plain objects.
- All classes export named interfaces alongside implementations.
- Error types (e.g., InsufficientNodesError) are typed and exportable.

## Key Algorithms
### FHSS Pattern Detection (FR-W12-01)
- Collect frequency samples over sliding window.
- Compute median hop interval between consecutive samples.
- Match center frequency and hop interval against protocol templates.

### Least-Squares RSSI Position Estimation (FR-W12-03)
- Free-space path loss: RSSI = P_tx - 20·log10(d) - 20·log10(f) - 32.45
- Solve for (lat, lon) minimising sum of squared residuals.
- Accuracy estimate from residual RMS.

### Jamming Detection (FR-W12-04)
- Broadband: noise floor elevation > +15 dB across > 50 MHz span.
- GPS spoofing: 1575.42 MHz level anomaly.
- Replay attack: duplicate packet hash within 100 ms window.

### RF-Acoustic Fusion (FR-W12-05)
- Haversine distance between RF and acoustic position estimates.
- Temporal delta between last RF detection and last acoustic detection.
- Fused confidence formula: max(rfConf, acConf) + 0.10 * agreementBonus.
