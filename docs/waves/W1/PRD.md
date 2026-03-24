# APEX-SENTINEL — PRD.md
## Product Requirements Document
### Wave 1 | Project: APEX-SENTINEL | Version: 1.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. EXECUTIVE SUMMARY

APEX-SENTINEL is a distributed civilian drone detection network that converts ordinary smartphones into an acoustic and RF sensor mesh capable of detecting, triangulating, and tracking FPV combat drones and Shahed-class loitering munitions. The system leverages crowdsourced sensing across thousands of nodes to achieve military-grade threat detection with zero specialized hardware requirements.

**Problem:** FPV combat drones and Shahed-class loitering munitions pose acute threats to civilian populations and infrastructure across the NATO Eastern Flank. Dedicated radar and anti-drone systems cost $50,000–$2M+ per installation and are insufficient in number to protect civilian areas. Early warning can mean the difference between life and death.

**Solution:** A privacy-preserving, distributed detection network using ML-powered acoustic + RF anomaly detection on civilian smartphones, with LoRa/BLE mesh networking for offline resilience and a professional C2 dashboard for military and civil defense operators.

**Validated by:** INDIGO AirGuard project (Romanian MoD initiative) — 87% detection accuracy, ±62m triangulation, 156ms ML latency at 480KB model size.

---

## 2. PROBLEM STATEMENT

### 2.1 The Threat Landscape

Military FPV drones and loitering munitions present a novel asymmetric threat:

| Threat Type | Acoustic Signature | RF Signature | Speed | RCS |
|-------------|-------------------|--------------|-------|-----|
| Shahed-136 | 75-85 dB @ 500-2000 Hz | 2.4GHz control link | 185 km/h | ~0.5m² |
| FPV Quad (combat) | 80-95 dB @ 200-800 Hz harmonics | 2.4/5.8GHz video + control | 120 km/h | ~0.1m² |
| Commercial DJI | 65-75 dB @ 100-400 Hz | 2.4/5.8GHz OcuSync | 65 km/h | ~0.3m² |

### 2.2 Current Gaps

1. **Coverage gap**: Expensive dedicated systems protect only critical infrastructure
2. **Speed gap**: Manual reporting via phone calls loses 60–120 seconds critical response time
3. **Coordination gap**: No civilian-military information bridge for distributed sightings
4. **Hardware gap**: Specialized sensors require trained operators and maintenance
5. **Resilience gap**: Centralized systems fail when communications infrastructure is attacked

### 2.3 The Opportunity

Modern smartphones contain:
- MEMS microphones with 44.1kHz sample rate and 94+ dB dynamic range
- WiFi radios capable of passive channel energy monitoring
- GPS with ±3m accuracy (±0.5m with assisted GPS)
- BLE 5.x with ~100m range
- 4/5G connectivity with <50ms latency
- ML processors (NPU/DSP) capable of 156ms inference on 480KB models

At city scale (1M+ nodes), the detection probability and triangulation accuracy approach or exceed dedicated sensor grids at 1/10,000 the cost.

---

## 3. TARGET USERS

### 3.1 User Archetypes

#### UA-01: Civilian Volunteer (Primary Mobile User)
- **Profile**: Romanian/Ukrainian/Polish civilian, 18–65, non-technical
- **Device**: Android smartphone (Samsung, Xiaomi, or similar), Android 9+
- **Context**: Running the app passively in the background while doing normal life
- **Goal**: Contribute to community defense with zero active effort
- **Pain points**: Battery drain, data usage, privacy concerns, false alarms
- **Success metric**: App runs 24/7 without intervention, alerts are meaningful

#### UA-02: C2 Commander (Dashboard Primary User)
- **Profile**: Military or civil defense officer, trained in situational awareness
- **Device**: Desktop workstation (1920×1080+) or tactical tablet
- **Context**: Monitoring threat tracks in a dedicated operations center
- **Goal**: Real-time tactical picture of aerial threats, fast response coordination
- **Pain points**: Information overload, false positives, stale data
- **Success metric**: <30 seconds from detection to actionable track on map

#### UA-03: Civil Defense Coordinator
- **Profile**: Municipal or regional emergency management official
- **Device**: Laptop, tablet
- **Context**: Not a military operator; manages civilian response (evacuations, shelters)
- **Goal**: Know when and where threats are, coordinate civilian response
- **Pain points**: Over-classification, need civilian-friendly language
- **Success metric**: Can interpret threat map without military training

