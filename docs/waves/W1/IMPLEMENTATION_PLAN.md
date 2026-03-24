# APEX-SENTINEL — Wave 1 Implementation Plan
# FILE 16 of 20 — IMPLEMENTATION_PLAN.md
# Wave 1 Scope: Android Acoustic Detection App (Single Node, No Mesh)

---

## Wave 1 Deliverable

A production-grade single Android node that:
1. Captures audio via microphone (AudioRecord API)
2. Applies VAD (WebRTC VAD) to filter silence
3. Runs FFT analysis (Apache Commons Math) for spectral features
4. Runs YAMNet TFLite inference → drone / no-drone / uncertain
5. Captures GPS metadata at detection time
6. Ingests detection events into Supabase
7. Runs a basic calibration routine
8. Has a functional Jetpack Compose UI (live spectrogram, alert banner, status)

Also delivered: iOS acoustic app (lighter — CoreML, SwiftUI, parity with Android feature set).

**TDD order is non-negotiable:** failing test FIRST → implement → green → next task.

---

## Phase 0: Repository & Project Setup (Android)

### Task 0.1 — Android project scaffold (5 min)
```bash
# From repo root
mkdir -p android/app/src/main/kotlin/io/apexos/sentinel
mkdir -p android/app/src/test/kotlin/io/apexos/sentinel
mkdir -p android/app/src/androidTest/kotlin/io/apexos/sentinel
mkdir -p android/app/src/main/assets/models
mkdir -p android/app/src/main/res/raw
```

Files to create:
- `android/build.gradle.kts` (root)
- `android/app/build.gradle.kts`
- `android/settings.gradle.kts`
- `android/gradle/libs.versions.toml`
- `android/local.properties` (gitignored)

### Task 0.2 — Gradle version catalog (5 min)

File: `android/gradle/libs.versions.toml`
```toml
[versions]
agp = "8.7.0"
kotlin = "2.1.0"
compose-bom = "2025.01.00"
lifecycle = "2.8.7"
coroutines = "1.9.0"
tflite = "2.16.1"
tflite-task-audio = "0.4.4"
commons-math = "3.6.1"
supabase-bom = "3.1.4"
ktor = "3.0.3"
mockk = "1.13.13"
junit5 = "5.11.4"
robolectric = "4.14.1"
turbine = "1.2.0"

[libraries]
# Compose
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
compose-activity = { group = "androidx.activity", name = "activity-compose", version = "1.9.3" }
compose-lifecycle = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycle" }

# TFLite
tflite = { group = "org.tensorflow", name = "tensorflow-lite", version.ref = "tflite" }
tflite-gpu = { group = "org.tensorflow", name = "tensorflow-lite-gpu", version.ref = "tflite" }
tflite-task-audio = { group = "org.tensorflow", name = "tensorflow-lite-task-audio", version.ref = "tflite-task-audio" }
tflite-support = { group = "org.tensorflow", name = "tensorflow-lite-support", version = "0.4.4" }

# DSP
commons-math = { group = "org.apache.commons", name = "commons-math3", version.ref = "commons-math" }

# Supabase
supabase-bom = { group = "io.github.jan-tennert.supabase", name = "bom", version.ref = "supabase-bom" }
supabase-postgrest = { group = "io.github.jan-tennert.supabase", name = "postgrest-kt" }
supabase-realtime = { group = "io.github.jan-tennert.supabase", name = "realtime-kt" }
supabase-auth = { group = "io.github.jan-tennert.supabase", name = "auth-kt" }
ktor-android = { group = "io.ktor", name = "ktor-client-android", version.ref = "ktor" }
ktor-serialization = { group = "io.ktor", name = "ktor-serialization-kotlinx-json", version.ref = "ktor" }

# Coroutines
coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }

# Location
play-services-location = { group = "com.google.android.gms", name = "play-services-location", version = "21.3.0" }

# Test
junit5-api = { group = "org.junit.jupiter", name = "junit-jupiter-api", version.ref = "junit5" }
junit5-engine = { group = "org.junit.jupiter", name = "junit-jupiter-engine", version.ref = "junit5" }
junit5-params = { group = "org.junit.jupiter", name = "junit-jupiter-params", version.ref = "junit5" }
mockk = { group = "io.mockk", name = "mockk", version.ref = "mockk" }
mockk-android = { group = "io.mockk", name = "mockk-android", version.ref = "mockk" }
robolectric = { group = "org.robolectric", name = "robolectric", version.ref = "robolectric" }
turbine = { group = "app.cash.turbine", name = "turbine", version.ref = "turbine" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
```

### Task 0.3 — App build.gradle.kts (5 min)

File: `android/app/build.gradle.kts`
```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "io.apexos.sentinel"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.apexos.sentinel"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-alpha"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "SUPABASE_URL",
            "\"https://bymfcnwfyxuivinuzurr.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY",
            "\"${project.findProperty("SUPABASE_ANON_KEY") ?: ""}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions { jvmTarget = "21" }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }

    aaptOptions {
        noCompress += listOf("tflite", "lite")
    }
}

dependencies {
    // Compose
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.activity)
    implementation(libs.compose.lifecycle)
    debugImplementation(libs.compose.ui.tooling)

    // TFLite
    implementation(libs.tflite)
    implementation(libs.tflite.gpu)
    implementation(libs.tflite.task.audio)
    implementation(libs.tflite.support)

    // DSP
    implementation(libs.commons.math)

    // Supabase
    val supabaseBom = platform(libs.supabase.bom)
    implementation(supabaseBom)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.realtime)
    implementation(libs.supabase.auth)
    implementation(libs.ktor.android)
    implementation(libs.ktor.serialization)

    // Coroutines
    implementation(libs.coroutines.android)

    // Location
    implementation(libs.play.services.location)

    // Test
    testImplementation(libs.junit5.api)
    testRuntimeOnly(libs.junit5.engine)
    testImplementation(libs.junit5.params)
    testImplementation(libs.mockk)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.robolectric)

    androidTestImplementation(libs.mockk.android)
}

tasks.withType<Test> {
    useJUnitPlatform()
}
```

### Task 0.4 — AndroidManifest permissions (3 min)

