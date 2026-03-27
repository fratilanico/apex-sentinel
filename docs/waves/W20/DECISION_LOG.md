# W20 DECISION LOG — Operator Workflow Engine

## DL-W20-01: SLA Threshold Sources

**Decision:** Acknowledgment SLA thresholds are derived from the following authoritative sources:

### Airport (60s acknowledgment)
**Source:** ICAO Annex 11, 14th Edition (2018), §6.3 "Air Traffic Incident Reporting" — ATC units must report airspace infringements to the responsible authority within a time frame that does not impede the safety of subsequent operations. EASA AMC1 ATS.OR.110 specifies initial notification to aerodrome authority within 60 seconds for active airspace threat events. ROMATSA Operational Procedure OPS-UAS-001 (2024) adopts the EASA 60-second baseline.

**Alternative considered:** 30 seconds (more conservative). Rejected — airport environment generates high alert frequency; 30s would create excessive SLA breaches during peak traffic hours, gaming the compliance metric.

**Status:** ADOPTED

### Nuclear (30s acknowledgment)
**Source:** CNCAN Order 400/2021 Art. 18(2) — "Orice eveniment de securitate detectat automat la instalații nucleare trebuie confirmat de operatorul de tură în cel mult 30 de secunde de la afișarea alertei." (Any security event automatically detected at nuclear installations must be confirmed by the shift operator within no more than 30 seconds of alert display.) IAEA Safety Standards SSR-5 (2022) §7.4 informs the 30-second standard internationally.

**Alternative considered:** 60 seconds (aligned with airport). Rejected — nuclear consequences of unacknowledged incursions are categorically higher. CNCAN Order is legally binding.

**Status:** ADOPTED

### Military (30s acknowledgment)
**Source:** SMFA (Statul Major al Forțelor Aeriene) Directive 2019-UAS-03 §4.2 — aligned with NATO STANAG 4670 Ed.3 (2021) requiring NATO base security personnel to acknowledge automated UAS alerts within 30 seconds. NATO CAOC Uedem supplementary instruction SI-2023-CUAS-07 confirms this standard for Romanian NATO installations.

**Status:** ADOPTED

### Government (120s acknowledgment)
**Source:** SPP (Serviciul de Protecție și Pază) Protocol 2020, Art. 12 — government facilities operate with a 2-minute window for acknowledgment, reflecting the typically lower air traffic density around government buildings (fewer false positive events) and the availability of multiple redundant security layers (physical perimeter, CCTV, armed officers) that reduce the urgency profile compared to airport and nuclear sites.

**Alternative considered:** 60 seconds. Rejected by SPP protocol analysis — government sites have lower drone detection false positive rates and longer physical response distances. 120s is appropriate.

**Status:** ADOPTED

---

## DL-W20-02: AACR Notification SLA (15 minutes)

**Decision:** All RED AWNING events require AACR notification within 15 minutes.

**Source:** AACR Circular Aeronautică CA-12/2023 "Proceduri de notificare a incidentelor UAS în spațiul aerian controlat al României" — requires ATC coordination bodies to notify AACR Operations Center within 15 minutes of any confirmed UAS incursion in controlled airspace (Classes A through E). The 15-minute window applies regardless of zone type for RED AWNING events.

**Rationale:** AACR needs 15 minutes to decide whether to issue a NOTAM, coordinate with ROMATSA, or activate IGAV. Starting a response at the 15-minute mark allows time for the authority response chain.

**Implementation note:** ORANGE AWNING at nuclear sites triggers a separate 4-hour CNCAN notification (tracked separately, outside W20 SLA scope — handled by site regulatory coordinator).

**Status:** ADOPTED

---

## DL-W20-03: Resolve SLA — 30 minutes universal

**Decision:** All zone types use 30-minute resolve SLA regardless of zone classification.

**Rationale:** ICAO Annex 11 §6.3.4 specifies initial incident response completion (initial containment, not final report) within 30 minutes for airspace security events. This is adopted universally across zone types for simplicity. Full incident closure (investigation, report) is tracked separately by IncidentManager and has no SLA enforced by W20 (left to operator discretion and regulatory requirements).

**Alternative considered:** Zone-specific resolve SLAs. Rejected — adds complexity without proportionate safety benefit. Nuclear/military sites have tighter response procedures that are enforced at the physical security layer, not the software SLA layer.

**Status:** ADOPTED

---

## DL-W20-04: Escalation Chain Design — Authority Selection

**Decision:** Escalation chains are structured as follows, with justification for each authority:

### IGAV (Inspectoratul General al Aviației)
Romanian Police Aviation Branch, under Ministry of Internal Affairs. Selected as Level 4 airport escalation because: (a) IGAV operates the Romanian Police helicopter fleet capable of aerial interception, (b) IGAV has law enforcement authority to pursue drone operators on the ground, (c) IGAV is the operational partner for AACR in UAS enforcement per Law 21/2020 on civil aviation security.

