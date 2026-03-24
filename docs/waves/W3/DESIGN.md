# APEX-SENTINEL — DESIGN.md
## Mobile UX Specification
### Wave 3 | PROJECTAPEX Doc 01/10 | 2026-03-24 | Status: APPROVED

---

## 1. DESIGN PHILOSOPHY

APEX-SENTINEL mobile operates in hostile, low-light, high-stress conditions. The design must reduce cognitive load to zero. Every tap must have a consequence the user can predict. Every screen must be readable with one eye, at arm's length, under physical exertion.

### 1.1 Guiding Principles

**Principle 1 — Dark by necessity, not fashion.**
Military operational environments are often light-sensitive. The dark theme is not optional; it is a safety requirement. Screens must not be visible beyond arm's length in a dark room (managed via Android screen brightness APIs and iOS CADisplayLink dimming).

**Principle 2 — Information hierarchy is sacred.**
Threat status is always in the top 1/3 of the screen. Node health is always in the bottom bar. No decorative elements in the primary view area. If a user cannot identify the current threat level within 250ms of unlocking the device, the design has failed.

**Principle 3 — One-thumb operation.**
All primary actions reachable within the bottom 60% of screen (thumb zone). Critical confirmation dialogs positioned at bottom. No swipe gestures for safety-critical actions (accidental activation prevention).

**Principle 4 — Offline-first, not offline-tolerant.**
The app must function fully without internet. All UI states must have a defined offline representation. "Connecting..." is not a valid final state — it must degrade to local-only mode with clear signaling.

**Principle 5 — Accessibility is operational necessity.**
Operators may be wearing gloves. Touch targets minimum 48dp. High contrast ratios (WCAG AAA minimum). Haptic feedback for all critical events (threat detection, node offline).

---

## 2. DESIGN TOKENS

### 2.1 Color System

```
── BACKGROUNDS ──────────────────────────────────────────────────────────
bg-primary:       #0A0C0F    (main screen background, near-black with blue undertone)
bg-secondary:     #111318    (cards, modals, bottom sheets)
bg-tertiary:      #1A1D24    (elevated surfaces, selected states)
bg-overlay:       #0A0C0FCC  (modal overlays, 80% opacity)

── THREAT STATUS COLORS ─────────────────────────────────────────────────
threat-critical:  #FF1744    (>85% confidence — CRITICAL)
threat-high:      #FF6D00    (65-84% confidence — HIGH)
threat-medium:    #FFD600    (45-64% confidence — MEDIUM)
threat-low:       #00E676    (25-44% confidence — LOW)
threat-clear:     #546E7A    (0-24% — MONITORING)

── STATUS / SYSTEM ──────────────────────────────────────────────────────
status-online:    #00E676    (node connected, pipeline active)
status-degraded:  #FFD600    (node connected, reduced capability)
status-offline:   #FF1744    (node disconnected)
status-mesh:      #7C4DFF    (offline, Meshtastic relay active)

── TEXT ─────────────────────────────────────────────────────────────────
text-primary:     #E8EAED    (main body, labels)
text-secondary:   #9AA0A6    (captions, helper text)
text-disabled:    #5F6368    (inactive controls)
text-inverse:     #0A0C0F    (on light surfaces, rare)
text-threat:      #FF1744    (alert text on dark background)
text-accent:      #82B1FF    (links, interactive elements)

── BORDERS / DIVIDERS ───────────────────────────────────────────────────
border-subtle:    #2A2D35    (card borders, list dividers)
border-focus:     #4285F4    (focused input, selected card)
border-threat:    #FF1744    (threat card border pulse)

── GRADIENTS ────────────────────────────────────────────────────────────
gradient-threat:  linear(#FF174420 → #FF174400)  (threat card background wash)
gradient-header:  linear(#0A0C0F → transparent)   (navigation fade)
```

### 2.2 Typography

```
── FONT STACK ───────────────────────────────────────────────────────────
Primary:     JetBrains Mono (monospace — operational data)
Secondary:   Inter (UI labels, body text)
Fallback:    system-ui, -apple-system, monospace

── SCALE ────────────────────────────────────────────────────────────────
display-xl:  32sp / JetBrains Mono Bold    (threat level label)
display-lg:  24sp / JetBrains Mono Bold    (confidence percentage)
heading-1:   20sp / Inter SemiBold         (screen titles)
heading-2:   16sp / Inter SemiBold         (section headers)
body-lg:     16sp / Inter Regular          (detection feed items)
body-md:     14sp / Inter Regular          (card descriptions)
body-sm:     12sp / Inter Regular          (timestamps, coordinates)
caption:     11sp / Inter Regular          (node IDs, technical IDs)
mono-data:   13sp / JetBrains Mono Regular (coordinates, dB values)
```

### 2.3 Spacing System

