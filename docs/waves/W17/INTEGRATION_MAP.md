# APEX-SENTINEL W17 — INTEGRATION MAP

## W17 ↔ W1-W16 Integration Points

### ExtendedDemoScenarioEngine (FR-W17-01)
- Extends pattern from `DemoScenarioEngine` (W14, FR-W14-06)
- Emits events compatible with DashboardStateStore event schema (W14)
- Romania coordinates align with NodeHealthAggregator demo nodes

### EudisComplianceScorecard (FR-W17-02)
- References all W1-W16 FR IDs as evidence
- Scorecard entries validate against NodeRegistry (W1), YAMNet (W3), AwningComputeEngine (W10), etc.
- `generateReport()` markdown can be served via DashboardApiServer (W14)

### PerformanceBenchmarkSuite (FR-W17-03)
- `detection_latency` benchmark mirrors SentinelPipeline detection stage (W2)
- `awning_computation` benchmark mirrors AwningComputeEngine (W10)
- `alert_formatting` benchmark mirrors AlertRouter Telegram formatting (W1)
- SLA values align with FR-W2-01 and FR-W10-01 SLA gates

### CoverageMapDataBuilder (FR-W17-04)
- Directly instantiates `NodeHealthAggregator` (W14, FR-W14-05)
- Directly instantiates `PredictiveGapAnalyzer` (W10, FR-W10-04)
- Uses same 3.5km threshold as PredictiveGapAnalyzer BLIND_SPOT_THRESHOLD_KM
- GeoJSON output designed for DashboardApiServer (W14)

### DemoApiExtensions (FR-W17-05)
- Handles pattern compatible with `DashboardApiServer.handleRequest()` (W14)
- Uses `sendJson()` helper with same signature as W14's helper
- POST /demo/run routes to `ExtendedDemoScenarioEngine` with EventEmitter

### WaveManifestGenerator (FR-W17-06)
- Reads `src/` directory — all W1-W16 source directories included
- FR registry covers all W1-W16 + W17 FRs
- Wave entries reference actual frCount and testCount from each wave

### JudgePresentationPackage (FR-W17-07)
- Composes: EudisComplianceScorecard + PerformanceBenchmarkSuite + WaveManifestGenerator
- `keyClaims` reference specific W-numbered FRs as evidence
- Telegram brief format consistent with W1 AlertRouter Telegram formatting

### FinalSystemVerification (FR-W17-08)
- `_checkCrossSystemNominal()` → CrossSystemIntegrationValidator (W16, FR-W16-05)
- `_checkBootSequencer()` → SentinelBootSequencer (W16, FR-W16-01)
- `_checkAwningPipeline()` → verifies AWNING level constants (W10)
- `_checkMindTheGap()` → mirrors wave-formation.sh mind-the-gap checks 1-8

## External Integration
- GeoJSON from CoverageMapDataBuilder: consumable by Leaflet/MapboxGL on any dashboard
- /demo/scorecard JSON: submittable directly to EUDIS evaluation portal
- JudgePresentationPackage JSON: self-contained submission artifact