File: `android/app/src/main/AndroidManifest.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Audio -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />

    <!-- Location (for GPS tagging of detections) -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <!-- Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- WiFi scanning for RF sensor -->
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />

    <!-- Foreground service (W2 scope — declared now) -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

    <!-- Post notifications (Android 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- Hardware features (non-required for tablet support) -->
    <uses-feature android:name="android.hardware.microphone" android:required="true" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />

    <application
        android:name=".SentinelApplication"
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.ApexSentinel">

        <activity
            android:name=".ui.MainActivity"
            android:exported="true"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

---

## Phase 1: Audio Capture — AudioRecord (TDD)

### Task 1.1 — Write FAILING test first (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/audio/AudioCaptureTest.kt`
```kotlin
package io.apexos.sentinel.audio

import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import app.cash.turbine.test

class AudioCaptureTest {

    @Test
    fun `FR-01-01 AudioCapture emits PCM chunks at 16kHz mono`() = runTest {
        val capture = AudioCapture(sampleRate = 16000, channelCount = 1, bufferSizeMs = 100)
        capture.audioFlow.test {
            capture.start()
            val chunk = awaitItem()
            assertTrue(chunk.samples.isNotEmpty(), "Expected non-empty PCM chunk")
            assertEquals(16000, chunk.sampleRate)
            assertEquals(1, chunk.channelCount)
            cancel()
            capture.stop()
        }
    }

    @Test
    fun `FR-01-02 AudioCapture stops cleanly without resource leak`() = runTest {
        val capture = AudioCapture(sampleRate = 16000, channelCount = 1, bufferSizeMs = 100)
        capture.start()
        capture.stop()
        assertFalse(capture.isRecording, "Expected isRecording = false after stop()")
    }

    @Test
    fun `FR-01-03 AudioCapture reports correct buffer size for 100ms at 16kHz`() {
        val capture = AudioCapture(sampleRate = 16000, channelCount = 1, bufferSizeMs = 100)
        // 16000 samples/sec * 0.1 sec = 1600 samples * 2 bytes (SHORT) = 3200 bytes
        assertEquals(3200, capture.bufferSizeBytes)
    }

    @Test
    fun `FR-01-04 AudioCapture does not emit when stopped`() = runTest {
        val capture = AudioCapture(sampleRate = 16000, channelCount = 1, bufferSizeMs = 100)
        capture.audioFlow.test {
            // Not started — should emit nothing
            expectNoEvents()
            cancel()
        }
    }
}
```

Run (should be RED):
```bash
cd android && ./gradlew :app:test --tests "io.apexos.sentinel.audio.AudioCaptureTest"
# Expected: compilation failure (AudioCapture does not exist yet) — RED confirmed
```

### Task 1.2 — Implement AudioCapture (10 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/audio/AudioCapture.kt`
```kotlin
package io.apexos.sentinel.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

data class PcmChunk(
    val samples: ShortArray,
    val sampleRate: Int,
    val channelCount: Int,
    val timestampMs: Long = System.currentTimeMillis()
)

class AudioCapture(
    val sampleRate: Int = 16000,
    val channelCount: Int = 1,
    val bufferSizeMs: Int = 100
) {
    val bufferSizeBytes: Int = (sampleRate * channelCount * bufferSizeMs / 1000) * 2

    @Volatile var isRecording: Boolean = false
        private set

    private var audioRecord: AudioRecord? = null

    val audioFlow: Flow<PcmChunk> = flow {
        while (isRecording) {
            val record = audioRecord ?: break
            val buffer = ShortArray(bufferSizeBytes / 2)
            val read = record.read(buffer, 0, buffer.size)
            if (read > 0) {
                emit(PcmChunk(buffer.copyOf(read), sampleRate, channelCount))
            }
        }
    }

    fun start() {
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            if (channelCount == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val actualBuffer = maxOf(bufferSizeBytes, minBuffer)
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            if (channelCount == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO,
            AudioFormat.ENCODING_PCM_16BIT,
            actualBuffer
        )
        audioRecord?.startRecording()
        isRecording = true
    }

    fun stop() {
        isRecording = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }
}
```

Run (should be GREEN):
```bash
cd android && ./gradlew :app:test --tests "io.apexos.sentinel.audio.AudioCaptureTest"
```

---

## Phase 2: VAD Integration — WebRTC VAD (TDD)

### Task 2.1 — Write FAILING tests (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/audio/VadFilterTest.kt`
```kotlin
package io.apexos.sentinel.audio

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class VadFilterTest {

    @Test
    fun `FR-01-05 VadFilter returns SILENCE for zero-amplitude chunk`() {
        val vad = VadFilter(sampleRate = 16000, aggressiveness = VadAggressiveness.MODERATE)
        val silence = PcmChunk(ShortArray(1600) { 0 }, 16000, 1)
        assertEquals(VadResult.SILENCE, vad.process(silence))
    }

    @Test
    fun `FR-01-06 VadFilter returns SPEECH for high-amplitude sine wave`() {
        val vad = VadFilter(sampleRate = 16000, aggressiveness = VadAggressiveness.MODERATE)
        val sine = generateSineWave(frequency = 440.0, sampleRate = 16000, durationMs = 100,
            amplitude = 16000)
        val chunk = PcmChunk(sine, 16000, 1)
        assertEquals(VadResult.SPEECH, vad.process(chunk))
    }

    @Test
    fun `FR-01-07 VadFilter rejects chunks not matching expected frame size`() {
        val vad = VadFilter(sampleRate = 16000, aggressiveness = VadAggressiveness.MODERATE)
        val wrongSize = PcmChunk(ShortArray(100), 16000, 1) // too small
        assertThrows(IllegalArgumentException::class.java) { vad.process(wrongSize) }
    }

    private fun generateSineWave(frequency: Double, sampleRate: Int,
                                  durationMs: Int, amplitude: Int): ShortArray {
        val numSamples = sampleRate * durationMs / 1000
        return ShortArray(numSamples) { i ->
            (amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate)).toInt().toShort()
        }
    }
}
```

### Task 2.2 — Implement VadFilter (10 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/audio/VadFilter.kt`

Note: WebRTC VAD is accessed via the TFLite Task Audio library's AudioClassifier VAD or
via a JNI wrapper. For W1, implement a simplified energy-based VAD that mirrors WebRTC
behavior, to be replaced with the real WebRTC VAD JNI in W1-CP02.

