# APEX-SENTINEL W19 — PRIVACY ARCHITECTURE

## Theme: Romania/EU Threat Intelligence Layer — GDPR & ANSPDCP Compliance

---

## Document Purpose

This document is the W19 component of the APEX-SENTINEL Data Protection Impact Assessment (DPIA) pre-assessment. It covers:
- GDPR legal bases for all W19 processing activities
- Pseudonymisation and anonymisation design (GdprTrackAnonymiser FR-W19-05)
- Romanian ANSPDCP guidance compliance
- GDPR Art.22 safeguards for automated decisions
- Data minimisation and retention design
- Risk assessment for W19-specific processing activities

---

## Processing Activities Register

### Processing Activity 1: Aircraft Position Tracking

**Nature**: Real-time collection and processing of aircraft positions (lat/lon, altitude, speed, heading) from W18 ADS-B feeds.

**Category of data**: Position data. Not personal data for aircraft as entities. However, position + callsign + registration could indirectly identify the operator (a natural person) in the case of privately registered single-operator UAS.

**Applicable GDPR article**: Art.4(1) definition of personal data — applies when aircraft data is linkable to an identified or identifiable natural person.

**Legal basis**: Art.6(1)(e) — processing necessary for the performance of a task carried out in the public interest (aviation safety, national security, critical infrastructure protection under Romanian Law 535/2004 on preventing and combating terrorism and Law 182/2002 on national security).

**Data subjects**: UAS operators whose aircraft are detected within Romanian controlled airspace.

**Special category concern**: None. Aircraft position is not health, biometric, or racial data.

**Retention**: 24 hours maximum in all in-memory buffers (enforced by W19 AnonymisedTrack.expiresAt + buffer eviction). This aligns with GDPR Art.5(1)(e) storage limitation.

---

### Processing Activity 2: UAS Category Classification

**Nature**: Automated classification of detected aircraft into threat categories (cat-a-commercial through cat-d-unknown) based on ADS-B transponder data and ML signals.

**Applicable GDPR article**: Art.22 — automated decision-making. Category classification is an automated decision that affects UAS operators (their aircraft may be reported to AACR, triggering investigation).

**Legal basis**: Art.22(2)(b) — automated decision authorised by EU or Member State law. Romanian HG 1083/2013 and Law 21/2020 implementing EU 2019/945 authorise automated UAS classification for safety purposes.

**Safeguard**: GDPR Art.22(3) requires suitable measures to safeguard data subject rights, including the right to obtain human intervention. W19 implements this via `operatorConfirmationRequired=true` on all ORANGE/RED AWNING decisions, ensuring a human (AACR inspector) reviews every significant automated decision before enforcement action.

---

### Processing Activity 3: Regulatory Reporting (AacrNotification)

**Nature**: Formatted incident reports submitted (via W20) to AACR containing aircraft identity fragments, position, category, and threat assessment.

**Applicable GDPR article**: Art.6(1)(c) — processing necessary for compliance with a legal obligation. Romanian HG 1083/2013 §23 mandates incident reporting to AACR. Art.6(1)(e) also applies (public interest / national security).

**Data minimisation (Art.5(1)(c))**: For Cat-A aircraft, AACR notifications use anonymised data (grid-snapped position, callsign prefix only, pseudonymised ID). For Cat-D (unknown), full available data is included — proportionate given the security justification.

**Transfer to AACR**: AACR is a Romanian public authority. Data transfer is lawful under Art.6(1)(c). No cross-border transfer outside EEA.

---

### Processing Activity 4: ROMATSA ATC Coordination

**Nature**: ATC coordination messages forwarded to ROMATSA containing aircraft particulars and breach details.

**Legal basis**: Art.6(1)(c) — legal obligation under ICAO Doc 4444 and Romanian aviation law. Art.6(1)(e) — public interest (aviation safety).

**Recipient**: ROMATSA is a Romanian public authority (ATS provider). Data transfer is lawful.

**TLP:RED marking**: Coordination messages are marked Traffic Light Protocol RED — not for sharing outside ATC chain.

---

## GDPR Article-by-Article Compliance

### Article 5 — Principles

