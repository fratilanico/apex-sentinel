# W14 HANDOFF

## What Was Built
REST + SSE backend API for APEX-SENTINEL hackathon demo dashboard.
8 TypeScript modules, ~100 tests, pure Node.js http module.

## How to Run
```bash
npx tsx src/dashboard/dashboard-api-server.ts
# Server starts on port 8080
# GET http://localhost:8080/health
# GET http://localhost:8080/stream (SSE)
```

## How to Demo
```bash
# Trigger OSINT surge scenario
curl -X POST http://localhost:8080/scenario/osint_surge

# Trigger Shahed approach
curl -X POST http://localhost:8080/scenario/shahed_approach
```

## Key Files
- src/dashboard/dashboard-api-server.ts — entry point
- src/dashboard/demo-scenario-engine.ts — demo scenarios
- tests/dashboard/ — all tests

## Known Limitations
- In-memory only (resets on restart)
- No auth (demo mode)
- NATS integration is optional (system works standalone with demo scenarios)
