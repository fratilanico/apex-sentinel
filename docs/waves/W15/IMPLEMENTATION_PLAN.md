# W15 IMPLEMENTATION PLAN

## Order of Implementation

### Phase 1: Core security primitives (no deps)
1. `ConfigSecretManager` — reads env, no deps
2. `InputSanitizationGateway` — pure validation, no deps
3. `MessageIntegrityVerifier` — node:crypto only

### Phase 2: Resilience patterns (no deps)
4. `CircuitBreaker` — pure FSM, node:events
5. `AuditEventLogger` — node:crypto for hashing

### Phase 3: Operational components (depend on events)
6. `WatchdogMonitor` — node:events, depends on HealthCheckable interface
7. `GracefulShutdownManager` — node:process, node:events

### Phase 4: Integration
8. `ResilienceIntegrationSuite` — wires everything together for integration tests

## TDD-RED Phase
Write all 8 test files with FAILING tests (importing non-existent source files).
Commit as "test(W15): TDD-RED — failing tests for resilience layer"

## Execute Phase
Write all 8 source files to make tests GREEN.
Commit as "feat(W15): resilience layer — security hardening + system resilience"

## Timeline
- TDD-RED: ~30 min
- Execute: ~60 min
- Checkpoint/Complete: ~15 min
- Total: ~2 hours
