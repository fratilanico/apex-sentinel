# APEX-SENTINEL — API_SPECIFICATION.md
## W4 API Specification — Edge Functions, Realtime Channels, NATS Subjects
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. OVERVIEW

W4 adds 5 new Supabase Edge Functions. All functions are deployed to:
`https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/`

Authentication: All Edge Functions require `Authorization: Bearer <supabase-jwt>` header.
JWT obtained from `supabase.auth.getSession()` on the client.

Error format (all endpoints):
```json
{
  "error": {
    "code": "TRACK_NOT_FOUND",
    "message": "Track TRK-A7F2 not found",
    "status": 404
  }
}
```

All timestamps: ISO 8601 UTC (`2026-03-24T14:23:07.000Z`).

---

## 2. EDGE FUNCTIONS

### 2.1 get-track-history

```
Path      : POST /functions/v1/get-track-history
Purpose   : Returns paginated historical position events for a track.
            Used by OpenMCT telemetry provider for timeline rendering.
Auth      : Required (any role)
```

#### Request

```json
{
  "track_id": "TRK-A7F2",
  "start": 1742812800000,
  "end": 1742816400000,
  "page": 1,
  "page_size": 500,
  "include_confidence": true,
  "include_detection_gates": false
}
```

Field spec:
```
track_id            : string  REQUIRED  — track ID (matches tracks.id)
start               : number  REQUIRED  — Unix timestamp ms, start of range
end                 : number  REQUIRED  — Unix timestamp ms, end of range
page                : number  OPTIONAL  default 1
page_size           : number  OPTIONAL  default 500, max 2000
include_confidence  : boolean OPTIONAL  default true
include_detection_gates: boolean OPTIONAL default false
```

#### Response 200

```json
{
  "track_id": "TRK-A7F2",
  "threat_class": "FPV_DRONE",
  "range": {
    "start": 1742812800000,
    "end": 1742816400000
  },
  "pagination": {
    "page": 1,
    "page_size": 500,
    "total_points": 847,
    "total_pages": 2,
    "has_next": true
  },
  "points": [
    {
      "t": 1742812800000,
      "lat": 50.2341,
      "lon": 30.5124,
      "alt_m": 120,
      "confidence": 0.943,
      "hdg_deg": 247,
      "spd_kmh": 85,
      "node_id": "NODE-007"
    }
  ]
}
```

#### Edge Function implementation

```typescript
// supabase/functions/get-track-history/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', status: 405 } }), { status: 405 });
  }

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', status: 401 } }), { status: 401 });

  const body = await req.json();
  const { track_id, start, end, page = 1, page_size = 500 } = body;

  if (!track_id || !start || !end) {
    return new Response(JSON.stringify({ error: { code: 'MISSING_PARAMS', status: 400 } }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', status: 401 } }), { status: 401 });
  }

  const startDate = new Date(start).toISOString();
  const endDate = new Date(end).toISOString();
  const offset = (page - 1) * page_size;

  const { data, error, count } = await supabase
    .from('track_position_events')
    .select('detected_at, latitude, longitude, altitude_m, confidence, heading_deg, speed_kmh, node_id', { count: 'exact' })
    .eq('track_id', track_id)
    .gte('detected_at', startDate)
    .lte('detected_at', endDate)
    .order('detected_at', { ascending: true })
    .range(offset, offset + page_size - 1);

  if (error) {
    return new Response(JSON.stringify({ error: { code: 'DB_ERROR', message: error.message, status: 500 } }), { status: 500 });
  }

  const points = data.map(p => ({
    t: new Date(p.detected_at).getTime(),
    lat: p.latitude,
    lon: p.longitude,
    alt_m: p.altitude_m,
    confidence: p.confidence,
    hdg_deg: p.heading_deg,
    spd_kmh: p.speed_kmh,
    node_id: p.node_id,
  }));

  const total_pages = Math.ceil((count ?? 0) / page_size);

  return new Response(JSON.stringify({
    track_id,
    range: { start, end },
    pagination: { page, page_size, total_points: count, total_pages, has_next: page < total_pages },
    points,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
```

---

### 2.2 get-node-coverage

```
Path      : GET /functions/v1/get-node-coverage
Purpose   : Returns all sensor nodes with position and coverage radius
            for rendering the NodeOverlay on the globe.
Auth      : Required (not civil_defense)
```

#### Request

```
GET /functions/v1/get-node-coverage?tier=1,2&status=ONLINE
```

Query params:
```
tier    : optional  comma-separated tier filter "1,2,3,4"
status  : optional  "ONLINE" | "OFFLINE" | "ALL" (default ALL)
```

#### Response 200

