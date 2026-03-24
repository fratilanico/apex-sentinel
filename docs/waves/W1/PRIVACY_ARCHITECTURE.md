# APEX-SENTINEL — Privacy Architecture
## W1 | PROJECTAPEX Doc 07/21 | 2026-03-24

---

## 1. Privacy-by-Design Mandate

APEX-SENTINEL deploys on civilian smartphones and processes audio, location, and radio environment data. Privacy is a **first-class architectural constraint** — not an afterthought. The system is designed to operate with zero PII collection while achieving military-grade detection capability.

**Governing principles**:
1. **Data minimisation** — collect the absolute minimum required for detection
2. **On-device inference** — raw sensors never leave the device
3. **Ephemeral transmission** — only derived signals, never raw data
4. **Purpose limitation** — data used solely for drone detection and alerting
5. **Right to disconnect** — any node can withdraw from the network at will
6. **Transparency** — all data flows documented and auditable

---

## 2. Data Classification

| Data Type | Classification | Where Processed | Transmitted? | Retention |
|-----------|---------------|-----------------|--------------|-----------|
| Raw microphone audio | Private | On-device only | NEVER | Not stored |
| YAMNet confidence score | Operational | On-device → NATS | YES (score only) | 24h |
| Peak frequency (Hz) | Operational | On-device → NATS | YES | 24h |
| Raw WiFi packet content | Private | On-device only | NEVER | Not stored |
| WiFi channel RSSI value | Operational | On-device → NATS | YES (dBm only) | 24h |
| WiFi SSID / BSSID | Private | NOT collected | NEVER | Not stored |
| Device GPS coordinates | Sensitive | On-device + NATS | YES (coarsened ±50m) | 72h |
| Device identifier | Sensitive | On-device → Supabase | YES (pseudonym) | Account lifetime |
| User account data | Personal | Supabase (encrypted) | Internal only | User-controlled |
| Detection events (fused) | Operational | NATS + Supabase | YES | 30 days |
| Track history | Operational | Supabase | YES | 7 days |

---

## 3. On-Device Processing Architecture

### 3.1 Acoustic Privacy Shield
```
┌─────────────────────────────────────────────────────┐
│  SMARTPHONE (Trust Boundary)                        │
│                                                     │
│  Microphone → [PRIVATE ZONE]                       │
│               Raw PCM audio (never leaves here)     │
│               ↓                                     │
│               Butterworth BPF (500–2000Hz)          │
│               ↓                                     │
│               FFT → Log-mel spectrogram             │
│               ↓                                     │
│               YAMNet TFLite inference               │
│               ↓                                     │
│  [OUTPUT ZONE — transmitted]                        │
│               confidence: 0.82                      │
│               peak_freq_hz: 234                     │
│               timestamp_us: 1711234567890000        │
└─────────────────────────────────────────────────────┘
```

**Implementation enforcement**:
- Audio capture restricted to background service with restricted permission
- No audio buffers written to disk — processing in-memory stream only
- Audio session terminates if app moved to foreground (visual indicator to user)
- Separate process for audio capture with no network access (Android: `isolatedProcess=true`)
- iOS: AVAudioEngine in-process, strict memory management, no file writes

### 3.2 RF Privacy Shield
```
WiFi interface (monitor mode) → NEVER capture packet payload
                              → NEVER capture SSID or BSSID
                              → NEVER capture MAC addresses
                              → ONLY: per-channel RSSI aggregates

Per channel (1s window):
  mean_rssi_dbm: -67.4
  std_rssi_dbm: 3.2
  sample_count: 100
  channel: 6
  band: 2.4GHz
```

**Technical implementation**:
- Android: `WifiManager.startScan()` — returns `ScanResult[]` with RSSI only
- iOS: CoreWLAN private API or `NEHotspotNetwork` (limited) — Enterprise/MDM only
- Node devices: Python `scapy` in promisc mode with BPF filter `radiotap and not wlan addr1` (drops all payload)
- Network interface NEVER placed in full promiscuous mode on non-node devices

### 3.3 Location Coarsening
All transmitted coordinates are coarsened to ±50m grid before leaving device:
```python
def coarsen_location(lat: float, lon: float, precision_m: float = 50) -> tuple:
    """
    Coarsen coordinates to nearest precision_m grid cell.
    TDOA still works — error added is within acoustic uncertainty anyway.
    """
    # ~50m ≈ 0.00045 degrees latitude
    grid = precision_m / 111_000  # degrees per meter at equator
    return (
        round(lat / grid) * grid,
        round(lon / grid) * grid
    )
```

