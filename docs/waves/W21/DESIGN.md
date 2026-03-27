# W21 DESIGN — Production Operator UI

## Overview

W21 is the final UI wave for APEX-SENTINEL. It replaces the apex-sentinel-demo simulation
(Ukraine-focused, fake data, simulation ticks) with a production-grade operator dashboard
wired to real W18-W20 backend engines. The result is a live situational awareness interface
deployable to Romanian airport security operations, AACR coordination centres, and 24/7
shift rooms.

This document governs all UI design decisions for W21.

---

## Design Philosophy

### Operator-First

The dashboard is not built for demos or investors. It is built for a shift operator who
has been awake for six hours, is monitoring four protected zones simultaneously, and must
make an acknowledgment decision within 45 seconds. Every design choice is evaluated from
this perspective.

Principles:
1. **No unnecessary animation** — Framer Motion is used only for state transitions that
   communicate information (alert appearing, AWNING level escalation). Decorative animation
   is banned.
2. **Information density over whitespace** — operators need maximum data per viewport.
   Generous padding is not a virtue.
3. **Action proximity** — the acknowledge button lives on the alert card. No modal chains.
4. **Colour carries meaning** — AWNING level colours (GREEN/YELLOW/ORANGE/RED) are used
   consistently and exclusively. No other use of these colours in the UI.
5. **Text is data** — all numerical values, identifiers, timestamps, and codes render in
   JetBrains Mono. Prose is kept to zero on the main dashboard.

### Clarity Under Stress

The cognitive load of an operator in a multi-threat scenario must be minimised. The UI
achieves this through:

- **Visual hierarchy**: terminal-phase alerts always appear at the top of the alert list
  regardless of insertion order. AWNING RED zones always render with the highest z-index
  on the map.
- **Colour budget**: the palette is deliberately narrow. The operator's eye should never
  have to learn which colour means what. One glance = one meaning.
- **No ambiguous icons** — every icon is accompanied by a text label. Icon-only UI fails
  under stress.
- **SLA countdown is always visible** — when a new alert arrives, the time-to-SLA countdown
  starts immediately in the alert card. It turns orange at 50% elapsed, red at 75%.

### Accessibility (WCAG 2.1 AA)

The dark-theme palette is designed to meet WCAG 2.1 AA contrast requirements:

| Foreground    | Background | Ratio  | AA Pass |
|---------------|------------|--------|---------|
| #e8f4ff text  | #0d1b2a bg | 12.8:1 | PASS    |
| #00d4ff accent| #0d1b2a bg | 8.2:1  | PASS    |
| #00e676 GREEN | #0d1b2a bg | 9.1:1  | PASS    |
| #ffee00 YELLOW| #0d1b2a bg | 14.3:1 | PASS    |
| #ff8800 ORANGE| #0d1b2a bg | 5.9:1  | PASS    |
| #ff4444 RED   | #0d1b2a bg | 5.3:1  | PASS    |

Focus indicators: all interactive elements have a 2px solid #00d4ff outline on focus.
Keyboard navigation: all tab panels, alert cards, and map controls are reachable via Tab.
Screen reader: every dynamic region (alert list, AWNING indicator) uses aria-live="polite"
or aria-live="assertive" as appropriate.

---

## Colour System

### Base Palette

```
Background primary:   #0d1b2a  (deep navy)
Background secondary: #0a1525  (darker panel)
Background tertiary:  #112136  (hover state)
Border:               rgba(0, 212, 255, 0.15)
Border focus:         #00d4ff
```

### Text Palette

```
Primary text:         #e8f4ff  (near-white, warm blue tint)
Secondary text:       #7a9ab8  (muted, for labels and metadata)
Disabled text:        #3a5268
Accent text:          #00d4ff  (cyan — values, highlights)
```

### AWNING Level Colours

These colours are reserved exclusively for AWNING level representation. They must not be
used for any other purpose in the UI.

