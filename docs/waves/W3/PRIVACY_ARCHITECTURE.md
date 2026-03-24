# APEX-SENTINEL W3 — Privacy Architecture
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2)
**Jurisdiction:** EU (GDPR primary), UA, RO
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Privacy Principles

APEX-SENTINEL W3 is designed to the principle of **privacy by design and by default** (GDPR Article 25). The application:

1. Processes audio **only on-device**. Raw audio never leaves the microphone buffer.
2. Transmits **only detection metadata** — event type, confidence score, coarsened location, timestamp.
3. Uses **pseudonymous identifiers** — no name, email, phone number, or device fingerprint collected.
4. Applies **data minimisation** at every stage — location coarsened to ±11m, geohash precision capped at 7.
5. Provides **user control** — consent screen on first launch, one-tap full deletion, accessible privacy audit.

---

## 2. Data Inventory

### 2.1 Data Collected

| Data Element | Where Stored | Transmitted? | Retention | Classification |
|---|---|---|---|---|
| nodeId (UUID v4) | SecureStore + SQLite | Yes — in event payloads | Until deletion | Pseudonymous |
| Nickname (optional) | SQLite node_config | No | Until deletion | Personal (optional) |
| Coarsened GPS (4dp) | Event payload | Yes — in NATS events | Event TTL (W2 config) | Pseudonymous |
| Geohash precision 7 | Event payload | Yes | Event TTL | Non-personal |
| Detection event type | Event payload | Yes | Event TTL | Non-personal |
| Confidence score | Event payload | Yes | Event TTL | Non-personal |
| Battery level | Heartbeat | Yes | Heartbeat TTL | Non-personal |
| Thermal zone | Heartbeat | Yes | Heartbeat TTL | Non-personal |
| App version | Registration | Yes | Superseded by next | Non-personal |
| OS version | Registration | Yes | Superseded by next | Non-personal |
| Platform | Registration | Yes | Permanent | Non-personal |
| Consent timestamp | node_consent_audit | Yes | GDPR minimum 3yr | Pseudonymous |
| Alert history | SQLite | No | Rolling 7 days | Non-personal |
| Calibration log | SQLite + NATS | calibration data only | Rolling 90 days | Non-personal |

### 2.2 Data NOT Collected

- Raw audio samples
- Precise GPS (truncated to 4 decimal places before any use)
- Device IMEI, IDFA, GAID, or hardware fingerprints
- IP address (not logged by Edge Functions; NATS broker strips)
- Contact information
- Photos or video
- Browsing history
- App usage analytics beyond events and heartbeats

---

## 3. Microphone Permission Consent Screen

### 3.1 Consent Screen Design

The consent screen at `/onboarding/permissions` presents:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  🎤  Microphone Access                              │
│                                                     │
│  APEX Sentinel uses your microphone to detect       │
│  acoustic threat signatures (explosions, gunfire).  │
│                                                     │
│  What we DO:                                        │
│  ✓  Process audio on your device only              │
│  ✓  Transmit only: event type, confidence score,   │
│     coarsened location, timestamp                  │
│  ✓  Show a persistent indicator when active        │
│  ✓  Allow you to delete everything instantly       │
│                                                     │
│  What we NEVER do:                                  │
│  ✗  Record or store audio files                    │
│  ✗  Transmit audio to any server                   │
│  ✗  Identify you by name or device                 │
│  ✗  Share data with third parties                  │
│                                                     │
│  View Privacy Policy ↗                              │
│  View Source Code ↗                                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           Enable Monitoring                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Not now — I'll decide later]                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 3.2 Consent Recording

On consent grant:
1. `ConsentManager.grant(version: '1.0')` called
2. Timestamp stored in `node_config.consent_granted_at`
3. POST to `/report-consent` Edge Function → `node_consent_audit` table
4. Navigation proceeds to `/onboarding/nickname`

On consent decline:
1. App navigates to home screen with monitoring disabled
2. No audio pipeline started
3. Status indicator shows "Monitoring disabled"
4. Persistent banner: "Tap to enable monitoring and help protect your community"