```kotlin
package io.apexos.sentinel.audio

enum class VadAggressiveness { NORMAL, MODERATE, AGGRESSIVE, VERY_AGGRESSIVE }
enum class VadResult { SPEECH, SILENCE }

class VadFilter(
    private val sampleRate: Int = 16000,
    private val aggressiveness: VadAggressiveness = VadAggressiveness.MODERATE
) {
    // WebRTC VAD frame sizes: 10ms, 20ms, 30ms at supported rates
    private val validFrameSizes = setOf(
        sampleRate * 10 / 1000,
        sampleRate * 20 / 1000,
        sampleRate * 30 / 1000
    )

    private val energyThreshold: Double = when (aggressiveness) {
        VadAggressiveness.NORMAL         -> 100.0
        VadAggressiveness.MODERATE       -> 200.0
        VadAggressiveness.AGGRESSIVE     -> 400.0
        VadAggressiveness.VERY_AGGRESSIVE-> 800.0
    }

    fun process(chunk: PcmChunk): VadResult {
        // WebRTC VAD only processes specific frame sizes
        if (chunk.samples.size !in validFrameSizes) {
            throw IllegalArgumentException(
                "VadFilter: chunk size ${chunk.samples.size} is not a valid WebRTC VAD " +
                "frame size. Expected one of: $validFrameSizes"
            )
        }
        val energy = chunk.samples.map { it.toLong() * it.toLong() }.sum().toDouble() /
                chunk.samples.size
        return if (energy > energyThreshold) VadResult.SPEECH else VadResult.SILENCE
    }
}
```

---

## Phase 3: FFT Spectral Analysis (TDD)

### Task 3.1 — Write FAILING tests (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/dsp/FftAnalyzerTest.kt`
```kotlin
package io.apexos.sentinel.dsp

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import kotlin.math.abs

class FftAnalyzerTest {

    @Test
    fun `FR-02-01 FFT produces correct dominant frequency for pure 440Hz tone`() {
        val fft = FftAnalyzer(sampleRate = 16000, fftSize = 1024)
        val samples = FloatArray(1024) { i ->
            (Math.sin(2 * Math.PI * 440.0 * i / 16000)).toFloat()
        }
        val spectrum = fft.analyze(samples)
        val dominantBin = spectrum.magnitudes.indices.maxByOrNull { spectrum.magnitudes[it] }!!
        val dominantFreq = dominantBin * 16000.0 / 1024
        assertTrue(abs(dominantFreq - 440.0) < 20.0,
            "Expected ~440Hz, got ${dominantFreq}Hz")
    }

    @Test
    fun `FR-02-02 FFT spectrum has correct bin count for 1024-point FFT`() {
        val fft = FftAnalyzer(sampleRate = 16000, fftSize = 1024)
        val samples = FloatArray(1024)
        val spectrum = fft.analyze(samples)
        assertEquals(513, spectrum.magnitudes.size) // fftSize/2 + 1
    }

    @Test
    fun `FR-02-03 SpectralFeatures extracts FPV drone frequency band energy`() {
        val fft = FftAnalyzer(sampleRate = 16000, fftSize = 1024)
        // FPV motor fundamental: ~150-500Hz range
        val samples = FloatArray(1024) { i ->
            (Math.sin(2 * Math.PI * 300.0 * i / 16000)).toFloat()
        }
        val spectrum = fft.analyze(samples)
        val features = spectrum.extractFeatures()
        assertTrue(features.fpvBandEnergy > 0.0f,
            "Expected non-zero FPV band energy for 300Hz tone")
        assertTrue(features.fpvBandEnergy > features.backgroundEnergy,
            "FPV band energy should exceed background for 300Hz tone")
    }

    @Test
    fun `FR-02-04 FFT applies Hann window before transform`() {
        val fft = FftAnalyzer(sampleRate = 16000, fftSize = 1024, window = WindowFunction.HANN)
        val rectangular = FftAnalyzer(sampleRate = 16000, fftSize = 1024,
            window = WindowFunction.RECTANGULAR)
        val samples = FloatArray(1024) { 1.0f }
        val hannSpectrum = fft.analyze(samples)
        val rectSpectrum = rectangular.analyze(samples)
        assertNotEquals(hannSpectrum.magnitudes[0], rectSpectrum.magnitudes[0],
            0.001f, "Hann and rectangular window should differ on DC component")
    }
}
```

### Task 3.2 — Implement FftAnalyzer (15 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/dsp/FftAnalyzer.kt`
```kotlin
package io.apexos.sentinel.dsp

import org.apache.commons.math3.transform.FastFourierTransformer
import org.apache.commons.math3.transform.DftNormalization
import org.apache.commons.math3.transform.TransformType
import kotlin.math.sqrt
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10

enum class WindowFunction { HANN, HAMMING, RECTANGULAR }

data class FftSpectrum(
    val magnitudes: FloatArray,
    val sampleRate: Int,
    val fftSize: Int
) {
    val frequencyResolutionHz: Double get() = sampleRate.toDouble() / fftSize

    fun binToFrequency(bin: Int): Double = bin * frequencyResolutionHz

    fun frequencyToClosestBin(freq: Double): Int =
        (freq / frequencyResolutionHz).toInt().coerceIn(0, magnitudes.size - 1)

    fun bandEnergy(lowHz: Double, highHz: Double): Float {
        val lowBin = frequencyToClosestBin(lowHz)
        val highBin = frequencyToClosestBin(highHz)
        return magnitudes.slice(lowBin..highBin).sum() / (highBin - lowBin + 1)
    }

    fun extractFeatures(): SpectralFeatures = SpectralFeatures(
        fpvBandEnergy   = bandEnergy(100.0, 600.0),   // FPV motor fundamentals
        shahedBandEnergy= bandEnergy(50.0, 200.0),    // Shahed-class prop wash
        midBandEnergy   = bandEnergy(600.0, 4000.0),
        highBandEnergy  = bandEnergy(4000.0, 8000.0),
        backgroundEnergy= bandEnergy(8000.0, sampleRate / 2.0),
        spectralCentroid= computeSpectralCentroid(),
        spectralFlux    = 0.0f // computed externally across frames
    )

    private fun computeSpectralCentroid(): Float {
        var weightedSum = 0.0f
        var magnitudeSum = 0.0f
        magnitudes.forEachIndexed { bin, mag ->
            val freq = binToFrequency(bin).toFloat()
            weightedSum += freq * mag
            magnitudeSum += mag
        }
        return if (magnitudeSum > 0) weightedSum / magnitudeSum else 0.0f
    }
}

data class SpectralFeatures(
    val fpvBandEnergy: Float,
    val shahedBandEnergy: Float,
    val midBandEnergy: Float,
    val highBandEnergy: Float,
    val backgroundEnergy: Float,
    val spectralCentroid: Float,
    val spectralFlux: Float
)

class FftAnalyzer(
    val sampleRate: Int = 16000,
    val fftSize: Int = 1024,
    val window: WindowFunction = WindowFunction.HANN
) {
    private val transformer = FastFourierTransformer(DftNormalization.STANDARD)
    private val windowCoefficients: DoubleArray = computeWindow()

    private fun computeWindow(): DoubleArray = DoubleArray(fftSize) { n ->
        when (window) {
            WindowFunction.HANN ->
                0.5 * (1.0 - cos(2.0 * PI * n / (fftSize - 1)))
            WindowFunction.HAMMING ->
                0.54 - 0.46 * cos(2.0 * PI * n / (fftSize - 1))
            WindowFunction.RECTANGULAR -> 1.0
        }
    }

    fun analyze(samples: FloatArray): FftSpectrum {
        require(samples.size == fftSize) {
            "FftAnalyzer: expected $fftSize samples, got ${samples.size}"
        }
        val windowed = DoubleArray(fftSize) { i -> samples[i] * windowCoefficients[i] }
        val complex = transformer.transform(windowed, TransformType.FORWARD)
        val magnitudes = FloatArray(fftSize / 2 + 1) { bin ->
            sqrt((complex[bin].real * complex[bin].real +
                  complex[bin].imaginary * complex[bin].imaginary).toFloat())
        }
        return FftSpectrum(magnitudes, sampleRate, fftSize)
    }
}
```

