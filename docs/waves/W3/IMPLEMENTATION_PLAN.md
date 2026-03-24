# APEX-SENTINEL — Implementation Plan
## W3 | PROJECTAPEX Doc 16/21 | 2026-03-24

Wave 3: React Native (Expo) mobile app — Android + iOS
Duration: 35 days (5 phases × 7 days)

---

## 1. Phase Overview

```
P1  Days  1-7:  Expo init, native TFLite module, background audio, TDD RED
P2  Days  8-14: NATS.ws wrapper, node registration, event publishing
P3  Days 15-21: Alert UI, map, push notifications, SQLite
P4  Days 22-28: Calibration wizard, battery optimization, Meshtastic BLE
P5  Days 29-35: Detox E2E, Sentry, accessibility, EAS build + beta
```

---

## 2. Phase 1 — Foundation (Days 1–7)

### 2.1 Expo Project Init

```bash
# Create project
npx create-expo-app@latest apex-sentinel-mobile \
  --template expo-template-blank-typescript
cd apex-sentinel-mobile

# Install core dependencies
npx expo install \
  expo-av \
  expo-secure-store \
  expo-notifications \
  expo-updates \
  expo-device \
  expo-battery \
  expo-task-manager \
  expo-background-fetch \
  @expo/vector-icons

# Install community packages
npm install \
  nats.ws \
  @mapbox/mapbox-gl-js-mock \
  @rnmapbox/maps \
  expo-sqlite \
  @sentry/react-native \
  zod \
  zustand \
  react-query \
  date-fns

# Dev dependencies
npm install -D \
  jest \
  jest-expo \
  @testing-library/react-native \
  @testing-library/jest-native \
  @types/jest \
  detox \
  @config-plugins/detox \
  ts-jest
```

### 2.2 Folder Structure

```
apex-sentinel-mobile/
├── app/                          # Expo Router (file-based)
│   ├── (tabs)/
│   │   ├── index.tsx             # Home dashboard
│   │   ├── map.tsx               # Map view
│   │   ├── alerts.tsx            # Alert history
│   │   └── settings.tsx          # Settings + privacy
│   ├── alert/[id].tsx            # Alert detail screen
│   ├── calibration/
│   │   ├── index.tsx             # Calibration wizard entry
│   │   ├── step1-register.tsx
│   │   ├── step2-environment.tsx
│   │   ├── step3-baseline.tsx
│   │   ├── step4-threshold.tsx
│   │   └── step5-confirm.tsx
│   └── _layout.tsx
├── src/
│   ├── audio/
│   │   ├── AudioCaptureService.ts      # Background audio manager
│   │   ├── AudioBuffer.ts              # Ring buffer for PCM frames
│   │   ├── AudioProcessor.ts           # Pre-processing (resample, normalize)
│   │   └── __tests__/
│   ├── ml/
│   │   ├── TFLiteInference.ts          # Android TFLite wrapper
│   │   ├── CoreMLInference.ts          # iOS CoreML wrapper
│   │   ├── MLBridge.ts                 # Platform-agnostic interface
│   │   ├── ModelManager.ts             # OTA model download + verification
│   │   └── __tests__/
│   ├── nats/
│   │   ├── NATSClient.ts               # NATS.ws connection manager
│   │   ├── NATSReconnect.ts            # Exponential backoff reconnect
│   │   ├── CircuitBreaker.ts           # Circuit breaker (CLOSED/OPEN/HALF-OPEN)
│   │   ├── Heartbeat.ts                # Periodic NATS heartbeat publisher
│   │   ├── schemas/
│   │   │   ├── detection.schema.ts     # Zod schema: DetectionEvent
│   │   │   ├── alert.schema.ts         # Zod schema: Alert
│   │   │   └── node.schema.ts          # Zod schema: NodeRegistration
│   │   └── __tests__/
│   ├── api/
│   │   ├── supabase.ts                 # Supabase client init
│   │   ├── registerNode.ts             # POST /functions/v1/register-node
│   │   ├── nodeHealth.ts               # POST /functions/v1/node-health
│   │   └── __tests__/
│   ├── storage/
│   │   ├── db.ts                       # expo-sqlite setup + migrations
│   │   ├── DetectionRepository.ts      # CRUD for local detection events
│   │   ├── AlertRepository.ts          # CRUD for local alert history
│   │   ├── NodeRepository.ts           # Node credentials store
│   │   └── __tests__/
│   ├── ble/
│   │   ├── MeshtasticBridge.ts         # BLE ↔ NATS bridge
│   │   ├── BLEScanner.ts               # react-native-ble-plx wrapper
│   │   ├── LoRaPacket.ts               # Meshtastic packet codec
│   │   └── __tests__/
│   ├── store/
│   │   ├── useNodeStore.ts             # Zustand: node state
│   │   ├── useDetectionStore.ts        # Zustand: detection feed
│   │   ├── useAlertStore.ts            # Zustand: alert state
│   │   └── useBatteryStore.ts          # Zustand: battery + sampling rate
│   ├── components/
│   │   ├── ThreatCard.tsx
│   │   ├── DetectionFeed.tsx
│   │   ├── NodeStatusBadge.tsx
│   │   ├── ThreatLevelIndicator.tsx
│   │   ├── AlertMap.tsx
│   │   └── __tests__/
│   ├── hooks/
│   │   ├── useNATSSubscription.ts
│   │   ├── useBackgroundAudio.ts
│   │   ├── useBatteryAdaptiveSampling.ts
│   │   └── useAlertNotifications.ts
│   ├── tasks/
│   │   ├── BACKGROUND_DETECTION_TASK.ts  # expo-task-manager task
│   │   └── MODEL_UPDATE_TASK.ts
│   └── utils/
│       ├── logger.ts                     # Sentry-backed logger
│       ├── crypto.ts                     # SHA-256 verification
│       └── format.ts
├── android/
│   └── app/src/main/
│       ├── java/io/apexsentinel/
│       │   ├── TFLiteModule.kt           # Native TFLite module
│       │   └── TFLitePackage.kt
│       ├── assets/
│       │   └── yamnet_w3_int8.tflite
│       └── AndroidManifest.xml
├── ios/
│   └── apexsentinel/
│       ├── CoreMLBridge.m               # Objective-C bridge
│       ├── CoreMLBridge.h
│       └── YAMNet_W3.mlpackage/
├── modules/
│   └── tflite/
│       ├── android/
│       │   ├── build.gradle
│       │   └── src/main/java/expo/modules/tflite/
│       │       ├── TFLiteModule.kt
│       │       └── TFLiteModuleDefinition.kt
│       ├── ios/
│       │   ├── TFLiteModule.swift
│       │   └── TFLiteModule.podspec
│       ├── index.ts                     # JS interface
│       └── src/
│           └── TFLiteModule.types.ts
├── __tests__/
│   ├── setup.ts
│   └── e2e/                            # Detox tests
│       ├── home.test.ts
│       ├── alert-flow.test.ts
│       ├── calibration.test.ts
│       └── background-audio.test.ts
├── app.json
├── app.config.ts
├── eas.json
├── jest.config.ts
├── tsconfig.json
├── .detoxrc.js
└── babel.config.js
```

