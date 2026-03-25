# APEX-SENTINEL Hardware Integration Analysis
## Source: INDIGO AirGuard Meeting 2026-03-24 (George + Nico + Cat)
## Cross-referenced: Cat's PDFs, AI in Drones paper, Ukrainian Catalog

---

## THE STACK AS GEORGE DESCRIBED IT

Three layers. Each feeds the next. APEX-SENTINEL software is the spine.

```
LAYER 1: DETECTION (Visual + Acoustic + RF)
    ↓ bearing + track + confidence
LAYER 2: JAMMING (600MHz–1GHz multiband)
    ↓ impact zone 50-70% accuracy
LAYER 3: PHYSICAL INTERCEPT (SkyNet net-gun)
```

---

## LAYER 1 — DETECTION HARDWARE

### Radar Units (Cat has these at Dahua)
- **Type:** Small civil radar, sub-tablet size, road-traffic-grade
- **Detection range:** Up to 450m
- **Current use:** Road traffic monitoring
- **Critical finding:** 30-degree angle change converts road-traffic mode → drone detection
  - This is not an upgrade. No firmware change. Just mount angle.
  - George tested this same day as the meeting (2026-03-24)
- **Output:** Target bearing, elevation, range — direct serial/IP to PTZ
- **Cost category:** Civil/commercial, no export control issues

### PTZ Cameras (Cat's Dahua hardware)
- **Brand:** Dahua (confirmed multiple times in meeting)
- **Slew response:** <1ms hardware response (direct radar→PTZ link, no software in loop)
- **Problem George identified:** Even at <1ms hardware, 6–8ms total loop (radar acquire → PTZ slew → frame capture) means the drone has already passed the field of view
- **Why this matters for APEX-SENTINEL:**
  - The PTZ can't react AFTER detection — it needs PREDICTIVE bearing
  - Our MonteCarloPropagator must output target bearing 6–8ms AHEAD of current position
  - Prediction horizon = drone speed × 8ms = for Shahed-136 @ 185km/h → 0.41m lookahead
  - For FPV at 150km/h → 0.33m lookahead
  - This is achievable with our EKF track — vLat/vLon state is exactly this

### Integration Point: APEX-SENTINEL → PTZ Slave
```
Current (broken) loop:
  Drone passes → radar detects → PTZ slews → drone gone

Required loop:
  EKF track → MonteCarloPropagator → predicted bearing t+8ms
  → PTZ pre-positions → radar confirms → PTZ captures
```

**New FR:** `PtzSlaveOutput` — publish predicted bearing/elevation at 100Hz to PTZ serial/ONVIF

### Gimbal
- George mentions "Gimere" (gimbals) as separate from PTZ
- Stabilized camera platforms — used for observation at distance
- Integration: same ONVIF/serial interface as PTZ
- Can be mounted on vehicles or fixed posts

### Oculus
- Referenced as "Oculus" — likely Oculus MultiSonar or SonaSafe Oculus maritime sonar
- OR FlirOculus (thermal panoramic camera system used in C-UAS)
- Context: "equipment dedicated" alongside radars and PTZ
- Most likely: **Dahua Oculus = thermal panoramic sensor** — 360° thermal, no blind spots
- Integration: feeds additional bearing data into MultiNodeFusion

---

## LAYER 2 — JAMMING

### What George Actually Said
"Jamming frequencies from 600MHz to 1GHz, then up from 600kHz. Can do fluctuation, multiband."

"We did TCMs in Afghanistan — all multiband, from mega to giga, jammed everything. They didn't work. None of the equipment we used worked. We tested, we could send... Why doesn't it work? The equipment overheats, no active scanning, just passive — always drops out of range. Hardware limitations AND software limitations."

### Jamming Band Analysis vs Threat Inventory

| Threat | RF Protocol | Freq | Jammed by 600MHz-1GHz? |
|--------|-------------|------|------------------------|
| Russian FPV (Foxeer TRX1003 ELRS) | ExpressLRS FHSS | 868/915MHz | ✅ YES — center of band |
| Shahed-136 INS+GPS | GPS L1 | 1575.42MHz | ❌ NO — above band |
| Shahed-136 Satnav GLONASS | L1 | 1602MHz | ❌ NO |
| DJI FPV Link | OcuSync 2.4/5.8GHz | 2.4/5.8GHz | ❌ NO |
| Lancet ELRS 900MHz | ExpressLRS | 868/915MHz | ✅ YES |

