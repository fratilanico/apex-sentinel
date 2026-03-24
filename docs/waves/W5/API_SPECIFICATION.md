# APEX-SENTINEL — API_SPECIFICATION.md
## Gate 4: EKF + LSTM Trajectory Prediction — API Specification
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. API OVERVIEW

W5 introduces the following new interfaces:

| Interface | Type | Direction | Consumer |
|-----------|------|-----------|---------|
| `sentinel.predictions.{trackId}` | NATS subject | W5 → W4 dashboard | CesiumJS overlay |
| `sentinel.impacts.{trackId}` | NATS subject | W5 → W4 dashboard | CesiumJS impact marker |
| `sentinel.w5.status` | NATS subject | W5 → ops | Health/metrics |
| `get-predictions` | Supabase Edge Function | W4 → Supabase | OpenMCT telemetry |
| `get-impact-estimates` | Supabase Edge Function | W4 → Supabase | C2 impact display |
| `tracks.predicted_trajectory` | Supabase Realtime | W5 → W4 | CesiumJS Realtime |
| `impact_estimates` | Supabase Realtime | W5 → W4 | C2 impact overlay |

---

## 2. NATS SUBJECTS

### 2.1 sentinel.predictions.{trackId}

**Direction:** W5 Service → W4 Dashboard (NATS.ws)
**Subject pattern:** `sentinel.predictions.<trackId>` where `trackId` is a UUID v4
**Publish rate:** 1 Hz per active track (every EKF predict/update cycle)
**QoS:** Fire-and-forget (NATS Core, not JetStream — latency critical)

#### Payload Schema

```typescript
interface PredictionMessage {
  trackId: string;                // UUID v4
  generatedAt: string;            // ISO 8601 UTC, e.g. "2026-03-24T10:00:00.123Z"
  ekfState: {
    lat: number;                  // degrees WGS84
    lon: number;                  // degrees WGS84
    alt: number;                  // metres MSL
    vLat: number;                 // degrees/second
    vLon: number;                 // degrees/second
    vAlt: number;                 // metres/second
    speedMs: number;              // ground speed m/s (derived)
    headingDeg: number;           // 0–360 from North (derived)
  };
  ekfCovarianceDiag: [            // 6-element array
    number,                       // P11: lat variance (deg²)
    number,                       // P22: lon variance (deg²)
    number,                       // P33: alt variance (m²)
    number,                       // P44: vLat variance
    number,                       // P55: vLon variance
    number                        // P66: vAlt variance (m²/s²)
  ];
  positionSigmaM: number;         // 1-sigma position uncertainty in metres
  predictions: [
    {
      horizonSeconds: 1;
      lat: number;
      lon: number;
      alt: number;
      confidence: number;         // 0.0–1.0
      sigmaM: number;             // 1-sigma uncertainty at this horizon in metres
    },
    {
      horizonSeconds: 2;
      lat: number;
      lon: number;
      alt: number;
      confidence: number;
      sigmaM: number;
    },
    {
      horizonSeconds: 3;
      lat: number;
      lon: number;
      alt: number;
      confidence: number;
      sigmaM: number;
    },
    {
      horizonSeconds: 5;
      lat: number;
      lon: number;
      alt: number;
      confidence: number;
      sigmaM: number;
    },
    {
      horizonSeconds: 10;
      lat: number;
      lon: number;
      alt: number;
      confidence: number;
      sigmaM: number;
    }
  ];                              // always exactly 5 elements
  impactEstimate: {
    lat: number;
    lon: number;
    confidenceRadiusM: number;
    confidence: number;
    timeToImpactSeconds: number;
    estimatedAt: string;
  } | null;                       // null if drone not descending (vAlt >= 0)
  confidence: number;             // overall prediction confidence at t+1s
  modelVersion: 'polynomial-v1' | 'onnx-lstm-v1';
  isCoasting: boolean;            // true if no measurement in last 2s
  schema: 'sentinel.predictions.v1';
}
```

#### Example Payload

```json
{
  "trackId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "generatedAt": "2026-03-24T10:00:01.045Z",
  "ekfState": {
    "lat": 48.12345,
    "lon": 24.56789,
    "alt": 125.3,
    "vLat": -0.000045,
    "vLon": 0.000130,
    "vAlt": -1.2,
    "speedMs": 28.4,
    "headingDeg": 118.5
  },
  "ekfCovarianceDiag": [1.8e-9, 1.8e-9, 22.4, 4.1e-13, 4.1e-13, 0.85],
  "positionSigmaM": 4.7,
  "predictions": [
    {"horizonSeconds": 1, "lat": 48.12340, "lon": 24.56803, "alt": 124.1, "confidence": 0.94, "sigmaM": 5.2},
    {"horizonSeconds": 2, "lat": 48.12335, "lon": 24.56817, "alt": 122.9, "confidence": 0.80, "sigmaM": 9.8},
    {"horizonSeconds": 3, "lat": 48.12330, "lon": 24.56831, "alt": 121.7, "confidence": 0.67, "sigmaM": 15.4},
    {"horizonSeconds": 5, "lat": 48.12320, "lon": 24.56859, "alt": 119.3, "confidence": 0.47, "sigmaM": 28.1},
    {"horizonSeconds": 10,"lat": 48.12295, "lon": 24.56929, "alt": 113.3, "confidence": 0.22, "sigmaM": 72.3}
  ],
  "impactEstimate": {
    "lat": 48.12180,
    "lon": 24.57250,
    "confidenceRadiusM": 48.5,
    "confidence": 0.58,
    "timeToImpactSeconds": 104.4,
    "estimatedAt": "2026-03-24T10:01:45.445Z"
  },
  "confidence": 0.94,
  "modelVersion": "polynomial-v1",
  "isCoasting": false,
  "schema": "sentinel.predictions.v1"
}
```