```json
{
  "nodes": [
    {
      "id": "NODE-007",
      "display_name": "Alpha-7",
      "latitude": 50.2250,
      "longitude": 30.4980,
      "tier": 1,
      "coverage_radius_m": 3000,
      "status": "ONLINE",
      "last_heartbeat_at": "2026-03-24T14:22:58Z",
      "battery_pct": null,
      "is_mobile": false,
      "has_acoustic": true,
      "has_rf": true,
      "has_optical": false,
      "detections_24h": 12,
      "uptime_24h_pct": 99.2
    }
  ],
  "total": 47,
  "online": 44,
  "offline": 3,
  "fetched_at": "2026-03-24T14:23:07Z"
}
```

#### Response 403 (civil_defense role)

```json
{
  "error": {
    "code": "ROLE_FORBIDDEN",
    "message": "Node coverage data not available for this role",
    "status": 403
  }
}
```

---

### 2.3 acknowledge-alert

```
Path      : POST /functions/v1/acknowledge-alert
Purpose   : Mark an alert as acknowledged by the current operator.
            Inserts into alert_acknowledgements (immutable audit record).
Auth      : Required (operator or admin role only)
```

#### Request

```json
{
  "alert_id": "ALT-00247",
  "note": "Tracked. Dispatch unit Alpha-3."
}
```

```
alert_id  : string  REQUIRED
note      : string  OPTIONAL  — attached as operator_notes record
```

#### Response 200

```json
{
  "acknowledgement_id": "uuid-...",
  "alert_id": "ALT-00247",
  "acknowledged_at": "2026-03-24T14:23:07Z",
  "user_id": "uuid-...",
  "user_role": "operator"
}
```

#### Response 409 (already acknowledged by same user)

```json
{
  "error": {
    "code": "ALREADY_ACKNOWLEDGED",
    "message": "Alert ALT-00247 already acknowledged by this user",
    "status": 409
  }
}
```

#### Response 403 (analyst or civil_defense)

```json
{
  "error": {
    "code": "ROLE_FORBIDDEN",
    "message": "Analyst role cannot acknowledge alerts",
    "status": 403
  }
}
```

---

### 2.4 export-cot-bundle

```
Path      : POST /functions/v1/export-cot-bundle
Purpose   : Generate CoT XML for one or more tracks over a time range.
            Returns single .cot file or .zip of multiple .cot files.
Auth      : Required (operator, analyst, admin only — not civil_defense)
```

#### Request

```json
{
  "mode": "batch_range",
  "track_ids": null,
  "start": 1742812800000,
  "end": 1742816400000,
  "format": "zip"
}
```

Modes:
```
single        : export one track's current state as .cot
                requires: track_ids = ["TRK-A7F2"]
                returns: single .cot file

batch_ids     : export multiple specific tracks
                requires: track_ids = ["TRK-A7F2", "TRK-B3C1"]
                format: zip

batch_range   : export all tracks detected in time window
                requires: start + end timestamps
                format: zip

format options: "zip" (default for batch) | "tar.gz"
```

#### Response 200 (single track)

```
Content-Type: application/xml
Content-Disposition: attachment; filename="TRK-A7F2_20260324T142307Z.cot"

<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
  uid="APEX-TRK-A7F2"
  type="a-h-A-M-F-Q"
  time="2026-03-24T14:21:33.000Z"
  start="2026-03-24T14:21:33.000Z"
  stale="2026-03-24T14:51:33.000Z"
  how="m-g">
  <point lat="50.234" lon="30.512" hae="120" ce="50" le="25"/>
  <detail>
    <contact callsign="APEX-TRK-A7F2"/>
    <__group name="Threats" role="HVT"/>
    <apex_sentinel
      threat_class="FPV_DRONE"
      confidence="0.943"
      detection_gates="ACOUSTIC,RF"
      first_seen="2026-03-24T14:21:33Z"/>
  </detail>
</event>
```

#### Response 200 (batch)

```
Content-Type: application/zip
Content-Disposition: attachment; filename="apex-sentinel-export-20260324T142307Z.zip"

[binary zip data]
```

CoT type mapping:
```
FPV_DRONE    : a-h-A-M-F-Q   (hostile aircraft, multi-rotor, fixed-wing, quadrotor)
SHAHED       : a-h-A-M-F     (hostile aircraft, military, fixed-wing)
HELICOPTER   : a-h-A-M-H     (hostile aircraft, military, helicopter)
FIXED_WING   : a-h-A-M-F-P   (hostile aircraft, military, fixed-wing, prop)
UNKNOWN      : a-u-A         (unknown aircraft)
FRIENDLY     : a-f-A         (friendly aircraft)
```

Privacy enforcement: coordinates coarsened to ±50m (±0.00045° lat/lon) for all roles except admin.

---

### 2.5 get-threat-stats

