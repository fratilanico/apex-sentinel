# APEX-SENTINEL — Test Strategy

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Wave:** W1 (covers W1–W4 strategy, W1 implementation)
**Classification:** UNCLASSIFIED // FOUO

---

## 1. Testing Philosophy

APEX-SENTINEL is a safety-critical detection system. A false negative (missed drone) has operational consequences. A false positive (spurious alert) causes alert fatigue. Testing must cover both failure modes explicitly.

**Non-negotiables:**
- TDD: tests written before implementation (RED → GREEN → REFACTOR)
- Every FR has a `describe('FR-XX-00: ...')` block
- ≥80% coverage: branches, functions, lines, statements — all four axes
- No test may pass by mocking the ML model — synthetic audio fixtures required
- Performance benchmarks are tests, not documentation

---

## 2. Test Stack

### TypeScript / JavaScript (Dashboard + Backend Functions)
```
Vitest 1.x          — unit + component tests
@testing-library/react — React component tests
Playwright 1.x      — E2E dashboard tests
MSW (Mock Service Worker) — API mocking in unit tests
Vitest coverage     — via @vitest/coverage-v8
```

### Android (Kotlin)
```
JUnit 5             — unit tests
MockK               — Kotlin mocking library
Espresso            — UI/instrumentation tests
Robolectric         — Android unit tests without emulator
androidx.test       — AndroidX test runner
JMH                 — benchmarking (inference latency)
```

### iOS (Swift)
```
XCTest              — unit + UI tests
XCUITest            — UI automation
Quick + Nimble      — BDD-style specs (optional, use for acoustic tests)
```

### CI/CD
```
GitHub Actions      — primary CI
Matrix: Android API 33 emulator + iOS 16 simulator + Node 20
```

---

## 3. Test Pyramid

```
         ┌────────────────┐
         │   E2E (Playwright + Espresso UI)    │  ← 1–3 per FR
         ├────────────────────────────────────┤
         │   API Integration (Supabase + REST) │  ← 3–5 per FR
         ├────────────────────────────────────┤
         │   Component (React + Android)       │  ← 5–10 per FR
         ├────────────────────────────────────┤
         │   Unit (Vitest + JUnit + XCTest)    │  ← 10–20 per FR
         └────────────────────────────────────┘
```

**Per FR target:**
- Unit: 10–20 tests
- Component: 5–10 tests
- API Integration: 3–5 tests
- E2E: 1–3 tests

---

## 4. FR Naming Convention

All test describe blocks follow this pattern:

```typescript
// TypeScript / Vitest
describe('FR-01-00: Acoustic Detection Pipeline', () => {
  describe('FR-01-01: Microphone Capture', () => { ... })
  describe('FR-01-02: YAMNet Inference', () => { ... })
})
```

```kotlin
// Kotlin / JUnit 5
@DisplayName("FR-01-00: Acoustic Detection Pipeline")
class AcousticDetectionPipelineTest {
    @Nested
    @DisplayName("FR-01-01: Microphone Capture")
    inner class MicrophoneCaptureTest { ... }
}
```

```swift
// Swift / XCTest
class FR_01_AcousticDetectionTests: XCTestCase {
    // FR-01-01: Microphone Capture
    func test_FR0101_microphoneCaptureStartsSuccessfully() { ... }
}
```

---

## 5. Test Fixtures — Acoustic

All acoustic tests use deterministic synthetic fixtures. Never use live microphone in automated tests.

### Fixture Structure
```
tests/fixtures/audio/
├── drone_fpv_250hz_motor/
│   ├── sample_001.wav   # 1s clip, 16kHz, mono, ~750Hz dominant
│   ├── sample_002.wav
│   └── ...              # 50 clips minimum
├── drone_shahed_noise/
│   ├── sample_001.wav   # 1s clip, ~200Hz prop wash + harmonics
│   └── ...              # 50 clips minimum
├── ambient_traffic/
│   ├── sample_001.wav   # street traffic, no drone
│   └── ...              # 50 clips minimum
├── ambient_wind/
│   ├── sample_001.wav
│   └── ...              # 25 clips minimum
├── ambient_crowd/
│   └── ...              # 25 clips minimum
└── edge_cases/
    ├── lawnmower.wav    # common false positive
    ├── rc_car.wav
    ├── motorcycle.wav
    └── power_tool.wav
```

