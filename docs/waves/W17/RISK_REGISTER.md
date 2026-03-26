# APEX-SENTINEL W17 — RISK REGISTER

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| RR-01 | Benchmark SLA failures during live demo | LOW | HIGH | Benchmarks run at startup and cache results; all system benchmarks use noop-like workloads |
| RR-02 | Coverage map computation timeout (3700 cells) | LOW | MEDIUM | Grid computation is O(cells × nodes) ≈ 3700 × 3 = ~11k operations; completes in <200ms |
| RR-03 | FinalSystemVerification FAIL on Telegram check | HIGH | LOW | Telegram check returns WARN (not FAIL) when token not set; does not block GO verdict |
| RR-04 | CrossSystem NOMINAL scenario fails in W17-08 | LOW | HIGH | CrossSystemIntegrationValidator is well-tested (W16); NOMINAL path is the happy path |
| RR-05 | EUDIS judges request live sensor data | MEDIUM | MEDIUM | Demo scenarios emit realistic synthetic events; explain INDIGO field validation in brief |
| RR-06 | 16kHz pipeline not yet adopted | HIGH | MEDIUM | W17 uses existing 22050Hz pipeline for demo; W18 priority item; note in handoff |
| RR-07 | Node.js ESM import resolution fails | LOW | HIGH | All imports use `.js` extensions; tsconfig uses `moduleResolution: bundler`; tested |
| RR-08 | Wi-Fi congestion degrades live demo | LOW | LOW | Demo endpoints are localhost; no external network dependency for core demo |

## Risk Actions

**RR-03 (HIGH prob):** Add `TELEGRAM_BOT_TOKEN=demo` to env before demo run to change WARN→PASS.

**RR-06 (HIGH prob):** Include disclaimer in judge brief: "16kHz migration pending W18; INDIGO team confirmed requirement post-W6".