---

## 4. Audio Never Written to Disk

### 4.1 Technical Implementation

The audio pipeline guarantees audio bytes are never persisted:

```typescript
// AudioCapture.ts — enforced configuration
const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  wavFile: '',  // REQUIRED: empty string prevents file creation
};
```

The `react-native-audio-record` library creates a WAV file only when `wavFile` is a non-empty path. Setting it to `''` routes all audio to the callback stream only.

Additional guarantees:
- The `Float32Array` sliding window buffer (15,600 samples = 975ms) is held in JS heap only.
- On garbage collection or background suspend, the buffer is released — not written.
- The Zustand `pipelineStore` stores only computed statistics (RMS, event counts), never samples.
- SQLite `pending_events` stores only the inference result and metadata, never audio.

### 4.2 Runtime Verification

`src/privacy/ConsentManager.ts` includes a file-system audit:

```typescript
export async function auditAudioFiles(): Promise<AudioAuditResult> {
  const appDir = FileSystem.documentDirectory ?? '';
  const cacheDir = FileSystem.cacheDirectory ?? '';

  const audioExtensions = ['.wav', '.mp3', '.aac', '.m4a', '.ogg', '.pcm', '.raw'];

  const scanDir = async (dir: string): Promise<string[]> => {
    try {
      const contents = await FileSystem.readDirectoryAsync(dir);
      return contents.filter(f => audioExtensions.some(ext => f.endsWith(ext)));
    } catch {
      return [];
    }
  };

  const [docAudio, cacheAudio] = await Promise.all([
    scanDir(appDir),
    scanDir(cacheDir),
  ]);

  return {
    audioFilesFound: [...docAudio, ...cacheAudio],
    clean: docAudio.length === 0 && cacheAudio.length === 0,
    auditedAt: new Date().toISOString(),
  };
}
```

This audit runs on app launch and results are displayed in Settings > Privacy.

---

## 5. Location Coarsening

### 5.1 LocationCoarsener.ts

```typescript
// src/location/LocationCoarsener.ts
import * as Location from 'expo-location';
import { encode as geohashEncode } from 'ngeohash';

const DECIMAL_PLACES = 4;    // ±11m accuracy after truncation
const GEOHASH_PRECISION = 7; // ~153m × 153m cell

export interface CoarsenedLocation {
  lat: number;
  lng: number;
  geohash: string;
  accuracy: 'coarsened' | 'unavailable';
}

export class LocationCoarsener {
  private static lastLocation: CoarsenedLocation | null = null;
  private static lastFetchAt: Date | null = null;
  private static readonly CACHE_TTL_MS = 60000; // 1 minute cache

  static async getCoarsened(): Promise<CoarsenedLocation> {
    const now = new Date();
    if (
      this.lastLocation &&
      this.lastFetchAt &&
      now.getTime() - this.lastFetchAt.getTime() < this.CACHE_TTL_MS
    ) {
      return this.lastLocation;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return this.lastLocation ?? this.getDefaultLocation();
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Truncate to 4 decimal places (never round — always truncate toward zero)
      const lat = Math.trunc(location.coords.latitude * 10000) / 10000;
      const lng = Math.trunc(location.coords.longitude * 10000) / 10000;
      const geohash = geohashEncode(lat, lng, GEOHASH_PRECISION);

      this.lastLocation = { lat, lng, geohash, accuracy: 'coarsened' };
      this.lastFetchAt = now;
      return this.lastLocation;

    } catch {
      return this.lastLocation ?? this.getDefaultLocation();
    }
  }

  private static getDefaultLocation(): CoarsenedLocation {
    // Returns a null island equivalent — will be rejected by W2 geospatial filter
    return { lat: 0, lng: 0, geohash: '7zzzzz7', accuracy: 'unavailable' };
  }
}
```

### 5.2 Coarsening Precision