#### UA-04: Field Technical Administrator
- **Profile**: NGO or military IT staff managing the sensor network
- **Device**: Desktop + Android device for testing
- **Context**: Deploying, calibrating, and maintaining nodes in a city
- **Goal**: Monitor network health, push model updates, manage node calibration
- **Pain points**: Identifying failing nodes, pushing updates to offline nodes
- **Success metric**: Can identify and rectify network issues in <15 minutes

#### UA-05: Military Intelligence Analyst
- **Profile**: SIGINT/MASINT analyst attached to C2
- **Device**: Dual monitor workstation
- **Context**: Analyzing track history, correlating with OSINT, producing reports
- **Goal**: Identify patterns (attack corridors, launch sites), produce intelligence products
- **Pain points**: Data export, integration with existing intelligence systems
- **Success metric**: Exportable track history, COT protocol integration

---

## 4. USER STORIES

### Mobile App Stories

**US-01** As a civilian volunteer, I want to install the app and join the network in under 3 minutes so that onboarding friction doesn't deter participation.

**US-02** As a civilian volunteer, I want the app to run silently in the background without requiring any interaction so that I can contribute without changing my behavior.

**US-03** As a civilian volunteer, I want to receive an immediate full-screen alert with distance and bearing when a threat is confirmed near me so that I can take protective action.

**US-04** As a civilian volunteer, I want to see a simple map showing my coverage contribution and nearby alerts so that I feel the app is actively useful.

**US-05** As a civilian volunteer, I want the app to continue functioning for threat detection even when my internet connection is lost, using the mesh network so that my contribution is resilient.

**US-06** As a civilian volunteer, I want to understand what data the app collects and be assured that my audio never leaves my device so that I can trust the application with always-on microphone access.

**US-07** As a civilian volunteer, I want to see my battery impact and adjust sensitivity vs. battery tradeoff so that the app doesn't cause my phone to die.

**US-08** As a civilian volunteer, I want to receive model updates silently over-the-air without reinstalling the app so that detection accuracy improves over time.

**US-09** As a civilian volunteer, I want to calibrate my node with a single tap so that my device contributes accurate time-difference data for triangulation.

**US-10** As an iOS user, I want the same acoustic detection capability as Android users, even though iOS imposes restrictions on background microphone access so that iPhone users can participate fully.

### C2 Dashboard Stories

**US-11** As a C2 commander, I want to see all active threat tracks on a 3D map with confidence scores and estimated positions so that I can build a complete tactical picture within 30 seconds of opening the dashboard.

**US-12** As a C2 commander, I want to receive a full-screen critical alert when a high-confidence threat is detected, with audio alarm, so that I am immediately aware of urgent situations even when not actively watching the screen.

**US-13** As a C2 commander, I want to click on any threat track and see detection details (contributing nodes, sensor types, confidence history, estimated trajectory) so that I can assess threat credibility.

**US-14** As a C2 commander, I want to switch between 3D globe view and 2D tactical map view so that I can use the appropriate visualization for the situation.

**US-15** As a C2 commander, I want to acknowledge, flag, or dismiss alerts with one click so that my alert queue stays relevant and actionable.

**US-16** As a C2 commander, I want to replay any historical time window to review how a track developed so that I can support post-incident analysis.

**US-17** As a civil defense coordinator, I want to see a simple threat level indicator (green/amber/red) without needing to understand individual track data so that I can make quick resource deployment decisions.

**US-18** As a civil defense coordinator, I want to export the current threat picture as a PDF or image for inclusion in briefings so that I can communicate status to non-system users.

**US-19** As a field technical administrator, I want to see a node health map with battery levels, signal quality, and last-seen timestamps so that I can identify nodes that need attention.

**US-20** As a field technical administrator, I want to trigger remote calibration of individual nodes or zones so that triangulation accuracy is maintained across the network.

**US-21** As a military intelligence analyst, I want to export track history as COT (Cursor on Target) events for import into TAK products so that APEX-SENTINEL data integrates with existing military C2 systems.

**US-22** As a military intelligence analyst, I want to filter tracks by type, confidence threshold, time range, and geographic area so that I can focus analysis on relevant data.

**US-23** As a military intelligence analyst, I want to see detection node coverage overlaid on the map so that I can identify geographic blind spots in the sensor network.