### 2.3 Native TFLite Module (Android Kotlin)

File: `modules/tflite/android/src/main/java/expo/modules/tflite/TFLiteModule.kt`

```kotlin
package expo.modules.tflite

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import android.content.Context
import java.nio.FloatBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder

class TFLiteModule : Module() {
  private var interpreter: Interpreter? = null
  private val modelName = "yamnet_w3_int8.tflite"

  override fun definition() = ModuleDefinition {
    Name("TFLiteModule")

    AsyncFunction("loadModel") { modelPath: String ->
      val context = appContext.reactContext ?: throw Exception("Context unavailable")
      val options = Interpreter.Options().apply {
        numThreads = 2
        useNNAPI = false          // NNAPI unstable on Android < 10
        useXNNPACK = true         // XNNPACK acceleration for ARM
      }
      val modelBuffer = FileUtil.loadMappedFile(context, modelPath)
      interpreter = Interpreter(modelBuffer, options)
    }

    AsyncFunction("runInference") { pcmData: FloatArray ->
      val interp = interpreter ?: throw Exception("Model not loaded")
      // YAMNet expects [1, 15600] — 1s at 16kHz
      val inputBuffer = ByteBuffer.allocateDirect(pcmData.size * 4)
        .order(ByteOrder.nativeOrder())
        .also { buf ->
          pcmData.forEach { buf.putFloat(it) }
          buf.rewind()
        }
      // Output: [1, 521] scores
      val outputBuffer = Array(1) { FloatArray(521) }
      val start = System.currentTimeMillis()
      interp.run(inputBuffer, outputBuffer)
      val inferenceMs = System.currentTimeMillis() - start

      mapOf(
        "scores" to outputBuffer[0].toList(),
        "inferenceMs" to inferenceMs,
        "topClassIndex" to outputBuffer[0].indices.maxByOrNull { outputBuffer[0][it] }!!,
        "topClassScore" to outputBuffer[0].max()
      )
    }

    AsyncFunction("closeModel") {
      interpreter?.close()
      interpreter = null
    }
  }
}
```