```
Path      : GET /functions/v1/get-threat-stats
Purpose   : Returns precomputed threat statistics for ThreatStatsPanel.
Auth      : Required (any role; civil_defense gets coarsened metrics)
```

#### Request

```
GET /functions/v1/get-threat-stats?window=24h
```

```
window  : "1h" | "6h" | "24h" | "7d"  default "24h"
```

#### Response 200

```json
{
  "window": "24h",
  "computed_at": "2026-03-24T14:23:07Z",
  "metrics": {
    "detections_in_window": 47,
    "detections_per_hour": 1.96,
    "false_positive_rate_pct": 3.2,
    "mean_confidence_pct": 71.3,
    "critical_alerts": 8,
    "active_tracks": 3,
    "node_uptime_pct": 94.7,
    "alert_ack_rate_pct": 83.3,
    "detection_trend_pct": 23.0,
    "by_class": {
      "FPV_DRONE": 31,
      "SHAHED": 8,
      "HELICOPTER": 3,
      "FIXED_WING": 2,
      "UNKNOWN": 3
    }
  }
}
```

Civil defense role response (coarsened):
```json
{
  "window": "24h",
  "computed_at": "2026-03-24T14:23:07Z",
  "metrics": {
    "active_tracks": 3,
    "threat_level": "ELEVATED",
    "note": "Detailed statistics restricted to operational users"
  }
}
```

---

## 3. NEXT.JS API ROUTES

### 3.1 POST /api/relay-tak

```
Path    : POST /api/relay-tak
Purpose : Relay CoT XML to FreeTAKServer. Thin wrapper around FreeTAKServer REST API.
Auth    : Next.js session (Supabase Auth cookie)
```

#### Request

```json
{
  "cot_xml": "<event version=\"2.0\"...>...</event>",
  "fts_endpoint": "http://10.0.0.1:19023/Cot"
}
```

#### Response 200

```json
{
  "relayed": true,
  "fts_response_code": 200,
  "relayed_at": "2026-03-24T14:23:07Z"
}
```

#### Response 502

```json
{
  "error": {
    "code": "FTS_UNREACHABLE",
    "message": "FreeTAKServer did not respond within 5s",
    "status": 502
  }
}
```

Implementation:
```typescript
// src/app/api/relay-tak/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { cot_xml, fts_endpoint } = await req.json();

  // Audit log: record relay attempt
  await supabase.from('cot_relay_log').insert({
    user_id: session.user.id,
    track_id: extractTrackId(cot_xml),
    relayed_at: new Date().toISOString(),
    fts_endpoint,
  });

  try {
    const response = await fetch(fts_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: cot_xml,
      signal: AbortSignal.timeout(5000),
    });

    return NextResponse.json({
      relayed: response.ok,
      fts_response_code: response.status,
      relayed_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      error: { code: 'FTS_UNREACHABLE', message: String(err), status: 502 }
    }, { status: 502 });
  }
}
```

---

## 4. SUPABASE REALTIME CHANNELS

### 4.1 tracks channel

```
Channel name  : tracks-realtime
Table         : public.tracks
Events        : INSERT, UPDATE, DELETE
Filter        : status=eq.ACTIVE

Payload schema (INSERT/UPDATE):
{
  "schema": "public",
  "table": "tracks",
  "commit_timestamp": "2026-03-24T14:23:07.000Z",
  "eventType": "UPDATE",
  "new": {
    "id": "TRK-A7F2",
    "threat_class": "FPV_DRONE",
    "confidence": 0.943,
    "latitude": 50.2341,
    "longitude": 30.5124,
    "altitude_m": 120,
    "heading_deg": 247,
    "speed_kmh": 85,
    "status": "ACTIVE",
    "first_seen_at": "2026-03-24T14:21:33Z",
    "last_updated_at": "2026-03-24T14:23:01Z",
    "detecting_node_id": "NODE-007",
    "detection_gates": {"acoustic": true, "rf": true, "optical": false},
    "cot_uid": "APEX-TRK-A7F2"
  },
  "old": {
    "id": "TRK-A7F2",
    "last_updated_at": "2026-03-24T14:22:58Z"
  }
}
```

### 4.2 alerts channel

```
Channel name  : alerts-realtime
Table         : public.alerts
Events        : INSERT
Filter        : (none — all new alerts)

Payload schema (INSERT):
{
  "eventType": "INSERT",
  "new": {
    "id": "ALT-00247",
    "track_id": "TRK-A7F2",
    "severity": "CRITICAL",
    "threat_class": "FPV_DRONE",
    "confidence": 0.943,
    "latitude": 50.2341,
    "longitude": 30.5124,
    "altitude_m": 120,
    "detected_at": "2026-03-24T14:21:33Z",
    "cot_xml": "<event ...>...</event>"
  }
}
```

