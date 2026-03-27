// APEX-SENTINEL — W21 Production Operator UI
// FR-W21-01 | tests/ui/FR-W21-01-api-transformers.test.ts
// Pure TypeScript API response transformers — 20 tests

import { describe, it, expect } from 'vitest';
import type { AircraftState } from '../../src/feeds/types.js';
import type { Alert, Incident } from '../../src/workflow/types.js';
import {
  transformAircraftState,
  transformAlert,
  transformZoneHealth,
  awningToColour,
  transformFeedHealth,
  transformIncident,
  formatSlaCountdown,
  buildDashboardSummary,
} from '../../src/ui/api-transformers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAircraft(overrides: Partial<AircraftState> = {}): AircraftState {
  return {
    icao24: 'abc123',
    callsign: 'RYR401',
    lat: 44.5,
    lon: 26.1,
    altitudeM: 1200,
    velocityMs: 50,
    headingDeg: 270,
    onGround: false,
    timestampMs: 1_711_000_000_000,
    source: 'opensky',
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  const now = 1_711_000_000_000;
  return {
    alertId: 'alert-001',
    correlationId: 'corr-001',
    status: 'NEW',
    zoneId: 'zone-otopeni',
    zoneType: 'airport',
    awningLevel: 'RED',
    detectedAt: now,
    slaAckDeadline: now + 60_000,
    slaResolveDeadline: now + 1_800_000,
    transitions: [],
    aacrNotificationRequired: true,
    ...overrides,
  };
}

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    incidentId: 'inc-001',
    zoneId: 'zone-otopeni',
    status: 'OPEN',
    alertIds: ['alert-001', 'alert-002'],
    maxAwningLevel: 'RED',
    openedAt: 1_711_000_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FR-W21-01: transformAircraftState
// ---------------------------------------------------------------------------