**Rationale**: 50m precision sufficient for TDOA triangulation (±62m uncertainty anyway). Does not reveal user's precise home/work location.

---

## 4. Pseudonymous Identity System

### 4.1 Node Identity
No user account required for network participation. Nodes identified by pseudonymous `node_id`:

```
node_id = SHA-256(device_fingerprint + salt + app_install_uuid)[0:16]

device_fingerprint = SHA-256(android_id | IDFV)  # platform non-PII identifier
salt = random 32-byte value stored in Android Keystore / iOS Secure Enclave
app_install_uuid = random UUID generated at first launch
```

Properties:
- Cannot be reversed to identify device or user
- Rotatable: user can reset `app_install_uuid` from settings → new `node_id`
- Not linked to any account, phone number, or email
- Salt stored in hardware-backed secure storage

### 4.2 Account Registration (Optional)
For users who want history, preferences, alert configuration:
- Email: hashed with bcrypt cost=12 before storage — never stored plaintext
- No phone number required
- No real name required
- Account linkable to multiple nodes (optional)
- GDPR Article 17 right to erasure: single-tap account deletion purges all records

### 4.3 Operator Accounts
Operators (C2 dashboard users) require verified identity for audit trail:
- Multi-factor authentication mandatory
- All operator actions logged with timestamp, IP, user_id (immutable audit log)
- Role-based access control (see ARCHITECTURE.md §11)
- Account provisioning requires organisational verification

---

## 5. Data Transmission Security

### 5.1 Transport Layer
- All node→NATS communication: **mTLS 1.3** with mutual certificate authentication
- All NATS→services communication: TLS 1.3 minimum
- C2 dashboard: HTTPS with HSTS, HPKP
- No HTTP, no TLS 1.0/1.1/1.2 with weak ciphers

### 5.2 Certificate Management
```
APEX-SENTINEL Root CA (offline HSM)
    └── APEX-SENTINEL Intermediate CA
            ├── NATS Server Certs (5 nodes, 90-day rotation)
            ├── Node Client Certs (generated per node_id, 365-day)
            └── Service Certs (API, dashboard, 90-day rotation)
```

- Root CA: air-gapped, hardware security module
- Certificate rotation: automated via cert-manager (Kubernetes) or ACME
- Certificate pinning: mobile apps pin intermediate CA cert

### 5.3 Payload Encryption
Sensitive fields in NATS payloads encrypted at rest in Supabase:
```sql
-- Supabase pgcrypto for sensitive fields
UPDATE detection_events
SET position_encrypted = pgp_sym_encrypt(
    ST_AsGeoJSON(position)::text,
    current_setting('app.encryption_key')
)
```

---

## 6. Data Retention & Deletion

### 6.1 Retention Schedule
| Data Type | Hot Storage | Cold Storage | Auto-Delete |
|-----------|------------|-------------|-------------|
| Raw NATS events | NATS JetStream 24h | — | 24h TTL |
| Detection events (unconfirmed) | Supabase 24h | — | 24h |
| Detection events (confirmed track) | Supabase 7d | S3 archive 30d | 30d |
| Track history | Supabase 7d | S3 30d | 30d |
| Node heartbeats | Supabase 24h | — | 24h |
| Operator audit logs | Supabase 90d | S3 7yr | 7yr (legal) |
| User accounts (active) | Supabase | — | User-controlled |
| User accounts (deleted) | Deleted | Anonymised stats 90d | 90d |

### 6.2 Automated Deletion
```sql
-- Supabase pg_cron — runs hourly
SELECT cron.schedule('delete-expired-events', '0 * * * *', $$
  DELETE FROM detection_events
  WHERE created_at < NOW() - INTERVAL '7 days'
    AND track_id IS NULL;

  DELETE FROM detection_events
  WHERE created_at < NOW() - INTERVAL '30 days';

  DELETE FROM node_heartbeats
  WHERE created_at < NOW() - INTERVAL '24 hours';
$$);
```

---

## 7. GDPR & Legal Compliance

### 7.1 Legal Basis
| Processing Activity | Legal Basis (GDPR Art. 6) |
|--------------------|--------------------------|
| Drone detection (public safety) | Art. 6(1)(e) — public interest, or Art. 6(1)(f) — legitimate interests |
| Node participation | Art. 6(1)(a) — consent (explicit opt-in) |
| Operator access | Art. 6(1)(b) — contractual necessity |
| Audit logging | Art. 6(1)(c) — legal obligation |

**Note**: APEX-SENTINEL must obtain legal opinion per jurisdiction before deployment. Processing of location data under Romanian law (Law 677/2001 as aligned with GDPR) and any military/civil defence exception must be evaluated.

