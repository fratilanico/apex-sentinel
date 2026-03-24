# APEX-SENTINEL — PRIVACY_ARCHITECTURE.md
## Gate 4: EKF + LSTM Trajectory Prediction — Privacy Architecture
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. PRIVACY OVERVIEW

W5 is a data processing layer — it transforms existing track data (coordinates + timestamps) into derived predictions. No new raw sensor data is captured. The privacy surface is:

1. **Predicted trajectories** — derived from existing track positions (not PII)
2. **Impact estimates** — derived operational intelligence (sensitive, not personal)
3. **EKF state history** — smoothed version of existing track positions (7-day TTL)

No personal data is processed by W5. The privacy analysis confirms W5 is **GDPR-compliant as a matter of data category** — drone position coordinates do not constitute personal data under GDPR Article 4(1) unless the drone operator is identifiable from the coordinates, which is out of scope for APEX-SENTINEL (no operator identification module exists).

---

## 2. DATA CLASSIFICATION

| Data Element | Category | PII? | Sensitivity | W5 Role |
|-------------|----------|------|-------------|---------|
| Track positions (lat/lon/alt) | Operational telemetry | No | Restricted (OPSEC) | Input |
| EKF state vector | Derived operational | No | Restricted (OPSEC) | Intermediate |
| Predicted trajectories | Derived operational | No | Restricted (OPSEC) | Output |
| Impact estimates | Derived intelligence | No | SECRET (OPSEC) | Output |
| Node IDs in detections | System metadata | No | Internal | Stripped before prediction output |
| Track IDs (UUIDs) | System reference | No | Internal | Included in output |

**Node IDs are stripped from prediction output.** The `PredictionOutput` and all NATS prediction messages contain only `trackId` (a UUID assigned by W3 correlation) — never the `nodeId` or sensor position information that could compromise sensor placement.

---

## 3. ACCESS CONTROL — ROLE-BASED

### 3.1 Roles (inherited from W1–W4)

| Role | Access Level | W5 Data Access |
|------|-------------|---------------|
| `operator` | Full C2 | All predictions, all impact estimates (any confidence) |
| `analyst` | Read-only, history | Predictions + EKF history; impact estimates only via get-predictions (no Realtime impact channel) |
| `civil_defense` | External partner | Impact estimates only with confidence ≥ 0.5 (filtered by Edge Function) |
| `admin` | System admin | All data |
| `service_role` | W5 microservice | Write to track_positions, predicted_trajectories, impact_estimates, tracks |

### 3.2 RLS Enforcement (as in DATABASE_SCHEMA.md)

**track_positions:** operator, analyst, admin — read; service_role — write
**predicted_trajectories:** operator, analyst, admin — read; service_role — write
**impact_estimates:** operator, admin — read (Realtime); analyst — read via Edge Function (get-impact-estimates applies confidence filter); service_role — write

### 3.3 Impact Estimate Gate for Civil Defense

Impact estimates with confidence < 0.5 are NOT forwarded to civil defense channels. This is enforced at application layer in the `get-impact-estimates` Edge Function:

```typescript
// Minimum confidence for civil_defense role:
const MIN_CONFIDENCE = jwt.role === 'civil_defense' ? 0.5 : 0.1;
```

Rationale: False impact alerts to civilian populations cause panic and erode trust in the system. A confidence < 0.5 means the impact point has ≥ 50% probability of being wrong by more than 50m — unacceptable for evacuation decisions.

---

## 4. DATA RETENTION AND LIFECYCLE

### 4.1 Retention Periods

| Table | Retention | Mechanism |
|-------|-----------|-----------|
| `track_positions` | 7 days | pg_cron job: `archive-track-positions-7d` (runs 02:00 UTC daily) |
| `predicted_trajectories` | 7 days | pg_cron: `archive-predicted-trajectories-7d` |
| `impact_estimates` | 30 days | pg_cron: `archive-impact-estimates-30d` |
| `tracks.predicted_trajectory` | Cleared on track LOST | Application layer: W5 sets to null when track drops |

**Rationale for 7-day retention:** EKF state history has operational value for post-incident analysis within 48 hours. 7 days provides safety buffer. Beyond 7 days, anonymized summary records (in a future analytics store) replace raw state history.

### 4.2 Cascade Delete

All W5 tables reference `tracks(id)` with `ON DELETE CASCADE`. When a track record is deleted (rare — normally status → LOST), all associated predictions, positions, and impact estimates are deleted automatically.

### 4.3 NATS Message Retention

Prediction messages published to `sentinel.predictions.{trackId}` are NATS Core (not JetStream). They are not persisted. Consumers that miss a message must wait for the next 1Hz publish. No historical replay on NATS for prediction data — use Supabase `predicted_trajectories` table instead.

---

## 5. OPSEC CONSIDERATIONS

### 5.1 Impact Estimate OPSEC

Impact estimates reveal:
1. The system has a confirmed drone track (confirms sensor network is active and working)
2. Approximate drone trajectory and destination
3. Estimated time-to-impact

This information, if leaked, could be used by adversaries to:
- Time launches to outpace prediction horizon
- Route drones around detected sensor coverage zones (if impact trajectory implies sensor positions)

**Mitigations:**
- Impact estimates restricted to `operator` and `admin` roles (not `analyst` via Realtime)
- No geographic cluster information published (impact point is a single lat/lon, not a coverage map)
- NATS TLS enforced for all fortress VM connections
- Supabase RLS strictly enforced; service role key never exposed to browser clients