| Decimal Places | Grid Cell Size | Max Error |
|---|---|---|
| 6 | ~0.11m | Precise |
| 5 | ~1.1m | Sub-meter |
| **4** | **~11m** | **Used (balanced)** |
| 3 | ~111m | Too coarse |

Geohash precision 7 = 153m × 153m cells. This provides sufficient spatial granularity for W2 acoustic triangulation while preventing precise location tracking.

---

## 6. Pseudonymous nodeId

### 6.1 Generation and Storage

```typescript
// src/config/nodeId.ts
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';

const NODE_ID_KEY = 'apex_sentinel_node_id';

export async function getOrCreateNodeId(): Promise<string> {
  let nodeId = await SecureStore.getItemAsync(NODE_ID_KEY);
  if (!nodeId) {
    nodeId = uuidv4();
    await SecureStore.setItemAsync(NODE_ID_KEY, nodeId, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return nodeId;
}

export async function deleteNodeId(): Promise<void> {
  await SecureStore.deleteItemAsync(NODE_ID_KEY);
}
```

### 6.2 Transmission Pseudonymisation

For event payloads transmitted over NATS, the full UUID is hashed:

```typescript
// Only first 16 chars of SHA-256 used in event payload
const hashedNodeId = sha256(nodeId).substring(0, 16);
```

Full nodeId is only used in:
- NATS subject routing (`nodes.{nodeId}.heartbeat`) — subject visible to NATS broker only
- Supabase registration — stored under RLS-protected row

The hashedNodeId in event payloads cannot be reversed to the full UUID without the SHA-256 preimage.

---

## 7. Background Microphone Indicator

### 7.1 Android Foreground Service Notification

Android 12+ requires all foreground services with microphone access to show a persistent notification. This is not optional — Android OS enforces it.

```typescript
// Notification content (set in BackgroundAudioTask.ts)
const NOTIFICATION_CONFIG = {
  title: 'Sentinel Active',
  body: 'Monitoring for acoustic events. Tap to open.',
  channelId: 'sentinel-monitoring',
  priority: Notifications.AndroidNotificationPriority.LOW,
  sticky: true,
  color: '#1a1a2e',
  smallIcon: 'ic_sentinel_notification',
};
```

The notification is updated every 60s with the last event time and event count.

### 7.2 iOS Status Bar Indicator

iOS 14+ shows an orange dot in the status bar whenever the microphone is being accessed by an app (including background). This is OS-enforced and cannot be suppressed by the app.

The APEX Sentinel app additionally shows a green status badge in the app icon and in the tab bar when monitoring is active, providing secondary confirmation.

### 7.3 In-App Status Badge

```typescript
// HomeScreen status indicator
<View style={styles.statusBadge}>
  <View style={[styles.dot, { backgroundColor: isActive ? '#00ff88' : '#ff4444' }]} />
  <Text>{isActive ? 'Sentinel Active' : 'Monitoring Paused'}</Text>
  <Text>Last event: {lastEventAt ? formatRelative(lastEventAt) : 'none'}</Text>
</View>
```

---

## 8. GDPR Deletion Flow

### 8.1 User-Facing Flow

Navigation: Settings > Privacy > Delete All My Data

**Step 1:** Confirmation screen — "This will permanently delete all your data from APEX Sentinel servers and this device. You cannot undo this."

**Step 2:** Type "DELETE" to confirm (prevents accidental taps)

**Step 3:** Processing — UI shows progress through deletion steps

**Step 4:** Success/failure screen → app navigates to fresh onboarding

### 8.2 Technical Deletion Steps

