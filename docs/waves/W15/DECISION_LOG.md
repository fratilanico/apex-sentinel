# W15 DECISION LOG

## DEC-W15-01: HMAC-SHA256 over ED25519
**Decision**: Use HMAC-SHA256 (symmetric) not ED25519 (asymmetric)
**Reason**: Node:crypto HMAC is available everywhere; ED25519 signing requires key distribution infrastructure we don't have. HMAC is sufficient for trusted-node mesh.
**Date**: 2026-03-26

## DEC-W15-02: HKDF-SHA256 for per-node key derivation
**Decision**: Use `crypto.hkdf` (Node 15+ built-in) to derive per-node keys
**Reason**: Prevents key compromise blast radius. Each node uses HKDF(master, nodeId).
**Date**: 2026-03-26

## DEC-W15-03: Ring buffer capped at 10,000 entries
**Decision**: AuditEventLogger keeps 10k entries in memory
**Reason**: Balance between memory footprint (~5MB) and operational visibility. Persistence to JSONL is separate concern (W16).
**Date**: 2026-03-26

## DEC-W15-04: CircuitBreaker error rate window 30s
**Decision**: Use 30s sliding window for error rate calculation
**Reason**: Matches replay prevention window for consistency. Short enough to detect fast failure floods.
**Date**: 2026-03-26

## DEC-W15-05: Watchdog check interval 10s, restart after 3× failures
**Decision**: 10s check interval, 3 consecutive failures = restart signal
**Reason**: 30s worst-case detection time balances responsiveness vs false positives for transient glitches.
**Date**: 2026-03-26

## DEC-W15-06: No new npm packages
**Decision**: node:crypto, node:events, node:process only
**Reason**: Security layer must have minimal attack surface. No external dependencies to audit.
**Date**: 2026-03-26