**US-24** As a field technical administrator, I want to push ML model updates to all online nodes simultaneously with automatic rollback on failures so that I can maintain detection quality without disrupting the network.

**US-25** As a C2 commander, I want to see cross-border threat vectors using OpenSky Network ADS-B data as a correlation layer so that I can distinguish civilian aircraft from threats and track approach corridors.

---

## 5. FUNCTIONAL REQUIREMENTS

### FR-01: Node Registration and Identity

**Priority**: P0 (Critical)
**Description**: Mobile nodes must register with the backend to receive assignments and contribute detections.

**Acceptance Criteria**:
- Node generates a UUID v4, hashes it with SHA-256, stores only the hash locally
- Registration includes: hashed_node_id, platform (android/ios), app_version, ml_model_version, capabilities (acoustic, rf, mesh_lora, mesh_ble)
- Backend assigns a short node_id (6-char alphanumeric) for efficient mesh transmission
- Registration completes in <2 seconds on 4G
- Re-registration on app reinstall generates a new node ID (privacy by design)
- Node registration is idempotent (retry-safe)

### FR-02: Acoustic Detection — On-Device

**Priority**: P0 (Critical)
**Description**: Continuous acoustic monitoring for drone signatures using on-device ML.

**Acceptance Criteria**:
- Sample audio at 44,100 Hz continuously when app is active
- Extract 500ms overlapping frames with 250ms hop
- Compute mel spectrogram (128 mel bins, 25ms window, 10ms hop)
- Run YAMNet embedding extraction (1024-dim output)
- Binary classification head: drone / not-drone
- Multiclass head: FPV_quad / shahed / unknown_uav / false_positive
- Inference completes in ≤156ms on Snapdragon 665 (or equivalent)
- Model size ≤480KB on-device (quantized INT8 TFLite)
- Detection confidence output range: 0.0–1.0
- Raw audio is NEVER stored or transmitted; only confidence scores leave the device
- Detection events triggered when confidence > configurable threshold (default 0.40)
- Acoustic frequency band analysis (500–2000 Hz) reported with each detection

### FR-03: RF/EMF Detection — On-Device

**Priority**: P0 (Critical)
**Description**: WiFi channel energy anomaly detection as secondary detection modality.

**Acceptance Criteria**:
- Scan WiFi channels: 2.4GHz (Ch 1–13) + 5GHz (Ch 36, 40, 44, 48, 149, 153, 157, 161)
- Measure RSSI per channel every 500ms (passive scan, no association)
- Build energy vector: [ch1_rssi, ch6_rssi, ch11_rssi, ch36_rssi, ...] (24-dim)
- Apply anomaly scoring: deviation from rolling 5-minute baseline
- RF anomaly score range: 0.0–1.0
- RF detection events triggered when anomaly score > configurable threshold (default 0.35)
- Distinguish between: drone RF link (2.4/5.8GHz burst pattern) vs. normal WiFi traffic
- Report: channel energies vector, anomaly score, baseline deviation, timestamp

### FR-04: Sensor Fusion — On-Device

**Priority**: P1 (High)
**Description**: Fuse acoustic and RF detection signals on-device before transmission.

**Acceptance Criteria**:
- Fusion model: lightweight MLP (32→16→1), quantized INT8, <50KB
- Input: [acoustic_confidence, acoustic_band_energy[4], rf_anomaly_score, rf_channel_vector[8]]
- Output: fused_confidence (0.0–1.0), detection_type (acoustic_only / rf_only / fused)
- If acoustic_confidence > 0.7 AND rf_anomaly_score > 0.5 → fused_confidence boosted by 1.3× (capped at 1.0)
- Fusion inference ≤20ms additional latency
- Report both individual and fused confidence scores

### FR-05: Detection Event Reporting

**Priority**: P0 (Critical)
**Description**: Transmit detection events to backend with metadata for triangulation.

**Acceptance Criteria**:
- Transmission occurs when fused_confidence > 0.35 (configurable)
- Event payload: node_id, timestamp_utc (ISO 8601, ms precision), latitude, longitude, location_accuracy_m, acoustic_confidence, rf_anomaly_score, fused_confidence, detection_type, frequency_profile[4], rf_channels[8], app_version, ml_model_version
- Timestamp must be NTP-synchronized (max drift ±10ms for TDoA accuracy)
- Transmission over HTTPS to Supabase Edge Function
- Retry with exponential backoff (3 retries, 1s/2s/4s) on failure
- Queue events locally when offline; transmit in batch when reconnected (max queue: 1000 events)
- Event transmission latency target: <200ms from detection to backend ingestion (p95)

