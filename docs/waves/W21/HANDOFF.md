# W21 HANDOFF — Production Operator UI

## Status

W21 is the final UI wave of the APEX-SENTINEL development programme (W1-W21).
When W21 is marked complete, the system transitions from active development to
operational status.

---

## What W21 Delivers

At W21 completion, the ops team receives:

1. A production-grade operator dashboard at the Vercel URL, showing real Romanian airspace
   data: live aircraft, protected zones with AWNING levels, threat detections, NOTAMs,
   weather conditions.

2. A fully functional alert workflow: new alerts arrive via SSE, operators acknowledge
   with one click, SLA tracking is automatic, breaches trigger Telegram escalation.

3. An incident management view: correlated incidents with full timeline, escalation chains,
   exportable via browser print to PDF.

4. Network health monitoring: all 7 sensor nodes, all 8 data feeds, real-time health score.

5. GDPR and EASA compliance status visible at all times.

6. 71 passing tests documenting all expected behaviours.

---

## Handoff Checklist

### Engineering → Operations

- [ ] Production URL confirmed live: `https://apex-sentinel-demo.vercel.app`
- [ ] All environment variables set in Vercel (DEPLOY_CHECKLIST.md §2)
- [ ] ops team has access to Vercel project dashboard (for deployment monitoring)
- [ ] Runbook: how to check Vercel function logs when an API route returns errors
- [ ] Runbook: how to roll back to previous deployment (LKGC_TEMPLATE.md §rollback)
- [ ] Escalation contact for engineering bugs: [engineering contact TBD]

### Engineering → Security Team

- [ ] Dashboard login credentials distributed to operators
- [ ] Operator onboarding session: 30-minute walkthrough of all 4 tabs
- [ ] SLA policy explained: which zones have which SLA windows
- [ ] Escalation procedure: what happens when [ESCALATE] is triggered automatically
- [ ] GDPR briefing: what data the UI displays vs what is stored, retention policy

### Documentation Handoff

These documents are handed off to operations:

| Document | Audience | Location |
|----------|----------|----------|
| DESIGN.md | New UI developers | docs/waves/W21/ |
| API_SPECIFICATION.md | Integration team | docs/waves/W21/ |
| DEPLOY_CHECKLIST.md | DevOps | docs/waves/W21/ |
| PRIVACY_ARCHITECTURE.md | DPO, legal | docs/waves/W21/ |
| ACCEPTANCE_CRITERIA.md | QA, ops | docs/waves/W21/ |
| LKGC_TEMPLATE.md | DevOps | docs/waves/W21/ |

---

## System Overview for Operators

### What APEX-SENTINEL Does (Plain Language)

APEX-SENTINEL automatically detects unauthorised drones flying over protected Romanian
airspace. When a drone is detected:

1. The system classifies what type of drone it is (Commercial UAS, Modified UAS, etc.)
2. The zone's AWNING level changes to reflect the threat (GREEN → YELLOW → ORANGE → RED)
3. An alert appears in the right panel of your dashboard
4. You have [SLA] seconds to acknowledge the alert
5. If you don't acknowledge in time, the system automatically escalates to your supervisor

Your job as a shift operator:
- Watch the alert panel on the right
- Acknowledge alerts within the SLA window
- Escalate or investigate as your procedures require
- Check the INCIDENTS tab for ongoing situations
- Use the ZONE MAP to understand spatial context

### Tab Guide

**ZONE MAP** — Your primary view. Romania map with zones coloured by threat level.
Real aircraft from ADS-B. Threat detections as separate markers. Click anything for details.

**INCIDENTS** — Active and recent incidents. Grouped from multiple alerts. Full timeline.

**NETWORK** — System health. Is every sensor online? Is every data feed working?

**COMPLIANCE** — GDPR data retention, EASA zone coverage, SLA compliance metrics.
For supervisor/manager review and regulatory reporting.

---

## Future Wave Owners

W21 is the final development wave. Future work is tracked in ROADMAP.md:

