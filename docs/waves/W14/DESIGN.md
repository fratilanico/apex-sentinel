# W14 DESIGN — Demo Dashboard API + Live Visualization Backend

## Overview
W14 delivers the backend API layer for the APEX-SENTINEL hackathon demo dashboard.
Pure Node.js http module, no frameworks. REST + SSE endpoints serve the full threat picture
to any frontend (HTML/JS, mobile, tablet).

## System Components
1. **DashboardApiServer** — HTTP server, port 8080, all routes
2. **SseStreamManager** — SSE fanout, heartbeat, max 100 clients
3. **DetectionSerializer** — privacy-safe serialization by stage
4. **DashboardStateStore** — in-memory state: AWNING, detections, intel, nodes
5. **NodeHealthAggregator** — sensor node health tracking, 3 demo nodes
6. **DemoScenarioEngine** — 3 scripted hackathon scenarios
7. **ApiRateLimiter** — token bucket, 60 req/min per IP
8. **DashboardIntegrationLayer** — NATS subscriber, wires pipeline to dashboard

## Design Principles
- Zero new npm packages. Pure Node.js stdlib.
- Single-threaded event loop = no locks needed.
- Privacy by design: stage-gated position disclosure.
- Demo-first: pre-scripted scenarios for judges.
