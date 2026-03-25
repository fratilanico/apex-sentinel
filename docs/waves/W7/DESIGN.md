# APEX-SENTINEL — DESIGN.md
## Wave 7: Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
### Wave 7 | Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. DESIGN MANDATE

W7 closes the gap between acoustic detection and physical response. W1–W6 delivered a complete classification, fusion, EKF tracking, Monte Carlo propagation, and ATAK CoT pipeline. W7 adds the hardware effector layer: PTZ camera slaving, RF jamming activation, SkyNet net-gun pre-positioning, and terminal phase recognition. Simultaneously, W7 rectifies the critical data breach identified by the INDIGO team: our 22050Hz pipeline is incompatible with all INDIGO training data (16kHz). Every acoustic model trained on their corpus must be retrained or the spectrograms are misaligned.

The three design objectives in priority order:

1. **Data pipeline rectification** — 16kHz migration before any new model training begins. Running training on misaligned sample rates produces a model that cannot generalize across nodes.
2. **Terminal phase detection** — The moment a Shahed or FPV transitions from cruise to terminal dive, operators have 4–12 seconds to act. The FSM must fire within 800ms of state transition.
3. **Hardware effector integration** — PTZ bearing at 100Hz, jammer activation < 200ms, SkyNet pre-position < 500ms from terminal phase confirmed.

---

## 2. CRITICAL DATA BREACH: 22050Hz → 16kHz MIGRATION

### 2.1 The Problem

All INDIGO acoustic datasets (BRAVE1 field recordings, Wild Hornets 3000+ clips, Ukrainian MoD training corpus) are captured at **16000 Hz**. Our W6 pipeline ingests at **22050 Hz**. When we extract mel spectrograms from 22050Hz audio and compare against 16kHz-trained YAMNet embeddings, the frequency bin boundaries do not align:

```
16kHz pipeline:
  Nyquist = 8000 Hz
  n_mels = 128 bins across 80–8000 Hz
  Bin width at 100 Hz = 0.52 Hz/bin (log scale)

22050Hz pipeline (W6, WRONG):
  Nyquist = 11025 Hz
  n_mels = 128 bins across 80–8000 Hz
  Bin width at 100 Hz = 0.52 Hz/bin (same — BUT)
  YAMNet pretrained waveform expects 16kHz input
  Internal resampling in YAMNet: 22050 → 16000 done at embedding stage
  Result: timing artifacts, spectral leakage in 6000–8000 Hz band
  Shahed harmonic at 7200 Hz (9th harmonic of 800 RPM): smeared ±40 Hz
```

The consequence: FalsePositiveGuard suppression threshold is tuned to W6 training, which is subtly wrong. The ELRS 900MHz FPV signature at 433–915 MHz downconverted acoustic proxy is particularly sensitive to this.

### 2.2 Migration Strategy

```
Phase 1 — Hardware capture change (FR-W7-01):
  USB mic driver: change AudioCapture.SAMPLE_RATE = 22050 → 16000
  Ring buffer: 2s × 16000 = 32000 samples (was 44100)
  Hop size: 0.5s × 16000 = 8000 samples (was 11025)

Phase 2 — Spectrogram parameter update:
  n_fft: 512 (was 1024) — maintain ~32ms window at 16kHz
  hop_length: 160 (was 220) — maintain 10ms frame shift
  n_mels: 128 (unchanged)
  fmin: 80 Hz (unchanged)
  fmax: 7800 Hz (was 8000, safety margin below Nyquist at 8000Hz)

Phase 3 — YAMNet direct compatibility:
  YAMNet v1 input spec: 16kHz, mono, float32, frames of 0.96s
  Our 2s window at 16kHz: split into 2× 0.96s frames with 0.08s overlap
  Embedding output: 1024-dim vector per frame (unchanged)
  Fine-tune head: retrain on INDIGO 16kHz corpus

Phase 4 — Archive W6 models, retrain:
  W6 model artifacts: models/yamnet-finetuned-w6-22050.tflite → archive/
  New target: models/yamnet-finetuned-w7-16000.tflite
  Training dataset: BRAVE1 + Wild Hornets + INDIGO corpus, all 16kHz
```

