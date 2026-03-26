# W15 RISK REGISTER

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-01 | HMAC key compromise | Low | High | HKDF per-node derivation limits blast radius |
| R-02 | Ring buffer fills before JSONL flush | Medium | Medium | 10k entries ~ 5MB; flush on shutdown via GracefulShutdownManager |
| R-03 | Watchdog restart loop (component always fails) | Low | High | Max 3 restart attempts per component per hour (W16 improvement) |
| R-04 | CircuitBreaker half-open probe delays recovery | Low | Low | 60s open timeout is configurable |
| R-05 | GracefulShutdown 30s exceeded by slow component | Medium | Low | Force-exit at 30s; component logs its slow shutdown |
| R-06 | Clock skew causes false replay rejections | Low | Medium | 5s future-ts buffer handles NTP drift |
| R-07 | Prototype pollution via nested array | Low | High | InputSanitizationGateway strips poison keys recursively |