File: `modules/tflite/android/build.gradle`:
```groovy
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'
apply plugin: 'expo-module'

android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 26
        targetSdkVersion 34
    }
    aaptOptions {
        noCompress "tflite"
    }
}

dependencies {
    implementation 'org.tensorflow:tensorflow-lite:2.16.1'
    implementation 'org.tensorflow:tensorflow-lite-support:0.4.4'
    implementation 'org.tensorflow:tensorflow-lite-select-tf-ops:2.16.1'
}
```

### 2.4 Background Audio Service (Android Foreground Service)

File: `src/audio/AudioCaptureService.ts`

```typescript
import * as TaskManager from 'expo-task-manager';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

export const BACKGROUND_DETECTION_TASK = 'BACKGROUND_DETECTION';
export const AUDIO_SAMPLE_RATE = 16000;
export const FRAME_DURATION_MS = 1000;
export const FRAME_SAMPLES = AUDIO_SAMPLE_RATE; // 16000 samples per frame

export interface AudioCaptureConfig {
  sampleRateHz: number;
  frameDurationMs: number;
  onFrame: (pcmFloat32: Float32Array, timestampUs: number) => void;
  onError: (error: Error) => void;
}

export class AudioCaptureService {
  private recording: Audio.Recording | null = null;
  private isCapturing = false;

  async start(config: AudioCaptureConfig): Promise<void> {
    if (this.isCapturing) return;

    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,   // iOS: stay active in background
      interruptionModeIOS: 1,           // DO_NOT_MIX
      shouldDuckAndroid: false,
      interruptionModeAndroid: 1,
      playThroughEarpieceAndroid: false,
    });

    this.recording = new Audio.Recording();
    await this.recording.prepareToRecordAsync({
      android: {
        extension: '.raw',
        outputFormat: Audio.AndroidOutputFormat.DEFAULT,
        audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
        sampleRate: config.sampleRateHz,
        numberOfChannels: 1,
        bitRate: 256000,
      },
      ios: {
        extension: '.caf',
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: config.sampleRateHz,
        numberOfChannels: 1,
        bitRate: 256000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {},
    });

    await this.recording.startAsync();
    this.isCapturing = true;
    this.scheduleFrameExtraction(config);
  }

  async stop(): Promise<void> {
    if (!this.isCapturing) return;
    await this.recording?.stopAndUnloadAsync();
    this.recording = null;
    this.isCapturing = false;
  }

  private scheduleFrameExtraction(config: AudioCaptureConfig): void {
    // Frame extraction runs every FRAME_DURATION_MS
    // Actual PCM extraction handled by native TFLite module
  }
}
```

### 2.5 Jest Configuration

File: `jest.config.ts`

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['./src/__tests__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.types.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    'nats.ws': '<rootDir>/src/__mocks__/nats.ws.ts',
    '@rnmapbox/maps': '<rootDir>/src/__mocks__/@rnmapbox/maps.tsx',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
};

export default config;
```

### 2.6 TDD RED — First Failing Tests

File: `src/audio/__tests__/AudioCaptureService.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AudioCaptureService } from '../AudioCaptureService';

// FR-W3-01: Background audio capture
describe('FR-W3-01: Background Audio Capture', () => {
  let service: AudioCaptureService;

  beforeEach(() => { service = new AudioCaptureService(); });
  afterEach(() => service.stop());

  it('starts audio capture without throwing', async () => {
    await expect(service.start({ sampleRateHz: 16000, frameDurationMs: 1000, onFrame: jest.fn(), onError: jest.fn() })).resolves.toBeUndefined();
  });

  it('emits PCM frames at 1Hz', async () => {
    const frames: Float32Array[] = [];
    await service.start({ sampleRateHz: 16000, frameDurationMs: 1000, onFrame: (pcm) => frames.push(pcm), onError: jest.fn() });
    await new Promise(r => setTimeout(r, 3100));
    expect(frames.length).toBeGreaterThanOrEqual(3);
  });

  it('each frame contains 16000 samples', async () => {
    const frames: Float32Array[] = [];
    await service.start({ sampleRateHz: 16000, frameDurationMs: 1000, onFrame: (pcm) => frames.push(pcm), onError: jest.fn() });
    await new Promise(r => setTimeout(r, 1100));
    expect(frames[0]).toHaveLength(16000);
  });

  it('stops without error', async () => {
    await service.start({ sampleRateHz: 16000, frameDurationMs: 1000, onFrame: jest.fn(), onError: jest.fn() });
    await expect(service.stop()).resolves.toBeUndefined();
  });

  it('does not restart if already capturing', async () => {
    const config = { sampleRateHz: 16000, frameDurationMs: 1000, onFrame: jest.fn(), onError: jest.fn() };
    await service.start(config);
    await service.start(config); // should be no-op
    expect(config.onFrame).not.toHaveBeenCalledTimes(0); // was called at least by first start
  });
});
```

P1 exit criteria:
- Expo project builds (`npx expo export --platform all` exits 0)
- Native TFLite module compiles (`cd android && ./gradlew assembleRelease`)
- All P1 tests committed in RED state
- `modules/tflite/` structure complete
- Background audio service TypeScript compiles without errors

---

## 3. Phase 2 — NATS.ws + Node Registration (Days 8–14)

### 3.1 NATS.ws Wrapper

File: `src/nats/NATSClient.ts`

```typescript
import { connect, NatsConnection, Subscription, StringCodec, NKeyAuthenticator } from 'nats.ws';
import { CircuitBreaker, CircuitState } from './CircuitBreaker';
import { logger } from '../utils/logger';