### 2.3 Backward Compatibility

Existing field-deployed RPi nodes running W6 firmware will broadcast 22050Hz streams. The W7 pipeline must accept both rates during the migration window:

```typescript
// DatasetPipeline.ts — dual-rate ingestion (migration period only)
const normalize = (buf: Buffer, srcRate: number): Float32Array => {
  if (srcRate === 16000) return new Float32Array(buf.buffer);
  // Polyphase resample: 22050 → 16000 using 147:160 ratio
  return resample(new Float32Array(buf.buffer), srcRate, 16000);
};
```

The resample shim adds ~2ms on RPi 4 (ARM Cortex-A72). Acceptable during transition. Remove once all nodes are on W7 firmware.

---

## 3. NEW ACOUSTIC PROFILES — THREAT EXPANSION

### 3.1 Gerbera (KUB-BLA loitering munition)

```
Engine: Internal combustion piston, ~30cc, 2-stroke
RPM cruise: 10000–13000 RPM
2-stroke cycle: power stroke every revolution
f0 = RPM / 60 = 167–217 Hz
Dominant harmonics: 334–434 Hz (2f0), 501–651 Hz (3f0)
Wing flutter: 80–120 Hz (low-aspect pusher configuration)
Distinguishing feature: higher f0 than Shahed, cleaner harmonic ladder
Detection distance: 1–3 km (smaller airframe, lower SPL than Shahed)
```

Design implication: `fmin` stays at 80 Hz (wing flutter), `fmax` at 7800 Hz captures 6–7 harmonics.

### 3.2 Shahed-131 (smaller variant)

```
Engine: Mado MD-280, ~28cc, 4-stroke (smaller than Shahed-136 MD-550)
RPM cruise: 9000–11000 RPM
f0 = RPM / 120 = 75–92 Hz
Vs Shahed-136: higher f0, shorter range (range ~900km vs 2500km)
Distinguishing feature: harmonic spacing tighter, duration shorter before terminal
Mel spectrogram overlap with Shahed-136: ~40% — requires temporal context window
```

### 3.3 Shahed-238 — Jet Engine Profile (CRITICAL)

The Shahed-238 replaces the Mado piston with a **microturbojet** (probable: TJ-100 derivative or Chinese equivalent):

```
Turbine frequency analysis:
  Compressor blades: typically 14–18 (first stage)
  Turbine RPM: 65000–130000 RPM
  Blade pass frequency (BPF): RPM × blades / 60
  BPF = 100000 × 16 / 60 = 26667 Hz → above our capture range
  BUT: turbine whine sub-harmonics propagate at:
    Shaft frequency: 65000/60 = 1083 Hz
    2nd harmonic: 2166 Hz
    3rd harmonic: 3250 Hz
  Combustion noise: broadband 3000–8000 Hz (covers turbine band)
  Jet exhaust: 200–2000 Hz Strouhal scaling

Design constraint:
  fmax MUST be 7800 Hz (not 4000 Hz) to capture turbine shaft harmonics
  n_mels = 128 across 80–7800 Hz gives adequate resolution at 3–8 kHz
  Spectral centroid: 2500–4500 Hz (vs Shahed-136 at 150–400 Hz)
  This is the primary discriminant between -136 (piston) and -238 (jet)
```

**Classification boundary**: Shahed-238 at 2500–4500 Hz centroid will NOT be confused with Shahed-136 at 150–400 Hz. They are acoustically orthogonal. A two-tower classifier (piston | jet) is preferable to a flat softmax over all classes.

---

## 4. TERMINAL PHASE DETECTOR — FSM DESIGN

### 4.1 State Machine

The TerminalPhaseDetector monitors 4 independent indicator streams and uses a finite state machine with hysteresis to prevent false state transitions:

