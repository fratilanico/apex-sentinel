# APEX-SENTINEL — Privacy Architecture
## W2 | PROJECTAPEX Doc 07/21 | 2026-03-24

---

## 1. Privacy Design Principles

APEX-SENTINEL W2 processes data about airspace events, node positions, and operator actions. The architecture is designed around the following privacy principles, derived from GDPR (UK GDPR / Data Protection Act 2018) and general information security best practice:

**1. Data minimisation at source.** Nodes compute derived features (confidence scores, frequencies) from raw sensor data. Raw audio, raw RF samples, and unprocessed images never leave the device. This is enforced at the protocol layer, not just policy.

**2. Privacy by default.** All new data flows default to the most private configuration. Relaxing privacy controls requires explicit configuration change with audit trail.

**3. Coarsen before persist.** Position data is coarsened to reduced-precision grid cells before being transmitted over NATS and before being written to the database. The original GPS precision is not recoverable from stored data.

**4. Append-only audit.** All operator actions are logged in an append-only table. This cannot be turned off, even by `ops_admin`. The audit log itself is the accountability mechanism.

**5. Retention enforcement.** Data retention is automated via pg_cron, not manual cleanup. All tables have documented retention periods. Retention is a privacy control, not just storage management.

---

## 2. NATS Event Schema Privacy Audit

### 2.1 Fields Transmitted Over NATS

The following table documents every field in the `sentinel.gate3.detection.{geo_sector}` NATS message, its privacy classification, and the justification for inclusion:

| Field | Type | Privacy Class | Justification | Notes |
|-------|------|---------------|---------------|-------|
| event_id | ULID | Low | Required for deduplication | No PII |
| node_id | Text | Medium | Required for TDoA routing | Pseudonymised ID |
| timestamp_us | INT64 | Low | Required for TDoA calculation | No PII |
| lat | Float64 | Medium | Position of detection | Coarsened to ±50m |
| lon | Float64 | Medium | Position of detection | Coarsened to ±50m |
| alt_m | Float32 | Low | Altitude estimate | Low precision |
| acoustic_confidence | Float32 | Low | Derived feature only | No raw audio |
| rf_confidence | Float32 | Low | Derived feature only | No raw RF |
| sdr_confidence | Float32 | Low | Derived feature only | No raw SDR |
| fused_confidence | Float32 | Low | Computed fusion score | No raw data |
| threat_class | Text | Low | Classification label | e.g. DJI_MAVIC |
| peak_freq_hz | Integer | Low | Single frequency value | No spectrum data |
| rssi_anomaly_db | Float32 | Low | dB above baseline | No raw RSSI |
| relay_path | Text[] | Medium | Array of node_ids | Mesh topology visible |
| geo_sector | Text | Medium | Geohash cell | ±19m × 19m cell |

**Explicitly suppressed fields (never in NATS payload):**
- Raw audio PCM data
- Raw audio waveform
- Audio samples or buffers
- Full spectrum data (only peak_freq_hz transmitted)
- Exact GPS coordinates (coarsened before inclusion)
- Device serial numbers or hardware identifiers (only node_id)
- Operator names or user IDs (not present in detection events)
- Network MAC addresses

### 2.2 Position Coarsening Implementation

Position data is coarsened in the Edge Function before NATS publication and before database insertion:

```typescript
// In ingest-event Edge Function
function coarsenPosition(lat: number, lon: number): { lat: number; lon: number } {
  // Round to nearest 0.0005 degree grid (≈50m at equator)
  // 0.0001 degree ≈ 11m; 0.0005 degree ≈ 55m; meets ±50m requirement
  const GRID = 0.0005;
  return {
    lat: Math.round(lat / GRID) * GRID,
    lon: Math.round(lon / GRID) * GRID
  };
}
```

The exact GPS fix (±3m) is used only for the TDoA solver computation within the Edge Function's ephemeral memory. It is not persisted.

