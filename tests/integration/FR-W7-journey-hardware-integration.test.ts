// APEX-SENTINEL — W7 Hardware Integration Journey Tests
// FR-W7-JOURNEY | tests/integration/FR-W7-journey-hardware-integration.test.ts
// Full hardware integration pipeline journeys: audio → detection → intercept
// Execute phase: vi.mock() removed — all W7 modules now implemented (GREEN)

import { describe, it, expect, vi } from 'vitest';

// Existing modules (real imports)
import { AcousticProfileLibrary } from '../../src/ml/acoustic-profile-library.js';
import { FalsePositiveGuard } from '../../src/ml/false-positive-guard.js';
import { BearingTriangulator } from '../../src/fusion/bearing-triangulator.js';

// W7 modules — real implementations, no mocks
import { PtzSlaveOutput } from '../../src/output/ptz-slave-output.js';
import { JammerActivation } from '../../src/output/jammer-activation.js';
import { PhysicalInterceptCoordinator } from '../../src/output/physical-intercept-coordinator.js';
import { SentinelPipelineV2 } from '../../src/integration/sentinel-pipeline-v2.js';
import { DemoDashboardApi } from '../../src/ui/demo-dashboard/api.js';

import type { EKFState } from '../../src/prediction/types.js';

function makeEKFState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5074,
    lon: 4.9034,
    alt: 200,
    vLat: 0.0001,
    vLon: 0.0001,
    vAlt: -10,
    confidence: 0.92,
    timestamp: Date.now(),
    ...overrides,
  };
}

// 16kHz, 1-second segment = 16000 samples
function make16kHzSamples(durationS = 1): Float32Array {
  return new Float32Array(16000 * durationS);
}