```
4dp increments based on 8dp base grid:
sp-0:   0dp
sp-1:   4dp   (internal component padding, icon margins)
sp-2:   8dp   (small gaps between related elements)
sp-3:   12dp  (standard list item padding)
sp-4:   16dp  (standard card padding, screen edge margin)
sp-5:   20dp  (section spacing)
sp-6:   24dp  (large section gaps)
sp-8:   32dp  (major section dividers)
sp-12:  48dp  (minimum touch target size — hard minimum)
sp-16:  64dp  (FAB size, large CTAs)
```

### 2.4 Elevation System

```
elevation-0:  0dp   (flat surfaces, backgrounds)
elevation-1:  2dp   (cards at rest)
elevation-2:  4dp   (raised cards, bottom bar)
elevation-3:  8dp   (modals, bottom sheets)
elevation-4:  16dp  (full-screen overlays, alert banners)
elevation-5:  24dp  (critical alert dialogs)

Shadow color: #000000 at 40% opacity (Android)
Shadow blur:  elevation × 1.5px (iOS approximate)
```

---

## 3. SCREEN SPECIFICATIONS

### 3.1 Splash / Onboarding Flow

#### 3.1.1 Splash Screen

**Duration**: 1.2s minimum, extends to 2.5s max if initialization pending.

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│         ┌───────────┐           │
│         │  ◈ APEX   │           │
│         │ SENTINEL  │           │
│         └───────────┘           │
│                                 │
│      ████████████░░░░░          │
│      INITIALIZING PIPELINE      │
│                                 │
│   v3.0.0 | Node: UNREGISTERED   │
│                                 │
└─────────────────────────────────┘
```

**States**:
- `BOOT`: Logo fade-in (300ms ease-in), progress bar inactive
- `INIT`: Progress bar animates (indeterminate) while AcousticPipeline initializes
- `READY`: Progress bar completes, transitions to Home or Onboarding
- `ERROR`: Red progress bar, error message, retry button

**Asset**: SVG logo (no raster), supports dark/inverted. Size: 120×120dp centered.

**Background**: Pure `bg-primary` (#0A0C0F). No gradient, no animation — reduces battery drain during boot.

**Progress indicator**: `LinearProgress` component, `threat-medium` color (#FFD600) on `bg-secondary` track. Width 200dp, centered horizontally.

**Text**:
- "APEX SENTINEL" — `display-lg`, `text-primary`, letter-spacing: 8dp
- Status line — `body-sm`, `text-secondary`, monospace
- Version/Node line — `caption`, `text-disabled`

#### 3.1.2 Onboarding Screen 1 — Welcome

Triggered on first launch only (onboardingComplete = false in SecureStore).

```
┌─────────────────────────────────┐
│  ← skip                         │
│                                 │
│  ┌───────────────────────────┐  │
│  │    [ILLUSTRATION: radar   │  │
│  │     sweep animation]      │  │
│  └───────────────────────────┘  │
│                                 │
│  Your Device Is Now A           │
│  Detection Node                 │
│                                 │
│  Join a distributed network     │
│  of acoustic sensors to         │
│  protect your community.        │
│                                 │
│  ●  ○  ○  ○                     │
│                                 │
│  ┌─────────────────────────┐    │
│  │        CONTINUE         │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Navigation**: PageView with 4 pages. Swipe or CONTINUE button. Skip button top-left (dismisses to permissions page directly).

