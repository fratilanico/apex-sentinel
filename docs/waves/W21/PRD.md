# W21 PRD — Production Operator UI

## Product Context

APEX-SENTINEL detects, classifies, and tracks unauthorised drone activity over protected
airspace in Romania. Waves W1-W20 built the full backend stack: acoustic sensors, RF
fingerprinting, AI classification, threat fusion, AWNING level computation, alert
lifecycle management, and SLA compliance tracking.

W21 is the operator-facing surface. It makes the W18-W20 intelligence actionable by
real security personnel in real operations centres.

---

## Operator Personas

### Persona 1: Airport Security Shift Operator (PRIMARY)

**Name:** Ion Popescu (representative)
**Role:** Security officer, Henri Coandă International (LROP) or Mihail Kogălniceanu (LRCK)
**Shift:** 8-hour rotating shifts, 24/7 coverage
**Technical level:** Moderate. Comfortable with security software. Not a developer.
**Primary concern:** Did I miss a threat? Did I acknowledge on time? Can I prove what I did?

**Workflows:**
1. Starts shift — opens dashboard, reviews active incidents from previous shift
2. New alert arrives — reads card, checks zone, decides: acknowledge or escalate
3. SLA countdown visible — acknowledges within window, moves to next alert
4. End of shift — prints/exports shift summary for handover

**Pain points with current simulation:**
- Drone names are weapon system names (Shahed, Lancet) — not appropriate for civilian ops
- Map is centred on Ukraine
- No real aircraft data — can't distinguish real traffic from threats
- FDRP report format is unreadable

**Success in W21:**
- All alerts acknowledged within SLA, zero breaches per shift
- Confidence in zone coverage visible at a glance
- Incident history accessible for post-event review

---

### Persona 2: AACR Coordination Officer (SECONDARY)

**Name:** Major Mihai Ionescu (representative)
**Organisation:** AACR (Romanian Civil Aeronautical Authority)
**Role:** Coordinates airspace enforcement response when drone threat is confirmed
**Shift:** Business hours primary, on-call outside
**Technical level:** High. Familiar with NOTAM systems, ATC procedures, EASA frameworks.

**Workflows:**
1. Receives AWNING RED notification (W13 Telegram integration)
2. Opens dashboard to view full threat picture
3. Checks aircraft in vicinity — which are real commercial flights vs threat
4. Reviews NOTAMs active for affected zone
5. Makes enforcement decision: scramble, issue alert, contact airport

**Pain points:**
- Needs to see real NOTAM data, not simulated
- Needs ICAO24 identifiers on aircraft to correlate with ATC data
- Needs audit trail for any enforcement action

**Success in W21:**
- Real NOTAM overlay immediately visible on map
- Real aircraft data alongside threat tracks
- GDPR compliance status visible (no liability exposure)

---

### Persona 3: Operations Manager (TERTIARY)

**Name:** Director Elena Marin (representative)
**Role:** Manages security operations for Romanian airport group
**Access:** Dashboard-level read, no alert acknowledgment
**Primary concern:** SLA compliance metrics, system health, regulatory readiness

**Workflows:**
1. Weekly compliance review — GDPR data retention status
2. System health report — are all sensor nodes online?
3. SLA performance — what was average acknowledgment time this week?

**Success in W21:**
- Compliance dashboard exportable
- Network health panel shows per-node status
- SLA metrics visible without needing to read raw logs

---

## User Journeys

### Journey 1: New Alert — Acknowledge Within SLA

```
TRIGGER: W20 AlertAcknowledgmentEngine emits alert_new event
  ↓
SSE stream (GET /api/stream) pushes event to browser
  ↓
React state update: alert prepended to alert list
  ↓
Alert card renders: zone name, category, AWNING level, SLA countdown starts
  ↓
Operator reads card: 15 seconds
  ↓
Operator clicks [ACKNOWLEDGE]
  ↓
POST /api/alerts/{id}/acknowledge called
  ↓
W20 AlertAcknowledgmentEngine updates state: NEW → ACKNOWLEDGED
  ↓
Alert card updates: SLA countdown replaced with "ACKNOWLEDGED 00:15 ago"
  ↓
Alert moves to bottom of list (priority sort: NEW first)
  ↓
SLA compliance tracker records: acknowledged in 15s, SLA=45s, PASS

TOTAL TIME: <30 seconds from detection to acknowledgment
```

### Journey 2: SLA Breach — Escalation

```
TRIGGER: Alert has been NEW for 45 seconds (AWNING RED zone SLA)
  ↓
W20 SlaComplianceTracker emits sla_breach
  ↓
W20 EscalationMatrix triggers automatic escalation:
  - W13 Telegram sends ESCALATION_ALERT to duty officer
  - Alert status: NEW → ESCALATED
  ↓
SSE push: alert card receives 'escalated' property = true
  ↓
Alert card border becomes red pulsing animation
  ↓
Alert card header: "ESCALATED — SLA BREACHED" in red
  ↓
Duty officer is notified; operator acknowledges with escalation context
  ↓
Incident created by W20 IncidentManager (if not already open)

OUTCOME: Every breach is visible, logged, and triggers notification
```