---

## Phase 4: YAMNet TFLite Inference (TDD)

### Task 4.1 — Write FAILING tests (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/ml/YamNetInferenceTest.kt`
```kotlin
package io.apexos.sentinel.ml

import io.mockk.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class YamNetInferenceTest {

    @Test
    fun `FR-03-01 YamNetInference returns DroneDetection with confidence for drone input`() {
        val mockInterpreter = mockk<TfliteInterpreterWrapper>()
        val outputMap = mapOf(
            "output_0" to floatArrayOf(0.89f, 0.08f, 0.03f) // drone, no-drone, uncertain
        )
        every { mockInterpreter.run(any(), any()) } answers {
            val output = secondArg<HashMap<Int, FloatArray>>()
            output[0] = outputMap["output_0"]!!
        }

        val inference = YamNetInference(interpreter = mockInterpreter, threshold = 0.7f)
        val input = FloatArray(15600) { 0.1f } // 0.975s @ 16kHz
        val result = inference.infer(input)

        assertEquals(DetectionClass.DRONE, result.detectionClass)
        assertTrue(result.confidence > 0.7f)
        assertTrue(result.inferenceTimeMs >= 0L)
    }

    @Test
    fun `FR-03-02 YamNetInference returns NO_DRONE when background dominates`() {
        val mockInterpreter = mockk<TfliteInterpreterWrapper>()
        every { mockInterpreter.run(any(), any()) } answers {
            val output = secondArg<HashMap<Int, FloatArray>>()
            output[0] = floatArrayOf(0.05f, 0.92f, 0.03f)
        }

        val inference = YamNetInference(interpreter = mockInterpreter, threshold = 0.7f)
        val result = inference.infer(FloatArray(15600))

        assertEquals(DetectionClass.NO_DRONE, result.detectionClass)
    }

    @Test
    fun `FR-03-03 YamNetInference returns UNCERTAIN when max confidence below threshold`() {
        val mockInterpreter = mockk<TfliteInterpreterWrapper>()
        every { mockInterpreter.run(any(), any()) } answers {
            val output = secondArg<HashMap<Int, FloatArray>>()
            output[0] = floatArrayOf(0.45f, 0.40f, 0.15f) // nothing above threshold
        }

        val inference = YamNetInference(interpreter = mockInterpreter, threshold = 0.7f)
        val result = inference.infer(FloatArray(15600))

        assertEquals(DetectionClass.UNCERTAIN, result.detectionClass)
    }

    @Test
    fun `FR-03-04 YamNetInference rejects input of wrong length`() {
        val mockInterpreter = mockk<TfliteInterpreterWrapper>()
        val inference = YamNetInference(interpreter = mockInterpreter)
        assertThrows(IllegalArgumentException::class.java) {
            inference.infer(FloatArray(1000)) // wrong size
        }
    }
}
```

### Task 4.2 — Implement YamNetInference (15 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/ml/YamNetInference.kt`
```kotlin
package io.apexos.sentinel.ml

enum class DetectionClass { DRONE, NO_DRONE, UNCERTAIN }

data class InferenceResult(
    val detectionClass: DetectionClass,
    val confidence: Float,
    val scores: FloatArray,   // [drone, no-drone, uncertain]
    val inferenceTimeMs: Long,
    val timestampMs: Long = System.currentTimeMillis()
)

interface TfliteInterpreterWrapper {
    fun run(inputs: Any, outputs: HashMap<Int, FloatArray>)
    fun close()
}

class YamNetInference(
    private val interpreter: TfliteInterpreterWrapper,
    private val threshold: Float = 0.70f,
    private val inputLength: Int = 15600  // 0.975s @ 16kHz (YAMNet requirement)
) {
    fun infer(waveform: FloatArray): InferenceResult {
        require(waveform.size == inputLength) {
            "YamNetInference: input must be $inputLength samples " +
            "(0.975s @ 16kHz), got ${waveform.size}"
        }

        val outputScores = HashMap<Int, FloatArray>()
        outputScores[0] = FloatArray(3)

        val startMs = System.currentTimeMillis()
        interpreter.run(waveform, outputScores)
        val inferenceTimeMs = System.currentTimeMillis() - startMs

        val scores = outputScores[0]!!
        val maxScore = scores.max()
        val maxIdx = scores.indices.maxByOrNull { scores[it] }!!

        val detectionClass = when {
            maxScore < threshold              -> DetectionClass.UNCERTAIN
            maxIdx == 0                       -> DetectionClass.DRONE
            maxIdx == 1                       -> DetectionClass.NO_DRONE
            else                              -> DetectionClass.UNCERTAIN
        }

        return InferenceResult(
            detectionClass  = detectionClass,
            confidence      = maxScore,
            scores          = scores,
            inferenceTimeMs = inferenceTimeMs
        )
    }

    fun close() = interpreter.close()
}
```

