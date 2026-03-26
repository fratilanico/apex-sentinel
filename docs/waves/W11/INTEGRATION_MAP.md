# APEX-SENTINEL W11 — Integration Map

**Wave:** W11
**Date:** 2026-03-26

---

## Upstream Dependencies (W11 consumes)

| Source | Wave | Interface | Data |
|--------|------|-----------|------|
| GdeltClient | W9 | OsintEvent[] | GDELT events with goldsteinScale |
| AdsbExchangeClient | W9 | DetectionEvent (adsbPresent) | ADS-B flight data |
| RemoteIdReceiver | W9 | DetectionEvent (remoteIdPresent) | Remote ID broadcasts |
| AwningLevelPublisher | W10 | NATS awning.level | AWNING level changes |
| DataFeedBroker | W9 | NATS feed.fused | All fused feed data |
| ThreatContextEnricher | W9 | NATS detection.enriched | Enriched detection events |
| SentinelPipeline | W6 | acoustic detection events | Acoustic confidence scores |

---

## Downstream Consumers (W11 produces)

| Consumer | Interface | Data |
|----------|-----------|------|
| Telegram output (W8) | NATS intel.brief | IntelBrief for operator notification |
| W12 persistence layer | NATS intel.brief | IntelBrief for storage |
| W13 dashboard | NATS intel.brief | IntelBrief for UI |

---

## NATS Subject Map

```
awning.alert  ──────────► IntelligencePipelineOrchestrator
feed.fused    ──────────► IntelligencePipelineOrchestrator
detection.enriched ─────► IntelligencePipelineOrchestrator
                                    │
                                    ▼
                              intel.brief ──────────► Telegram W8
                                                ├───► W12 storage
                                                └───► W13 dashboard
```

---

## Interface Stability

All W11 components consume existing W9/W10 types via interface (not direct class imports). This ensures:
- W9/W10 implementations can change without breaking W11
- W11 can be tested with mocks in isolation
- Future W12+ can replace implementations behind same interface