- W22: Mobile field operator app (new repo, new project)
- W23: Historical analysis dashboard (separate Vercel deployment)
- W24: Multi-tenant operator accounts (modifies apex-sentinel-demo + Supabase)
- W25: Custom zone configuration UI
- Post-W21 patch: jspdf for direct PDF download (replace window.print())
- Post-W21 patch: W17 acoustic 16kHz fix (backend wave, not UI)

Any engineer picking up post-W21 work should read:
1. This HANDOFF.md
2. DECISION_LOG.md — understand why key choices were made
3. ARCHITECTURE.md — understand the component hierarchy and data flow
4. SESSION_STATE.md — current known issues and open questions

---

## Known Issues at Handoff

### KI-W21-01: PDF Export Uses Browser Print Dialog

Impact: operators must click "Save as PDF" in browser print dialog rather than
receiving a direct download. Workaround: instruct operators to select "Save as PDF"
in Chrome's print dialog.
Fix: add jspdf in post-W21 patch. Estimated effort: 4 hours.

### KI-W21-02: OpenSky 30-Second Aircraft Delay

Impact: conventional aircraft positions are up to 30 seconds old. This is inherent
to the OpenSky anonymous API tier.
Workaround: aircraft are labelled with "Last seen: Xs ago" timestamp.
Fix: ROMATSA bilateral agreement for real-time feed. Not an engineering issue.

### KI-W21-03: 16kHz vs 22050Hz Acoustic Pipeline Mismatch

Impact: acoustic classification accuracy is reduced because INDIGO's reference library
uses 16kHz samples but APEX-SENTINEL captures at 22050Hz. This is a backend issue.
The W21 UI correctly displays whatever classifications the backend produces.
Fix: W17 acoustic pipeline fix (deferred post-hackathon). Engineering effort: estimated 2 days.

### KI-W21-04: ROMATSA Integration Not Available

Impact: real-time aircraft data from ROMATSA ATC is not available. OpenSky is used instead.
Workaround: OpenSky data is sufficient for threat context (distinguishing civil traffic
from unregistered UAS).
Fix: requires bilateral data sharing agreement. Not engineering-blocked.

### KI-W21-05: SSE Stream on Vercel Edge has 25s Timeout Without Activity

Impact: if the apex-sentinel backend has no events for 25 seconds, the Vercel Edge
function may timeout the stream.
Mitigation: keepalive events are sent every 30 seconds from the backend. If the backend
is silent for 25 seconds, the browser reconnects (automatic, <5 second gap).
Fix: reduce keepalive interval to 20 seconds. Quick config change if issue manifests.

---

## Operations Contacts

| Role | Name | Contact |
|------|------|---------|
| Engineering lead | Nico | Telegram: @[handle] |
| Ops lead | TBD | TBD |
| AACR liaison | TBD | TBD |
| Data protection officer | TBD | TBD |

---

## Lessons Learned (for future wave engineers)

1. **Leaflet SSR guard is mandatory** — every Leaflet component must use `dynamic(..., { ssr: false })`.
   If this is missed, the Vercel build passes but the page crashes on load. Add a lint rule.

2. **SSE + Vercel Edge = 25s idle timeout** — always send keepalives from the server side.
   The browser EventSource reconnects gracefully, but operators will see the "reconnecting"
   indicator if keepalives stop. Backend issue, not frontend.

3. **Happy-DOM is required for Leaflet tests** — JSDOM does not implement Canvas API.
   Switching from jsdom to happy-dom in vitest.config.ts is not optional.

4. **Optimistic UI on acknowledge** — operators click fast. If the acknowledge API call
   takes 500ms, a synchronous UI feels broken. useOptimistic is the correct pattern.

5. **API routes strip owner data** — aircraft owner/operator data must be stripped before
   returning from /api/aircraft. This is a privacy requirement. Add it to code review
   checklist for any future aircraft-related API route.

6. **Drone category labels are a product decision, not a technical one** — they are defined
   in DECISION_LOG.md (AD-W21-08). Do not change them without product review. Airport
   security officers use these terms in their incident reports.

---

*Document version: W21-HANDOFF-v1.0*
*Status: PLANNED (update to COMPLETE when W21 is deployed)*
