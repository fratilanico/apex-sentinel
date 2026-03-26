# APEX-SENTINEL W10 — AI Pipeline

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## EKF Trajectory Prediction (Stage 3.5)

### Algorithm: Extended Kalman Filter (constant-velocity model)

State vector (6-dimensional):
```
x = [lat, lon, alt, v_lat, v_lon, v_alt]
```

Process model (discrete, dt = time since last update in seconds):
```
x_k = F * x_{k-1}
F = [[1,0,0,dt,0,0],
     [0,1,0,0,dt,0],
     [0,0,1,0,0,dt],
     [0,0,0,1,0,0],
     [0,0,0,0,1,0],
     [0,0,0,0,0,1]]
```

Process noise Q: diagonal, tuned for drone dynamics (σ_pos=0.0001°, σ_vel=0.00005°/s).

Measurement model:
```
H = [[1,0,0,0,0,0],
     [0,1,0,0,0,0],
     [0,0,1,0,0,0]]
```

Measurement noise R: diagonal (GPS accuracy ≈ 5m = 0.000045°).

### Confidence Radius

At prediction horizon t seconds:
```
σ_pos = sqrt(P[0][0] + P[1][1])   // lat/lon covariance
σ_extrapolated = σ_pos + process_noise_rate * t
confidence_radius_m = σ_extrapolated * 111000  // deg → meters
min 50m, max 5000m (practical bounds)
```

### Convergence

After 3+ position updates, velocity estimate stabilizes. Predictions before that are marked with inflated confidence radius (>1000m).

---

## Threat Score → AWNING Mapping

The contextScore from ThreatContextEnricher (W9) encodes:
- ADS-B absence (+points)
- Squawk 7500/7600/7700 proximity (+points)
- Civil protection alert level (+points)
- OSINT event density (+points)
- RemoteID beacons nearby (+points)

Score bands → AWNING levels are deterministic (no ML, by design — NATO requires auditability).

---

## Stage Classification Logic

Pure rule-based (no probabilistic model). NATO Stage definitions are regulatory — they cannot be trained away.

```
Stage 1: acoustic_confidence >= 0.75
Stage 2: Stage 1 AND rf_fingerprint_match == true
Stage 3: Stage 2 AND (adsb_correlated OR remote_id_within_500m)
```

All rules are white-box, explainable, and auditable.

---

## Coverage Gap Analysis

Grid-based spatial analysis:
- Cell size: 0.1° (~11km at equator, ~8km at 45°N)
- Blind spot threshold: 3.5km from nearest node
- Risk flagging: blind spot AND OSINT event count > 0 → MEDIUM; > 2 → HIGH
