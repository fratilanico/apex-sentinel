# APEX-SENTINEL W3 — AI Pipeline
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Pipeline Overview

The W3 AI pipeline implements on-device acoustic event detection. Audio is captured from the device microphone, processed through VAD and FFT stages, and fed into a YAMNet INT8 TFLite model (Android) or CoreML model (iOS). Detections above confidence threshold are dispatched to the event publishing layer. No audio data leaves the device.

### Pipeline Stages

```
Microphone (16kHz PCM)
       │
       ▼
1. AUDIO CAPTURE          — 100ms frames, 16-bit PCM, ring buffer
       │
       ▼
2. VAD (Energy Gate)      — RMS threshold, reject silence
       │ signal present
       ▼
3. SLIDING WINDOW         — 975ms YAMNet window, 50% overlap
       │
       ▼
4. PRE-PROCESSING         — Normalize, apply Hann window
       │
       ▼
5. FFT + MEL SPECTROGRAM  — 512-point FFT → 64 mel bands
       │
       ▼
6. ML INFERENCE           — TFLite (Android) / CoreML (iOS)
       │                    YAMNet INT8, 521 classes
       ▼
7. POST-PROCESSING        — Top-k filter, confidence threshold, class mapping
       │ confidence >= 0.72
       ▼
8. THERMAL/BATTERY GATE   — Check throttle state
       │ not suspended
       ▼
9. EVENT DISPATCH         — Build DetectionEvent, route to NATS/buffer
```

---

## 2. Model: YAMNet INT8

### 2.1 Model Specification

| Attribute | Value |
|---|---|
| Architecture | YAMNet (MobileNetV1-based) |
| Task | Multi-label audio classification |
| Classes | 521 (AudioSet ontology) |
| Input | 15,600 float32 samples (975ms @ 16kHz) |
| Output | 521 float32 confidence scores |
| Quantization | INT8 post-training quantization |
| File format | TensorFlow Lite FlatBuffer |
| File size | 480KB |
| Framework versions | TFLite 2.13.0 (Android), CoreML 6 (iOS) |

### 2.2 Relevant Class IDs

Primary threat classes (index in YAMNet 521-class vocabulary):

| Class Label | AudioSet ID | Priority |
|---|---|---|
| Gunshot, gunfire | /m/032s66 | CRITICAL |
| Explosion | /m/081rb | CRITICAL |
| Artillery fire | /m/0_1c | CRITICAL |
| Burst, pop | /m/07rv9rh | HIGH |
| Rumble | /m/07q5rw0 | HIGH |
| Shatter | /m/07rn7sz | MEDIUM |
| Screaming | /m/03qc9zr | MEDIUM |
| Siren | /m/03kmc9 | MEDIUM |
| Aircraft | /m/0cmf2 | LOW |
| Helicopter | /m/01280g | LOW |

Secondary class mapping is maintained in `src/ml/classMap.ts` and updated with each model version.

### 2.3 Model Files

```
native/android/assets/
  yamnet_int8.tflite          480KB — INT8 quantized, production
  yamnet_int8_v*.tflite       Previous versions (retained for rollback, max 2)

native/ios/models/
  YAMNet.mlmodel              Converted via coremltools 7.x
  YAMNet.mlmodelc/            Compiled model cache
```

---

## 3. Android TFLite Implementation

### 3.1 Java Native Module — Full Implementation