### 7.2 User Rights Implementation
| Right | Implementation | Response Time |
|-------|---------------|---------------|
| Right to access (Art. 15) | `/api/v1/user/data-export` endpoint | 30 days |
| Right to erasure (Art. 17) | `/api/v1/user/delete` — cascades all records | 72 hours |
| Right to portability (Art. 20) | JSON export of all user data | 30 days |
| Right to object (Art. 21) | Toggle in app settings: pause contribution | Immediate |
| Right to restriction (Art. 18) | Account freeze — data kept, no processing | Immediate |

### 7.3 Data Protection Impact Assessment (DPIA)
Required under GDPR Art. 35 due to:
- Systematic monitoring of a publicly accessible area
- Processing of location data at scale
- Potential for sensitive inference (presence patterns)

DPIA to be conducted with Romanian DPA (ANSPDCP) prior to public deployment.

### 7.4 Privacy Notice
Mandatory disclosure to node participants:
- What data is collected (confidence scores, coarsened location, RSSI values)
- What is NOT collected (raw audio, exact location, WiFi content)
- How long it is kept
- How to delete account and stop participation
- Contact for privacy enquiries: privacy@apex-sentinel.example.com

---

## 8. Threat Model — Privacy Risks

| Threat | Risk | Mitigation |
|--------|------|------------|
| Node location tracking via coarsened GPS | Medium — coarsened to ±50m grid but still present | Users warned; rotation option; no account linkage |
| Re-identification via pseudonymous node_id | Low — node_id non-reversible by design | Rotation every 30 days as option |
| NATS event interception | Low — mTLS on all connections | Certificate pinning + short-lived certs |
| Supabase breach exposing tracks | Medium — location data of detections | Encryption at rest; minimal retention |
| Operator misuse of dashboard | Medium — C2 has full track visibility | RBAC, immutable audit log, MFA |
| Audio data leak via side channel | Low — processed in isolated process | isolatedProcess=true; no disk writes |
| State surveillance reuse | Medium — potential weaponisation of infra | Open-source code; independent audit; minimal data model |
| Correlation attack across nodes | Low — coarsened + pseudonymous | Grid snapping prevents sub-50m correlation |

---

## 9. Privacy-Preserving Architecture Decisions

### ADR-P01: On-Device Audio Processing is Non-Negotiable
**Decision**: YAMNet inference runs 100% on-device. Raw audio NEVER transmitted.
**Rationale**: Users will not trust a system that uploads audio. Legal liability unacceptable. Model is 480KB — entirely feasible on device.

### ADR-P02: No Exact Location Transmission from Nodes
**Decision**: Coarsen to ±50m grid before any transmission.
**Rationale**: TDOA already has ±62m uncertainty. Coarsening loses <5% detection accuracy. Privacy gain is significant.

### ADR-P03: No Account Required to Participate
**Decision**: Pseudonymous node_id sufficient for network participation.
**Rationale**: Lower friction = more nodes = better coverage. Email/phone accounts for operators only.

### ADR-P04: WiFi RSSI Aggregates Only — No Packet Capture
**Decision**: Only per-channel mean/std RSSI transmitted. No SSIDs, no MACs, no payloads.
**Rationale**: RSSI anomaly detection requires only energy level. Packet content adds zero detection value. SSID/MAC collection = GDPR nightmare.

### ADR-P05: 30-Day Maximum Retention for Detection Events
**Decision**: All detection events auto-deleted after 30 days maximum.
**Rationale**: Detection events are tactical data with no long-term value. Minimise attack surface and legal exposure.

---

## 10. Privacy Technical Controls Checklist

```
[ ] YAMNet runs in isolated Android service (isolatedProcess=true)
[ ] No audio write to disk at any point
[ ] WiFi scan uses ScanResult.level (RSSI) ONLY — no SSID processing
[ ] GPS coordinates coarsened to 50m grid before NATS publish
[ ] node_id generated with Keystore-backed salt
[ ] node_id rotation available in settings
[ ] All NATS connections require mTLS client cert
[ ] Supabase columns with location data use pgcrypto encryption
[ ] pg_cron retention jobs active and tested
[ ] Privacy notice shown at onboarding (tap-to-agree)
[ ] Data export endpoint tested with GDPR 30-day SLA
[ ] Account deletion cascades all records (tested with DB triggers)
[ ] Audit log for all operator dashboard actions
[ ] DPIA documented before public deployment
[ ] DPA consultation completed (ANSPDCP for Romania)
```

---

*APEX-SENTINEL W1 | PRIVACY_ARCHITECTURE.md | PROJECTAPEX Doc 07/21*
