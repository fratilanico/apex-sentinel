# APEX-SENTINEL — AI_PIPELINE.md
## W4 AI Pipeline — Dashboard Display Layer
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. W4 POSITION IN AI PIPELINE

W4 is the **consumption layer** of the APEX-SENTINEL AI pipeline. It does not run any inference. All inference happens upstream in W1-W3. W4 displays the outputs.

```
APEX-SENTINEL AI PIPELINE — FULL STACK

W1  ┌──────────────────────────────────────────────────────────────┐
    │ GATE 1: ON-DEVICE DETECTION (TypeScript, mobile device)       │
    │ • AudioClassifier: 50ms inference windows, YAMNet-derived     │
    │ • RFAnalyzer: spectral fingerprinting, 433/868/2.4GHz         │
    │ • Output: DetectionEvent{class, confidence, gate, timestamp}  │
    └──────────────────────────────────┬───────────────────────────┘
                                       │ NATS sentinel.detections.*
W2  ┌──────────────────────────────────▼───────────────────────────┐
    │ GATE 2: TDOA CORRELATION (TdoaCorrelator, TypeScript)         │
    │ • Multi-node time-difference of arrival                       │
    │ • Kalman filter for position estimation                       │
    │ • Output: Track{position, confidence, detection_gates}        │
    └──────────────────────────────────┬───────────────────────────┘
                                       │ Writes to tracks table
                                       │ NATS sentinel.alerts.*
W3  ┌──────────────────────────────────▼───────────────────────────┐
    │ GATE 3: FUSION & ALERT GENERATION (Edge Functions)            │
    │ • Multi-gate confirmation: requires ≥2 gates for CRITICAL     │
    │ • EKF trajectory prediction (3s horizon)                      │
    │ • LSTM velocity model for class disambiguation                │
    │ • Output: Alert{severity, cot_xml, trajectory_prediction}     │
    └──────────────────────────────────┬───────────────────────────┘
                                       │ Supabase Realtime tracks
                                       │ NATS sentinel.alerts.>
W4  ┌──────────────────────────────────▼───────────────────────────┐  ← YOU ARE HERE
    │ GATE 4: DASHBOARD DISPLAY (Next.js 14, browser)               │
    │ • Renders Gate 3 outputs: tracks, alerts, trajectories        │
    │ • Color-codes by threat class and confidence                  │
    │ • OpenMCT: temporal context for detections                    │
    │ • No inference — display layer only                           │
    └──────────────────────────────────────────────────────────────┘

W5  (planned)
    • AI-generated threat assessment summaries (LLM)
    • Anomaly detection on detection patterns
    • Predictive threat routing
```

---

## 2. GATE 3 OUTPUT DISPLAY

### 2.1 Track Confidence Rendering

The dashboard receives `confidence: 0.0–1.0` from the TdoaCorrelator. This is displayed in three ways simultaneously:

```
TrackMarker on globe:
  ≥0.85  : Full opacity billboard + pulsing outline (2px, threat color, 0.8Hz)
  0.60-0.84: 0.85 opacity, no pulse
  0.40-0.59: 0.65 opacity, dashed outline on billboard
  <0.40  : 0.40 opacity, dashed outline, grey tint

TrackTable confidence column:
  ≥0.85  : #00E676 (green) text + "94%" display
  0.60-0.84: #FFD700 (amber) text + "71%"
  0.40-0.59: #FF6B00 (orange) text + "52%"
  <0.40  : #FF5252 (red) text + "31%"

TrackDetail panel:
  ConfidenceMeter component: horizontal bar, color-coded
  Gate badges: [ACOUSTIC ✓] [RF ✓] [OPTICAL ✗]
```

### 2.2 Multi-Gate Badge

When a track has been confirmed by multiple detection gates, the dashboard shows a multi-gate confirmation badge.

