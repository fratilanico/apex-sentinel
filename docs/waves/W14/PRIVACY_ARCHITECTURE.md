# W14 PRIVACY_ARCHITECTURE

## Stage-Gated Position Disclosure
Position data is disclosed based on detection stage:

| Stage | Position Disclosed | Precision | Rationale |
|-------|-------------------|-----------|-----------|
| 1 | None | — | Single sensor, not confirmed |
| 2 | Approximate | 0.01° (~1km) | Multi-sensor correlation |
| 3 | Precise + trajectory | Full | Confirmed, operator needs full picture |
| AWNING RED | Trajectory always | Full | Override: operator safety |

## Stripped Fields
- ICAO24 identifiers
- UAS registration IDs
- Raw RF session IDs
- Raw lat/lon for Stage 1

## Coarsening Algorithm
Stage 2 positions coarsened to 0.01° resolution:
```
approxLat = Math.round(lat * 100) / 100
approxLon = Math.round(lon * 100) / 100
```

## Demo Mode
CORS * is acceptable for hackathon demo. In production, auth tokens would gate access.
