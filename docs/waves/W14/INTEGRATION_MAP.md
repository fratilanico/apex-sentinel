# W14 INTEGRATION_MAP

## Upstream Dependencies
| System | Interface | Notes |
|--------|-----------|-------|
| NATS Bus | nats.connect() | Optional — system works without it |
| W10 AWNING | NATS awning.alert | AwningLevel enum |
| W11 Intel | NATS intel.brief | IntelBrief shape |
| W6 Detection | NATS detection.enriched | enriched detection shape |
| W5 Node Mesh | NATS node.health | node heartbeat |

## Downstream Consumers
| System | Interface | Notes |
|--------|-----------|-------|
| Demo Dashboard Frontend | HTTP REST + SSE | Browser-based, any origin |
| Hackathon Judges | Browser | GET /health, /awning, /detections |

## Internal Module Map
```
DashboardIntegrationLayer
  ├── DashboardStateStore
  ├── SseStreamManager
  ├── NodeHealthAggregator
  └── DetectionSerializer

DashboardApiServer
  ├── DashboardStateStore (read-only)
  ├── SseStreamManager (register clients)
  ├── NodeHealthAggregator (read-only)
  └── ApiRateLimiter (gate all requests)

DemoScenarioEngine
  └── EventEmitter → DashboardIntegrationLayer
```