```
detection_gates: { acoustic: true, rf: true, optical: false }

Badge display:
  ┌─────────────────────────┐
  │ ● ACOUSTIC  ● RF  ○ OPT │
  └─────────────────────────┘
  ● = gate active (green)
  ○ = gate inactive (grey)

Badge states:
  1 gate   : "SINGLE SOURCE" amber badge — lower trustworthiness
  2 gates  : "DUAL SOURCE" green badge
  3 gates  : "TRIPLE SOURCE" bright green + star ★

Confidence bonus display:
  When ≥2 gates: "(+corroborated)" label under confidence %
  Rationale: operators understand multi-source confirmation means
             lower false positive probability
```

### 2.3 Threat Class Color Cascade

The AI model in W1 outputs one of 8 threat classes. The dashboard maps these to the canonical colors defined in DESIGN.md §2.3. The mapping is defined in `src/lib/cesium/cesiumColors.ts` and `src/styles/threatColors.ts` — single source of truth, used by both Cesium entity renderer and React components.

```typescript
// src/lib/threatColors.ts — canonical mapping
export const THREAT_CLASS_COLORS: Record<ThreatClass, string> = {
  FPV_DRONE:   '#FF2D2D',
  SHAHED:      '#FF6B00',
  HELICOPTER:  '#FFD700',
  FIXED_WING:  '#FF9500',
  MULTIROTOR:  '#FF4500',
  UNKNOWN:     '#8B92A8',
  FRIENDLY:    '#00E676',
  DECOY:       '#7C4DFF',
};

export const THREAT_CLASS_LABELS: Record<ThreatClass, string> = {
  FPV_DRONE:   'FPV Drone',
  SHAHED:      'Shahed-136',
  HELICOPTER:  'Helicopter',
  FIXED_WING:  'Fixed Wing',
  MULTIROTOR:  'Multirotor',
  UNKNOWN:     'Unknown UAV',
  FRIENDLY:    'Friendly',
  DECOY:       'Decoy',
};
```

---

## 3. OPENMCT TELEMETRY DEFINITIONS

OpenMCT receives time-series data from the AI pipeline via two channels:
- **Live**: Zustand store subscription (from Supabase Realtime)
- **Historical**: `get-track-history` Edge Function

### 3.1 Track Telemetry Object Definition

```typescript
// OpenMCT domain object for a track
{
  identifier: {
    namespace: 'apex-sentinel',
    key: 'track-TRK-A7F2'
  },
  type: 'apex-sentinel.track',
  name: 'TRK-A7F2 (FPV Drone)',
  telemetry: {
    values: [
      {
        key: 'utc',
        source: 't',
        name: 'Timestamp',
        format: 'utc',
        hints: { domain: 1 }
      },
      {
        key: 'confidence',
        name: 'Confidence',
        unit: '%',
        format: 'float[2]',
        min: 0,
        max: 1,
        hints: { range: 1 }
      },
      {
        key: 'altitude_m',
        name: 'Altitude (m AGL)',
        unit: 'm',
        format: 'integer',
        hints: { range: 2 }
      },
      {
        key: 'speed_kmh',
        name: 'Speed',
        unit: 'km/h',
        format: 'float[1]',
        hints: { range: 3 }
      }
    ]
  }
}
```

### 3.2 Node Health Telemetry

```typescript
// OpenMCT domain object for a sensor node
{
  identifier: {
    namespace: 'apex-sentinel',
    key: 'node-NODE-007'
  },
  type: 'apex-sentinel.node',
  name: 'NODE-007 (Alpha-7)',
  telemetry: {
    values: [
      {
        key: 'utc',
        source: 't',
        name: 'Timestamp',
        format: 'utc',
        hints: { domain: 1 }
      },
      {
        key: 'status',
        name: 'Status',
        format: 'enum',
        enumerations: [
          { value: 1, string: 'ONLINE' },
          { value: 0, string: 'OFFLINE' },
          { value: 0.5, string: 'DEGRADED' }
        ],
        hints: { range: 1 }
      },
      {
        key: 'battery_pct',
        name: 'Battery',
        unit: '%',
        format: 'integer',
        min: 0,
        max: 100,
        hints: { range: 2 }
      }
    ]
  }
}
```

---

## 4. TRAJECTORY PREDICTION DISPLAY (W5 PLACEHOLDER)

W3 generates a 3-second EKF trajectory prediction for each active track. W4 displays this as a dotted line extension beyond the track's current position.

