// FR-W19-06: AacrNotificationFormatter — TDD RED
// src/intel/aacr-notification-formatter.ts does NOT exist yet — all tests will fail

import { describe, it, expect, afterEach, vi } from 'vitest';
import { AacrNotificationFormatter } from '../../src/intel/aacr-notification-formatter.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type BreachType = 'INSIDE' | 'ENTERING' | 'APPROACHING';

interface ZoneBreach {
  zoneId: string;
  breachType: BreachType;
  distanceM: number;
  ttBreachS?: number | null;
  firstDetectedAt: string;
  aircraftIcao24: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface AacrNotification {
  incidentId: string;
  timestampUtc: string;
  locationIcao: string;
  aircraftCategory: string;
  awningLevel: AwningLevel;
  recommendedAction: string;
  operatorConfirmationRequired: boolean;
  cncanEscalationRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Zone fixtures
// ---------------------------------------------------------------------------
const LROP_ZONE = {
  id: 'RO-LROP-EXCLUSION',
  name: 'Henri Coandă Airport',
  type: 'airport' as const,
  icaoCode: 'LROP',
  lat: 44.5713,
  lon: 26.0849,
  radiusKm: 5,
};

const LRCL_ZONE = {
  id: 'RO-LRCL-EXCLUSION',
  name: 'Cluj-Napoca Airport',
  type: 'airport' as const,
  icaoCode: 'LRCL',
  lat: 46.7852,
  lon: 23.6862,
  radiusKm: 5,
};

const CERNAVODA_ZONE = {
  id: 'RO-NUCLEAR-CND',
  name: 'Cernavodă Nuclear',
  type: 'nuclear' as const,
  icaoCode: undefined,
  lat: 44.3267,
  lon: 28.0606,
  radiusKm: 10,
};

const MILITARY_ZONE = {
  id: 'RO-MIL-001',
  name: 'Military Zone Alpha',
  type: 'military' as const,
  icaoCode: undefined,
  lat: 45.0,
  lon: 25.0,
  radiusKm: 8,
};

function makeBreach(overrides: Partial<ZoneBreach> = {}): ZoneBreach {
  return {
    zoneId: 'RO-LROP-EXCLUSION',
    breachType: 'INSIDE',
    distanceM: 500,
    ttBreachS: null,
    firstDetectedAt: '2026-03-27T14:00:00.000Z',
    aircraftIcao24: 'ROA001',
    severity: 'HIGH',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-06: AacrNotificationFormatter', () => {
  // 06-01: ORANGE AWNING for LROP → notification with all 7 SIRA fields
  it('06-01: ORANGE AWNING for LROP → notification with all 7 SIRA fields', () => {
    const formatter = new AacrNotificationFormatter();
    const breach = makeBreach();
    const notifications: AacrNotification[] = formatter.format(breach, 'ORANGE', LROP_ZONE);
    expect(notifications).toHaveLength(1);
    const n = notifications[0];
    expect(n).toHaveProperty('incidentId');
    expect(n).toHaveProperty('timestampUtc');
    expect(n.locationIcao).toBe('LROP');
    expect(n).toHaveProperty('aircraftCategory');
    expect(n.awningLevel).toBe('ORANGE');
    expect(n).toHaveProperty('recommendedAction');
    expect(n.operatorConfirmationRequired).toBe(true);
  });

  // 06-02: notification.timestampUtc = breach.firstDetectedAt (not generation time)
  it('06-02: timestampUtc matches breach.firstDetectedAt (not generation time)', () => {
    const formatter = new AacrNotificationFormatter();
    const breach = makeBreach({ firstDetectedAt: '2026-01-15T08:30:00.000Z' });
    const notifications: AacrNotification[] = formatter.format(breach, 'ORANGE', LROP_ZONE);
    expect(notifications[0].timestampUtc).toBe('2026-01-15T08:30:00.000Z');
  });

  // 06-03: RED AWNING for Cernavodă nuclear → cncanEscalationRequired=true
  it('06-03: RED AWNING for nuclear zone → cncanEscalationRequired=true', () => {
    const formatter = new AacrNotificationFormatter();
    const breach = makeBreach({ zoneId: 'RO-NUCLEAR-CND', severity: 'CRITICAL' });
    const notifications: AacrNotification[] = formatter.format(breach, 'RED', CERNAVODA_ZONE);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].cncanEscalationRequired).toBe(true);
  });

  // 06-04: GREEN or YELLOW AWNING → empty array
  it('06-04: GREEN AWNING → empty array', () => {
    const formatter = new AacrNotificationFormatter();
    const breach = makeBreach();
    expect(formatter.format(breach, 'GREEN', LROP_ZONE)).toHaveLength(0);
  });

  it('06-04b: YELLOW AWNING → empty array', () => {
    const formatter = new AacrNotificationFormatter();
    const breach = makeBreach();
    expect(formatter.format(breach, 'YELLOW', LROP_ZONE)).toHaveLength(0);
  });

  // 06-05: multiple zones: ORANGE at LROP, YELLOW at LRCL → only LROP notification
  it('06-05: ORANGE at LROP, YELLOW at LRCL → only LROP notification returned', () => {
    const formatter = new AacrNotificationFormatter();
    const breachLROP = makeBreach({ zoneId: 'RO-LROP-EXCLUSION' });
    const breachLRCL = makeBreach({ zoneId: 'RO-LRCL-EXCLUSION' });

    const notifLROP = formatter.format(breachLROP, 'ORANGE', LROP_ZONE);
    const notifLRCL = formatter.format(breachLRCL, 'YELLOW', LRCL_ZONE);

    expect(notifLROP).toHaveLength(1);
    expect(notifLRCL).toHaveLength(0); // YELLOW = no notification
  });

  // 06-06: incidentId is non-empty string
  it('06-06: incidentId is non-empty string', () => {
    const formatter = new AacrNotificationFormatter();
    const notifications = formatter.format(makeBreach(), 'ORANGE', LROP_ZONE);
    expect(notifications[0].incidentId).toBeTruthy();
    expect(typeof notifications[0].incidentId).toBe('string');
    expect(notifications[0].incidentId.length).toBeGreaterThan(0);
  });

  // 06-07: recommendedAction is non-empty string
  it('06-07: recommendedAction is non-empty string', () => {
    const formatter = new AacrNotificationFormatter();
    const notifications = formatter.format(makeBreach(), 'ORANGE', LROP_ZONE);
    expect(notifications[0].recommendedAction).toBeTruthy();
    expect(typeof notifications[0].recommendedAction).toBe('string');
    expect(notifications[0].recommendedAction.length).toBeGreaterThan(0);
  });

  // 06-08: format() never throws for any input
  it('06-08: format() never throws for any input', () => {
    const formatter = new AacrNotificationFormatter();
    expect(() => formatter.format(null as unknown as ZoneBreach, 'RED', LROP_ZONE)).not.toThrow();
    expect(() => formatter.format(makeBreach(), null as unknown as AwningLevel, LROP_ZONE)).not.toThrow();
    expect(() => formatter.format(makeBreach(), 'RED', null as unknown as typeof LROP_ZONE)).not.toThrow();
  });

  // 06-09: airport zone → locationIcao matches zone ICAO designator
  it('06-09: airport zone → locationIcao matches zone icaoCode', () => {
    const formatter = new AacrNotificationFormatter();
    const notifLRCL = formatter.format(
      makeBreach({ zoneId: 'RO-LRCL-EXCLUSION' }),
      'ORANGE',
      LRCL_ZONE
    );
    expect(notifLRCL[0].locationIcao).toBe('LRCL');
  });

  // 06-10: military zone RED → operatorConfirmationRequired=true
  it('06-10: military zone RED AWNING → operatorConfirmationRequired=true', () => {
    const formatter = new AacrNotificationFormatter();
    const breach = makeBreach({ zoneId: 'RO-MIL-001', severity: 'CRITICAL' });
    const notifications = formatter.format(breach, 'RED', MILITARY_ZONE);
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].operatorConfirmationRequired).toBe(true);
  });
});