**Critical insight:** 600MHz–1GHz jamming WORKS on FPV drones (ELRS 900MHz) but NOT on GPS-guided loitering munitions (Shahed-136 uses inertial+GPS, GPS is at 1.5GHz).

**George's Afghanistan experience = GPS jamming multiband. That's why it failed — GPS is 1.5GHz, not 900MHz.**

For APEX-SENTINEL's threat profile:
- FPV drones: 900MHz jamming effective → jams control link
- Shahed-136: GPS jam at 1575MHz needed (different band, different hardware)
- Shahed-238 (jet): INS-only at terminal phase, jamming ineffective after RF cutoff

### APEX-SENTINEL Role in Jamming Layer
- RF module detects ELRS 900MHz bursts → confirms FPV drone present
- SentinelPipeline event: `drone_class: 'fpv'` → activates 900MHz jammer
- SentinelPipeline event: `drone_class: 'shahed-136'` → activates GPS jammer (1575MHz) — different hardware
- **This is a NEW output channel from SentinelPipeline: `JammerActivation` event**

---

## LAYER 3 — PHYSICAL INTERCEPT (SKYNET)

### What George Said
"SkyNet is very good for physical protection. They created a cannon that launches a net. Used for vessel protection. British company. Ukrainians tested it — super efficient."

"SkyNet can be integrated into the application. The application provides late warning metadata from Layer 1, Layer 2 metadata, calculates trajectory and impact zone — even if the drone is steerable — you already have an impact zone at 50-70%. SkyNet is pre-positioned. First response point already has at least one SkyNet line activated."

### SkyNet Technical Context
- **Company:** SkyNet (UK) — likely **SkyNet C-UAS** or could be referencing **Harp Defence** net systems
- **Mechanism:** Pneumatic/explosive net projector — fires interceptor net at incoming drone
- **Effective range:** ~50m–200m (net systems typically short range)
- **Ukraine deployment:** Confirmed effective against FPV drones and small loitering munitions

### Integration Point: MonteCarloPropagator → SkyNet Pre-positioning

```typescript
// Current MonteCarloPropagator output:
{
  impactLat: number,
  impactLon: number,
  radiusM: number,        // 95th percentile
  timeToImpactS: number,
  confidence: number
}

// Required addition for SkyNet:
{
  ...existing,
  skynetActivationBearing: number,  // bearing from nearest SkyNet unit to intercept corridor
  skynetActivationTimeS: number,    // when to fire (timeToImpact - net_flight_time)
  skynetUnitId: string              // which SkyNet unit to activate
}
```

**New FR:** `PhysicalInterceptCoordinator` — maps impact prediction to nearest SkyNet unit,
calculates fire timing, emits activation command via BRAVE1 or dedicated serial channel.

---

## 3-POINT GEOLOCATION (George's explicit requirement)

### What George Said
"We need the three geolocation points: phone location, ground point locations, and via the matchstick/telegraph principle, the drone location."

### What This Actually Means
The "matchstick/telegraph principle" = classic **triangulation by bearing intersection**:
- Node A (phone at position A) hears drone at bearing θ_A
- Node B (ground node at position B) hears drone at bearing θ_B
- Node C (ground node at position C) hears drone at bearing θ_C
- Intersection of three bearing lines = drone position

**This is different from our TdoaSolver (which uses time-difference-of-arrival).**

George is describing **bearing-based triangulation** — simpler, works with single microphones (no mic array needed), but less accurate than TDOA.

The phone is a **mobile node** — citizen reports bearing from phone mic + compass heading.
The ground nodes are **fixed nodes** — our existing RPi4/Jetson EdgeDeployer units.

### APEX-SENTINEL Impact
- TdoaSolver (W1) handles time-difference approach — requires 3+ synchronized nodes
- **New requirement: BearingTriangulator** — accepts bearing + observer position, solves via least-squares intersection
- Phone nodes = citizen sensors with GPS + compass + mic — need a mobile app interface
- MultiNodeFusion must accept BOTH TDOA and bearing inputs, fuse them

