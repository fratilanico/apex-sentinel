# APEX-SENTINEL W3 — API Specification
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2)
**Base URL:** `https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1`
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Overview

W3 interacts with two API surfaces:

1. **Supabase Edge Functions** — REST-style functions for registration, config, push token management, and GDPR deletion.
2. **NATS WebSocket** — Real-time pub/sub for event publishing, alert subscription, heartbeats, and calibration.

All Edge Functions use the Supabase anon key for authentication. Node identity is passed as a custom claim in a signed JWT or as a header.

---

## 2. Authentication

### 2.1 Supabase Auth Header

All Edge Function requests include:
```
Authorization: Bearer {SUPABASE_ANON_KEY}
x-node-id: {nodeId}
x-app-version: {appVersion}
x-platform: android|ios
```

The `x-node-id` header is verified against a signed nodeToken (signed by Edge Function on registration, stored in SecureStore).

### 2.2 NATS WebSocket Auth

NATS authentication uses a token issued by the `get-node-config` Edge Function. The token is either:
- **USER/PASS:** username = `node_{nodeId}`, password = NATS token from config
- **NKEY** (preferred for production): Ed25519 keypair, public key registered in NATS server

Auth flow:
```
1. App calls get-node-config → receives { natsWsUrl, natsToken, natsUser }
2. App stores { natsWsUrl, natsToken, natsUser } in SecureStore
3. NATSClient.connect(natsWsUrl, { user: natsUser, pass: natsToken })
4. NATS server validates token against node registration
5. On 401: app calls get-node-config to refresh token
```

---

## 3. Edge Functions

### 3.1 POST /get-node-config

Returns full node configuration including NATS credentials. Called once on first launch and on token expiry.

**Request:**
```typescript
interface GetNodeConfigRequest {
  nodeId: string;          // UUID v4, generated on device
  platform: 'android' | 'ios';
  appVersion: string;      // semver, e.g. "1.0.0"
  osVersion: string;       // e.g. "Android 13", "iOS 17.2"
  consentVersion: string;  // e.g. "1.0"
  consentGrantedAt: string; // ISO8601
}
```

**Response 200:**
```typescript
interface GetNodeConfigResponse {
  nodeId: string;
  natsWsUrl: string;
  natsUser: string;
  natsToken: string;
  natsTokenExpiresAt: string;         // ISO8601
  supabaseUrl: string;
  supabaseAnonKey: string;
  detectionThreshold: number;         // 0.72 default
  modelManifestUrl: string;           // CDN URL for model manifest.json
  alertGeohashPrecision: number;      // 6 default
  heartbeatIntervalS: number;         // 60 default
  configVersion: string;              // Increment on any change
}
```

**Response 400:**
```typescript
interface ErrorResponse {
  error: string;
  code: 'INVALID_NODE_ID' | 'CONSENT_REQUIRED' | 'UNSUPPORTED_VERSION';
  details?: string;
}
```

**Response 429:**
```typescript
interface RateLimitResponse {
  error: 'Rate limit exceeded';
  retryAfterS: number;
}
```

**Example:**
```typescript
const response = await axios.post(
  `${SUPABASE_URL}/functions/v1/get-node-config`,
  {
    nodeId,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    osVersion: `${Platform.OS} ${Platform.Version}`,
    consentVersion: '1.0',
    consentGrantedAt: new Date().toISOString(),
  },
  {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'x-node-id': nodeId,
    },
  }
);
```

---

### 3.2 POST /push-register

Registers or updates the Expo push token for this node. Called after Expo push token is obtained.

**Request:**
```typescript
interface PushRegisterRequest {
  nodeId: string;
  expoPushToken: string;   // ExponentPushToken[...] format
  platform: 'android' | 'ios';
  tokenType: 'expo';
}
```

**Response 200:**
```typescript
interface PushRegisterResponse {
  registered: true;
  tokenId: string;       // Internal UUID
  registeredAt: string;  // ISO8601
}
```

**Response 400:**
```typescript
interface PushRegisterErrorResponse {
  error: string;
  code: 'INVALID_TOKEN_FORMAT' | 'NODE_NOT_FOUND' | 'TOKEN_ALREADY_REGISTERED';
}
```

