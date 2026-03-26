# APEX-SENTINEL W17 — DATABASE SCHEMA

## Schema Changes

W17 introduces no new database tables or migrations.

All W17 data is:
- **In-memory only**: scenario state, benchmark results, coverage grid
- **Computed on demand**: scorecard, manifest, coverage summary
- **Derived from W1-W16 schema**: all persistent data uses existing tables

## Relevant Existing Schema (read-only for W17)

### detections table (W2)
Used by: CoverageMapDataBuilder (indirectly via NodeHealthAggregator)

### node_registrations table (W1)
Used by: NodeHealthAggregator → CoverageMapDataBuilder

### awning_transitions table (W10)
Referenced in: EudisComplianceScorecard evidence strings

## Data Flow (W17 specific)
```
WaveManifestGenerator → reads src/ filesystem (no DB)
EudisComplianceScorecard → static data structure (no DB)
PerformanceBenchmarkSuite → in-memory samples (no DB)
CoverageMapDataBuilder → NodeHealthAggregator (in-memory node list)
FinalSystemVerification → CrossSystemIntegrationValidator (in-memory validation)
```

No migrations required for W17.