```
States:
  CRUISE      — nominal flight, all indicators nominal
  ALERT       — ≥1 indicator triggered, monitoring intensified
  TERMINAL    — ≥3 indicators triggered simultaneously, fire command eligible
  IMPACT      — post-terminal confirmation (track loss + acoustic burst)

Transition rules:
  CRUISE → ALERT:    any 1 of 4 indicators triggers
  ALERT → CRUISE:    all indicators clear for 3 consecutive seconds (hysteresis)
  ALERT → TERMINAL:  ≥3 of 4 indicators triggered within 5s window
  TERMINAL → IMPACT: track lost OR acoustic burst (impact signature)
  TERMINAL → ALERT:  indicators drop below threshold (false alarm path)
```

### 4.2 The Four Indicators

```
Indicator 1: SPEED_INCREASE
  Source: EKF velocity vector magnitude (W5 KalmanTracker)
  Cruise speed: Shahed-136 = 185–195 km/h (51–54 m/s)
  Terminal dive: +20–40% speed increase due to gravity assist
  Threshold: v_ekf > 1.25 × v_cruise_rolling_avg
  Rolling avg window: 30 seconds (EKF updates at 1Hz)
  Confidence: high (EKF velocity is well-conditioned after 10+ updates)

Indicator 2: COURSE_CORRECTION
  Source: EKF heading rate of change
  Cruise: heading change < 2°/s (straight approach)
  Terminal: abrupt heading snap to target bearing, then lock
  Threshold: |dΨ/dt| > 8°/s for > 2s, then |dΨ/dt| < 1°/s (lock)
  Pattern: high angular rate → sudden lock → COURSE_CORRECTION=true
  Implementation: track heading history 10s window, detect snap-lock pattern

Indicator 3: ALTITUDE_DESCENT
  Source: radar/barometric altitude feed OR EKF z-axis (if 3D tracking active)
  Cruise: Shahed-136 typically 100–500m AGL
  Terminal: steep dive, -50m/s vertical rate possible
  Threshold: dz/dt < -15 m/s sustained for > 1.5s
  Fallback: if no altitude data, use acoustic amplitude increase rate
    dSPL/dt > +3 dB/s (approach proxy, lower confidence)

Indicator 4: RF_SILENCE (ELRS 900MHz)
  Source: ELRS 900MHz monitor module (FR-W7-04)
  FPV drones: ELRS ExpressLRS 900MHz link is active during entire flight
  Terminal behavior: controller operator cuts link 2–10s before impact
    (prevents radio triangulation of operator, FPV goggles useless at impact)
  Shahed-136: no RF link — this indicator is N/A for Shahed, only FPV
  Threshold: ELRS RSSI drops > 20 dB in < 3s, link declared lost
  ELRS packet rate: 50–500 Hz — loss detectable within 100ms
```

### 4.3 Indicator Weights and Drone-Class Mapping

```
                    Shahed-136  Shahed-238  Gerbera  FPV/Lancet
SPEED_INCREASE         HIGH        HIGH      HIGH      MEDIUM
COURSE_CORRECTION      HIGH        HIGH      HIGH      HIGH
ALTITUDE_DESCENT       HIGH        HIGH      MEDIUM    HIGH
RF_SILENCE             N/A         N/A       N/A       CRITICAL

FPV terminal: RF_SILENCE alone triggers ALERT, needs 1 more for TERMINAL
Shahed terminal: RF_SILENCE=N/A, needs all 3 remaining indicators
Gerbera terminal: SPEED_INCREASE + COURSE_CORRECTION sufficient (ALTITUDE often partial)
```

### 4.4 Timing Budget — Terminal Phase to Fire Command

```
T+0ms    — EKF update triggers TerminalPhaseDetector.evaluate()
T+50ms   — Indicator 1,2,3 computed from EKF state vector
T+100ms  — RF_SILENCE indicator polled from ELRS module (FR-W7-04)
T+200ms  — FSM state evaluated, TERMINAL state written to NATS
T+350ms  — PtzSlaveOutput receives TERMINAL bearing, begins 100Hz PTZ updates
T+450ms  — JammerActivation receives event, computes drone class → jammer frequency
T+600ms  — JammerActivation sends activation command to jammer hardware
T+800ms  — PhysicalInterceptCoordinator receives TERMINAL event
T+1200ms — SkyNet net-gun pre-position command issued (motor slew begins)
T+2500ms — SkyNet net-gun aimed, fire-ready (motor slew complete)
T+3000ms — Fire command authorized (human operator confirm or auto-fire if policy=AUTO)
```

