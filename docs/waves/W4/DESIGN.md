# APEX-SENTINEL — DESIGN.md
## C2 Dashboard UX Specification
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. DESIGN PHILOSOPHY — COMMAND & CONTROL

W4 is the C2 layer. Where W1-W3 were about sensing, W4 is about commanding. Every pixel serves a tactical decision. The design contract:

- **Zero ambiguity**: a commander must read threat state in under 2 seconds without interaction
- **Information density over aesthetics**: no whitespace for decoration, no animations that obscure data
- **Operational continuity**: dashboard must remain functional if one data stream drops; degraded state is visible, not silent
- **Single pane of glass**: all data sources (NATS alerts, Supabase Realtime tracks, node telemetry) fused into one coherent picture
- **ATAK compatibility mindset**: keyboard shortcuts, CoT export, and overlay logic follow ATAK conventions so operators trained on ATAK need zero relearning

### 1.1 User Archetypes

```
UA-02  C2 Commander
       ─────────────────────────────────────────────────────────
       Goal:     See entire battlespace, triage threats, dispatch
       Context:  Operations room, 1920×1080 monitor, 8hr shift
       Needs:    Sub-100ms track updates, never miss CRITICAL alert
       Pain:     Information overload, stale data presented as fresh

UA-05  Military Intelligence Analyst
       ─────────────────────────────────────────────────────────
       Goal:     Reconstruct threat history, identify patterns, export
       Context:  Dual monitor, post-event analysis, 4hr sessions
       Needs:    Timeline scrubbing, CoT export, track annotation
       Pain:     Losing temporal context when switching time windows

UA-03  Civil Defense Coordinator
       ─────────────────────────────────────────────────────────
       Goal:     Know if population is at risk, coordinate evacuation
       Context:  Municipal EOC, tablet possible, non-military
       Needs:    Plain-language threat summaries, no OPSEC exposure
       Pain:     Military jargon, node IDs that reveal sensor positions
```

---

## 2. COLOR SYSTEM — MILITARY DARK THEME (W4 CANONICAL)

Inherited from W1 DESIGN.md §2. Reproduced here as the definitive W4 reference. No overrides permitted without a DECISION_LOG entry.

### 2.1 Surface Palette

```
Surface-0   (deepest background)   : #0A0C10
Surface-1   (card/panel)           : #0F1117
Surface-2   (elevated panels)      : #14171F
Surface-3   (modal/overlay)        : #1A1E28
Surface-border                     : #252A38
Surface-hover                      : #1E2330
Surface-active                     : #222840
```

### 2.2 Text Hierarchy

```
Text-primary      : #E8EAF0   — primary readable text
Text-secondary    : #8B92A8   — secondary/metadata
Text-tertiary     : #5A6278   — de-emphasized data
Text-disabled     : #4A5168   — disabled states
Text-inverse      : #0A0C10   — text on light backgrounds
Text-highlight    : #FFFFFF   — maximum contrast alerts
Text-link         : #00B4FF   — interactive links
```

### 2.3 Threat Classification Colors

These are CANONICAL. Every component that renders threat state MUST use these exact values.

```
Threat Class     CSS Variable               Hex        Usage
────────────────────────────────────────────────────────────────────────
FPV Drone        --threat-fpv               #FF2D2D    Red   — highest priority
Shahed-136       --threat-shahed            #FF6B00    Orange
Fixed-Wing UAV   --threat-fixed-wing        #FF9500    Amber-orange
Helicopter       --threat-helicopter        #FFD700    Amber/gold
Multirotor       --threat-multirotor        #FF4500    Red-orange
Unknown UAV      --threat-unknown           #8B92A8    Grey
Friendly Asset   --threat-friendly          #00E676    Green
Decoy            --threat-decoy             #7C4DFF    Purple
────────────────────────────────────────────────────────────────────────

Confidence Overlays (applied as opacity on threat color):
  Confirmed  (≥0.85)  : opacity 1.0  + pulsing outline
  Probable   (0.60-0.84): opacity 0.85
  Possible   (0.40-0.59): opacity 0.65
  Tentative  (<0.40)   : opacity 0.40  + dashed outline
```

### 2.4 System Status Colors

```
Online/Active       : #00E676
Warning             : #FFD700
Error/Offline       : #FF5252
Mesh-only mode      : #7C4DFF
Calibrating         : #40C4FF
Data stale >30s     : #FF9500   — orange warning ring on track marker
Data stale >120s    : #FF5252   — red, track auto-removed from live view
```

### 2.5 Alert Severity Colors