### FR-06: Acoustic TDoA Triangulation — Backend

**Priority**: P0 (Critical)
**Description**: Backend triangulation of drone position using time-difference-of-arrival from ≥3 nodes.

**Acceptance Criteria**:
- Require minimum 3 nodes with acoustic detections within 5-second window and 2km radius
- Apply TDoA algorithm: hyperbolic position estimation using node timestamps
- Use speed of sound: 343 m/s (temperature-corrected via node-reported ambient temp when available)
- Apply Kalman filter for track smoothing and velocity estimation
- Output: estimated_lat, estimated_lon, position_error_ellipse_m (target ≤62m), confidence
- Triangulation result published via Supabase Realtime within 3 seconds of qualifying detections
- Degrade gracefully to RSSI-based circle intersection when only 2 nodes available
- Report contributing node count and baseline geometry (GDOP)

### FR-07: RF RSSI Triangulation — Backend

**Priority**: P1 (High)
**Description**: Secondary triangulation using RF signal strength from multiple nodes.

**Acceptance Criteria**:
- Use weighted least-squares circle intersection from ≥3 nodes with RF anomaly detections
- RF path loss model: FSPL + urban correction factor (Okumura-Hata model)
- Accuracy target: ±150m (coarser than acoustic TDoA)
- Use RF triangulation when acoustic is unavailable or low confidence
- Combine with acoustic triangulation via weighted average when both available

### FR-08: Track Management — Backend

**Priority**: P0 (Critical)
**Description**: Create, update, and manage threat tracks.

**Acceptance Criteria**:
- Track created when: ≥3 detection events from ≥2 nodes within 30 seconds, fused confidence >0.50
- Track ID format: TRK-YYYYMMDD-NNNN (date-sequential)
- Track state machine: DETECTED → TRACKING → CONFIRMED → LOST → TERMINATED
- Track updated with new position every time new qualifying detections arrive
- Track marked LOST when no qualifying detections for 60 seconds
- Track TERMINATED when LOST for >300 seconds
- Track includes: estimated heading (degrees), estimated speed (m/s), altitude_estimate_m, track_type (FPV_quad/shahed/unknown_uav)
- Track history retained for 72 hours; archived to cold storage after

### FR-09: Alert Generation — Backend

**Priority**: P0 (Critical)
**Description**: Generate and manage operational alerts.

**Acceptance Criteria**:
- Alert created when track confidence exceeds tier thresholds:
  - CRITICAL: fused_confidence ≥ 0.85, ≥4 contributing nodes
  - HIGH: fused_confidence ≥ 0.70, ≥3 nodes
  - MEDIUM: fused_confidence ≥ 0.55, ≥2 nodes
  - LOW: fused_confidence ≥ 0.40, ≥1 node
- Alert contains: alert_id, track_id, severity, threat_type, position, confidence, node_count, timestamp, estimated_impact_area_radius_m
- Alert pushed to subscribers via Supabase Realtime within 1 second of generation
- Alert acknowledgment tracked per C2 user
- Alert auto-escalates if not acknowledged within configurable window (default: CRITICAL=60s, HIGH=180s)
- Mobile alerts pushed to nodes within 500m of estimated threat position

### FR-10: C2 Dashboard — Map Visualization

**Priority**: P0 (Critical)
**Description**: Interactive 3D/2D tactical map for C2 operators.

**Acceptance Criteria**:
- 3D globe: CesiumJS with Cesium World Terrain + OSM building data
- 2D tactical: MapLibre GL with OpenStreetMap vector tiles
- Toggle between 3D/2D without losing current view center
- Display layers: nodes (heatmap + individual), tracks, alert rings, mesh topology, coverage rings, MGRS grid
- Node heatmap updates in real-time as nodes go online/offline
- Track polylines animate smoothly; heading arrow updates on new position
- Map load time <3 seconds on 100Mbps connection
- Zoom range: world → 1:500 scale
- MGRS grid overlay at zoom >12
- Offline tile caching for last-viewed area (50MB local cache)

### FR-11: C2 Dashboard — Track Inspection

**Priority**: P1 (High)
**Description**: Detailed track inspection panel.

