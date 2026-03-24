# APEX-SENTINEL — Risk Register
# FILE 19 of 20 — RISK_REGISTER.md
# Wave 1 Baseline — 2026-03-24

---

## Risk Scoring Matrix

```
Probability:  H = >60% likely  |  M = 20-60% likely  |  L = <20% likely
Impact:       H = project-blocking or legal  |  M = significant delay  |  L = minor degradation

Risk Score = Probability × Impact:
  H × H = Critical (9)   — escalate immediately
  H × M = High (6)       — mitigate in current wave
  M × H = High (6)       — mitigate in current wave
  M × M = Medium (4)     — plan mitigation
  H × L = Medium (3)     — monitor
  M × L = Low (2)        — accept or monitor
  L × H = Medium (3)     — contingency plan
  L × M = Low (2)        — accept
  L × L = Low (1)        — accept
```

---

## Active Risks

---

### RISK-01: False Positive Rate Too High in Urban Acoustic Environments

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-01                                                                        |
| **Category**   | Technical — ML Accuracy                                                        |
| **Description**| In dense urban environments (Bucharest, Iași), background noise from traffic,  |
|                | construction, motorcycles, and low-flying helicopters contains spectral        |
|                | components overlapping the FPV drone frequency signature (150-500Hz). The      |
|                | INDIGO AirGuard 87% accuracy was validated in semi-open environments. Urban    |
|                | false positive rate could be 3-5× higher, rendering the system unusable for    |
|                | city deployments.                                                              |
| **Probability**| H                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | Critical (9)                                                                   |
| **Mitigation** | 1. Implement two-stage confirmation: require 2+ consecutive DRONE detections   |
|                |    within 3 seconds before alerting. 2. Add spectral flux feature — engines    |
|                |    have periodic fluctuation pattern distinct from traffic. 3. Collect urban   |
|                |    noise profiles during W1 calibration and fine-tune model on Romanian urban  |
|                |    soundscapes (W2). 4. User-configurable confidence threshold (default 0.70,  |
|                |    urban recommend 0.85+). 5. RF/EMF sensor fusion (W2) reduces false positives|
|                |    since traffic noise has no 2.4GHz RF signature.                             |
| **Owner**      | Nicolae Fratila / ML Engineer (W2 hire)                                       |
| **Review Date**| W1 complete                                                                   |

---

### RISK-02: iOS RF Access Limitation — No WiFi Scanning API

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-02                                                                        |
| **Category**   | Platform — iOS Restriction                                                     |
| **Description**| iOS does not expose the WifiManager equivalent to third-party apps. CNCopyCurrentNetworkInfo |
|                | returns only the current SSID (removed in iOS 13 for privacy). There is no API |
|                | to enumerate nearby BSSIDs, scan channel power, or access RSSI for probe       |
|                | requests. The RF/EMF anomaly detection subsystem is therefore unavailable on   |
|                | iOS, reducing the iOS node to acoustic-only detection.                         |
| **Probability**| H (certainty — this is a platform limitation, not a risk of occurrence)       |
| **Impact**     | M                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Accept: iOS nodes are acoustic-only. Document clearly in onboarding.        |
|                | 2. Compensating control: iOS nodes paired with a Raspberry Pi companion via    |
|                |    BLE that does WiFi scanning using Linux wlan0 monitor mode (W3).           |
|                | 3. Apple Entitlement request: investigate NEHotspotConfiguration + restricted  |
|                |    entitlements for RF metadata (enterprise distribution path only).           |
|                | 4. Promote Android as primary node platform for full-capability deployments.   |
| **Owner**      | Nicolae Fratila                                                               |
| **Review Date**| W2 start                                                                      |

---

