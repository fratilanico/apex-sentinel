# W16 RISK REGISTER

| Risk ID | Risk | Probability | Impact | Mitigation |
|---------|------|-------------|--------|------------|
| R-01 | RPi4 heap exhaustion during demo | Medium | Critical | MemoryBudgetEnforcer + --max-old-space-size=200 |
| R-02 | Acoustic inference exceeds 200ms on RPi4 | Medium | High | EdgePerformanceProfiler SLA gate; fallback to rule-based detection |
| R-03 | Boot phase timeout on slow hardware | Low | High | 10s timeout is generous; demo uses mock phases in worst case |
| R-04 | SHA-256 mismatch on OTA deploy | Low | Medium | verifyManifest() detects before boot |
| R-05 | NATS unavailable during demo | Low | High | SystemHealthDashboard degrades gracefully; local-only mode |
| R-06 | TypeScript strict mode regressions | Low | Low | npx tsc --noEmit in CI before commit |
| R-07 | Wave-formation.sh plan generates 0 docs | Resolved | N/A | Docs written manually; script is a wrapper |
