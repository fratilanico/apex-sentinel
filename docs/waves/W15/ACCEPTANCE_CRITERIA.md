# W15 ACCEPTANCE CRITERIA

## FR-W15-01: InputSanitizationGateway
- AC-01: Payload > 64KB returns `{ ok: false, errors: ['payload too large'] }`
- AC-02: Prototype pollution (`__proto__`, `constructor`, `prototype`) stripped
- AC-03: Object depth > 10 returns `{ ok: false }`
- AC-04: Required field missing → error in `errors` array
- AC-05: Type mismatch → error in `errors` array
- AC-06: Valid payload → `{ ok: true, value: sanitizedObject }`
- AC-07: Fast-fail on first violation — never partially sanitized

## FR-W15-02: MessageIntegrityVerifier
- AC-01: Signed message has `sig` and `ts` fields
- AC-02: Tampered message → `{ valid: false, reason: 'invalid_sig' }`
- AC-03: Replay within 30s → `{ valid: false, reason: 'replay' }`
- AC-04: Future timestamp > 5s → `{ valid: false, reason: 'future_ts' }`
- AC-05: HKDF derives different keys for different nodeIds

## FR-W15-03: CircuitBreaker
- AC-01: Opens after 5 consecutive failures
- AC-02: Open state rejects immediately with `CircuitOpenError`
- AC-03: After 60s, enters half-open and allows 1 probe
- AC-04: Successful probe → closed state
- AC-05: Failed probe → back to open

## FR-W15-04: WatchdogMonitor
- AC-01: 3 consecutive health check failures → `'restart'` event emitted
- AC-02: Component registers and unregisters correctly
- AC-03: `getHealthReport()` shows all components with failure counts
- AC-04: Dead-man: no health check response in 60s → `'system_critical'`

## FR-W15-05: AuditEventLogger
- AC-01: Each entry contains `prevHash` of previous entry
- AC-02: `verify()` returns `{ valid: true }` on intact chain
- AC-03: Tampered entry → `{ valid: false, brokenAt: seq }`
- AC-04: JSONL export parseable, one entry per line
- AC-05: Ring buffer caps at 10000 entries

## FR-W15-06: ConfigSecretManager
- AC-01: `getSecret` throws `Error` if env var missing
- AC-02: `validateStartup` returns `{ ok: false, missing: [...] }` for absent required secrets
- AC-03: Secret value not enumerable on config object
- AC-04: `getConfig` returns defaultValue when env var absent

## FR-W15-07: GracefulShutdownManager
- AC-01: Registers SIGTERM/SIGINT/SIGHUP handlers
- AC-02: `triggerShutdown` runs all registered shutdown fns in order
- AC-03: Force-exits after 30s if any fn hangs
- AC-04: `getShutdownStatus()` shows phase and completed/pending arrays

## FR-W15-08: ResilienceIntegrationSuite
- AC-01: Cascade scenario: circuit breaker stops flood after open
- AC-02: Replay scenario: same message rejected within 30s, accepted after
- AC-03: Prototype pollution blocked end-to-end
- AC-04: Shutdown order: all components drain before close
- AC-05: Watchdog restart integration: failed component triggers restart event
