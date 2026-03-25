# APEX-SENTINEL W6 — Privacy Architecture

> Wave: W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
> Last updated: 2026-03-25
> Regulatory basis: GDPR (Regulation 2016/679), Romanian Law 190/2018

---

## 1. Privacy-by-Design Principles

APEX-SENTINEL is a military/civil-defence dual-use system deployed in active conflict-adjacent zones. Privacy engineering follows six principles applied across all W6 components:

| Principle | Implementation in W6 |
|---|---|
| **Data minimization** | Raw audio never persisted; only features stored |
| **Purpose limitation** | Acoustic data used for drone detection only — no secondary profiling |
| **Storage limitation** | Defined retention per table (see §6) |
| **Integrity & confidentiality** | mTLS between nodes, encrypted at rest (AES-256) |
| **Accountability** | Audit log for every model inference and dataset ingestion |
| **Privacy by default** | All privacy-protective settings are ON by default; operators must explicitly opt in to any data retention extension |

---

## 2. Data Categories and Classification

### 2.1 Data Taxonomy

| Data Type | Classification | Contains PII? | Raw Audio Stored? |
|---|---|---|---|
| Raw audio frames | EPHEMERAL — in-memory only | Potentially (voice) | NEVER |
| Mel spectrograms | TRANSIENT — in-memory only | No | NEVER |
| ML feature vectors (float32[]) | INTERNAL | No | No |
| Acoustic detection events | OPERATIONAL | No | No |
| Dataset item metadata | DATASET | Possibly (source URL) | No |
| Track positions (EKF state) | OPERATIONAL | No | No |
| Monte Carlo impact samples | OPERATIONAL | No | No |
| BRAVE1 messages | OUTPUT | Coarsened coords only | No |
| Node registration records | ADMINISTRATIVE | Yes (operator name) | No |
| Audit logs | COMPLIANCE | Yes (operator ID) | No |

### 2.2 PII Surface Area

APEX-SENTINEL's PII surface area is intentionally narrow:

- **Node registration:** operator name + contact email. Stored in `sentinel_nodes` table. Accessed only by system administrators.
- **Audit logs:** operator ID (UUID reference, not name). Cannot be correlated externally without access to node registration.
- **BRAVE1 messages:** coordinates coarsened to ±50m. No operator names. No device identifiers beyond node UUID.

---

## 3. Audio Data — Ephemeral Processing

### 3.1 In-Memory Processing Guarantee

All audio processing in W6 is strictly in-memory:

```
PCM frame arrives on node
  │
  ▼
VAD → FFT → MelSpectrogram → YAMNet ONNX
  │
  ▼ (features: Float32Array[512] — 2KB)
FalsePositiveGuard → AcousticDetection event
  │
  ▼
DISCARD: original PCM frame + spectrogram
  │
  ▼ (persist only)
acoustic_detections: { confidence, droneClass, features_compressed }
```

No audio buffering to disk. No audio transmission to cloud. The node processes and discards.

### 3.2 What "Features Compressed" Means

The `features_compressed` column stores a 512-dimensional Float32 embedding vector, BROTLI-compressed. This is the YAMNet penultimate layer output — not a reconstruction of the audio. It is mathematically infeasible to reconstruct the original audio from this embedding.

Storage: `512 × 4 bytes = 2048 bytes` → compressed to ~600–800 bytes.

### 3.3 When Audio MAY Be Temporarily Retained

Dataset pipeline operators building the training dataset may optionally retain audio files locally on their workstation. This is governed by `DatasetPipeline.ingest()`:

- Raw audio file stays on the operator's LOCAL filesystem only
- `dataset_items` table stores: `{id, filename, label, source_type, sample_rate, duration_ms, created_at}` — NOT the audio bytes
- If source is a Telegram OSINT URL: the URL is stored but the audio is NOT fetched to Supabase storage
- Operators must sign the dataset contributor agreement before ingesting data

---

## 4. Location Data — Coarsening

### 4.1 LocationCoarsener (retained from W1)

All coordinates in APEX-SENTINEL outputs are coarsened to ±50m before any persistence or transmission:

```typescript
interface LocationCoaresnerConfig {
  gridResolutionMeters: 50;      // snap to 50m grid
  applyToTables: [
    'acoustic_detections',
    'track_positions',
    'monte_carlo_results',
    'brave1_messages'
  ];
}
```

Raw EKF state (sub-meter precision) is held in-memory in `MultiTrackEKFManager`. It is NEVER written to the database at full precision.

### 4.2 Why ±50m is Sufficient for the Use Case

Drone detection use case requires city-block precision for alerting, not sub-meter precision. ±50m coarsening:
- Prevents reverse-engineering of sensor node positions from published detections
- Complies with Ukrainian / Romanian military OPSEC guidance on open-data position accuracy
- Satisfies GDPR data minimization (no more precise than needed)