### 4.1 Display Logic

```typescript
// src/components/globe/TrajectoryLine.tsx

interface TrajectoryPrediction {
  track_id: string;
  points: Array<{ lat: number; lon: number; alt_m: number; t_offset_s: number }>;
  confidence_at_end: number;   // confidence degrades over prediction horizon
}

// Renders as Cesium PolylineDashMaterialProperty:
//   - Color: threat class color at 0.3 opacity (lighter than trail)
//   - Dash pattern: 4px dash, 8px gap (more spaced than historical trail)
//   - Width: 1px (thinner than historical trail)
//   - Extends from current position to 3s predicted future

// W5 will extend this to full LSTM trajectory with uncertainty cone
```

### 4.2 Uncertainty Cone (Placeholder)

In W4, the trajectory is shown as a single line. W5 will add an uncertainty cone (expanding ellipse) showing the ±1σ position uncertainty at each predicted time step. The code stub is placed in `TrajectoryLine.tsx` as commented-out skeleton.

---

## 5. DETECTION DENSITY HEATMAP

### 5.1 Data Source

The heatmap is computed from `track_position_events` table, aggregated into 500m grid cells. This is a post-processed view of Gate 1-3 outputs.

### 5.2 Rendering

```
Layer name   : DetectionHeatmap
Cesium type  : Cesium.WebMapServiceImageryProvider (WMS) or custom tile layer
Toggle       : LayerControls "☑ Heatmap"
Time window  : last 24h by default, adjustable via timeline

Color scale:
  0 detections   : transparent
  1-5/500m²      : #00B4FF at 0.2 opacity (low density — cyan)
  6-20/500m²     : #FFD700 at 0.35 opacity (medium — amber)
  21-50/500m²    : #FF6B00 at 0.5 opacity (high — orange)
  >50/500m²      : #FF2D2D at 0.65 opacity (very high — red)

Purpose: Identifies persistent threat approach corridors.
         Analyst use case: "Drones consistently approach from bearing 247°,
         suggest node redeployment to that corridor."
```

### 5.3 Heatmap Computation

The heatmap tiles are generated on-demand by the `get-detection-heatmap` Edge Function (W5 scope) or by a materialized table updated by pg_cron every 15 minutes.

---

## 6. CONFIDENCE TREND DISPLAY

### 6.1 Within TrackDetail Panel

```
Confidence trend: small sparkline showing confidence over last 60 updates
  Data source: last 60 rows from track_position_events for track_id
  Render: SVG path, 80×20px, threat class color
  Up trend (improving confidence): label "STRENGTHENING"
  Down trend (degrading confidence): label "DEGRADING"
  Flat: no label

Interpretation guide (tooltip on ?):
  "Confidence increases when more detection gates confirm the track.
   Confidence decreases as the track moves away from sensor coverage."
```

### 6.2 Timeline Confidence Channel (OpenMCT)

OpenMCT shows the confidence telemetry as a continuous line plot in the timeline. Color: same as threat class. Scale: 0–1 (left y-axis). Overlaid with vertical markers at each gate confirmation event.

---

## 7. ALERT SEVERITY MAPPING FROM AI PIPELINE

W3 maps multi-gate confidence to alert severity using this logic (displayed, not computed, by W4):

```
Severity computation (W3 logic, displayed in W4):
  CRITICAL : confidence ≥ 0.85 AND gates ≥ 2 AND threat_class ∈ {FPV_DRONE, SHAHED}
  HIGH     : confidence ≥ 0.70 AND (gates ≥ 2 OR class ∈ {FPV_DRONE, SHAHED})
  MEDIUM   : confidence ≥ 0.50
  LOW      : confidence ≥ 0.30
  INFO     : confidence < 0.30 (tentative detection, informational only)

W4 displays this severity with full context:
  - Why CRITICAL: tooltip "High confidence (94%) + dual-source (ACOUSTIC+RF) + FPV class"
  - Why HIGH: tooltip "High confidence, single-source detection"
  - This transparency reduces alert fatigue — operators understand the logic
```

---

*AI_PIPELINE.md — APEX-SENTINEL W4 — approved 2026-03-24*