```java
// native/android/app/src/main/java/uk/apexos/sentinel/TFLiteModule.java

package uk.apexos.sentinel;

import android.content.Context;
import android.os.SystemClock;
import com.facebook.react.bridge.*;
import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.support.common.FileUtil;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.MappedByteBuffer;
import java.security.MessageDigest;
import java.util.Arrays;

public class TFLiteModule extends ReactContextBaseJavaModule {

  private static final String MODULE_NAME = "TFLiteModule";
  private static final int YAMNET_INPUT_SIZE = 15600;
  private static final int YAMNET_OUTPUT_SIZE = 521;
  private static final int NUM_THREADS = 2;

  private Interpreter interpreter;
  private String currentModelPath;
  private String currentModelSha256;

  public TFLiteModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @ReactMethod
  public void loadModel(String modelPath, Promise promise) {
    try {
      MappedByteBuffer modelBuffer;
      if (modelPath.startsWith("asset://")) {
        String assetName = modelPath.replace("asset://", "");
        modelBuffer = FileUtil.loadMappedFile(getReactApplicationContext(), assetName);
      } else {
        modelBuffer = FileUtil.loadMappedFile(modelPath);
      }

      Interpreter.Options options = new Interpreter.Options();
      options.setNumThreads(NUM_THREADS);
      options.setUseNNAPI(true);       // GPU delegate fallback
      options.setUseXNNPACK(true);     // CPU optimisation

      if (interpreter != null) {
        interpreter.close();
      }
      interpreter = new Interpreter(modelBuffer, options);
      currentModelPath = modelPath;
      currentModelSha256 = computeSha256(modelBuffer);

      WritableMap result = Arguments.createMap();
      result.putBoolean("success", true);
      result.putString("sha256", currentModelSha256);
      result.putArray("inputShape", shapeToArray(
        interpreter.getInputTensor(0).shape()));
      result.putArray("outputShape", shapeToArray(
        interpreter.getOutputTensor(0).shape()));
      promise.resolve(result);

    } catch (IOException e) {
      promise.reject("LOAD_FAILED", "Failed to load model: " + e.getMessage());
    } catch (Exception e) {
      promise.reject("LOAD_ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void runInference(ReadableArray inputData, Promise promise) {
    if (interpreter == null) {
      promise.reject("NOT_LOADED", "Model not loaded. Call loadModel first.");
      return;
    }
    if (inputData.size() != YAMNET_INPUT_SIZE) {
      promise.reject("INVALID_INPUT",
        "Expected " + YAMNET_INPUT_SIZE + " samples, got " + inputData.size());
      return;
    }

    long startMs = SystemClock.elapsedRealtime();

    float[] inputArray = new float[YAMNET_INPUT_SIZE];
    for (int i = 0; i < YAMNET_INPUT_SIZE; i++) {
      inputArray[i] = (float) inputData.getDouble(i);
    }

    float[][] outputArray = new float[1][YAMNET_OUTPUT_SIZE];

    try {
      interpreter.run(inputArray, outputArray);
    } catch (Exception e) {
      promise.reject("INFERENCE_ERROR", e.getMessage());
      return;
    }

    long inferenceMs = SystemClock.elapsedRealtime() - startMs;
    float[] scores = outputArray[0];

    // Top-10 results
    Integer[] indices = new Integer[YAMNET_OUTPUT_SIZE];
    for (int i = 0; i < YAMNET_OUTPUT_SIZE; i++) indices[i] = i;
    Arrays.sort(indices, (a, b) -> Float.compare(scores[b], scores[a]));

    WritableArray classIndices = Arguments.createArray();
    WritableArray classScores = Arguments.createArray();
    for (int i = 0; i < 10; i++) {
      classIndices.pushInt(indices[i]);
      classScores.pushDouble(scores[indices[i]]);
    }

    WritableMap result = Arguments.createMap();
    result.putArray("classIndices", classIndices);
    result.putArray("scores", classScores);
    result.putDouble("inferenceMs", inferenceMs);
    result.putString("modelSha256", currentModelSha256);
    promise.resolve(result);
  }

  @ReactMethod
  public void getModelMetadata(Promise promise) {
    if (interpreter == null) {
      promise.reject("NOT_LOADED", "No model loaded");
      return;
    }
    WritableMap meta = Arguments.createMap();
    meta.putString("modelPath", currentModelPath);
    meta.putString("sha256", currentModelSha256);
    meta.putArray("inputShape", shapeToArray(
      interpreter.getInputTensor(0).shape()));
    meta.putArray("outputShape", shapeToArray(
      interpreter.getOutputTensor(0).shape()));
    promise.resolve(meta);
  }

  @ReactMethod
  public void unloadModel(Promise promise) {
    if (interpreter != null) {
      interpreter.close();
      interpreter = null;
      currentModelPath = null;
      currentModelSha256 = null;
    }
    promise.resolve(null);
  }

  private String computeSha256(MappedByteBuffer buffer) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      buffer.rewind();
      byte[] bytes = new byte[buffer.remaining()];
      buffer.get(bytes);
      byte[] hash = digest.digest(bytes);
      StringBuilder sb = new StringBuilder();
      for (byte b : hash) sb.append(String.format("%02x", b));
      return sb.toString();
    } catch (Exception e) {
      return "unknown";
    }
  }

  private WritableArray shapeToArray(int[] shape) {
    WritableArray arr = Arguments.createArray();
    for (int dim : shape) arr.pushInt(dim);
    return arr;
  }
}
```

### 3.2 TFLitePackage Registration