### Fixture Generation
```bash
# Generate synthetic FPV motor noise (Python + soundfile)
python3 scripts/gen_fixtures.py \
  --type fpv_motor \
  --freq_hz 750 \
  --harmonics 3 \
  --duration_s 1 \
  --count 50 \
  --output tests/fixtures/audio/drone_fpv_250hz_motor/

# Validate fixtures
python3 scripts/validate_fixtures.py tests/fixtures/audio/
```

### Fixture Labelling Schema
```json
{
  "file": "drone_fpv_250hz_motor/sample_001.wav",
  "label": 1,
  "class": "drone_fpv",
  "dominant_freq_hz": 750,
  "snr_db": 15,
  "duration_ms": 1000,
  "sample_rate": 16000
}
```

---

## 6. Test Fixtures — RF / WiFi

```
tests/fixtures/rf/
├── drone_active_2_4ghz/
│   ├── scan_001.json    # WiFi scan during FPV drone operation
│   └── ...              # 30 scans minimum
├── ambient_wifi/
│   ├── scan_001.json    # Normal WiFi environment
│   └── ...              # 30 scans minimum
└── edge_cases/
    ├── crowded_venue.json   # Many APs, high channel energy
    └── 5ghz_only.json      # 5GHz-only environment
```

### WiFi Scan Mock Format
```json
{
  "timestamp_ms": 1711234567890,
  "scans": [
    {
      "bssid": "aa:bb:cc:dd:ee:ff",
      "ssid": "NETWORK_001",
      "channel": 6,
      "frequency_mhz": 2437,
      "rssi_dbm": -65,
      "capabilities": "[WPA2-PSK]"
    }
  ],
  "channel_energy": {
    "ch1": -72.3,
    "ch6": -58.1,
    "ch11": -71.8,
    "ch36": -80.2
  },
  "anomaly_score": 0.83,
  "label": 1
}
```

---

## 7. Unit Tests — Android (Kotlin / JUnit 5)

### FR-01: Acoustic Detection Pipeline

```kotlin
// AcousticPipelineTest.kt
@DisplayName("FR-01-00: Acoustic Detection Pipeline")
class AcousticPipelineTest {

    @Test
    @DisplayName("FR-01-01: bandpass filter isolates 500–2000Hz")
    fun bandpassFilter_isolates500to2000Hz() {
        val raw = loadFixture("drone_fpv_250hz_motor/sample_001.wav")
        val filtered = BandpassFilter.apply(raw, lowHz = 500, highHz = 2000)
        assertThat(filtered.dominantFrequency()).isBetween(500.0, 2000.0)
    }

    @Test
    @DisplayName("FR-01-02: YAMNet inference returns confidence score")
    fun yamnet_returnsConfidenceScore() {
        val model = TFLiteAcousticModel.load(testContext, "yamnet_classification.tflite")
        val audio = loadFixture("drone_fpv_250hz_motor/sample_001.wav")
        val result = model.infer(audio)
        assertThat(result.confidence).isBetween(0.0f, 1.0f)
        assertThat(result.latencyMs).isLessThan(200L)
    }

    @Test
    @DisplayName("FR-01-03: classifier detects drone with confidence ≥ 0.72")
    fun classifier_detectsDrone_confidence72() {
        val model = TFLiteAcousticModel.load(testContext, "yamnet_classification.tflite")
        val results = loadAllFixtures("drone_fpv_250hz_motor").map { model.infer(it) }
        val detectionRate = results.count { it.confidence >= 0.72f } / results.size.toFloat()
        assertThat(detectionRate).isGreaterThanOrEqualTo(0.85f)
    }

    @Test
    @DisplayName("FR-01-04: classifier rejects ambient traffic")
    fun classifier_rejectsAmbientTraffic() {
        val model = TFLiteAcousticModel.load(testContext, "yamnet_classification.tflite")
        val results = loadAllFixtures("ambient_traffic").map { model.infer(it) }
        val falsePositiveRate = results.count { it.confidence >= 0.72f } / results.size.toFloat()
        assertThat(falsePositiveRate).isLessThanOrEqualTo(0.08f)
    }

    @Test
    @DisplayName("FR-01-05: inference latency P99 ≤ 200ms")
    fun inference_latency_p99_under200ms() {
        val model = TFLiteAcousticModel.load(testContext, "yamnet_classification.tflite")
        val audio = loadFixture("drone_fpv_250hz_motor/sample_001.wav")
        val latencies = (1..100).map {
            val start = System.currentTimeMillis()
            model.infer(audio)
            System.currentTimeMillis() - start
        }.sorted()
        val p99 = latencies[(latencies.size * 0.99).toInt()]
        assertThat(p99).isLessThan(200L)
    }

    @Test
    @DisplayName("FR-01-06: model file size ≤ 512KB")
    fun modelFile_sizeUnder512KB() {
        val modelBytes = testContext.assets.open("yamnet_classification.tflite").readBytes()
        assertThat(modelBytes.size).isLessThanOrEqualTo(512 * 1024)
    }
}
```

