# W16 DECISION LOG

| ID | Decision | Rationale |
|----|----------|-----------|
| DL-01 | All W16 modules in src/system/ | Orthogonal to feature modules; boot/health/config are cross-cutting concerns |
| DL-02 | No new npm packages | Hackathon constraint; node:crypto, node:fs/promises sufficient |
| DL-03 | UTF-16 byte approximation for memory | JSON.stringify().length * 2 is sufficient for budget enforcement; true heap introspection requires native addons |
| DL-04 | 1000-sample rolling window for profiler | Balances memory (< 8 KB per component) vs statistical accuracy |
| DL-05 | Boot phase timeout = 10s | Matches W9 feed client connect timeout; consistent across stack |
| DL-06 | Shutdown in reverse boot order | Standard practice; ensures dependents shut down before their dependencies |
| DL-07 | NATS health degradation = -40 | NATS is the nervous system; its failure is the most critical degradation |
| DL-08 | DeploymentPackager produces file manifest (not Docker image) | RPi4 runs bare Node.js, not Docker; file manifest + OTA is the correct delivery mechanism |