### Journey 3: Multi-Zone Threat — Incident View

```
TRIGGER: 3 alerts from 2 zones within 8 minutes (W20 IncidentManager groups them)
  ↓
SSE push: incident_opened event
  ↓
Incidents tab badge updates: "+1"
  ↓
Operator clicks INCIDENTS tab
  ↓
IncidentDetailView shows: grouped incident, 3 alerts, 2 zones, peak AWNING RED
  ↓
Operator clicks incident card → full detail panel
  ↓
Timeline: alert 1 at 14:32:11, alert 2 at 14:33:44, alert 3 at 14:37:02
  ↓
Aircraft in zone at time: 2 commercial aircraft (ICAO24 visible)
  ↓
Actions taken: 2 acknowledged, 1 escalated
  ↓
Escalation chain: Shift Supervisor (notified 14:35:10)
  ↓
Operator clicks [EXPORT PDF] → incident report generated
  ↓
PDF includes: timeline, operator actions, SLA compliance, AWNING history
```

### Journey 4: NOTAM Check Before Shift

```
TRIGGER: Operator starts shift, wants to know active airspace restrictions
  ↓
Map loads: NOTAM overlay visible as hatched polygons
  ↓
Operator clicks NOTAM layer toggle (top-right map controls)
  ↓
LiveNotamOverlay panel slides in from right
  ↓
List of active NOTAMs for LRBB FIR: 8 active
  ↓
Operator filters: type = "drone-specific"
  ↓
2 drone NOTAMs active: LROP restricted area 14:00-18:00, LRCK military exercise
  ↓
Operator clicks [HIGHLIGHT ON MAP] for LRCK NOTAM
  ↓
Map zooms to LRCK, hatched polygon highlights with animated border
  ↓
Operator closes NOTAM panel — map remains at LRCK
```

---

## Success Metrics

### Primary Metrics (W21 completion gate)

| Metric | Target | Source |
|--------|--------|--------|
| Alert-to-acknowledge P95 | < 45 seconds | W20 SlaComplianceTracker |
| Dashboard load time | < 2.5 seconds (Vercel cold start) | Vercel analytics |
| SSE reconnection time | < 5 seconds on network drop | Browser EventSource |
| AWNING level update latency | < 1 second (SSE push) | E2E trace |
| Map tile load time | < 3 seconds at zoom 7 | Leaflet tile timing |
| Alert card render time | < 50ms per card | React Profiler |

### Secondary Metrics (operational)

| Metric | Target |
|--------|--------|
| SLA breach rate | < 2% of alerts |
| Operator acknowledgment rate | 100% of non-auto-resolved alerts |
| System health score | > 90 during normal operations |
| NOTAM data freshness | < 5 minutes stale |
| Aircraft data freshness | < 15 seconds stale (OpenSky rate limit) |

### WCAG 2.1 AA

All interactive components pass WCAG 2.1 AA automated audit (axe-core) and manual
keyboard navigation check. This is a launch gate, not a nice-to-have.

---

## Out of Scope for W21

The following are explicitly deferred:

1. **Mobile operator app** — tablet/phone interface for field officers. Future wave.
2. **Multi-tenant operator accounts** — single-organisation deployment. No user auth
   beyond the existing login page (W21 does not change auth).
3. **Live drone intercept controls** — drone neutralisation commands are out of scope.
   This dashboard is observation and acknowledgment only.
4. **Historical replay** — playback of past incidents. Post-W21.
5. **Custom zone configuration** — adding/editing protected zones from the UI. Post-W21.
6. **Integration with ROMATSA ATC** — direct ROMATSA feed requires bilateral agreement.
   W21 reads OpenSky for real aircraft; ROMATSA integration is a separate project.
7. **Offline mode** — network-connected operations only.

---

## Assumptions

1. The apex-sentinel-demo Vercel project is the deployment target. No new Vercel project.
2. W18-W20 backend engines are available as importable TypeScript modules from the
   apex-sentinel core repo. W21 does not re-implement any detection logic.
3. OpenSky API is available without authentication for 1000 requests/day (anonymous).
   ADS-B Exchange requires API key (env var ADSBX_API_KEY).
4. The operator always has a stable internet connection (no offline requirement).
5. The dashboard is accessed from a modern Chromium-based browser (Chrome 120+, Edge 120+).
   Firefox support is best-effort.
6. A single Vercel deployment serves all operators. No per-operator customisation.

---

*Document version: W21-PRD-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