### 2.3 Node Heartbeat Privacy

Node heartbeats include position (lat/lon) which is coarsened to ±111m (3 decimal places) before storage:

```typescript
function coarsenHeartbeatPosition(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 1000) / 1000,   // 3 decimal places = ±111m
    lon: Math.round(lon * 1000) / 1000
  };
}
```

The coarser grid for node positions vs detection events is intentional: node positions are infrastructure data (where the sensor is deployed), not event data. Operators do not need sub-100m accuracy for node fleet management.

---

## 3. Supabase RLS Policy Verification

### 3.1 RLS Policy Summary Matrix

| Table | node_agent | ops_admin | c2_operator | privacy_officer | anon |
|-------|-----------|-----------|-------------|-----------------|------|
| nodes | SELECT own, UPDATE own | ALL | SELECT (not revoked) | SELECT | DENY |
| node_heartbeats | INSERT own, SELECT own | ALL | DENY | DENY | DENY |
| detection_events | INSERT own, SELECT own | ALL | SELECT | SELECT | DENY |
| tracks | DENY | ALL | SELECT | SELECT | DENY |
| alerts | DENY | ALL | SELECT, UPDATE (workflow only) | DENY | DENY |
| operator_audit_log | DENY | SELECT own | DENY | SELECT ALL | DENY |

### 3.2 Critical RLS Rules

**Rule 1: Node isolation**
A node authenticated as `nde_abc123` cannot read records belonging to `nde_def456`. This is enforced by `auth.uid()::text = node_id` predicates on all node-authenticated policies.

Verification query (run after each migration):
```sql
-- Test node isolation: using node_agent JWT with sub=nde_abc123
-- Should return 0 rows (not node_abc123's records)
SELECT count(*) FROM public.node_heartbeats
WHERE node_id != current_user  -- substitute actual auth.uid() in integration test
LIMIT 1;
-- Expected: 0
```

**Rule 2: Audit log append-only**
No role (including ops_admin) has UPDATE or DELETE permissions on `operator_audit_log`. Only INSERT is permitted, and only via service_role (used by Edge Functions).

Verification:
```sql
-- Attempt UPDATE as ops_admin role
SET ROLE ops_admin;
UPDATE public.operator_audit_log SET action = 'tampered' WHERE id = 'aud_test';
-- Expected: ERROR: permission denied for table operator_audit_log
RESET ROLE;
```

**Rule 3: c2_operator cannot access node infrastructure**
```sql
-- As c2_operator
SET ROLE c2_operator;
SELECT * FROM public.node_heartbeats LIMIT 1;
-- Expected: 0 rows (RLS denies)
SELECT * FROM public.operator_audit_log LIMIT 1;
-- Expected: 0 rows (RLS denies)
RESET ROLE;
```

**Rule 4: RLS cannot be bypassed via JOINs**
PostgreSQL RLS applies per-table at the row level, even in JOINs. A c2_operator joining `detection_events` → `nodes` will still be restricted by the `nodes` RLS policy.

### 3.3 RLS Bypass Audit

The `service_role` key bypasses RLS. It is used ONLY by:
- TDoA Correlation Service (writes to tracks, detection_events)
- Track Manager (writes to tracks)
- Alert Router (writes to alerts)
- pg_cron retention jobs

The service_role key is NEVER:
- Exposed to frontend clients
- Included in NATS credentials distributed to nodes
- Logged in any accessible log file

Service_role key rotation: every 90 days, coordinated with Supabase dashboard.

---

## 4. Edge Function Input Validation

### 4.1 Raw Audio Rejection

The `ingest-event` function inspects all incoming JSON payloads for field names associated with raw audio data:

