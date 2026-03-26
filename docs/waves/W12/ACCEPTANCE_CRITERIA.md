# W12 ACCEPTANCE CRITERIA

## AC-W12-01: FhssPatternAnalyzer
- PASS: detects ELRS 900 with correct hop interval (1 ms ± 0.1 ms) from ≥3 samples
- PASS: detects DJI OcuSync 2.4 GHz (10 ms hop, 2400–2483 MHz)
- PASS: detects TBS Crossfire 868 MHz (869–870 MHz band)
- PASS: returns null when fewer than 3 samples provided
- PASS: confidence ≥ 0.80 when samples perfectly match protocol template

## AC-W12-02: MultiProtocolRfClassifier
- PASS: returns ranked list for multi-protocol scenario
- PASS: returns empty array when max confidence < 0.60
- PASS: `elrs_900` classified correctly from 863–928 MHz samples
- PASS: `unknown` returned for unrecognised frequency band

## AC-W12-03: RfBearingEstimator
- PASS: returns estimated lat/lon within 500 m of simulated transmitter
- PASS: throws InsufficientNodesError when <3 nodes supplied
- PASS: confidence correlates inversely with RSSI noise level

## AC-W12-04: SpectrumAnomalyDetector
- PASS: detects broadband jamming (noise floor +15 dB, >50 MHz span)
- PASS: detects GPS spoofing anomaly at 1575.42 MHz
- PASS: detects replay attack (duplicate hash within 100 ms)
- PASS: returns anomalyType = 'none' for clean spectrum

## AC-W12-05: RfFusionEngine
- PASS: fused confidence boost when RF and acoustic agree within 500 m and 5 s
- PASS: conflict flag when positions diverge > 1 km
- PASS: fused confidence = max(rf, ac) + 0.10 bonus

## AC-W12-06: RfSessionTracker
- PASS: session ID format RF-{YYYYMMDD}-{seq:04d}
- PASS: session closed after 60 s inactivity
- PASS: pre-terminal flag set when session ends within 500 m of known target
- PASS: getActiveSessions() returns only open sessions

## AC-W12-07: RfPrivacyFilter
- PASS: MAC address in → SHA-256 hash out (never raw MAC)
- PASS: rawPacketContent stripped from output
- PASS: same MAC same day → same hash (deterministic within day)
- PASS: frequency and bearing data retained in filtered output

## AC-W12-08: RfPipelineIntegration
- PASS: ELRS 900 detection upgrades AWNING stage 1 → 2
- PASS: RF silence during terminal phase triggers Stage 3
- PASS: multi-protocol detection injected into ThreatContextEnricher
- PASS: ≥5 integration scenarios GREEN
