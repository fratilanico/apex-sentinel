# W14 ACCEPTANCE_CRITERIA

## FR-W14-01
- AC1: GET /health returns { status, uptime_s, version } within 50ms
- AC2: GET /awning returns current level + last 10 transitions
- AC3: GET /detections returns last 50 detections (privacy-safe)
- AC4: GET /intel returns latest IntelBrief or null
- AC5: GET /nodes returns all node statuses
- AC6: GET /stream upgrades to SSE
- AC7: Unknown route returns 404 JSON
- AC8: Wrong method returns 405 JSON
- AC9: All responses have CORS headers

## FR-W14-02
- AC1: broadcast() delivers to all connected SSE clients
- AC2: Heartbeat fires every 5s
- AC3: Disconnected clients are cleaned up
- AC4: Max 100 clients enforced (oldest dropped)
- AC5: getConnectionCount() accurate

## FR-W14-03
- AC1: Stage 1 — no lat/lon in output
- AC2: Stage 2 — approxLat/approxLon coarsened to 0.01°
- AC3: Stage 3 — precise position + trajectory included
- AC4: AWNING RED — trajectory always included
- AC5: ICAO24, UAS ID, RF session ID stripped

## FR-W14-04
- AC1: update() stores each event type correctly
- AC2: getSnapshot() returns consistent state
- AC3: pruneOld() removes detections older than windowMs
- AC4: Detection list capped at 50

## FR-W14-05
- AC1: Node online if lastSeen < 60s ago
- AC2: Node degraded if lastSeen 60-120s ago
- AC3: Node offline if lastSeen > 120s ago
- AC4: 3 pre-populated demo nodes on construction
- AC5: Coverage radius = 3.5km for all acoustic nodes

## FR-W14-06
- AC1: 3 scenarios available in getScenarioList()
- AC2: SCENARIO_SHAHED_APPROACH emits acoustic → Stage 2 → Stage 3 → RED
- AC3: cancelScenario() halts emission
- AC4: All coordinates within Romania theater

## FR-W14-07
- AC1: 60 requests allowed, 61st returns { allowed: false }
- AC2: retryAfterMs > 0 when not allowed
- AC3: Per-IP isolation (IP-A exhausted doesn't block IP-B)
- AC4: SSE connections exempt from rate limit

## FR-W14-08
- AC1: NATS awning.alert updates StateStore
- AC2: NATS detection.enriched updates StateStore + broadcasts SSE
- AC3: start() begins subscriptions, stop() ends them
- AC4: Stage 3 detection triggers SSE broadcast
- AC5: 5+ integration scenarios pass