### RISK-03: GPS Time Sync Accuracy Insufficient for TDoA

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-03                                                                        |
| **Category**   | Technical — Triangulation Accuracy                                             |
| **Description**| TDoA triangulation requires GPS timestamps accurate to ±1ms across nodes.     |
|                | Android FusedLocationProviderClient reports GPS time, but: (a) consumer        |
|                | devices have GPS time sync latency of 100-500ms on cold start; (b) GPS signal  |
|                | unavailable indoors degrades to NTP (±50ms); (c) Android Doze mode can suspend |
|                | GPS updates. At ±50ms sync error, TDoA positional error grows from 62m to      |
|                | >15km (speed of sound: 343 m/s × 50ms = 17m per node pair, propagated).       |
| **Probability**| M                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Use GPS_PROVIDER exclusively (not network/fused) for TDoA timestamp.        |
|                | 2. Require GPS lock before contributing to TDoA computation — flag node as     |
|                |    "tdoa_eligible: false" until GPS accuracy < 10m.                           |
|                | 3. Implement PPS (pulse-per-second) via USB GPS dongle on Raspberry Pi nodes.  |
|                | 4. For phone nodes: use phone's GPS NMEA sentence time (sub-second precision). |
|                | 5. Fallback: when GPS unavailable, use NTP + flag "accuracy_degraded: true".   |
| **Owner**      | Nicolae Fratila / Firmware Engineer                                           |
| **Review Date**| W3 TDoA implementation                                                        |

---

### RISK-04: Node Density Insufficient for Triangulation

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-04                                                                        |
| **Category**   | Operational — Deployment                                                       |
| **Description**| TDoA requires ≥3 nodes within acoustic detection range (~500m of threat) to   |
|                | produce a position fix. In Romanian border regions (Galați, Tulcea, Suceava),  |
|                | volunteer density may be too low to consistently achieve 3-node coverage.     |
|                | Single-node deployment produces only "detection event" not "position fix".    |
| **Probability**| H                                                                              |
| **Impact**     | M                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Design system to be valuable with single-node (detection-only mode).        |
|                | 2. Partner with Romanian civil defense organizations (IGSU, local councils)   |
|                |    for mandatory deployment coverage in high-risk corridors.                  |
|                | 3. Raspberry Pi fixed-node kits for infrastructure installations (not          |
|                |    dependent on volunteer presence).                                           |
|                | 4. C2 shows "coverage map" with triangulation-capable zones highlighted.       |
|                | 5. Gamification: volunteers earn contribution score visible on leaderboard.    |
| **Owner**      | Nicolae Fratila / Community Ops                                               |
| **Review Date**| W2 complete                                                                   |

---

### RISK-05: Battery Drain from Continuous Monitoring

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-05                                                                        |
| **Category**   | Technical — Mobile Performance                                                 |
| **Description**| Continuous AudioRecord (16kHz) + TFLite inference (every 975ms) + GPS polling  |
|                | will drain smartphone battery in 3-5 hours. This makes 24/7 monitoring         |
|                | impractical unless the phone is plugged in. Volunteers are unlikely to keep    |
|                | phones plugged in constantly.                                                  |
| **Probability**| H                                                                              |
| **Impact**     | M                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. VAD pre-filter (FR-02) reduces inference frequency by ~60% in silent         |
|                |    environments — primary mitigation already designed in.                      |
|                | 2. Adaptive inference rate: if no detection in 10min, reduce to 50% duty cycle.|
|                | 3. Battery >80%: full monitoring. Battery 20-80%: adaptive. Battery <20%:       |
|                |    acoustic-only (no GPS polling), push notification to volunteer.             |
|                | 4. "Power saver" mode: 50ms inference every 2s instead of every 975ms.         |
|                | 5. Use AAudio (low-latency) over AudioRecord for reduced CPU wakeup overhead.   |
|                | 6. Document: deploy with portable power banks (20,000mAh = 3+ days).           |
| **Owner**      | Android Engineer                                                              |
| **Review Date**| W1 performance testing                                                        |

---

### RISK-06: Regulatory — Wiretapping / Audio Surveillance Laws

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-06                                                                        |
| **Category**   | Legal / Regulatory                                                             |
| **Description**| Continuous microphone monitoring in public or private spaces may violate       |
|                | Romanian Law 135/2010 (Criminal Procedure Code, Article 139 — interception),  |
|                | EU GDPR Article 9 (biometric audio data), and the Council of Europe Convention |
|                | on Human Rights Article 8 (privacy). Deploying in shared spaces, buildings,   |
|                | or vehicles without informed consent of all persons present could create       |
|                | criminal liability.                                                            |
| **Probability**| M                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Enforce FR-24 (audio non-retention): never store or transmit raw audio.     |
|                | 2. Legal review by Romanian privacy attorney before public launch.             |
|                | 3. App store listing: explicit "drone detection only — environmental sound      |
|                |    monitoring" description with GDPR consent notice.                           |
|                | 4. Privacy policy clearly states: audio processed only locally, never stored,  |
|                |    never transmitted, deleted after inference.                                 |
|                | 5. Explore "public safety" exemption under Law 190/2018 Article 3.             |
|                | 6. Obtain legal opinion on whether drone detection constitutes "public safety   |
|                |    monitoring" exempt from wiretapping law.                                    |
| **Owner**      | Nicolae Fratila / Legal Counsel                                               |
| **Review Date**| Before any public beta                                                        |

