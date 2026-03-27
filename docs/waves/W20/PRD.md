# W20 PRD — Operator Workflow Engine

## Product Vision

APEX-SENTINEL W20 transforms raw drone detection telemetry into actionable human operator workflows. Security personnel at Romania's airports, nuclear sites, military bases, and government buildings gain a structured, SLA-enforced interface for responding to drone incursions — with automatic escalation, audit trails, and cross-shift continuity.

---

## Operator Personas

### Persona 1: Airport Security Officer (ASO)
**Site context:** Henri Coandă International Airport (OTP), Otopeni. Handles commercial air traffic for Bucharest — 14 million passengers/year. Operates under AACR (Autoritatea Aeronautică Civilă Română) oversight and ROMATSA ATC coordination.

**Shift pattern:** 3×8h rotating shifts, 3 officers per shift, 1 senior duty officer.

**Cognitive environment:**
- Monitors 4 screens simultaneously: CCTV, ATMS radar, APEX-SENTINEL dashboard, radio comms
- Alert fatigue risk HIGH — airport generates 40–80 aircraft movements/hour creating background noise for RF sensors
- Must coordinate with ROMATSA tower within 15min of any RED AWNING event
- Primary fear: drone entering controlled airspace during landing/takeoff phase

**User journey — AWNING RED at runway threshold:**
1. APEX-SENTINEL detects RF signature 400m from runway 08L threshold
2. Alert appears on dashboard: `ALERT-2847 | Zone: OTP-RUNWAY-08L | AWNING: RED | ThreatScore: 0.94`
3. Officer receives Telegram push notification (W13) within 2s of detection
4. Officer opens APEX-SENTINEL dashboard, clicks Acknowledge — FSM: NEW → ACKNOWLEDGED
5. Officer activates airport drone response protocol: notifies ROMATSA tower, triggers runway hold
6. Officer updates alert status to INVESTIGATING, enters action note: "ROMATSA notified 14:23:07, runway 08L hold activated"
7. If drone clears zone: officer marks RESOLVED with outcome note
8. If drone persists >15min: EscalationMatrix auto-triggers AACR notification + IGAV dispatch request
9. Incident closes with IncidentReport generated for AACR regulatory filing

**Pain points addressed:**
- No more manual log book entries — AuditTrailExporter captures all actions automatically
- No more missed shift handovers — OperatorShiftHandover briefing at 06:00/14:00/22:00
- No more SLA ambiguity — SlaComplianceTracker shows real-time countdown

---

### Persona 2: Nuclear Site Security Supervisor (NSSS)
**Site context:** Cernavodă Nuclear Power Plant (CNE Cernavodă), operated by SNN (Societatea Națională Nuclearelectrica SA). Two CANDU-6 reactors, 1400 MWe combined. Restricted airspace LRCD — any UAS incursion is a Category A security incident.

**Shift pattern:** 12h rotating shifts, 2 senior supervisors + 4 officers. Continuous 24/7 operation.

**Cognitive environment:**
- Highest consequence zone in Romanian civilian nuclear infrastructure
- Any drone detection triggers mandatory reporting to CNCAN (Comisia Națională pentru Controlul Activităților Nucleare) within 4 hours
- SRI (Serviciul Român de Informații) must be notified for any ORANGE+ event
- Supervisor is accountable for the decision log — personal liability under nuclear security law
- Zero tolerance for unresolved alerts — every NEW alert has 30s ack SLA

**User journey — persistent drone at exclusion zone perimeter:**
1. Acoustic sensor + RF fusion detects DJI Mavic-class drone at 250m from reactor building
2. ThreatScore: 0.87 (high payload probability from acoustic signature, W5/W6)
3. AWNING: ORANGE — EscalationMatrix chain: Operator → Site Security → SNN → AACR → SRI
4. Supervisor acknowledges within 30s (SLA gate)
5. Supervisor activates site lockdown protocol per SNN Emergency Procedure EP-UAS-002
6. Simultaneously: SlaComplianceTracker starts AACR notification 15min countdown
7. Supervisor enters Investigating state, dispatches physical security team to sector
8. At 12min: system shows "AACR notif due in 3min" — supervisor sends notification, logs it
9. Physical team confirms drone — supervisor logs outcome, incident moves to MONITORING
10. Incident generates IncidentReport formatted for CNCAN mandatory reporting annex
11. AuditTrailExporter exports CSV for regulatory submission

**Pain points addressed:**
- Personal accountability documented: every action timestamped, signed by operatorId
- Regulatory reporting data pre-structured (CNCAN annex format)
- SRI notification not missed due to alert fatigue — escalation auto-triggers

