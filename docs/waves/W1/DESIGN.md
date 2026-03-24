# APEX-SENTINEL — DESIGN.md
## System Design Overview & UX Specification
### Wave 1 | Project: APEX-SENTINEL | Version: 1.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. DESIGN PHILOSOPHY

APEX-SENTINEL is a civilian-operated defense intelligence platform. The design must serve two radically different user archetypes simultaneously:

1. **The Civilian Volunteer** — operating a smartphone in a city under threat. They need zero cognitive overhead. The app must work while they run, hide, or are under stress.
2. **The C2 Commander** — monitoring a 3D battlespace across a 50km radius. They need maximal information density, fast pattern recognition, and zero false-negative tolerance.

### Core UX Principles

| Principle | Implementation |
|-----------|----------------|
| **Glanceability** | All critical state visible in <2 seconds with zero interaction |
| **Stress Tolerance** | Large touch targets (min 48×48dp), high contrast, no small text for actions |
| **Graceful Degradation** | Full function offline → mesh-only → single node isolation |
| **Zero False Sense of Security** | System health always visible; no hidden failures |
| **Information Hierarchy** | Threat → Alert → Track → Node → System (descending priority) |
| **Military Pragmatism** | No animations that obscure data; no decorative UI |

---

## 2. COLOR SYSTEM — MILITARY DARK THEME

### Base Palette

```
Background Hierarchy:
  Surface-0  (deepest)  : #0A0C10  — main background
  Surface-1             : #0F1117  — card/panel background
  Surface-2             : #14171F  — elevated panels
  Surface-3             : #1A1E28  — modal/overlay background
  Surface-border        : #252A38  — border/divider

Text Hierarchy:
  Text-primary           : #E8EAF0  — primary readable text
  Text-secondary         : #8B92A8  — secondary/metadata
  Text-disabled          : #4A5168  — disabled states
  Text-inverse           : #0A0C10  — text on light backgrounds

Threat Level Colors:
  CRITICAL  (Confirmed)  : #FF2D2D  — red, full saturation
  HIGH      (Probable)   : #FF6B00  — orange
  MEDIUM    (Possible)   : #FFD700  — amber/gold
  LOW       (Detected)   : #00B4FF  — cyan/blue
  CLEAR     (All clear)  : #00E676  — green
  UNKNOWN   (No data)    : #8B92A8  — grey

System Status Colors:
  Online/Active          : #00E676  — #00C853 dark variant
  Warning                : #FFD700
  Error/Offline          : #FF5252
  Mesh-only              : #7C4DFF  — purple (degraded mode)
  Calibrating            : #40C4FF  — light blue

Accent Colors:
  Primary Action         : #00B4FF  — cyan, all primary buttons
  Secondary Action       : #7C4DFF  — purple
  Destructive Action     : #FF5252  — red
  Confirmation           : #00E676  — green

Track Colors (on map):
  Acoustic track         : #FF6B00  — orange
  RF track               : #7C4DFF  — purple
  Fused/confirmed track  : #FF2D2D  — red (highest confidence)
  Historical/faded       : #4A5168  — grey
  Friendly/known asset   : #00E676  — green
```

### Typography

```
Font Stack: "JetBrains Mono", "Fira Code", monospace  — data readouts
            "Inter", "Roboto", system-ui             — UI labels
            "Roboto Condensed", "Arial Narrow"        — map labels

Scale:
  display-xl : 32px / 700 weight — alert headlines
  display-lg : 24px / 600 weight — threat confirmations
  heading-md : 18px / 600 weight — panel titles
  heading-sm : 14px / 600 weight — section headers
  body-lg    : 16px / 400 weight — primary body text
  body-sm    : 13px / 400 weight — metadata
  mono-lg    : 16px / 500 weight / mono — coordinates, IDs
  mono-sm    : 12px / 400 weight / mono — sensor readouts
```

### Iconography

