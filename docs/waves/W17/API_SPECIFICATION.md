# APEX-SENTINEL W17 — API SPECIFICATION

## /demo/* Endpoints (FR-W17-05)

All endpoints return `Content-Type: application/json` with `Access-Control-Allow-Origin: *`.

---

### GET /demo/scenarios

Returns list of available demo scenarios.

**Response 200:**
```json
{
  "scenarios": [
    {
      "name": "CHALLENGE_01_PERIMETER",
      "description": "Challenge 01 perimeter defence...",
      "challenge": "C01",
      "duration_s": 30,
      "expectedAwningTransitions": [
        { "from": "WHITE", "to": "YELLOW", "at_s": 5 },
        { "from": "YELLOW", "to": "RED", "at_s": 15 }
      ],
      "coordinates": { "lat": 44.1, "lon": 26.1 }
    }
  ],
  "count": 6
}
```

---

### POST /demo/run/:scenarioName

Starts a demo scenario. Fire-and-forget — returns immediately.

**URL params:** `scenarioName` ∈ `CHALLENGE_01_PERIMETER | CHALLENGE_01_SWARM | CHALLENGE_02_URBAN | CHALLENGE_02_TRAJECTORY | NATO_AWNING_ESCALATION | FULL_PIPELINE`

**Response 202:**
```json
{ "accepted": true, "scenario": "CHALLENGE_01_PERIMETER", "message": "Scenario started" }
```

**Response 400 (unknown scenario):**
```json
{ "error": "Unknown scenario", "scenario": "X", "valid": ["CHALLENGE_01_PERIMETER", ...] }
```

---

### GET /demo/scorecard

Returns EUDIS compliance scorecard.

**Response 200:**
```json
{
  "scorecard": [...],
  "score": { "challenge01": 100, "challenge02": 100, "total": 100 },
  "metCount": 11,
  "totalRequirements": 11
}
```

---

### GET /demo/benchmark

Runs all registered benchmarks and returns results (cached after first run).

**Response 200:**
```json
{
  "results": [
    { "name": "detection_latency", "p50": 0.5, "p95": 2.1, "p99": 5.3, "sla": 100, "pass": true, "iterations": 100 }
  ],
  "allPass": true,
  "passCount": 4,
  "failCount": 0,
  "runAt": "2026-03-28T09:00:00.000Z"
}
```

---

### GET /demo/coverage

Returns Romania sensor coverage GeoJSON + summary.

**Response 200:**
```json
{
  "geoJson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [[[26.1, 44.4], ...]] },
        "properties": {
          "gridLat": 44.4, "gridLon": 26.1,
          "covered": true, "coveringNodes": ["Node-RO-01", "Node-RO-02"],
          "gapRisk": "none"
        }
      }
    ]
  },
  "summary": { "totalCells": 3713, "coveredCells": 12, "coveragePercent": 0.3, "highRiskGaps": 3701 }
}
```

---

### GET /demo/status

Full system status including wave manifest and EUDIS score.

**Response 200:**
```json
{
  "system": "APEX-SENTINEL",
  "version": "W17",
  "status": "operational",
  "waveManifest": { "totalWaves": 17, "totalFRs": 44, "totalTests": 3097, "totalSourceFiles": 85 },
  "eudisScore": { "challenge01": 100, "challenge02": 100, "total": 100 },
  "demoScenarios": { "available": 6, "active": null },
  "timestamp": "2026-03-28T09:00:00.000Z"
}
```
