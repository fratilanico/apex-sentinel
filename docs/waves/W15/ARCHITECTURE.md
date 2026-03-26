# W15 ARCHITECTURE — Security Hardening + System Resilience

## Layered Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    External Input Layer                          │
│   InputSanitizationGateway — validates before any processing    │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   Messaging Layer                                │
│   MessageIntegrityVerifier — HMAC-SHA256, replay prevention     │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   Resilience Layer                               │
│   CircuitBreaker — cascade prevention                           │
│   WatchdogMonitor — health checks + auto-restart                │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   Operations Layer                               │
│   AuditEventLogger — tamper-evident hash chain                  │
│   ConfigSecretManager — env secrets, startup validation         │
│   GracefulShutdownManager — ordered shutdown                    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### HMAC-SHA256 with HKDF key derivation
Each node derives its message signing key via HKDF-SHA256(master, nodeId). This means compromising one node does not compromise all nodes.

### Circuit Breaker FSM
```
closed ──(5 failures or >50% error rate in 30s)──► open
open   ──(60s elapsed)──► half-open
half-open ──(success)──► closed
half-open ──(failure)──► open
```

### Audit Hash Chain
Each entry: SHA-256(seq + ts + eventType + actor + payload + prevHash)
Ring buffer of 10,000 entries; exports to JSONL for persistence.

### Watchdog Health Interface
Any component implementing `{ isHealthy(): Promise<boolean> }` can be registered. Three consecutive failures triggers `'restart'` event.

## Module Boundaries
All resilience modules are pure TypeScript classes, no framework dependencies, no circular imports.