---

### RISK-07: Regulatory — WiFi Frequency Scanning Legality

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-07                                                                        |
| **Category**   | Legal / Regulatory                                                             |
| **Description**| Passive WiFi scanning (monitor mode) to detect drone control link RF           |
|                | signatures may constitute "interception of radio communications" under         |
|                | Romanian Law 298/2008 (transposing EU Directive 2006/24/EC) or EU Directive    |
|                | 2018/1972 (European Electronic Communications Code). Active scanning (probe    |
|                | requests) is clearly legal; passive monitor mode in some EU jurisdictions      |
|                | requires authorization.                                                        |
| **Probability**| L                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | Medium (3)                                                                     |
| **Mitigation** | 1. Use only Android WifiManager.startScan() (passive, non-monitor-mode) —      |
|                |    legally unambiguous in all EU jurisdictions.                                |
|                | 2. Do NOT use packet capture or promiscuous mode.                              |
|                | 3. Document legal basis: ANCOM (Romanian telecom regulator) guidance on        |
|                |    WiFi scanning for security research.                                        |
|                | 4. SDR (W3 scope) — obtain specific legal review before deployment.            |
| **Owner**      | Nicolae Fratila / Legal Counsel                                               |
| **Review Date**| W3 start (when RF SDR planned)                                                |

---

### RISK-08: Adversary Jamming of Acoustic + RF Sensors

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-08                                                                        |
| **Category**   | Security — Adversarial                                                         |
| **Description**| A sophisticated adversary (state-level threat actor) could counter APEX-       |
|                | SENTINEL by: (a) using acoustic baffles or low-RPM electric motors to suppress |
|                | acoustic signature; (b) operating on 433MHz or 900MHz control links outside   |
|                | the 2.4/5.8GHz WiFi-scannable band; (c) frequency-hopping control link to      |
|                | defeat RF energy anomaly detection. This is an explicit design limitation, not |
|                | a bug.                                                                         |
| **Probability**| M                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Accept limitation: APEX-SENTINEL is designed for unsophisticated FPV and    |
|                |    mass-production Shahed-class, not state-level stealth drones.              |
|                | 2. Multi-modal: acoustic + RF together reduce single-vector jamming success.   |
|                | 3. W3/W4: add SDR scanning of 433MHz / 868MHz / 915MHz control bands.         |
|                | 4. W4: seismic / vibration sensors as third modality (ground-mounted nodes).  |
|                | 5. Document explicitly in PRD and public communications: not a military-grade  |
|                |    solution; complements, does not replace, military systems.                 |
| **Owner**      | Nicolae Fratila / Security Advisor                                            |
| **Review Date**| W3 complete                                                                   |

---

### RISK-09: GDPR Challenge on Audio Capture — Data Subject Complaint

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-09                                                                        |
| **Category**   | Legal — GDPR                                                                   |
| **Description**| ANSPDCP (Romanian Data Protection Authority) could receive a complaint from a  |
|                | data subject who objects to their voice/conversations being processed by the   |
|                | APEX-SENTINEL app, even ephemerally. Under GDPR Article 9, processing          |
|                | "biometric data for the purpose of uniquely identifying a natural person" is   |
|                | prohibited without explicit consent. Audio processing for drone detection may  |
|                | incidentally process speech.                                                   |
| **Probability**| L                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | Medium (3)                                                                     |
| **Mitigation** | 1. FR-24 enforced: zero raw audio storage or transmission.                     |
|                | 2. Legal basis: Article 6(1)(f) legitimate interests (public safety) +         |
|                |    Article 9(2)(g) substantial public interest.                               |
|                | 3. DPIA (Data Protection Impact Assessment) completed before launch.           |
|                | 4. Clear consent flow in app onboarding with opt-out.                         |
|                | 5. Consult ANSPDCP proactively — regulatory sandbox request.                  |
| **Owner**      | Nicolae Fratila / DPO (designated)                                            |
| **Review Date**| Before public launch                                                          |