### FR-02: WiFi RF Anomaly Detection

```kotlin
@DisplayName("FR-02-00: WiFi RF Anomaly Detection")
class WiFiAnomalyDetectorTest {

    @Test
    @DisplayName("FR-02-01: anomaly score elevated during drone RF scan")
    fun anomalyScore_elevated_duringDroneScan() {
        val detector = WiFiAnomalyDetector()
        val droneScan = loadRFFixture("drone_active_2_4ghz/scan_001.json")
        val score = detector.score(droneScan)
        assertThat(score).isGreaterThanOrEqualTo(0.5f)
    }

    @Test
    @DisplayName("FR-02-02: anomaly score low for ambient WiFi")
    fun anomalyScore_low_ambientWifi() {
        val detector = WiFiAnomalyDetector()
        val ambientScan = loadRFFixture("ambient_wifi/scan_001.json")
        val score = detector.score(ambientScan)
        assertThat(score).isLessThan(0.5f)
    }

    @Test
    @DisplayName("FR-02-03: channel energy delta computed correctly")
    fun channelEnergyDelta_computedCorrectly() {
        val detector = WiFiAnomalyDetector()
        val baseline = loadRFFixture("ambient_wifi/scan_001.json")
        val active = loadRFFixture("drone_active_2_4ghz/scan_001.json")
        val delta = detector.channelEnergyDelta(baseline, active)
        assertThat(delta.ch6).isGreaterThan(5.0f) // > 5dBm spike on ch6
    }
}
```

### FR-03: Supabase Detection Insert

```kotlin
@DisplayName("FR-03-00: Detection Persistence")
class DetectionRepositoryTest {

    @Test
    @DisplayName("FR-03-01: insert returns success within 500ms")
    fun insert_returnsSuccess_within500ms() = runTest {
        val repo = DetectionRepository(supabaseClient = mockSupabaseClient)
        val detection = Detection(
            confidence = 0.89f,
            type = DetectionType.ACOUSTIC,
            lat = 51.5074,
            lng = -0.1278,
            nodeId = "node-test-001"
        )
        val start = System.currentTimeMillis()
        val result = repo.insert(detection)
        val elapsed = System.currentTimeMillis() - start
        assertThat(result).isInstanceOf(Result.Success::class.java)
        assertThat(elapsed).isLessThan(500L)
    }
}
```

---

## 8. Unit Tests — iOS (Swift / XCTest)

```swift
// AcousticEngineTests.swift

class FR_01_AcousticEngineTests: XCTestCase {

    var engine: AcousticDetectionEngine!

    override func setUp() {
        engine = AcousticDetectionEngine(modelPath: testModelPath)
    }

    // FR-01-01: Audio pipeline initializes
    func test_FR0101_engineInitializesWithoutError() {
        XCTAssertNotNil(engine)
        XCTAssertFalse(engine.isRunning)
    }

    // FR-01-02: Inference on synthetic drone audio
    func test_FR0102_infersDroneFromSyntheticAudio() throws {
        let audioData = try loadFixture("drone_fpv_250hz_motor/sample_001.wav")
        let result = engine.infer(audioData)
        XCTAssertGreaterThanOrEqual(result.confidence, 0.72)
    }

    // FR-01-03: False positive rate ≤ 8%
    func test_FR0103_falsePositiveRate_belowThreshold() throws {
        let ambientClips = try loadAllFixtures("ambient_traffic")
        let fpCount = ambientClips.filter { engine.infer($0).confidence >= 0.72 }.count
        let fpRate = Double(fpCount) / Double(ambientClips.count)
        XCTAssertLessThanOrEqual(fpRate, 0.08)
    }

    // FR-01-04: Inference latency ≤ 200ms
    func test_FR0104_inferenceLatencyUnder200ms() throws {
        let audio = try loadFixture("drone_fpv_250hz_motor/sample_001.wav")
        let start = Date()
        _ = engine.infer(audio)
        let elapsed = Date().timeIntervalSince(start) * 1000
        XCTAssertLessThan(elapsed, 200)
    }
}
```

