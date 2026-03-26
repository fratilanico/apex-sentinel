# W16 AI PIPELINE

W16 does not introduce new ML models. It wraps existing AI pipeline stages with:

## EdgePerformanceProfiler integration
- Records latency for each inference invocation (acoustic YAMNet, RF classifier)
- p99 gate: acoustic inference must complete < 200ms on RPi4
- Triggers alert if SLA is breached (logged + published to NATS `system.alerts`)

## CrossSystemIntegrationValidator — AI stage validation
- NOMINAL scenario: injects synthetic detection, traces through acoustic → RF → EKF+LSTM → AWNING → alert
- CRITICAL scenario: forces AWNING RED + Stage 3 classification, validates Telegram routing

## ConfigurationManager — AI thresholds
```typescript
interface SentinelConfig {
  awningThresholds: {
    yellowConfidence: number;   // default 0.6
    orangeConfidence: number;   // default 0.75
    redConfidence: number;      // default 0.9
  };
  performanceBudgets: {
    acousticInferenceP99Ms: number;  // 200
    enrichmentP99Ms: number;         // 200
    feedPollP99Ms: number;           // 5000
  };
  // ...
}
```

## Memory enforcement on ML components
- MemoryBudgetEnforcer monitors ThreatTimeline (10 MB budget) — this stores enriched detection objects
- enforceGc() calls pruneOld() to remove detections older than retention window