---

### RISK-10: Supabase Cold Start Latency on Detection Event Ingestion

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-10                                                                        |
| **Category**   | Technical — Infrastructure                                                     |
| **Description**| Supabase project bymfcnwfyxuivinuzurr on Free/Pro tier may have cold start     |
|                | latency of 1-5 seconds after inactivity periods. Detection event ingestion     |
|                | target: ≤2 seconds. Cold start could cause events to queue locally for 5-10s  |
|                | before the first event lands, creating a blind spot window after node startup. |
| **Probability**| M                                                                              |
| **Impact**     | L                                                                              |
| **Score**      | Low (2)                                                                        |
| **Mitigation** | 1. Upgrade to Supabase Pro (always-on, no cold start) for production.          |
|                | 2. Implement warm-up ping: on app start, send a health-check request to        |
|                |    Supabase before starting detection pipeline.                               |
|                | 3. Local Room queue (FR-12) ensures no events are lost during cold start.      |
| **Owner**      | Nicolae Fratila                                                               |
| **Review Date**| W1 complete                                                                   |

---

### RISK-11: TFLite Model Size Exceeds Capacity on Older Devices

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-11                                                                        |
| **Category**   | Technical — Device Compatibility                                               |
| **Description**| YAMNet TFLite model (480KB) plus RF classifier (120KB) = 600KB total. On       |
|                | Android devices with minSdk 26 and <1GB RAM (common in Romanian rural areas:   |
|                | Samsung Galaxy J-series, Motorola E-series), loading two TFLite models         |
|                | simultaneously may cause OOM (Out of Memory) errors or excessive GC pressure. |
| **Probability**| M                                                                              |
| **Impact**     | M                                                                              |
| **Score**      | Medium (4)                                                                     |
| **Mitigation** | 1. INT8 quantization already reduces acoustic model from ~480KB → ~220KB.      |
|                | 2. Load models sequentially, not simultaneously. RF model loaded only when     |
|                |    acoustic detection probability > 0.50.                                     |
|                | 3. Memory profiling with Android Memory Profiler in W1.                       |
|                | 4. On devices <512MB available RAM: disable RF classifier, acoustic-only mode. |
| **Owner**      | Android Engineer                                                              |
| **Review Date**| W1 device testing                                                             |

---

### RISK-12: Android Doze Mode Killing Background Service

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-12                                                                        |
| **Category**   | Technical — Android Platform                                                   |
| **Description**| Android Doze mode (API 23+) aggressively suspends background activity,         |
|                | including audio capture and network requests, when the device is stationary    |
|                | and not charging. A sentinel node left monitoring (e.g., in a window)          |
|                | will have its audio capture killed by Doze within 15-30 minutes. The          |
|                | FOREGROUND_SERVICE_MICROPHONE permission (W2) partially addresses this, but    |
|                | OEM battery optimizations (Samsung, Xiaomi) may override it.                  |
| **Probability**| H                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | Critical (9)                                                                   |
| **Mitigation** | 1. W1 scope: foreground Activity only (no background). User keeps screen on.   |
|                | 2. W2 scope: implement foreground Service with FOREGROUND_SERVICE_MICROPHONE   |
|                |    + show persistent notification (required for foreground service).          |
|                | 3. Guide user to disable battery optimization for APEX Sentinel (Settings).    |
|                | 4. Use PowerManager.WakeLock (PARTIAL_WAKE_LOCK) while monitoring.             |
|                | 5. Doze whitelist: request user to add app to battery whitelist.               |
|                | 6. For Raspberry Pi/fixed nodes: no Doze issue — documented as preferred       |
|                |    always-on deployment method.                                               |
| **Owner**      | Android Engineer                                                              |
| **Review Date**| W2 start                                                                      |

---

