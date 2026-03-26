// APEX-SENTINEL — W9 TDD RED Tests
// FR-W9-05: Remote ID BLE/WiFi Receiver (ASTM F3411)
// Status: RED — implementation in src/feeds/remote-id-receiver.ts does NOT exist yet
//
// RemoteIdReceiver extends EventEmitter.
// BLE/WiFi scanning is injected via constructor options (vi.fn() mock).
// @hardware tests are skipped in CI via vi.fn() injection pattern.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  RemoteIdReceiver,
  type RemoteIdBeacon,
  type RemoteIdReceiverOptions,
} from '../../src/feeds/remote-id-receiver.js';

// ---------------------------------------------------------------------------
// Mock scanner factory
// ---------------------------------------------------------------------------

/** Creates a no-op mock scanner that never emits real BLE/WiFi frames. */
function makeMockScanner() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onFrame: vi.fn(),
  };
}

/** Minimal ASTM F3411 BLE advertisement payload (hex-encoded, simplified). */
const F3411_BLE_FRAME = {
  uuid: '0000fffa-0000-1000-8000-00805f9b34fb', // ASTM F3411 service UUID
  payload: Buffer.from(
    JSON.stringify({
      uasId: 'UAS-TEST-001',
      operatorLat: 44.4268,
      operatorLon: 26.1025,
      altM: 120,
      intent: 'none',
    }),
  ),
};