```typescript
const PROHIBITED_AUDIO_FIELDS = new Set([
  'audio',
  'audio_bytes',
  'audio_data',
  'waveform',
  'pcm',
  'pcm_data',
  'samples',
  'raw_audio',
  'audio_buffer',
  'sound',
  'recording'
]);

function rejectRawAudio(body: Record<string, unknown>): void {
  // Check all keys in submitted object (recursive check for nested objects)
  const checkKeys = (obj: Record<string, unknown>, path: string): void => {
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (PROHIBITED_AUDIO_FIELDS.has(lowerKey)) {
        throw new ValidationError('RAW_AUDIO_REJECTED',
          `Field '${path ? path + '.' : ''}${key}' is not permitted. Raw audio must not leave the device.`
        );
      }
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        checkKeys(obj[key] as Record<string, unknown>, `${path}.${key}`);
      }
    }
  };

  checkKeys(body, '');
}
```

This check runs BEFORE any other processing. A payload containing a raw audio field is rejected at the perimeter.

### 4.2 Payload Size Enforcement

```typescript
const MAX_PAYLOAD_BYTES = 65536;  // 64KB

async function validatePayloadSize(request: Request): Promise<void> {
  const contentLength = parseInt(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_PAYLOAD_BYTES) {
    throw new ValidationError('OVERSIZED_PAYLOAD',
      `Payload size ${contentLength} bytes exceeds maximum ${MAX_PAYLOAD_BYTES} bytes`
    );
  }
}
```

YAMNet model files are distributed via a separate controlled channel (`sentinel.model.update`), not via ingest-event. A valid detection event with all fields will never exceed 1KB; 64KB is a generous limit that still blocks audio files (minimum audio size: ~10KB even at lowest quality).

### 4.3 Timestamp Validation

```typescript
const MAX_TIMESTAMP_SKEW_US = 500_000;  // 500ms

function validateTimestampSkew(timestamp_us: bigint): void {
  const serverNowUs = BigInt(Date.now()) * 1000n;
  const skewUs = timestamp_us - serverNowUs;
  const absSkewUs = skewUs < 0n ? -skewUs : skewUs;

  if (absSkewUs > MAX_TIMESTAMP_SKEW_US) {
    throw new ValidationError('INVALID_TIMESTAMP',
      `Event timestamp is ${Number(absSkewUs) / 1000}ms from server clock. ` +
      `Maximum allowed skew: ${MAX_TIMESTAMP_SKEW_US / 1000}ms. ` +
      `Ensure node NTP synchronisation is functioning.`
    );
  }
}
```

This prevents replay attacks with old events. A node submitting events from 5 minutes ago (e.g. after reconnecting from mesh) must use the re-sync endpoint, not ingest-event.

---

## 5. Operator Audit Log Design

### 5.1 What Gets Logged

Every significant operator action is logged to `operator_audit_log`. The logging happens at the Edge Function level, not at the application level, so it cannot be bypassed by frontend code.

```typescript
interface AuditLogEntry {
  operator_id: string;       // auth.uid() from JWT
  action: AuditAction;       // from allowed action enum
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;  // action-specific structured data
  ip_addr: string;           // coarsened to /24 for IPv4, /48 for IPv6
  user_agent: string;        // truncated to 500 chars
  outcome: 'success' | 'failure' | 'partial';
}
```

**Actions that must be logged (complete list):**

| Action | When | Details included |
|--------|------|-----------------|
| login | JWT issued | method, ip |
| logout | JWT revoked or session ended | session_duration_s |
| node_approve | Node state PENDING → ONLINE (manual approval) | node_id, approver |
| node_force_offline | Operator forces node to OFFLINE | node_id, reason |
| node_revoke_cert | Certificate revoked | node_id, reason, cert_fingerprint |
| alert_acknowledge | Alert state → acknowledged | alert_id, track_id, notes |
| alert_action | Alert state → actioned | alert_id, track_id, notes |
| config_change | KV store key updated | key, old_value_hash, new_value_hash |
| stream_update | NATS stream configuration changed | stream_name, changes |
| data_export | Audit log or detection data exported | from_date, to_date, record_count |
| audit_log_view | Privacy officer views audit log | filter_parameters |
| user_create | New operator account created | new_user_id, role |
| user_disable | Operator account disabled | disabled_user_id, reason |
| manual_event_inject | Detection event manually created | event_id, reason |