### 4.3 node_health_log channel

```
Channel name  : node-health-realtime
Table         : public.node_health_log
Events        : INSERT
Filter        : (none)

Payload schema:
{
  "eventType": "INSERT",
  "new": {
    "id": "uuid",
    "node_id": "NODE-007",
    "status": "ONLINE",
    "battery_pct": null,
    "recorded_at": "2026-03-24T14:23:00Z"
  }
}
```

---

## 5. NATS SUBJECTS

### 5.1 Subjects Consumed by Dashboard

```
sentinel.alerts.>
  Description: All alert events from TdoaCorrelator and gate processors
  Format: JSON (AlertMessage schema below)
  QoS: at-least-once
  Rate: 0-10 msg/s typical, up to 100 msg/s during incidents
  Consumed by: alertSubscriber.ts

sentinel.cot.>
  Description: CoT XML payloads for relay to FreeTAKServer
  Format: JSON { alert_id, cot_xml, track_id }
  QoS: at-least-once
  Rate: same as sentinel.alerts.>
  Consumed by: cotRelay.ts (when auto-relay enabled)
```

### 5.2 AlertMessage Schema (NATS payload)

```typescript
interface AlertMessage {
  alert_id:       string;       // "ALT-00247"
  track_id:       string;       // "TRK-A7F2"
  severity:       'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  threat_class:   string;       // "FPV_DRONE" | "SHAHED" | etc.
  confidence:     number;       // 0.0 – 1.0
  latitude:       number;       // WGS84 degrees
  longitude:      number;       // WGS84 degrees
  altitude_m:     number;       // meters AGL
  heading_deg:    number | null; // degrees true north
  speed_kmh:      number | null; // estimated km/h
  detected_at:    string;       // ISO 8601 UTC
  detecting_node: string;       // "NODE-007"
  detection_gates: {
    acoustic: boolean;
    rf: boolean;
    optical: boolean;
  };
  cot_xml:        string | null; // CoT event XML if available
}
```

### 5.3 Subjects NOT Consumed by Dashboard

```
sentinel.detections.*      — raw detection events (too high volume for browser)
sentinel.calibration.*     — calibration events (W1/W2 internal)
sentinel.mesh.*            — mesh topology events (W2 internal)
sentinel.nodes.heartbeat   — node heartbeats (goes to Supabase directly, not browser)
```

---

## 6. TYPE DEFINITIONS

### 6.1 Track type (client-side)

```typescript
// src/types/track.ts
export interface Track {
  id: string;
  threat_class: ThreatClass;
  confidence: number;         // 0.0 – 1.0
  latitude: number;
  longitude: number;
  altitude_m: number;
  heading_deg: number | null;
  speed_kmh: number | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'LOST';
  first_seen_at: string;      // ISO 8601
  last_updated_at: string;    // ISO 8601
  detecting_node_id: string;
  detection_gates: {
    acoustic: boolean;
    rf: boolean;
    optical: boolean;
  };
  cot_uid: string;
  // Client-side only (not from DB)
  _clientReceivedAt?: number; // Date.now() when received
}

export type ThreatClass =
  | 'FPV_DRONE'
  | 'SHAHED'
  | 'HELICOPTER'
  | 'FIXED_WING'
  | 'MULTIROTOR'
  | 'UNKNOWN'
  | 'FRIENDLY'
  | 'DECOY';
```

### 6.2 Alert type

```typescript
// src/types/alert.ts
export interface Alert {
  id: string;
  track_id: string | null;
  severity: AlertSeverity;
  threat_class: ThreatClass;
  confidence: number;
  latitude: number;
  longitude: number;
  altitude_m: number;
  detected_at: string;
  detecting_node: string;
  detection_gates: DetectionGates;
  cot_xml: string | null;
  // From alert_summary_view
  is_acknowledged: boolean;
  first_acknowledgement: AcknowledgementRecord | null;
  note_count: number;
  // Client-side
  acknowledged?: boolean;       // local optimistic update
  acknowledgedAt?: number;
}

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
```

### 6.3 SensorNode type

```typescript
// src/types/node.ts
export interface SensorNode {
  id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  tier: 1 | 2 | 3 | 4;
  coverage_radius_m: number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  last_heartbeat_at: string;
  battery_pct: number | null;
  is_mobile: boolean;
  has_acoustic: boolean;
  has_rf: boolean;
  has_optical: boolean;
  detections_24h: number;
  uptime_24h_pct: number;
  firmware_version: string;
}

export type NodeTier = 1 | 2 | 3 | 4;
```

---

*API_SPECIFICATION.md — APEX-SENTINEL W4 — approved 2026-03-24*