---

## 5. BEARING TRIANGULATION — GEORGE'S MATCHSTICK PRINCIPLE

### 5.1 Mathematical Foundation

The "matchstick principle": each mobile node has a bearing to the target but no range. Two bearing lines from two nodes define an intersection point (the target). Three or more nodes provide an overdetermined system, solvable via least squares.

```
Node i at position (xi, yi) reports bearing θi to target at (xt, yt):

tan(θi) = (yt - yi) / (xt - xi)

This is the "matchstick": a line of infinite length from node i at angle θi.

For N nodes:
  Construct bearing lines as unit direction vectors:
    di = [cos(θi), sin(θi)]

  Each bearing line: P(t) = [xi, yi] + t × di

  Closest point of approach between two lines:
    Line 1: P1 + t1 × d1
    Line 2: P2 + t2 × d2
    t1 = ((P2-P1) × d2) · (d1 × d2) / |d1 × d2|²

  Least-squares intersection for N ≥ 2:
    Build matrix A and vector b:
    For each node i: row of A = [sin(θi), -cos(θi)]
    b[i] = xi × sin(θi) - yi × cos(θi)
    Solution: [xt, yt] = (AᵀA)⁻¹ Aᵀb

Bearing uncertainty:
  GPS accuracy: ±5m CEP (Android) → ±0.01° at 30km baseline
  Compass accuracy: ±2° (phone magnetometer, uncalibrated)
  Acoustic bearing: ±5–15° (single mic, binaural estimation)
  Combined 1σ bearing uncertainty: ±7°
  At 1km range: position uncertainty ±120m (1σ)
  At 500m range: ±60m — sufficient for SkyNet 20m engagement radius
```

### 5.2 TdoaSolver vs BearingTriangulator Fusion

W7 operates two independent position estimation paths:

```
Path A — TdoaSolver (existing W5):
  Input: Time Difference of Arrival across fixed acoustic nodes
  Output: position fix (lat/lng) ± 20–50m (dependent on baseline)
  Update rate: ~1 Hz (limited by sound propagation time differences)
  Strength: physical model, not dependent on compass calibration
  Weakness: requires ≥3 fixed nodes with known precise positions

Path B — BearingTriangulator (new W7):
  Input: bearing reports from mobile nodes (phones in field)
  Output: position fix (lat/lng) ± 60–120m (compass-limited)
  Update rate: 0.5–2 Hz (phone GPS + compass polling rate)
  Strength: works with ANY number of mobile nodes, no fixed infrastructure
  Weakness: compass error accumulates, less accurate than TDOA

Fusion strategy:
  If TdoaSolver has ≥3 nodes: use TDOA position as primary, bearing as sanity check
  If TdoaSolver has <3 nodes (node failure): fall back to BearingTriangulator
  If both available: Kalman fusion
    State: [lat, lng, vx, vy]
    TDOA measurement noise: σ = 30m
    Bearing measurement noise: σ = 80m
    Fused 1σ: ~25m (TDOA dominates, bearing constrains)
```

### 5.3 Phone Node Architecture

A field operator runs the APEX-SENTINEL mobile app (or a lightweight Node.js CLI on a ruggedized phone):

```
Mobile node pipeline:
  1. GPS lock (±5m CEP via Android Location API)
  2. Compass heading (magnetometer, calibrated via figure-8 gesture)
  3. Acoustic capture: phone microphone at 16kHz mono
  4. Local inference: TFLite model detects drone presence
  5. If detected: compute acoustic bearing via binaural/mono estimation
     - Single mic: bearing estimated from Doppler shift rate of change
     - Two mics (stereo phone): interaural phase difference → ±15° bearing
  6. Publish BearingReport to NATS: sentinel.bearing.{nodeId}
  7. Pipeline on server: BearingTriangulator.addReport(report) → position fix
```

---

## 6. PTZ SLAVE OUTPUT — DAHUA ONVIF DESIGN

### 6.1 Latency Budget