**Acceptance Criteria**:
- Click/tap any track → right panel shows: Track ID, type, confidence, heading, speed, altitude, first detection, last update, contributing nodes list, detection method breakdown
- Show confidence history chart (last 5 minutes)
- Show track trail on map (last 60 seconds)
- Show 30-second prediction cone
- Show triangulation visualization (dashed lines from contributing nodes)
- Export single track as KML or COT XML

### FR-12: OpenMCT Integration

**Priority**: P2 (Medium)
**Description**: Operational telemetry dashboard using OpenMCT framework.

**Acceptance Criteria**:
- OpenMCT instance embedded in C2 dashboard bottom panel (collapsible)
- Custom telemetry source: Supabase Realtime → OpenMCT telemetry server
- Display: detection event rate (events/min), RF anomaly index (0–1), active node count, mesh coverage %, track count
- Time range selector: 5min, 15min, 1h, 4h, 24h, custom
- Historical playback of all metrics
- Alert when detection rate spikes >3σ above rolling baseline

### FR-13: FreeTAKServer COT Integration

**Priority**: P1 (High)
**Description**: Export threat tracks as Cursor-on-Target (CoT) events for TAK product integration.

**Acceptance Criteria**:
- Outbound COT stream to FreeTAKServer instance (configurable host:port)
- COT event type: `a-h-A-M-F` (Hostile/Air/Military/Fixed-wing) for Shahed
- COT event type: `a-h-A-M-R` (Hostile/Air/Military/Rotary) for FPV quad
- COT UID: `APEXSENTINEL-{track_id}`
- Update rate: every 5 seconds for active tracks
- Include: how="m-g" (machine-generated), stale time = last_detection + 120s
- Relay node receives COT via FreeTAKServer and displays in ATAK/WinTAK
- Configurable: enable/disable, server address, protocol (TCP/UDP), TLS cert

### FR-14: Mesh Networking — LoRa / Meshtastic

**Priority**: P1 (High)
**Description**: LoRa mesh network for offline operation using Meshtastic protocol.

**Acceptance Criteria**:
- Meshtastic-compatible packet format for interoperability
- Packet types: DETECTION_EVENT (compressed), ALERT_BROADCAST, CALIBRATION_PING, NODE_HEARTBEAT
- Max packet size: 256 bytes (LoRa constraint)
- Detection event compressed to: node_id[6] + timestamp[4] + lat[3] + lon[3] + confidence[1] + type[1] = 18 bytes
- Mesh routing: epidemic/flooding for alerts, directed routing for detections
- TTL: 3 hops max (configurable)
- When internet available: relay mesh events to backend
- Meshtastic LoRa frequency: 868MHz (EU) / 915MHz (US) / 433MHz (backup)

### FR-15: Mesh Networking — BLE + Google Nearby Connections

**Priority**: P1 (High)
**Description**: Short-range mesh using BLE and Google Nearby for smartphone-to-smartphone relay.

**Acceptance Criteria**:
- BLE 5.x advertising for node discovery
- Google Nearby Connections for data transfer when BLE insufficient
- Range: BLE ~100m, Google Nearby ~100m
- Relay detection events between nodes when one has internet and others do not
- Relay alerts from nodes with internet to nodes without
- Max queue: 50 events per relay session
- Battery-optimized: BLE advertising duty cycle 5% when no alerts active; 100% when CRITICAL alert

### FR-16: Node Health Monitoring

**Priority**: P1 (High)
**Description**: Continuous monitoring of node health and network topology.

**Acceptance Criteria**:
- Heartbeat from each node every 60 seconds (configurable)
- Heartbeat payload: battery_percent, available_storage_mb, ml_model_version, location_accuracy_m, acoustic_snr_db, rf_scan_enabled, mesh_peer_count, network_type (wifi/4g/5g/mesh)
- Node marked DEGRADED when: battery <20% OR location_accuracy_m >100 OR SNR <10dB
- Node marked OFFLINE when no heartbeat for 300 seconds
- C2 dashboard: node health heatmap by geographic density
- Alerting: C2 alert when >15% of nodes in a zone go offline within 10 minutes (possible jamming)

### FR-17: Calibration System

**Priority**: P1 (High)
**Description**: Time synchronization and acoustic calibration for triangulation accuracy.

