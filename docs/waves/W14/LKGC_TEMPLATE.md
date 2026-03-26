# W14 LKGC_TEMPLATE

## Last Known Good Configuration

### Commit: (to be filled on wave:complete)
### Date: 2026-03-26
### Tests: ~2746 (2646 baseline + ~100 W14)
### Coverage: ≥80% all metrics

## Key Config
- Port: 8080
- SSE heartbeat: 5000ms
- Max SSE clients: 100
- Rate limit: 60 req/min per IP
- Detection window: 50 detections
- AWNING transitions window: 10
- Node offline threshold: 120s
- Node coverage radius: 3.5km
