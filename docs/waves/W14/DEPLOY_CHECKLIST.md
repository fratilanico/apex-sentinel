# W14 DEPLOY_CHECKLIST

## Pre-Deploy
- [ ] npx vitest run tests/dashboard/ — all GREEN
- [ ] npx tsc --noEmit — no type errors
- [ ] Port 8080 free on demo machine

## Deploy (Hackathon Demo Machine)
- [ ] git pull origin main
- [ ] node dist/dashboard/dashboard-api-server.js (or tsx src/dashboard/dashboard-api-server.ts)
- [ ] Verify GET http://localhost:8080/health returns { status: 'ok' }
- [ ] Open SSE stream: curl http://localhost:8080/stream (should see heartbeats every 5s)

## Demo Run
- [ ] Run SCENARIO_OSINT_SURGE via demo control endpoint
- [ ] Verify AWNING transitions to YELLOW on /awning
- [ ] Run SCENARIO_SHAHED_APPROACH
- [ ] Verify detections appear on /detections
- [ ] Verify Stage 3 detection has trajectory

## Rollback
- Kill process, no persistent state to clean up.
