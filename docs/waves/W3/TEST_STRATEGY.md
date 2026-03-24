# APEX-SENTINEL W3 — Test Strategy
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Testing Philosophy

APEX-SENTINEL W3 follows the wave-formation TDD protocol:
1. Tests written **before** implementation (TDD Red phase)
2. FR-named describe blocks for traceability
3. Coverage ≥ 80% branches/functions/lines/statements
4. No mocking of business logic — only external I/O (NATS, network, SQLite)

---

## 2. Test Stack

| Layer | Tool | Version | Purpose |
|---|---|---|---|
| Unit + Component | Jest + @testing-library/react-native | Jest 29, TLRN 12 | Business logic, hooks, UI components |
| Integration | Jest + nock + nats-server-mock | — | Edge Function calls, NATS pub/sub |
| E2E | Detox | 20.x | Full app flows on emulator/simulator |
| Coverage | Istanbul (via Jest) | Built-in | ≥80% gate |
| Native module mock | jest-native-mock / Manual | — | TFLite, CoreML, BLE, AudioRecord |

**Verification gate (all must pass before wave complete):**
```bash
npx jest --coverage --passWithNoTests    # Unit + component + integration
npx detox test --configuration android.emu.release  # E2E Android
npx detox test --configuration ios.sim.release      # E2E iOS
npm run build                            # EAS build clean
npx tsc --noEmit                         # TypeScript clean
```

---

## 3. Test Pyramid

Per functional requirement:

| Layer | Count per FR | Total (40 FRs) |
|---|---|---|
| Unit | 10–20 | 400–800 |
| Component | 5–10 | 200–400 |
| Integration | 3–5 | 120–200 |
| E2E | 1–3 | 40–120 |

Target total: ~760–1520 tests. Minimum acceptable: 600 tests at ≥80% coverage.

---

## 4. Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: [
    '@testing-library/jest-native/extend-expect',
    './jest.setup.ts',
  ],
  moduleNameMapper: {
    '^react-native-audio-record$': '<rootDir>/__mocks__/react-native-audio-record.ts',
    '^react-native-ble-plx$': '<rootDir>/__mocks__/react-native-ble-plx.ts',
    '^nats.ws$': '<rootDir>/__mocks__/nats.ws.ts',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
    '^expo-location$': '<rootDir>/__mocks__/expo-location.ts',
    '^expo-battery$': '<rootDir>/__mocks__/expo-battery.ts',
    '^./TFLiteInference$': '<rootDir>/__mocks__/TFLiteInference.ts',
    '^./CoreMLInference$': '<rootDir>/__mocks__/CoreMLInference.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/types.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': 'babel-jest',
  },
};
```

---

## 5. Key Mock Implementations

### 5.1 TFLite/CoreML Mock

```typescript
// __mocks__/TFLiteInference.ts
export class TFLiteInference {
  async loadModel(_path: string) {
    return { success: true, sha256: 'mock-sha256', inputShape: [1, 15600], outputShape: [1, 521] };
  }
  async run(_input: Float32Array) {
    return {
      eventType: 'Gunshot_or_gunfire',
      confidence: 0.91,
      classIndex: 427,
      inferenceMs: 45,
    };
  }
  async getMetadata() {
    return { version: '1.0.0', sha256: 'mock-sha256' };
  }
}
```

### 5.2 NATS Mock

```typescript
// __mocks__/nats.ws.ts
export const mockPublish = jest.fn();
export const mockSubscribe = jest.fn().mockReturnValue({
  [Symbol.asyncIterator]: async function* () { /* yields test messages */ },
});
export const mockDrain = jest.fn().mockResolvedValue(undefined);
export const mockClose = jest.fn().mockResolvedValue(undefined);

export const connect = jest.fn().mockResolvedValue({
  publish: mockPublish,
  subscribe: mockSubscribe,
  drain: mockDrain,
  close: mockClose,
  status: jest.fn(),
  isClosed: jest.fn().mockReturnValue(false),
});