```java
// TFLitePackage.java
public class TFLitePackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
    return Arrays.asList(new TFLiteModule(ctx));
  }
  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
    return Collections.emptyList();
  }
}
```

---

## 4. iOS CoreML Implementation

### 4.1 Swift Native Module — Full Implementation

```swift
// native/ios/CoreMLModule.swift

import Foundation
import CoreML
import Accelerate

@objc(CoreMLModule)
class CoreMLModule: NSObject {

  private var model: MLModel?
  private var compiledModelURL: URL?
  private var currentModelPath: String?
  private var currentModelSha256: String?

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func loadModel(
    _ modelPath: String,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let modelURL = URL(fileURLWithPath: modelPath)
        let compiledURL = try MLModel.compileModel(at: modelURL)
        let config = MLModelConfiguration()
        config.computeUnits = .all  // Use Neural Engine when available
        let loadedModel = try MLModel(contentsOf: compiledURL, configuration: config)

        self.model = loadedModel
        self.compiledModelURL = compiledURL
        self.currentModelPath = modelPath
        self.currentModelSha256 = self.computeSha256(filePath: modelPath)

        resolver([
          "success": true,
          "sha256": self.currentModelSha256 ?? "unknown",
        ])
      } catch {
        rejecter("LOAD_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc func runInference(
    _ inputArray: [NSNumber],
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard let model = self.model else {
      rejecter("NOT_LOADED", "Model not loaded", nil)
      return
    }
    guard inputArray.count == 15600 else {
      rejecter("INVALID_INPUT", "Expected 15600 samples, got \(inputArray.count)", nil)
      return
    }

    DispatchQueue.global(qos: .userInitiated).async {
      let startTime = Date()

      do {
        // Build MLMultiArray for YAMNet input: shape [1, 15600]
        let inputMultiArray = try MLMultiArray(shape: [1, 15600], dataType: .float32)
        for (i, val) in inputArray.enumerated() {
          inputMultiArray[i] = val
        }

        let input = try MLDictionaryFeatureProvider(
          dictionary: ["waveform": MLFeatureValue(multiArray: inputMultiArray)]
        )
        let prediction = try model.prediction(from: input)

        let inferenceMs = Int(Date().timeIntervalSince(startTime) * 1000)

        // Extract scores — YAMNet output feature name: "output_0"
        guard let outputFeature = prediction.featureValue(for: "output_0"),
              let scores = outputFeature.multiArrayValue else {
          rejecter("OUTPUT_ERROR", "Failed to read model output", nil)
          return
        }

        // Get top 10
        var scoreArray = [Float](repeating: 0, count: 521)
        for i in 0..<521 {
          scoreArray[i] = scores[i].floatValue
        }
        let topIndices = scoreArray.enumerated()
          .sorted { $0.element > $1.element }
          .prefix(10)
          .map { $0.offset }
        let topScores = topIndices.map { scoreArray[$0] }

        resolver([
          "classIndices": topIndices,
          "scores": topScores,
          "inferenceMs": inferenceMs,
          "modelSha256": self.currentModelSha256 ?? "unknown",
        ])
      } catch {
        rejecter("INFERENCE_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc func getModelMetadata(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard model != nil else {
      rejecter("NOT_LOADED", "No model loaded", nil)
      return
    }
    resolver([
      "modelPath": currentModelPath ?? "",
      "sha256": currentModelSha256 ?? "",
    ])
  }

  @objc func unloadModel(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    model = nil
    if let url = compiledModelURL {
      try? FileManager.default.removeItem(at: url)
    }
    compiledModelURL = nil
    currentModelPath = nil
    currentModelSha256 = nil
    resolver(nil)
  }

  private func computeSha256(filePath: String) -> String {
    guard let data = FileManager.default.contents(atPath: filePath) else {
      return "unknown"
    }
    var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes { _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash) }
    return hash.map { String(format: "%02x", $0) }.joined()
  }
}
```

---

## 5. Audio Capture Layer

### 5.1 AudioCapture.ts