```
AWNING GREEN:   #00e676  — normal operations, no detected threat
AWNING YELLOW:  #ffee00  — unverified contact, monitoring active
AWNING ORANGE:  #ff8800  — confirmed contact, response protocol initiated
AWNING RED:     #ff4444  — imminent threat, escalation active
```

### Status Colours

```
Online/healthy:     #00e676
Degraded/warning:   #ff8800
Offline/critical:   #ff4444
Unknown/pending:    #7a9ab8
```

---

## Typography

**Primary font: JetBrains Mono**
All numerical values, identifiers (ICAO24, alert IDs, zone IDs), timestamps, coordinates,
frequencies, scores, and counts render in JetBrains Mono. This creates an immediate visual
distinction between data and labels.

**Secondary font: system-ui / -apple-system**
Tab labels, panel headers, button text, and navigation items use system-ui. This provides
fast rendering and clean rendering on both Windows and macOS operator workstations.

**Font sizes:**
```
Data values (primary):    13px JetBrains Mono, weight 600
Data labels:              9px system-ui uppercase, tracking 0.08em
Panel headers:            11px system-ui uppercase, tracking 0.12em, #7a9ab8
Alert category:           12px JetBrains Mono, weight 700
Countdown timer:          14px JetBrains Mono, weight 700
```

---

## Layout

### Primary Layout: Three-Column

```
┌────────────────────────────────────────────────────────────┐
│  TOP BAR: system name | zone count | AWNING summary | time  │
├──────────┬─────────────────────────────────┬───────────────┤
│  LEFT    │                                 │    RIGHT      │
│  PANEL   │         MAIN CONTENT            │    PANEL      │
│  240px   │         (flex-1)                │    280px      │
│          │                                 │               │
│  Tab     │  ZoneManagementDashboard        │  LiveAlert-   │
│  nav or  │  OR IncidentDetailView          │  Workflow     │
│  alert   │  OR NetworkHealthPanel          │               │
│  summary │  OR ComplianceDashboard         │               │
│          │  OR LiveNotamOverlay            │               │
└──────────┴─────────────────────────────────┴───────────────┘
```

The right panel (LiveAlertWorkflow) is always visible. It does not collapse. Alert
acknowledgment must never require navigating away from the map.

### Tab Navigation

Four tabs rendered in the top bar:

1. **ZONE MAP** — ZoneManagementDashboard (default)
2. **INCIDENTS** — IncidentDetailView
3. **NETWORK** — NetworkHealthPanel
4. **COMPLIANCE** — ComplianceDashboard

NOTAM and weather panels are accessible as map overlays and sidebar drawers, not full-tab
replacements. This keeps the map always reachable in ≤1 click.

---

## Terminology Rules

The following terms are PROHIBITED in all UI text, labels, tooltips, and error messages:

- "Wave" (as in wave development phases) — internal development terminology, not operator vocabulary
- "FDRP" — internal reporting format name, not regulatory terminology
- "Simulation" / "Demo" / "Fake" — must not appear anywhere in the production build
- "Shahed" / "Lancet" / "Orlan" — Ukraine-conflict specific drone names; replaced by category labels
- "Terminal phase" (in context of weapon impact) — replaced by "Imminent Threat"

Mandatory replacements:

| Old term (simulation)   | New term (production)      |
|-------------------------|----------------------------|
| shahed-136              | Modified UAS               |
| lancet-3                | Modified UAS               |
| gerbera                 | Modified UAS               |
| orlan-10                | Surveillance UAS           |
| Cat-A                   | Commercial UAS             |
| Cat-B                   | Modified UAS               |
| Cat-C                   | Surveillance UAS           |
| Cat-D                   | Unknown Contact            |
| CTR                     | Airport CTR                |
| Nuclear zone            | Nuclear Exclusion          |
| Military zone           | Military Restricted        |
| Government zone         | Government Protected       |

---

## Component Design Contracts

### Alert Card

```
┌─────────────────────────────────────────────────────┐
│  [RED ●] AWNING RED           OTP-1 HENRI COANDĂ    │
│  Modified UAS    Cat-B confidence 94%    03:17 ago   │
│  SLA: 00:28 remaining  ████████████░░░░ (75%)        │
│  [ACKNOWLEDGE]                    [VIEW INCIDENT →]  │
└─────────────────────────────────────────────────────┘
```

