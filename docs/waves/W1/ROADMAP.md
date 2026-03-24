# APEX-SENTINEL — Product Roadmap

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Status:** Wave 1 In Progress
**Classification:** UNCLASSIFIED // FOUO

---

## Executive Summary

APEX-SENTINEL is a distributed civilian smartphone mesh network for real-time FPV drone and Shahed-class UAV detection, triangulation, and C2 visualization. The product roadmap spans four technical waves (W1–W4) followed by a commercial and NATO certification track.

Validated baseline metrics: 87% detection accuracy, ±62m triangulation, 156ms on-device ML latency at 480KB model size.

---

## Roadmap Overview

```
W1 (now–8w)   Single-node acoustic detection, Android + iOS, Supabase backend
W2 (8–18w)    Mesh networking, 3-point TDoA triangulation
W3 (18–30w)   ML fusion (acoustic+RF), offline mode, C2 dashboard
W4 (30–42w)   FreeTAKServer/CoT, NATO interop, hardening, pen-test
──────────────────────────────────────────────────────────────────
POST-W4        NATO certification, multi-city scale, AI track prediction
```

---

## Wave 1 — Single-Node Acoustic Detection (Weeks 0–8)

### Objective
Prove end-to-end detection on a single device. No mesh. No triangulation. Detection → alert → Supabase → basic map pin.

### Scope
- Android Kotlin microphone pipeline (16kHz, 160-frame hop, 480KB TFLite YAMNet)
- iOS Swift acoustic pipeline (AudioEngine + CoreML/TFLite)
- On-device ML inference: YAMNet embedding → binary classifier (drone / not-drone)
- Threshold tuning: 500–2000 Hz bandpass, confidence ≥ 0.72
- WiFi channel energy scan (Android only, W1 baseline — not fused yet)
- Supabase write: `detections` table insert on confirmed detection
- Basic React dashboard: live detection list + map pin (MapLibre GL)
- Auth: Supabase anon key for node registration, service key for dashboard

### Milestones

| # | Milestone | Target Week | Owner |
|---|-----------|-------------|-------|
| M1.1 | Android mic pipeline + YAMNet inference running | W2 | Android |
| M1.2 | iOS acoustic pipeline running | W3 | iOS |
| M1.3 | Supabase schema deployed (migrations 001–003) | W1 | Backend |
| M1.4 | Detection insert + real-time subscription working | W3 | Backend |
| M1.5 | Basic dashboard: list + map pin | W5 | Frontend |
| M1.6 | False-positive rate < 8% on synthetic test dataset | W6 | ML |
| M1.7 | 156ms P99 latency validated on target devices | W7 | ML |
| M1.8 | W1 acceptance test suite green (≥80% coverage) | W8 | QA |

### Dependencies
- Supabase project `bymfcnwfyxuivinuzurr` active and accessible
- YAMNet TFLite model file (`yamnet_classification.tflite`, 480KB) — download from TF Hub
- DroneAudioDataset test fixtures (≥200 labelled clips)
- Android test device: Pixel 6 or equivalent (API 33+)
- iOS test device: iPhone 12+ (iOS 16+)

### Go / No-Go Criteria — W1

| Criterion | Pass Threshold | Measure |
|-----------|---------------|---------|
| Detection accuracy | ≥ 85% on synthetic test set | Unit test `DroneClassifierTest` |
| False-positive rate | ≤ 8% | Unit test against ambient clips |
| ML inference latency | ≤ 200ms P99 | `InferenceLatencyBenchmark` |
| Model size on-device | ≤ 512KB | APK asset inspection |
| Supabase insert round-trip | ≤ 500ms P95 | API integration test |
| iOS pipeline running | ≥ 85% accuracy parity | `AcousticEngineTests` |
| Dashboard map pin renders | Pass | Playwright E2E `map-pin.spec.ts` |
| W1 test coverage | ≥ 80% lines/branches | `npx vitest run --coverage` |

---

## Wave 2 — Mesh + 3-Point TDoA Triangulation (Weeks 8–18)

### Objective
Three or more devices form a mesh. When all three detect the same event, triangulate via Time Difference of Arrival. Position accuracy target: ±62m CEP (Circular Error Probable).