const sc = StringCodec();

export interface NATSConfig {
  wsUrl: string;           // wss://nats.apex-sentinel.io:443
  nkeyCredentials: string; // NATS NKey seed (stored in SecureStore)
  heartbeatIntervalMs: number;
  reconnectWaitMs: number;
}

export class NATSClient {
  private nc: NatsConnection | null = null;
  private breaker: CircuitBreaker;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscriptions = new Map<string, Subscription>();

  constructor(private config: NATSConfig) {
    this.breaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
    });
  }

  async connect(): Promise<void> {
    await this.breaker.execute(async () => {
      this.nc = await connect({
        servers: [this.config.wsUrl],
        authenticator: NKeyAuthenticator(new TextEncoder().encode(this.config.nkeyCredentials)),
        reconnect: true,
        reconnectTimeWait: this.config.reconnectWaitMs,
        maxReconnectAttempts: -1,
        pingInterval: this.config.heartbeatIntervalMs,
        timeout: 10000,
        name: `apex-sentinel-mobile`,
      });
      this.startHeartbeat();
      logger.info('NATS connected', { server: this.config.wsUrl });
    });
  }

  async publish(subject: string, payload: unknown): Promise<void> {
    if (!this.nc || this.nc.isClosed()) {
      throw new Error('NATS not connected');
    }
    const data = sc.encode(JSON.stringify(payload));
    await this.nc.publish(subject, data);
  }

  subscribe(subject: string, handler: (msg: unknown, subject: string) => void): () => void {
    if (!this.nc) throw new Error('NATS not connected');
    const sub = this.nc.subscribe(subject, {
      callback: (err, msg) => {
        if (err) { logger.error('NATS subscription error', { subject, err }); return; }
        try {
          const parsed = JSON.parse(sc.decode(msg.data));
          handler(parsed, msg.subject);
        } catch (e) {
          logger.warn('NATS message parse error', { subject, e });
        }
      },
    });
    this.subscriptions.set(subject, sub);
    return () => { sub.unsubscribe(); this.subscriptions.delete(subject); };
  }

  get state(): CircuitState { return this.breaker.state; }
  get isConnected(): boolean { return this.nc !== null && !this.nc.isClosed(); }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.publish('sentinel.node.heartbeat', { ts: Date.now(), type: 'mobile' });
      } catch (e) {
        logger.warn('Heartbeat publish failed', { e });
      }
    }, this.config.heartbeatIntervalMs);
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.subscriptions.forEach(s => s.unsubscribe());
    await this.nc?.drain();
    this.nc = null;
  }
}
```

### 3.2 CircuitBreaker

File: `src/nats/CircuitBreaker.ts`

```typescript
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;         // ms before OPEN → HALF_OPEN
}

export class CircuitBreaker {
  private _state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;

  constructor(private config: CircuitBreakerConfig) {}