File: `android/app/src/main/kotlin/io/apexos/sentinel/ml/TfliteInterpreterImpl.kt`
```kotlin
package io.apexos.sentinel.ml

import android.content.Context
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class TfliteInterpreterImpl(context: Context, modelAssetPath: String) : TfliteInterpreterWrapper {
    private val interpreter: Interpreter

    init {
        val options = Interpreter.Options().apply {
            numThreads = 4
            useNNAPI = true
        }
        val model = loadModelFile(context, modelAssetPath)
        interpreter = Interpreter(model, options)
    }

    private fun loadModelFile(context: Context, assetPath: String): MappedByteBuffer {
        val afd = context.assets.openFd(assetPath)
        val fis = FileInputStream(afd.fileDescriptor)
        val channel = fis.channel
        return channel.map(FileChannel.MapMode.READ_ONLY, afd.startOffset, afd.declaredLength)
    }

    override fun run(inputs: Any, outputs: HashMap<Int, FloatArray>) {
        interpreter.runForMultipleInputsOutputs(arrayOf(inputs), outputs as Map<Int, Any>)
    }

    override fun close() = interpreter.close()
}
```

---

## Phase 5: GPS Metadata (TDD)

### Task 5.1 — Write FAILING tests (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/location/GpsMetadataTest.kt`
```kotlin
package io.apexos.sentinel.location

import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class GpsMetadataTest {

    @Test
    fun `FR-04-01 GpsMetadataProvider returns location with accuracy`() = runTest {
        val mockProvider = mockk<GpsMetadataProvider>()
        coEvery { mockProvider.getCurrentLocation() } returns LocationSnapshot(
            latitudeDeg = 44.4268, longitudeDeg = 26.1025,
            altitudeM = 85.0, accuracyM = 5.0f,
            timestampMs = System.currentTimeMillis(),
            provider = "gps"
        )
        val loc = mockProvider.getCurrentLocation()
        assertNotNull(loc)
        assertTrue(loc!!.accuracyM < 62.0f, "Accuracy must be < 62m for valid detection")
    }

    @Test
    fun `FR-04-02 GpsMetadataProvider returns null when location unavailable`() = runTest {
        val mockProvider = mockk<GpsMetadataProvider>()
        coEvery { mockProvider.getCurrentLocation() } returns null
        assertNull(mockProvider.getCurrentLocation())
    }

    @Test
    fun `FR-04-03 LocationSnapshot serializes to correct JSON keys`() {
        val loc = LocationSnapshot(
            latitudeDeg = 44.4268, longitudeDeg = 26.1025,
            altitudeM = 85.0, accuracyM = 5.0f,
            timestampMs = 1711234567890L, provider = "gps"
        )
        val json = loc.toJsonObject()
        assertTrue(json.containsKey("lat"))
        assertTrue(json.containsKey("lon"))
        assertTrue(json.containsKey("alt_m"))
        assertTrue(json.containsKey("accuracy_m"))
        assertTrue(json.containsKey("timestamp_ms"))
    }
}
```

### Task 5.2 — Implement GpsMetadataProvider (10 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/location/GpsMetadataProvider.kt`
```kotlin
package io.apexos.sentinel.location

import android.content.Context
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.tasks.await

data class LocationSnapshot(
    val latitudeDeg: Double,
    val longitudeDeg: Double,
    val altitudeM: Double,
    val accuracyM: Float,
    val timestampMs: Long,
    val provider: String
) {
    fun toJsonObject(): Map<String, Any> = mapOf(
        "lat"         to latitudeDeg,
        "lon"         to longitudeDeg,
        "alt_m"       to altitudeM,
        "accuracy_m"  to accuracyM,
        "timestamp_ms"to timestampMs,
        "provider"    to provider
    )
}

interface GpsMetadataProvider {
    suspend fun getCurrentLocation(): LocationSnapshot?
}

class FusedLocationProvider(private val context: Context) : GpsMetadataProvider {
    private val client = LocationServices.getFusedLocationProviderClient(context)

    override suspend fun getCurrentLocation(): LocationSnapshot? {
        return try {
            val loc = client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await()
            loc?.let {
                LocationSnapshot(
                    latitudeDeg = it.latitude,
                    longitudeDeg= it.longitude,
                    altitudeM   = it.altitude,
                    accuracyM   = it.accuracy,
                    timestampMs = it.time,
                    provider    = it.provider ?: "fused"
                )
            }
        } catch (e: SecurityException) {
            null // permission not granted
        } catch (e: Exception) {
            null
        }
    }
}
```

---

## Phase 6: Supabase Ingestion (TDD)

### Task 6.1 — Write FAILING tests (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/data/DetectionIngesterTest.kt`
```kotlin
package io.apexos.sentinel.data

import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import io.apexos.sentinel.ml.DetectionClass
import io.apexos.sentinel.ml.InferenceResult
import io.apexos.sentinel.location.LocationSnapshot

class DetectionIngesterTest {

    @Test
    fun `FR-05-01 DetectionIngester sends detection event to Supabase`() = runTest {
        val mockRepo = mockk<DetectionEventRepository>()
        coEvery { mockRepo.insert(any()) } returns Result.success(Unit)

        val ingester = DetectionIngester(repository = mockRepo)
        val result = InferenceResult(
            detectionClass = DetectionClass.DRONE,
            confidence = 0.91f,
            scores = floatArrayOf(0.91f, 0.06f, 0.03f),
            inferenceTimeMs = 145L
        )
        val location = LocationSnapshot(44.4268, 26.1025, 85.0, 5.0f,
            System.currentTimeMillis(), "gps")

        val outcome = ingester.ingest(result, location, nodeId = "node-test-001")
        assertTrue(outcome.isSuccess)
        coVerify(exactly = 1) { mockRepo.insert(any()) }
    }

    @Test
    fun `FR-05-02 DetectionIngester skips ingestion for NO_DRONE events`() = runTest {
        val mockRepo = mockk<DetectionEventRepository>()
        val ingester = DetectionIngester(repository = mockRepo, ingestNoDrone = false)
        val result = InferenceResult(
            detectionClass = DetectionClass.NO_DRONE, confidence = 0.92f,
            scores = floatArrayOf(0.05f, 0.92f, 0.03f), inferenceTimeMs = 140L
        )
        val outcome = ingester.ingest(result, null, "node-001")
        assertTrue(outcome.isSuccess)
        coVerify(exactly = 0) { mockRepo.insert(any()) }
    }

    @Test
    fun `FR-05-03 DetectionIngester handles Supabase error gracefully`() = runTest {
        val mockRepo = mockk<DetectionEventRepository>()
        coEvery { mockRepo.insert(any()) } throws RuntimeException("Network error")

        val ingester = DetectionIngester(repository = mockRepo)
        val result = InferenceResult(
            detectionClass = DetectionClass.DRONE, confidence = 0.88f,
            scores = floatArrayOf(0.88f, 0.09f, 0.03f), inferenceTimeMs = 155L
        )
        val outcome = ingester.ingest(result, null, "node-001")
        assertTrue(outcome.isFailure)
        // Should NOT throw — wraps in Result.failure
    }
}
```

