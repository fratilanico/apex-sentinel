// APEX-SENTINEL — W8 PTZ Hardware Integration Tests
// FR-W8-03 | tests/hardware/FR-W8-03-ptz-integration.test.ts
// TDD RED phase — ONVIF integration test suite (vs simulator)

import { describe, it, expect } from 'vitest';

// PtzIntegrationClient does not exist yet — RED
// import { PtzIntegrationClient } from '../../src/output/ptz-integration-client.js';

describe('FR-W8-03: PTZ Hardware Integration Test Suite', () => {

  it.todo('FR-W8-03-I01: GIVEN ONVIF simulator, WHEN bearing(270.5, 15.0) sent, THEN ONVIF command fires within 200ms');

  it.todo('FR-W8-03-I02: GIVEN ONVIF simulator, WHEN bearing command sent, THEN ACK received within 2000ms');

  it.todo('FR-W8-03-I03: GIVEN ONVIF simulator with delayed ACK (>2000ms), WHEN timeout fires, THEN PTZ returns to home position (0°, 0°)');

  it.todo('FR-W8-03-I04: GIVEN invalid bearing >360°, WHEN command submitted, THEN rejected before ONVIF send with INVALID_BEARING error');

  it.todo('FR-W8-03-I05: GIVEN 3 sequential bearing commands, WHEN submitted, THEN execute in order without interleaving');

  it.todo('FR-W8-03-I06: GIVEN NATS ptz.command.bearing event, WHEN received, THEN ONVIF command fires');

  it.todo('FR-W8-03-I07: GIVEN ONVIF ACK received, THEN NATS ptz.command.ack.<commandId> published');

  it.todo('FR-W8-03-I08: GIVEN dashboard POST /api/ptz/bearing, WHEN valid bearing sent, THEN response 202 with commandId');
});
