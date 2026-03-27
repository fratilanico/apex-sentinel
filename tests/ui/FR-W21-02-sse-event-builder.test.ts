// APEX-SENTINEL — W21 Production Operator UI
// FR-W21-02 | tests/ui/FR-W21-02-sse-event-builder.test.ts
// SSE event builder — 8 tests

import { describe, it, expect } from 'vitest';
import type { ApiAlertItem, ApiAircraftItem, ApiDashboardSummary } from '../../src/ui/api-transformers.js';
import {
  formatSseEvent,
  buildAlertNewEvent,
  buildAlertUpdatedEvent,
  buildAircraftUpdateEvent,
  buildAwningChangeEvent,
  buildSnapshotEvent,
} from '../../src/ui/sse-event-builder.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeApiAlert(overrides: Partial<ApiAlertItem> = {}): ApiAlertItem {
  return {
    alertId: 'alert-001',
    zoneId: 'zone-otopeni',
    zoneType: 'airport',
    awningLevel: 'RED',
    status: 'NEW',
    detectedAt: new Date().toISOString(),
    slaAckRemainingMs: 45_000,
    slaResolveRemainingMs: 1_700_000,
    aacrRequired: true,
    ...overrides,
  };
}

function makeApiAircraft(overrides: Partial<ApiAircraftItem> = {}): ApiAircraftItem {
  return {
    icao24: 'abc123',
    callsign: 'RYR401',
    lat: 44.5,
    lng: 26.1,
    altitudeM: 1200,
    groundSpeedKt: 97.2,
    trackDeg: 270,
    verticalRateMs: 0,
    squawk: null,
    onGround: false,
    lastSeenAt: new Date().toISOString(),
    threatScore: 0.8,
    droneCategory: null,
    isConventionalAircraft: true,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ApiDashboardSummary> = {}): ApiDashboardSummary {
  return {
    activeAlerts: 3,
    newAlerts: 1,
    activeIncidents: 1,
    worstAwningLevel: 'RED',
    feedsHealthy: 4,
    feedsTotal: 5,
    aircraftTracked: 12,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FR-W21-02: SSE Event Builder
// ---------------------------------------------------------------------------

describe('FR-W21-02: SSE Event Builder', () => {
  it('01: formatSseEvent with event+data → correct SSE string format', () => {
    const result = formatSseEvent({ event: 'alert_new', data: '{"alertId":"a1"}' });
    expect(result).toContain('event: alert_new\n');
    expect(result).toContain('data: {"alertId":"a1"}\n');
  });

  it('02: formatSseEvent includes trailing double newline', () => {
    const result = formatSseEvent({ event: 'test', data: '{}' });
    expect(result.endsWith('\n\n')).toBe(true);
  });

  it('03: formatSseEvent with id field → includes id line', () => {
    const result = formatSseEvent({ event: 'test', data: '{}', id: 'evt-123' });
    expect(result).toContain('id: evt-123\n');
  });

  it('04: buildAlertNewEvent.event = "alert_new"', () => {
    const alert = makeApiAlert();
    const evt = buildAlertNewEvent(alert);
    expect(evt.event).toBe('alert_new');
  });

  it('05: buildAlertUpdatedEvent.data contains alertId', () => {
    const evt = buildAlertUpdatedEvent('alert-001', { status: 'ACKNOWLEDGED' });
    const parsed = JSON.parse(evt.data);
    expect(parsed.alertId).toBe('alert-001');
  });

  it('06: buildAircraftUpdateEvent.event = "aircraft_update"', () => {
    const ac = makeApiAircraft();
    const evt = buildAircraftUpdateEvent(ac);
    expect(evt.event).toBe('aircraft_update');
  });

  it('07: buildAwningChangeEvent.data contains zoneId, level, previousLevel', () => {
    const evt = buildAwningChangeEvent('zone-otopeni', 'RED', 'ORANGE');
    const parsed = JSON.parse(evt.data);
    expect(parsed.zoneId).toBe('zone-otopeni');
    expect(parsed.level).toBe('RED');
    expect(parsed.previousLevel).toBe('ORANGE');
  });

  it('08: buildSnapshotEvent.event = "snapshot"', () => {
    const summary = makeSummary();
    const evt = buildSnapshotEvent(summary);
    expect(evt.event).toBe('snapshot');
  });
});
