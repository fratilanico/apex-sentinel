# W14 IMPLEMENTATION_PLAN

## Order of Implementation
1. ApiRateLimiter (pure logic, no deps) — FR-W14-07
2. DetectionSerializer (pure logic, no deps) — FR-W14-03
3. DashboardStateStore (pure state) — FR-W14-04
4. NodeHealthAggregator (pure state) — FR-W14-05
5. SseStreamManager (Node.js streams) — FR-W14-02
6. DemoScenarioEngine (EventEmitter) — FR-W14-06
7. DashboardApiServer (HTTP server) — FR-W14-01
8. DashboardIntegrationLayer (wires all) — FR-W14-08

## TDD Red-Green-Refactor
Each FR: write failing tests → implement source → tests GREEN

## Time Estimate
- 8 source files × ~100 lines = ~800 lines TS
- 8 test files × ~120 lines = ~960 lines TS
- Total: ~1760 lines
- Estimate: 2-3 hours