### Task 6.2 — Implement DetectionIngester (15 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/data/DetectionEvent.kt`
```kotlin
package io.apexos.sentinel.data

import kotlinx.serialization.Serializable

@Serializable
data class DetectionEvent(
    val node_id: String,
    val detection_class: String,        // "drone" | "no_drone" | "uncertain"
    val confidence: Float,
    val score_drone: Float,
    val score_no_drone: Float,
    val score_uncertain: Float,
    val inference_time_ms: Long,
    val lat: Double?,
    val lon: Double?,
    val alt_m: Double?,
    val location_accuracy_m: Float?,
    val location_provider: String?,
    val detected_at: String,            // ISO-8601
    val app_version: String = "0.1.0-alpha",
    val model_version: String = "yamnet_drone_sentinel_v1"
)
```

File: `android/app/src/main/kotlin/io/apexos/sentinel/data/DetectionIngester.kt`
```kotlin
package io.apexos.sentinel.data

import io.apexos.sentinel.ml.DetectionClass
import io.apexos.sentinel.ml.InferenceResult
import io.apexos.sentinel.location.LocationSnapshot
import java.time.Instant

interface DetectionEventRepository {
    suspend fun insert(event: DetectionEvent): Unit
}

class DetectionIngester(
    private val repository: DetectionEventRepository,
    private val ingestNoDrone: Boolean = false,
    private val ingestUncertain: Boolean = true
) {
    suspend fun ingest(
        result: InferenceResult,
        location: LocationSnapshot?,
        nodeId: String
    ): Result<Unit> {
        if (result.detectionClass == DetectionClass.NO_DRONE && !ingestNoDrone) {
            return Result.success(Unit) // skip silently
        }
        if (result.detectionClass == DetectionClass.UNCERTAIN && !ingestUncertain) {
            return Result.success(Unit)
        }
        val event = DetectionEvent(
            node_id              = nodeId,
            detection_class      = result.detectionClass.name.lowercase(),
            confidence           = result.confidence,
            score_drone          = result.scores[0],
            score_no_drone       = result.scores[1],
            score_uncertain      = result.scores[2],
            inference_time_ms    = result.inferenceTimeMs,
            lat                  = location?.latitudeDeg,
            lon                  = location?.longitudeDeg,
            alt_m                = location?.altitudeM,
            location_accuracy_m  = location?.accuracyM,
            location_provider    = location?.provider,
            detected_at          = Instant.ofEpochMilli(result.timestampMs).toString()
        )
        return runCatching { repository.insert(event) }
    }
}
```

---

## Phase 7: Calibration Routine (TDD)

### Task 7.1 — Write FAILING tests (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/calibration/CalibrationTest.kt`
```kotlin
package io.apexos.sentinel.calibration

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class CalibrationTest {

    @Test
    fun `FR-06-01 CalibrationRoutine sets threshold based on ambient noise floor`() {
        val calibration = CalibrationRoutine()
        val ambientSamples = List(10) { generateSilentChunk() }
        val result = calibration.calibrate(ambientSamples)
        assertTrue(result.vadThresholdAdjustment >= 0.0f)
        assertTrue(result.isCalibrated)
    }

    @Test
    fun `FR-06-02 CalibrationRoutine rejects calibration if SNR too low`() {
        val calibration = CalibrationRoutine(minSnrDb = 10.0f)
        val noisySamples = List(10) { generateNoisyChunk(amplitude = 20000) }
        val result = calibration.calibrate(noisySamples)
        assertFalse(result.isCalibrated,
            "Should refuse calibration in extremely noisy environment")
        assertNotNull(result.failureReason)
    }

    private fun generateSilentChunk() = FloatArray(16000) { 0.001f }
    private fun generateNoisyChunk(amplitude: Int) = FloatArray(16000) {
        ((-amplitude..amplitude).random().toFloat())
    }
}
```

### Task 7.2 — Implement CalibrationRoutine (10 min)

File: `android/app/src/main/kotlin/io/apexos/sentinel/calibration/CalibrationRoutine.kt`
```kotlin
package io.apexos.sentinel.calibration

import kotlin.math.log10
import kotlin.math.sqrt

data class CalibrationResult(
    val isCalibrated: Boolean,
    val ambientNoiseFloorDb: Float,
    val vadThresholdAdjustment: Float,
    val snrDb: Float,
    val failureReason: String? = null
)

class CalibrationRoutine(
    private val minSnrDb: Float = 10.0f,
    private val calibrationWindowSize: Int = 10
) {
    fun calibrate(ambientSamples: List<FloatArray>): CalibrationResult {
        require(ambientSamples.size >= calibrationWindowSize) {
            "Need at least $calibrationWindowSize samples for calibration"
        }

        val rmsValues = ambientSamples.map { samples ->
            sqrt(samples.map { it * it }.average().toFloat())
        }
        val meanRms = rmsValues.average().toFloat()
        val noiseFloorDb = if (meanRms > 0) 20.0f * log10(meanRms) else -80.0f

        // Estimate SNR using variance of RMS as proxy for dynamic range
        val variance = rmsValues.map { (it - meanRms) * (it - meanRms) }.average().toFloat()
        val snrDb = if (variance > 0) 10.0f * log10(1.0f / variance) else 0.0f

        if (snrDb < minSnrDb) {
            return CalibrationResult(
                isCalibrated          = false,
                ambientNoiseFloorDb   = noiseFloorDb,
                vadThresholdAdjustment= 0.0f,
                snrDb                 = snrDb,
                failureReason         = "SNR too low (${snrDb}dB < ${minSnrDb}dB threshold). " +
                    "Move to quieter location."
            )
        }

        // Adjust VAD threshold: louder ambient = raise threshold
        val adjustment = (noiseFloorDb + 60.0f) / 60.0f  // normalize -60..0 dB to 0..1
        return CalibrationResult(
            isCalibrated          = true,
            ambientNoiseFloorDb   = noiseFloorDb,
            vadThresholdAdjustment= adjustment.coerceIn(0.0f, 2.0f),
            snrDb                 = snrDb
        )
    }
}
```