---

### Persona 3: NATO Base Commander (NBC)
**Site context:** Mihail Kogălniceanu Air Base (MK), Constanța. NATO Enhanced Forward Presence. Hosts US 101st Airborne Division (rotational), Romanian Air Force. STANAG 4670 applies for airspace management. Interfaces with NATO Combined Air Operations Centre (CAOC) Uedem.

**Shift pattern:** 24/7 operations, duty commander on 8h shifts. Alert escalation goes direct to SMFA (Statul Major al Forțelor Aeriene — Romanian Air Force HQ).

**Cognitive environment:**
- Classified information environment — drone detection events have NATO classification implications
- Multi-national coordination: Romanian, US, other NATO forces on base
- CAOC Uedem must receive SALUTE reports for any AWNING YELLOW+ event
- Base commander has authority to authorize Counter-UAS (C-UAS) kinetic response under NATO ROE
- Shift handover is a formal military briefing — OperatorShiftHandover must produce SITREP-style format

**User journey — multi-drone swarm detection near flight line:**
1. RF mesh (W9) detects 3 coordinated RF signatures at flight line perimeter
2. W19 fusion: IncidentScore HIGH, coordinated swarm pattern, AWNING YELLOW
3. Alert appears on operator terminal: `INCIDENT-441 | Zone: MK-FLIGHTLINE | Drones: 3 | AWNING: YELLOW`
4. Duty operator acknowledges (30s SLA), notifies Base Commander
5. Base Commander opens APEX-SENTINEL multi-site view — sees MK status + sister base Câmpia Turzii
6. Commander activates C-UAS standby, issues NOTAM request to ROMATSA Constanța sector
7. EscalationMatrix auto-sends SALUTE report template to SMFA operations duty officer
8. At 20min with drones still present: Level 3 escalation → NATO CAOC notification
9. W20 records all CAOC coordination in audit trail under NATO security marking tags
10. Shift ends: OperatorShiftHandover generates SITREP-format briefing with all active incidents, sent to incoming commander via Telegram secure channel

**Pain points addressed:**
- Multi-site view prevents tunnel vision on single base
- SALUTE/SITREP format handover replaces informal verbal briefing
- Escalation chain documented in audit trail for NATO after-action review

---

## User Stories (prioritized)

### Must Have (W20)
- US-01: As an operator, I must acknowledge any NEW alert within zone SLA or receive SLA breach notification
- US-02: As an operator, I must be able to add action notes to any alert state transition
- US-03: As a supervisor, I must see all active incidents grouped with their constituent alerts
- US-04: As a duty officer, I must receive a structured shift handover briefing at shift boundaries
- US-05: As a site operator, I must see real-time SLA compliance percentage for my zone
- US-06: As a security supervisor, I must be able to export an audit trail for regulatory submission
- US-07: As an operator managing multiple zones, I must see all zones sorted by severity in a single view
- US-08: As a system, I must automatically escalate AWNING RED + SLA breach to next authority without operator action

### Should Have (W21)
- US-09: As an operator, I should be able to annotate alerts with evidence attachments (photos, video links)
- US-10: As a supervisor, I should see historical incident trends per zone (7d, 30d)
- US-11: As an AACR inspector, I should be able to download a tamper-evident PDF report for any incident

### Won't Have (W20)
- Real-time voice comms integration
- Mobile native app (W21+ scope)
- AI-generated incident narrative (post-hackathon)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Alert acknowledgment within SLA | ≥95% | SlaComplianceTracker rolling 24h |
| Incidents with complete audit trail | 100% | AuditTrailExporter hash chain validation |
| Shift handover completion rate | 100% | OperatorShiftHandover event count |
| False escalation rate | <5% | Escalations that self-resolve without authority action |
| Mean time to acknowledge (MTTA) | <30s all zones | AlertAcknowledgmentEngine timestamp delta |
| Mean time to resolve (MTTR) | <20min | IncidentManager lifecycle timestamps |

---

## Regulatory Drivers

- **ICAO Annex 11** — ATS response procedures for airspace infringement (airports)
- **EASA AMC1 ATS.OR.110** — coordination procedures between aerodrome and ATS unit
- **CNCAN Order 400/2021** — UAS security reporting for nuclear installations
- **Romanian Law 319/2006** — security incident documentation requirements
- **GDPR Art.5(1)(e)** — storage limitation for operator personal data in audit logs
- **NATO STANAG 4670** — UAS operations and reporting at NATO installations