| Principle | W19 Implementation |
|-----------|-------------------|
| Art.5(1)(a) Lawfulness, fairness, transparency | Legal bases documented above. APEX-SENTINEL privacy notice (W20 task) to be published before operational deployment. |
| Art.5(1)(b) Purpose limitation | Aircraft data collected for aviation safety / critical infrastructure protection only. No secondary use (marketing, research) permitted. |
| Art.5(1)(c) Data minimisation | Cat-A: only pseudonymised position (100m grid), callsign prefix, category. Cat-D: full data for security investigation only. |
| Art.5(1)(d) Accuracy | W18 feed data is real-time; positions accurate to ~10m (GPS precision). 4dp truncation in logs ≈ 11m accuracy. |
| Art.5(1)(e) Storage limitation | 24h hard TTL on all in-memory buffers. AnonymisedTrack.expiresAt enforced. Cat-D tracks retained until AACR formal incident closure (Art.6(1)(c) legal obligation overrides 24h limit for active incidents). |
| Art.5(1)(f) Integrity and confidentiality | NATS TLS in transit. HMAC-SHA256 for pseudonymisation. ThreatIntelPicture never logged in plaintext. |
| Art.5(2) Accountability | This document + DECISION_LOG.md + Supabase audit log (W20) constitute the accountability record. |

---

### Article 6 — Lawfulness

**Primary legal basis: Art.6(1)(e) — Public interest**

The processing serves:
1. Aviation safety (Regulation (EU) 2018/1139 — Basic Regulation; Romanian Law 21/2020)
2. Critical infrastructure protection (Romanian Law 535/2004; EU Directive 2022/2557 on resilience of critical entities)
3. National security and public order (Romanian Constitution Art.119; Law 182/2002)

**Secondary legal basis: Art.6(1)(c) — Legal obligation**

Romanian HG 1083/2013 mandates incident reporting to AACR. This creates a legal obligation for operators of detection systems to report detected UAS breaches.

**Cat-D specific: Art.6(1)(e) overrides anonymisation obligation**

The GdprTrackAnonymiser's exemption for Cat-D aircraft is grounded in: an unidentified non-cooperative drone near critical infrastructure represents a potential threat to public security. Art.6(1)(e) explicitly covers "tasks carried out in the public interest" which includes security. Recital 45 GDPR confirms that processing for security purposes can constitute a public task basis.

---

### Article 9 — Special Category Data

W19 does not process special category data (health, biometric, racial/ethnic origin, political opinions, etc.). Aircraft registration data, callsigns, and positions are not special category data under Art.9.

However, note: if a UAS operator is a political activist and their flight near a government building leads to their identification by AACR, the data could *become* sensitive in context. W19's anonymisation approach (pseudonymised ID, 100m grid) prevents this indirect sensitivity from arising for Cat-A operators.

---

### Article 22 — Automated Individual Decision-Making

**Applicability**: W19's threat scoring and AWNING level assignment are automated decisions. ORANGE/RED AWNING generates AACR notifications without human review at the W19 layer. This constitutes automated decision-making that produces effects (investigation, potential operator identification) on data subjects (UAS operators).

**Legal basis for Art.22**: Art.22(2)(b) — authorised by EU or Member State law. Romanian Law 21/2020 Art.17 and HG 1083/2013 §23 provide the legal basis for automated incident detection and reporting.

**Safeguards required by Art.22(3)**:

1. **Right to obtain human intervention**: `operatorConfirmationRequired: true` flag in all ORANGE/RED AacrNotifications. AACR inspectors must review and confirm before any enforcement action (identity investigation, operator contact).

2. **Right to express point of view**: W20 (future) will include an operator self-identification portal where an operator whose drone has been reported can proactively identify themselves and provide context.

3. **Right to contest the decision**: AACR's SIRA system provides a formal dispute mechanism. W19 notifications include all classification factors (ThreatScoreFactors) to enable meaningful challenge.

4. **No solely automated decisions producing "significant effect"**: The decision to **investigate** (opening an AACR incident) is the significant effect. This decision always requires human (AACR inspector) confirmation. W19 only generates the notification; it never autonomously dispatches enforcement.

---

### Article 25 — Data Protection by Design and by Default

**By design:**
- Cat-A anonymisation is the default. It requires explicit exemption (Cat-D status) to retain identifiable data.
- Grid-snap is applied to ALL log output, not just anonymised tracks. This ensures position precision is reduced at the infrastructure level, not just the application level.
- HMAC pseudonymisation uses a per-deployment secret (not a global constant) — rotation is possible without code changes.

**By default:**
- New aircraft entering the picture are assigned a fresh track timer and scheduled for anonymisation at 30s.
- `privacyBreachFlag` defaults to false. It is only set on explicit error paths.
- `operatorConfirmationRequired` defaults to true for ORANGE/RED. It can only be set to false by a future W20 human override.

---

## Romanian ANSPDCP Compliance

### ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal)

Romania's Data Protection Authority. Equivalent to ICO (UK) or CNIL (France). ANSPDCP guidance relevant to W19:

**Ghid privind pseudonimizarea datelor cu caracter personal** (ANSPDCP Pseudonymisation Guide):

1. Pseudonymisation must use a cryptographically strong function. W19 uses HMAC-SHA256 — compliant.
2. The pseudonymisation key (APEX_DEPLOY_SECRET) must be stored separately from the pseudonymised data. W19: key is in environment variables, data is in memory — compliant.
3. Re-identification must require the key. W19: without APEX_DEPLOY_SECRET, pseudoId is opaque — compliant.

**ANSPDCP position on aviation data**:

ANSPDCP's 2021 guidance on surveillance systems (Ghid privind sistemele de supraveghere video) establishes that automated detection systems operating in public airspace require:
1. A published privacy notice (W20 task)
2. A DPIA for large-scale systematic processing (this document is the pre-assessment; full DPIA before production deployment)
3. Registration of processing activities in the internal record (GDPR Art.30)

**DPIA Trigger Assessment for W19:**

ANSPDCP identifies large-scale processing of location data as automatically triggering a DPIA (Art.35). APEX-SENTINEL processes real-time position data for all aircraft in Romanian airspace. This constitutes large-scale processing.

**DPIA Timeline**: Full DPIA must be completed before W19 enters operational/production deployment. The W19 documentation package (this file + DESIGN.md + DATABASE_SCHEMA.md) constitutes the pre-assessment that enables the full DPIA to be conducted.

---

## CNCAN Nuclear Security Interface

Cernavodă Nuclear Power Plant (CNE Cernavodă) is regulated by CNCAN (Comisia Națională pentru Controlul Activităților Nucleare). CNCAN Order 180/2014 on physical security of nuclear facilities requires notification of security incidents including unauthorised UAV intrusion.

W19's `cncanEscalationRequired=true` flag (set for all nuclear zone breaches) is designed to trigger W20's CNCAN notification channel. This is not a GDPR compliance issue but a nuclear security regulatory compliance issue. Data shared with CNCAN falls under national security law, not GDPR (Art.2(2)(a) — national security is outside EU law scope).

---

## Data Breach Response

If a W19 processing failure results in a privacy breach (e.g., HMAC key missing, position data logged in plaintext), the following applies:

1. `privacyBreachFlag=true` is set in ThreatIntelPicture
2. W20 (future) monitors this flag and triggers ANSPDCP notification workflow
3. GDPR Art.33 requires notification to ANSPDCP within 72 hours of becoming aware of a breach
4. If breach is likely to result in high risk to natural persons: Art.34 direct notification to affected data subjects required

**W19 breach scenarios:**

| Scenario | Privacy Risk | Mitigation |
|----------|-------------|------------|
| APEX_DEPLOY_SECRET missing | Position + ICAO24 logged in plaintext | ERROR_PASSTHROUGH + privacyBreachFlag; restart with valid secret |
| NATS connection lost | No data lost; W19 buffers locally until reconnect | NATS durable connection config |
| Buffer overflow (>1000 breach events) | Old events evicted without W20 acknowledgement | Ring buffer + capacity monitoring |
| W20 delay processing notifications | Notifications in W19 buffer > 24h | W19 to enforce 24h TTL on notification buffer; expired notifications deleted unprocessed |

---

## Privacy-by-Design Decisions Summary

| Decision | Rationale | GDPR Article |
|----------|-----------|--------------|
| 30s anonymisation timer for Cat-A | Minimum operational need: 30s is sufficient for breach detection; no justification for longer retention | Art.5(1)(e) |
| 100m grid-snap for all logs | 100m precision is operationally sufficient for zone breach analysis; prevents individual tracking | Art.5(1)(c) |
| HMAC-SHA256 with per-deployment secret | Irreversible without key; key rotation possible; compliant with ANSPDCP guidance | Art.25(1) |
| Cat-D exemption from anonymisation | Security necessity; Art.6(1)(e) public interest; non-cooperative drone is by definition a security risk | Art.6(1)(e), Recital 45 |
| operatorConfirmationRequired on all ORANGE/RED | Prevents solely automated enforcement; human oversight preserves Art.22 rights | Art.22(3) |
| No ML training on live data | Live position data not used for model improvement; purpose limitation | Art.5(1)(b) |
| In-memory only; no Supabase persistence in W19 | Minimises storage surface; persistence deferred to W20 with full audit controls | Art.5(1)(e) |