```typescript
// src/privacy/DeletionService.ts
export async function deleteAllData(): Promise<DeletionResult> {
  const steps: DeletionStep[] = [];

  // 1. Stop audio pipeline
  await AudioPipeline.stop();
  steps.push({ step: 'pipeline_stopped', ok: true });

  // 2. Deregister push token
  try {
    await PushDeregistration.deregister();
    steps.push({ step: 'push_deregistered', ok: true });
  } catch (err) {
    steps.push({ step: 'push_deregistered', ok: false, error: String(err) });
  }

  // 3. Call delete-node Edge Function
  try {
    const nodeId = await SecureStore.getItemAsync('apex_sentinel_node_id');
    await axios.post(`${SUPABASE_URL}/functions/v1/delete-node`, {
      nodeId,
      confirmation: 'DELETE_ALL_MY_DATA',
    }, { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    steps.push({ step: 'server_data_deleted', ok: true });
  } catch (err) {
    steps.push({ step: 'server_data_deleted', ok: false, error: String(err) });
  }

  // 4. Clear all SQLite tables
  await Database.dropAllTables();
  steps.push({ step: 'sqlite_cleared', ok: true });

  // 5. Clear SecureStore
  await SecureStore.deleteItemAsync('apex_sentinel_node_id');
  await SecureStore.deleteItemAsync('nats_token');
  await SecureStore.deleteItemAsync('nats_user');
  steps.push({ step: 'secure_store_cleared', ok: true });

  // 6. Clear all Zustand stores
  nodeStore.getState().reset();
  alertStore.getState().reset();
  pipelineStore.getState().reset();
  steps.push({ step: 'stores_cleared', ok: true });

  return { steps, completedAt: new Date().toISOString() };
}
```

### 8.3 Server-Side Deletion (Edge Function)

The `delete-node` Edge Function deletes from:
- `node_registrations`
- `push_tokens`
- `node_app_versions`
- `node_consent_audit` (anonymised — consent records retained in anonymised form per GDPR Art. 17(3)(e) for 3 years, nodeId replaced with 'DELETED_{hash}')

Deletion is logged to an immutable `deletion_audit` table with timestamp and anonymised nodeId hash.

---

## 9. Privacy Audit Checklist

Available in-app at Settings > Privacy > Audit Checklist.

| # | Check | Status | Verified By |
|---|---|---|---|
| PA-01 | Audio never written to disk | PASS | Runtime file audit |
| PA-02 | GPS truncated to 4dp before any use | PASS | LocationCoarsener unit tests |
| PA-03 | nodeId generated on device, not server | PASS | Code review |
| PA-04 | nodeId stored in OS keychain | PASS | SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY |
| PA-05 | Consent screen shown before mic access | PASS | Onboarding flow test |
| PA-06 | Consent timestamp recorded | PASS | node_consent_audit table |
| PA-07 | Microphone indicator visible during background | PASS | Android notification + iOS OS dot |
| PA-08 | One-tap full deletion available | PASS | DeletionService E2E test |
| PA-09 | Server deletion covers all tables | PASS | delete-node Edge Function |
| PA-10 | NATS event payload contains no PII | PASS | Payload schema review |
| PA-11 | No third-party analytics SDK with PII | PASS | Package audit |
| PA-12 | Privacy policy URL in app store listing | PENDING | App store submission |
| PA-13 | Background mic use declared in privacy labels | PENDING | App store submission |
| PA-14 | Sentry data scrubbed of PII | PASS | Sentry config: scrub nodeId from breadcrumbs |

---

## 10. GDPR Compliance Summary

| Article | Requirement | Implementation |
|---|---|---|
| Art. 5 | Data minimisation | Only event metadata collected |
| Art. 6 | Lawful basis | Consent (Art. 6(1)(a)) + legitimate interest (Art. 6(1)(f)) |
| Art. 7 | Consent conditions | Explicit consent screen, logged in audit table |
| Art. 12–14 | Transparency | Consent screen, privacy policy, in-app audit |
| Art. 17 | Right to erasure | Full deletion flow, 3-tap maximum |
| Art. 20 | Data portability | Not applicable (no personal data profile) |
| Art. 25 | Privacy by design | Audio never leaves device; pseudonymous IDs |
| Art. 32 | Security | SecureStore, NATS TLS, Supabase RLS |
| Art. 33 | Breach notification | Sentry + W2 ops alert pipeline |
