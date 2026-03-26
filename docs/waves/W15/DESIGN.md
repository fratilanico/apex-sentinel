# W15 DESIGN — Security Hardening + System Resilience

## Overview
W15 adds the security and operational resilience layer to APEX-SENTINEL. This wave hardens all API surfaces, prevents replay/injection attacks, ensures graceful degradation under partial failures, and provides self-healing via watchdog and circuit breaker patterns.

## Design Goals
1. Zero trust at API boundaries — all external input treated as hostile
2. Cryptographic integrity for inter-node NATS messages (HMAC-SHA256)
3. Replay attack prevention with 30s window
4. Circuit breaker prevents cascade failure propagation
5. Watchdog auto-restarts failed components (3× consecutive failure threshold)
6. Tamper-evident audit log (SHA-256 hash chain)
7. Secret management — no hardcoded credentials, fail-fast on startup
8. Graceful shutdown with 30s budget and ordered drain

## Component Map
```
InputSanitizationGateway  → validates all external inputs at ingress
MessageIntegrityVerifier  → signs/verifies NATS messages, replay prevention
CircuitBreaker            → wraps any async call, open/closed/half-open FSM
WatchdogMonitor           → health-checks all components, emits restart events
AuditEventLogger          → SHA-256 hash chain audit log, 10k ring buffer
ConfigSecretManager       → env-based secrets, startup validation
GracefulShutdownManager   → SIGTERM/SIGINT/SIGHUP, 30s budget, ordered shutdown
ResilienceIntegrationSuite → integration tests wiring all components together
```

## Technology Constraints
- Node 22, TypeScript strict
- `node:crypto` only — no new npm packages
- ESM with `.js` import extensions
- All tests: Vitest globals, FR-named describe blocks