### Scope
- Meshtastic integration: channel config, node discovery, detection packet relay
- Google Nearby Connections: local mesh for sub-50ms latency path
- BLE beacon fallback: node-to-node heartbeat + detection relay
- TDoA computation: cross-correlation timestamp alignment, speed-of-sound correction
- Kalman filter: track smooth position estimate across detection events
- RSSI circle overlay (secondary, fallback when < 3 nodes)
- Supabase schema: `tracks`, `mesh_nodes`, `node_health` tables
- Dashboard: track line + triangulation uncertainty ellipse on CesiumJS

### Milestones

| # | Milestone | Target Week | Owner |
|---|-----------|-------------|-------|
| M2.1 | Meshtastic channel config + node discovery | W10 | Android |
| M2.2 | Detection packet serialization (protobuf) | W10 | Backend |
| M2.3 | Google Nearby Connections mesh path | W11 | Android |
| M2.4 | BLE fallback heartbeat | W12 | Android/iOS |
| M2.5 | TDoA cross-correlation algorithm | W13 | ML/Backend |
| M2.6 | Kalman filter track smoother | W14 | ML/Backend |
| M2.7 | ±62m CEP validated in field test (≥20 trials) | W16 | QA |
| M2.8 | CesiumJS track + uncertainty ellipse | W17 | Frontend |
| M2.9 | W2 acceptance test suite green | W18 | QA |

### Dependencies
- W1 Go/No-Go passed
- 3× Android devices for triangulation field test
- Meshtastic-compatible hardware for relay nodes (optional — software mesh first)
- Google Nearby Connections SDK (included in play-services)
- Field test site: open area, known drone flight path

### Go / No-Go Criteria — W2

| Criterion | Pass Threshold |
|-----------|---------------|
| Triangulation accuracy (field) | ±62m CEP over 20 trials |
| Mesh packet loss | ≤ 5% over 1000 relay events |
| Meshtastic node discovery | ≤ 10s cold start |
| Nearby Connections latency | ≤ 50ms P95 |
| Kalman filter track continuity | ≥ 95% track maintenance |
| 3-node minimum quorum detection | Works with exactly 3 nodes |
| CesiumJS track renders | Pass Playwright E2E |

---

## Wave 3 — ML Fusion + Offline + C2 Dashboard (Weeks 18–30)

### Objective
Fuse acoustic + RF/WiFi signals into a single detection confidence score. Full offline operation. Full C2 dashboard with OpenMCT telemetry panel.

### Scope
- RF/EMF pipeline: WiFi channel energy anomaly detection (2.4GHz + 5GHz scan)
- HeimdallRF integration: SDR-based RF signature (optional hardware path)
- DroneRF dataset training: RF feature extraction → binary classifier
- Acoustic + RF fusion: late fusion via logistic regression or small MLP (< 50KB)
- Offline mode: SQLite local queue, sync on reconnect
- TFLite fusion model: combined 480KB acoustic + 50KB RF fusion head
- Dashboard: OpenMCT plugin for telemetry (signal strength, confidence history)
- MapLibre GL offline tiles: MBTiles bundles for target operation areas
- Grafana dashboard: system health, detection rate, node uptime
- Wazuh + Suricata: security monitoring for C2 infrastructure

### Milestones

| # | Milestone | Target Week | Owner |
|---|-----------|-------------|-------|
| M3.1 | WiFi channel energy scan pipeline (Android) | W20 | Android |
| M3.2 | RF feature extraction (DroneRF dataset) | W21 | ML |
| M3.3 | Fusion model training + TFLite export | W23 | ML |
| M3.4 | On-device fusion inference ≤ 200ms | W24 | ML/Android |
| M3.5 | SQLite offline queue + sync | W24 | Android/iOS |
| M3.6 | MapLibre GL offline tile bundles | W25 | Frontend |
| M3.7 | OpenMCT telemetry plugin | W26 | Frontend |
| M3.8 | Grafana + Wazuh + Suricata deployed | W27 | Infra |
| M3.9 | Full C2 dashboard field test | W28 | QA |
| M3.10 | W3 acceptance test suite green | W30 | QA |