**Illustration**: Lottie animation (radar sweep, 2-second loop). Asset: `assets/animations/radar-sweep.json`. Frame rate: 30fps. Color: `status-online` (#00E676) on transparent.

**Typography**:
- Headline: 22sp Inter SemiBold, `text-primary`
- Body: 16sp Inter Regular, `text-secondary`, max 3 lines

#### 3.1.3 Onboarding Screen 2 — How It Works

```
┌─────────────────────────────────┐
│  ← skip                         │
│                                 │
│  ┌───────────────────────────┐  │
│  │  [3-node diagram: phone   │  │
│  │   → NATS cloud → TAK]     │  │
│  └───────────────────────────┘  │
│                                 │
│  Silent. Automatic.             │
│  Always Running.                │
│                                 │
│  Audio is processed on your     │
│  device — it never leaves.      │
│  Only threat scores are sent.   │
│                                 │
│  ○  ●  ○  ○                     │
│                                 │
│  ┌─────────────────────────┐    │
│  │        CONTINUE         │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Key message**: Privacy guarantee front and center. Diagram shows data flow stopping at device boundary.

#### 3.1.4 Onboarding Screen 3 — Permissions

```
┌─────────────────────────────────┐
│  ← skip                         │
│                                 │
│  We need two permissions        │
│                                 │
│  ┌───────────────────────────┐  │
│  │  🎤  Microphone           │  │
│  │  Required — audio         │  │
│  │  processed on-device      │  │
│  │  only. Never recorded.    │  │
│  │           [ALLOW]         │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │  🔔  Notifications        │  │
│  │  Required — threat        │  │
│  │  alerts when app is       │  │
│  │  in background.           │  │
│  │           [ALLOW]         │  │
│  └───────────────────────────┘  │
│                                 │
│  ○  ○  ●  ○                     │
│                                 │
│  ┌─────────────────────────┐    │
│  │   CONTINUE (both req'd) │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Permission cards**: `bg-secondary` rounded 12dp. Icon 32dp. Each card has inline [ALLOW] button that triggers system permission dialog. Card state changes to ✓ GRANTED after permission granted.

**CONTINUE button**: Disabled until both permissions granted. `text-disabled` background when disabled. Active state: `status-online` background.

#### 3.1.5 Onboarding Screen 4 — Node Registration

```
┌─────────────────────────────────┐
│  ← skip                         │
│                                 │
│  Name Your Node                 │
│                                 │
│  ┌───────────────────────────┐  │
│  │  NODE-A7F3                │  │
│  │  (auto-generated, editable│  │
│  └───────────────────────────┘  │
│                                 │
│  Zone (optional)                │
│  ┌───────────────────────────┐  │
│  │  Enter zone name...       │  │
│  └───────────────────────────┘  │
│                                 │
│  ○  ○  ○  ●                     │
│                                 │
│  ┌─────────────────────────┐    │
│  │     REGISTER NODE       │    │
│  └─────────────────────────┘    │
│                                 │
│  Node ID: 8f3a-c2d1-...         │
└─────────────────────────────────┘
```

**Node name**: Pre-populated with "NODE-" + random 4-char hex. Editable text field. Max 16 chars. Regex: `[A-Z0-9\-]`.

**REGISTER NODE**: Calls W2 `register-node` Edge Function. Shows `ActivityIndicator` during request. On success: transitions to Home. On failure: inline error card with retry.

---

### 3.2 Home Dashboard

The primary operational screen. Persistent in foreground, polling every 5 seconds when visible.

```
┌─────────────────────────────────┐
│  APEX SENTINEL          ⚙  [⊕]  │
│  NODE-A7F3 ● ACTIVE             │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐    │
│  │  THREAT STATUS          │    │
│  │  ████████████████░░░    │    │
│  │  CRITICAL — 87%         │    │
│  │  Rotary Aircraft        │    │
│  │  Bearing: 247° | 380m   │    │
│  └─────────────────────────┘    │
│                                 │
│  DETECTION FEED                 │
│  ┌─────────────────────────┐    │
│  │  ▲ Rotary / 87% / 12s   │    │
│  ├─────────────────────────┤    │
│  │  ▲ Rotary / 71% / 44s   │    │
│  ├─────────────────────────┤    │
│  │  ▷ Aircraft / 52% / 2m  │    │
│  ├─────────────────────────┤    │
│  │  ○ Ambient / 12% / 5m   │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  NETWORK: 4/6 NODES     │    │
│  │  ████████████████░░     │    │
│  └─────────────────────────┘    │
│                                 │
├─────────────────────────────────┤
│  [HOME]  [MAP]  [ALERTS]  [SET] │
└─────────────────────────────────┘
```

#### 3.2.1 Header Bar

**Height**: 56dp (Android) / SafeAreaInsets top + 44dp (iOS)
**Left**: "APEX SENTINEL" — `heading-1`, `text-primary`
**Right**: Settings icon (24dp, `text-secondary`) + FAB add node (32dp, `status-online`)
**Node status row**: "NODE-{name}" + `NodeHealthBadge` component + status text

**Status text states**:
- "● ACTIVE" — `status-online` (#00E676)
- "◐ DEGRADED" — `status-degraded` (#FFD600)
- "○ OFFLINE" — `status-offline` (#FF1744)
- "⬡ MESH ONLY" — `status-mesh` (#7C4DFF)

#### 3.2.2 Threat Status Card

**Condition**: Shown when latest detection confidence > 25%. Hidden / "MONITORING" state when no active threat.

**States**:

| State | Background | Border | Pulse Animation |
|-------|-----------|--------|-----------------|
| CRITICAL (>85%) | `#FF174410` | `#FF1744` 2dp | 1Hz pulse |
| HIGH (65-84%) | `#FF6D0010` | `#FF6D00` 2dp | 0.5Hz pulse |
| MEDIUM (45-64%) | `#FFD60010` | `#FFD600` 1dp | none |
| LOW (25-44%) | `#00E67610` | `#00E676` 1dp | none |
| MONITORING | bg-secondary | border-subtle | none |

**Pulse animation**: `Animated.loop(Animated.sequence([fadeIn 500ms, hold 500ms, fadeOut 500ms]))` on border opacity. Uses native driver.

**Content**:
- Threat level label: `display-xl`, threat color
- Classification: `heading-2`, `text-primary`
- Confidence bar: `ConfidenceBar` component, full width
- Bearing + range: `mono-data`, `text-secondary`

**Tap action**: Navigate to Alert Detail screen, passing detection ID.

#### 3.2.3 Detection Feed

**Component**: `FlatList` with `keyExtractor={item => item.id}`. `getItemLayout` for fixed height (72dp per item). `initialNumToRender={8}`.

**Feed item height**: 72dp minimum (touch target compliance).

**Feed item structure**:
```
┌─────────────────────────────────────────────────────┐
│ [ICON 32dp] [CLASSIFICATION 16sp]     [TIME AGO]    │
│             [CONFIDENCE BAR slim]     [>]            │
│             [bearing + nodeId caption]               │
└─────────────────────────────────────────────────────┘
```

**Icons**:
- Rotary aircraft: `⬡` (hexagon) — `threat-critical` or `threat-high`
- Fixed wing: `▶` (triangle) — `threat-medium`
- Unknown aircraft: `◆` — `threat-high`
- Ambient: `○` — `text-disabled`

**Swipe-to-dismiss**: Right swipe dismisses alert from local feed (does not delete from backend). Left swipe reveals "Share COT" action.

**Pull-to-refresh**: Standard React Native `RefreshControl`, `threat-medium` color spinner.

#### 3.2.4 Network Health Strip

**Height**: 56dp. Full width.

**Content**: "NETWORK: {active}/{total} NODES" + linear progress bar showing ratio.

**Bar color**:
- ≥80% nodes active: `status-online`
- 50-79%: `status-degraded`
- <50%: `status-offline`

**Tap action**: Navigate to Map view, centered on node cluster.

---

### 3.3 Alert Detail Screen

Accessed by tapping any ThreatCard or feed item.

```
┌─────────────────────────────────┐
│  ←  ALERT DETAIL        [SHARE] │
├─────────────────────────────────┤
│                                 │
│  ████████████████████████       │
│  CRITICAL                       │
│  Rotary Aircraft                │
│                                 │
│  CONFIDENCE: 87.3%              │
│  ████████████████████░░░        │
│                                 │
│  ┌─────────────────────────┐    │
│  │  LOCATION               │    │
│  │  47.3920° N, 28.8412° E │    │
│  │  Bearing: 247° True     │    │
│  │  Range: ~380m (TDoA)    │    │
│  │  Accuracy: ±45m         │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  DETECTION              │    │
│  │  Node: NODE-A7F3        │    │
│  │  Time: 14:23:07.341 UTC │    │
│  │  Duration: 4.2s         │    │
│  │  dB Level: -14.2 dBFS   │    │
│  │  Pipeline: YAMNet INT8  │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  TOP CLASSIFICATIONS    │    │
│  │  Helicopter     87.3%   │    │
│  │  ████████████████████   │    │
│  │  Fixed-wing     4.1%    │    │
│  │  ████                   │    │
│  │  Drone          2.8%    │    │
│  │  ██                     │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  CORROBORATING NODES    │    │
│  │  NODE-B2C1  TDoA ✓      │    │
│  │  NODE-F9A4  TDoA ✓      │    │
│  └─────────────────────────┘    │
│                                 │
│  [VIEW ON MAP]    [EXPORT COT]  │
└─────────────────────────────────┘
```

**Header**: Back arrow (24dp, `text-primary`), "ALERT DETAIL", Share button (exports CoT XML to system share sheet).

**Confidence bar**: Full-width `ConfidenceBar` with numerical label inline.

**Location card**: Coordinates in `mono-data` style. Range includes TDoA accuracy circle. Tapping launches Map with pin on location.

**Detection card**: Technical telemetry. All values `mono-data`.

**Top Classifications**: Horizontal bar chart for top 3 classes. Bar width proportional to score. Color: threat scale mapped to confidence.

**Corroborating Nodes**: List of other nodes that contributed to TDoA fix. "TDoA ✓" in `status-online` if corroborated, "No fix" in `text-disabled` if single-node.

**EXPORT COT**: Generates TAK-compatible CoT XML, opens system share sheet.

---

### 3.4 Map View

Mapbox GL (via `@rnmapbox/maps`) rendered map with node and alert overlays.

```
┌─────────────────────────────────┐
│  ←  MAP VIEW              [⊕]   │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │    ●NODE-A7F3             │  │
│  │                           │  │
│  │           ◈ THREAT         │  │
│  │       (accuracy circle)   │  │
│  │    ●NODE-B2C1             │  │
│  │                           │  │
│  │    ●NODE-F9A4             │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌─────────────────────────┐    │
│  │  ▲ Rotary / 87% / NODE  │    │
│  │  A7F3 → 14:23:07 UTC    │    │
│  └─────────────────────────┘    │
│                                 │
│  [SATELLITE] [TERRAIN] [TOPO]   │
└─────────────────────────────────┘
```

**Map style**: Custom dark Mapbox style (`apex-sentinel-dark`). Labels minimal. Road network subtle. Terrain on by default.

**Node markers**: Circle markers, 16dp diameter.
- Online: `status-online` fill, white border 2dp
- Offline: `status-offline` fill, white border 2dp
- Mesh only: `status-mesh` fill
- Own node: 24dp diameter + pulsing ring animation

**Threat markers**: `◈` icon, 32dp, color by threat level. Accuracy circle: semi-transparent fill matching threat color.

**Bottom sheet**: Sliding panel showing selected item detail. Collapsed: 80dp. Expanded: 40% screen height. Snap points: [80, 0.4h, 0.9h].

**Map controls**: Layer selector bottom bar. Offline tile cache (Mapbox offline regions API) for pre-downloaded operational areas.

**Clustering**: Node markers cluster at zoom < 10. Cluster bubble shows count + dominant threat color.

---

### 3.5 Settings Screen

```
┌─────────────────────────────────┐
│  ←  SETTINGS                    │
├─────────────────────────────────┤
│  NODE IDENTITY                  │
│  ┌─────────────────────────┐    │
│  │  Name: NODE-A7F3    [✎] │    │
│  │  ID: 8f3a-c2d1-...      │    │
│  │  Zone: Alpha-7      [✎] │    │
│  └─────────────────────────┘    │
│                                 │
│  DETECTION                      │
│  ┌─────────────────────────┐    │
│  │  Sensitivity    [●────] │    │
│  │  (Low → High)           │    │
│  │  Alert threshold: 65%   │    │
│  │  Inference: AUTO    [▾] │    │
│  └─────────────────────────┘    │
│                                 │
│  BATTERY                        │
│  ┌─────────────────────────┐    │
│  │  Battery saver < 20%  ✓ │    │
│  │  Passive mode interval  │    │
│  │  [5s] [10s] [30s] [60s] │    │
│  └─────────────────────────┘    │
│                                 │
│  CONNECTIVITY                   │
│  ┌─────────────────────────┐    │
│  │  NATS Server:           │    │
│  │  wss://sentinel.io:443  │    │
│  │  Status: ● CONNECTED    │    │
│  │  Meshtastic BLE     [▾] │    │
│  └─────────────────────────┘    │
│                                 │
│  PRIVACY                        │
│  ┌─────────────────────────┐    │
│  │  [WIPE ALL LOCAL DATA]  │    │
│  │  [RESET NODE IDENTITY]  │    │
│  └─────────────────────────┘    │
│                                 │
│  APP                            │
│  ┌─────────────────────────┐    │
│  │  Version: 3.0.0         │    │
│  │  Build: 20260324.1      │    │
│  │  [VIEW PRIVACY POLICY]  │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Sensitivity slider**: `Slider` component, 0.0–1.0. Maps to confidence threshold: 0.0=25%, 1.0=90%. Label shows current threshold value.

**Inference mode**: "AUTO" (device picks TFLite or CoreML), "TFLITE", "COREML" (iOS only), "DISABLED" (relay-only mode).

**WIPE ALL LOCAL DATA**: Destructive action. Shows confirmation AlertDialog: "This will permanently delete all local detection history, pending events, and calibration data. Your node identity will be preserved. This cannot be undone." Two buttons: CANCEL (left) and WIPE (right, `threat-critical` text).

**RESET NODE IDENTITY**: Most destructive. Generates new UUID v4 nodeId, clears SecureStore, triggers re-registration on next app launch.

---

### 3.6 Calibration Wizard

Accessible from Settings > Run Calibration. Also triggered automatically on first detection.

```
┌─────────────────────────────────┐
│  ←  CALIBRATION WIZARD          │
├─────────────────────────────────┤
│                                 │
│  Step 2 of 4                    │
│  ████████████░░░░░░░░           │
│                                 │
│  AMBIENT NOISE BASELINE         │
│                                 │
│  Recording ambient audio for    │
│  noise floor calibration.       │
│  Keep device still and quiet.   │
│                                 │
│  ┌─────────────────────────┐    │
│  │  ████ RECORDING ████   │    │
│  │  dB: -52.3 RMS          │    │
│  │  Duration: 00:08 / 00:30│    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  [FREQUENCY SPECTRUM]   │    │
│  │  Live FFT visualization │    │
│  └─────────────────────────┘    │
│                                 │
│              [SKIP]  [CONTINUE] │
└─────────────────────────────────┘
```

**Steps**:
1. **Pre-check**: Microphone permission confirmed, pipeline not running. Start button.
2. **Ambient baseline**: 30-second ambient recording. RMS dB display. Live FFT bars (32 bins, `status-online` color).
3. **Threshold tuning**: VAD threshold slider with live audio feed. User speaks/makes sounds to verify VAD triggers. Shows "VAD: TRIGGERED / QUIET" indicator.
4. **Confirmation**: Summary of calibration results. Ambient dB floor, recommended VAD threshold. [SAVE AND EXIT] or [RUN AGAIN].

**FFT visualization**: 32 vertical bars, equal width. Heights scaled to magnitude. Color: gradient from `threat-low` (#00E676) at low frequencies to `threat-medium` (#FFD600) at high frequencies. Animated at 10fps to reduce battery impact.

**Calibration data saved to**: `calibration_log` SQLite table + applied to `AcousticPipeline` configuration in-memory.

---

## 4. COMPONENT SPECIFICATIONS

### 4.1 ThreatCard

**Purpose**: Primary threat status display. Used on Home dashboard and in Alert feed.

**Variants**:
- `full` — full width, all fields visible (Home dashboard hero card)
- `compact` — 72dp height, feed row (Detection Feed)
- `mini` — 48dp height, recent alerts strip

**Full variant specification**:

```
Props:
  detection: Detection        // required
  onPress?: () => void        // optional tap handler
  pulseEnabled?: boolean      // default true
  showCorroboration?: boolean // default true

Detection type:
  id: string
  timestamp: number           // Unix ms
  classification: string      // "Rotary Aircraft"
  confidence: number          // 0.0–1.0
  bearingDeg?: number         // optional, degrees true
  rangeMeters?: number        // optional, TDoA estimate
  accuracyMeters?: number     // optional
  nodeId: string
  corroboratingNodes?: string[]
  lat?: number
  lon?: number
```

**Render logic**:
1. Map `confidence` → `ThreatLevel` enum: CRITICAL/HIGH/MEDIUM/LOW/MONITORING
2. Look up `threatColors[level]` for background, border, text
3. Render border with conditional pulse animation if `pulseEnabled && level >= HIGH`
4. Confidence bar rendered via `ConfidenceBar` component (see 4.3)
5. Bearing/range rendered in mono-data only if values present
6. Corroboration row rendered only if `showCorroboration && corroboratingNodes?.length > 0`

**Animation**:
```typescript
const pulseAnim = useRef(new Animated.Value(0)).current;

useEffect(() => {
  if (pulseEnabled && threatLevel >= ThreatLevel.HIGH) {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }
}, [threatLevel, pulseEnabled]);

const borderOpacity = pulseAnim.interpolate({
  inputRange: [0, 1],
  outputRange: [0.4, 1.0],
});
```

**Accessibility**:
```typescript
accessibilityRole="button"
accessibilityLabel={`${classification} threat, ${Math.round(confidence * 100)} percent confidence`}
accessibilityHint="Tap for full alert details"
accessibilityState={{ selected: false }}
```

---

### 4.2 NodeHealthBadge

**Purpose**: Compact node status indicator. Used in header, map callouts, and node lists.

**Sizes**: `sm` (16dp), `md` (24dp), `lg` (32dp)

```
Props:
  nodeId: string
  status: 'online' | 'degraded' | 'offline' | 'mesh'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean    // default false
  batteryPct?: number    // optional, shown as sub-indicator
```

**Render**:
- `sm`: colored dot only, no animation
- `md`: colored dot + optional pulsing animation if online
- `lg`: colored dot + status text label + optional battery indicator

**Status → Color mapping**:
```
online    → #00E676  (blinking animation: 2s period)
degraded  → #FFD600  (static)
offline   → #FF1744  (static)
mesh      → #7C4DFF  (static + mesh icon)
```

**Battery sub-indicator** (lg size only): Rendered below main badge if `batteryPct < 20`. Icon: `⚡` in `threat-medium` color. Tooltip on press: "Battery saver mode active".

**Accessibility**:
```typescript
accessibilityLabel={`Node ${nodeId}: ${status}`}
accessibilityRole="image"
```

---

### 4.3 ConfidenceBar

**Purpose**: Animated horizontal progress bar showing ML confidence score.

**Variants**: `full` (screen-width minus padding), `slim` (4dp height for feed rows), `labeled` (with numerical % label)

```
Props:
  value: number          // 0.0–1.0
  animated?: boolean     // default true
  height?: number        // default 8dp (full), 4dp (slim)
  showLabel?: boolean    // default false
  labelPosition?: 'left' | 'right' | 'inline'
  duration?: number      // animation duration ms, default 400
```

**Color logic**:
```typescript
function getBarColor(value: number): string {
  if (value >= 0.85) return '#FF1744'; // CRITICAL
  if (value >= 0.65) return '#FF6D00'; // HIGH
  if (value >= 0.45) return '#FFD600'; // MEDIUM
  if (value >= 0.25) return '#00E676'; // LOW
  return '#546E7A';                    // MONITORING
}
```

**Animation**: `Animated.timing` on width percentage. `useNativeDriver: false` (layout animation). `easeOut` curve. Re-triggers on value change.

**Track**: `bg-tertiary` (#1A1D24), height matches bar, border-radius: height/2 (pill shape).

**Segment markers**: Optional `markerPositions?: number[]` prop. Renders thin vertical lines at 0.25, 0.45, 0.65, 0.85 by default. Marker color: `border-subtle` (#2A2D35).

**Accessibility**:
```typescript
accessibilityRole="progressbar"
accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
accessibilityLabel={`Confidence ${Math.round(value * 100)} percent`}
```

---

### 4.4 AlertBanner

**Purpose**: Overlay banner for incoming alert notifications when app is in foreground. Appears from top, auto-dismisses after 5 seconds.

```
Props:
  detection: Detection
  onPress: () => void       // navigate to detail
  onDismiss: () => void     // manually dismiss
  autoDismissMs?: number    // default 5000
```

**Layout**:
```
┌─────────────────────────────────────┐
│ [!] CRITICAL ALERT    Rotary / 87% │
│     NODE-A7F3 | 14:23:07           │ [✕]
│     ████████████████░░░            │
└─────────────────────────────────────┘
```

**Animation**: Slide from top (-80dp to 0). Spring animation: tension 50, friction 8. Auto-dismiss: fade out over 300ms.

**Gesture**: Pan gesture downward dismisses. Upward snap returns to original position. Tap anywhere opens Alert Detail.

**Sound**: System haptic impact (medium) on appear if app in foreground. No audio (managed by system notifications otherwise).

**Stacking**: Max 3 banners visible at once. New banner pushes existing down by 84dp. Oldest auto-dismisses when 4th arrives.

**Thread safety**: Must be rendered in a React Native `Modal` with `transparent={true}` to overlay navigation. Z-index: 9999.

---

## 5. NAVIGATION ARCHITECTURE

### 5.1 Navigation Structure

```
AppNavigator (Expo Router)
├── (auth)
│   ├── splash.tsx
│   └── onboarding/
│       ├── _layout.tsx
│       ├── welcome.tsx
│       ├── how-it-works.tsx
│       ├── permissions.tsx
│       └── registration.tsx
└── (app)
    ├── _layout.tsx          (Tab Navigator)
    ├── index.tsx            (Home Dashboard)
    ├── map.tsx              (Map View)
    ├── alerts/
    │   ├── index.tsx        (Alert List)
    │   └── [id].tsx         (Alert Detail)
    └── settings/
        ├── index.tsx        (Settings)
        └── calibration.tsx  (Calibration Wizard)
```

### 5.2 Deep Link Schema

```
apex-sentinel://alert/{id}         → Alert Detail
apex-sentinel://map/{lat}/{lon}    → Map centered
apex-sentinel://node/register      → Node Registration
apex-sentinel://calibration        → Calibration Wizard
```

**Push notification tap** → opens `apex-sentinel://alert/{alertId}` via Expo Notifications `setNotificationHandler`.

### 5.3 Back Navigation

Android hardware back:
- Home: minimize app (do not quit — background service must keep running)
- Alert Detail: pop to Home
- Map: pop to Home
- Settings: pop to Home
- Calibration: show "Exit calibration?" dialog

iOS swipe-back: Standard `react-navigation` gesture, all screens except Onboarding (no back).

---

## 6. PLATFORM-SPECIFIC PATTERNS

### 6.1 Android-Specific

**Status bar**: `StatusBar` style `light-content`, background `bg-primary`. Translucent on Home.

**Navigation bar**: Android 10+ gesture navigation. Bottom safe area inset must be respected (`useSafeAreaInsets().bottom`).

**Material You**: NOT used. Design intentionally avoids Material 3 dynamic colors — operational consistency over personalization.

**Foreground service notification** (while background audio running):
```
Channel: sentinel-detection (High importance)
Notification:
  Title: "APEX SENTINEL — Active"
  Text: "Monitoring... | NODE-A7F3"
  Icon: app icon (monochrome, white)
  Actions: [PAUSE] [STOP]
  Ongoing: true (cannot be dismissed by swipe)
```

**Battery saver detection**: `PowerManager.isPowerSaveMode()` via React Native NativeModule. Subscribe to `ACTION_POWER_SAVE_MODE_CHANGED` broadcast.

### 6.2 iOS-Specific

**Dynamic Island / Notch**: Safe area insets via `react-native-safe-area-context`. Content never overlaps system UI.

**Live Activities**: Future (W4). iOS 16.1+ Live Activity API would show threat status on Dynamic Island. Not in W3 scope.

**Background App Refresh**: Must be enabled for background detection. Checked on startup, user prompted if disabled.

**Haptics**: `expo-haptics` with `ImpactFeedbackStyle.Heavy` for CRITICAL alerts, `Medium` for HIGH, `Light` for MEDIUM. No haptic for LOW or MONITORING.

**Mic indicator**: iOS shows orange dot in status bar automatically when mic active. App also shows inline `MicActiveIndicator` badge on Home header when pipeline running.

---

## 7. OFFLINE STATES

### 7.1 State Machine

```
STATES:
  FULLY_CONNECTED    → NATS connected + Supabase reachable
  NATS_ONLY          → NATS connected, Supabase unreachable
  LOCAL_ONLY         → No network, detection continues, events queued
  MESH_RELAY         → No network, Meshtastic BLE connected
  FULLY_OFFLINE      → No network, no mesh, detection continues

TRANSITIONS:
  FULLY_CONNECTED → NATS_ONLY       (Supabase timeout > 5s)
  NATS_ONLY → LOCAL_ONLY             (NATS WebSocket closed)
  LOCAL_ONLY → MESH_RELAY            (Meshtastic device discovered via BLE)
  * → FULLY_CONNECTED                (network restored, reconnect successful)
```

### 7.2 Offline UI States

**Banner**: Persistent banner below header bar when not FULLY_CONNECTED.

```
NATS_ONLY:   [◐] Supabase unreachable — local detections active
LOCAL_ONLY:  [○] No network — 12 events queued for upload
MESH_RELAY:  [⬡] Mesh relay active — routing via NODE-B2C1
```

**Detection feed**: Local detections appear normally. Remote detections (from other nodes) grayed out with timestamp showing age.

**Map**: Cached tiles used. Node positions frozen at last-known. Timestamp shows "Last updated: 4m ago".

---

## 8. ACCESSIBILITY REQUIREMENTS

### 8.1 Touch Targets

All interactive elements: minimum 48×48dp. Verified by Android Accessibility Scanner and iOS Accessibility Inspector.

Exceptions: None permitted in W3.

### 8.2 Color Contrast

| Element | Foreground | Background | Ratio | Standard |
|---------|-----------|------------|-------|----------|
| Body text | #E8EAED | #0A0C0F | 17.5:1 | AAA ✓ |
| Secondary text | #9AA0A6 | #0A0C0F | 7.2:1 | AAA ✓ |
| Threat CRITICAL | #FF1744 | #0A0C0F | 4.8:1 | AA ✓ |
| Status online | #00E676 | #0A0C0F | 8.9:1 | AAA ✓ |
| Card text | #E8EAED | #111318 | 14.1:1 | AAA ✓ |

### 8.3 Screen Reader

All screens navigable by TalkBack (Android) and VoiceOver (iOS). Focus order follows visual top-to-bottom flow. All icons have `accessibilityLabel`. All progress bars have `accessibilityValue`.

### 8.4 Reduced Motion

React Native's `AccessibilityInfo.isReduceMotionEnabled()` checked on startup. When true:
- Pulse animations disabled on ThreatCards
- AlertBanner appears instantly (no slide animation)
- FFT visualization static (last frame only)
- Map marker animations disabled

---

## 9. DESIGN SYSTEM COMPONENTS INVENTORY

| Component | File | Variants | Tests |
|-----------|------|----------|-------|
| ThreatCard | components/ThreatCard.tsx | full, compact, mini | 18 |
| NodeHealthBadge | components/NodeHealthBadge.tsx | sm, md, lg | 12 |
| ConfidenceBar | components/ConfidenceBar.tsx | full, slim, labeled | 10 |
| AlertBanner | components/AlertBanner.tsx | default | 8 |
| NodeStatusRow | components/NodeStatusRow.tsx | default | 6 |
| DetectionFeedItem | components/DetectionFeedItem.tsx | default | 8 |
| CalibrationFFT | components/CalibrationFFT.tsx | default | 4 |
| MicActiveIndicator | components/MicActiveIndicator.tsx | sm, md | 4 |
| OfflineBanner | components/OfflineBanner.tsx | default | 6 |
| ThreatLevelLabel | components/ThreatLevelLabel.tsx | default | 6 |
| MapNodeMarker | components/MapNodeMarker.tsx | own, remote | 6 |
| MapThreatMarker | components/MapThreatMarker.tsx | default | 4 |

**Total components**: 12 primary, estimated 35 sub-components
**Design token file**: `constants/theme.ts` — single source of truth for all colors, spacing, typography

---

## 10. MOTION DESIGN

### 10.1 Standard Transitions

```
Screen push/pop:  slide-horizontal, 280ms, ease-in-out
Modal present:    slide-up, 320ms, spring(tension:60, friction:10)
Modal dismiss:    slide-down, 240ms, ease-in
Tab switch:       crossfade, 150ms, ease
```

### 10.2 Micro-interactions

```
Button press:     scale(0.96) over 80ms, release over 120ms
Card tap:         opacity(0.7) over 50ms, release over 100ms
Switch toggle:    thumb slide 150ms + color transition 200ms
Slider drag:      haptic tick at each 5% increment
```

### 10.3 Data Updates

```
Feed new item:    slide-in from right, 200ms
Badge count:      scale(1.4) → scale(1.0), 200ms spring
Confidence bar:   width ease-out, 400ms
Threat color:     color crossfade, 300ms
```