### 5.2 IP Address Coarsening

Before storing IP addresses in the audit log, they are coarsened:

```typescript
function coarsenIPAddress(ip: string): string {
  if (ip.includes(':')) {
    // IPv6: zero the last 80 bits (keep /48)
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':') + ':0000:0000:0000:0000:0000';
  } else {
    // IPv4: zero the last octet (keep /24)
    const parts = ip.split('.');
    return parts.slice(0, 3).join('.') + '.0';
  }
}
```

This provides enough information to identify the network origin of an action (useful for detecting compromised credentials) without storing the precise IP of an individual operator.

### 5.3 Audit Log Export

The privacy officer can export the audit log for compliance reporting:

```
GET /functions/v1/audit-log
  Query params:
    from: ISO8601 datetime (required)
    to: ISO8601 datetime (required, max range: 90 days)
    action?: filter by specific action
    operator_id?: filter by operator
    resource_id?: filter by resource
    format: 'jsonl' | 'csv' (default: jsonl)

Auth: JWT with role=privacy_officer

Response headers:
  Content-Type: application/jsonl (or text/csv)
  Content-Disposition: attachment; filename=audit_export_2026-03-24.jsonl
  X-Record-Count: 2847

JSONL format (one JSON object per line):
  {"id":"aud_...","operator_id":"op_...","action":"alert_acknowledge",...}
```

Export operations are themselves logged to the audit trail.

---

## 6. NATS mTLS Certificate Lifecycle

### 6.1 Certificate Hierarchy and Validity Periods

```
APEX-SENTINEL Root CA
  Validity: 10 years (offline, HSM-backed)
  Key: ECDSA P-384
  Storage: Offline HSM (Nitrokey or Thales)

Intermediate CA: Nodes
  Validity: 2 years (renewed annually)
  Key: ECDSA P-256
  Storage: Encrypted on NATS admin server, air-gapped signing

Intermediate CA: Services
  Validity: 2 years
  Key: ECDSA P-256

Leaf Certificates: Nodes
  Validity: 90 days
  Key: ECDSA P-256
  CN: {node_id}
  Extensions: extendedKeyUsage = clientAuth
  Rotation: Automated (see Section 6.2)

Leaf Certificates: NATS Server Nodes
  Validity: 365 days
  Key: ECDSA P-256
  SAN: DNS:{hostname}, IP:{internal_ip}
  Rotation: Manual with 30-day warning

Leaf Certificates: Services
  Validity: 365 days
  Key: ECDSA P-256
  Rotation: Manual with 30-day warning
```

### 6.2 Automated Certificate Rotation for Nodes

Node certificates rotate automatically every 90 days. The process:

```
Day 76 (14 days before expiry):
  1. pg_cron job: SELECT nodes WHERE cert_expires_at < NOW() + INTERVAL '14 days'
  2. Publish notification to sentinel.node.{node_id}: {type: 'cert_rotation_required', deadline: ...}
  3. Node receives notification in next heartbeat response: {cert_rotation_required: true, deadline: ...}

Day 83 (7 days before expiry):
  1. If node has not yet initiated rotation: raise LOW alert
  2. Continue monitoring

Day 90 (expiry):
  1. Certificate rejected at mTLS handshake
  2. Node transitions to OFFLINE state
  3. HIGH alert raised: "Node nde_... certificate expired, manual intervention required"

Rotation process (initiated by node on day 76-89):
  1. Node generates new ECDSA P-256 key pair
  2. Node submits CSR to rotation endpoint: POST /functions/v1/cert-rotate
  3. Edge Function validates:
     a. Current certificate is still valid (not yet expired)
     b. node_id in CSR CN matches existing registration
     c. Old certificate fingerprint matches database
  4. Edge Function signs new CSR using Node Intermediate CA
  5. New certificate returned to node
  6. Node tests new certificate by connecting to NATS
  7. Node sends heartbeat with new certificate
  8. Edge Function updates nodes.cert_fingerprint and cert_expires_at
  9. Old certificate added to CRL within 1 hour

Emergency revocation:
  POST /functions/v1/cert-revoke (ops_admin only)
  1. Node state set to REVOKED immediately
  2. Certificate added to CRL
  3. NATS connection from revoked certificate rejected within 60s (CRL refresh interval)
  4. operator_audit_log entry created
```