```
End-to-end PTZ latency budget: 115ms total

  Source:         Contribution    Cumulative
  ──────────────────────────────────────────
  EKF update         1ms            1ms
  Monte Carlo        8ms            9ms
  Lookahead calc     1ms            10ms
  NATS publish       2ms            12ms
  ONVIF XML encode   1ms            13ms
  TCP/LAN RTT       10ms            23ms
  Dahua firmware    50ms            73ms
  PTZ motor slew    42ms           115ms  ← 115ms total

Motor slew: Dahua SD49425XB-HNR
  Pan rate: 400°/s max
  At 42ms slew time: pan distance = 400 × 0.042 = 16.8°
  At 1km range, 16.8° = 293m arc — acceptable for initial framing
  Fine tracking via continuous 100Hz bearing updates

Target latency gate: < 120ms end-to-end (budget has 5ms margin)
```

### 6.2 6–8ms Prediction Lookahead

Given the 115ms total latency, we must command the PTZ to where the target WILL BE, not where it is:

```
Lookahead calculation:
  t_lookahead = t_latency_total = 115ms = 0.115s
  EKF state at time T: position [lat₀, lng₀], velocity [vx, vy]
  Predicted position at T + 0.115s:
    lat_pred = lat₀ + vx × 0.115 / R_earth
    lng_pred = lng₀ + vy × 0.115 / (R_earth × cos(lat₀))
  Convert to PTZ bearing from camera position:
    Δlat = lat_pred - cam_lat
    Δlng = lng_pred - cam_lng
    bearing = atan2(Δlng × cos(lat₀), Δlat) × 180/π (true north)
    elevation = atan2(altitude_target - altitude_cam, ground_distance) × 180/π
```

### 6.3 ONVIF PTZ Absolute Move Command

```xml
<!-- ONVIF ContinuousMove — sent every 10ms (100Hz) -->
<tptz:ContinuousMove>
  <tptz:ProfileToken>MainStream</tptz:ProfileToken>
  <tptz:Velocity>
    <tt:PanTilt x="{pan_velocity}" y="{tilt_velocity}" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
    <tt:Zoom x="0" space="http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace"/>
  </tptz:Velocity>
</tptz:ContinuousMove>

<!-- ONVIF AbsoluteMove — used for initial acquisition -->
<tptz:AbsoluteMove>
  <tptz:ProfileToken>MainStream</tptz:ProfileToken>
  <tptz:Position>
    <tt:PanTilt x="{pan_degrees_normalized}" y="{tilt_degrees_normalized}" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/PositionGenericSpace"/>
  </tptz:Position>
  <tptz:Speed>
    <tt:PanTilt x="1.0" y="1.0"/>
  </tptz:Speed>
</tptz:AbsoluteMove>
```

PtzSlaveOutput maintains a persistent TCP connection to the Dahua camera. ONVIF commands are sent over SOAP/HTTP keep-alive. If connection drops, exponential backoff reconnect with 100ms base delay.

---

## 7. JAMMER ACTIVATION — RF THREAT MATCHING

### 7.1 Frequency Assignment by Drone Class

```
Drone Class         RF Link           Jammer Frequency    Jammer Type
──────────────────────────────────────────────────────────────────────
FPV (ELRS)          900MHz ELRS       902–928 MHz         Directional noise
FPV (legacy)        2.4GHz Crossfire  2400–2483 MHz       Omni noise
Shahed-136          No RF link        GPS 1575.42 MHz     GPS L1 spoof/jam
Shahed-238          No RF link        GPS 1575.42 MHz     GPS L1 spoof/jam
Gerbera             No RF link        GPS 1575.42 MHz     GPS L1 spoof/jam
Lancet-3            GPS guided        GPS 1575.42 MHz     GPS L1 spoof/jam
```

### 7.2 Jammer Activation State Machine

