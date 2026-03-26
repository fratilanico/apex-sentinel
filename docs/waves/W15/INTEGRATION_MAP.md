# W15 INTEGRATION MAP

## Component Integration Points

```
NATS JetStream
    └─► MessageIntegrityVerifier (sign on publish, verify on receive)

Dashboard API (W14)
    └─► InputSanitizationGateway (validates all POST/PUT bodies)
    └─► CircuitBreaker (wraps upstream fetch calls)

ADS-B / Weather / Alerts feed clients (W9)
    └─► CircuitBreaker (wraps each feed client)
    └─► WatchdogMonitor (watches isHealthy on each client)

Operator Telegram Bot (W10)
    └─► AuditEventLogger (logs operator_command events)
    └─► ConfigSecretManager (TELEGRAM_BOT_TOKEN)

System startup
    └─► ConfigSecretManager.validateStartup() (fail-fast)
    └─► WatchdogMonitor.start()

System shutdown
    └─► GracefulShutdownManager.triggerShutdown()
        ├─► NATS connection drain
        ├─► Feed clients close
        ├─► Dashboard server close
        └─► AuditEventLogger flush to JSONL
```

## Dependency Graph (W15 internal)
```
ConfigSecretManager         (no deps)
InputSanitizationGateway    (no deps)
MessageIntegrityVerifier    (node:crypto)
CircuitBreaker              (node:events)
AuditEventLogger            (node:crypto)
WatchdogMonitor             (node:events, CircuitBreaker optional)
GracefulShutdownManager     (node:process, node:events)
ResilienceIntegrationSuite  (all above)
```
