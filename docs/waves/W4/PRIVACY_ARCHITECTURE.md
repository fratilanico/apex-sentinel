# APEX-SENTINEL — PRIVACY_ARCHITECTURE.md
## W4 Dashboard Privacy Architecture
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. PRIVACY MODEL

### 1.1 What the Dashboard Handles

The C2 dashboard processes:
- **Track data**: geographic positions of detected UAVs (not people)
- **Alert data**: threat events with coordinates
- **Node data**: sensor positions (OPSEC-sensitive, not personal data)
- **Operator data**: authentication identity, action audit logs
- **Annotation data**: operator-authored notes (may contain operational intelligence)

The dashboard does NOT process:
- Raw audio recordings (stored in W1 mobile app only, never transmitted to dashboard)
- Video feeds
- Personal data of civilians
- Location data of operators (positions come from sensor nodes, not operators)

### 1.2 Regulatory Context

```
Applicable:
  GDPR Article 5(1)(f) — integrity and confidentiality
  GDPR Article 25      — data protection by design
  GDPR Article 30      — records of processing activities

Not applicable (defense context exemption — GDPR Art 2(2)(a/b)):
  This system operates in defense/national security context.
  GDPR exemptions apply for member states' national security operations.
  Privacy architecture still implemented to best-practice standard.
```

---

## 2. COORDINATE COARSENING

### 2.1 LocationCoarsener (inherited from W1)

All coordinates displayed to non-admin users are coarsened to ±50m precision.

```typescript
// src/lib/privacy/locationCoarsener.ts

const COARSEN_DEGREES = 0.00045; // ~50m at mid-latitudes

export function coarsenCoordinates(
  lat: number,
  lon: number,
  role: UserRole
): { lat: number; lon: number } {
  if (role === 'admin') {
    return { lat, lon }; // admin sees exact coordinates
  }

  // Round to nearest 0.00045° grid (~50m cells)
  const coarsenedLat = Math.round(lat / COARSEN_DEGREES) * COARSEN_DEGREES;
  const coarsenedLon = Math.round(lon / COARSEN_DEGREES) * COARSEN_DEGREES;

  return { lat: coarsenedLat, lon: coarsenedLon };
}
```

Applied in:
- `active_tracks_view` — coordinates coarsened at view level for non-admin roles (via RLS + view)
- `export-cot-bundle` Edge Function — CoT point element uses coarsened coords
- `AlertDetailPanel` component — renders coarsened coordinates in UI

### 2.2 CoT Export Coordinate Precision

CoT standard uses `ce` (circular error) field. W4 sets:
```xml
<point lat="50.234" lon="30.512" hae="120" ce="50" le="25"/>
```
- `ce="50"`: 50-meter circular error — explicitly declares coarsening
- `lat`/`lon` values: truncated to 3 decimal places (±55m precision)
- Admin export: `ce="10"`, 4 decimal places

---

## 3. ROLE-BASED DATA ACCESS

### 3.1 Data Visibility Matrix

```
Data                   operator  analyst  admin  civil_defense
─────────────────────────────────────────────────────────────
Active tracks (coords)   ✓ ±50m   ✓ ±50m   ✓ exact  ✓ ±50m
Track history            ✓        ✓        ✓        ✗
Alert details            ✓        ✓ R/O    ✓        ✓ simplified
CoT XML preview          ✓        ✓        ✓        ✗
Node IDs                 ✓        ✓        ✓        ✗
Node positions           ✓        ✓        ✓        ✗
Node coverage circles    ✓        ✓        ✓        ✗
Operator notes           ✓ own    ✓ all    ✓ all    ✗
Acknowledgement history  ✓        ✓        ✓        ✗
DEFCON level             ✓ read   ✓ read   ✓ R/W    ✓ read
CoT export               ✓        ✓        ✓        ✗
FreeTAKServer relay      ✓        ✗        ✓        ✗
Threat statistics        ✓ full   ✓ full   ✓ full   ✓ simplified
Session management       ✓ own    ✓ own    ✓ all    ✓ own
```

### 3.2 OPSEC — Node Data Restriction for civil_defense

Node IDs and positions are classified OPSEC in this deployment model. Civil defense coordinators are not cleared for sensor network topology.