```
Preconditions for activation:
  1. TerminalPhaseDetector state = TERMINAL (≥3 indicators)
  2. Drone class determined by AcousticProfileLibrary (confidence ≥ 0.75)
  3. Operator authorization: policy = AUTO | CONFIRM
     AUTO: activates immediately on TERMINAL
     CONFIRM: sends JAMMER_PENDING to dashboard, waits max 5s for confirm

Activation sequence:
  T+0ms  — JammerActivation receives TERMINAL event
  T+10ms — Drone class → jammer frequency lookup
  T+50ms — Authorization check (AUTO: immediate; CONFIRM: wait)
  T+200ms — JAMMER_ACTIVATE command sent to hardware controller
  T+600ms — Jamming confirmed active (hardware ACK)

Deactivation:
  - Track lost for >10s: deactivate
  - IMPACT confirmed: deactivate after 5s (debris field)
  - Manual override: immediate deactivate
  - Max active duration: 120s (duty cycle protection for hardware)
```

---

## 8. SKYNET NET-GUN INTEGRATION — PHYSICAL INTERCEPT

### 8.1 Pre-positioning Logic

SkyNet is a net-gun intercept system with a motorized turret. The PhysicalInterceptCoordinator uses MonteCarloPropagator 95th percentile trajectory to position the net-gun before the drone arrives.

```
Pre-position trigger: TERMINAL phase confirmed
Timeline input: MonteCarloPropagator.getTrajectory95pct()
  Returns: array of [lat, lng, alt, t_rel] waypoints (95th percentile envelope)

Intercept point selection:
  Filter waypoints to: 15m < alt < 80m (net-gun effective altitude)
  Filter waypoints to: range < 200m (net-gun maximum range)
  Select earliest qualifying waypoint: t_intercept = waypoints[0].t_rel

Pre-position command timing:
  Motor slew time: ~1.5s (turret, +/-180° pan in 3s, 0–90° tilt in 2s)
  Issue pre-position at: t_intercept - 2.5s (margin = 1s)
  If t_intercept < 2.5s: issue immediately (emergency mode)

Fire timing calculation:
  Projectile (net) speed: ~35 m/s
  Time of flight = range / 35
  Fire at: t_intercept - time_of_flight
  Net expansion radius: 3m at 50ms after launch, 5m at 100ms
  Required intercept accuracy: drone wingspan + 1m clearance
    Shahed: 2.5m wingspan → 3.5m accuracy required → net radius 5m → margin 1.5m
```

### 8.2 Safety Interlock

```
SkyNet fire is BLOCKED if:
  - No operator authorization AND policy != FULL_AUTO
  - Intercept altitude < 5m (friendly fire risk)
  - BearingTriangulator uncertainty > 30m (position too uncertain)
  - Any friendly node within 50m of intercept point
  - Hardware fault flag set

Fire command message:
  {
    command: 'FIRE',
    intercept_lat: number,
    intercept_lng: number,
    intercept_alt: number,
    t_fire_unix_ms: number,
    confidence: number,       // Monte Carlo P(intercept)
    authorization: string,    // operator_id or 'AUTO'
    track_id: string
  }
```

---

## 9. SUMMARY — W7 DESIGN DECISIONS LOG

| Decision | Rationale | Alternative Rejected |
|---|---|---|
| 16kHz migration | INDIGO corpus compatibility — non-negotiable | Stay at 22050Hz: incompatible with all partner data |
| Polyphase resample shim | Migration period backward compat | Immediate cutover: breaks deployed nodes |
| Two-tower classifier (piston/jet) | Shahed-238 acoustically orthogonal from -136 | Flat softmax: too many confused classes |
| 4-indicator FSM with hysteresis | Prevent false TERMINAL from single glitch | Pure threshold: 20% false terminal rate in simulation |
| TDOA primary, bearing fallback | TDOA more accurate when ≥3 nodes | Pure bearing: too noisy for SkyNet accuracy requirement |
| 100Hz PTZ update rate | Adequate for ≤200 m/s targets at 500m+ range | 50Hz: trajectory leads PTZ at 500m+ by >1m |
| 115ms total latency budget | Motor slew dominates; optimize elsewhere first | <50ms: not achievable with Dahua firmware constraint |
| Drone class → jammer freq | Different threats need different RF countermeasures | Single broadband jammer: illegal spectrum use, expensive |
| SkyNet fire = human confirm default | Legal requirement, rules of engagement compliance | Full auto: deployment risk |
