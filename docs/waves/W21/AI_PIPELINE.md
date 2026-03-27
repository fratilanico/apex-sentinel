# W21 AI PIPELINE — How AI Threat Scores Surface in the UI

## Overview

W21 is a presentation layer. All AI computation is performed by W16-W20 backend engines.
This document describes how the outputs of those AI pipelines are consumed, displayed, and
made actionable in the operator dashboard.

---

## AI Pipeline Origin (Backend — Not W21 Code)

### Classification Pipeline (W5-W7)

The classification chain processes acoustic, RF, and optical sensor data:

```
Raw sensor data
    → W5 AcousticClassifier (22050Hz pipeline, CNN-based)
    → W6 RfFingerprintMatcher (RF signature library)
    → W7 OpticalPatternMatcher (visual confirmation where available)
    → Per-sensor confidence scores [0.0-1.0]
```

Outputs consumed by W21:
- `Aircraft.threatScore` (0-100)
- `ThreatTrack.confidence` (0.0-1.0)
- `ThreatTrack.droneCategory` (Commercial UAS / Modified UAS / Surveillance UAS / Unknown Contact)
- `ThreatTrack.rfSignaturePresent`
- `ThreatTrack.acousticSignaturePresent`
- `ThreatTrack.freqRangeHz`

### Threat Fusion (W9, W12, W19)

Multi-sensor fusion produces a unified threat picture:

```
W9 MultiSensorFusionEngine
    → combines per-sensor confidence
    → geospatial correlation (same object seen by multiple nodes)
    → temporal coherence check
    → outputs: unified ThreatTrack with confidence

W12 ThreatIntelligenceEnricher
    → cross-references known drone signatures
    → checks ACLED threat context for zone
    → outputs: enriched threat score, intel tags

W19 ThreatIntelPicture
    → aggregates all W12 outputs
    → computes zone-level AWNING level
    → outputs: AWNING level for each protected zone
```

Outputs consumed by W21:
- `ProtectedZone.awningLevel` (GREEN/YELLOW/ORANGE/RED)
- `Alert.droneCategory`
- `Alert.awningLevel`

### AWNING Level Computation (W19)

```
AWNING GREEN:  No active ThreatTrack in zone; no correlated signals
AWNING YELLOW: Unverified detection; single-sensor, low confidence (<0.6)
AWNING ORANGE: Multi-sensor correlation, confidence ≥0.6; no SLA breach
AWNING RED:    Confirmed contact confidence ≥0.85; or SLA breach on YELLOW+
```

---

## W21 UI: Surfacing AI Outputs

### 1. Threat Score on Aircraft Markers

Every aircraft on the ZoneMap carries a threat score (0-100) computed by W19:

```
threatScore 0-25:   blue marker   — conventional traffic, low anomaly
threatScore 26-50:  amber marker  — anomalous behaviour, monitoring
threatScore 51-75:  orange marker — elevated threat, assess immediately
threatScore 76-100: red marker    — high confidence threat
```

Visual implementation in `AircraftLayer.tsx`:
- Marker colour is derived from `aircraft.threatScore`
- Score displayed in the aircraft detail panel in JetBrains Mono
- Conventional aircraft (`isConventionalAircraft: true`) get a plane icon
- High-threat contacts get a pulsing circle animation

Rationale for showing score numerically: operators asked for numbers in user research.
A coloured dot alone does not convey margin (score 51 vs score 99 both look "red").

### 2. Drone Category Labels on Alert Cards

AI classification produces an internal category (Cat-A through Cat-D). The W21 UI maps
these to operator vocabulary:

| AI Category | UI Label | Alert card colour context |
|-------------|----------|--------------------------|
| Cat-A | Commercial UAS | Info level alert (likely rogue, low threat) |
| Cat-B | Modified UAS | Warning or critical (capability unknown) |
| Cat-C | Surveillance UAS | Critical (deliberate incursion) |
| Cat-D | Unknown Contact | Warning (insufficient data, cannot classify) |

These labels appear in:
- `AlertCard.tsx` — `ThreatCategory` component
- `AircraftDetailPanel.tsx` — when `droneCategory` is non-null
- `IncidentCard.tsx` — summary of categories involved

### 3. Confidence Score Display