### 6.3 Certificate Revocation

NATS checks client certificates against a CRL (Certificate Revocation List) or OCSP. Configuration:

```
NATS mTLS config:
  revocation_check: true
  crl_uri: https://pki.sentinel.apex-os.io/node-ca.crl
  crl_cache_ttl: 60s  # CRL refreshed every 60 seconds
```

The CRL is a DER-encoded X.509 v2 CRL, signed by the Node Intermediate CA. It is served via HTTPS from a high-availability endpoint.

On revocation:
- CRL updated within 10 seconds
- All NATS nodes refresh CRL within 60 seconds
- Revoked node's connections closed within 60-70 seconds

---

## 7. Data Retention Enforcement

### 7.1 Retention Policy Table

| Table | Retention Period | Justification | pg_cron Schedule |
|-------|-----------------|---------------|-----------------|
| node_heartbeats | 90 days | Operational troubleshooting; not needed beyond 90d | Daily 03:00 UTC |
| detection_events | 365 days | 12-month trend analysis; GDPR Article 17 | Daily 03:15 UTC |
| tracks | 365 days (90d for dropped) | Active tracks need longer retention | Daily 03:30/03:45 UTC |
| alerts | 365 days | Incident record keeping | Daily 04:00 UTC |
| operator_audit_log | 365 days minimum | GDPR Article 30 processing records | Daily 04:30 UTC |

**Note on operator_audit_log:** The 365-day minimum is a compliance floor. Individual deployments with specific legal obligations may extend this to 3-7 years via pg_cron configuration change (logged as config_change in audit log).

### 7.2 Retention Monitoring

A monitoring query runs daily after retention jobs to confirm execution:

```sql
-- Check pg_cron job execution log
SELECT
  jobname,
  run_started_at,
  run_ended_at,
  EXTRACT(EPOCH FROM (run_ended_at - run_started_at)) AS duration_s,
  return_message
FROM cron.job_run_details
WHERE run_started_at > NOW() - INTERVAL '25 hours'
ORDER BY run_started_at DESC;
```

If any retention job fails (return_message != 'SELECT'), a HIGH alert is raised.

### 7.3 Partition Cleanup

For partitioned tables, retention is more efficient at the partition level. When all data in a partition is past the retention period, the entire partition can be dropped rather than row-by-row deletion:

```sql
-- Example: drop node_heartbeats partition older than 90 days
-- Runs monthly (pg_cron job)
DO $$
DECLARE
  cutoff_month TEXT := TO_CHAR(NOW() - INTERVAL '90 days', 'YYYY_MM');
  partition_name TEXT := 'node_heartbeats_' || cutoff_month;
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = partition_name) THEN
    EXECUTE FORMAT('DROP TABLE IF EXISTS public.%I', partition_name);
    RAISE NOTICE 'Dropped partition: %', partition_name;
  END IF;
END;
$$;
```

---

## 8. GDPR Compliance Mapping

### 8.1 Article 5 — Principles of Processing