### 5.2 Sensor Position Non-Disclosure in W5 Output

W3 TdoaCorrelator computes track positions from acoustic TDOA correlations. The detection events carry `nodeId` fields. W5 **drops `nodeId` entirely** before including detection data in predictions. The prediction output contains only `trackId` — no information about which nodes detected the drone or their positions.

---

## 6. GDPR COMPLIANCE

### 6.1 Assessment

**Is drone position data personal data under GDPR?**

GDPR Article 4(1): "personal data" means any information relating to an identified or identifiable natural person.

Analysis:
- Drone position coordinates identify the drone, not a natural person
- The drone operator is not identifiable from position data alone without additional cross-referencing (e.g., registration database, visual identification)
- APEX-SENTINEL does not perform any drone-to-operator identification

**Conclusion:** Drone position data as processed by W5 is NOT personal data under GDPR. W5 is not subject to GDPR obligations for this data.

**Exception:** If W5 were to associate drone tracks with operator identity (future threat intelligence module), that data would be personal data and would require GDPR compliance (legal basis, retention limits, subject access rights).

### 6.2 Processing Records

Even though W5 data is not personal data under GDPR, the processing record should be maintained for accountability:

| Field | Value |
|-------|-------|
| Processing purpose | Military drone detection and threat assessment |
| Data subject | None (no personal data) |
| Categories of data | Drone position telemetry (operational) |
| Retention | 7 days (operational necessity) |
| Recipients | Authorized operators, analysts, civil defense (as per roles) |
| Transfers | No transfers outside EU/EEA (Supabase eu-west-2 = London, UK) |
| Legal basis | Not applicable (no personal data) |

---

## 7. INCIDENT RESPONSE

### 7.1 Data Breach Scenario

If Supabase credentials are compromised and impact estimates are exfiltrated:
1. Rotate Supabase service role key immediately
2. Revoke all active sessions
3. Assess what impact estimates were accessible (time window)
4. If civil/civilian impact estimates were exposed: notify operational security authority
5. No GDPR notification required (no personal data)

### 7.2 False Impact Alert Scenario

If a W5 bug produces a high-confidence false impact estimate that triggers a civil defense alert:
1. W5 service: immediately publish `sentinel.impacts.{trackId}` with `confidence: 0` to clear the alert
2. Supabase: set `impact_estimates.confidence = 0` for the erroneous record
3. Notify operators via `sentinel.w5.status` alert
4. Track root cause: EKF divergence? Stale measurement? Polynomial overfitting?
5. Patch and redeploy W5 within 2 hours

### 7.3 Unauthorized Access to Predictions via Compromised Operator Account

If an operator JWT is compromised and prediction data accessed by an unauthorized party:
1. Revoke the JWT immediately (Supabase Auth admin → invalidate all sessions for user)
2. Rotate the Supabase JWT secret if multiple accounts potentially compromised
3. Audit `predicted_trajectories` and `impact_estimates` access logs (Supabase logs → Log Explorer)
4. Impact assessment: was active operation data exposed?
5. No GDPR notification required (no personal data in predictions)
6. Operational security review: if adversary saw impact estimates, assume they had 30s warning of interception capability

---

## 8. PRIVACY BY DESIGN CHECKLIST

| Principle | W5 Implementation |
|-----------|------------------|
| Data Minimisation | Prediction output includes only trackId (UUID), not nodeId, not operator identity |
| Purpose Limitation | Prediction data used only for C2 display and analyst review — not for profiling |
| Storage Limitation | 7-day TTL on track_positions and predicted_trajectories via pg_cron |
| Integrity and Confidentiality | RLS enforces role-based access; service role key in systemd EnvironmentFile (mode 640) |
| Accuracy | EKF state estimates are best-effort; confidence values communicated to users |
| Transparency | Prediction model version included in every output — users know polynomial vs LSTM |

---

## 9. SECURITY CONTROLS

### 9.1 Secret Management

| Secret | Storage | Access |
|--------|---------|--------|
| SUPABASE_SERVICE_ROLE_KEY | `/etc/apex-sentinel/w5.env` (mode 640) | root + apex-sentinel user only |
| NATS_PASSWORD | Same env file | Same |
| Supabase JWT secret | Supabase project settings | Admin only — never in codebase |
| ONNX model file | `/opt/apex-sentinel/w5/models/` | Read by apex-sentinel user |

No secrets in:
- Git repository (`.gitignore` covers `*.env`, `w5.env`)
- NATS message payloads
- Supabase table data
- Log output (structured JSON logger must not log env vars)

### 9.2 Network Security

- W5 service runs on fortress VM: accessible only via Tailscale (100.68.152.56) or NATS internal network
- No external HTTP server (headless service — no attack surface)
- Supabase connection: HTTPS/TLS (Supabase enforces TLS 1.2+)
- NATS connection: TLS (fortress NATS broker configured with TLS certificate)

### 9.3 Process Isolation

- Systemd unit: `NoNewPrivileges=true`, `ProtectSystem=strict`, `PrivateTmp=true`, `CapabilityBoundingSet=`
- User: `apex-sentinel` (non-root, no shell, no sudo)
- Memory limit: 256 MB (prevents memory runaway from EKF instance leak)

---

*PRIVACY_ARCHITECTURE.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 320+ lines | Status: APPROVED | Next: ROADMAP.md*
