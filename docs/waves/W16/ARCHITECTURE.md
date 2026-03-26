# W16 ARCHITECTURE

## Module Map
```
src/system/
  sentinel-boot-sequencer.ts       — FR-W16-01
  edge-performance-profiler.ts     — FR-W16-02
  system-health-dashboard.ts       — FR-W16-03
  configuration-manager.ts         — FR-W16-04
  cross-system-integration-validator.ts — FR-W16-05
  memory-budget-enforcer.ts        — FR-W16-06
  deployment-packager.ts           — FR-W16-07
  w16-end-to-end-integration.ts    — FR-W16-08 (test harness)

tests/system/
  FR-W16-01-boot-sequencer.test.ts
  FR-W16-02-performance-profiler.test.ts
  FR-W16-03-system-health.test.ts
  FR-W16-04-configuration-manager.test.ts
  FR-W16-05-cross-system-validator.test.ts
  FR-W16-06-memory-budget.test.ts
  FR-W16-07-deployment-packager.test.ts
  FR-W16-08-e2e-integration.test.ts
```

## Boot Order (SentinelBootSequencer phases)
```
1  Config validation      (ConfigurationManager.validate())
2  NATS connect           (stream-config.ts NatsClient mock in test)
3  Feed clients           (DataFeedBroker or mock)
4  Detection pipeline     (acoustic + RF pipeline init)
5  NATO layer             (AwningIntegrationPipeline)
6  Intel layer            (IntelligencePipelineOrchestrator)
7  Operator notifications (OperatorNotificationRouter)
8  Dashboard API          (DashboardApiServer / DashboardIntegrationLayer)
```

## Dependency Graph
```
ConfigurationManager ──► all other W16 modules
SentinelBootSequencer ──► ConfigurationManager, all phase handlers
SystemHealthDashboard ──► NodeHealthAggregator, NatsClient, FeedClient[]
EdgePerformanceProfiler ── standalone (ring buffer, no deps)
MemoryBudgetEnforcer ──► cache-heavy components (DataFeedBroker, ThreatTimeline, SectorThreatMap)
CrossSystemIntegrationValidator ──► all pipeline stages
DeploymentPackager ──► node:crypto, node:fs/promises
W16EndToEndIntegration ──► all W16 modules
```

## Memory Budget (RPi4 constraints)
| Component | Budget |
|-----------|--------|
| DataFeedBroker dedup cache | 50 MB |
| ThreatTimeline | 10 MB |
| SectorThreatMap | 5 MB |
| Total Node.js heap | 200 MB (--max-old-space-size=200) |