### Dependencies
- W2 Go/No-Go passed
- DroneRF dataset (Kaggle: `sgluege/drone-rf-dataset` or University of Toulouse RFUAV)
- HeimdallRF optional: RTL-SDR dongle for RF capture
- MapLibre GL offline tiles for target regions (openmaptiles or self-hosted)
- Grafana Cloud or self-hosted instance
- Wazuh server (self-hosted, existing infra preferred)

### Go / No-Go Criteria — W3

| Criterion | Pass Threshold |
|-----------|---------------|
| Fusion model accuracy | ≥ 90% (vs 87% acoustic-only) |
| Fusion model size | ≤ 600KB total (acoustic + RF head) |
| Offline queue sync fidelity | 0 data loss after reconnect |
| Fusion inference latency | ≤ 200ms P99 |
| C2 dashboard load time | ≤ 3s on 4G |
| OpenMCT telemetry live update | ≤ 2s lag |
| Grafana alert fires on node down | ≤ 60s |

---

## Wave 4 — FreeTAKServer / CoT + NATO Interop + Hardening (Weeks 30–42)

### Objective
Integrate with military-grade C2 systems via Cursor-on-Target (CoT) protocol. NATO STANAG compliance groundwork. Security hardening, pen-test, and production readiness.

### Scope
- FreeTAKServer (FTS): CoT XML event generation, TCP/UDP streaming
- ATAK client: APEX-SENTINEL as an ATAK plugin (EUD integration)
- OpenSky Network: ADS-B correlation (known civil aircraft vs unknown)
- CoT event schema: `a-f-G-U-C` type for UAV contact, confidence attribute
- NATO STANAG 4586 groundwork: interface control document (ICD) stub
- NATO STANAG 4609 KLV metadata for video annotation
- End-to-end encryption: Signal Protocol for mesh messages
- Certificate pinning: TLS 1.3 + cert pinning on all API calls
- Pen-test: OWASP Mobile Top 10 + API security audit
- Rate limiting, DDoS protection: Supabase edge + Cloudflare
- SIEM integration: Wazuh rules for anomalous detection patterns
- Load test: 10,000 concurrent nodes simulation

### Milestones

| # | Milestone | Target Week | Owner |
|---|-----------|-------------|-------|
| M4.1 | FreeTAKServer deployed + CoT XML tested | W32 | Backend |
| M4.2 | APEX → FTS CoT event stream | W33 | Backend |
| M4.3 | ATAK plugin skeleton (EUD side) | W35 | Android |
| M4.4 | OpenSky ADS-B correlation | W34 | Backend |
| M4.5 | End-to-end Signal Protocol encryption | W36 | Security |
| M4.6 | Certificate pinning on all clients | W36 | Android/iOS |
| M4.7 | STANAG 4586 ICD stub document | W37 | Arch |
| M4.8 | Pen-test completed + all critical/high resolved | W39 | Security |
| M4.9 | Load test: 10k concurrent nodes | W40 | Infra |
| M4.10 | W4 acceptance test suite green | W42 | QA |

### Dependencies
- W3 Go/No-Go passed
- FreeTAKServer instance (self-hosted, Linux, Docker)
- ATAK client (Android, free version sufficient)
- OpenSky Network API key (free tier)
- Pen-test vendor or internal security engineer
- NATO POC for STANAG review (optional at W4, required post-W4)

### Go / No-Go Criteria — W4

| Criterion | Pass Threshold |
|-----------|---------------|
| CoT events received in ATAK | Live demo with 3 events |
| OpenSky correlation latency | ≤ 5s from detection to ADS-B check |
| Pen-test: critical findings | 0 open critical |
| Pen-test: high findings | 0 open high |
| Load test: 10k nodes | P99 insert ≤ 1s |
| Signal Protocol encryption | All mesh messages verified encrypted |
| STANAG 4586 ICD | Document delivered, reviewed |

---

## Post-Wave 4 Roadmap

### Phase A — NATO Certification Track (Months 10–18)