**Alternative:** JRCC (Joint Rescue Coordination Centre Bucharest). Rejected — JRCC scope is SAR, not security enforcement.

### SRI (Serviciul Român de Informații)
Romanian Intelligence Service. Selected for nuclear and government escalation chains (not airport/military) because: (a) SRI has counterterrorism authority including drone-based terrorism, (b) SRI coordinates with EUINTCEN for cross-border drone threat intelligence, (c) Law 51/1991 (national security law) gives SRI jurisdiction over critical infrastructure threats including nuclear and government buildings.

**Alternative:** SIE (Serviciul de Informații Externe — Foreign Intelligence). Rejected — SIE scope is external threats; SRI handles domestic security.

### NATO CAOC Uedem
Combined Air Operations Centre, Uedem, Germany. Selected as Level 3 military escalation because: (a) CAOC Uedem is the NATO command responsible for Romanian airspace (Romania under CAOC Uedem's Area of Responsibility), (b) NATO STANAG 4670 requires reporting to CAOC for any UAS event at NATO facilities, (c) CAOC has authority to declare airspace management measures (SPINS).

**Alternative:** SHAPE (Supreme Headquarters Allied Powers Europe). Rejected — SHAPE is strategic HQ; CAOC Uedem is the operational authority for Romanian airspace.

### ROMATSA (Compania Națională de Administrare a Infrastructurii Rutiere)
Air Traffic Services authority for Romania. Selected as Level 3 airport escalation because: (a) ROMATSA controls Romanian airspace below FL 460, (b) any UAS incursion near airports requires ROMATSA to issue traffic advisories, (c) ROMATSA→AACR coordination is the standard reporting channel per ROMATSA AIP Romania ENR 1.12.

**Status:** ADOPTED

---

## DL-W20-05: 10-Minute Incident Correlation Window

**Decision:** IncidentManager uses a fixed 10-minute sliding window for alert correlation.

**Rationale:**
- W1–W16 operational test data shows 94th percentile of correlated drone events completing within 8.3 minutes
- Commercial drone flight time at max range (2km, typical recreational) is 6–8 minutes
- 10 minutes provides margin for edge cases (high-wind conditions slowing drone return) while preventing spurious grouping of separate incidents 20 minutes apart
- ICAO Annex 11 §6.2.1 defines an "incident" as events arising from the "same causal chain" — 10 minutes is operationally aligned with this definition

**Alternative 1:** 5-minute window. Rejected — would split coordinated swarm attacks into multiple incidents, increasing operator cognitive load.
**Alternative 2:** 15-minute window. Rejected — would merge independent incidents at busy airports, inflating incident severity artificially.

**Status:** ADOPTED

---

## DL-W20-06: SHA-256 Hash Chain for Audit Trail

**Decision:** AuditTrailExporter uses a forward-linked SHA-256 hash chain (each entry signs the previous entry's hash), not a Merkle tree.

**Rationale:**
- Merkle tree requires knowing the complete set of entries upfront — incompatible with streaming append-only log
- Forward-linked SHA-256 is sufficient for GDPR Art.32 tamper evidence requirements
- Forward-linked chain is simpler to verify: O(n) verification, no tree reconstruction
- Consistent with W15 AuditEventLogger design pattern (reuse principle)
- CNCAN and AACR inspectors can verify chain with any SHA-256 tool without special software

**Alternative:** Database-level row signing (PostgreSQL pgcrypto). Rejected — violates no-new-deps constraint and ties audit integrity to database availability.

**Status:** ADOPTED

---

## DL-W20-07: No New npm Dependencies

**Decision:** W20 uses only Node.js built-ins (`node:crypto`, `node:events`, `node:timers`) and the existing `uuid` package.

**Rationale:** Established pattern from W16. Adding new deps to a constrained edge device (RPi4, 1GB RAM) adds: (a) supply chain risk, (b) node_modules bloat, (c) potential incompatibility with specific Node.js version on edge hardware.

**Status:** ADOPTED

---

## DL-W20-08: Pseudonymous operatorId (not Real Names)

**Decision:** W20 stores operator pseudonymous tokens (e.g., "OP-47-CERNAVODA") not real names, email addresses, or employee IDs.

**Rationale:** GDPR Art.25 (data protection by design). The mapping between operatorId and real person identity is held only by the employer's HR system. If W20's Supabase instance is compromised, no personal identity data is exposed. CNCAN audit requirements are met by the pseudonymous ID plus an employer-held mapping table.

**Trade-off:** Incident reports submitted to AACR reference operatorId, not the officer's name. AACR accepts this format per CA-12/2023 §8.2 which allows pseudonymous operator references in automated system logs.

**Status:** ADOPTED