export const StringCodec = () => ({
  encode: (str: string) => new TextEncoder().encode(str),
  decode: (data: Uint8Array) => new TextDecoder().decode(data),
});
```

### 5.3 AudioRecord Mock

```typescript
// __mocks__/react-native-audio-record.ts
const listeners: Map<string, (data: string) => void> = new Map();

export default {
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn().mockResolvedValue(''),
  on: jest.fn((event: string, cb: (data: string) => void) => {
    listeners.set(event, cb);
  }),
  // Test helper: simulate audio frame
  simulateFrame: (pcmBase64: string) => {
    listeners.get('data')?.(pcmBase64);
  },
};
```

---

## 6. Unit Test Specifications

### FR-W3-01: Audio Pipeline

```typescript
describe('FR-W3-01: Audio Pipeline', () => {
  // VAD
  it('rejects silent frames below ambient threshold');
  it('accepts frames exceeding ambient + 2σ threshold');
  it('updates ambient RMS from calibration result');
  it('handles empty frame without throwing');
  it('computes RMS correctly for known signal');

  // FFT
  it('produces mel spectrogram of correct shape [64]');
  it('applies Hann window before FFT');
  it('normalises output to [-1, 1] range');
  it('handles all-zero input without NaN output');

  // Sliding window
  it('accumulates frames into 15600-sample window');
  it('overwrites oldest samples when window full (ring buffer)');
  it('maintains correct window content after 3 full rotations');

  // Pipeline orchestration
  it('calls InferenceRouter.run after VAD passes');
  it('skips InferenceRouter.run when VAD rejects frame');
  it('respects SUSPENDED throttle state: no processing');
  it('respects MINIMAL throttle: processes 1 per 10s');
  it('publishes event when confidence >= threshold');
  it('does not publish when confidence < threshold');
  it('falls back to SQLite buffer when NATS unavailable');
  it('resumes normal processing after throttle state improves');
});
```

### FR-W3-02: ML Inference

```typescript
describe('FR-W3-02: ML Inference', () => {
  // InferenceRouter
  it('routes to TFLiteInference on android platform');
  it('routes to CoreMLInference on ios platform');
  it('returns InferenceResult with correct shape');
  it('throws NOT_LOADED when run called before loadModel');
  it('returns confidence score between 0 and 1');

  // Post-processing
  it('maps class index to human-readable label');
  it('returns null when top score is below threat class set');
  it('returns highest-confidence threat class when multiple present');
  it('includes all top-10 scores in allScores field');

  // ModelManager
  it('loads model from assets path on first launch');
  it('computes correct SHA-256 for model file');
  it('skips OTA download on non-WiFi connection');
  it('rejects OTA model with mismatched SHA-256');
  it('rolls back to previous model on load failure');
  it('updates node_config after successful model swap');
  it('does not download when manifest version matches current');
});
```

### FR-W3-03: NATS Client

```typescript
describe('FR-W3-03: NATS Client', () => {
  it('connects with correct user/pass from config');
  it('reconnects after connection drop with exponential backoff');
  it('does not exceed maxReconnectTimeWait of 60s');
  it('transitions to NATS_OFFLINE state on disconnect');
  it('transitions to ONLINE state on reconnect');
  it('refreshes token when 401 received from broker');
  it('publishes heartbeat every 60s while connected');
  it('subscribes to alerts.{geohash4} on connect');
  it('subscribes to nodes.{nodeId}.config on connect');
  it('applies remote config update when received on config subject');
  it('drains connection cleanly on app background');
});
```

### FR-W3-04: Offline Buffer

```typescript
describe('FR-W3-04: Offline Buffer', () => {
  it('inserts event to pending_events when NATS unavailable');
  it('returns events in FIFO order');
  it('deletes event from pending_events on NATS ACK');
  it('increments retry_count on failed publish attempt');
  it('prunes oldest 1000 rows when count >= 10000');
  it('flushes all 1000 events correctly on reconnect');
  it('rate-limits flush to 50 events/second during live detection');
  it('preserves original detectedAt timestamp in flushed payload');
  it('generates unique event_id for deduplication');
  it('handles concurrent insert + flush without data loss');
});
```

### FR-W3-05: Location Coarsening

```typescript
describe('FR-W3-05: Location Coarsening', () => {
  it('truncates lat to exactly 4 decimal places');
  it('truncates lng to exactly 4 decimal places');
  it('never rounds — always truncates toward zero');
  it('encodes geohash at precision 7');
  it('returns cached location within TTL window');
  it('fetches fresh location after TTL expires');
  it('returns default location when GPS permission denied');
  it('returns last known location when GPS unavailable');
  it('handles negative coordinates correctly (southern hemisphere)');
});
```

### FR-W3-06: Database Repositories

```typescript
describe('FR-W3-06: Database Repositories', () => {
  // NodeConfigRepo
  it('returns null when no config row exists');
  it('upserts config with correct default values');
  it('updates only specified fields on partial upsert');
  it('triggers updated_at on every upsert');

  // PendingEventsRepo
  it('inserts event with all required fields');
  it('returns rows ordered by id ASC (FIFO)');
  it('counts pending events correctly');
  it('deletes by id without affecting other rows');

  // AlertHistoryRepo
  it('inserts alert with is_read=0 default');
  it('returns recent alerts ordered by alert_at DESC');
  it('marks single alert as read');
  it('returns correct unread count');
  it('prunes alerts older than N days');

  // CalibrationRepo
  it('inserts calibration with all required fields');
  it('returns latest calibration by calibrated_at DESC');
  it('updates detections_24h_after by calibration_id');
});
```

### FR-W3-07: Privacy + Consent

```typescript
describe('FR-W3-07: Privacy + Consent', () => {
  it('does not start audio pipeline before consent granted');
  it('stores consent timestamp in node_config after grant');
  it('calls report-consent Edge Function after consent');
  it('deletes nodeId from SecureStore on deletion');
  it('clears all SQLite tables on deletion');
  it('calls delete-node Edge Function on deletion');
  it('returns to onboarding after deletion completes');
  it('audio file audit returns empty list on clean device');
  it('alert mute persists across app restart');
  it('consent decline navigates to home with monitoring disabled');
});
```

### FR-W3-08: Battery + Thermal

```typescript
describe('FR-W3-08: Battery + Thermal', () => {
  it('returns FULL throttle at 100% battery, 25°C');
  it('returns REDUCED throttle at 25% battery');
  it('returns REDUCED throttle at 39°C');
  it('returns MINIMAL throttle at 19% battery');
  it('returns MINIMAL throttle at 41°C');
  it('returns SUSPENDED throttle at 9% battery');
  it('returns SUSPENDED throttle at 46°C');
  it('maps FULL to 100ms sample interval');
  it('maps MINIMAL to 10000ms sample interval');
  it('maps SUSPENDED to 0 (no sampling)');
});
```

---

## 7. Component Test Specifications

### HomeScreen

```typescript
describe('FR-W3-09: HomeScreen', () => {
  it('renders "Sentinel Active" when pipeline running');
  it('renders "Monitoring Paused" when pipeline stopped');
  it('shows NATS connection status badge');
  it('shows buffer depth count');
  it('shows last event time in relative format');
  it('shows model version string');
  it('navigates to diagnostic when diagnostic button tapped (UA-04)');
  it('shows battery level indicator');
});
```

### AlertFeedScreen

```typescript
describe('FR-W3-10: AlertFeedScreen', () => {
  it('renders alert list with severity colors');
  it('marks alert as read on tap');
  it('shows unread count badge');
  it('renders empty state when no alerts');
  it('renders loading state while fetching');
  it('shows severity 1-3 as green background');
  it('shows severity 4-6 as amber background');
  it('shows severity 7-10 as red background');
  it('renders distance estimate in km');
  it('opens mute options sheet on mute button');
});
```

### OnboardingPermissions

```typescript
describe('FR-W3-11: OnboardingPermissions', () => {
  it('renders "what we do" and "what we never do" lists');
  it('shows privacy policy link');
  it('calls requestMicPermission on Enable button tap');
  it('navigates to nickname screen after consent');
  it('remains on screen when permission declined');
  it('shows "not now" link that navigates without consenting');
});
```

---

## 8. Integration Test Specifications

### Edge Function Integration

```typescript
describe('FR-W3-12: Edge Function Integration', () => {
  // Using nock to mock Supabase Edge Function responses

  it('get-node-config returns valid NodeConfig shape');
  it('get-node-config stores natsToken in SecureStore');
  it('get-node-config retries once on 500 error');
  it('get-node-config throws on 400 CONSENT_REQUIRED');

  it('push-register sends correct expoPushToken format');
  it('push-register returns tokenId in response');

  it('get-alerts-feed returns paginated alerts array');
  it('get-alerts-feed passes geohash4 query param');
  it('get-alerts-feed accepts since parameter for cursor pagination');

  it('delete-node sends DELETE_ALL_MY_DATA confirmation literal');
  it('delete-node response includes tablesAffected array');

  it('report-consent sends correct action enum');
  it('upsert-app-version sends platform + modelVersion');
});
```

### NATS Integration

```typescript
describe('FR-W3-13: NATS Integration', () => {
  // Using in-memory NATS test server

  it('publishes event to events.{geohash6} subject');
  it('published event payload matches DetectionEventPayload schema');
  it('published heartbeat includes batteryLevel and bufferDepth');
  it('subscribes and receives alerts on alerts.{geohash4}');
  it('alert receipt triggers AlertHistoryRepo.insert');
  it('remote config update applies to NodeConfigRepo');
  it('calibration result published to calibration.{nodeId}');
});
```

---

## 9. E2E Test Specifications (Detox)

### Detox Configuration

```json
// .detoxrc.json
{
  "testRunner": { "args": { "$0": "jest", "config": "e2e/jest.config.js" } },
  "apps": {
    "android.debug": {
      "type": "android.apk",
      "binaryPath": "android/app/build/outputs/apk/debug/app-debug.apk",
      "build": "cd android && ./gradlew assembleDebug"
    },
    "ios.debug": {
      "type": "ios.app",
      "binaryPath": "ios/build/Build/Products/Debug-iphonesimulator/ApexSentinel.app",
      "build": "xcodebuild -workspace ios/ApexSentinel.xcworkspace -scheme ApexSentinel -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build"
    }
  },
  "devices": {
    "android.emu": {
      "type": "android.emulator",
      "device": { "avdName": "Pixel_6a_API_33" }
    },
    "ios.sim": {
      "type": "ios.simulator",
      "device": { "type": "iPhone 12" }
    }
  },
  "configurations": {
    "android.emu.release": { "device": "android.emu", "app": "android.debug" },
    "ios.sim.release": { "device": "ios.sim", "app": "ios.debug" }
  }
}
```

### E2E Test: Onboarding Flow

```typescript
// e2e/onboarding.e2e.ts
describe('FR-W3-E2E-01: Onboarding', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('shows welcome screen on first launch', async () => {
    await expect(element(by.id('welcome-screen'))).toBeVisible();
  });

  it('navigates to permissions screen on Get Started tap', async () => {
    await element(by.id('get-started-button')).tap();
    await expect(element(by.id('permissions-screen'))).toBeVisible();
  });

  it('shows consent details before requesting mic permission', async () => {
    await expect(element(by.id('consent-what-we-do-list'))).toBeVisible();
    await expect(element(by.id('consent-what-we-never-do-list'))).toBeVisible();
  });

  it('requests mic permission on Enable tap', async () => {
    await element(by.id('enable-monitoring-button')).tap();
    // Handle OS permission dialog
    if (device.getPlatform() === 'android') {
      await element(by.text('While using the app')).tap();
    } else {
      await element(by.label('Allow')).tap();
    }
  });

  it('navigates to nickname screen after permission', async () => {
    await expect(element(by.id('nickname-screen'))).toBeVisible();
  });

  it('reaches active node screen within 5 minutes', async () => {
    await element(by.id('continue-without-nickname')).tap();
    await waitFor(element(by.id('active-node-screen')))
      .toBeVisible()
      .withTimeout(30000);
  });

  it('shows Sentinel Active status on home screen', async () => {
    await expect(element(by.id('status-badge-active'))).toBeVisible();
  });
});
```

### E2E Test: Background Detection Simulation

```typescript
// e2e/background-detection.e2e.ts
describe('FR-W3-E2E-02: Background Detection', () => {
  it('pipeline survives app going to background', async () => {
    await device.sendToHome();
    await new Promise(r => setTimeout(r, 5000)); // 5s background
    await device.launchApp({ newInstance: false });
    await expect(element(by.id('status-badge-active'))).toBeVisible();
  });

  it('event count increments while backgrounded', async () => {
    const beforeCount = await element(by.id('event-count-today')).getAttributes();
    await device.sendToHome();
    await new Promise(r => setTimeout(r, 10000));
    await device.launchApp({ newInstance: false });
    const afterCount = await element(by.id('event-count-today')).getAttributes();
    // Event count should have increased or stayed same (depends on ambient audio)
    expect(parseInt(afterCount.text)).toBeGreaterThanOrEqual(parseInt(beforeCount.text));
  });

  it('NATS connected indicator visible after background', async () => {
    await expect(element(by.id('nats-connected-badge'))).toBeVisible();
  });
});
```

### E2E Test: Alert Receipt

```typescript
// e2e/alert-receipt.e2e.ts
describe('FR-W3-E2E-03: Alert Receipt', () => {
  // Requires test NATS server that sends a mock alert

  it('alert appears in feed within 3 seconds of NATS publish', async () => {
    // Test harness publishes mock alert to alerts.{geohash4}
    await testHarness.publishMockAlert({ severity: 8, geohash: testGeohash });
    await waitFor(element(by.id('alert-item-0')))
      .toBeVisible()
      .withTimeout(3000);
  });

  it('alert item shows correct severity color (red for 8)', async () => {
    await expect(element(by.id('alert-severity-badge-0'))).toHaveStyle({
      backgroundColor: expect.stringMatching(/#ff|red/i),
    });
  });

  it('tapping alert navigates to map screen', async () => {
    await element(by.id('alert-item-0')).tap();
    await expect(element(by.id('map-screen'))).toBeVisible();
  });

  it('map shows alert pin at correct location', async () => {
    await expect(element(by.id('alert-pin-0'))).toBeVisible();
  });
});
```

### E2E Test: Offline Meshtastic Fallback

```typescript
// e2e/offline-mesh.e2e.ts
describe('FR-W3-E2E-04: Offline Meshtastic Fallback', () => {
  it('transitions to BUFFERING state when network disabled', async () => {
    await device.setStatusBar({ networkActivity: false });
    // Simulate network loss
    await testHarness.disableNATSConnection();
    await waitFor(element(by.id('connectivity-state-buffering')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('shows buffer depth incrementing in diagnostic panel', async () => {
    await element(by.id('diagnostic-tab')).tap();
    // Wait for at least 1 buffered event
    await waitFor(element(by.id('buffer-depth')))
      .toHaveText(expect.stringMatching(/^[1-9]/))
      .withTimeout(30000);
  });

  it('flushes buffer on NATS reconnect', async () => {
    const bufferDepthBefore = await element(by.id('buffer-depth')).getAttributes();
    await testHarness.restoreNATSConnection();
    await waitFor(element(by.id('buffer-depth')))
      .toHaveText('0')
      .withTimeout(60000);
    expect(parseInt(bufferDepthBefore.text)).toBeGreaterThan(0);
  });
});
```

### E2E Test: GDPR Deletion

```typescript
// e2e/deletion.e2e.ts
describe('FR-W3-E2E-05: GDPR Deletion', () => {
  it('navigates from Settings to delete screen in 2 taps', async () => {
    await element(by.id('settings-tab')).tap();
    await element(by.id('privacy-settings-row')).tap();
    await element(by.id('delete-all-data-button')).tap();
    await expect(element(by.id('deletion-confirm-screen'))).toBeVisible();
  });

  it('requires typing DELETE before proceeding', async () => {
    await element(by.id('confirm-delete-proceed')).tap();
    await expect(element(by.id('deletion-confirm-screen'))).toBeVisible(); // Still here
    await element(by.id('deletion-confirmation-input')).typeText('DELETE');
    await element(by.id('confirm-delete-proceed')).tap();
  });

  it('returns to welcome screen after deletion', async () => {
    await waitFor(element(by.id('welcome-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('app is in fresh state (no node_id, no config)', async () => {
    // Verify onboarding shows again (indicates SecureStore cleared)
    await expect(element(by.id('get-started-button'))).toBeVisible();
  });
});
```

---

## 10. Coverage Targets by Module

| Module | Branch | Function | Line | Statement |
|---|---|---|---|---|
| src/audio/ | ≥80% | ≥85% | ≥85% | ≥85% |
| src/ml/ | ≥80% | ≥85% | ≥85% | ≥85% |
| src/nats/ | ≥80% | ≥85% | ≥85% | ≥85% |
| src/db/ | ≥85% | ≥90% | ≥90% | ≥90% |
| src/location/ | ≥90% | ≥95% | ≥95% | ≥95% |
| src/privacy/ | ≥85% | ≥90% | ≥90% | ≥90% |
| src/battery/ | ≥90% | ≥95% | ≥95% | ≥95% |
| src/meshtastic/ | ≥75% | ≥80% | ≥80% | ≥80% |
| src/connectivity/ | ≥80% | ≥85% | ≥85% | ≥85% |
| Overall | ≥80% | ≥80% | ≥80% | ≥80% |

---

## 11. CI Configuration

```yaml
# .github/workflows/test.yml
name: W3 Tests
on: [push, pull_request]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx jest --coverage --ci
      - uses: codecov/codecov-action@v4

  e2e-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          profile: pixel_6a
          script: npx detox test --configuration android.emu.release --headless

  e2e-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx detox build --configuration ios.sim.release
      - run: npx detox test --configuration ios.sim.release

  typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx tsc --noEmit
```

---

## 12. Test Data Fixtures

```typescript
// __fixtures__/detectionEvent.ts
export const mockDetectionEvent = {
  eventId: '123e4567-e89b-12d3-a456-426614174000',
  nodeId: 'abcd1234efgh5678',
  eventType: 'Gunshot_or_gunfire',
  confidence: 0.91,
  modelVersion: '1.0.0',
  inferenceMs: 45,
  lat: 50.4501,
  lng: 30.5234,
  geohash: 'u8c54vn',
  detectedAt: '2026-03-24T10:00:00.000Z',
  publishedAt: '2026-03-24T10:00:00.450Z',
  batteryLevel: 75,
  thermalZone: 32,
  platform: 'android' as const,
  appVersion: '1.0.0',
};

export const mockAlert = {
  alertId: '987fcdeb-51a2-43f7-9012-b3c456789012',
  severity: 8,
  eventType: 'Gunshot_or_gunfire',
  sourceGeohash: 'u8c54vn',
  lat: 50.4501,
  lng: 30.5234,
  confirmedBy: 3,
  alertAt: '2026-03-24T10:00:01.200Z',
  summary: 'Gunfire confirmed by 3 nodes, 250m east',
  ttlS: 3600,
  affectedGeohashes: ['u8c54vn', 'u8c54vq', 'u8c54vy'],
};
```