| Principle | Implementation |
|-----------|---------------|
| Lawfulness, fairness, transparency | Deployment requires data processing agreement; operators receive data flow documentation |
| Purpose limitation | Detection events used only for airspace safety; not cross-referenced for commercial purposes |
| Data minimisation | Acoustic features only; no raw audio. Position coarsened. See Section 2. |
| Accuracy | Confidence scores indicate uncertainty; position_error_m quantifies accuracy |
| Storage limitation | Automated retention via pg_cron; see Section 7 |
| Integrity and confidentiality | mTLS in transit; encryption at rest (Supabase AES-256); RLS at application layer |

### 8.2 Article 17 — Right to Erasure

Implemented via `public.gdpr_cascade_delete_node()` function (see DATABASE_SCHEMA.md §10).

Key design decisions:
- **Heartbeats are deleted** (precise time-series location data; no value after node decommission)
- **Detection events are anonymised, not deleted** (they may be part of confirmed tracks that have operational/legal value; position coarsened to ±11km; node_id replaced with pseudonym)
- **Audit log entries are NOT deleted** (Article 30 obligation to maintain processing records conflicts with Article 17; legal obligation prevails)
- **Tracks are not modified** (tracks are derived analytical records, not personal data; the drone is the subject, not a person)

### 8.3 Article 30 — Records of Processing Activities

APEX-SENTINEL maintains records of processing via the `operator_audit_log` table. Key fields:
- What processing occurred (`action` field)
- Who performed it (`operator_id`, pseudonymised)
- When (`created_at`)
- On what data (`resource_type`, `resource_id`)
- From where (`ip_addr`, coarsened)
- What the outcome was (`outcome`, `details`)

### 8.4 Article 25 — Data Protection by Design

Privacy controls are architectural, not policy-level:
- Raw audio rejection is in Edge Function code (not a policy statement)
- Position coarsening is in the data pipeline (not a configuration option operators can override)
- RLS policies are database-enforced (not application-level access controls)
- Audit logging is in the Edge Function (not a frontend feature that can be disabled)

---

## 9. Deployment Security Checklist

Before W2 goes live, the Privacy Officer must verify:

```
□ All NATS connections use mTLS 1.3 (verify with: openssl s_client -connect nats:4222)
□ No plain-text NATS connections in any service configuration
□ Edge Function logs do not contain raw event payloads (only request_id, status code)
□ Supabase logs do not contain JWT tokens (configured in Supabase dashboard)
□ service_role key is not present in any public repository
□ node_heartbeats and operator_audit_log are NOT in Supabase Realtime publication
□ RLS enabled on all 6 tables (verified via pg_tables query)
□ All 6 retention pg_cron jobs are scheduled and have run at least once
□ GDPR cascade delete function tested on staging with a decommissioned test node
□ Certificate rotation tested: node cert expired in staging, rotation completed automatically
□ ingest-event: rejection test passed with payload containing 'audio' field
□ ingest-event: rejection test passed with 65537-byte payload
□ operator_audit_log: confirmed no UPDATE/DELETE policies exist
□ Privacy Officer has documented data flow for Article 30 register
```

---

## 10. Threat Model (Privacy-Relevant Threats)

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Compromised node submits raw audio | Medium | High | Edge Function rejects by field name AND size |
| Operator exports data for unauthorised use | Low | High | Export logged; privacy officer reviews exports quarterly |
| mTLS certificate cloned and used fraudulently | Low | High | Certificate pinned in database; revocation within 70s |
| SQL injection via event payload | Low | High | Parameterised queries only; Supabase Edge Functions use prepared statements |
| Service_role key leaked in logs | Medium | Critical | Supabase log masking; CI/CD secret scanning |
| NATS cluster compromise: all messages readable | Very Low | High | mTLS mutual auth; payload contains no PII; worst case: detection event metadata exposed |
| Aggregate inference from detection events | Medium | Medium | Position coarsening limits re-identification; no personal data in events |
| Audit log tampering | Low | Critical | Append-only RLS; Postgres WAL provides cryptographic integrity |