  get state(): CircuitState { return this._state; }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this._state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`);
      }
      this._state = 'HALF_OPEN';
      this.successes = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this._state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this._state = 'CLOSED';
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.config.failureThreshold || this._state === 'HALF_OPEN') {
      this._state = 'OPEN';
      this.nextAttempt = Date.now() + this.config.timeout;
    }
  }

  reset(): void {
    this._state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = 0;
  }
}
```

### 3.3 Node Registration Flow

File: `src/api/registerNode.ts`

```typescript
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const RegisterNodeResponseSchema = z.object({
  node_id: z.string().regex(/^nde_[0-9A-Z]{26}$/),
  nats_endpoint: z.string().url(),
  nats_nkey_seed: z.string(),
  nats_subject_prefix: z.string(),
  registered_at: z.string().datetime(),
});

export type RegisterNodeResponse = z.infer<typeof RegisterNodeResponseSchema>;

export async function registerNode(params: {
  tier: 4;
  capabilities: string[];
  lat: number;
  lon: number;
  operator_id?: string;
}): Promise<RegisterNodeResponse> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/register-node`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`register-node failed: ${err.error?.code} — ${err.error?.message}`);
  }

  const raw = await resp.json();
  const parsed = RegisterNodeResponseSchema.parse(raw);

  // Persist credentials in SecureStore
  await SecureStore.setItemAsync('sentinel_node_id', parsed.node_id);
  await SecureStore.setItemAsync('sentinel_nkey_seed', parsed.nats_nkey_seed);
  await SecureStore.setItemAsync('sentinel_nats_endpoint', parsed.nats_endpoint);
  await SecureStore.setItemAsync('sentinel_subject_prefix', parsed.nats_subject_prefix);

  return parsed;
}

export async function getNodeCredentials(): Promise<RegisterNodeResponse | null> {
  const node_id = await SecureStore.getItemAsync('sentinel_node_id');
  if (!node_id) return null;
  return {
    node_id,
    nats_nkey_seed: (await SecureStore.getItemAsync('sentinel_nkey_seed'))!,
    nats_endpoint: (await SecureStore.getItemAsync('sentinel_nats_endpoint'))!,
    nats_subject_prefix: (await SecureStore.getItemAsync('sentinel_subject_prefix'))!,
    registered_at: '',
  };
}

export async function clearNodeCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync('sentinel_node_id'),
    SecureStore.deleteItemAsync('sentinel_nkey_seed'),
    SecureStore.deleteItemAsync('sentinel_nats_endpoint'),
    SecureStore.deleteItemAsync('sentinel_subject_prefix'),
  ]);
}
```

P2 exit criteria:
- NATS.ws connects to `wss://nats.apex-sentinel.io:443` from physical device
- CircuitBreaker unit tests pass (15 tests)
- `registerNode` POST returns valid credentials stored in SecureStore
- Detection event published to `sentinel.detections.{nodeId}` and confirmed ACK

---

## 4. Phase 3 — Alert UI + Map + Push (Days 15–21)

### 4.1 Alert Subscription + Push Notifications

File: `src/hooks/useAlertNotifications.ts`

```typescript
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNATSClient } from './useNATSClient';
import { AlertSchema } from '../nats/schemas/alert.schema';
import { useAlertStore } from '../store/useAlertStore';
import { AlertRepository } from '../storage/AlertRepository';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useAlertNotifications() {
  const nats = useNATSClient();
  const addAlert = useAlertStore(s => s.addAlert);
  const repo = useRef(new AlertRepository());

  useEffect(() => {
    if (!nats.isConnected) return;

    const unsub = nats.subscribe('sentinel.alerts.>', async (msg, subject) => {
      const parsed = AlertSchema.safeParse(msg);
      if (!parsed.success) return;

      const alert = parsed.data;
      addAlert(alert);
      await repo.current.insert(alert);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `[${alert.threat_level.toUpperCase()}] ${alert.threat_class}`,
          body: `Confidence ${(alert.confidence * 100).toFixed(0)}% — ${alert.geo_sector}`,
          data: { alert_id: alert.alert_id, subject },
          sound: alert.threat_level === 'critical' ? 'critical.wav' : 'default',
          badge: 1,
        },
        trigger: null, // immediate
      });
    });

    return unsub;
  }, [nats.isConnected]);
}
```

### 4.2 ThreatCard Component