---

## 5. Retention Schedule

### 5.1 Per-Table Retention

| Table | Retention | Deletion trigger | Notes |
|---|---|---|---|
| `acoustic_detections` | 90 days | Cron job nightly | Includes compressed features |
| `track_positions` | 90 days | Cascade from tracks | EKF history |
| `active_tracks` | Until track closes | On `status=closed` | Closed tracks aged out daily |
| `monte_carlo_results` | 30 days | Cron job | Impact propagation results |
| `brave1_messages` | 30 days | Cron job | Outbound alert archive |
| `dataset_items` | 1 year | Manual / operator | Training dataset metadata |
| `ml_model_versions` | Indefinite | Manual (admin only) | Model lineage required |
| `sentinel_nodes` | Duration of deployment | Manual (admin deregister) | Node registration |
| `audit_logs` | 2 years | Cron job | Compliance requirement |
| `node_health_events` | 7 days | Cron job | Operational noise |

### 5.2 Automated Retention Cron Jobs

```sql
-- Run nightly at 02:00 UTC via pg_cron

-- acoustic_detections: 90 days
DELETE FROM acoustic_detections
WHERE created_at < NOW() - INTERVAL '90 days';

-- monte_carlo_results: 30 days
DELETE FROM monte_carlo_results
WHERE created_at < NOW() - INTERVAL '30 days';

-- brave1_messages: 30 days
DELETE FROM brave1_messages
WHERE created_at < NOW() - INTERVAL '30 days';

-- node_health_events: 7 days
DELETE FROM node_health_events
WHERE created_at < NOW() - INTERVAL '7 days';
```

---

## 6. Right to Erasure (GDPR Article 17)

### 6.1 Cascade Delete Chain

If an operator requests erasure of data from a specific node or time window:

```sql
-- Erasure procedure: by node_id and time range
BEGIN;

-- Step 1: close affected tracks
UPDATE active_tracks
SET status = 'erased'
WHERE node_id = $node_id
  AND created_at BETWEEN $from AND $to;

-- Step 2: cascade to acoustic_detections
DELETE FROM acoustic_detections
WHERE track_id IN (
  SELECT id FROM active_tracks WHERE status = 'erased'
);

-- Step 3: cascade to track_positions
DELETE FROM track_positions
WHERE track_id IN (
  SELECT id FROM active_tracks WHERE status = 'erased'
);

-- Step 4: cascade to monte_carlo_results
DELETE FROM monte_carlo_results
WHERE track_id IN (
  SELECT id FROM active_tracks WHERE status = 'erased'
);

-- Step 5: remove erased tracks
DELETE FROM active_tracks WHERE status = 'erased';

-- Step 6: purge brave1_messages from same time window
DELETE FROM brave1_messages
WHERE node_id = $node_id
  AND created_at BETWEEN $from AND $to;

COMMIT;
```

### 6.2 Erasure Time Guarantee

Erasure requests are processed within 72 hours. The system does NOT maintain backups of individual detection records beyond the Supabase point-in-time recovery window (7 days). Erasure requests covering data older than 7 days are guaranteed not to exist in any backup.

---

## 7. BRAVE1 Message PII Stripping

Before any BRAVE1 message is transmitted externally:

```typescript
function stripPII(message: BRAVE1Message): BRAVE1Message {
  return {
    ...message,
    // Remove operator identity
    operatorName: undefined,
    operatorEmail: undefined,
    // Replace node ID with anonymous sentinel ID
    uid: anonymizeNodeId(message.nodeId),
    // Coarsen coordinates (already done by LocationCoarsener, belt-and-suspenders)
    lat: coarsen(message.lat, 50),
    lon: coarsen(message.lon, 50),
    // Remove raw remarks that might contain operator notes
    remarks: sanitizeRemarks(message.remarks),
  };
}
```

`sanitizeRemarks()` strips any content matching patterns: email addresses, phone numbers, names (via NER lightweight model), IP addresses, MAC addresses.

---

## 8. Consent and Node Registration

### 8.1 Operator Consent Flow

When a new APEX-SENTINEL node registers:

1. Operator receives the **Data Collection Policy** (DCP v1.0) via secure channel
2. Operator must acknowledge DCP by signing with node private key
3. Acknowledgement stored in `node_consent_records` table with timestamp
4. Without acknowledgement, node is registered but NOT permitted to publish detections

### 8.2 What Operators Consent To

- Acoustic data processed on-device and anonymized before cloud transmission
- Detection event metadata (class, confidence, coarsened position) stored for 90 days
- Aggregated data (not raw audio) may be shared with Romanian/NATO military authorities
- Model improvements may be trained on aggregated feature vectors (no raw audio)