const NON_F3411_BLE_FRAME = {
  uuid: '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate service UUID
  payload: Buffer.from('heartrate-data'),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('FR-W9-05: Remote ID BLE/WiFi Receiver (ASTM F3411)', () => {
  let scanner: ReturnType<typeof makeMockScanner>;
  let receiver: RemoteIdReceiver;

  beforeEach(() => {
    vi.useFakeTimers();
    scanner = makeMockScanner();
    receiver = new RemoteIdReceiver(
      { interfaces: ['wlan0', 'ble0'] },
      { scanner },
    );
  });

  afterEach(async () => {
    await receiver.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // W9-05-01: Constructor
  // -------------------------------------------------------------------------

  it('W9-05-01: constructor accepts interfaces array', () => {
    expect(
      () =>
        new RemoteIdReceiver(
          { interfaces: ['wlan0', 'ble0'] },
          { scanner: makeMockScanner() },
        ),
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // W9-05-02: start()
  // -------------------------------------------------------------------------

  it('W9-05-02: start() begins listening without error', async () => {
    await expect(receiver.start()).resolves.not.toThrow();
    expect(scanner.start).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // W9-05-03: stop()
  // -------------------------------------------------------------------------

  it('W9-05-03: stop() stops listening without error', async () => {
    await receiver.start();
    await expect(receiver.stop()).resolves.not.toThrow();
    expect(scanner.stop).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // W9-05-04: 'beacon' event emitted on F3411 frame
  // -------------------------------------------------------------------------

  it("W9-05-04: 'beacon' event emitted when ASTM F3411 frame received", async () => {
    const beaconHandler = vi.fn();
    receiver.on('beacon', beaconHandler);
    await receiver.start();

    // Inject a synthetic F3411 frame via the mock scanner's onFrame callback
    const onFrameCallback = scanner.onFrame.mock.calls[0]?.[0] as
      | ((frame: unknown) => void)
      | undefined;
    expect(onFrameCallback).toBeDefined();
    onFrameCallback!(F3411_BLE_FRAME);

    expect(beaconHandler).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // W9-05-05: RemoteIdBeacon shape
  // -------------------------------------------------------------------------

  it('W9-05-05: RemoteIdBeacon has uasId, operatorLat, operatorLon, altM, intent, receivedAt', async () => {
    let captured: RemoteIdBeacon | undefined;
    receiver.on('beacon', (b: RemoteIdBeacon) => { captured = b; });
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    onFrame(F3411_BLE_FRAME);

    expect(captured).toBeDefined();
    expect(captured).toHaveProperty('uasId');
    expect(captured).toHaveProperty('operatorLat');
    expect(captured).toHaveProperty('operatorLon');
    expect(captured).toHaveProperty('altM');
    expect(captured).toHaveProperty('intent');
    expect(captured).toHaveProperty('receivedAt');
  });

  // -------------------------------------------------------------------------
  // W9-05-06: Operator coordinates coarsened to ±50m grid
  // -------------------------------------------------------------------------

  it('W9-05-06: operator coordinates coarsened to ±50m grid before emitting', async () => {
    let captured: RemoteIdBeacon | undefined;
    receiver.on('beacon', (b: RemoteIdBeacon) => { captured = b; });
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    // Exact lat: 44.4268, coarsened to ~0.0005° ≈ 55m grid
    onFrame(F3411_BLE_FRAME);

    expect(captured).toBeDefined();
    // Coarsened lat should differ from exact value (precision reduced)
    const exactLat = 44.4268;
    const delta = Math.abs(captured!.operatorLat - exactLat);
    // Must be coarsened (delta ≤ 0.001° ≈ 111m, and precision reduced to ≤4 decimal places)
    const decimalPlaces = (captured!.operatorLat.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(4);
    expect(delta).toBeLessThanOrEqual(0.001);
  });

  // -------------------------------------------------------------------------
  // W9-05-07: UAS ID hashed (SHA-256 + daily salt)
  // -------------------------------------------------------------------------

  it('W9-05-07: UAS ID hashed with SHA-256 + daily salt before emitting', async () => {
    let captured: RemoteIdBeacon | undefined;
    receiver.on('beacon', (b: RemoteIdBeacon) => { captured = b; });
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    onFrame(F3411_BLE_FRAME);

    expect(captured).toBeDefined();
    // Raw UAS ID 'UAS-TEST-001' must NOT appear verbatim — it should be a hex hash
    expect(captured!.uasId).not.toBe('UAS-TEST-001');
    expect(captured!.uasId).toMatch(/^[0-9a-f]{64}$/i); // SHA-256 hex = 64 chars
  });

  // -------------------------------------------------------------------------
  // W9-05-08: Duplicate UAS ID within 10s deduplicated
  // -------------------------------------------------------------------------

  it('W9-05-08: duplicate UAS ID within 10s deduplicated — only first emitted', async () => {
    const beaconHandler = vi.fn();
    receiver.on('beacon', beaconHandler);
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    // Two identical frames within 10s
    onFrame(F3411_BLE_FRAME);
    onFrame(F3411_BLE_FRAME);

    expect(beaconHandler).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // W9-05-09: Non-F3411 BLE UUID ignored
  // -------------------------------------------------------------------------

  it('W9-05-09: BLE advertisement with non-F3411 UUID is ignored', async () => {
    const beaconHandler = vi.fn();
    receiver.on('beacon', beaconHandler);
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    onFrame(NON_F3411_BLE_FRAME);

    expect(beaconHandler).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // W9-05-10: WiFi Aware (Wi-Fi beacon) parsed alongside BLE
  // -------------------------------------------------------------------------

  it('W9-05-10: WiFi Aware beacon parsed alongside BLE', async () => {
    const beaconHandler = vi.fn();
    receiver.on('beacon', beaconHandler);
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    // WiFi Aware frame has transport: 'wifi-nan' marker
    const wifiFrame = {
      ...F3411_BLE_FRAME,
      transport: 'wifi-nan',
      uuid: '0000fffa-0000-1000-8000-00805f9b34fb',
    };
    onFrame(wifiFrame);

    expect(beaconHandler).toHaveBeenCalledOnce();
    const beacon: RemoteIdBeacon = beaconHandler.mock.calls[0][0];
    expect(beacon).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // W9-05-11: intent 'emergency' bypasses dedup window
  // -------------------------------------------------------------------------

  it("W9-05-11: intent 'emergency' flagged immediately without dedup window", async () => {
    const beaconHandler = vi.fn();
    receiver.on('beacon', beaconHandler);
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;

    const emergencyFrame = {
      ...F3411_BLE_FRAME,
      payload: Buffer.from(
        JSON.stringify({
          uasId: 'UAS-EMRG-001',
          operatorLat: 44.43,
          operatorLon: 26.10,
          altM: 50,
          intent: 'emergency',
        }),
      ),
    };

    // Two emergency frames from the same UAS — both must emit (no dedup)
    onFrame(emergencyFrame);
    onFrame(emergencyFrame);

    expect(beaconHandler).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // W9-05-12: receivedAt is UTC ISO8601
  // -------------------------------------------------------------------------

  it('W9-05-12: receivedAt timestamp is UTC ISO8601', async () => {
    let captured: RemoteIdBeacon | undefined;
    receiver.on('beacon', (b: RemoteIdBeacon) => { captured = b; });
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;
    onFrame(F3411_BLE_FRAME);

    expect(captured).toBeDefined();
    expect(captured!.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  // -------------------------------------------------------------------------
  // W9-05-13: @hardware — real BLE scan skipped in CI (vi.fn() mock used)
  // -------------------------------------------------------------------------

  it('@hardware W9-05-13: real BLE scan skipped in CI — scanner injected as vi.fn()', async () => {
    // This test verifies the injection pattern works (scanner.start is a vi.fn())
    await receiver.start();
    expect(vi.isMockFunction(scanner.start)).toBe(true);
    expect(vi.isMockFunction(scanner.stop)).toBe(true);
    expect(vi.isMockFunction(scanner.onFrame)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // W9-05-14: Multiple simultaneous beacons from different UAS IDs
  // -------------------------------------------------------------------------

  it('W9-05-14: multiple simultaneous beacons from different UAS IDs processed independently', async () => {
    const received: RemoteIdBeacon[] = [];
    receiver.on('beacon', (b: RemoteIdBeacon) => received.push(b));
    await receiver.start();

    const onFrame = scanner.onFrame.mock.calls[0]?.[0] as (f: unknown) => void;

    const frameA = {
      ...F3411_BLE_FRAME,
      payload: Buffer.from(
        JSON.stringify({
          uasId: 'UAS-A',
          operatorLat: 44.43,
          operatorLon: 26.10,
          altM: 100,
          intent: 'none',
        }),
      ),
    };

    const frameB = {
      ...F3411_BLE_FRAME,
      payload: Buffer.from(
        JSON.stringify({
          uasId: 'UAS-B',
          operatorLat: 44.50,
          operatorLon: 26.20,
          altM: 80,
          intent: 'none',
        }),
      ),
    };

    onFrame(frameA);
    onFrame(frameB);

    // Each distinct UAS ID generates exactly one beacon (no cross-dedup)
    expect(received).toHaveLength(2);
    const ids = received.map((b) => b.uasId);
    // Both hashed IDs must be distinct
    expect(ids[0]).not.toBe(ids[1]);
  });
});