---

## 9. Unit Tests — TypeScript / Dashboard (Vitest)

```typescript
// tests/unit/detection-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DetectionService } from '@/services/DetectionService'

describe('FR-03-00: Detection Service', () => {
  describe('FR-03-01: Real-time subscription', () => {
    it('fires onDetection callback when Supabase realtime event arrives', async () => {
      const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn() }
      const mockClient = { channel: vi.fn().mockReturnValue(mockChannel) }
      const service = new DetectionService(mockClient as any)
      const onDetection = vi.fn()
      service.subscribe(onDetection)
      expect(mockChannel.on).toHaveBeenCalledWith('postgres_changes', expect.any(Object), expect.any(Function))
    })

    it('parses incoming detection payload correctly', () => {
      const raw = {
        new: { id: 'uuid-1', confidence: 0.89, lat: 51.5, lng: -0.12, type: 'acoustic' }
      }
      const parsed = DetectionService.parsePayload(raw)
      expect(parsed.confidence).toBe(0.89)
      expect(parsed.type).toBe('acoustic')
    })
  })
})
```

---

## 10. API Integration Tests

### Supabase Insert / Select

```typescript
// tests/integration/supabase-detection.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

describe('FR-03-00: Supabase Detection Persistence', () => {
  const testNodeId = `test-node-${Date.now()}`

  afterAll(async () => {
    await supabase.from('detections').delete().eq('node_id', testNodeId)
  })

  it('FR-03-01: inserts a detection record successfully', async () => {
    const { data, error } = await supabase.from('detections').insert({
      node_id: testNodeId,
      confidence: 0.89,
      detection_type: 'acoustic',
      lat: 51.5074,
      lng: -0.1278,
    }).select().single()
    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
  })

  it('FR-03-02: round-trip insert+select under 500ms', async () => {
    const start = Date.now()
    const { error } = await supabase.from('detections').insert({
      node_id: testNodeId,
      confidence: 0.75,
      detection_type: 'acoustic',
      lat: 51.5,
      lng: -0.1,
    }).select().single()
    const elapsed = Date.now() - start
    expect(error).toBeNull()
    expect(elapsed).toBeLessThan(500)
  })

  it('FR-03-03: rejects insert without required fields', async () => {
    const { error } = await supabase.from('detections').insert({
      node_id: testNodeId,
      // missing confidence, detection_type, lat, lng
    } as any)
    expect(error).not.toBeNull()
  })
})
```

---

## 11. E2E Tests — Dashboard (Playwright)

```typescript
// tests/e2e/dashboard-map.spec.ts
import { test, expect } from '@playwright/test'

test.describe('FR-08-00: C2 Dashboard Map', () => {
  test('FR-08-01: map renders on load', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="map-container"]')).toBeVisible({ timeout: 5000 })
  })

  test('FR-08-02: detection pin appears after new detection', async ({ page }) => {
    await page.goto('/')
    // Inject mock detection via Supabase realtime
    await page.evaluate(async () => {
      window.__MOCK_DETECTION__({ confidence: 0.92, lat: 51.5074, lng: -0.1278 })
    })
    await expect(page.locator('[data-testid="detection-pin"]')).toBeVisible({ timeout: 3000 })
  })

  test('FR-08-03: detection list updates in real-time', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      window.__MOCK_DETECTION__({ confidence: 0.88, lat: 51.5, lng: -0.12 })
    })
    await expect(page.locator('[data-testid="detection-list-item"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="detection-confidence"]').first()).toHaveText(/0\.8/)
  })
})
```

---

## 12. Performance Benchmarks

### Android — JMH Benchmark

```kotlin
// InferenceLatencyBenchmark.kt
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MILLISECONDS)
@State(Scope.Benchmark)
class InferenceLatencyBenchmark {

    private lateinit var model: TFLiteAcousticModel
    private lateinit var audioInput: FloatArray

    @Setup
    fun setup() {
        model = TFLiteAcousticModel.load(BenchmarkApplication.context, "yamnet_classification.tflite")
        audioInput = loadBenchmarkAudio()
    }

    @Benchmark
    fun singleInference(): InferenceResult = model.infer(audioInput)

    // Expected: P50 < 80ms, P99 < 200ms on Pixel 6
}
```

### Dashboard — Lighthouse / Playwright

