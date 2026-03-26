# W14 TEST_STRATEGY

## Test Pyramid (per FR)
- Unit tests: 10-15 per FR
- Integration: 5+ for FR-W14-08
- Total target: ~100 tests

## Test Approach

### FR-W14-01 API Server
- Mock createServer, test route dispatch
- Verify JSON shape for each endpoint
- Verify 404/405 responses

### FR-W14-02 SSE Stream
- Test broadcast fanout to multiple mock clients
- Test heartbeat interval
- Test max client limit (drop oldest)
- Test client cleanup on disconnect

### FR-W14-03 Detection Serializer
- Test each stage (1/2/3/RED) with known inputs
- Verify lat/lon absent in stage 1
- Verify coarsening to 0.01° in stage 2
- Verify stripped fields not present

### FR-W14-04 State Store
- Test update() for each event type
- Test getSnapshot() shape
- Test pruneOld() removes old detections
- Test 50-detection cap

### FR-W14-05 Node Health
- Test status transitions: online/degraded/offline by lastSeen age
- Test pre-populated demo nodes
- Test updateHeartbeat() updates lastSeen
- Test getNodeGrid() returns coverage radius

### FR-W14-06 Demo Scenario Engine
- Test getScenarioList() returns 3 scenarios
- Test runScenario() emits events in correct sequence
- Test cancelScenario() stops emission
- Test Romania coordinates (lat 44.4±0.5, lon 26.1±0.5)

### FR-W14-07 Rate Limiter
- Test 60 requests allowed in window
- Test 61st request returns 429
- Test token refill at 1/sec
- Test per-IP isolation
- Test Retry-After calculation

### FR-W14-08 Integration Layer
- Test NATS subscription updates StateStore
- Test AWNING change triggers SSE broadcast
- Test Stage 3 detection triggers SSE broadcast
- Test start/stop lifecycle
- 5+ end-to-end SSE scenarios

## Coverage Gate
≥80% branches/functions/lines/statements on src/dashboard/**