- Primary icon set: Material Design Icons (MDI) — military subset
- Custom icons: drone silhouette (FPV quad, Shahed-136, unknown UAV)
- Node status icons: WiFi antenna, microphone, satellite dish
- Threat state icons: skull (confirmed), exclamation (probable), question (possible)
- All icons: minimum 24×24dp, 2px stroke weight on dark background

---

## 3. C2 DASHBOARD — SCREEN DESIGN

### 3.1 Layout Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER BAR [Surface-1, 56px height]                                │
│  [APEX-SENTINEL logo] [DEFCON: 2 ●RED] [Active: 2,847 nodes]       │
│  [Time: 14:23:07Z] [Tracks: 3 active] [Alerts: 1 CRITICAL]  [≡]   │
├────────────────┬────────────────────────────────────┬───────────────┤
│  LEFT PANEL    │  CENTER MAP VIEWPORT               │  RIGHT PANEL  │
│  [280px]       │  [flex: 1]                         │  [320px]      │
│                │                                     │               │
│  ┌──────────┐  │  ┌─────────────────────────────┐  │  ┌──────────┐ │
│  │THREAT    │  │  │                             │  │  │ACTIVE    │ │
│  │SUMMARY   │  │  │  CesiumJS 3D Globe / Terrain│  │  │ALERTS    │ │
│  │          │  │  │  MapLibre 2D (toggle)       │  │  │          │ │
│  │● CRIT: 1 │  │  │                             │  │  │🔴 CRIT   │ │
│  │● HIGH: 0 │  │  │  [Track overlays]           │  │  │TRK-001   │ │
│  │● MED:  2 │  │  │  [Node heatmap]             │  │  │FPV DRONE │ │
│  │● LOW:  4 │  │  │  [Alert rings]              │  │  │14:21:33Z │ │
│  └──────────┘  │  │                             │  │  │[ACK][TRK]│ │
│                │  └─────────────────────────────┘  │  └──────────┘ │
│  ┌──────────┐  │                                     │               │
│  │LAYER     │  │  MAP CONTROLS [bottom-left]:         │  ┌──────────┐ │
│  │CONTROLS  │  │  [3D/2D][+][-][N][Layers▼]          │  │TRACK     │ │
│  │          │  │                                     │  │DETAILS   │ │
│  │☑ Nodes   │  │  TIME SCRUBBER [bottom-center]:     │  │          │ │
│  │☑ Tracks  │  │  [◀◀][◀][■ LIVE][▶][▶▶] ──────●   │  │TRK-001   │ │
│  │☑ Alerts  │  │                                     │  │Conf: 94% │ │
│  │☑ Heatmap │  │  MINIMAP [bottom-right, 160×120px]: │  │Hdg: 247° │ │
│  │☐ Mesh    │  │  [Overview context map]             │  │Spd: ~85  │ │
│  │☐ RF zones│  │                                     │  │Alt: ~120 │ │
│  └──────────┘  │                                     │  │[ENGAGE]  │ │
│                │                                     │  └──────────┘ │
│  ┌──────────┐  │                                     │               │
│  │NODE      │  │                                     │  ┌──────────┐ │
│  │HEALTH    │  │                                     │  │NODE      │ │
│  │          │  │                                     │  │INSPECTOR │ │
│  │Online:   │  │                                     │  │          │ │
│  │2,847     │  │                                     │  │NODE-4821 │ │
│  │Mesh:  312│  │                                     │  │Battery:  │ │
│  │Offline:89│  │                                     │  │72% ●     │ │
│  │[Details] │  │                                     │  │SNR: 18dB │ │
│  └──────────┘  │                                     │  │ML: v2.1.3│ │
│                │                                     │  │[Calibrate│ │
└────────────────┴────────────────────────────────────┴───────────────┘
│  BOTTOM TIMELINE / OPENMCT STRIP [180px height, collapsible]        │
│  [Detection events stream] [RF anomaly histogram] [Node online chart]│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 C2 Map Layers (CesiumJS + MapLibre)

#### Layer Stack (bottom to top)

| Z-Order | Layer Name | Type | Toggle |
|---------|-----------|------|--------|
| 0 | Base Terrain | Cesium World Terrain | Fixed |
| 1 | Satellite Imagery | Cesium Ion / OSM | Toggle |
| 2 | Urban Footprint | MapLibre vector | Toggle |
| 3 | Node Heatmap | Deck.gl HeatmapLayer | Toggle |
| 4 | Coverage Rings | GeoJSON circles | Toggle |
| 5 | Mesh Topology | Line segments (LoRa links) | Toggle |
| 6 | RF Anomaly Zones | Semi-transparent polygons | Toggle |
| 7 | Detection Points | Animated pulse markers | Always |
| 8 | Threat Tracks | Polylines + heading arrows | Always |
| 9 | Alert Rings | Pulsing concentric circles | Always |
| 10 | Node Icons | Clustered markers | Toggle |
| 11 | MGRS Grid | Grid overlay | Toggle |

#### Node Marker Design

```
Node States (visual encoding):

ONLINE + DETECTING:
  ●  Solid cyan circle (8px) with 12px ring, pulsing 2s
     Color: #00B4FF
     Ring animation: scale 1.0→1.5, opacity 1.0→0.0, 2s repeat

ONLINE + IDLE:
  ●  Solid green circle (6px), no animation
     Color: #00E676

MESH-ONLY (no internet):
  ◆  Purple diamond (8px)
     Color: #7C4DFF

OFFLINE (last seen >5min):
  ○  Grey hollow circle (6px)
     Color: #4A5168

LOW BATTERY (<20%):
  ⚠  Yellow warning overlay on node icon
     Color: #FFD700

CALIBRATING:
  ⟳  Rotating ring animation, light blue
     Color: #40C4FF
```

#### Track Visualization

```
Active Threat Track:
  - Polyline: 3px, color by threat level (RED=confirmed, ORANGE=probable)
  - Direction arrow: Chevron pointing heading, 16px
  - Confidence halo: Semi-transparent circle, radius = uncertainty (σ)
  - Trail: Fading polyline, last 60 seconds, opacity gradient 100%→20%
  - Label: "TRK-001 | FPV | 94% | ↑247°"
  - Prediction cone: 30-second lookahead, dashed outline

Triangulation Visualization:
  - Dashed lines from 3 detecting nodes to intersection
  - Color matches node (cyan for acoustic, purple for RF)
  - Intersection: Pulsing red circle, radius = error ellipse (±62m)
  - Label: "ACOUSTIC TDoA | ±62m | 3 nodes"

Historical Track:
  - Thin grey polyline, 1px
  - No animation
  - Label on hover only
```

### 3.3 Alert Panel States

#### Alert Card Design

```
CRITICAL ALERT CARD:
┌─────────────────────────────────────────────┐
│ ████ CRITICAL  ● TRK-001                    │  ← Red left border (4px)
│ FPV DRONE CONFIRMED                         │  ← Bold, 18px
│ 14:23:07Z | Acoustic + RF | 94% confidence  │  ← Metadata, 13px mono
│ 47.1234°N, 28.9876°E | Alt ~120m           │  ← Position, mono
│ Detected by: 4 nodes | TDoA ±62m           │  ← Source nodes
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│ │ ACKNOWLEDGE│  │  TRACK   │  │  DISMISS │  │  ← Action buttons
│ └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘

HIGH ALERT CARD:
┌─────────────────────────────────────────────┐
│ ▓▓▓▓ HIGH    ● TRK-002                     │  ← Orange left border
│ POSSIBLE UAV - ACOUSTIC SIGNATURE           │  ← 18px
│ 14:21:15Z | Acoustic | 71% confidence      │
│ Estimated: 47.1891°N, 28.9234°E            │
│ Detected by: 2 nodes | Single baseline     │
│ ┌──────────┐  ┌──────────┐                 │
│ │ TRACK    │  │  DISMISS │                 │
└─────────────────────────────────────────────┘
```

### 3.4 OpenMCT Strip (Bottom Timeline)

```
OpenMCT Bottom Panel (180px, collapsible):
┌─────────────────────────────────────────────────────────────────────┐
│ [◀ 1h] [◀ 15m] [LIVE ●] [PAUSE] [▶ 15m] [▶ 1h]    [↑ EXPAND]    │
├──────────────────────┬──────────────────┬───────────────────────────┤
│ DETECTION EVENTS     │ RF ANOMALY INDEX │ NETWORK HEALTH            │
│ ▄▄ ▄▄▄ ▄▄  ▄▄▄▄▄▄  │  ___/‾‾\___/‾\_ │ ─────────────────────── 2847│
│ Event stream bars    │  RF energy curve │ Node count over time      │
│ Color by type        │  Threshold line  │ Online/Mesh/Offline stack │
└──────────────────────┴──────────────────┴───────────────────────────┘
```

---

## 4. MOBILE APP — ANDROID (PRIMARY SENSOR)

### 4.1 Screen Flow

```
APP LAUNCH FLOW:

[Splash Screen, 1.5s]
       ↓
[Onboarding (first run only)]
  → Location permission request
  → Microphone permission request
  → Background service permission
  → Notification permission
  → "This app helps detect threats. Your audio NEVER leaves your device."
       ↓
[Node Registration Screen]
  → Generate hashed node ID (UUID v4, SHA-256 truncated to 16 chars)
  → Select deployment zone (city/district from list)
  → Optional callsign (max 12 chars, stored locally only)
  → [JOIN SENTINEL NETWORK] button
       ↓
[MAIN SCREEN — Sensor Dashboard]
```

### 4.2 Main Screen — Android

```
STATUS BAR: transparent, dark icons

┌────────────────────────────────────────┐
│  ☰  APEX SENTINEL        🔴 ALERT  [!] │  ← Top bar, 56dp
├────────────────────────────────────────┤
│                                        │
│    ┌──────────────────────────────┐    │
│    │  SENTINEL ACTIVE             │    │  ← Status card
│    │  ● Listening  ● RF Scanning  │    │
│    │  Node: SN-4821               │    │
│    │  Signal quality: ████████░░  │    │
│    │  Battery: 72%                │    │
│    └──────────────────────────────┘    │
│                                        │
│    ACOUSTIC MONITOR                    │
│    ┌──────────────────────────────┐    │
│    │ Frequency: 0─────────────── │    │  ← Real-time waveform
│    │  500Hz  ████▌                │    │
│    │  800Hz  ██▌                  │    │
│    │ 1200Hz  ▌                    │    │
│    │ 2000Hz  ▌                    │    │
│    │ Detection confidence: 12%   │    │  ← ML score
│    └──────────────────────────────┘    │
│                                        │
│    RF / EMF MONITOR                    │
│    ┌──────────────────────────────┐    │
│    │  2.4GHz  Ch1 ████████░░ 87% │    │
│    │          Ch6 ██████░░░░ 64% │    │
│    │          Ch11████░░░░░░ 45% │    │
│    │  5GHz    Ch36██░░░░░░░░ 21% │    │
│    │  Anomaly score: LOW (0.12)  │    │
│    └──────────────────────────────┘    │
│                                        │
│    MESH STATUS                         │
│    ┌──────────────────────────────┐    │
│    │  LoRa: ● Connected (3 peers)│    │
│    │  BLE:  ● 7 nearby nodes     │    │
│    │  Internet: ● Online         │    │
│    └──────────────────────────────┘    │
│                                        │
│  ┌──────────┐  ┌──────────┐           │
│  │  SENSOR  │  │   MAP    │           │  ← Bottom nav
│  └──────────┘  └──────────┘           │
└────────────────────────────────────────┘
```

### 4.3 Alert Screen — Android (High Priority)

```
FULL-SCREEN ALERT STATE:
[Triggered when confidence > 70% or CRITICAL alert from mesh]

┌────────────────────────────────────────┐
│  ◀ BACK                         14:23 │
├────────────────────────────────────────┤
│                                        │
│         ██████████████████████         │
│         ██                    ██       │
│         ██  ⚠  THREAT         ██       │
│         ██   DETECTED         ██       │
│         ██████████████████████         │
│                                        │
│   FPV DRONE                            │
│   Confidence: 94%                      │
│   Type: Acoustic + RF Fusion           │
│                                        │
│   ┌──────────────────────────────┐    │
│   │  Your node contributed to   │    │
│   │  triangulation of this      │    │
│   │  detection.                 │    │
│   │                             │    │
│   │  Distance: ~340m NE         │    │
│   │  Bearing: 047°              │    │
│   └──────────────────────────────┘    │
│                                        │
│   ┌──────────────────────────────┐    │
│   │  TAKE COVER                 │    │  ← Large red button
│   └──────────────────────────────┘    │
│                                        │
│   [Show on Map]    [Share to Mesh]    │
│                                        │
└────────────────────────────────────────┘

NOTIFICATION (when app is background):
  Title: "⚠ APEX SENTINEL — THREAT DETECTED"
  Body:  "FPV drone detected nearby. 94% confidence. Take cover."
  Action buttons: [VIEW MAP] [ACKNOWLEDGE]
  Sound: Alert tone (configurable, default HIGH priority)
  Vibration: SOS pattern (3 short 3 long 3 short)
```

### 4.4 Mini Map Screen — Android

```
┌────────────────────────────────────────┐
│  ◀ SENSOR    MAP    SETTINGS     14:23 │
├────────────────────────────────────────┤
│                                        │
│  [MapLibre GL map, full width]         │
│                                        │
│  ┌──────────────────────────────┐      │
│  │   [Map viewport]             │      │
│  │   Your location: ◉           │      │
│  │   Nearby nodes: ● ● ●        │      │
│  │   Alert zones: 🔴 pulsing    │      │
│  │                              │      │
│  │   Coverage radius: 500m ring │      │
│  │   [zoom controls]            │      │
│  └──────────────────────────────┘      │
│                                        │
│  NEARBY NODES: 7                       │
│  ACTIVE ALERTS: 1                      │
│  YOUR COVERAGE: ●● GOOD               │
│                                        │
└────────────────────────────────────────┘
```

---

## 5. MOBILE APP — iOS (ACOUSTIC + RELAY)

### 5.1 iOS Design Differences

iOS variant follows Apple HIG constraints while maintaining military dark theme:
- Uses SF Symbols for icons (instead of MDI)
- Navigation: Tab bar at bottom (iOS convention)
- Alerts: UIAlertController for system-level alerts + custom in-app overlay
- Background audio: AVAudioSession category `.record` with background mode
- Widgets: WidgetKit integration for status bar widget

### 5.2 iOS Main Screen

```
┌────────────────────────────────────────┐
│  APEX SENTINEL                  14:23 │  ← Nav bar
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ● SENTINEL ACTIVE               │  │
│  │  Acoustic monitoring: ON         │  │
│  │  Relay mode: ON (3 BLE peers)    │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ACOUSTIC                              │
│  ┌──────────────────────────────────┐  │
│  │  Level:    ────────●──── 42dB   │  │  ← SPL meter
│  │  500-2kHz: ████████░░ 79% in    │  │  ← Band energy
│  │  ML Score: ████░░░░░░ 0.23     │  │
│  │  Status: MONITORING              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  NETWORK                               │
│  ┌──────────────────────────────────┐  │
│  │  Internet    ● Online            │  │
│  │  BLE Mesh    ● 3 peers           │  │
│  │  Last sync   14:22:58Z           │  │
│  └──────────────────────────────────┘  │
│                                        │
├──────────┬──────────┬──────────────────┤
│  SENSOR  │  ALERTS  │    SETTINGS      │  ← Tab bar
└──────────┴──────────┴──────────────────┘
```

---

## 6. SETTINGS SCREEN (BOTH PLATFORMS)

```
SETTINGS SCREEN:
┌────────────────────────────────────────┐
│  ◀  SETTINGS                           │
├────────────────────────────────────────┤
│  DETECTION                             │
│  ┌──────────────────────────────────┐  │
│  │  Acoustic Detection      ● ON   │  │
│  │  RF Scanning             ● ON   │  │
│  │  Sensitivity        [MED    ▼]  │  │
│  │  Alert Threshold         70%    │  │
│  │  [0%──────────●──────────100%]  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  MESH                                  │
│  ┌──────────────────────────────────┐  │
│  │  LoRa / Meshtastic       ● ON   │  │
│  │  BLE Relay               ● ON   │  │
│  │  Google Nearby Conn.     ● ON   │  │
│  │  Max relay hops         [3  ▼]  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  PRIVACY                               │
│  ┌──────────────────────────────────┐  │
│  │  Node ID: SN-a3f2b8c1...        │  │
│  │  [Regenerate ID]                │  │
│  │  Data sharing: Detection only   │  │
│  │  Location precision: [100m ▼]   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ABOUT                                 │
│  ┌──────────────────────────────────┐  │
│  │  ML Model: v2.1.3 (480KB)       │  │
│  │  Last update: 2026-03-24        │  │
│  │  [Check for updates]            │  │
│  │  [Export diagnostic log]        │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

---

## 7. CALIBRATION FLOW

Calibration is critical for acoustic triangulation accuracy. Nodes must be time-synchronized and environment-characterized.

```
CALIBRATION WIZARD — SCREEN FLOW:

STEP 1: ENVIRONMENT CHARACTERIZATION
┌────────────────────────────────────────┐
│  CALIBRATION — Step 1 of 4            │
│                                        │
│  Measuring ambient noise floor...      │
│  ████████████████████░░░░ 78%         │
│                                        │
│  Ambient level: 34 dB SPL             │
│  Background noise type: Urban          │
│  Recommendation: Good location         │
│                                        │
│  [CANCEL]              [NEXT ▶]       │
└────────────────────────────────────────┘

STEP 2: TIME SYNC
┌────────────────────────────────────────┐
│  CALIBRATION — Step 2 of 4            │
│                                        │
│  Synchronizing time reference...      │
│                                        │
│  NTP offset: +2.3ms                   │
│  GPS time: Available (±5ms)           │
│  Network latency: 42ms                 │
│                                        │
│  ● TIME SYNC COMPLETE                 │
│                                        │
│  [◀ BACK]              [NEXT ▶]       │
└────────────────────────────────────────┘

STEP 3: ACOUSTIC REFERENCE TEST
┌────────────────────────────────────────┐
│  CALIBRATION — Step 3 of 4            │
│                                        │
│  Play reference tone on a nearby      │
│  device or wait for mesh calibration  │
│  pulse.                               │
│                                        │
│  Waiting for calibration signal...    │
│  ████░░░░░░░░░░░░░░░░░ 20%           │
│                                        │
│  [SKIP (GPS-only mode)]   [WAITING]   │
└────────────────────────────────────────┘

STEP 4: COMPLETE
┌────────────────────────────────────────┐
│  ● CALIBRATION COMPLETE               │
│                                        │
│  Ambient baseline: 34 dB              │
│  Time offset: +2.3ms                  │
│  Acoustic response: Normal            │
│  Expected accuracy: ±65m (TDoA)       │
│                                        │
│  This node will be weighted 0.92      │
│  in triangulation calculations.       │
│                                        │
│  [DONE — START MONITORING]            │
└────────────────────────────────────────┘
```

---

## 8. THREAT LEVEL INDICATOR — ALL SCREENS

The threat level indicator is a persistent element visible on all screens.

```
DEFCON-STYLE INDICATOR:
  CLEAR    : [●●●●●] all grey    — No detections
  MONITOR  : [●●●●○] blue tint  — Background detections only
  ELEVATED : [●●●○○] amber      — Medium confidence detection
  HIGH     : [●●○○○] orange     — High confidence, unconfirmed
  CRITICAL : [●○○○○] red strobe — Confirmed threat

Display location:
  - Android: Persistent status bar notification
  - iOS: Dynamic Island (iPhone 14+) or notification
  - C2: Top header bar, always visible
  - Width: 120dp × 32dp
  - Updates: Real-time from Supabase Realtime subscription
```

---

## 9. RESPONSIVE BREAKPOINTS — C2 DASHBOARD

```
Web C2 Dashboard breakpoints:

1920px+ (full C2 station):
  Left panel: 280px | Center: flex | Right panel: 320px
  Bottom timeline: 180px visible by default

1440px (laptop C2):
  Left panel: 240px | Center: flex | Right panel: 280px
  Bottom timeline: 140px, partially collapsed

1280px (tactical tablet landscape):
  Left panel: 200px | Center: flex | Right panel: collapsed to icons
  Bottom timeline: hidden (toggle button)

1024px (tablet portrait):
  Left panel: collapsed to icon bar
  Center: full width
  Panels: overlay on tap

768px (tablet portrait min):
  Simplified single-column layout
  Map: full width, ~60% height
  Alerts: scrollable list below map

Note: Below 768px, redirect to mobile app. C2 dashboard is not
designed for smartphone screens.
```

---

## 10. ACCESSIBILITY

| Requirement | Implementation |
|-------------|----------------|
| Color blindness | Never rely on color alone; use shape + text labels |
| Night vision compatibility | Optional RED-only mode (#FF0000 on black) |
| High contrast mode | +20% contrast ratio increase toggle |
| Reduced motion | Disable all pulsing/animations, preserve data display |
| Screen reader | ARIA labels on all C2 elements, Android TalkBack support |
| Large text | Scales to 200% without layout breaking |
| Offline indicator | Always visible, never hidden behind other UI |

---

## 11. DESIGN TOKENS FILE (FIGMA/CSS VARIABLES)

```css
:root {
  /* Surfaces */
  --surface-0: #0A0C10;
  --surface-1: #0F1117;
  --surface-2: #14171F;
  --surface-3: #1A1E28;
  --surface-border: #252A38;

  /* Text */
  --text-primary: #E8EAF0;
  --text-secondary: #8B92A8;
  --text-disabled: #4A5168;

  /* Threat */
  --threat-critical: #FF2D2D;
  --threat-high: #FF6B00;
  --threat-medium: #FFD700;
  --threat-low: #00B4FF;
  --threat-clear: #00E676;

  /* System */
  --status-online: #00E676;
  --status-warning: #FFD700;
  --status-error: #FF5252;
  --status-mesh: #7C4DFF;
  --status-calibrating: #40C4FF;

  /* Actions */
  --action-primary: #00B4FF;
  --action-secondary: #7C4DFF;
  --action-destructive: #FF5252;
  --action-confirm: #00E676;

  /* Track colors */
  --track-acoustic: #FF6B00;
  --track-rf: #7C4DFF;
  --track-fused: #FF2D2D;
  --track-historical: #4A5168;
  --track-friendly: #00E676;

  /* Typography */
  --font-data: 'JetBrains Mono', 'Fira Code', monospace;
  --font-ui: 'Inter', 'Roboto', system-ui;
  --font-map: 'Roboto Condensed', 'Arial Narrow', sans-serif;

  /* Spacing (8px grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 9999px;

  /* Shadows */
  --shadow-panel: 0 4px 24px rgba(0, 0, 0, 0.6);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-alert: 0 0 32px rgba(255, 45, 45, 0.3);

  /* Animation */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --pulse-critical: pulse-critical 1s ease-in-out infinite;
  --pulse-node: pulse-node 2s ease-out infinite;
}

@keyframes pulse-critical {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.02); }
}

@keyframes pulse-node {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.8); opacity: 0; }
}
```

---

## 12. VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-24 | APEX-SENTINEL Team | Initial design spec |

---

*End of DESIGN.md — APEX-SENTINEL W1*