**Acceptance Criteria**:
- NTP sync on app startup; max acceptable drift ±10ms
- GPS timing used when available (±5ms)
- Calibration wizard: measures ambient noise floor, time sync quality, microphone response
- Per-node calibration weight (0.0–1.0) stored in backend, used in TDoA weighting
- Calibration result: ambient_db, time_offset_ms, mic_response_profile, weight
- Nodes that fail calibration (weight <0.5) are used for detection only, excluded from TDoA
- Calibration pulse: backend can broadcast calibration tone via mesh for field calibration
- Recalibration required when: node location changes >50m, mic_response_profile deviation >3dB

### FR-18: ML Model Update System

**Priority**: P1 (High)
**Description**: Over-the-air model updates without app reinstall.

**Acceptance Criteria**:
- Model versioned with semantic version (major.minor.patch)
- Model file: TFLite for Android, CoreML for iOS, stored in app-private storage
- Update check on app launch + every 6 hours
- Download over WiFi only by default (configurable)
- Model validated with SHA-256 checksum before deployment
- Rollback: keep previous model version; auto-rollback on 3 consecutive inference errors
- Model update notification to C2 dashboard
- Zero-downtime: model swap between detection windows (<1s gap)

### FR-19: Privacy Controls — User-Facing

**Priority**: P0 (Critical)
**Description**: User controls for data collection and privacy.

**Acceptance Criteria**:
- Node ID regeneration: one tap, immediate effect
- Location precision: round to 10m / 100m / 500m (user choice; default 100m)
- Opt-out: user can disable RF scanning independently of acoustic
- Data export: user can export all data their node has transmitted (GDPR Article 20)
- Data deletion: user can delete node record from backend (GDPR Article 17)
- Privacy notice: shown on first launch; accessible from settings
- Consent: explicit consent before microphone access, explaining on-device-only processing

### FR-20: OpenSky Network Integration

**Priority**: P2 (Medium)
**Description**: ADS-B civil aircraft data to reduce false positives.

**Acceptance Criteria**:
- Poll OpenSky Network API every 30 seconds for aircraft within 50km of active threat zones
- Aircraft positions displayed as friendly overlay on C2 map
- Automatic suppression: if acoustic detection aligns with known ADS-B aircraft track, reduce confidence by 0.4 (aircraft noise correlation)
- ICAO24 identification shown in track details when correlated
- Free tier rate limit management: 100 requests/hour, cached and shared across backend

### FR-21: Data Export — C2

**Priority**: P2 (Medium)
**Description**: Export threat data in multiple formats.

**Acceptance Criteria**:
- Export formats: JSON, CSV, KML, COT XML, GeoJSON
- Export scope: current view, time range (custom), selected tracks
- PDF report generation: threat summary with map screenshot, track table, statistics
- Exportable data: tracks, detection events, node list (anonymized), alert history
- Export access: C2 Commander and above roles only

### FR-22: Role-Based Access Control

**Priority**: P0 (Critical)
**Description**: Multi-tier access control for C2 dashboard.

**Acceptance Criteria**:
- Roles: SUPER_ADMIN, C2_COMMANDER, C2_OPERATOR, ANALYST, CIVIL_COORDINATOR, READ_ONLY
- SUPER_ADMIN: full access, user management, system configuration
- C2_COMMANDER: all operational data, alert acknowledgment, COT export, user management (lower tiers)
- C2_OPERATOR: dashboard view, alert acknowledgment, track inspection
- ANALYST: read-all, export, historical playback, no real-time alert management
- CIVIL_COORDINATOR: threat level indicator only, evacuation zone overlay, no raw tracks
- READ_ONLY: aggregate statistics only
- Session timeout: 8 hours (configurable per role)
- MFA required for C2_COMMANDER and above

### FR-23: Offline Mode — Full Operation

**Priority**: P0 (Critical)
**Description**: System must function in fully offline (internet-denied) environment.

**Acceptance Criteria**:
- Mobile: full acoustic + RF detection continues with no internet
- Mobile: local alert history maintained when offline
- Mobile: events queued locally, transmitted when internet restored
- Mobile: mesh alerts received and displayed from LoRa/BLE mesh
- C2 dashboard: offline tile cache (50MB) enables map display
- C2 dashboard: cached alert/track data displayable while reconnecting
- FreeTAKServer local instance: C2 can operate as isolated network
- Degraded mode indicator: always visible, clearly communicates connection state

### FR-24: Grafana Monitoring Integration