```typescript
// tests/e2e/performance.spec.ts
test('FR-08-04: dashboard loads under 3s on throttled 4G', async ({ page }) => {
  await page.emulateNetworkConditions({
    offline: false,
    downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
    uploadThroughput: 750 * 1024 / 8,
    latency: 40,
  })
  const start = Date.now()
  await page.goto('/')
  await page.waitForSelector('[data-testid="map-container"]')
  expect(Date.now() - start).toBeLessThan(3000)
})
```

---

## 13. Triangulation Accuracy Tests (W2)

```kotlin
// TriangulationAccuracyTest.kt
@DisplayName("FR-10-00: TDoA Triangulation")
class TriangulationAccuracyTest {

    @Test
    @DisplayName("FR-10-01: TDoA triangulates within 62m of known source")
    fun tdoa_within62m_ofKnownSource() {
        // 3 nodes at known positions, source at known position
        val nodes = listOf(
            NodePosition(lat = 51.500, lng = -0.120),
            NodePosition(lat = 51.502, lng = -0.118),
            NodePosition(lat = 51.501, lng = -0.115)
        )
        val trueSource = Position(lat = 51.501, lng = -0.119)
        val detectionTimes = simulateDetectionTimes(trueSource, nodes, speedOfSoundMs = 343.0)
        val estimated = TDoATriangulator.triangulate(nodes, detectionTimes)
        val errorM = haversineDistance(trueSource, estimated)
        assertThat(errorM).isLessThanOrEqualTo(62.0)
    }
}
```

---

## 14. Mesh Resilience Tests (W2)

```kotlin
// MeshResilienceTest.kt
@DisplayName("FR-11-00: Mesh Network Resilience")
class MeshResilienceTest {

    @Test
    @DisplayName("FR-11-01: packet loss ≤ 5% over 1000 relays")
    fun packetLoss_under5pct_over1000relays() = runTest {
        val mesh = MockMeshNetwork(nodeCount = 5)
        var received = 0
        repeat(1000) {
            if (mesh.relay(DetectionPacket.mock())) received++
        }
        val lossRate = 1.0 - (received.toDouble() / 1000)
        assertThat(lossRate).isLessThanOrEqualTo(0.05)
    }
}
```

---

## 15. Coverage Requirements

| Layer | Min Branches | Min Functions | Min Lines | Min Statements |
|-------|-------------|--------------|----------|----------------|
| Android unit | 80% | 80% | 80% | 80% |
| iOS unit | 80% | 80% | 80% | 80% |
| TS/JS dashboard | 80% | 80% | 80% | 80% |
| Supabase edge functions | 80% | 80% | 80% | 80% |

---

## 16. CI/CD Test Gates

### GitHub Actions — Full Gate

```yaml
# .github/workflows/test.yml
name: APEX-SENTINEL Test Suite

on: [push, pull_request]

jobs:
  test-dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx vitest run --coverage
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - run: npm run build
      - run: npx tsc --noEmit

  test-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17' }
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          script: ./gradlew test connectedAndroidTest

  test-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - run: xcodebuild test -scheme APEX-SENTINEL -destination 'platform=iOS Simulator,name=iPhone 15,OS=17.0'
```

### Gate Pass Criteria (ALL must pass before merge)
```
[ ] npx vitest run --coverage  — all tests pass, coverage ≥ 80%
[ ] npx playwright test        — all E2E pass
[ ] npm run build              — zero build errors
[ ] npx tsc --noEmit           — zero type errors
[ ] ./gradlew test             — all Android unit tests pass
[ ] xcodebuild test            — all iOS tests pass
```

---

## 17. How to Run All Tests

### Dashboard / TypeScript

```bash
# Unit + coverage
cd /Users/nico/projects/apex-sentinel
npm ci
npx vitest run --coverage

# E2E (requires running dashboard)
npm run dev &
npx playwright test

# Type check + build
npx tsc --noEmit
npm run build
```

### Android

```bash
cd android/
# Unit tests (no device needed)
./gradlew test

# Instrumented tests (emulator or device required)
./gradlew connectedAndroidTest

# Benchmarks
./gradlew :app:benchmarkRelease
```

### iOS

```bash
cd ios/
xcodebuild test \
  -scheme APEX-SENTINEL \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2' \
  -resultBundlePath TestResults.xcresult
```

### All Tests (from repo root)

```bash
./scripts/run-all-tests.sh
# Runs: vitest + playwright + tsc + gradle test + xcodebuild test
# Outputs: test-results/summary.json
# Exit code: 0 = all pass, 1 = any failure
```

---

*Test strategy owner: QA lead. Updated each wave.*
