# APEX-SENTINEL W17 — DECISION LOG

## DL-W17-001: DemoApiExtensions as standalone handler (not subclass)

**Decision:** DemoApiExtensions exposes `handles(url, method)` + `handle(req, res)` rather than extending DashboardApiServer.

**Rationale:** DashboardApiServer constructor requires 4 dependencies (store, sse, nodes, rateLimiter). Extending it would require all those in tests. The standalone handler pattern allows independent testing and injection into any HTTP server.

**Alternatives considered:** Subclass DashboardApiServer — rejected (constructor complexity, tight coupling).

---

## DL-W17-002: CoverageMapDataBuilder uses haversine approximation

**Decision:** Distance computation uses flat-earth approximation (DEG_TO_KM=111.0) not full haversine.

**Rationale:** Romania's extent (~6° lat, ~8° lon) has <0.5% error with flat approximation. Full haversine adds complexity with negligible accuracy gain at this scale.

---

## DL-W17-003: PerformanceBenchmarkSuite uses `performance.now()` not `Date.now()`

**Decision:** `performance.now()` for sub-millisecond timing accuracy.

**Rationale:** `Date.now()` has 1ms resolution on some platforms. `performance.now()` provides microsecond resolution, critical for benchmarks targeting p99 <1ms (awning_computation).

---

## DL-W17-004: 6 demo scenarios (not 3 from W14)

**Decision:** Extended to 6 scenarios covering both EUDIS challenges, full AWNING cycle, and full pipeline.

**Rationale:** W14's 3 scenarios (OSINT_SURGE, SHAHED_APPROACH, TRAJECTORY_PREDICTION) were internal demos. Judges need C01 + C02 specific walkthroughs plus NATO AWNING and full pipeline demonstration.

---

## DL-W17-005: WaveManifestGenerator reads src/ filesystem for sourceDirectories

**Decision:** `getSourceDirectories()` uses `node:fs` to enumerate actual directories.

**Rationale:** Hardcoded list would go stale. Live filesystem read is always accurate and self-updating. Only TypeScript files counted (`.ts` extension filter).

---

## DL-W17-006: FinalSystemVerification runs CrossSystemIntegrationValidator NOMINAL

**Decision:** Final verification always runs the NOMINAL scenario (not DEGRADED or CRITICAL).

**Rationale:** Pre-demo check should verify the happy path. DEGRADED/CRITICAL scenarios test fault paths and may introduce false positives in a pre-demo environment.