**Push token deregistration (DELETE /push-register):**
```typescript
interface PushDeregisterRequest {
  nodeId: string;
  expoPushToken: string;
}
// Response 200: { deregistered: true }
```

---

### 3.3 GET /get-alerts-feed

Fetches paginated alerts for the node's current geohash area. Used for initial feed load and polling fallback when NATS is unavailable.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| geohash | string | YES | — | Geohash precision 4 (large area) |
| severityMin | integer | NO | 1 | Minimum severity to include |
| limit | integer | NO | 50 | Max alerts returned |
| before | string | NO | now | ISO8601 cursor for pagination |
| since | string | NO | -24h | ISO8601 lower bound |

**Request Headers:**
```
Authorization: Bearer {SUPABASE_ANON_KEY}
x-node-id: {nodeId}
```

**Response 200:**
```typescript
interface GetAlertsFeedResponse {
  alerts: AlertFeedItem[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

interface AlertFeedItem {
  alertId: string;
  severity: number;
  eventType: string;
  sourceGeohash: string;
  lat: number;
  lng: number;
  confirmedBy: number;
  alertAt: string;       // ISO8601
  distanceM: number | null;
  summary: string;
}
```

**Response 401:**
```typescript
{ error: 'Unauthorized', code: 'INVALID_NODE_ID' }
```

---

### 3.4 POST /delete-node

GDPR deletion. Deletes all server-side data for the node. Non-reversible.

**Request:**
```typescript
interface DeleteNodeRequest {
  nodeId: string;
  confirmation: 'DELETE_ALL_MY_DATA'; // Literal string required
  reason?: string;
}
```

**Response 200:**
```typescript
interface DeleteNodeResponse {
  deleted: true;
  deletedAt: string;      // ISO8601
  tablesAffected: string[];
  // e.g. ['node_registrations', 'push_tokens', 'node_app_versions', 'node_consent_audit']
}
```

**Response 400:**
```typescript
{ error: 'Confirmation text incorrect', code: 'CONFIRMATION_REQUIRED' }
```

**Response 404:**
```typescript
{ error: 'Node not found', code: 'NODE_NOT_FOUND' }
```

Client-side: After 200, app clears SQLite (all tables), clears SecureStore, navigates to onboarding.

---

### 3.5 POST /report-consent

Writes an immutable consent audit record. Called on consent grant, revoke, and privacy policy update.

**Request:**
```typescript
interface ReportConsentRequest {
  nodeId: string;
  action: 'GRANT' | 'REVOKE' | 'UPDATE';
  consentVersion: string;
  platform: 'android' | 'ios';
  appVersion: string;
  occurredAt: string;   // ISO8601
}
```

**Response 200:**
```typescript
interface ReportConsentResponse {
  recorded: true;
  auditId: string;
}
```

---

### 3.6 POST /upsert-app-version

Updates node_app_versions on heartbeat. Called every NATS connection and every 5 minutes while connected.

**Request:**
```typescript
interface UpsertAppVersionRequest {
  nodeId: string;
  appVersion: string;
  modelVersion: string;
  modelSha256: string;
  platform: 'android' | 'ios';
  osVersion: string;
  deviceClass?: 'low' | 'mid' | 'high';
}
```

**Response 200:**
```typescript
interface UpsertAppVersionResponse {
  updated: true;
  latestAppVersion: string;     // Latest available app version
  latestModelVersion: string;   // Latest available model version
  updateAvailable: boolean;
}
```

---

## 4. NATS WebSocket API

### 4.1 Connection

```typescript
import { connect, StringCodec } from 'nats.ws';

const nc = await connect({
  servers: config.natsWsUrl,          // e.g. "wss://nats.apexsentinel.uk:4222"
  user: config.natsUser,
  pass: config.natsToken,
  reconnect: true,
  maxReconnectAttempts: -1,           // Infinite reconnect
  reconnectTimeWait: 1000,
  maxReconnectTimeWait: 60000,
  pingInterval: 30000,
  timeout: 10000,
  tls: { checkServerIdentity: true },
});
```