File: `src/components/ThreatCard.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AccessibilityInfo } from 'react-native';
import { Alert } from '../nats/schemas/alert.schema';
import { formatDistanceToNow } from 'date-fns';

const THREAT_COLORS: Record<string, string> = {
  critical: '#FF1744',
  high:     '#FF6D00',
  medium:   '#FFD600',
  low:      '#00E676',
  info:     '#2979FF',
};

interface ThreatCardProps {
  alert: Alert;
  onPress: (alert: Alert) => void;
}

export const ThreatCard: React.FC<ThreatCardProps> = ({ alert, onPress }) => {
  const color = THREAT_COLORS[alert.threat_level] ?? THREAT_COLORS.info;
  const timeAgo = formatDistanceToNow(new Date(alert.dispatched_at), { addSuffix: true });

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: color }]}
      onPress={() => onPress(alert)}
      accessibilityRole="button"
      accessibilityLabel={`${alert.threat_level} threat: ${alert.threat_class}, confidence ${Math.round(alert.confidence * 100)} percent, ${timeAgo}`}
      accessibilityHint="Double tap to view alert details"
    >
      <View style={styles.header}>
        <View style={[styles.levelBadge, { backgroundColor: color }]}>
          <Text style={styles.levelText}>{alert.threat_level.toUpperCase()}</Text>
        </View>
        <Text style={styles.time}>{timeAgo}</Text>
      </View>
      <Text style={styles.threatClass}>{alert.threat_class}</Text>
      <Text style={styles.confidence}>
        Confidence: {(alert.confidence * 100).toFixed(1)}%
      </Text>
      <Text style={styles.sector}>{alert.geo_sector}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#1A1A2E', borderLeftWidth: 4, borderRadius: 8, padding: 16, marginVertical: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  levelText: { color: '#000', fontWeight: '700', fontSize: 11 },
  time: { color: '#666', fontSize: 12 },
  threatClass: { color: '#FFF', fontWeight: '600', fontSize: 16, marginBottom: 4 },
  confidence: { color: '#AAA', fontSize: 13, marginBottom: 2 },
  sector: { color: '#666', fontSize: 12 },
});
```

### 4.3 SQLite Setup

File: `src/storage/db.ts`

```typescript
import * as SQLite from 'expo-sqlite';

export const DB_VERSION = 3; // W3 initial schema

export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('apex_sentinel.db');
  await runMigrations(db);
  return db;
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS detection_events (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      timestamp_us INTEGER NOT NULL,
      threat_class TEXT NOT NULL,
      confidence REAL NOT NULL,
      gate1_pass INTEGER NOT NULL,
      gate2_pass INTEGER NOT NULL,
      gate3_pass INTEGER NOT NULL,
      nats_published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_detection_timestamp
      ON detection_events(timestamp_us DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      alert_id TEXT PRIMARY KEY,
      threat_level TEXT NOT NULL,
      threat_class TEXT NOT NULL,
      confidence REAL NOT NULL,
      geo_sector TEXT NOT NULL,
      lat REAL,
      lon REAL,
      track_id TEXT,
      dispatched_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_received
      ON alerts(received_at DESC);

    CREATE TABLE IF NOT EXISTS node_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
```

P3 exit criteria:
- `sentinel.alerts.>` subscription active, push notifications firing on device
- ThreatCard renders correctly in React Native Test Renderer
- Alert history persists across app restart (SQLite)
- Mapbox map loads offline tiles for test region

---

## 5. Phase 4 — Calibration + Battery + Meshtastic (Days 22–28)

### 5.1 Calibration Wizard (5 Steps)

Step definitions:
```
Step 1 — Register Node:
  Action: POST /functions/v1/register-node
  Input: GPS location (expo-location), node tier = 4
  Output: node_id, NATS credentials stored in SecureStore
  Validation: node_id format regex, NATS connection test

Step 2 — Environment:
  Action: Record 5s ambient audio
  Input: microphone permission
  Output: ambient_db_spl (float), ambient_spectral_profile (Float32Array 521)
  Validation: SPL between 20–90 dBFS

Step 3 — Baseline Calibration:
  Action: Run 10 inference frames on ambient audio
  Output: baseline_scores (mean over 10 frames), false_positive_threshold
  Validation: baseline confidence < 0.1 for all drone classes

Step 4 — Threshold:
  Action: User adjusts sensitivity slider (0.1–0.9, default 0.3)
  Output: gate1_threshold, gate2_threshold, gate3_threshold stored in node_state
  Validation: gate3_threshold > gate2_threshold > gate1_threshold

Step 5 — Confirm:
  Action: Display summary, test NATS publish (sentinel.node.calibration-complete)
  Output: calibration_version = 1, calibration_at = ISO timestamp
  Validation: NATS ACK received within 5s
```

File: `app/calibration/step1-register.tsx`

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { registerNode } from '../../src/api/registerNode';
import { useNodeStore } from '../../src/store/useNodeStore';
import { router } from 'expo-router';