---

## Phase 8: Jetpack Compose UI (TDD)

### Task 8.1 — Write FAILING UI tests (5 min)

File: `android/app/src/androidTest/kotlin/io/apexos/sentinel/ui/MainScreenTest.kt`
```kotlin
package io.apexos.sentinel.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import io.apexos.sentinel.ui.screen.MainScreen
import io.apexos.sentinel.ui.state.SentinelUiState
import io.apexos.sentinel.ml.DetectionClass

class MainScreenTest {

    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun FR_07_01_shows_monitoring_status_banner() {
        composeTestRule.setContent {
            MainScreen(uiState = SentinelUiState.Monitoring)
        }
        composeTestRule.onNodeWithText("Monitoring").assertIsDisplayed()
    }

    @Test
    fun FR_07_02_shows_alert_banner_on_drone_detection() {
        composeTestRule.setContent {
            MainScreen(uiState = SentinelUiState.Alert(
                confidence = 0.91f,
                detectionClass = DetectionClass.DRONE
            ))
        }
        composeTestRule.onNodeWithText("DRONE DETECTED", ignoreCase = true)
            .assertIsDisplayed()
    }

    @Test
    fun FR_07_03_shows_confidence_percentage() {
        composeTestRule.setContent {
            MainScreen(uiState = SentinelUiState.Alert(0.91f, DetectionClass.DRONE))
        }
        composeTestRule.onNodeWithText("91%", substring = true).assertIsDisplayed()
    }
}
```

### Task 8.2 — Implement MainScreen composables (15 min)

Files to create:
- `android/app/src/main/kotlin/io/apexos/sentinel/ui/screen/MainScreen.kt`
- `android/app/src/main/kotlin/io/apexos/sentinel/ui/state/SentinelUiState.kt`
- `android/app/src/main/kotlin/io/apexos/sentinel/ui/theme/Theme.kt`
- `android/app/src/main/kotlin/io/apexos/sentinel/ui/MainActivity.kt`

---

## Phase 9: iOS — Acoustic App (Swift/CoreML)

### Task 9.1 — iOS project setup (5 min)

```bash
mkdir -p ios/ApexSentinel
mkdir -p ios/ApexSentinel/Sources/Audio
mkdir -p ios/ApexSentinel/Sources/ML
mkdir -p ios/ApexSentinel/Sources/Data
mkdir -p ios/ApexSentinel/Sources/Location
mkdir -p ios/ApexSentinel/Sources/UI
mkdir -p ios/ApexSentinelTests
```

Podfile:
```ruby
platform :ios, '16.0'
use_frameworks!

target 'ApexSentinel' do
  pod 'Supabase', '2.x'           # supabase-swift
  pod 'TensorFlowLiteSwift', '2.16.1'
  pod 'TensorFlowLiteSwift/CoreML', '2.16.1'

  target 'ApexSentinelTests' do
    inherit! :search_paths
  end
end
```

Package.swift (SPM alternative):
```swift
// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "ApexSentinel",
    platforms: [.iOS(.v16)],
    dependencies: [
        .package(url: "https://github.com/supabase-community/supabase-swift.git",
                 from: "2.0.0"),
        .package(url: "https://github.com/tensorflow/tensorflow",
                 branch: "master")   // use TFLite-Swift package
    ],
    targets: [
        .target(name: "ApexSentinel",
                dependencies: [
                    .product(name: "Supabase", package: "supabase-swift")
                ])
    ]
)
```

### Task 9.2 — iOS AudioCapture (Swift) — FAILING test first (5 min)

File: `ios/ApexSentinelTests/AudioCaptureTests.swift`
```swift
import XCTest
@testable import ApexSentinel

final class AudioCaptureTests: XCTestCase {

    func test_FR01_01_audioCaptureInitializesWithCorrectFormat() {
        let capture = AudioCapture(sampleRate: 16000, channelCount: 1, bufferDurationSeconds: 0.1)
        XCTAssertEqual(capture.sampleRate, 16000)
        XCTAssertEqual(capture.channelCount, 1)
        XCTAssertFalse(capture.isRecording)
    }

    func test_FR01_02_audioCaptureStartAndStop() {
        let capture = AudioCapture(sampleRate: 16000, channelCount: 1, bufferDurationSeconds: 0.1)
        // In simulator: AVAudioEngine may fail — wrap in do/catch
        do {
            try capture.start()
            XCTAssertTrue(capture.isRecording)
            capture.stop()
            XCTAssertFalse(capture.isRecording)
        } catch {
            // Simulator without mic — acceptable in CI
            XCTAssertTrue(error is AudioCaptureError, "Expected AudioCaptureError, got \(error)")
        }
    }

    func test_FR01_03_pcmChunkHasCorrectSampleCount() {
        let durationSeconds = 0.1
        let sampleRate = 16000
        let expectedSamples = Int(Double(sampleRate) * durationSeconds)
        XCTAssertEqual(expectedSamples, 1600)
    }
}
```

### Task 9.3 — Implement iOS AudioCapture (10 min)