- AWNING level colour dot: 8px filled circle, coloured by AWNING level
- Zone name: right-aligned, JetBrains Mono, bold
- Drone category: human-readable label ("Modified UAS"), not internal code
- Confidence: 2 decimal places, cyan
- SLA progress bar: fills left-to-right, changes colour at 50% (orange) and 75% (red)
- Acknowledge button: primary action, #00d4ff background, black text, full width at bottom
- SLA-breached state: entire card border pulses red (CSS animation, 1.2s cycle)

### Zone Detail Panel (map click)

```
┌─────────────────────────────────────────────────────┐
│  HENRI COANDĂ INTERNATIONAL — Airport CTR           │
│  AWNING: ██ RED  │  Active incidents: 2             │
│  ─────────────────────────────────────────          │
│  Sensor nodes: 3 active / 1 degraded                │
│  Active NOTAMs: LROP/Q/0/D/0/0 (3 total)           │
│  Last detection: 00:45 ago                          │
│  ─────────────────────────────────────────          │
│  [VIEW INCIDENTS]  [VIEW NOTAMs]  [CLOSE]           │
└─────────────────────────────────────────────────────┘
```

### Aircraft Detail Panel (map click)

```
┌─────────────────────────────────────────────────────┐
│  ICAO24: 4B1A2C   Callsign: ROT401                 │
│  Category: Commercial UAS   Threat score: 12/100    │
│  Altitude: 1,240m AMSL   Speed: 185 kt GS          │
│  Squawk: 7700   Track: 275°   Last seen: 00:03      │
│  Source: OpenSky + ADS-B Exchange                   │
│  [CLOSE]                                            │
└─────────────────────────────────────────────────────┘
```

---

## Animation Budget

Framer Motion usage is restricted to:

1. Alert card enter: `opacity 0→1, y +8→0` over 150ms ease-out
2. Alert card SLA breach border pulse: CSS keyframe animation (no JS)
3. AWNING level change: zone circle fill colour transition over 300ms
4. Tab panel switch: `opacity 0→1` over 100ms
5. Map marker appear: `scale 0.6→1` over 200ms

No continuous animations. No looping animations except the SLA breach pulse.

---

## Dark Theme Implementation

Tailwind configuration:

```js
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      'apex-bg':      '#0d1b2a',
      'apex-panel':   '#0a1525',
      'apex-hover':   '#112136',
      'apex-border':  'rgba(0,212,255,0.15)',
      'apex-text':    '#e8f4ff',
      'apex-muted':   '#7a9ab8',
      'apex-accent':  '#00d4ff',
      'awning-green':  '#00e676',
      'awning-yellow': '#ffee00',
      'awning-orange': '#ff8800',
      'awning-red':    '#ff4444',
    },
    fontFamily: {
      mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
    }
  }
}
```

---

## Responsive Scope

W21 targets operator workstation screens: 1440px minimum width, 900px minimum height.

Mobile is explicitly out of scope for W21. A future mobile-optimised view (W22 or
standalone mobile wave) would require a completely different information architecture.
The current three-column layout does not degrade gracefully below 1200px.

---

## Design Anti-Patterns (Prohibited)

The following patterns are explicitly prohibited:

1. **Loading spinners on SSE feeds** — use last-known-good data with a staleness indicator
2. **Modal confirmations for acknowledge** — one-click acknowledgment, no confirmation dialog
3. **Toast notifications** — alerts belong in the persistent alert list, not ephemeral toasts
4. **Collapsible panels** — operators must not lose situational awareness when panels collapse
5. **Auto-scrolling alert list** — new alerts prepend; the list does not auto-scroll and
   displace operator focus
6. **Colour-only status indicators** — every status indicator includes a text label

---

*Document version: W21-DESIGN-v1.0*
*Author: APEX-SENTINEL engineering*
*Status: APPROVED FOR IMPLEMENTATION*