### 2.2 sentinel.impacts.{trackId}

**Direction:** W5 Service → W4 Dashboard
**Subject pattern:** `sentinel.impacts.<trackId>`
**Publish rate:** When impact estimate available and changes significantly (lat/lon delta > 10m or confidence delta > 0.05)
**QoS:** NATS Core, fire-and-forget

#### Payload Schema

```typescript
interface ImpactMessage {
  trackId: string;
  impact: {
    lat: number;
    lon: number;
    confidenceRadiusM: number;    // metres, 95% confidence circle radius
    confidence: number;           // 0.0–1.0
    timeToImpactSeconds: number;  // estimated seconds until alt=0
    estimatedAt: string;          // ISO 8601 UTC
  };
  generatedAt: string;
  schema: 'sentinel.impacts.v1';
}
```

**Publish condition:**
```typescript
// Only publish impact message if:
// 1. vAlt < -0.5 m/s (drone is descending)
// 2. alt > 5 m (not already at ground)
// 3. confidence > 0.1 (minimum useful confidence)
// 4. Either: first impact estimate for this track
//    OR: lat/lon changed by > 10m OR confidence changed by > 0.05
```

### 2.3 sentinel.w5.status

**Direction:** W5 Service → Ops monitoring
**Publish rate:** Every 30 seconds
**QoS:** NATS Core

```typescript
interface W5StatusMessage {
  serviceId: 'apex-sentinel-w5';
  timestamp: string;
  activeTrackCount: number;
  coastingTrackCount: number;
  uptimeSeconds: number;
  lastPredictionLatencyMs: number;  // most recent detection→publish latency
  p95LatencyMs: number;             // rolling p95 over last 100 predictions
  supabaseWriteRate: number;        // writes/second (current token bucket consumption)
  natsConnected: boolean;
  supabaseConnected: boolean;
  modelVersion: string;
}
```

---

## 3. SUPABASE EDGE FUNCTIONS

### 3.1 get-predictions

**URL:** `https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/get-predictions`
**Auth:** Bearer JWT (operator or analyst role)
**Method:** GET
**Purpose:** Paginated predicted trajectory history for OpenMCT telemetry display and analyst replay.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `trackId` | UUID | Yes | — | Track to query |
| `from` | ISO 8601 | No | NOW()-5min | Start of time range |
| `to` | ISO 8601 | No | NOW() | End of time range |
| `limit` | number | No | 100 | Max records returned (max 1000) |
| `offset` | number | No | 0 | Pagination offset |
| `includeEkfState` | boolean | No | false | Include EKF state in each record |

#### Response Schema

```typescript
interface GetPredictionsResponse {
  trackId: string;
  total: number;           // total records matching query (for pagination)
  limit: number;
  offset: number;
  predictions: Array<{
    id: string;
    generatedAt: string;
    confidence: number;
    modelVersion: string;
    isCoasting: boolean;
    points: PredictedPoint[];
    ekfState?: EKFStateVector;  // only if includeEkfState=true
  }>;
}
```

#### Implementation