```typescript
// src/audio/AudioCapture.ts
import AudioRecord from 'react-native-audio-record';

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  wavFile: '', // Empty = no file write (privacy requirement)
};

export class AudioCapture {
  private frameBuffer: Float32Array[] = [];
  private frameCallbacks: ((frame: Float32Array) => void)[] = [];

  async start(): Promise<void> {
    AudioRecord.init(AUDIO_CONFIG);
    AudioRecord.on('data', (data: string) => {
      const pcm = this.base64ToPCM(data);
      this.frameCallbacks.forEach(cb => cb(pcm));
    });
    AudioRecord.start();
  }

  async stop(): Promise<void> {
    await AudioRecord.stop();
  }

  onFrame(callback: (frame: Float32Array) => void): void {
    this.frameCallbacks.push(callback);
  }

  private base64ToPCM(base64: string): Float32Array {
    const raw = Buffer.from(base64, 'base64');
    const int16 = new Int16Array(raw.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0; // Normalize to [-1, 1]
    }
    return float32;
  }
}
```

### 5.2 VAD.ts

```typescript
// src/audio/VAD.ts
export class VAD {
  private ambientRms: number;
  private readonly sigmaMultiplier: number;

  constructor(ambientRms = 0.02, sigmaMultiplier = 2.0) {
    this.ambientRms = ambientRms;
    this.sigmaMultiplier = sigmaMultiplier;
  }

  check(frame: Float32Array): boolean {
    const rms = this.computeRMS(frame);
    return rms > this.ambientRms * (1 + this.sigmaMultiplier);
  }

  updateAmbient(newAmbientRms: number): void {
    this.ambientRms = newAmbientRms;
  }

  private computeRMS(frame: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  }
}
```

### 5.3 FFT.ts (Mel Spectrogram)

```typescript
// src/audio/FFT.ts
// Uses react-native-fft or pure JS implementation

const FFT_SIZE = 512;
const MEL_BANDS = 64;
const SAMPLE_RATE = 16000;
const F_MIN = 125.0;
const F_MAX = 7500.0;

export class FFT {
  private melFilterbank: Float32Array[];

  constructor() {
    this.melFilterbank = this.buildMelFilterbank();
  }

  computeMelSpectrogram(samples: Float32Array): Float32Array {
    // Apply Hann window
    const windowed = this.applyHannWindow(samples.slice(0, FFT_SIZE));

    // Compute power spectrum via FFT
    const powerSpectrum = this.computePowerSpectrum(windowed);

    // Apply mel filterbank
    const melEnergies = new Float32Array(MEL_BANDS);
    for (let m = 0; m < MEL_BANDS; m++) {
      let energy = 0;
      for (let k = 0; k < FFT_SIZE / 2 + 1; k++) {
        energy += this.melFilterbank[m][k] * powerSpectrum[k];
      }
      melEnergies[m] = Math.log(Math.max(energy, 1e-10)); // Log compression
    }

    return melEnergies;
  }

  private applyHannWindow(samples: Float32Array): Float32Array {
    const result = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (samples.length - 1)));
      result[i] = samples[i] * w;
    }
    return result;
  }

  private buildMelFilterbank(): Float32Array[] {
    const melMin = this.hzToMel(F_MIN);
    const melMax = this.hzToMel(F_MAX);
    const melPoints = Array.from({ length: MEL_BANDS + 2 }, (_, i) =>
      this.melToHz(melMin + (i * (melMax - melMin)) / (MEL_BANDS + 1))
    );
    const fftBins = melPoints.map(f => Math.floor((f / SAMPLE_RATE) * FFT_SIZE));
    return Array.from({ length: MEL_BANDS }, (_, m) => {
      const filter = new Float32Array(FFT_SIZE / 2 + 1);
      for (let k = fftBins[m]; k <= fftBins[m + 2]; k++) {
        if (k <= fftBins[m + 1]) {
          filter[k] = (k - fftBins[m]) / (fftBins[m + 1] - fftBins[m] + 1e-10);
        } else {
          filter[k] = (fftBins[m + 2] - k) / (fftBins[m + 2] - fftBins[m + 1] + 1e-10);
        }
      }
      return filter;
    });
  }

  private hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }

  private melToHz(mel: number): number {
    return 700 * (10 ** (mel / 2595) - 1);
  }

  private computePowerSpectrum(windowed: Float32Array): Float32Array {
    // Placeholder: use react-native-fft or kissfft binding
    // Returns |FFT(windowed)|^2 for bins 0..FFT_SIZE/2
    throw new Error('FFT implementation required: use react-native-fft');
  }
}
```

---

## 6. Audio Pipeline Orchestration

### 6.1 AudioPipeline.ts