**Priority**: P2 (Medium)
**Description**: Operational monitoring and system health via Grafana.

**Acceptance Criteria**:
- Grafana instance connected to Supabase (PostgreSQL data source)
- Dashboards: node fleet health, detection rate by zone, ML model performance, triangulation accuracy histogram, alert response time
- Alerting: PagerDuty/Slack webhook when system metrics degrade
- Retention: metrics retained 90 days in Grafana
- Access: admin only

### FR-25: Supabase Realtime Push to Mobile

**Priority**: P0 (Critical)
**Description**: Real-time threat alerts pushed to mobile nodes in geographic proximity.

**Acceptance Criteria**:
- Each mobile node subscribes to Supabase Realtime channel for its geographic cell (H3 hex cell, resolution 7)
- Alert broadcast targets all nodes in cells within 2km of estimated threat position
- Alert delivery latency: <1 second from alert creation to mobile receipt (p95 on 4G)
- Alert payload: alert_id, severity, track_id, estimated_lat, estimated_lon, distance_m, bearing_deg
- Alert deduplication: client tracks received alert IDs, ignores duplicates
- Fallback: push notification (FCM/APNs) when Realtime WebSocket is closed

---

## 6. NON-FUNCTIONAL REQUIREMENTS

### 6.1 Performance

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Acoustic ML inference latency | ≤156ms | ≤250ms |
| RF scan cycle time | ≤500ms | ≤1000ms |
| Detection event transmission | ≤200ms p95 | ≤500ms p99 |
| Backend triangulation | ≤3 seconds | ≤10 seconds |
| Alert generation to mobile delivery | ≤1 second p95 | ≤3 seconds p99 |
| C2 map render | ≤3 seconds initial | ≤1 second update |
| COT stream update rate | 5 second interval | 10 second max |
| Backend API response time | ≤200ms p95 | ≤500ms p99 |
| Mobile app startup | ≤3 seconds cold | ≤1 second warm |
| Node heartbeat processing | ≤1 second | ≤5 seconds |

### 6.2 Scale

| Metric | Target | Architecture Limit |
|--------|--------|-------------------|
| Concurrent online nodes | 1,000,000 | 10,000,000 (H3-sharded) |
| Detection events/second | 10,000 | 100,000 |
| Concurrent C2 sessions | 500 | 5,000 |
| Active tracks | 100 | 1,000 |
| Historical detection events stored | 90 days | 1 year (cold archive) |
| Supabase Realtime subscriptions | 100,000 | 1,000,000 |

### 6.3 Reliability

| Metric | Target |
|--------|--------|
| Backend uptime | 99.5% (allows 3.65 hours/month downtime) |
| Detection capability uptime (with mesh fallback) | 99.9% |
| Data loss on backend outage | Zero (local queue) |
| MTTR (mean time to recovery) | <15 minutes |
| RPO (recovery point objective) | <5 minutes |
| Node resilience (% still operating after 45% internet loss) | 55%+ via mesh |

### 6.4 Security

| Requirement | Implementation |
|-------------|----------------|
| Transport encryption | TLS 1.3 minimum for all backend communication |
| Mesh encryption | AES-256 for LoRa packets (Meshtastic native) |
| Authentication | Supabase JWT (RS256), 1-hour expiry |
| API key rotation | 90-day forced rotation |
| C2 MFA | Required for Commander+ roles |
| Data at rest | Supabase encrypted at rest (AES-256) |
| SQL injection | Supabase parameterized queries + RLS |
| DDoS protection | Supabase Edge Function rate limiting + Cloudflare |
| Node authentication | JWT issued on registration, rotated every 7 days |

### 6.5 Privacy (Non-Negotiable)

| Requirement | Implementation |
|-------------|----------------|
| Audio processing | 100% on-device; raw audio NEVER transmitted |
| Node identity | SHA-256 hashed UUID; no PII |
| Location precision | User-configurable (10/100/500m rounding) |
| Data minimization | Only detection metadata transmitted, never sensor data |
| Right to deletion | GDPR Article 17 compliant; full deletion within 24 hours |
| Data portability | GDPR Article 20; JSON export within 72 hours of request |
| Retention | Detection events: 72 hours active, 30 days cold; Tracks: 90 days |
| Third-party sharing | None except FreeTAKServer (operator-controlled, on-premise option) |

### 6.6 Mobile Battery Performance