### RISK-13: Mesh Network Partition During Offline Operation

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-13                                                                        |
| **Category**   | Technical — Mesh Reliability                                                   |
| **Description**| In a field deployment with Meshtastic LoRa mesh, terrain features (hills,      |
|                | forests), interference, or node failures can partition the mesh. A             |
|                | partition means detection events from isolated nodes never reach the gateway   |
|                | node or C2, creating unmonitored zones that appear monitored on the dashboard. |
| **Probability**| M                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation**| 1. Meshtastic has built-in mesh routing and re-routing — inherently resilient. |
|                | 2. C2 dashboard shows node last_seen_at — nodes not heard from in >5min        |
|                |    highlighted as "potentially partitioned" in orange on map.                 |
|                | 3. ROUTER nodes (Meshtastic role) deployed on high ground for max range.       |
|                | 4. Multi-hop: Meshtastic supports 7-hop routing — single node failure won't    |
|                |    isolate unless a chain breaks.                                              |
|                | 5. Local storage (FR-12) ensures no events lost during partition.             |
| **Owner**      | Nicolae Fratila / Field Deployment Lead                                       |
| **Review Date**| W2 mesh testing                                                               |

---

### RISK-14: Military Interoperability Certification Timeline

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-14                                                                        |
| **Category**   | Organizational — Military Integration                                           |
| **Description**| FreeTAKServer COT integration (FR-18) enables ATAK interoperability. However,  |
|                | for Romanian military and NATO partner acceptance, the system would need        |
|                | security certification under MIL-STD-882E or NATO STANAG 4671. This process   |
|                | takes 12-24 months and costs €200k-500k. Without it, military units cannot    |
|                | officially rely on APEX-SENTINEL data, limiting it to civilian volunteer use.  |
| **Probability**| H (the certification delay is near-certain)                                   |
| **Impact**     | M (civilian use case unaffected)                                               |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Accept: W1-W4 targets civilian early warning, not military integration.      |
|                | 2. ATAK integration (FR-18) enables unofficial use by military volunteers      |
|                |    (personal ATAK installs) without requiring formal certification.            |
|                | 3. Pursue NATO partnership via DIANA (Defence Innovation Accelerator for the   |
|                |    North Atlantic) program for fast-track certification pathway.               |
|                | 4. Document APEX-SENTINEL as "decision support aid" not "tactical intelligence |
|                |    system" to reduce certification requirements.                              |
| **Owner**      | Nicolae Fratila / Defense Advisor                                             |
| **Review Date**| W4 complete                                                                   |

---

### RISK-15: Competitor INDIGO AirGuard Goes Commercial at Low Price

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-15                                                                        |
| **Category**   | Commercial — Competition                                                        |
| **Description**| INDIGO AirGuard (the system that validated the core technical approach) is      |
|                | transitioning to a commercial product. If they launch at a price point          |
|                | accessible to NGOs and civil defense organizations (below €50/month/deployment),|
|                | the value proposition of building APEX-SENTINEL as a free alternative is       |
|                | significantly weakened.                                                        |
| **Probability**| M                                                                              |
| **Impact**     | M                                                                              |
| **Score**      | Medium (4)                                                                     |
| **Mitigation** | 1. APEX-SENTINEL competitive advantages: open-source, no data leaving Romania, |
|                |    GDPR compliant by architecture, works on any Android smartphone (zero        |
|                |    hardware cost), open ATAK integration.                                      |
|                | 2. INDIGO target market is likely defense/enterprise — APEX-SENTINEL targets   |
|                |    volunteers, NGOs, municipalities with zero budget.                          |
|                | 3. Open-source ensures survival regardless of commercial competition.          |
|                | 4. Monitor INDIGO pricing quarterly.                                           |
| **Owner**      | Nicolae Fratila                                                               |
| **Review Date**| Quarterly                                                                     |

---

### RISK-16: Funding / Grant Risk — No Runway Beyond W2

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-16                                                                        |
| **Category**   | Financial                                                                      |
| **Description**| APEX-SENTINEL is currently self-funded. W1-W2 development is achievable with   |
|                | minimal cost (Supabase Pro ~€25/month, developer time). W3-W4 (C2 dashboard,   |
|                | field deployment, SDR sensors, security certification) requires €50k-200k.    |
|                | Without grant funding or strategic partnership, W3+ may stall.                |
| **Probability**| M                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Apply to NATO DIANA (Defence Innovation Accelerator) — up to €1M grant.    |
|                | 2. Apply to EU Horizon Europe Cluster 3 (Civil Security) program.              |
|                | 3. Romanian Ministry of Internal Affairs (MAI) partnership for pilot funding.  |
|                | 4. Open-source community: once W1 released publicly, seek contributions from   |
|                |    Ukrainian tech diaspora and NATO partner open-source communities.           |
|                | 5. Minimum viable continuation: W1+W2 alone (single-node detection + mesh)    |
|                |    provides value without W3+ investment.                                     |
| **Owner**      | Nicolae Fratila                                                               |
| **Review Date**| Before W3 init                                                                |