```typescript
// src/audio/AudioPipeline.ts

export class AudioPipeline {
  private capture: AudioCapture;
  private vad: VAD;
  private fft: FFT;
  private slidingWindow: Float32Array; // 15600 samples @ 16kHz = 975ms
  private windowPos = 0;

  async initialize(): Promise<void> {
    await InferenceRouter.initialize();
    const config = await NodeConfigRepo.get();
    this.vad = new VAD(config?.vadAmbientRms ?? 0.02);
    this.fft = new FFT();
    this.slidingWindow = new Float32Array(15600);
    this.capture = new AudioCapture();
    this.capture.onFrame(frame => this.processFrame(frame));
  }

  private async processFrame(frame: Float32Array): Promise<void> {
    const throttle = BatteryMonitor.getThrottleState();
    if (throttle === 'SUSPENDED') return;

    if (!this.vad.check(frame)) return; // Energy gate

    // Accumulate into sliding window
    frame.forEach((s, i) => {
      this.slidingWindow[(this.windowPos + i) % 15600] = s;
    });
    this.windowPos = (this.windowPos + frame.length) % 15600;

    const melSpec = this.fft.computeMelSpectrogram(this.slidingWindow);
    const result = await InferenceRouter.run(melSpec);

    const threshold = await this.getThreshold();
    if (result.confidence < threshold) return;

    const event = await this.buildEvent(result);
    await EventPublisher.publish(event);
  }

  private async getThreshold(): Promise<number> {
    const config = await NodeConfigRepo.get();
    return config?.detectionThreshold ?? 0.72;
  }
}
```

---

## 7. Thermal Throttling

### 7.1 BatteryMonitor.ts

```typescript
// src/battery/BatteryMonitor.ts
import * as Battery from 'expo-battery';
import { DeviceEventEmitter, NativeModules } from 'react-native';

export type ThrottleState = 'FULL' | 'REDUCED' | 'MINIMAL' | 'SUSPENDED';

export class BatteryMonitor {
  private static batteryLevel = 1.0;
  private static thermalZone = 25;

  static async start(): Promise<void> {
    Battery.addBatteryLevelListener(({ batteryLevel }) => {
      this.batteryLevel = batteryLevel;
    });
    // Poll thermal zone every 30s (no cross-platform event API)
    setInterval(() => this.pollThermal(), 30000);
  }

  static getThrottleState(): ThrottleState {
    const level = this.batteryLevel * 100;
    const temp = this.thermalZone;
    if (temp > 45 || level < 10) return 'SUSPENDED';
    if (temp > 40 || level < 20) return 'MINIMAL';
    if (temp > 38 || level < 30) return 'REDUCED';
    return 'FULL';
  }

  static getSampleIntervalMs(): number {
    const intervals: Record<ThrottleState, number> = {
      FULL: 100,
      REDUCED: 1000,
      MINIMAL: 10000,
      SUSPENDED: 0,
    };
    return intervals[this.getThrottleState()];
  }

  private static async pollThermal(): Promise<void> {
    // Android: parse /sys/class/thermal/thermal_zone0/temp
    // iOS: no public API — use heuristic from CPU load
    // NativeModules.ThermalModule?.getTemperature()
  }
}
```

---

## 8. OTA Model Updates

### 8.1 ModelManager.ts