```
CRITICAL   : #FF2D2D  background #FF2D2D20  border #FF2D2D  — red flash 2Hz
HIGH       : #FF6B00  background #FF6B0015  border #FF6B00
MEDIUM     : #FFD700  background #FFD70012  border #FFD700
LOW        : #00B4FF  background #00B4FF10  border #00B4FF
INFO       : #8B92A8  background #8B92A808  border #252A38
```

### 2.6 Typography

```
Font Stack:
  Monospace data  : "JetBrains Mono", "Fira Code", monospace
  UI labels       : "Inter", "Roboto", system-ui, sans-serif
  Map labels      : "Roboto Condensed", "Arial Narrow", sans-serif

Scale:
  display-xl  : 32px / 700  — DEFCON headlines, CRITICAL alerts
  display-lg  : 24px / 600  — threat confirmations, track IDs
  heading-md  : 18px / 600  — panel titles
  heading-sm  : 14px / 600  — section headers
  body-lg     : 16px / 400  — primary body text
  body-sm     : 13px / 400  — metadata, timestamps
  mono-lg     : 16px / 500  — coordinates, confidence scores
  mono-sm     : 12px / 400  — sensor readouts, node IDs
  label       : 11px / 600  — UPPERCASE category labels
```

---

## 3. SCREEN LAYOUT — 1920×1080 CANONICAL

### 3.1 Master Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR  [Surface-1 | h:56px | full-width]                                  │
│  ┌─────────────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────────────┐  │
│  │ ▲ APEX-SENTINEL  │ │DEFCON: 2 │ │ ● 47 NODES   │ │ 14:23:07Z  ▲ 3 TRK   │  │
│  │   C2 Dashboard   │ │ ██ RED   │ │ ◌  3 OFFLINE │ │ [!] 1 CRIT [i] 4 INFO │  │
│  └─────────────────┘ └──────────┘ └──────────────┘ └────────────────────────┘  │
├──────────────┬──────────────────────────────────────────────┬───────────────────┤
│  LEFT PANEL  │  CENTER — CESIUMJS GLOBE VIEWPORT            │  RIGHT PANEL      │
│  [w:280px]   │  [flex:1, min-w:800px]                       │  [w:340px]        │
│              │                                              │                   │
│  ┌──────────┐ │  ╔══════════════════════════════════════╗   │  ┌─────────────┐  │
│  │ THREAT   │ │  ║  CesiumJS 1.115 — 3D Globe           ║   │  │  ALERTS     │  │
│  │ SUMMARY  │ │  ║  Terrain: Cesium World Terrain        ║   │  │  FEED       │  │
│  │          │ │  ║                                      ║   │  │             │  │
│  │ ● CRIT 1 │ │  ║  [TrackMarker × N]                   ║   │  │ ▐█ CRITICAL │  │
│  │ ● HIGH 0 │ │  ║  [NodeOverlay coverage rings]         ║   │  │ TRK-A7F2   │  │
│  │ ● MED  2 │ │  ║  [AlertRing pulse on CRITICAL]        ║   │  │ FPV DRONE  │  │
│  │ ● LOW  4 │ │  ║  [TrajectoryLine EKF prediction]      ║   │  │ 14:21:33Z  │  │
│  │ ─────── │ │  ║                                      ║   │  │ [ACK][TRK] │  │
│  │ 24h: 47  │ │  ║                                      ║   │  └─────────────┘  │
│  │ FP rate  │ │  ╚══════════════════════════════════════╝   │                   │
│  │  3.2%    │ │                                              │  ┌─────────────┐  │
│  └──────────┘ │  MAP CONTROLS [bottom-left overlay]:         │  │  TRACK      │  │
│              │  [3D/2D ⇄] [+ Zoom] [- Zoom] [⊕ North]      │  │  DETAIL     │  │
│  ┌──────────┐ │  [Layers ▼] [Home ⌂] [Follow ◎]            │  │             │  │
│  │  LAYER   │ │                                              │  │  TRK-A7F2  │  │
│  │ CONTROLS │ │  PLAYBACK BAR [bottom-center, h:40px]:       │  │  FPV Drone │  │
│  │          │ │  [◀◀][◀][■ LIVE][▶][▶▶] ═══════●────       │  │  Conf: 94% │  │
│  │ ☑ Tracks │ │  14:00:00Z ────────────────── NOW           │  │  Hdg: 247° │  │
│  │ ☑ Nodes  │ │                                              │  │  Spd: ~85  │  │
│  │ ☑ Alerts │ │  MINIMAP [bottom-right, 180×135px]:          │  │  Alt: ~120m│  │
│  │ ☑ Heatmap│ │  [2D context, fixed zoom -4 from globe]      │  │            │  │
│  │ ☐ Mesh   │ │                                              │  │  [EXPORT]  │  │
│  │ ☐ RF     │ │                                              │  │  [ANNOTATE]│  │
│  └──────────┘ │                                              │  └─────────────┘  │
│              │                                              │                   │
│  ┌──────────┐ │                                              │  ┌─────────────┐  │
│  │  NODE    │ │                                              │  │  TRACK      │  │
│  │  HEALTH  │ │                                              │  │  TABLE      │  │
│  │          │ │                                              │  │  [sortable] │  │
│  │ NODE-001 │ │                                              │  │  [filtrable]│  │
│  │ ●● TIER1 │ │                                              │  │             │  │
│  │ NODE-002 │ │                                              │  │  ID │Cls│Con│  │
│  │ ●● TIER1 │ │                                              │  │ A7F2│FPV│94%│  │
│  │ NODE-047 │ │                                              │  │ B3C1│SHD│71%│  │
│  │ ◌ OFFL  │ │                                              │  │ C9D0│UNK│43%│  │
│  └──────────┘ │                                              │  └─────────────┘  │
├──────────────┴──────────────────────────────────────────────┴───────────────────┤
│  OPENMCT TIMELINE  [h:200px | full-width | collapsible]                         │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ TRK-A7F2  ────────────────────────●══════════════════════════●             │ │
│  │ TRK-B3C1  ───────────────●══════════════════●                              │ │
│  │ NODE-001  ═══════════════════════════════════════════════════════════════  │ │
│  │ NODE-047  ═══════╗╗╗╗╗╗╗╗╗╗╗╗╗╗╗╗╗═══════════════════════════════════════ │ │
│  │ ALERTS    ──────────────────────────!──────────────────────────────────── │ │
│  │           14:00   14:10   14:15   14:20   14:23 (NOW)                      │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘

Legend:
  ══ : active/online period
  ╗  : offline/error period
  ●  : detection event
  !  : CRITICAL alert event
  ──  : no data
```

### 3.2 Responsive Breakpoints

```
Min supported    : 1920×1080  — full 3-column layout
                  1440×900   — right panel collapses to 280px
                  1280×800   — left panel collapses to icon-only (48px)
                  1024×768   — single column; globe takes 60vh, panels stack below
                  768×1024   — tablet portrait; globe top, panels scroll below (read-only)

No mobile phone support in W4. Mobile = W1/W2 app only.
Dashboard is 1920×1080 first.
```

### 3.3 Header Bar Spec

```
Height         : 56px
Background     : Surface-1 (#0F1117)
Border-bottom  : 1px solid Surface-border (#252A38)

Left section   : Logo [32×32px SVG] + "APEX-SENTINEL" [heading-md] + "C2 Dashboard" [body-sm text-secondary]
Center section : DEFCON badge + node count + offline count
Right section  : UTC clock [mono-lg] + track count badge + alert summary + user menu

DEFCON Badge:
  DEFCON 1 : #FF2D2D background, "DEFCON 1 ● WHITE" text (per US system: white = maximum)
  DEFCON 2 : #FF6B00 background, "DEFCON 2 ● RED"
  DEFCON 3 : #FFD700 background, "DEFCON 3 ● YELLOW"
  DEFCON 4 : #00B4FF background, "DEFCON 4 ● GREEN"
  DEFCON 5 : #00E676 background, "DEFCON 5 ● BLUE" (normal)
  Width: auto, height: 28px, border-radius: 2px, font: label uppercase

Clock: JetBrains Mono 16px, updates every second, UTC always
```

---

## 4. COMPONENT SPECIFICATIONS

### 4.1 TrackMarker (CesiumJS Billboard Entity)

The central display primitive. Each active track gets one TrackMarker on the 3D globe.

```
Structure:
  Entity type       : Billboard + Label + Polyline (trail)
  Coordinate system : ECEF (Cartesian3) — never WGS84 lat/lon in renderer

Visual spec:
  Billboard image   : Custom SVG per threat class (see §4.1.1)
  Billboard scale   : 1.0 at base; 1.3 when selected; 0.7 for aged tracks
  Billboard color   : Per threat class color (§2.3) modulated by confidence opacity
  Billboard pixelOffset : (0, -20) — centers icon above coordinate
  Billboard eyeOffset   : Cartesian3(0, 0, -100) — float above terrain
  Billboard horizontalOrigin : CENTER
  Billboard verticalOrigin   : BOTTOM

Label spec:
  text     : `${trackId}\n${threatClass} ${confidence}%`
  font     : "12px JetBrains Mono"
  fillColor: Color derived from threat class
  outlineColor: BLACK, outlineWidth: 2
  style    : LabelStyle.FILL_AND_OUTLINE
  pixelOffset: (0, 10) — below billboard
  showBackground: true
  backgroundColor: rgba(10, 12, 16, 0.85)

Trail polyline:
  positions     : last 30 position updates (rolling buffer)
  material      : PolylineDashMaterialProperty, dashLength: 8
  width         : 1.5
  color         : threat class color at 0.4 opacity

Confidence pulsing:
  Confirmed (≥0.85) : CSS @keyframes pulse 0.8s infinite, scale 1.0→1.15→1.0
  All others        : No pulse
```

#### 4.1.1 Threat Class SVG Icons

```
FPV Drone (quad):
  Viewbox: 0 0 32 32
  Shape: 4-arm X-frame with props at each arm tip
  Color: #FF2D2D
  Size on billboard: 32×32px

Shahed-136 (delta-wing):
  Shape: delta wing silhouette, narrow fuselage
  Color: #FF6B00
  Size: 32×32px

Helicopter:
  Shape: side profile, rotor disc above
  Color: #FFD700
  Size: 32×32px

Unknown UAV:
  Shape: question mark inside circle
  Color: #8B92A8
  Size: 28×28px

Friendly Asset:
  Shape: filled circle with "F"
  Color: #00E676
  Size: 24×24px
```

#### 4.1.2 Selection Behavior

```
Click single track   : select → right panel shows TrackDetail
Click empty globe    : deselect all
Hover track          : tooltip with {trackId, class, confidence, last seen}
Double-click track   : zoom globe to track + open TrackDetail
Right-click track    : context menu [Acknowledge Alert | Export CoT | Annotate | Follow]
```

### 4.2 AlertBanner (CRITICAL flash component)

```
Trigger     : incoming NATS message on sentinel.alerts.> with severity=CRITICAL
Position    : fixed, top: 56px (below header), full-width, z-index: 1000
Height      : 48px (collapsed) or 120px (expanded on click)

Animation:
  Background: #FF2D2D → transparent 2Hz flash, 3 cycles then stays solid
  Border-bottom: 3px solid #FF2D2D
  Transition: flash controlled by CSS animation 'criticalAlert' keyframe

Content (collapsed):
  [▐ CRITICAL] [TRK-A7F2] [FPV DRONE] [50.234°N 30.512°E] [14:21:33Z] [ACK] [→ TRACK]
  Icons: ⚠ (red) on left, × dismiss on right

Content (expanded):
  Full CoT preview: type, uid, callsign, coordinates, confidence, detection gates
  Actions: [ACKNOWLEDGE] [EXPORT COT] [ANNOTATE] [RELAY TO FREETAKSERVER]

Auto-dismiss: Never — CRITICAL alerts stay until manually acknowledged
Multiple CRITICALs: Stack as list inside banner, max 5 visible, "+N more" overflow
```

### 4.3 NodeOverlay (coverage radius circles)

```
Rendered as: CesiumJS EllipseEntity per sensor node
Data source: Supabase node_health_log + node registry

Visual spec:
  Circle type      : Cesium EllipseGeometry, filled + outlined
  Fill color       : tier-based (§4.3.1) at 0.15 opacity
  Outline          : same color at 0.8 opacity, width 1.5px
  Semi-major axis  : node.coverage_radius_m (from DB)
  Semi-minor axis  : same (circular coverage approximation)
  Height           : 10m above terrain (not draped, to avoid z-fighting)

Tier coloring:
  TIER-1 (acoustic + RF + optical)  : #00E676 — green
  TIER-2 (acoustic + RF)            : #00B4FF — cyan
  TIER-3 (acoustic only)            : #FFD700 — amber
  TIER-4 (degraded/mesh only)       : #7C4DFF — purple
  OFFLINE                           : #FF5252 — red, dashed outline

Node center icon:
  Billboard: antenna SVG, 20×20px
  Color: matches tier color
  Label: node ID [mono-sm] shown only at zoom ≥ 14

Coverage overlap highlight:
  When 2+ nodes cover same point: brighter fill color (#FFFFFF at 0.05)
  This visually confirms multi-node redundancy
```

### 4.4 ThreatStatsPanel

```
Position  : LEFT panel, below THREAT SUMMARY, above NODE HEALTH
Width     : 280px - 16px padding
Height    : auto, ~200px

Sections:
  ┌──────────────────────────────────────┐
  │  THREAT STATISTICS                   │
  │  ─────────────────────────────────── │
  │  Detections / hr  ████████░ 12.4     │
  │  False positive % ██░░░░░░░  3.2%    │
  │  CRITICAL today   ████████░ 8        │
  │  Mean confidence  ██████░░░ 71.3%    │
  │  Active tracks    ████░░░░░ 3        │
  │  Node uptime      ████████░ 94.7%    │
  │  Alert ACK rate   ██████░░░ 83.3%    │
  │  ─────────────────────────────────── │
  │  Last 24h trend: ▲ 23% detections   │
  └──────────────────────────────────────┘

Bar chart: CSS flexbox bars, no canvas, color from §2.3
Values: right-aligned mono-sm
Refresh: every 60 seconds (not real-time to avoid constant re-render)
Data source: Edge Function get-threat-stats (computed from Supabase views)
```

### 4.5 TrackTable (right panel, lower section)

```
Container  : right panel, scrollable, min-height: 200px, max-height: 400px
Header     : "ACTIVE TRACKS" [heading-sm] + track count badge + filter icon

Columns:
  ID          : 70px  — TRK-XXXX [mono-sm, cyan]
  CLASS       : 80px  — threat class [label uppercase, threat color]
  CONF        : 60px  — confidence % [mono-sm, color by confidence level]
  LAST SEEN   : 70px  — relative time "14s ago" [body-sm, text-secondary]
  NODE        : 70px  — detecting node ID [mono-sm]
  ACTIONS     : 40px  — [●] details icon

Sort: click column header; default sort = confidence DESC
Filter: dropdown above table — "All Classes" | "FPV Only" | "High Conf (>70%)"
        text filter: type to filter by track ID or node
Row click: select track, update TrackDetail panel, globe flies to track
Row colors: background tinted by threat class color at 0.08 opacity
Selected row: Surface-active (#222840) background + left border 2px threat color
Stale tracks (>120s): opacity 0.5 + "[STALE]" tag in class column

Keyboard in table:
  ↑↓ arrow  : navigate rows
  Enter     : open TrackDetail
  Delete    : not applicable (tracks are data, not user-created)
  /         : focus filter input
```

### 4.6 AlertDetailPanel (right panel, upper section)

```
Shows: selected alert full detail or most recent unacknowledged CRITICAL
Height: ~240px fixed, scrollable content

Sections:
  1. Alert header:
     [SEVERITY badge] [Alert ID] [Track ID cross-link] [Timestamp]

  2. Detection metadata:
     ┌─────────────────────────────────────┐
     │ Track ID     : TRK-A7F2             │
     │ Class        : FPV Drone            │
     │ Confidence   : 94.3%               │
     │ Coordinates  : 50.2341°N 30.5124°E │
     │ Altitude     : ~120m AGL           │
     │ Heading      : 247° (WSW)          │
     │ Speed        : ~85 km/h est.       │
     │ Detection    : ACOUSTIC + RF (G1+G2)│
     │ Node         : NODE-007 (TIER-1)   │
     │ First seen   : 14:21:33Z           │
     │ Last updated : 14:23:01Z           │
     └─────────────────────────────────────┘

  3. CoT XML Preview (collapsed by default, expand button):
     <event> XML snippet, monospace, line-numbered, syntax highlighted
     Max 20 lines shown; "View full CoT" expands modal

  4. Actions row:
     [ACKNOWLEDGE] [EXPORT COT] [RELAY TAK] [ANNOTATE]
     Acknowledge: marks alert acknowledged in DB, removes from banner
     Export CoT: downloads single .cot file
     Relay TAK: POST to FreeTAKServer relay endpoint
     Annotate: opens inline text annotation saved to operator_notes

  5. Acknowledgement history:
     "Acknowledged by operator@unit.mil at 14:22:05Z" — if already acked
```

### 4.7 NodeHealthList (left panel, lower section)

```
Scrollable list, max 15 nodes visible before scroll
Item height: 36px

Item layout:
  [●] [NODE-ID] [TIER badge] [last heartbeat] [bat%]
  ●   : status dot — green/amber/red/purple per §2.4
  ID  : mono-sm, truncated if >8 chars
  TIER: 1-4 label badge, 2px colored left border
  Time: "5s ago" relative, turns amber >10s, red >30s
  Bat : battery icon + %, shown only for mobile nodes

Click node item:
  → globe flies to node position
  → NodeOverlay for that node highlights (brighter ring)
  → shows node detail tooltip with: firmware version, uptime, coverage radius,
    last calibration time, detection count (24h)

Top of list: "NODE HEALTH" [heading-sm] + "47 online · 3 offline"
Filter: "All" | "Online" | "Offline" | "TIER-1" | "TIER-2+"
```

---

## 5. OPENMCT TIMELINE INTEGRATION

### 5.1 Layout

```
Position: bottom of page, full width, collapsible (chevron toggle)
Default height: 200px
Expanded height: 320px
Background: Surface-1 (#0F1117)
Border-top: 1px solid Surface-border

Toolbar row [h:36px]:
  [◀◀ -1hr] [◀ -15min] [■ LIVE] [▶ +15min] [▶▶ +1hr]
  [Time range: last 1hr ▼] [Zoom: ─────●────] [Export CSV]
  Live mode indicator: green ● pulsing "LIVE" when at present time
  Historical mode: orange ● "HISTORICAL" when scrubbing past data

Timeline rows (one per data source):
  Row height: 28px
  Row label : 120px left, mono-sm, right-aligned
  Timeline  : remaining width, time-axis aligned
```

### 5.2 OpenMCT Plugin Definition

```typescript
// src/lib/openmct/ApexSentinelPlugin.ts

export const ApexSentinelPlugin = () => (openmct: OpenMCT) => {
  // Domain objects
  openmct.objects.addRoot({
    namespace: 'apex-sentinel',
    key: 'root'
  });

  // Telemetry types registered:
  // 1. apex-sentinel.track      — track position + confidence over time
  // 2. apex-sentinel.node       — node health (uptime, battery, last_seen)
  // 3. apex-sentinel.alert      — alert events (severity, class, coordinates)
  // 4. apex-sentinel.detection  — raw detection events from all gates

  // Time conductor domain: UTC milliseconds
  // Real-time mode: subscription to Supabase Realtime
  // Historical mode: call get-track-history Edge Function
};
```

### 5.3 Timeline Row Types

```
Track rows:
  Height segment bar: filled bar from first_seen to last_seen
  Color: threat class color from §2.3
  Event markers: ● at each position update, tooltip shows confidence
  Width: 2px nominal, thicker if confidence > 0.85

Node rows:
  Uptime bar: ══ green, gaps are offline periods (╗ red)
  Battery sparkline (for mobile nodes): thin line below uptime bar

Alert event row:
  Single row "ALERTS", event markers only (no bars)
  ! icon at each alert event, colored by severity
  CRITICAL alerts: 8×8px red diamond ◆

Detection density row:
  Histogram: 5-minute bins, bar height = detection count
  Color: gradient from #00B4FF (low) to #FF2D2D (high)
```

---

## 6. KEYBOARD SHORTCUTS — ATAK-INSPIRED

Full keyboard map. All shortcuts active when focus is on globe (not in input).

```
────────────────────────────────────────────────────────────
Key         Action
────────────────────────────────────────────────────────────
T           Switch to TRACKS view (right panel shows TrackTable)
N           Switch to NODES view (right panel shows NodeHealthList)
A           Switch to ALERTS view (right panel shows AlertFeed)
S           Switch to STATS view (right panel shows ThreatStatsPanel)
ESC         Clear selection + close any open panel/modal

1–5         Set DEFCON level (admin only; prompts confirmation)
F           Follow selected track (globe camera locks to track)
H           Return to home position (configured AOI center)
Z           Zoom to show all active tracks (fit bounds)
G           Toggle 3D globe / 2D flat map
L           Toggle layer panel (left sidebar collapse/expand)
P           Toggle OpenMCT timeline panel (bottom collapse/expand)
/           Focus track filter input
?           Show keyboard shortcut reference modal

Ctrl+E      Export CoT for selected track
Ctrl+A      Acknowledge selected alert
Ctrl+Shift+E  Batch export CoT for all active tracks
Ctrl+Z      Undo last annotation (within 60s)

Arrow keys  Pan globe (when not in input focus)
+           Zoom in
-           Zoom out
[ ]         Scrub timeline -/+ 15 minutes
{ }         Scrub timeline -/+ 1 hour
Space       Toggle timeline LIVE / pause
────────────────────────────────────────────────────────────
```

Shortcut registry: implemented as a global `keydown` listener in `useKeyboardShortcuts()` hook. Disabled when: modal is open, input has focus, `contentEditable` has focus.

---

## 7. MODAL DESIGNS

### 7.1 CoT XML Modal

```
Trigger: "View full CoT" in AlertDetailPanel
Width: 680px, max-height: 80vh, centered
Header: "CoT XML — TRK-A7F2" + close ×

Body:
  <pre> block with syntax highlighting (XML)
  Line numbers on left
  Monospace, font-size: 13px
  Background: #0A0C10
  Copy-all button top-right
  Download button: "Download .cot"

Syntax highlight tokens:
  Tag names     : #00B4FF
  Attribute keys: #7C4DFF
  Values        : #00E676
  Comments      : #4A5168
```

### 7.2 Keyboard Shortcut Reference Modal

```
Trigger: ? key or ? button in header
Width: 520px, scrollable
Organized by section: Navigation | Alerts | Export | Timeline

Layout per shortcut:
  [Key Badge] [Description]
  Key badge: Surface-2 background, 1px border, mono-sm, min-width: 80px
```

### 7.3 Annotation Modal

```
Trigger: ANNOTATE button in AlertDetailPanel or TrackDetail
Width: 480px
Content:
  Track ID / Alert ID shown (read-only)
  Textarea: 5 rows, placeholder "Operational note..."
  Classification selector: [UNCLASSIFIED | CONFIDENTIAL | SECRET]
  Author: pre-filled from auth session (not editable)
  [SAVE] [CANCEL]
```

---

## 8. PANEL STATES

### 8.1 Empty States

```
TrackTable (no active tracks):
  ┌──────────────────────────────────┐
  │  NO ACTIVE TRACKS                │
  │  All clear — no threats detected │
  │  Last checked: 14:23:07Z         │
  └──────────────────────────────────┘
  Color: #00E676 icon, text-secondary

AlertFeed (no alerts):
  ┌──────────────────────────────────┐
  │  NO ACTIVE ALERTS                │
  │  Monitoring 47 nodes             │
  └──────────────────────────────────┘

NodeHealthList (all nodes offline):
  ┌──────────────────────────────────┐
  │  ⚠ ALL NODES OFFLINE             │
  │  Check NATS backbone + power     │
  └──────────────────────────────────┘
  Color: #FF5252, amber warning
```

### 8.2 Loading States

```
Globe loading:
  Cesium terrain tiles loading: visible as grey untextured terrain
  No spinner overlay (Cesium renders incrementally)
  Header shows "LOADING TERRAIN..." in text-secondary until ready

Track data loading:
  TrackTable: skeleton rows (3 rows, animated shimmer)
  Shimmer color: Surface-1 → Surface-2 → Surface-1 2s cycle

Connection states (shown in header):
  Supabase Realtime connected  : ● green "REALTIME"
  Supabase Realtime reconnecting: ● amber "RECONNECTING..."
  NATS.ws connected            : ● green "NATS"
  NATS.ws disconnected         : ● red "NATS OFFLINE"
```

### 8.3 Error States

```
Supabase connection lost:
  Header badge: "● REALTIME OFFLINE" [#FF5252]
  TrackTable: shows last known data with "[DATA MAY BE STALE]" warning banner
  Globe track markers: orange staleness ring after 30s, red after 120s

NATS.ws connection lost:
  Header badge: "● NATS OFFLINE" [#FF5252]
  AlertFeed: "ALERT STREAM DISCONNECTED — reconnecting..." [amber banner]

Authentication error:
  Full-page auth modal (not page redirect) — operator does not lose context
  Session expiry: 8-hour soft timeout, prompt to re-authenticate in place
```

---

## 9. MAPBOX GL FALLBACK (2D MODE)

### 9.1 Activation

```
Trigger: user presses G key OR Cesium fails to load (WebGL unavailable)
Style: custom Mapbox style "apex-sentinel-military-dark"
Base style: Mapbox dark-v11 with overrides

Color overrides:
  Background: #0A0C10
  Water: #0D1620
  Land: #0F1117
  Roads: #1A1E28
  Labels: #8B92A8
```

### 9.2 2D Track Rendering

```
Layer type: Mapbox GL symbol layer (for icons) + line layer (for trails)
Track markers: same SVG icons as CesiumJS but rendered as Mapbox symbol
Trail: line-layer, dashed, same color scheme
Interaction: same click/hover behavior as CesiumJS mode
```

---

## 10. DARK MODE ENFORCEMENT

Dark mode is NOT an option. It is the only mode.

```
Implementation:
  <html class="dark"> set at root, never removed
  Tailwind: darkMode: 'class' but 'dark' class always present
  No light mode CSS written anywhere
  No ThemeProvider toggle
  System preference ignored (operators in bright rooms still get dark mode)

Rationale:
  - Ops rooms use dark environments to preserve night vision
  - Bright white screens cause eye fatigue during 8hr shifts
  - Inadvertent light mode flash in ops room is a safety concern
  - Military standard: dark displays in operational contexts
```

---

## 11. ACCESSIBILITY (OPERATIONAL ACCESSIBILITY)

```
Focus visible  : all interactive elements have 2px #00B4FF outline on focus
                 (not removed — operators using keyboard navigation in darkness)
Skip links     : "Skip to globe" / "Skip to alerts" at page top
ARIA labels    : all icon-only buttons have aria-label
Alert banner   : role="alert" aria-live="assertive" for CRITICAL
                 role="status" aria-live="polite" for others
Color not sole indicator: threat severity also shown via text label + icon
Contrast:
  Text-primary on Surface-1: 12.4:1 (WCAG AAA)
  Text-secondary on Surface-1: 4.8:1 (WCAG AA)
  CRITICAL red on Surface-1: 5.1:1 (WCAG AA)
Reduced motion: @media (prefers-reduced-motion) kills all animations
                except CRITICAL alert flash (safety-critical, kept)
```

---

## 12. COMPONENT FILE MAP

```
src/
├── app/
│   ├── layout.tsx                    — root layout, dark class enforced
│   ├── page.tsx                      — dashboard SSR entry
│   └── (auth)/login/page.tsx         — auth page
├── components/
│   ├── globe/
│   │   ├── CesiumGlobe.tsx           — dynamic import, no SSR
│   │   ├── TrackMarker.tsx           — CesiumJS entity manager
│   │   ├── NodeOverlay.tsx           — coverage circle renderer
│   │   ├── AlertRing.tsx             — pulsing alert ring on globe
│   │   └── TrajectoryLine.tsx        — EKF prediction polyline
│   ├── panels/
│   │   ├── LeftPanel.tsx             — sidebar wrapper
│   │   ├── RightPanel.tsx            — detail panel wrapper
│   │   ├── ThreatSummary.tsx         — FR-W4-09 stats summary
│   │   ├── ThreatStatsPanel.tsx      — FR-W4-09 bar charts
│   │   ├── NodeHealthList.tsx        — FR-W4-06 node list
│   │   ├── LayerControls.tsx         — globe layer toggles
│   │   ├── AlertFeed.tsx             — FR-W4-03 alert list
│   │   ├── AlertDetailPanel.tsx      — FR-W4-07 detail + CoT
│   │   ├── TrackTable.tsx            — FR-W4-04 sortable table
│   │   └── TrackDetail.tsx           — single track detail view
│   ├── timeline/
│   │   ├── OpenMCTTimeline.tsx       — FR-W4-05 OpenMCT mount
│   │   └── PlaybackControls.tsx      — timeline toolbar
│   ├── ui/
│   │   ├── AlertBanner.tsx           — FR-W4-03 CRITICAL flash
│   │   ├── DefconBadge.tsx           — DEFCON level badge
│   │   ├── ThreatBadge.tsx           — threat class colored badge
│   │   ├── ConfidenceMeter.tsx       — confidence bar visual
│   │   ├── NodeStatusDot.tsx         — ● colored status indicator
│   │   ├── KeyboardShortcutModal.tsx — ? shortcut reference
│   │   ├── CotXmlModal.tsx           — CoT XML preview
│   │   └── AnnotationModal.tsx       — operator notes
│   └── header/
│       ├── DashboardHeader.tsx       — top bar
│       └── ConnectionStatus.tsx      — realtime/nats status badges
├── lib/
│   ├── cesium/
│   │   ├── trackEntityManager.ts     — entity CRUD for tracks
│   │   ├── nodeEntityManager.ts      — entity CRUD for nodes
│   │   └── cesiumColors.ts           — color constants for Cesium
│   ├── openmct/
│   │   ├── ApexSentinelPlugin.ts     — OpenMCT plugin
│   │   └── telemetryProviders.ts     — realtime + historical
│   ├── nats/
│   │   ├── NatsWsClient.ts           — NATS.ws connection (reuse W2/W3)
│   │   └── alertSubscriber.ts        — sentinel.alerts.> consumer
│   ├── supabase/
│   │   ├── realtimeClient.ts         — Realtime subscription setup
│   │   └── trackSubscriber.ts        — tracks channel consumer
│   └── cot/
│       ├── cotExporter.ts            — CoT XML builder
│       └── cotRelay.ts               — FreeTAKServer relay
└── stores/
    ├── trackStore.ts                 — Zustand: active tracks
    ├── alertStore.ts                 — Zustand: alert queue
    ├── nodeStore.ts                  — Zustand: node registry
    └── uiStore.ts                    — Zustand: panel/modal state
```

---

*DESIGN.md — APEX-SENTINEL W4 — approved 2026-03-24*
