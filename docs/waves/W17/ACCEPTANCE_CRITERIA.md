# APEX-SENTINEL W17 — ACCEPTANCE CRITERIA

## FR-W17-01: ExtendedDemoScenarioEngine
- AC-01: `getScenarioManifest()` returns exactly 6 scenarios
- AC-02: All 6 scenario names match specification
- AC-03: All coordinates within Romania theater (lat 44.0-44.8, lon 26.0-26.8)
- AC-04: Each scenario has `expectedAwningTransitions` array with ≥1 entry
- AC-05: CHALLENGE_01_PERIMETER emits YELLOW then RED
- AC-06: CHALLENGE_01_SWARM emits swarm_confirmation with droneCount=3
- AC-07: CHALLENGE_02_URBAN emits false_positive_suppression with result=CIVILIAN
- AC-08: CHALLENGE_02_TRAJECTORY emits trajectory_prediction with stage=3.5
- AC-09: NATO_AWNING_ESCALATION emits full WHITE→YELLOW→RED→WHITE cycle
- AC-10: cancelScenario() stops all event emission

## FR-W17-02: EudisComplianceScorecard
- AC-01: ≥5 C01 requirements, ≥5 C02 requirements
- AC-02: All entries: status, evidence[], frRefs[]
- AC-03: getScore() returns 100/100/100 (all MET)
- AC-04: generateReport() ≥500 chars, contains FR references

## FR-W17-03: PerformanceBenchmarkSuite
- AC-01: p50 ≤ p95 ≤ p99 invariant holds
- AC-02: Fast functions pass SLA, slow functions fail
- AC-03: runAll() returns summary with allPass, passCount, failCount
- AC-04: generateBenchmarkReport() uses box-drawing chars only

## FR-W17-04: CoverageMapDataBuilder
- AC-01: getCoverageGeoJson() returns valid GeoJSON FeatureCollection
- AC-02: Each Polygon ring closes (first == last coordinate)
- AC-03: Cells near demo nodes (44.4/26.1) are covered=true
- AC-04: uncovered cells have gapRisk=high
- AC-05: highRiskGaps = totalCells - coveredCells

## FR-W17-05: DemoApiExtensions
- AC-01: handles() correctly identifies all 6 /demo/* routes
- AC-02: GET /demo/scenarios → 200 with count=6
- AC-03: POST /demo/run/VALID → 202 Accepted
- AC-04: POST /demo/run/INVALID → 400
- AC-05: GET /demo/status → waveManifest.totalWaves ≥ 17

## FR-W17-06: WaveManifestGenerator
- AC-01: getStats() totalWaves=17, totalFRs≥40, totalTests≥2000
- AC-02: generateManifest() lists all 17 waves W1-W17
- AC-03: W1-W16 all COMPLETE, W17 IN_PROGRESS
- AC-04: generateReadme() ≥5000 characters

## FR-W17-07: JudgePresentationPackage
- AC-01: ≥5 key claims, all verified=true
- AC-02: generatePackage() includes systemName=APEX-SENTINEL
- AC-03: compliance.score = 100/100/100
- AC-04: generateTelegramBrief() ≤10 lines, uses box-drawing chars

## FR-W17-08: FinalSystemVerification
- AC-01: verifySystem() runs ≥8 checks
- AC-02: config_valid check PASS
- AC-03: mind_the_gap_1_to_8 check PASS
- AC-04: boot_sequencer_phases check PASS
- AC-05: getGoNoGo() returns GO when no FAIL checks
- AC-06: blockers list length = number of FAIL checks