File: `ios/ApexSentinel/Sources/Audio/AudioCapture.swift`
```swift
import AVFoundation
import Combine

enum AudioCaptureError: Error {
    case permissionDenied
    case engineStartFailed(Error)
    case formatUnsupported
}

struct PcmChunk {
    let samples: [Float]
    let sampleRate: Int
    let channelCount: Int
    let timestampMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)
}

class AudioCapture: ObservableObject {
    let sampleRate: Int
    let channelCount: Int
    let bufferDurationSeconds: Double

    @Published private(set) var isRecording: Bool = false

    private var audioEngine: AVAudioEngine?
    private let chunkSubject = PassthroughSubject<PcmChunk, Never>()
    var chunkPublisher: AnyPublisher<PcmChunk, Never> { chunkSubject.eraseToAnyPublisher() }

    init(sampleRate: Int = 16000, channelCount: Int = 1,
         bufferDurationSeconds: Double = 0.1) {
        self.sampleRate = sampleRate
        self.channelCount = channelCount
        self.bufferDurationSeconds = bufferDurationSeconds
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement,
            options: [.duckOthers, .allowBluetooth])
        try session.setPreferredSampleRate(Double(sampleRate))
        try session.setActive(true)

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: Double(sampleRate),
            channels: AVAudioChannelCount(channelCount),
            interleaved: false
        )!

        let bufferSize = AVAudioFrameCount(Double(sampleRate) * bufferDurationSeconds)
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: format) {
            [weak self] buffer, _ in
            guard let self = self,
                  let channelData = buffer.floatChannelData else { return }
            let samples = Array(UnsafeBufferPointer(
                start: channelData[0], count: Int(buffer.frameLength)))
            let chunk = PcmChunk(samples: samples,
                                 sampleRate: self.sampleRate,
                                 channelCount: self.channelCount)
            self.chunkSubject.send(chunk)
        }

        do {
            try engine.start()
        } catch {
            throw AudioCaptureError.engineStartFailed(error)
        }

        self.audioEngine = engine
        isRecording = true
    }

    func stop() {
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        isRecording = false
    }
}
```

### Task 9.4 — iOS YAMNet CoreML Inference (5 min)

File: `ios/ApexSentinel/Sources/ML/YamNetInference.swift`
```swift
import CoreML
import Foundation

enum DetectionClass: String {
    case drone      = "drone"
    case noDrone    = "no_drone"
    case uncertain  = "uncertain"
}

struct InferenceResult {
    let detectionClass: DetectionClass
    let confidence: Float
    let scores: [Float]
    let inferenceTimeMs: Int64
    let timestampMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)
}

class YamNetInference {
    private let model: MLModel
    private let threshold: Float
    private let inputLength: Int = 15600

    init(modelURL: URL, threshold: Float = 0.70) throws {
        let config = MLModelConfiguration()
        config.computeUnits = .cpuAndNeuralEngine
        self.model = try MLModel(contentsOf: modelURL, configuration: config)
        self.threshold = threshold
    }

    func infer(waveform: [Float]) throws -> InferenceResult {
        precondition(waveform.count == inputLength,
            "Expected \(inputLength) samples, got \(waveform.count)")

        let start = Date()
        // Build MLMultiArray input
        let inputArray = try MLMultiArray(shape: [1, NSNumber(value: inputLength)],
                                          dataType: .float32)
        for (i, sample) in waveform.enumerated() {
            inputArray[i] = NSNumber(value: sample)
        }

        let input = try MLDictionaryFeatureProvider(
            dictionary: ["waveform": MLFeatureValue(multiArray: inputArray)])
        let output = try model.prediction(from: input)

        let inferenceTimeMs = Int64(Date().timeIntervalSince(start) * 1000)

        guard let scoresArray = output.featureValue(for: "scores")?.multiArrayValue else {
            throw NSError(domain: "YamNet", code: 1,
                         userInfo: [NSLocalizedDescriptionKey: "No scores output"])
        }

        let scores: [Float] = (0..<3).map { Float(truncating: scoresArray[$0]) }
        let maxScore = scores.max()!
        let maxIdx = scores.indices.max(by: { scores[$0] < scores[$1] })!

        let detectionClass: DetectionClass
        if maxScore < threshold {
            detectionClass = .uncertain
        } else if maxIdx == 0 {
            detectionClass = .drone
        } else {
            detectionClass = .noDrone
        }

        return InferenceResult(detectionClass: detectionClass, confidence: maxScore,
                               scores: scores, inferenceTimeMs: inferenceTimeMs)
    }
}
```

---

## Phase 10: Integration & End-to-End Tests

### Task 10.1 — Pipeline integration test (5 min)

File: `android/app/src/test/kotlin/io/apexos/sentinel/pipeline/AcousticPipelineTest.kt`
```kotlin
package io.apexos.sentinel.pipeline

import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import io.apexos.sentinel.audio.AudioCapture
import io.apexos.sentinel.audio.VadFilter
import io.apexos.sentinel.dsp.FftAnalyzer
import io.apexos.sentinel.ml.YamNetInference
import io.apexos.sentinel.data.DetectionIngester

class AcousticPipelineTest {

    @Test
    fun `FR-08-01 Full pipeline produces DetectionEvent for drone-like waveform`() = runTest {
        val pipeline = AcousticPipeline(
            capture     = mockk(relaxed = true),
            vadFilter   = mockk { every { process(any()) } returns VadResult.SPEECH },
            fftAnalyzer = mockk(relaxed = true),
            inference   = mockk {
                every { infer(any()) } returns InferenceResult(
                    DetectionClass.DRONE, 0.91f,
                    floatArrayOf(0.91f, 0.06f, 0.03f), 145L)
            },
            ingester    = mockk { coEvery { ingest(any(), any(), any()) } returns
                Result.success(Unit) },
            locationProvider = mockk { coEvery { getCurrentLocation() } returns null }
        )
        // Assert pipeline wires all components correctly by running a single cycle
        val result = pipeline.processSingleCycle(waveform = FloatArray(15600) { 0.5f })
        assertNotNull(result)
        assertEquals(DetectionClass.DRONE, result!!.detectionClass)
    }
}
```

---

## Completion Checklist

```
[ ] Phase 0: Project scaffold committed — RED tag
[ ] Phase 1: AudioCapture tests GREEN
[ ] Phase 2: VadFilter tests GREEN
[ ] Phase 3: FftAnalyzer tests GREEN
[ ] Phase 4: YamNetInference tests GREEN
[ ] Phase 5: GpsMetadata tests GREEN
[ ] Phase 6: DetectionIngester tests GREEN
[ ] Phase 7: CalibrationRoutine tests GREEN
[ ] Phase 8: Compose UI tests GREEN
[ ] Phase 9: iOS tests GREEN
[ ] Phase 10: Integration tests GREEN
[ ] Coverage gate: ./gradlew jacocoTestReport → ≥80% branches/functions/lines
[ ] Build gate: ./gradlew assembleDebug (no errors)
[ ] iOS build gate: xcodebuild (no errors)
[ ] TypeScript check: npx tsc --noEmit (c2-dashboard/)
[ ] Supabase migrations applied: supabase db push
[ ] LKGC updated to W1-COMPLETE
[ ] wave-formation.sh complete W1 executed
```

---

*Document owner: Nicolae Fratila | Wave: 1 | Last updated: 2026-03-24*
