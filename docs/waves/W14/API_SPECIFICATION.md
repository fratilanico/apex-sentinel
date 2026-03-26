# W14 API_SPECIFICATION

## Base URL
`http://<host>:8080`

## Endpoints

### GET /health
Response 200:
```json
{ "status": "ok", "uptime_s": 42.5, "version": "14.0.0" }
```

### GET /awning
Response 200:
```json
{
  "level": "YELLOW",
  "transitions": [
    { "from": "GREEN", "to": "YELLOW", "ts": 1711234567890, "reason": "OSINT surge" }
  ]
}
```

### GET /detections
Response 200:
```json
{
  "detections": [
    { "id": "det-001", "droneType": "Shahed-136", "stage": 2, "approxLat": 44.40, "approxLon": 26.10, "ts": 1711234567890 }
  ],
  "count": 1
}
```

### GET /intel
Response 200:
```json
{ "brief": { ... } | null }
```

### GET /nodes
Response 200:
```json
{
  "nodes": [
    { "nodeId": "Node-RO-01", "lat": 44.43, "lon": 26.10, "status": "online", "detectionCount": 3, "coverageRadiusKm": 3.5 }
  ]
}
```

### GET /stream
SSE stream. Content-Type: text/event-stream

Event types:
- `heartbeat` — every 5s: `data: {"ts": 1711234567890}`
- `awning_update` — AWNING level changed
- `detection` — new detection
- `intel_brief` — new intel brief
- `node_health` — node status update

### Error Responses
- 404: `{ "error": "Not Found", "path": "/unknown" }`
- 405: `{ "error": "Method Not Allowed", "method": "POST" }`
- 429: `{ "error": "Too Many Requests", "retryAfterMs": 5000 }` + `Retry-After` header

## CORS
All responses include `Access-Control-Allow-Origin: *` (demo mode).
