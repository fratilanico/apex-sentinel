# W14 ARCHITECTURE

## Layer Diagram
```
NATS Bus ──► DashboardIntegrationLayer
                    │
                    ▼
             DashboardStateStore ──► DashboardApiServer (HTTP :8080)
                    │                        │
                    │                        ├── GET /health
                    │                        ├── GET /awning
                    │                        ├── GET /detections (DetectionSerializer)
                    │                        ├── GET /intel
                    │                        ├── GET /nodes (NodeHealthAggregator)
                    │                        └── GET /stream ──► SseStreamManager
                    │
             NodeHealthAggregator
             DemoScenarioEngine ──► EventEmitter ──► DashboardIntegrationLayer
             ApiRateLimiter (per-IP token bucket)
```

## Data Flow
1. NATS events arrive at DashboardIntegrationLayer
2. IntegrationLayer updates DashboardStateStore
3. IntegrationLayer broadcasts to SseStreamManager
4. REST clients poll endpoints, served from DashboardStateStore
5. SSE clients receive push events from SseStreamManager
6. DemoScenarioEngine injects synthetic events for demo mode

## Concurrency
Node.js single-threaded event loop. No locks. State updates are synchronous.