```typescript
// src/ml/ModelManager.ts
import * as FileSystem from 'expo-file-system';
import { createHash } from 'crypto';
import NetInfo from '@react-native-community/netinfo';

const MODEL_DIR = FileSystem.documentDirectory + 'models/';
const MODEL_MANIFEST_URL = 'https://cdn.apexsentinel.uk/models/manifest.json';

export class ModelManager {
  static async checkForUpdate(): Promise<boolean> {
    const netState = await NetInfo.fetch();
    if (netState.type !== 'wifi') return false; // WiFi only

    try {
      const response = await fetch(MODEL_MANIFEST_URL);
      const manifest: ModelManifest = await response.json();

      const currentConfig = await NodeConfigRepo.get();
      if (!currentConfig || manifest.version === currentConfig.modelVersion) {
        return false; // Already up to date
      }

      return this.downloadAndSwap(manifest);
    } catch (err) {
      logger.warn('OTA model check failed', { err });
      return false;
    }
  }

  private static async downloadAndSwap(manifest: ModelManifest): Promise<boolean> {
    const platform = Platform.OS as 'android' | 'ios';
    const platformManifest = manifest.platforms[platform];
    const tempPath = MODEL_DIR + `yamnet_int8_${manifest.version}.tmp`;
    const finalPath = MODEL_DIR + `yamnet_int8_${manifest.version}.tflite`;

    try {
      // Download to temp path
      await FileSystem.downloadAsync(platformManifest.url, tempPath);

      // Verify SHA-256
      const computed = await this.sha256File(tempPath);
      if (computed !== platformManifest.sha256) {
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
        logger.error('OTA model SHA-256 mismatch', {
          expected: platformManifest.sha256,
          computed,
        });
        return false;
      }

      // Atomic rename
      await FileSystem.moveAsync({ from: tempPath, to: finalPath });

      // Test load
      const loadResult = await InferenceRouter.loadModel(finalPath);
      if (!loadResult.success) {
        // Rollback
        await FileSystem.deleteAsync(finalPath, { idempotent: true });
        logger.error('OTA model failed to load, rolled back');
        return false;
      }

      // Update config
      await NodeConfigRepo.setModelVersion(manifest.version, platformManifest.sha256, finalPath);
      logger.info('OTA model update applied', { version: manifest.version });
      return true;

    } catch (err) {
      await FileSystem.deleteAsync(tempPath, { idempotent: true });
      logger.error('OTA model download failed', { err });
      return false;
    }
  }

  private static async sha256File(path: string): Promise<string> {
    const content = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buffer = Buffer.from(content, 'base64');
    return createHash('sha256').update(buffer).digest('hex');
  }
}
```

---

## 9. Latency Targets by Device Tier

| Stage | Tier A (Flagship) | Tier B (Mid-range) | Tier C (Low-end) |
|---|---|---|---|
| Audio capture (100ms frame) | 100ms | 100ms | 100ms |
| VAD check | < 1ms | < 2ms | < 5ms |
| FFT + mel spectrogram | 5ms | 15ms | 35ms |
| TFLite/CoreML inference | 20ms | 50ms | 120ms |
| Post-processing | < 1ms | < 2ms | < 3ms |
| Event build + dispatch | < 5ms | < 10ms | < 15ms |
| **Total pipeline** | **~131ms** | **~177ms** | **~278ms** |
| NATS publish (4G) | ~150ms | ~200ms | ~300ms |
| **E2E detection → publish** | **~281ms** | **~377ms** | **~578ms** |

**Target:** P95 E2E ≤ 500ms. Tier C devices may slightly exceed on poor network.

**Device tier definitions:**
- Tier A: Snapdragon 8 Gen 1+, Apple A14+, 8GB+ RAM
- Tier B: Snapdragon 665 / 700 series, Apple A13, 4–6GB RAM (Pixel 6a, iPhone 12)
- Tier C: Snapdragon 4xx, Apple A12, 3GB RAM (budget Android 2020–2022)

On Tier C with throttle=REDUCED: pipeline runs at 1-second intervals, E2E latency ~1.5s.

---

## 10. Inference Result Post-Processing

```typescript
// src/ml/InferenceRouter.ts

const THREAT_CLASS_INDICES = new Set([
  // Gunshot: 427, Explosion: 397, Artillery: varies by YAMNet version
  // Populated from classMap.ts keyed by model version
  ...classMap.getThreatIndices(currentModelVersion)
]);

export function postProcess(
  classIndices: number[],
  scores: number[],
  threshold: number
): InferenceResult | null {
  // Find highest-confidence threat class
  for (let i = 0; i < classIndices.length; i++) {
    const idx = classIndices[i];
    const score = scores[i];
    if (score < threshold) break; // Sorted descending
    if (THREAT_CLASS_INDICES.has(idx)) {
      return {
        eventType: classMap.getLabel(idx),
        confidence: score,
        classIndex: idx,
        allScores: classIndices.map((ci, j) => ({
          classIndex: ci,
          label: classMap.getLabel(ci),
          score: scores[j],
        })),
      };
    }
  }
  return null;
}
```

---

## 11. Privacy Guarantee: Audio Never Written

The audio pipeline explicitly prevents any audio data from being written to disk:

1. `react-native-audio-record` is configured with `wavFile: ''` — no WAV file output.
2. Audio frames exist only as `Float32Array` in JS memory.
3. The sliding window buffer (`Float32Array(15600)`) is overwritten continuously.
4. Only the inference result (class label + confidence score) is persisted.
5. On app backgrounding, the audio pipeline continues but the buffer is NOT checkpointed to disk.

This is verified by the privacy audit in `PRIVACY_ARCHITECTURE.md` and confirmed by file system inspection at runtime (no audio files in app sandbox).
