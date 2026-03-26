# W16 ACCEPTANCE CRITERIA

## FR-W16-01 SentinelBootSequencer
- AC-01: boot() executes all 8 phases in sequence
- AC-02: each phase result stored in manifest
- AC-03: phase timeout > 10s aborts boot with error
- AC-04: shutdown() reverses boot order
- AC-05: getBootStatus() returns current phase during boot
- AC-06: failed phase sets success=false on manifest

## FR-W16-02 EdgePerformanceProfiler
- AC-01: recordLatency() stores samples in rolling 1000-sample window
- AC-02: oldest sample evicted when window full
- AC-03: p99 calculated correctly from sorted samples
- AC-04: checkSla returns pass=false when p99 > sla threshold
- AC-05: multiple components tracked independently
- AC-06: getReport() returns all registered components

## FR-W16-03 SystemHealthDashboard
- AC-01: score starts at 100
- AC-02: offline feed client deducts 20 points
- AC-03: NATS degraded deducts 40 points
- AC-04: each additional offline node deducts 15 points
- AC-05: score never goes below 0
- AC-06: publishes to NATS system.health subject

## FR-W16-04 ConfigurationManager
- AC-01: ENV variable overrides config file
- AC-02: config file overrides defaults
- AC-03: validate() returns errors for missing required fields
- AC-04: getSentinelConfig() returns typed object
- AC-05: SENTINEL_DEMO_MODE=true flag detected
- AC-06: get() with default returns default when key missing

## FR-W16-05 CrossSystemIntegrationValidator
- AC-01: NOMINAL scenario passes all steps
- AC-02: DEGRADED scenario runs with one feed offline
- AC-03: CRITICAL scenario triggers AWNING RED + Stage 3
- AC-04: step timeout > 5s marks step as failed
- AC-05: ValidationReport.pass=false if any step fails
- AC-06: all steps return elapsed_ms

## FR-W16-06 MemoryBudgetEnforcer
- AC-01: checkBudget returns ok=true when under budget
- AC-02: checkBudget returns ok=false when over budget
- AC-03: enforceGc() calls pruneOld() on component
- AC-04: DataFeedBroker budget = 50 MB
- AC-05: ThreatTimeline budget = 10 MB
- AC-06: SectorThreatMap budget = 5 MB

## FR-W16-07 DeploymentPackager
- AC-01: generateManifest() computes SHA-256 for each file
- AC-02: totalFiles matches file list length
- AC-03: verifyManifest() returns valid=true when all hashes match
- AC-04: verifyManifest() returns valid=false when hash mismatches
- AC-05: mismatches array lists affected file paths
- AC-06: manifest includes version and ISO-8601 timestamp

## FR-W16-08 W16EndToEndIntegration
- AC-01: full boot → detect → AWNING → alert → shutdown completes
- AC-02: p99 latencies within SLA post-W16
- AC-03: no component exceeds memory budget in simulated run
- AC-04: security regression — replay attack rejected
- AC-05: security regression — prototype pollution blocked
- AC-06: NOMINAL, DEGRADED, CRITICAL scenarios all pass
- AC-07: boot manifest shows all 8 phases as success
- AC-08: shutdown completes in reverse order
