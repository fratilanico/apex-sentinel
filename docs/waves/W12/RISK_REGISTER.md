# W12 RISK REGISTER

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | RSSI-based bearing estimation insufficient accuracy in multipath environment | Medium | Medium | Document 500 m accuracy ceiling; W14 Kalman filter upgrade planned |
| R2 | Protocol classifier false positives on WiFi/BT at similar frequencies | Medium | High | Confidence threshold 0.60; WiFi/BT included as explicit protocol classes |
| R3 | Replay attack detection misses if packet hashes not available from SDR driver | High | Medium | Test covers case where packetHash is undefined; anomaly not flagged when no hash |
| R4 | 22050 Hz acoustic pipeline DATA BREACH (INDIGO confirmed) | High | Critical | Flagged in W13 P0; W12 does not touch acoustic pipeline |
| R5 | MAC hash key rotation breaks intra-session correlation across midnight | Low | Low | Sessions max 60 s; midnight crossing extremely unlikely; acceptable |
| R6 | RfPipelineIntegration tight coupling to StageClassifier interface | Medium | Medium | Integration tests cover the coupling; interface must remain stable |
| R7 | TypeScript rootDir=src excludes rf2 if not under src/ | Low | High | rf2 is under src/rf2/ — covered by rootDir=src |
| R8 | NATS not available in test environment | Low | Medium | RfPipelineIntegration uses EventEmitter abstraction; NATS is swappable |