---

### RISK-17: Acoustic Model Performance Degradation in Cold/Humid Conditions

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-17                                                                        |
| **Category**   | Technical — Environmental                                                       |
| **Description**| Smartphone microphones have documented performance degradation in temperatures  |
|                | below -10°C (Romanian winters, particularly in Dobrogea and Moldovan border     |
|                | regions). Electret microphone sensitivity drops ~3dB/10°C at extreme cold.    |
|                | Wind noise above 30 km/h overwhelms the acoustic sensor at all temperatures.  |
| **Probability**| M (seasonal — Romanian winter deployments)                                    |
| **Impact**     | M                                                                              |
| **Score**      | Medium (4)                                                                     |
| **Mitigation** | 1. Calibration routine (FR-06) compensates for ambient noise floor changes.    |
|                | 2. Wind noise detection: if spectral energy above 6kHz exceeds threshold,       |
|                |    disable acoustic detection and alert user ("Wind noise — acoustic offline"). |
|                | 3. For fixed nodes: outdoor microphone enclosures with wind baffle.            |
|                | 4. Document environmental limits in deployment guide: optimal 0-40°C,          |
|                |    wind < 25 km/h.                                                            |
| **Owner**      | ML Engineer / Field Team                                                      |
| **Review Date**| W2 field testing                                                              |

---

### RISK-18: Supabase RLS Misconfiguration Exposes Detection Data

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-18                                                                        |
| **Category**   | Security — Data Exposure                                                        |
| **Description**| Supabase Row Level Security policies must allow: anon key → INSERT only on     |
|                | detection_events; authenticated users → SELECT on their own node's events;    |
|                | C2 service role → SELECT all. A misconfiguration in RLS policy (e.g., SELECT  |
|                | allowed for anon) would expose all detection events publicly, potentially       |
|                | revealing sensor node positions to adversaries.                                |
| **Probability**| M                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. RLS policies reviewed in migration 0005_rls_policies.sql (code review gate).|
|                | 2. Automated RLS policy test: CI job attempts SELECT via anon key and asserts  |
|                |    HTTP 403.                                                                   |
|                | 3. Supabase advisors (security lint) run in CI.                               |
|                | 4. Detection events store hashed node_id, not raw GPS position of the device   |
|                |    (node position ≠ threat position).                                         |
| **Owner**      | Nicolae Fratila / Backend Engineer                                            |
| **Review Date**| W1 complete (before any public node enrollment)                               |

---

### RISK-19: App Store Rejection — Audio Monitoring Category

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-19                                                                        |
| **Category**   | Distribution — Platform Policy                                                  |
| **Description**| Google Play and Apple App Store have strict policies on apps that monitor       |
|                | audio in the background. Google Play Developer Policy requires prominent        |
|                | disclosure for microphone use. Apple App Store Review Guideline 5.1.2          |
|                | requires explicit consent for data collection. Both may reject or remove the   |
|                | app if the security/defense use case is not clearly documented.                |
| **Probability**| M                                                                              |
| **Impact**     | H (loss of distribution channel)                                               |
| **Score**      | High (6)                                                                       |
| **Mitigation** | 1. Detailed app descriptions emphasizing public safety, not "surveillance".    |
|                | 2. FR-24 (no audio storage/transmission) is the primary compliance mechanism.  |
|                | 3. Pre-submission review with Google Play policy team (Partner Track if        |
|                |    available through NATO DIANA program).                                      |
|                | 4. Apple: Enterprise Distribution as fallback for iOS if App Store rejected.   |
|                | 5. Open APK sideload as fallback for Android (documented in deployment guide). |
| **Owner**      | Nicolae Fratila                                                               |
| **Review Date**| Before app store submission (end of W2)                                       |