---

## SMART CITY DISPATCH — FORWARD OBSERVATION POST CONVERSION

### What George Said
"Smart city dispatch centers being built in different cities right now. Civilian, no military designation. Can be converted in any moment into forward observation posts / celule de raspuns."

"Forward observation post — they can be transformed into response cells."

### Architecture Implication
These dispatch centers already have:
- Fiber connectivity
- 24/7 staffing
- CCTV/camera feeds
- Alarm systems

APEX-SENTINEL integration target = a **Dispatch Center Client** that:
- Receives BRAVE1 formatted alerts from our pipeline
- Displays track + impact zone on existing screens
- Can send activation commands to field hardware (jammers, SkyNet)
- Dual-mode: civilian monitoring (shows heatmap) ↔ military mode (shows BRAVE1 + activation)

**This is the W7 demo dashboard George needs to see at the Radisson meeting.**

---

## PHONE AS MOBILE NODE

### What George Said
"Phone calibration for pre-set zones. Personnel can be predisposed for preventive installation and testing, evaluation, then for emergency situations. Presentation and informing of the population for installation and offering of services."

### What This Means for Architecture
The phone is a **first-responder acoustic node**:
1. Citizen hears drone → opens app → records 3 seconds
2. App runs on-device YAMNet (TFLite — this is what Cat/Manus AI recommended)
3. If classification confidence > 0.7: auto-reports bearing (compass) + GPS + audio clip
4. Report goes to SentinelPipeline via NATS
5. MultiNodeFusion adds it to the track

**New component: MobileNodeReporter** — React Native / PWA
- TFLite YAMNet inference on device
- Compass + GPS reading
- Push to NATS JetStream
- Zone pre-configuration (calibration per area)

This is a FULL additional client application — W8 scope.

---

## HARDWARE LATENCY BUDGET (COMPLETE)

| Stage | Latency | Cumulative | Notes |
|-------|---------|------------|-------|
| Acoustic detection (VAD+YAMNet) | <50ms | 50ms | EdgeDeployer target |
| EKF state update | <5ms | 55ms | Singer Q, W5 |
| MultiNodeFusion | <2ms | 57ms | IDW, W6 |
| MonteCarloPropagator | <50ms | 107ms | 1000 samples, W6 |
| PtzSlaveOutput bearing publish | <1ms | 108ms | NEW |
| PTZ hardware slew | 6-8ms | 115ms | hardware limit |
| **Total: detection → PTZ positioned** | **~115ms** | | |
| Jamming activation | +10ms | 125ms | SentinelPipeline → jammer |
| SkyNet fire command | +timeToImpact-netFlight | variable | PhysicalInterceptCoordinator |

**At 185km/h (Shahed-136), 115ms = 5.95m of drone travel.**
For a 50m radius SkyNet net, this latency budget is acceptable.
For PTZ visual capture, 115ms total gives the camera a 5.95m window at 450m range = ~0.76° arc — achievable.

---

## W7 NEW FUNCTIONAL REQUIREMENTS (from meeting hardware analysis)

| FR | Title | Layer | Source |
|----|-------|-------|--------|
| FR-W7-01 | DatasetPipeline 16kHz migration | Data | INDIGO docs |
| FR-W7-02 | AcousticProfileLibrary expansion (Gerbera/131/238) | Acoustic | Ukrainian catalog |
| FR-W7-03 | TerminalPhaseDetector | Detection | AI paper + Cat |
| FR-W7-04 | ELRS 900MHz RF fingerprint | RF | AI paper |
| FR-W7-05 | BearingTriangulator | Fusion | Meeting |
| FR-W7-06 | PtzSlaveOutput (ONVIF/serial bearing publisher) | Output | Meeting |
| FR-W7-07 | JammerActivation event channel | Output | Meeting |
| FR-W7-08 | PhysicalInterceptCoordinator (SkyNet) | Output | Meeting |
| FR-W7-09 | TdoaSolver → SentinelPipeline injection | Fix | FDRP P0 |
| FR-W7-10 | Demo dashboard (dispatch center UI) | UI | Meeting |
