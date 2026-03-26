# W16 INTEGRATION MAP

## W16 → Existing Module Dependencies

```
SentinelBootSequencer
  └─► ConfigurationManager (W16)
  └─► NATS stream-config (W9)
  └─► DataFeedBroker (W9)
  └─► AcousticProfileLibrary (W6)
  └─► AwningIntegrationPipeline (W12)
  └─► IntelligencePipelineOrchestrator (W13)
  └─► OperatorNotificationRouter (W14)
  └─► DashboardApiServer (W14)

SystemHealthDashboard
  └─► NodeHealthAggregator (W14)
  └─► NATS publish (W9)

MemoryBudgetEnforcer
  └─► DataFeedBroker.pruneOld() (W9)
  └─► ThreatTimeline (W13)
  └─► SectorThreatMap (W13)

DeploymentPackager
  └─► node:crypto (std)
  └─► node:fs/promises (std)
  (design inspired by OTA controller pattern in W8)

CrossSystemIntegrationValidator
  └─► All pipeline stages W9-W15 (via mock adapters)
```

## NATS Topics Used by W16
| Topic | Direction | FR |
|-------|-----------|-----|
| system.health | publish | FR-W16-03 |
| system.boot.complete | publish | FR-W16-01 |
| system.sla.breach | publish | FR-W16-02 |

## External Interfaces
- RPi4 filesystem: deployment-manifest.json (FR-W16-07)
- Node.js process env: SENTINEL_DEMO_MODE, SENTINEL_CONFIG_PATH (FR-W16-04)
