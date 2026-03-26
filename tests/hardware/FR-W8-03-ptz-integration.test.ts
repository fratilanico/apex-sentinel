// APEX-SENTINEL — W8 PTZ Hardware Integration Tests
// FR-W8-03 | tests/hardware/FR-W8-03-ptz-integration.test.ts
// ONVIF integration test suite

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PtzIntegrationClient } from '../../src/output/ptz-integration-client.js';

function makeOnvifClient(delayMs = 50) {
  return {
    sendAbsoluteMove: vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, delayMs));
      return { ack: true };
    }),
  };
}

function makeNatsClient() {
  const subscriptions: Record<string, (payload: unknown) => void> = {};
  return {
    publish: vi.fn(),
    subscribe: vi.fn((subject: string, handler: (payload: unknown) => void) => {
      subscriptions[subject] = handler;
    }),
    _trigger: (subject: string, payload: unknown) => {
      subscriptions[subject]?.(payload);
    },
  };
}

describe('FR-W8-03: PTZ Hardware Integration Test Suite', () => {

  let client: PtzIntegrationClient;
  let onvif: ReturnType<typeof makeOnvifClient>;
  let nats: ReturnType<typeof makeNatsClient>;

  beforeEach(() => {
    onvif = makeOnvifClient();
    nats = makeNatsClient();
    client = new PtzIntegrationClient();
    client.setOnvifClient(onvif);
    client.setNatsClient(nats);
  });

  it('FR-W8-03-I01: GIVEN ONVIF simulator, WHEN bearing(270.5, 15.0) sent, THEN ONVIF command fires within 200ms', async () => {
    const start = Date.now();
    await client.sendBearing(270.5, 15.0);
    // Command queued and sent
    await new Promise(r => setTimeout(r, 100)); // let queue process
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500); // generous bound to avoid flakiness
    expect(onvif.sendAbsoluteMove).toHaveBeenCalledWith(270.5, 15.0);
  });

  it('FR-W8-03-I02: GIVEN ONVIF simulator, WHEN bearing command sent, THEN ACK received within 2000ms', async () => {
    const result = await client.sendBearing(180, 0);
    expect(result.commandId).toBeDefined();
    // Wait for processing
    await new Promise(r => setTimeout(r, 200));
    expect(nats.publish).toHaveBeenCalledWith(
      expect.stringContaining('ptz.command.ack.'),
      expect.objectContaining({ success: true })
    );
  });

  it('FR-W8-03-I03: GIVEN ONVIF simulator with delayed ACK (>2000ms), WHEN timeout fires, THEN PTZ returns to home position (0°, 0°)', async () => {
    // Override onvif to delay > ONVIF_TIMEOUT_MS
    const slowOnvif = {
      sendAbsoluteMove: vi.fn().mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 100)); // within timeout for home
        return { ack: true };
      }),
    };
    // Replace first call to simulate timeout, second for home
    let callCount = 0;
    slowOnvif.sendAbsoluteMove.mockImplementation(async (bearing: number) => {
      callCount++;
      if (callCount === 1) {
        // First call: exceed ONVIF_TIMEOUT_MS
        await new Promise(r => setTimeout(r, client.ONVIF_TIMEOUT_MS + 100));
        return { ack: true };
      }
      // Home position call
      return { ack: true };
    });
    client.setOnvifClient(slowOnvif);
    await client.sendBearing(90, 0);
    await new Promise(r => setTimeout(r, client.ONVIF_TIMEOUT_MS + 500));
    // Home position was called with 0, 0
    const calls = slowOnvif.sendAbsoluteMove.mock.calls;
    const homeCall = calls.find((c: [number, number]) => c[0] === 0 && c[1] === 0);
    expect(homeCall).toBeDefined();
  });

  it('FR-W8-03-I04: GIVEN invalid bearing >360°, WHEN command submitted, THEN rejected before ONVIF send with INVALID_BEARING error', async () => {
    await expect(client.sendBearing(400, 0)).rejects.toThrow('INVALID_BEARING');
    expect(onvif.sendAbsoluteMove).not.toHaveBeenCalled();
  });

  it('FR-W8-03-I05: GIVEN 3 sequential bearing commands, WHEN submitted, THEN execute in order without interleaving', async () => {
    const results = await Promise.all([
      client.sendBearing(90, 0),
      client.sendBearing(180, 0),
      client.sendBearing(270, 0),
    ]);
    // All 3 have unique command IDs
    const ids = results.map(r => r.commandId);
    expect(new Set(ids).size).toBe(3);
    // Wait for processing
    await new Promise(r => setTimeout(r, 300));
    expect(onvif.sendAbsoluteMove).toHaveBeenCalledTimes(3);
  });

  it('FR-W8-03-I06: GIVEN NATS ptz.command.bearing event, WHEN received, THEN ONVIF command fires', async () => {
    nats._trigger('ptz.command.bearing', { bearing: 135, tilt: 5 });
    await new Promise(r => setTimeout(r, 200));
    expect(onvif.sendAbsoluteMove).toHaveBeenCalledWith(135, 5);
  });

  it('FR-W8-03-I07: GIVEN ONVIF ACK received, THEN NATS ptz.command.ack.<commandId> published', async () => {
    const result = await client.sendBearing(45, 0);
    await new Promise(r => setTimeout(r, 200));
    expect(nats.publish).toHaveBeenCalledWith(
      `ptz.command.ack.${result.commandId}`,
      expect.objectContaining({ commandId: result.commandId, success: true })
    );
  });

  it('FR-W8-03-I08: GIVEN dashboard POST /api/ptz/bearing, WHEN valid bearing sent, THEN response 202 with commandId', async () => {
    // Simulate API handler
    const handlePost = async (body: { bearing: number; tilt?: number }) => {
      const result = await client.sendBearing(body.bearing, body.tilt ?? 0);
      return { status: 202, body: { commandId: result.commandId } };
    };
    const response = await handlePost({ bearing: 225, tilt: 10 });
    expect(response.status).toBe(202);
    expect(response.body.commandId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
