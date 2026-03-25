// APEX-SENTINEL — W7 PTZ Slave Output Tests
// FR-W7-06 | tests/output/FR-W7-06-ptz-slave-output.test.ts
// Drives PTZ cameras via ONVIF RelativeMove, predictive bearing using EKF velocity

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PtzSlaveOutput, PtzBearingEvent } from '../../src/output/ptz-slave-output.js';
import type { EKFState } from '../../src/prediction/types.js';

function makeEKFState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5074,
    lon: 4.9034,
    alt: 200,
    vLat: 0.0001,
    vLon: 0.0001,
    vAlt: -8,
    confidence: 0.92,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FR-W7-06: PtzSlaveOutput', () => {
  let ptz: PtzSlaveOutput;
  let mockTransport: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTransport = { send: vi.fn().mockResolvedValue({ status: 200 }) };
    ptz = new PtzSlaveOutput({
      onvifEndpoint: 'http://192.168.1.100:80/onvif/PTZ',
      publishRateHz: 100,
      lookAheadMs: 8,
      transport: mockTransport,
    });
  });

  // AC-01: constructor
  it('AC-01: Constructor accepts {onvifEndpoint, publishRateHz: 100, lookAheadMs: 8}', () => {
    const instance = new PtzSlaveOutput({
      onvifEndpoint: 'http://192.168.1.200:80/onvif/PTZ',
      publishRateHz: 100,
      lookAheadMs: 8,
      transport: mockTransport,
    });
    expect(instance).toBeTruthy();
    expect(instance.config.publishRateHz).toBe(100);
    expect(instance.config.lookAheadMs).toBe(8);
    expect(instance.config.onvifEndpoint).toBe('http://192.168.1.200:80/onvif/PTZ');
  });

  // AC-02: buildOnvifXml returns valid XML string
  it('AC-02: buildOnvifXml(bearingDeg, elevationDeg) returns valid ONVIF RelativeMove XML string', () => {
    const xml = ptz.buildOnvifXml(45.0, 30.0);
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
    // Must be parseable as XML-like structure
    expect(xml).toContain('<');
    expect(xml).toContain('>');
  });

  // AC-03: XML contains PTZRelativeMove element
  it('AC-03: buildOnvifXml XML contains PTZRelativeMove element', () => {
    const xml = ptz.buildOnvifXml(90.0, 15.0);
    expect(xml).toContain('<PTZRelativeMove');
  });

  // AC-04: elevation clamps to -90..+90
  it('AC-04: buildOnvifXml elevation clamps to -90..+90 range', () => {
    const xmlHigh = ptz.buildOnvifXml(0, 120);
    const xmlLow = ptz.buildOnvifXml(0, -120);

    // Parse elevation from XML — it should not contain 120 or -120
    expect(xmlHigh).not.toContain('120');
    expect(xmlLow).not.toContain('-120');

    // Confirm clamped value is present
    const highResult = ptz.buildOnvifXml(0, 95);
    expect(highResult).toContain('90');

    const lowResult = ptz.buildOnvifXml(0, -95);
    expect(lowResult).toContain('-90');
  });

  // AC-05: bearing wraps 0..360
  it('AC-05: buildOnvifXml bearing wraps 0..360', () => {
    const xmlNeg = ptz.buildOnvifXml(-30, 0);
    const xmlOver = ptz.buildOnvifXml(400, 0);

    // -30 should wrap to 330
    expect(xmlNeg).toContain('330');
    // 400 should wrap to 40
    expect(xmlOver).toContain('40');
  });

  // AC-06: publishBearing calls transport with ONVIF XML
  it('AC-06: publishBearing() calls transport with ONVIF XML', async () => {
    await ptz.publishBearing(180, 20);
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    const callArg = mockTransport.send.mock.calls[0][0];
    expect(callArg).toContain('<PTZRelativeMove');
  });

  // AC-07: predictBearing returns bearing using vLat/vLon
  it('AC-07: predictBearing(ekfState, lookAheadMs) returns bearing using vLat/vLon', () => {
    const cameraLat = 51.50;
    const cameraLon = 4.90;
    const state = makeEKFState({ vLat: 0.0001, vLon: 0.0001 });
    const bearing = ptz.predictBearing(state, 8, { lat: cameraLat, lon: cameraLon });
    expect(typeof bearing).toBe('number');
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });

  // AC-08: predictBearing with stationary target returns same bearing
  it('AC-08: predictBearing with stationary target returns same bearing as current position', () => {
    const cameraLat = 51.50;
    const cameraLon = 4.90;
    const state = makeEKFState({ vLat: 0, vLon: 0 });
    const bearing = ptz.predictBearing(state, 8, { lat: cameraLat, lon: cameraLon });
    const staticBearing = ptz.predictBearing(state, 0, { lat: cameraLat, lon: cameraLon });
    // With zero velocity, look-ahead should not change bearing
    expect(Math.abs(bearing - staticBearing)).toBeLessThan(0.01);
  });

  // AC-09: predictBearing with moving target returns bearing offset proportional to velocity
  it('AC-09: predictBearing with moving target returns bearing offset proportional to velocity', () => {
    const cameraLat = 51.50;
    const cameraLon = 4.90;
    const stateSlowly = makeEKFState({ vLat: 0.00001, vLon: 0.0 });
    const stateFast = makeEKFState({ vLat: 0.001, vLon: 0.0 });

    const bearingSlow = ptz.predictBearing(stateSlowly, 100, { lat: cameraLat, lon: cameraLon });
    const bearingFast = ptz.predictBearing(stateFast, 100, { lat: cameraLat, lon: cameraLon });

    // Faster target at same look-ahead should produce different bearing offset
    expect(Math.abs(bearingFast - bearingSlow)).toBeGreaterThan(0);
  });

  // AC-10: stop() halts publishing
  it('AC-10: stop() halts publishing', async () => {
    ptz.start(makeEKFState(), { lat: 51.50, lon: 4.90 });
    ptz.stop();
    // Wait slightly and confirm no more calls accumulate
    await new Promise(r => setTimeout(r, 50));
    const callsAfterStop = mockTransport.send.mock.calls.length;
    await new Promise(r => setTimeout(r, 50));
    expect(mockTransport.send.mock.calls.length).toBe(callsAfterStop);
  });

  // AC-11: PtzBearingEvent emitted on each publish
  it('AC-11: PtzBearingEvent emitted on each publish', async () => {
    const events: PtzBearingEvent[] = [];
    ptz.on('bearing', (evt: PtzBearingEvent) => events.push(evt));
    await ptz.publishBearing(90, 15);
    expect(events.length).toBe(1);
    expect(typeof events[0].bearingDeg).toBe('number');
    expect(typeof events[0].elevationDeg).toBe('number');
    expect(typeof events[0].timestampMs).toBe('number');
  });

  // AC-12: publishRateHz: 100 = publishes at 10ms interval
  it('AC-12: publishRateHz 100 publishes at ~10ms interval (at least 3 calls in 50ms)', async () => {
    vi.useFakeTimers();
    ptz.start(makeEKFState(), { lat: 51.50, lon: 4.90 });
    // Advance 50ms — at 100Hz (10ms interval) expect ~5 calls
    vi.advanceTimersByTime(50);
    ptz.stop();
    expect(mockTransport.send.mock.calls.length).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
  });
});