ThreatTrack.confidence (0.0-1.0) is displayed as a percentage:

```
In AlertCard:     "Modified UAS  confidence 94%"
In ZoneDetail:    "Last detection: Modified UAS 94% conf, 00:45 ago"
In IncidentCard:  "Peak confidence: 94% (Modified UAS)"
```

Confidence below 60% triggers a visual flag: "(LOW CONF)" in amber text.
Operators are trained to treat low-confidence detections as unverified.

### 4. AWNING Level as Zone Status

AWNING levels are the primary zone status indicator. The colour system is:

```
Zone circle fill:   30% opacity AWNING colour
Zone circle border: 100% opacity AWNING colour, 2px
Zone label badge:   solid AWNING colour background
```

When AWNING level escalates (e.g. GREEN → RED), Framer Motion animates the zone circle
colour transition over 300ms. The alert list prepends a new alert for the escalation.

The TopBar always shows a compact AWNING level summary:
```
● GREEN: 9   ● YELLOW: 2   ● ORANGE: 0   ● RED: 1
```

### 5. Acoustic and RF Signature Indicators

`ThreatTrack.rfSignaturePresent` and `ThreatTrack.acousticSignaturePresent` are shown
in the zone detail panel and aircraft detail panel as icons with text labels:

```
🔊 Acoustic signature confirmed
📡 RF signature confirmed
📡✕ RF silent (modified drone pattern)
```

No icons without text labels (WCAG requirement). If both acoustic and RF are confirmed,
the confidence bar renders with an "MULTI-SENSOR" badge.

### 6. Flyability Score

W18 AtmosphericConditionProvider computes a flyability score (0-100) that integrates:
- Wind speed (>10m/s = significant penalty)
- Visibility (<3000m = significant penalty)
- Precipitation
- Cloud cover

UI rendering in `FlyabilityScore.tsx`:

```
flyabilityScore 80-100: EXCELLENT — green fill
flyabilityScore 60-79:  GOOD      — light green
flyabilityScore 40-59:  MARGINAL  — amber
flyabilityScore 20-39:  POOR      — orange
flyabilityScore 0-19:   PROHIBITED — red (automatic NOTAM check required)
```

High flyability scores during active threat detections are flagged with a note:
"Atmospheric conditions favour UAS operations — heightened vigilance recommended"

### 7. System Health Score

W16 SystemHealthDashboard computes an overall health score (0-100). The W21 UI displays
this in `NetworkHealthPanel.tsx` as a gauge with breakdown:

```
Score ≥ 90: NOMINAL (green)
Score 70-89: DEGRADED (amber)
Score < 70:  CRITICAL (red, triggers Telegram notification)
```

The score feeds into operator confidence: if sensors are degraded, threat confidence
from those sensors should be discounted. W21 surfaces this relationship explicitly:

> "3 of 7 sensor nodes offline — classifications from zones LRCK, LRBM may have reduced
>  confidence until nodes are restored."

---

## AI Transparency Rules

Per EASA AI Act Art.13 (transparency for high-risk AI systems), the W21 UI must not
present AI outputs as absolute facts:

1. Every threat classification includes a confidence percentage.
2. Low-confidence (<60%) classifications include a "(LOW CONF)" flag.
3. Single-sensor detections include a "(SINGLE SENSOR)" flag.
4. The AWNING level tooltip explains what triggered the level change.
5. The compliance dashboard shows classification accuracy rate.

These rules are enforced at the component level. `AlertCard.tsx` will not render without
the confidence value. If W18-W20 engines return a detection without confidence, the UI
defaults to showing "CONF: UNKNOWN" rather than omitting the field.

---

## AI Quality Metrics in Compliance Dashboard

`ComplianceDashboard.tsx` surfaces:

| Metric | Source | Display |
|--------|--------|---------|
| Category accuracy % | W19 / transponder crosscheck | e.g. "87.3% (1204 tracks)" |
| AWNING level changes last 24h | W19 event log | Number with breakdown by direction |
| False positive rate (estimated) | Acknowledged then resolved without incident | % |
| Mean detection-to-alert latency | W20 timing data | e.g. "1.2s P50 / 2.1s P95" |

---

*Document version: W21-AI_PIPELINE-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
