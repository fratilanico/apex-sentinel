# W12 PRD — RF Spectrum Deepening + ELRS Fingerprinting v2

## Problem Statement
APEX-SENTINEL's RF layer (W7/W8) detects ELRS 900 MHz presence but cannot:
- Distinguish ELRS from DJI OcuSync, TBS Crossfire, or other FPV protocols.
- Estimate transmitter bearing from multi-node deployments.
- Detect jamming or GPS spoofing attacks against the sensor network.
- Fuse RF bearing estimates with acoustic bearing estimates.
- Track RF sessions and flag pre-terminal link silence.

## User Stories
- As a sensor network operator, I need to know WHICH drone protocol is active so
  threat classification is more accurate.
- As a tactical analyst, I need a fused RF + acoustic bearing estimate to direct
  intercept resources.
- As a security analyst, I need jamming/spoofing alerts to know when the RF
  environment is being manipulated.
- As a privacy officer, I need assurance that no device-identifying MAC addresses
  are published outside the sensor node.
- As an AWNING stage machine, I need ELRS 900 confirmed to auto-escalate to Stage 2.

## Functional Requirements
| FR | Title | Priority |
|----|-------|----------|
| FR-W12-01 | FhssPatternAnalyzer | P0 |
| FR-W12-02 | MultiProtocolRfClassifier | P0 |
| FR-W12-03 | RfBearingEstimator | P0 |
| FR-W12-04 | SpectrumAnomalyDetector | P0 |
| FR-W12-05 | RfFusionEngine | P0 |
| FR-W12-06 | RfSessionTracker | P0 |
| FR-W12-07 | RfPrivacyFilter | P0 |
| FR-W12-08 | RfPipelineIntegration | P0 |

## Non-Functional Requirements
- All 8 source modules fully covered by ≥ 10 tests each (~100 total).
- No new npm dependencies.
- TypeScript strict mode, zero `any` escapes.
- Coverage ≥ 80% branches/functions/lines/statements.