- NATO STANAG 4586 Level 1–3 compliance audit
- STANAG 4609 KLV metadata full implementation
- Allied Command Transformation (ACT) Innovation Hub engagement
- NIST SP 800-82 (ICS/SCADA security) review for C2 components
- UK DSTL evaluation programme submission
- EU Horizon Europe dual-use project proposal
- Common Criteria EAL2+ evaluation for mobile client
- Estimated duration: 8 months
- Dependencies: Legal entity (Ltd/GmbH), export control (ITAR/EAR assessment), insurance

### Phase B — Multi-City Scale (Months 12–24)

- City-level deployment architecture: 10,000+ nodes per city
- Regional Supabase read replicas (EU West, US East, APAC)
- CDN-backed tile server for offline maps
- Multi-tenant: each city/operator gets isolated Supabase project
- Node management console: OTA update push, remote config
- SLA dashboard: per-city uptime, detection rate, node health
- Automated anomaly correlation across cities (shared threat intelligence)
- Commercial pricing model: per-city SaaS license + hardware bundle

### Phase C — AI Autonomous Track Prediction (Months 18–30)

- Trajectory prediction model: LSTM/Transformer on historical track data
- Input: last 10 position estimates + velocity vector
- Output: predicted position at T+30s, T+60s, T+120s with uncertainty cone
- Training data: synthetic flight paths + real incident data (after deployment)
- Integration: CesiumJS predicted track overlay with uncertainty cone
- Early warning: alert when predicted track intersects critical infrastructure polygon
- Model refresh cycle: monthly retrain on accumulated real-world data
- On-device inference: quantized to ≤ 200KB, runs alongside detection model

### Commercial Roadmap

#### City Contracts
- Target: municipal emergency management, civil defence, critical infrastructure operators
- Pilot contract structure: 6-month proof-of-concept, 50–200 nodes, fixed fee
- Full contract: per-node/month SaaS + support + training
- Pricing tier: Small city (< 500k pop): £8k/month | Large city: £25k/month | Metro: £75k/month
- Year 1 target: 2 pilot cities (UK/EU)
- Year 2 target: 5 cities, 1 NATO member state trial
- Year 3 target: 15 cities, formal NATO procurement track

#### NATO Procurement
- Entry point: NATO Innovation Fund (NIF) or DIANA accelerator
- Vehicle: NATO STO (Science and Technology Organisation) collaboration
- Timeline: DIANA application Q3 2026 → evaluation Q4 2026 → trial contract 2027
- Key requirement: STANAG 4586 compliance + ITAR-free component chain

#### Hardware Bundle
- APEX-SENTINEL Node Kit: ruggedized Android device + Meshtastic radio + weatherproof case
- Optional: RTL-SDR dongle for HeimdallRF RF detection
- OEM partnership target: Zebra Technologies or Getac (ruggedized Android)
- Volume pricing: 100 units = £450/unit | 1000 units = £320/unit

---

## Timeline Summary

```
Week  0-8:   W1 complete — single-node detection proven
Week  8-18:  W2 complete — mesh + triangulation ±62m
Week 18-30:  W3 complete — ML fusion + C2 dashboard
Week 30-42:  W4 complete — NATO interop + hardened
Month 10-18: NATO certification track starts
Month 12-24: Multi-city scale deployment
Month 18-30: AI track prediction deployed
Year 2-3:    City contracts + NATO procurement
```

---

## Risk Register Summary (Roadmap-Level)

| Risk | Wave | Mitigation |
|------|------|-----------|
| DroneRF dataset quality insufficient | W3 | Supplement with synthetic RF generation |
| ±62m TDoA not achievable with smartphones | W2 | Fall back to RSSI circles, document limitation |
| NATO STANAG audit delays | Post-W4 | Start ICD in W4, engage ACT early |
| App store rejection (security app) | W1 | Enterprise distribution (MDM), TestFlight |
| Meshtastic firmware incompatibilities | W2 | Pin to Meshtastic firmware 2.3.x |
| Supabase West Europe latency for Eastern EU deployments | W2 | Add regional read replica |
| Export control (ITAR) for NATO clients | Post-W4 | ITAR-free architecture review at W4 |

---

*Roadmap owner: Nico Fratila. Updated each wave-complete checkpoint.*