| Scenario | Battery Budget |
|----------|---------------|
| Acoustic + RF active (4G) | ≤8% per hour |
| Acoustic only (4G) | ≤5% per hour |
| Mesh-only (no internet) | ≤4% per hour |
| Alert-only mode (background) | ≤2% per hour |
| Idle (waiting, periodic check) | ≤1% per hour |

---

## 7. CONSTRAINTS

### 7.1 Technical Constraints

- **iOS background audio**: iOS restricts background microphone access; must use VoIP background mode or request "always-on" audio session; CoreML used instead of TFLite
- **Android battery optimization**: Manufacturer battery savers (Huawei, Xiaomi) may kill background services; requires doze mode whitelist guidance in onboarding
- **LoRa hardware requirement**: LoRa mesh requires external LoRa module (Meshtastic device) for long-range mesh; BLE-only mesh available for standard smartphones
- **WiFi passive scan limitations**: Android 10+ restricts WiFi scan frequency to 4 scans per 2 minutes without ACCESS_WIFI_STATE permission in specific modes
- **Triangulation minimum**: TDoA requires minimum 3 nodes; single or dual-node deployments degrade to directional estimation only
- **Supabase free tier**: 500MB database, 2GB bandwidth — acceptable for MVP; paid plan required at scale

### 7.2 Operational Constraints

- **No specialized hardware required**: The app must work on unmodified consumer smartphones (Android 9+, iOS 14+)
- **No cloud dependency for detection**: Core detection must function without internet (privacy + resilience)
- **No classified data**: System operates on unclassified data only; COT output is for integration with classified systems but APEX-SENTINEL itself is unclassified
- **Civilian legal compliance**: Must comply with GDPR (Romania/EU), data protection laws; cannot operate as surveillance system
- **Export control**: ML model trained on open-source data only (YAMNet, DroneAudioDataset, DroneRF) to avoid ITAR/EAR restrictions

### 7.3 Accuracy Constraints

- **Detection accuracy baseline**: 87% as validated by INDIGO AirGuard; target ≥90% in production with larger dataset
- **Triangulation baseline**: ±62m as validated; target ≤50m at scale with better node density
- **False positive tolerance**: ≤5% false positive rate at operational threshold; tunable by operators
- **Acoustic range**: 300–1000m effective acoustic detection range depending on ambient noise

---

## 8. OUT OF SCOPE (W1)

The following are explicitly out of scope for Wave 1:

| Feature | Reason | Future Wave |
|---------|---------|-------------|
| Counter-UAS effectors integration | Safety/legal; out of civilian scope | N/A |
| Classified network integration | Security boundary; separate program | W4+ |
| Radar integration | Specialized hardware | W3 |
| Video/optical detection | Bandwidth; battery; privacy | W3 |
| Fixed sensor stations (non-smartphone) | Hardware cost; deployment complexity | W2 |
| Predictive flight path AI | Insufficient track length in W1 | W2 |
| Jamming detection/localization | Specialized hardware + legal | W3 |
| Automated kinetic response triggers | Legal + safety out of scope | N/A |
| Commercial drone registration database | API licensing | W2 |
| iOS LoRa hardware integration | iOS BLE-to-LoRa bridge complexity | W2 |
| Multi-tenant SaaS deployment | Architecture complexity | W3 |
| Classified SAR/SIGINT data fusion | Security boundary | N/A |

---

## 9. SUCCESS METRICS

### Detection Performance
- ≥87% detection rate (Recall) for FPV drones at ≥300m in <65 dB ambient
- ≥87% detection rate for Shahed-136 at ≥500m
- ≤5% false positive rate at default threshold
- ±62m or better triangulation with ≥3 nodes

### Network Scale
- 1,000 nodes enrolled in pilot city within 30 days of launch
- 50,000 nodes enrolled within 90 days
- ≥85% node uptime (online or mesh-connected)

### Response Time
- ≤3 seconds from detection event to C2 alert (p95)
- ≤1 second from alert to mobile push (p95)

### User Retention
- ≥70% of enrolled nodes still active after 30 days
- ≤15% uninstall rate in first 7 days

### Operational
- C2 commander can interpret threat track within 30 seconds of dashboard open
- Zero data breaches
- Zero regulatory violations

---

## 10. VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-24 | APEX-SENTINEL Team | Initial PRD |

---

*End of PRD.md — APEX-SENTINEL W1*