---

### RISK-20: YAMNet Model Not Generalizing to Eastern European Drone Types

| Field          | Value                                                                          |
|----------------|--------------------------------------------------------------------------------|
| **ID**         | RISK-20                                                                        |
| **Category**   | Technical — ML Generalization                                                   |
| **Description**| The YAMNet fine-tuning baseline (INDIGO AirGuard) was validated primarily on   |
|                | DJI-class consumer drones and generic FPV frames. Romanian/Ukrainian conflict   |
|                | theater uses modified FPV drones, home-built frames with varied motor           |
|                | combinations, and Shahed-136 units modified by Russian forces to reduce         |
|                | acoustic signature. The model may not generalize to these specific variants.   |
| **Probability**| H                                                                              |
| **Impact**     | H                                                                              |
| **Score**      | Critical (9)                                                                   |
| **Mitigation** | 1. W2: collect Romanian/Ukrainian drone acoustic dataset (partner with ISAC.ro  |
|                |    and Ukrainian open-data initiatives).                                       |
|                | 2. Transfer learning fine-tuning on Eastern European drone sample set.          |
|                | 3. Active learning pipeline: detections with uncertainty flagged for human      |
|                |    review → confirmed ground truth → model retraining cycle.                  |
|                | 4. Model versioning in LKGC: can rollback if fine-tuned model underperforms.   |
|                | 5. Ensemble: combine YAMNet with separate CNN trained on Romanian data.         |
| **Owner**      | ML Engineer (W2)                                                              |
| **Review Date**| W2 ML milestone                                                               |

---

## Risk Summary Dashboard

| Risk ID  | Category              | Probability | Impact | Score    | Owner                   | Review   |
|----------|-----------------------|-------------|--------|----------|-------------------------|----------|
| RISK-01  | ML Accuracy           | H           | H      | Critical | Nicolae / ML Eng        | W1 end   |
| RISK-02  | iOS Limitation        | H           | M      | High     | Nicolae                 | W2 start |
| RISK-03  | GPS Time Sync         | M           | H      | High     | Nicolae / Firmware      | W3       |
| RISK-04  | Node Density          | H           | M      | High     | Nicolae / Ops           | W2 end   |
| RISK-05  | Battery Drain         | H           | M      | High     | Android Eng             | W1 perf  |
| RISK-06  | Wiretapping Law       | M           | H      | High     | Nicolae / Legal         | Pre-beta |
| RISK-07  | WiFi Scanning Law     | L           | H      | Medium   | Nicolae / Legal         | W3 start |
| RISK-08  | Adversary Jamming     | M           | H      | High     | Nicolae / Security      | W3 end   |
| RISK-09  | GDPR Challenge        | L           | H      | Medium   | Nicolae / DPO           | Pre-launch|
| RISK-10  | Supabase Cold Start   | M           | L      | Low      | Nicolae                 | W1 end   |
| RISK-11  | Model Size OOM        | M           | M      | Medium   | Android Eng             | W1 device|
| RISK-12  | Android Doze          | H           | H      | Critical | Android Eng             | W2 start |
| RISK-13  | Mesh Partition        | M           | H      | High     | Nicolae / Field         | W2 mesh  |
| RISK-14  | Military Cert         | H           | M      | High     | Nicolae / Defense       | W4 end   |
| RISK-15  | INDIGO Competition    | M           | M      | Medium   | Nicolae                 | Quarterly|
| RISK-16  | Funding Gap           | M           | H      | High     | Nicolae                 | W3 init  |
| RISK-17  | Cold Weather Perf     | M           | M      | Medium   | ML / Field              | W2 field |
| RISK-18  | RLS Misconfiguration  | M           | H      | High     | Nicolae / Backend       | W1 end   |
| RISK-19  | App Store Rejection   | M           | H      | High     | Nicolae                 | W2 end   |
| RISK-20  | Model Generalization  | H           | H      | Critical | ML Eng (W2)             | W2 ML    |

**Critical Risks (immediate mitigation required):** RISK-01, RISK-12, RISK-20

---

*Document owner: Nicolae Fratila | Last updated: 2026-03-24 | Version: 1.0*
*Review all Critical and High risks at every wave:checkpoint gate.*