```
Enforcement:
  1. RLS: sensor_nodes table — civil_defense JWT returns empty set
  2. Edge Function: get-node-coverage returns 403 for civil_defense role
  3. UI: NodeHealthList component not rendered for civil_defense role
  4. useCanSeeNodes() hook returns false for civil_defense
  5. Globe: NodeOverlay not mounted for civil_defense role
  6. CoT XML: cot_xml field returns null for civil_defense (no detail element)
```

---

## 4. AUDIT LOGGING

### 4.1 Actions Logged

Every significant operator action is logged to Supabase with:
- `user_id` (Supabase Auth UUID)
- `action_type`
- `resource_id` (track ID, alert ID, etc.)
- `timestamp` (server-side, not client-provided)
- `ip_address` (from request headers)
- `user_role` at time of action

```sql
CREATE TABLE operator_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  user_role       TEXT        NOT NULL,
  action_type     TEXT        NOT NULL,
  resource_type   TEXT        NOT NULL,  -- 'track' | 'alert' | 'export' | 'relay'
  resource_id     TEXT,
  metadata        JSONB,                 -- action-specific details
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INSERT only via RLS (no UPDATE, no DELETE)
-- Admin can SELECT all rows
-- Users can SELECT their own rows
```

Actions logged:
```
ALERT_ACKNOWLEDGE     : alert_acknowledgements INSERT also triggers this
TRACK_EXPORT_SINGLE   : single CoT file download
TRACK_EXPORT_BATCH    : batch CoT zip download
ALERT_RELAY_TAK       : relay to FreeTAKServer
NOTE_CREATE           : operator annotation created
NOTE_EDIT             : annotation edited
NOTE_DELETE           : soft delete of annotation
SESSION_START         : dashboard session created
SESSION_END           : explicit logout
DEFCON_CHANGE         : admin changes DEFCON level
```

### 4.2 Audit Log Immutability

```sql
-- RLS: audit log is INSERT-only for all users (including admin)
ALTER TABLE operator_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_authenticated ON operator_audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY audit_select_own ON operator_audit_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY audit_select_admin ON operator_audit_log
  FOR SELECT USING (auth.user_role() = 'admin');

-- NO UPDATE policy
-- NO DELETE policy
-- Admin cannot delete audit logs
```

---

## 5. GDPR COMPLIANCE (BEST EFFORT IN DEFENSE CONTEXT)

### 5.1 Exported CoT Contains No PII

```
What CoT contains:
  ✓ UAV position (coarsened)
  ✓ UAV classification (FPV_DRONE etc.)
  ✓ Detection confidence
  ✓ Timestamp
  ✓ CoT UID (APEX-TRK-XXXX format, not linked to any person)

What CoT does NOT contain:
  ✗ Operator user ID
  ✗ Node ID (which could reveal sensor deployment to adversary)
  ✗ Operator notes
  ✗ Exact coordinates beyond ±50m
  ✗ IP address or session information
```

### 5.2 Operator Notes Classification

```
Notes are classified by the operator at creation:
  UNCLASSIFIED  — may be shared externally
  CONFIDENTIAL  — operational details, not for export
  SECRET        — classified material, export locked

Notes with classification CONFIDENTIAL or SECRET:
  - Cannot be included in CoT exports
  - Cannot be read by civil_defense role
  - Displayed in UI with classification label badge
  - Audit logged on every read by non-author
```

### 5.3 Session Data Retention

```
dashboard_sessions:
  Retention: 90 days, then auto-deleted by pg_cron
  Exception: sessions with associated CRITICAL alert interactions: 365 days

operator_audit_log:
  Retention: 365 days (1 year operational requirement)
  Then: exported to cold storage (Supabase Storage bucket, encrypted)

operator_notes:
  Soft-deleted records: retained 90 days after soft-delete, then hard-deleted
  Active notes: retained indefinitely (operational intelligence value)

alert_acknowledgements:
  Retention: indefinite (immutable operational record)
```

---

## 6. SESSION SECURITY

```
Session timeout  : 8 hours (matches operational shift length)
Idle timeout     : none (operator may be watching without clicking)
Session storage  : Supabase Auth httpOnly cookie (not localStorage)
CSRF protection  : Next.js CSRF tokens on API routes
Concurrent sessions: allowed (operator may use 2 monitors)
Session expiry UX: modal overlay asking for re-authentication,
                   dashboard state preserved behind modal
```

---

*PRIVACY_ARCHITECTURE.md — APEX-SENTINEL W4 — approved 2026-03-24*