### 4.2 Published Subjects

#### 4.2.1 events.{geohash6}

Detection event from mobile node.

**Subject pattern:** `events.{geohash6}` (e.g. `events.gcpvhm`)

**Payload (JSON, UTF-8):**
```typescript
interface DetectionEventPayload {
  eventId: string;            // UUID v4
  nodeId: string;             // Hashed node UUID (SHA-256 first 16 chars)
  eventType: string;          // YAMNet class label
  confidence: number;         // 0.0–1.0
  modelVersion: string;       // semver
  inferenceMs: number;        // Integer ms
  lat: number;                // Coarsened to 4dp
  lng: number;                // Coarsened to 4dp
  geohash: string;            // Precision 7
  detectedAt: string;         // ISO8601 with ms precision
  publishedAt: string;        // ISO8601 — may differ from detectedAt if buffered
  batteryLevel: number;       // 0–100
  thermalZone: number;        // °C approximate
  platform: 'android' | 'ios';
  appVersion: string;
}
```

**Publish:**
```typescript
const sc = StringCodec();
nc.publish(
  `events.${geohash.substring(0, 6)}`,
  sc.encode(JSON.stringify(payload))
);
```

#### 4.2.2 nodes.{nodeId}.heartbeat

Published every 60 seconds by HeartbeatService.

**Subject:** `nodes.{nodeId}.heartbeat`

**Payload:**
```typescript
interface HeartbeatPayload {
  nodeId: string;
  batteryLevel: number;
  thermalZone: number;
  bufferDepth: number;
  natsConnectedS: number;     // Seconds since connection
  modelVersion: string;
  appVersion: string;
  connectivityState: string;
  lat: number;                // Coarsened
  lng: number;                // Coarsened
  geohash: string;            // Precision 6
  ts: string;                 // ISO8601
}
```

#### 4.2.3 calibration.{nodeId}

Published after calibration run completes.

**Subject:** `calibration.{nodeId}`

**Payload:**
```typescript
interface CalibrationPayload {
  calibrationId: string;
  nodeId: string;
  ambientRms: number;
  ambientRmsStd: number;
  vadThresholdSet: number;
  spectralCentroid: number | null;
  dominantFreqHz: number | null;
  geohash: string;
  modelVersion: string;
  calibratedAt: string;
}
```

---

### 4.3 Subscribed Subjects

#### 4.3.1 alerts.{geohash4}

Mobile app subscribes to alerts for its geohash precision-4 area (approx 40km × 20km cell).

**Subject pattern:** `alerts.{geohash4}` (e.g. `alerts.gcpv`)

**Payload:**
```typescript
interface AlertPayload {
  alertId: string;
  severity: number;           // 1–10
  eventType: string;
  sourceGeohash: string;      // Precision 7
  lat: number;
  lng: number;
  confirmedBy: number;
  alertAt: string;            // ISO8601
  summary: string;
  ttlS: number;               // Alert time-to-live in seconds
  affectedGeohashes: string[]; // All geohash7 cells with detections
}
```

**Subscribe:**
```typescript
const nodeGeohash4 = geohash.substring(0, 4);
const sub = nc.subscribe(`alerts.${nodeGeohash4}`);
for await (const msg of sub) {
  const alert = JSON.parse(sc.decode(msg.data)) as AlertPayload;
  AlertSubscriber.handle(alert);
}
```

#### 4.3.2 nodes.{nodeId}.config

W2 operator can push config updates to individual nodes.

**Subject:** `nodes.{nodeId}.config`

**Payload:**
```typescript
interface RemoteConfigPayload {
  configVersion: string;
  detectionThreshold?: number;
  vadAmbientRms?: number;
  heartbeatIntervalS?: number;
  // Any NodeConfig partial update
}
```

**Subscribe:**
```typescript
const configSub = nc.subscribe(`nodes.${nodeId}.config`);
for await (const msg of configSub) {
  const config = JSON.parse(sc.decode(msg.data)) as RemoteConfigPayload;
  await NodeConfigRepo.upsert(config);
  await AudioPipeline.reconfigure(config);
}
```