### 8.3 Withdrawal of Consent

Operator may withdraw consent at any time. Within 24 hours:
- Node is deactivated in `sentinel_nodes` (status = 'consent_withdrawn')
- Erasure procedure (§6.1) runs automatically for all data from that node
- Node excluded from future model training runs

---

## 9. Cross-Border Data Transfer

### 9.1 NATS Cluster Topology

```
NATS cluster: EU-only
  Primary: eu-west-2 (Ireland)
  Replica: eu-central-1 (Frankfurt)

No data routed outside EU. BRAVE1 endpoints must be GDPR-approved.
```

### 9.2 BRAVE1 Recipient Approval

Before configuring a BRAVE1 transmission endpoint:
- Recipient must be on the GDPR-approved list maintained in `brave1_approved_endpoints`
- Transmission uses mTLS with endpoint certificate pinning
- Data transfer agreement (DTA) must be on file
- Recipient's jurisdiction must be EU or Adequacy Decision country

Approved jurisdictions for W6: EU member states, Ukraine (special military data sharing agreement), NATO ISAF partners with adequacy status.

---

## 10. Threat Model — Data Security

### 10.1 Threat Scenarios and Mitigations

| Threat | Likelihood | Mitigation |
|---|---|---|
| Rogue node injection | Medium | mTLS mutual auth between nodes, certificate pinned to node UUID |
| Data poisoning (dataset) | Low-Medium | Dataset validation pipeline: anomaly detection on spectrograms, human review gate for OSINT data |
| Model extraction (inference API) | Low | Inference-only API (no gradients exposed), rate limiting 100 req/min, output is class label not logits |
| Eavesdropping on NATS | Low | TLS 1.3 on all NATS connections, payload encrypted with AES-256-GCM |
| Node compromise → raw audio exfil | Low | Audio never written to disk; kernel memory does not persist across power cycle |
| Supabase credential leak | Low | Row Level Security on all tables; nodes use service role scoped to own node_id only |
| GPS spoofing → false impact calc | Medium | Monte Carlo propagator uses EKF covariance; spoofed positions produce high-uncertainty results flagged for human review |

### 10.2 mTLS Node Identity

Each node has a unique X.509 certificate issued at registration:

```
Subject: CN=sentinel-node-{node_uuid}, O=APEX-SENTINEL, C=RO
Key: ECDSA P-256
Valid: 1 year (auto-renew 30 days before expiry)
Pinned: NATS connection + Supabase API requests
```

---

## 11. ML-Specific Privacy Considerations

### 11.1 Training Data Provenance

All dataset items must have documented provenance:

```typescript
type DataSource =
  | 'telegram_osint'       // public Telegram channels
  | 'field_recording'      // consented field operators
  | 'synthetic'            // programmatically generated
  | 'audioset_mapped';     // existing public dataset
```

`telegram_osint` items: Telegram channel name stored but no user identifiers. Channel must be public. Private channel data is NOT permitted.

### 11.2 Federated Learning Readiness (W8 Deferred)

W6 does not implement federated learning. However, the architecture is designed to support it:
- Feature vectors (not raw audio) are the unit of sharing
- Differential privacy noise injection is a W8 work item
- W6 creates the `node_model_updates` table schema (empty) as a migration placeholder

### 11.3 Right to Object to Automated Decision-Making

GDPR Article 22 applies when automated detection could trigger military response. Mitigation:
- All APEX-SENTINEL outputs are ADVISORY — no automated engagement
- CursorOfTruth report explicitly states "HUMAN DECISION REQUIRED" on every output
- BRAVE1 messages tagged with `source: automated-advisory` to prevent autonomous interpretation

---

## 12. Data Protection Impact Assessment (DPIA) Summary

| Risk | Rating | Residual Risk |
|---|---|---|
| Acoustic surveillance of civilians | HIGH — audio collected in populated areas | LOW — ephemeral processing, no persistence |
| Position tracking of individuals | MEDIUM — EKF tracks moving objects | LOW — coarsened ±50m, 90-day retention |
| Military data in civilian cloud | HIGH | LOW — EU-only NATS, no raw data to cloud |
| Re-identification from features | LOW | NEGLIGIBLE — 512D embedding not reconstructable |
| Cross-border transfer | MEDIUM | LOW — approved endpoints only, DTA required |

DPIA conclusion: W6 as designed is compliant with GDPR and does not require a supervisory authority consultation under Article 36, provided the mTLS and ephemeral-audio controls are maintained in production.

---

*Generated: 2026-03-25 | APEX-SENTINEL W6 | PRIVACY_ARCHITECTURE.md*