export default function Step1Register() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setNodeId = useNodeStore(s => s.setNodeId);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await registerNode({
        tier: 4,
        capabilities: ['yamnet', 'ble_relay'],
        lat: parseFloat(loc.coords.latitude.toFixed(3)),  // coarsen to ±111m
        lon: parseFloat(loc.coords.longitude.toFixed(3)),
      });
      setNodeId(result.node_id);
      router.push('/calibration/step2-environment');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Step 1 of 5: Register Node</Text>
      <Text style={styles.body}>
        This device will be registered as a TIER-4 detection node.
        Your location is coarsened to ±111m before transmission.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={styles.button}
        onPress={handleRegister}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Register this device as a detection node"
      >
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Register Node</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A', padding: 24, justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  body: { color: '#AAA', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  error: { color: '#FF1744', fontSize: 14, marginBottom: 16 },
  button: { backgroundColor: '#00E5FF', borderRadius: 8, padding: 16, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
```

### 5.2 Battery Adaptive Sampling

File: `src/hooks/useBatteryAdaptiveSampling.ts`

```typescript
import { useEffect, useCallback } from 'react';
import * as Battery from 'expo-battery';
import { useBatteryStore } from '../store/useBatteryStore';

// Sampling rates by battery level
const SAMPLING_RATES = [
  { threshold: 0.20, rateHz: 1, label: 'LOW_BATTERY' },   // < 20%: 1Hz
  { threshold: 0.40, rateHz: 2, label: 'MEDIUM' },         // 20-40%: 2Hz
  { threshold: 1.00, rateHz: 4, label: 'NORMAL' },         // > 40%: 4Hz
];

export function useBatteryAdaptiveSampling() {
  const setSamplingRate = useBatteryStore(s => s.setSamplingRate);
  const setBatteryLevel = useBatteryStore(s => s.setBatteryLevel);

  const updateRate = useCallback((level: number) => {
    setBatteryLevel(level);
    const config = SAMPLING_RATES.find(r => level < r.threshold) ?? SAMPLING_RATES[2];
    setSamplingRate(config.rateHz);
  }, [setSamplingRate, setBatteryLevel]);

  useEffect(() => {
    let sub: Battery.Subscription;
    (async () => {
      const level = await Battery.getBatteryLevelAsync();
      updateRate(level);
      sub = Battery.addBatteryLevelListener(({ batteryLevel }) => updateRate(batteryLevel));
    })();
    return () => sub?.remove();
  }, [updateRate]);
}
```

### 5.3 Meshtastic BLE Bridge

File: `src/ble/MeshtasticBridge.ts`

```typescript
import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { NATSClient } from '../nats/NATSClient';
import { logger } from '../utils/logger';

// Meshtastic BLE service UUID
const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5d6646c0be5b';
const TORADIO_CHARACTERISTIC_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
const FROMRADIO_CHARACTERISTIC_UUID = '8ba2bcc2-ee02-4a55-a531-c525c5e454d5';

export interface MeshtasticConfig {
  scanTimeoutMs: number;
  nats: NATSClient;
  nodeId: string;
}

export class MeshtasticBridge {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private isScanning = false;

  constructor(private config: MeshtasticConfig) {
    this.manager = new BleManager();
  }

  async startScan(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    this.manager.startDeviceScan(
      [MESHTASTIC_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) { logger.error('BLE scan error', { error }); return; }
        if (device) this.connectToDevice(device);
      }
    );

    setTimeout(() => {
      this.manager.stopDeviceScan();
      this.isScanning = false;
    }, this.config.scanTimeoutMs);
  }

  private async connectToDevice(device: Device): Promise<void> {
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      this.connectedDevice = connected;
      logger.info('Meshtastic device connected', { id: device.id, name: device.name });
      await this.startReceiving(connected);
    } catch (e) {
      logger.warn('BLE connection failed', { device: device.id, e });
    }
  }

  private async startReceiving(device: Device): Promise<void> {
    device.monitorCharacteristicForService(
      MESHTASTIC_SERVICE_UUID,
      FROMRADIO_CHARACTERISTIC_UUID,
      async (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const packet = Buffer.from(characteristic.value, 'base64');
        await this.forwardToNATS(packet);
      }
    );
  }

  private async forwardToNATS(packet: Buffer): Promise<void> {
    const subject = `sentinel.mesh.inbound.${this.config.nodeId}`;
    await this.config.nats.publish(subject, {
      raw_b64: packet.toString('base64'),
      received_at: Date.now(),
      source: 'meshtastic_ble',
    });
  }

  async disconnect(): Promise<void> {
    await this.connectedDevice?.cancelConnection();
    this.connectedDevice = null;
    this.manager.destroy();
  }
}
```

P4 exit criteria:
- Calibration wizard completes end-to-end on physical device (< 5s registration)
- Battery adaptive sampling triggers at < 20% level (verified in Detox)
- Meshtastic BLE scan finds and connects to paired device
- All P4 tests pass (≥ 38 new tests)

---

## 6. Phase 5 — QA, Sentry, Accessibility, EAS Build (Days 29–35)

### 6.1 Detox E2E Configuration

File: `.detoxrc.js`

```javascript
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { '$0': 'jest', config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/apexsentinel.app',
    },
  },
  devices: {
    'android.emulator': {
      type: 'android.emulator',
      device: { avdName: 'Pixel_7_API_34' },
    },
    'ios.simulator': {
      type: 'ios.simulator',
      device: { type: 'iPhone 14', os: 'iOS 17.0' },
    },
  },
  configurations: {
    'android.emu.release': { device: 'android.emulator', app: 'android.release' },
    'ios.sim.release': { device: 'ios.simulator', app: 'ios.release' },
  },
};
```

File: `__tests__/e2e/home.test.ts`

```typescript
import { device, element, by, expect as detoxExpect, waitFor } from 'detox';

