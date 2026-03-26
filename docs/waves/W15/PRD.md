# W15 PRD — Security Hardening + System Resilience

## Product Requirements

### Problem Statement
APEX-SENTINEL operates in adversarial environments. The current system has no defenses against:
- Malformed/oversized payloads injected via API surfaces
- Spoofed or replayed NATS inter-node messages
- Cascade failures when one component degrades
- Silent component death with no auto-recovery
- Tampered audit logs (post-incident deniability)
- Secrets leaking via logs or JSON serialization

### Success Criteria
- All external inputs validated and sanitized before processing
- Inter-node messages cryptographically signed, replay-protected
- Circuit breaker prevents any single component failure from cascading
- Failed components auto-restarted within 3 health-check cycles (30s)
- Audit log chain integrity verifiable at any time
- System starts fast-fail if required secrets are missing
- Graceful shutdown completes within 30s under any signal

### Functional Requirements
| FR | Component | Priority |
|----|-----------|----------|
| FR-W15-01 | InputSanitizationGateway | P0 |
| FR-W15-02 | MessageIntegrityVerifier | P0 |
| FR-W15-03 | CircuitBreaker | P0 |
| FR-W15-04 | WatchdogMonitor | P1 |
| FR-W15-05 | AuditEventLogger | P1 |
| FR-W15-06 | ConfigSecretManager | P0 |
| FR-W15-07 | GracefulShutdownManager | P1 |
| FR-W15-08 | ResilienceIntegrationSuite | P1 |

### Non-Functional Requirements
- No new npm packages — only node:crypto, node:events, node:process
- TypeScript strict mode, zero type errors
- Min 10 tests per FR, ~100 total
- All tests GREEN in vitest P2 run