```typescript
// supabase/functions/get-predictions/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const trackId = url.searchParams.get('trackId');
  if (!trackId) return new Response('trackId required', { status: 400 });

  const from = url.searchParams.get('from') ?? new Date(Date.now() - 5 * 60_000).toISOString();
  const to = url.searchParams.get('to') ?? new Date().toISOString();
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 1000);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const includeEkfState = url.searchParams.get('includeEkfState') === 'true';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Verify user has operator or analyst role
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) return new Response('Unauthorized', { status: 401 });
  const role = user.user_metadata?.role;
  if (!['operator', 'analyst', 'admin'].includes(role)) {
    return new Response('Forbidden', { status: 403 });
  }

  const selectCols = includeEkfState
    ? 'id, generated_at, confidence, model_version, is_coasting, predictions, ekf_lat, ekf_lon, ekf_alt, ekf_v_lat, ekf_v_lon, ekf_v_alt'
    : 'id, generated_at, confidence, model_version, is_coasting, predictions';

  const { data, error, count } = await supabase
    .from('predicted_trajectories')
    .select(selectCols, { count: 'exact' })
    .eq('track_id', trackId)
    .gte('generated_at', from)
    .lte('generated_at', to)
    .order('generated_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(
    JSON.stringify({
      trackId,
      total: count ?? 0,
      limit,
      offset,
      predictions: data ?? []
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

### 3.2 get-impact-estimates

**URL:** `https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/get-impact-estimates`
**Auth:** Bearer JWT (operator role only — not analyst)
**Method:** GET
**Purpose:** Current impact estimates for all active tracks, filtered by confidence threshold.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `minConfidence` | number | No | 0.5 | Minimum confidence to return (0.0–1.0) |
| `trackId` | UUID | No | — | Filter to specific track |
| `maxAgeSeconds` | number | No | 30 | Only return estimates newer than this |

#### Response Schema

```typescript
interface GetImpactEstimatesResponse {
  timestamp: string;
  estimates: Array<{
    trackId: string;
    trackClassification: string;
    impactLat: number;
    impactLon: number;
    confidenceRadiusM: number;
    confidence: number;
    timeToImpactSeconds: number | null;
    estimatedAt: string;
  }>;
}
```

#### Error Responses

| Code | Condition |
|------|-----------|
| 401 | Missing or invalid JWT |
| 403 | Authenticated but not operator/admin role |
| 400 | Invalid minConfidence (outside 0–1) |
| 500 | Database error |

---

## 4. SUPABASE REALTIME SUBSCRIPTIONS

### 4.1 tracks Table — predicted_trajectory Column

**Consumer:** W4 CesiumJS dashboard
**Table:** `public.tracks`
**Events:** `UPDATE`
**Filter:** `status=in.(CONFIRMED,ACTIVE)`

The W4 Realtime handler should check `payload.new.predicted_trajectory !== null` before rendering. Payload excerpt:

```typescript
// payload.new (partial TrackRow with W5 fields)
{
  id: "a1b2c3d4-...",
  status: "CONFIRMED",
  predicted_trajectory: {  // PredictionOutput JSON
    trackId: "...",
    generatedAt: "...",
    ekfState: { lat, lon, alt, vLat, vLon, vAlt, speedMs, headingDeg },
    predictions: [...],
    impactEstimate: {...} | null,
    confidence: 0.94,
    modelVersion: "polynomial-v1",
    isCoasting: false
  },
  prediction_confidence: 0.94,
  prediction_updated_at: "2026-03-24T10:00:01.045Z"
}
```

### 4.2 impact_estimates Table

**Consumer:** W4 C2 commander panel
**Table:** `public.impact_estimates`
**Events:** `INSERT`

```typescript
const impactChannel = supabase
  .channel('impact-estimates')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'impact_estimates' },
    (payload) => {
      const estimate = payload.new as ImpactEstimateRow;
      if (estimate.confidence >= MIN_CONFIDENCE_THRESHOLD) {
        renderImpactMarker(cesiumViewer, estimate);
      }
    }
  )
  .subscribe();
```

---

## 5. EKF STATE TELEMETRY API (OpenMCT)

OpenMCT requires a custom telemetry plugin that polls the `get-predictions` Edge Function. The plugin provides 12 telemetry channels per track:

| Channel Key | Display Name | Unit | Source |
|------------|-------------|------|--------|
| `ekf.lat` | EKF Latitude | degrees | ekf_lat column |
| `ekf.lon` | EKF Longitude | degrees | ekf_lon column |
| `ekf.alt` | EKF Altitude | metres | from track_positions |
| `ekf.v_lat` | EKF vLat | deg/s | v_lat column |
| `ekf.v_lon` | EKF vLon | deg/s | v_lon column |
| `ekf.v_alt` | EKF vAlt | m/s | v_alt column |
| `ekf.speed_ms` | Ground Speed | m/s | speed_ms (generated) |
| `ekf.p11` | Cov P11 (lat) | deg² | cov_p11 |
| `ekf.p22` | Cov P22 (lon) | deg² | cov_p22 |
| `ekf.p33` | Cov P33 (alt) | m² | cov_p33 |
| `ekf.sigma_m` | Position 1σ | metres | position_sigma_m |
| `ekf.confidence` | Prediction Confidence | 0–1 | from predicted_trajectories |

OpenMCT historical telemetry source:
```
GET /functions/v1/get-predictions?trackId=<id>&from=<start>&to=<end>&includeEkfState=true&limit=1000
```

OpenMCT real-time telemetry: NATS.ws subscription on `sentinel.predictions.{trackId}` — parse ekfState from each message.

---

## 6. VERSION COMPATIBILITY

### 6.1 Schema Versioning

All NATS message payloads include a `schema` field for forward compatibility:
- `sentinel.predictions.v1` — W5 polynomial predictor output
- `sentinel.impacts.v1` — W5 impact estimate

When W6 ships ONNX model, `modelVersion` field changes but schema version remains `v1` (non-breaking — new field, existing fields unchanged).

Breaking changes require schema bump to `v2` and a deprecation period.

### 6.2 Backward Compatibility with W4 Dashboard

The W4 dashboard must handle `predicted_trajectory = null` gracefully (no prediction overlay rendered). This is the W4 pre-W5 state. After W5 deployment, `predicted_trajectory` will be populated within 2 seconds of a confirmed track.

---

*API_SPECIFICATION.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 510+ lines | Status: APPROVED | Next: AI_PIPELINE.md*