describe('FR-W21-01: API Transformers', () => {
  describe('transformAircraftState', () => {
    it('01: maps all fields correctly', () => {
      const ac = makeAircraft();
      const result = transformAircraftState(ac, 0.75);
      expect(result.icao24).toBe('abc123');
      expect(result.callsign).toBe('RYR401');
      expect(result.lat).toBe(44.5);
      expect(result.altitudeM).toBe(1200);
      expect(result.onGround).toBe(false);
      expect(result.squawk).toBeNull();
      expect(result.threatScore).toBe(0.75);
      expect(result.lastSeenAt).toBe(new Date(1_711_000_000_000).toISOString());
    });

    it('02: lng uses aircraft.lon (aliased)', () => {
      const ac = makeAircraft({ lon: 26.1 });
      const result = transformAircraftState(ac);
      expect(result.lng).toBe(26.1);
    });

    it('03: groundSpeedKt = velocityMs * 1.944', () => {
      const ac = makeAircraft({ velocityMs: 50 });
      const result = transformAircraftState(ac);
      expect(result.groundSpeedKt).toBeCloseTo(50 * 1.944, 3);
    });

    it('04: droneCategory set to category string when non-null', () => {
      const ac = makeAircraft({ transponderMode: 'cat-b-modified' });
      const result = transformAircraftState(ac);
      expect(result.droneCategory).toBe('cat-b-modified');
    });

    it('05: isConventionalAircraft=true when cooperativeContact=true (transponderMode present)', () => {
      // transponderMode present and not a drone category → cooperative
      const ac = makeAircraft({ transponderMode: 'MODE_S' });
      const result = transformAircraftState(ac);
      expect(result.isConventionalAircraft).toBe(true);
    });

    it('06: isConventionalAircraft=false when cooperativeContact=false (no transponderMode)', () => {
      const ac = makeAircraft({ transponderMode: undefined });
      const result = transformAircraftState(ac);
      expect(result.isConventionalAircraft).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // FR-W21-01: transformAlert
  // ---------------------------------------------------------------------------

  describe('transformAlert', () => {
    it('07: maps status, zoneId, awningLevel', () => {
      const alert = makeAlert();
      const result = transformAlert(alert, 1_711_000_000_000);
      expect(result.status).toBe('NEW');
      expect(result.zoneId).toBe('zone-otopeni');
      expect(result.awningLevel).toBe('RED');
    });

    it('08: detectedAt is ISO string', () => {
      const alert = makeAlert();
      const result = transformAlert(alert, 1_711_000_000_000);
      expect(result.detectedAt).toBe(new Date(1_711_000_000_000).toISOString());
    });

    it('09: slaAckRemainingMs = alert.slaAckDeadline - nowMs', () => {
      const now = 1_711_000_000_000;
      const alert = makeAlert({ slaAckDeadline: now + 60_000 });
      const result = transformAlert(alert, now);
      expect(result.slaAckRemainingMs).toBe(60_000);
    });

    it('10: slaResolveRemainingMs = alert.slaResolveDeadline - nowMs', () => {
      const now = 1_711_000_000_000;
      const alert = makeAlert({ slaResolveDeadline: now + 1_800_000 });
      const result = transformAlert(alert, now);
      expect(result.slaResolveRemainingMs).toBe(1_800_000);
    });
  });

  // ---------------------------------------------------------------------------
  // FR-W21-01: awningToColour
  // ---------------------------------------------------------------------------

  describe('awningToColour', () => {
    it('11: returns correct hex for each level', () => {
      expect(awningToColour('GREEN')).toBe('#22c55e');
      expect(awningToColour('YELLOW')).toBe('#eab308');
      expect(awningToColour('ORANGE')).toBe('#f97316');
      expect(awningToColour('RED')).toBe('#ef4444');
    });

    it('12: returns grey (#6b7280) for CLEAR/unknown', () => {
      expect(awningToColour('CLEAR')).toBe('#6b7280');
      expect(awningToColour('UNKNOWN')).toBe('#6b7280');
      expect(awningToColour('')).toBe('#6b7280');
    });
  });

  // ---------------------------------------------------------------------------
  // FR-W21-01: transformZoneHealth
  // ---------------------------------------------------------------------------

  describe('transformZoneHealth', () => {
    it('13: awningColour matches awningToColour output', () => {
      const zone = { id: 'z1', name: 'Otopeni', lat: 44.5, lon: 26.1, radiusKm: 5, type: 'airport' };
      const result = transformZoneHealth(zone, 'RED', 3, 0.9);
      expect(result.awningColour).toBe(awningToColour('RED'));
      expect(result.zoneId).toBe('z1');
      expect(result.activeAlerts).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // FR-W21-01: transformFeedHealth
  // ---------------------------------------------------------------------------

  describe('transformFeedHealth', () => {
    it('14: statusColour: healthy→green, degraded→yellow, down→red', () => {
      expect(transformFeedHealth({ feedId: 'f1', status: 'healthy' }).statusColour).toBe('green');
      expect(transformFeedHealth({ feedId: 'f2', status: 'degraded' }).statusColour).toBe('yellow');
      expect(transformFeedHealth({ feedId: 'f3', status: 'down' }).statusColour).toBe('red');
    });
  });

  // ---------------------------------------------------------------------------
  // FR-W21-01: formatSlaCountdown
  // ---------------------------------------------------------------------------

  describe('formatSlaCountdown', () => {
    it('15: returns BREACHED for negative values', () => {
      expect(formatSlaCountdown(-1)).toBe('BREACHED');
      expect(formatSlaCountdown(0)).toBe('BREACHED');
    });

    it('16: returns "45s" for 45000ms', () => {
      expect(formatSlaCountdown(45_000)).toBe('45s');
    });

    it('17: returns "2m 30s" for 150000ms', () => {
      expect(formatSlaCountdown(150_000)).toBe('2m 30s');
    });
  });

  // ---------------------------------------------------------------------------
  // FR-W21-01: buildDashboardSummary
  // ---------------------------------------------------------------------------

  describe('buildDashboardSummary', () => {
    it('18: activeAlerts counts non-ARCHIVED/RESOLVED alerts', () => {
      const alerts: Alert[] = [
        makeAlert({ status: 'NEW' }),
        makeAlert({ alertId: 'a2', status: 'ACKNOWLEDGED' }),
        makeAlert({ alertId: 'a3', status: 'RESOLVED' }),
        makeAlert({ alertId: 'a4', status: 'ARCHIVED' }),
      ];
      const result = buildDashboardSummary(alerts, [], {}, [], 0);
      expect(result.activeAlerts).toBe(2);
    });

    it('19: worstAwningLevel = RED when any zone is RED', () => {
      const awningLevels = { 'zone-a': 'GREEN', 'zone-b': 'RED', 'zone-c': 'YELLOW' };
      const result = buildDashboardSummary([], [], awningLevels, [], 0);
      expect(result.worstAwningLevel).toBe('RED');
    });

    it('20: feedsHealthy counts feeds with status="healthy"', () => {
      const feeds = [
        { feedId: 'f1', status: 'healthy' },
        { feedId: 'f2', status: 'healthy' },
        { feedId: 'f3', status: 'down' },
      ];
      const result = buildDashboardSummary([], [], {}, feeds, 0);
      expect(result.feedsHealthy).toBe(2);
      expect(result.feedsTotal).toBe(3);
    });
  });
});