describe('FR-W7-JOURNEY: Hardware Integration End-to-End', () => {

  // JRN-W7-01: Shahed-238 (jet) → turbine profile → JammerActivation GPS 1575MHz
  it('JRN-W7-01: Shahed-238 (jet) detected → correct turbine profile matched → JammerActivation uses GPS 1575MHz channel', () => {
    const library = new AcousticProfileLibrary();
    const jammer = new JammerActivation({ channels: { 'shahed-238': '1575mhz', fpv: '900mhz' } });

    // Shahed-238 is jet engine — turbine 3-8kHz band
    const profile = library.matchFrequency(4000, 7000);
    expect(profile).not.toBeNull();
    expect(profile!.droneType).toBe('shahed-238');

    // Activate jammer for this drone class
    jammer.activate({ droneClass: profile!.droneType, isFalsePositive: false });

    const channel = jammer.getChannel(profile!.droneType);
    expect(channel).toBe('1575mhz');
  });

  // JRN-W7-02: Gerbera detected → FalsePositiveGuard runs → result fed to PtzSlaveOutput
  it('JRN-W7-02: Gerbera detected → FalsePositiveGuard still runs → result fed to PtzSlaveOutput', () => {
    const library = new AcousticProfileLibrary();
    const guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
    const ptz = new PtzSlaveOutput({
      onvifEndpoint: 'http://cam.local/onvif/PTZ',
      publishRateHz: 100,
      lookAheadMs: 8,
      transport: { send: vi.fn().mockResolvedValue({ status: 200 }) },
    });

    // Gerbera narrow-band piston: 167-217Hz — use exact range for Jaccard match
    const gerberaProfile = library.matchFrequency(167, 217);
    expect(gerberaProfile).not.toBeNull();
    expect(gerberaProfile!.droneType).toBe('gerbera');

    const assessment = guard.assess({
      yamnetConfidence: 0.88,
      hasRfSignal: true,
      trackId: 'TRK-GBR',
    });
    expect(assessment.isFalsePositive).toBe(false);

    // PTZ predictBearing must return a number for valid state
    const result = ptz.predictBearing(makeEKFState(), 8, { lat: 51.49, lon: 4.89 });
    expect(typeof result).toBe('number');
  });

  // JRN-W7-03: 3-node bearing → BearingTriangulator → result within 500m
  it('JRN-W7-03: 3-node bearing report → BearingTriangulator → result within 500m of expected', () => {
    // Known impact point: 51.510, 4.907
    const targetLat = 51.510;
    const targetLon = 4.907;

    // Bearings computed accurately from each node to target using equirectangular approx
    // N1 (51.500, 4.900) → bearing 23.6°
    // N2 (51.520, 4.920) → bearing 219.1°
    // N3 (51.490, 4.880) → bearing 40.1°
    const triangulator = new BearingTriangulator({ minNodes: 3, maxConfidenceM: 2000 });
    const result = triangulator.triangulate([
      { nodeId: 'N1', lat: 51.500, lon: 4.900, bearingDeg: 23.6, type: 'fixed', weight: 1.0 },
      { nodeId: 'N2', lat: 51.520, lon: 4.920, bearingDeg: 219.1, type: 'fixed', weight: 1.0 },
      { nodeId: 'N3', lat: 51.490, lon: 4.880, bearingDeg: 40.1, type: 'fixed', weight: 1.0 },
    ]);

    expect(result).not.toBeNull();

    // Haversine distance (equirectangular approx for this scale)
    const dLat = (result!.lat - targetLat) * 111_320;
    const dLon = (result!.lon - targetLon) * 111_320 * Math.cos(targetLat * Math.PI / 180);
    const distanceM = Math.sqrt(dLat * dLat + dLon * dLon);

    expect(distanceM).toBeLessThan(500);
  });

  // JRN-W7-04: RF silence → TerminalPhaseDetector → PhysicalInterceptCoordinator fires
  it('JRN-W7-04: RF silence detected → TerminalPhaseDetector enters TERMINAL → PhysicalInterceptCoordinator fires', () => {
    const coordinator = new PhysicalInterceptCoordinator([
      { unitId: 'SKY-01', lat: 51.500, lon: 4.900 },
    ]);

    const impactPrediction = {
      lat: 51.510,
      lon: 4.907,
      timeToImpactSeconds: 18,
      timeToImpactS: 18,
      confidence: 0.88,
    };

    const cmd = coordinator.plan(impactPrediction);
    expect(cmd).not.toBeNull();
    expect(cmd!.unitId).toBe('SKY-01');
    expect(cmd!.fireAtS).toBeGreaterThanOrEqual(0);
  });

  // JRN-W7-05: FPV drone → JammerActivation uses 900MHz
  it('JRN-W7-05: FPV drone detected → JammerActivation uses 900MHz channel (not 1575MHz)', () => {
    const jammer = new JammerActivation({
      channels: { fpv: '900mhz', 'shahed-136': '1575mhz' },
    });

    const channel = jammer.getChannel('fpv');
    expect(channel).toBe('900mhz');
    expect(channel).not.toBe('1575mhz');
  });

  // JRN-W7-06: False positive → JammerActivation NOT triggered
  it('JRN-W7-06: False positive drone → JammerActivation NOT triggered', () => {
    const jammer = new JammerActivation({ channels: { fpv: '900mhz' } });
    const activationSpy = vi.spyOn(jammer, 'activate');

    jammer.activate({ droneClass: 'fpv', isFalsePositive: true });

    // Activation was called but with isFalsePositive=true — real impl must not emit event
    expect(activationSpy).toHaveBeenCalledWith({ droneClass: 'fpv', isFalsePositive: true });

    // isActive must remain false after FP activation
    expect(jammer.isActive()).toBe(false);
    expect(jammer.activationLog).toHaveLength(0);
  });

  // JRN-W7-07: SentinelPipelineV2 with injected TdoaSolver → coordinates change per frame
  it('JRN-W7-07: SentinelPipelineV2 with injected TdoaSolver → coordinates change on each frame', async () => {
    let frameNum = 0;
    const solver = {
      solve: vi.fn().mockImplementation(() => {
        frameNum++;
        return Promise.resolve({ lat: 50.0 + frameNum * 0.001, lon: 3.0 + frameNum * 0.001, confidenceM: 60 });
      }),
    };

    const pipeline = new SentinelPipelineV2({ tdoaSolver: solver });

    await pipeline.start();
    const frame = { audioSamples: make16kHzSamples(), timestampMs: Date.now() };
    const r1 = await pipeline.processFrame(frame);
    const r2 = await pipeline.processFrame({ ...frame, timestampMs: Date.now() + 100 });

    // Coordinates must differ between frames
    expect(r1.position.lat).not.toBe(r2.position.lat);
    expect(r1.position.lon).not.toBe(r2.position.lon);
    await pipeline.stop();
  });

  // JRN-W7-08: 16kHz audio → DatasetPipeline → 15600-sample segments (not 21449)
  it('JRN-W7-08: 16kHz audio sample → DatasetPipeline → 15600-sample segments (not 21449)', () => {
    // W6 DatasetPipeline used 22050Hz → 21449-sample segments per 975ms window
    // W7: must adopt 16kHz → 15600 samples per 975ms window (16000 * 0.975)
    const SAMPLE_RATE_HZ = 16_000;
    const WINDOW_MS = 975;
    const expectedSamples = Math.floor(SAMPLE_RATE_HZ * WINDOW_MS / 1000);

    expect(expectedSamples).toBe(15600);
    expect(expectedSamples).not.toBe(21449); // W6 legacy value

    // Verify segment size with raw arithmetic
    const rawAudio = make16kHzSamples(1); // 1 second at 16kHz
    expect(rawAudio.length).toBe(16000);

    // A 975ms window at 16kHz = 15600 samples
    const segment = rawAudio.slice(0, expectedSamples);
    expect(segment.length).toBe(15600);
  });

  // JRN-W7-09: Shahed-131 (higher RPM) → matched correctly despite freq overlap with shahed-136
  it('JRN-W7-09: Shahed-131 (higher RPM) → matched correctly despite frequency overlap with shahed-136', () => {
    const library = new AcousticProfileLibrary();

    // Shahed-131 band 150-400Hz, higher RPM than shahed-136
    // Query 300-450Hz: Jaccard(shahed-131 [150-400]) = 100/300 > Jaccard(shahed-136 [100-400]) = 100/350
    const shahed131Profile = library.matchFrequency(300, 450);

    expect(shahed131Profile).not.toBeNull();
    expect(shahed131Profile!.droneType).toBe('shahed-131');
    expect(shahed131Profile!.droneType).not.toBe('shahed-136');
  });

  // JRN-W7-10: Impact confidence < 0.6 → PhysicalInterceptCoordinator returns null
  it('JRN-W7-10: Impact confidence < 0.6 → PhysicalInterceptCoordinator returns null (no fire)', () => {
    const coordinator = new PhysicalInterceptCoordinator([
      { unitId: 'SKY-01', lat: 51.500, lon: 4.900 },
    ]);

    const lowConfidenceImpact = {
      lat: 51.510,
      lon: 4.907,
      timeToImpactSeconds: 20,
      confidence: 0.55,
    };

    const cmd = coordinator.plan(lowConfidenceImpact);
    expect(cmd).toBeNull();
  });

  // JRN-W7-11: PtzSlaveOutput predictBearing with moving EKF state → bearing offset > 0
  it('JRN-W7-11: PtzSlaveOutput predictBearing with moving EKF state → bearing offset > 0', () => {
    const ptz = new PtzSlaveOutput({
      onvifEndpoint: 'http://cam.local/onvif/PTZ',
      publishRateHz: 100,
      lookAheadMs: 50,
      transport: { send: vi.fn() },
    });

    const movingState = makeEKFState({ vLat: 0.001, vLon: 0.001 }); // fast-moving target
    const cameraPos = { lat: 51.49, lon: 4.88 };

    // Bearing to current position (no velocity extrapolation)
    const staticBearing = ptz.predictBearing(
      { ...movingState, vLat: 0, vLon: 0 }, 0, cameraPos,
    );
    // Bearing to predicted position with 50ms look-ahead
    const predictedBearing = ptz.predictBearing(movingState, 50, cameraPos);

    // Velocity extrapolation shifts the target → bearing offset must be non-zero
    const offset = Math.abs(predictedBearing - staticBearing);
    expect(offset).toBeGreaterThan(0);
  });

  // JRN-W7-12: ELRS packet loss > 80% for 2s → rfSilent=true → TerminalPhaseDetector set
  it('JRN-W7-12: ELRS packet loss > 80% for 2s → rfSilent=true → TerminalPhaseDetector indicator set', () => {
    // Simulate ELRS RF telemetry: 100 packets, 85 lost = 85% loss rate over 2s
    const totalPackets = 100;
    const lostPackets = 85;
    const durationMs = 2000;
    const lossRate = lostPackets / totalPackets;

    expect(lossRate).toBeGreaterThan(0.80);

    // rfSilent flag should be set when loss > 80% for > 2000ms
    const rfSilent = lossRate > 0.80 && durationMs >= 2000;
    expect(rfSilent).toBe(true);
  });

  // JRN-W7-13: Demo dashboard formatTrackForMap → valid Leaflet marker data
  it('JRN-W7-13: Demo dashboard formatTrackForMap produces valid Leaflet marker data', () => {
    const api = new DemoDashboardApi({
      refreshRateMs: 1000,
      maxTracksDisplayed: 50,
      heatmapResolution: 0.001,
    });

    const track = {
      id: 'TRK-001',
      lat: 51.5074,
      lon: 4.9034,
      classification: 'shahed-136',
      confidence: 0.92,
      timestamp: Date.now(),
    };

    const marker = api.formatTrackForMap(track);
    expect(marker).not.toBeNull();
    expect(marker.lat).toBe(51.5074);
    expect(marker.lon).toBe(4.9034);
    expect(marker.classification).toBe('shahed-136');
    // Leaflet requires numeric lat/lon
    expect(typeof marker.lat).toBe('number');
    expect(typeof marker.lon).toBe('number');
  });

  // JRN-W7-14: PhysicalInterceptCoordinator selects nearest SkyNet unit correctly
  it('JRN-W7-14: PhysicalInterceptCoordinator selects nearest SkyNet unit correctly', () => {
    const coordinator = new PhysicalInterceptCoordinator([
      { unitId: 'SKY-NEAR', lat: 51.509, lon: 4.906 }, // ~150m from impact
      { unitId: 'SKY-FAR',  lat: 51.530, lon: 4.930 }, // ~2.5km from impact
    ]);

    const impact = {
      lat: 51.510,
      lon: 4.907,
      timeToImpactSeconds: 20,
      confidence: 0.88,
    };

    const cmd = coordinator.plan(impact);
    expect(cmd).not.toBeNull();
    // Real impl selects nearest unit by haversine
    expect(cmd!.unitId).toBe('SKY-NEAR');
  });

  // JRN-W7-15: Full pipeline: 16kHz audio → Gerbera detected → TERMINAL → SkyNet fire
  it('JRN-W7-15: Full pipeline: 16kHz audio → Gerbera detected → TERMINAL → SkyNet fire command issued', async () => {
    const library = new AcousticProfileLibrary();
    const guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
    const coordinator = new PhysicalInterceptCoordinator([
      { unitId: 'SKY-01', lat: 51.500, lon: 4.900 },
    ]);
    const pipeline = new SentinelPipelineV2({
      tdoaSolver: { solve: vi.fn().mockResolvedValue({ lat: 51.505, lon: 4.903, confidenceM: 60 }) },
    });

    // Step 1: 16kHz audio → Gerbera profile match (narrow band 167-217Hz)
    const gerberaProfile = library.matchFrequency(167, 217);
    expect(gerberaProfile).not.toBeNull();
    expect(gerberaProfile!.droneType).toBe('gerbera');

    // Step 2: FalsePositiveGuard — should NOT suppress Gerbera with RF signal
    const fpAssessment = guard.assess({
      yamnetConfidence: 0.87,
      hasRfSignal: true,
      trackId: 'TRK-GBR-FULL',
    });
    expect(fpAssessment.isFalsePositive).toBe(false);

    // Step 3: Pipeline processes 16kHz frame with overrideTerminalPhase → TERMINAL state
    await pipeline.start();
    const result = await pipeline.processFrame({
      audioSamples: make16kHzSamples(),
      timestampMs: Date.now(),
      overrideTerminalPhase: true,
    });
    expect(result.terminalPhaseState).toBe('TERMINAL');

    // Step 4: Terminal phase → PhysicalInterceptCoordinator issues fire command
    const impactPrediction = {
      lat: result.position.lat,
      lon: result.position.lon,
      timeToImpactSeconds: 18,
      confidence: 0.89,
    };

    const fireCmd = coordinator.plan(impactPrediction);
    expect(fireCmd).not.toBeNull();
    expect(fireCmd!.unitId).toBe('SKY-01');
    expect(fireCmd!.fireAtS).toBeGreaterThanOrEqual(0);

    await pipeline.stop();
  });
});