#### 4.3.3 nodes.{nodeId}.model

Notification that a new model version is available. Triggers OTA model download.

**Subject:** `nodes.{nodeId}.model`

**Payload:**
```typescript
interface ModelUpdatePayload {
  version: string;
  sha256: string;
  downloadUrl: string;
  sizeBytes: number;
  releaseNotes: string;
  requiredMinAppVersion: string;
}
```

---

## 5. TypeScript Types (Shared)

```typescript
// types/api.ts — shared between mobile and Edge Functions

export type Platform = 'android' | 'ios';
export type ConnectivityState = 'ONLINE' | 'NATS_OFFLINE' | 'MESH' | 'BUFFERING' | 'FLUSHING';

export interface DetectionEvent {
  eventId: string;
  nodeId: string;
  eventType: string;
  confidence: number;
  modelVersion: string;
  inferenceMs: number;
  lat: number;
  lng: number;
  geohash: string;
  detectedAt: string;
  publishedAt: string;
  batteryLevel: number;
  thermalZone: number;
  platform: Platform;
  appVersion: string;
}

export interface Alert {
  alertId: string;
  severity: number;
  eventType: string;
  sourceGeohash: string;
  lat: number;
  lng: number;
  confirmedBy: number;
  alertAt: string;
  summary: string;
  ttlS: number;
  affectedGeohashes: string[];
}

export interface NodeConfig {
  nodeId: string;
  natsWsUrl: string;
  natsUser: string;
  natsToken: string;
  natsTokenExpiresAt: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  detectionThreshold: number;
  modelManifestUrl: string;
  alertGeohashPrecision: number;
  heartbeatIntervalS: number;
  configVersion: string;
}

export interface ModelManifest {
  version: string;
  sha256: string;
  downloadUrl: string;
  sizeBytes: number;
  releaseNotes: string;
  publishedAt: string;
  requiredMinAppVersion: string;
  platforms: {
    android: { url: string; sha256: string; format: 'tflite' };
    ios: { url: string; sha256: string; format: 'mlmodel' };
  };
}
```

---

## 6. Error Codes Reference

| Code | HTTP Status | Description | Client Action |
|---|---|---|---|
| INVALID_NODE_ID | 400 | nodeId format invalid | Re-generate nodeId |
| CONSENT_REQUIRED | 400 | Consent not recorded | Show consent screen |
| UNSUPPORTED_VERSION | 400 | App version too old | Force update prompt |
| NODE_NOT_FOUND | 404 | nodeId not registered | Re-register |
| TOKEN_EXPIRED | 401 | NATS token expired | Call get-node-config |
| RATE_LIMITED | 429 | Too many requests | Back off retryAfterS |
| INTERNAL_ERROR | 500 | Edge function error | Retry with backoff |
| CONFIRMATION_REQUIRED | 400 | Delete confirmation missing | Show UI confirmation |

---

## 7. Rate Limits

| Endpoint | Limit | Window |
|---|---|---|
| POST /get-node-config | 10 req | per nodeId per hour |
| POST /push-register | 5 req | per nodeId per hour |
| GET /get-alerts-feed | 120 req | per nodeId per hour |
| POST /delete-node | 3 req | per nodeId per 24h |
| POST /report-consent | 20 req | per nodeId per hour |
| POST /upsert-app-version | 30 req | per nodeId per hour |

NATS publish: enforced by broker. Default: 100 events/minute per nodeId subject prefix.

---

## 8. Offline Behaviour Contract

When NATS is unavailable:
- Detection events are written to SQLite `pending_events` with `nats_subject` recorded.
- On reconnect: `FlushController` reads FIFO from `pending_events`, publishes each event using the stored `nats_subject`, deletes on NATS ACK.
- Events published during flush include original `detectedAt` timestamp. `publishedAt` reflects actual publish time.
- W2 must accept out-of-order events and deduplicate on `eventId`.

Maximum offline buffer: 10,000 events. Estimated at 1 event/minute passive: ~7 days of offline capacity.