describe('FR-W3-08: Home Dashboard', () => {
  beforeAll(async () => { await device.launchApp({ newInstance: true }); });
  afterAll(async () => { await device.terminateApp(); });

  it('shows node status badge', async () => {
    await waitFor(element(by.id('node-status-badge'))).toBeVisible().withTimeout(10000);
  });

  it('shows detection feed', async () => {
    await waitFor(element(by.id('detection-feed'))).toBeVisible().withTimeout(10000);
  });

  it('shows threat level indicator', async () => {
    await waitFor(element(by.id('threat-level-indicator'))).toBeVisible().withTimeout(10000);
  });
});
```

### 6.2 Sentry Integration

File: `src/utils/logger.ts`

```typescript
import * as Sentry from '@sentry/react-native';

const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.05,
    enabled: IS_PROD,
    integrations: [new Sentry.ReactNativeTracing({ routingInstrumentation: new Sentry.ReactNavigationInstrumentation() })],
  });
}

export const logger = {
  info: (msg: string, ctx?: object) => { if (!IS_PROD) console.log('[INFO]', msg, ctx); },
  warn: (msg: string, ctx?: object) => {
    console.warn('[WARN]', msg, ctx);
    if (IS_PROD) Sentry.captureMessage(msg, { level: 'warning', extra: ctx });
  },
  error: (msg: string, ctx?: object) => {
    console.error('[ERROR]', msg, ctx);
    if (IS_PROD) Sentry.captureException(new Error(msg), { extra: ctx });
  },
};
```

### 6.3 EAS Build Configuration

File: `eas.json`

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "gradleCommand": ":app:assembleDebug", "buildType": "apk" },
      "ios": { "buildConfiguration": "Debug" },
      "env": {
        "EXPO_PUBLIC_NATS_WS_URL": "wss://nats-dev.apex-sentinel.io:443",
        "EXPO_PUBLIC_SUPABASE_URL": "https://bymfcnwfyxuivinuzurr.supabase.co"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios": { "simulator": true }
    },
    "production": {
      "android": { "buildType": "app-bundle", "gradleCommand": ":app:bundleRelease" },
      "ios": { "buildConfiguration": "Release" },
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_NATS_WS_URL": "wss://nats.apex-sentinel.io:443",
        "EXPO_PUBLIC_SUPABASE_URL": "https://bymfcnwfyxuivinuzurr.supabase.co"
      }
    }
  },
  "submit": {
    "production": {
      "android": { "serviceAccountKeyPath": "./google-service-account.json", "track": "internal" },
      "ios": { "appleId": "builds@apex-os.io", "ascAppId": "", "appleTeamId": "" }
    }
  }
}
```

P5 exit criteria:
- All Detox E2E tests pass on Pixel_7_API_34 emulator and iPhone 14 simulator
- Sentry DSN configured, test crash captured and visible in Sentry dashboard
- `eas build --platform all --profile production` completes successfully
- WCAG 2.1 AA audit passes (0 critical/serious issues)
- Beta build distributed to internal testers via EAS
- LKGC snapshot captured and committed

---

## 7. Commands Reference

```bash
# Development
npx expo start
npx expo start --ios
npx expo start --android

# Tests
npx jest --watch
npx jest --coverage --ci
npx tsc --noEmit

# Detox
npx detox build --configuration android.emu.release
npx detox test --configuration android.emu.release -l verbose
npx detox build --configuration ios.sim.release
npx detox test --configuration ios.sim.release -l verbose

# EAS
eas build --platform all --profile preview
eas build --platform all --profile production
eas update --branch production --message "W3 release"
eas submit --platform all --profile production

# LKGC
./scripts/lkgc-capture-w3.sh
```
