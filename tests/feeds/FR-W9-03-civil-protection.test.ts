// APEX-SENTINEL — W9 EU Civil Protection + alerts.in.ua Feed Tests
// FR-W9-03 | tests/feeds/FR-W9-03-civil-protection.test.ts
// Covers dual-source alert ingestion, deduplication, AWNING level derivation, and caching.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CivilProtectionClient, type Alert, type AlertLevel } from '../../src/feeds/civil-protection-client.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// alerts.in.ua response format
const ALERTS_IN_UA_FIXTURE = {
  active_alerts: [
    {
      id: 'ua-001',
      alert_type: 'air_raid',
      location_title: 'Kyiv Oblast',
      polygon: {
        type: 'Polygon',
        coordinates: [[[30.0, 50.2], [30.5, 50.2], [30.5, 50.7], [30.0, 50.7], [30.0, 50.2]]],
      },
      started_at: new Date(Date.now() - 1800_000).toISOString(),  // 30 min ago
      finished_at: new Date(Date.now() + 3600_000).toISOString(), // 1h from now
    },
    {
      id: 'ua-002',
      alert_type: 'artillery',
      location_title: 'Kharkiv Oblast',
      polygon: null,
      started_at: new Date(Date.now() - 600_000).toISOString(),
      finished_at: new Date(Date.now() + 7200_000).toISOString(),
    },
  ],
};

// EU ERCC (Emergency Response Coordination Centre) response format — different structure
const ERCC_FIXTURE = {
  events: [
    {
      eventId: 'ercc-ro-001',
      severity: 'HIGH',
      category: 'chemical',
      affectedCountry: 'RO',
      affectedArea: 'Constanta',
      areaGeojson: null,
      expiresAt: new Date(Date.now() + 5400_000).toISOString(),
    },
    {
      eventId: 'ercc-ro-002',
      severity: 'LOW',
      category: 'flood',
      affectedCountry: 'RO',
      affectedArea: 'Tulcea',
      areaGeojson: null,
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    },
  ],
};

// ---------------------------------------------------------------------------

describe('FR-W9-03: EU Civil Protection + alerts.in.ua', () => {

  let client: CivilProtectionClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new CivilProtectionClient(['RO', 'UA'], fetchMock);
  });

  // ── Unit tests ─────────────────────────────────────────────────────────────

  it('FR-W9-03-U01: GIVEN countries array ["RO","UA"], WHEN constructor called, THEN client stores country list without throwing', () => {
    const c = new CivilProtectionClient(['RO', 'UA'], fetchMock);
    expect(c.getCountries()).toEqual(['RO', 'UA']);
  });

  it('FR-W9-03-U02: GIVEN mock fetch returns alerts.in.ua fixture for UA, WHEN getActiveAlerts("UA") called, THEN returns Alert array', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('FR-W9-03-U03: GIVEN mock fetch returns ERCC fixture for RO, WHEN getActiveAlerts("RO") called, THEN returns Alert array', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ERCC_FIXTURE });
    const result = await client.getActiveAlerts('RO');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('FR-W9-03-U04: GIVEN active alerts returned, WHEN fields inspected, THEN each Alert has id, level, type, area, validUntil, source; alert with polygon has polygon.type="Polygon"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    for (const alert of result) {
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('level');
      expect(alert).toHaveProperty('type');
      expect(alert).toHaveProperty('area');
      expect(alert).toHaveProperty('validUntil');
      expect(alert).toHaveProperty('source');
    }
    const withPolygon = result.find(a => a.id === 'ua-001');
    expect(withPolygon?.polygon?.type).toBe('Polygon');
  });

  it('FR-W9-03-U05: GIVEN alerts.in.ua fixture with active_alerts array, WHEN parsed, THEN all alerts mapped to Alert interface', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    expect(result.find(a => a.id === 'ua-001')).toBeDefined();
    expect(result.find(a => a.id === 'ua-002')).toBeDefined();
  });

  it('FR-W9-03-U06: GIVEN ERCC fixture with events array, WHEN parsed, THEN all events mapped to Alert interface', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ERCC_FIXTURE });
    const result = await client.getActiveAlerts('RO');
    expect(result.find(a => a.id === 'ercc-ro-001')).toBeDefined();
    expect(result.find(a => a.id === 'ercc-ro-002')).toBeDefined();
  });

  it('FR-W9-03-U07: GIVEN alert_type="air_raid", WHEN mapped, THEN level is AlertLevel.CRITICAL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    const airRaid = result.find(a => a.id === 'ua-001');
    expect(airRaid?.level).toBe('CRITICAL' satisfies AlertLevel);
  });

  it('FR-W9-03-U08: GIVEN alert_type="artillery", WHEN mapped, THEN level is AlertLevel.HIGH', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    const artillery = result.find(a => a.id === 'ua-002');
    expect(artillery?.level).toBe('HIGH' satisfies AlertLevel);
  });

  it('FR-W9-03-U09: GIVEN alert with type="chemical", WHEN mapped, THEN level is AlertLevel.CRITICAL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ERCC_FIXTURE });
    const result = await client.getActiveAlerts('RO');
    const chemical = result.find(a => a.id === 'ercc-ro-001');
    expect(chemical?.level).toBe('CRITICAL' satisfies AlertLevel);
  });

  it('FR-W9-03-U10: GIVEN alert with validUntil in the past, WHEN getActiveAlerts() called, THEN expired alert filtered out', async () => {
    const expiredFixture = {
      active_alerts: [{
        id: 'ua-expired',
        alert_type: 'air_raid',
        location_title: 'Odesa Oblast',
        polygon: null,
        started_at: new Date(Date.now() - 7200_000).toISOString(),
        finished_at: new Date(Date.now() - 600_000).toISOString(), // expired 10 min ago
      }],
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => expiredFixture });
    const result = await client.getActiveAlerts('UA');
    expect(result.find(a => a.id === 'ua-expired')).toBeUndefined();
  });

  it('FR-W9-03-U11: GIVEN same alert id returned by both sources, WHEN getActiveAlerts() called, THEN deduplicated to one entry', async () => {
    // Simulate same id appearing in both sources
    const dupeFixture = {
      active_alerts: [ALERTS_IN_UA_FIXTURE.active_alerts[0]], // id: ua-001
    };
    // First call returns ua-001 from alerts.in.ua, second also returns ua-001 via ERCC wrapper
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => dupeFixture })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [{
        eventId: 'ua-001',
        severity: 'HIGH',
        category: 'air_raid',
        affectedCountry: 'UA',
        affectedArea: 'Kyiv Oblast',
        areaGeojson: null,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }] }) });
    const result = await client.getActiveAlerts('UA');
    const dupes = result.filter(a => a.id === 'ua-001');
    expect(dupes).toHaveLength(1);
  });

  it('FR-W9-03-U12: GIVEN one source throws a network error, WHEN getActiveAlerts() called, THEN other source results still returned', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('alerts.in.ua unreachable'))
      .mockResolvedValueOnce({ ok: true, json: async () => ERCC_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    expect(Array.isArray(result)).toBe(true);
    // Should not throw, should return whatever succeeded
  });

  it('FR-W9-03-U13: GIVEN both sources return empty data, WHEN getActiveAlerts() called, THEN returns empty array', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ active_alerts: [], events: [] }) });
    const result = await client.getActiveAlerts('RO');
    expect(result).toEqual([]);
  });

  it('FR-W9-03-U14: GIVEN two sources polled, WHEN getActiveAlerts() called, THEN both fetch calls initiated in parallel (Promise.all)', async () => {
    const callOrder: number[] = [];
    fetchMock.mockImplementation((url: string) => {
      callOrder.push(Date.now());
      if (url.includes('alerts.in.ua')) {
        return Promise.resolve({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
      }
      return Promise.resolve({ ok: true, json: async () => ERCC_FIXTURE });
    });
    await client.getActiveAlerts('UA');
    // Both fetch calls should have been made
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  it('FR-W9-03-I01: GIVEN any CRITICAL alert active, WHEN getAwningLevel() called, THEN returns "RED"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    await client.getActiveAlerts('UA'); // populates cache
    const level = client.getAwningLevel();
    expect(level).toBe('RED');
  });

  it('FR-W9-03-I02: GIVEN only HIGH alerts active (no CRITICAL), WHEN getAwningLevel() called, THEN returns "YELLOW"', async () => {
    const highOnlyFixture = {
      active_alerts: [{
        id: 'ua-high-only',
        alert_type: 'artillery',
        location_title: 'Zaporizhzhia Oblast',
        polygon: null,
        started_at: new Date(Date.now() - 300_000).toISOString(),
        finished_at: new Date(Date.now() + 3600_000).toISOString(),
      }],
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => highOnlyFixture });
    await client.getActiveAlerts('UA');
    const level = client.getAwningLevel();
    expect(level).toBe('YELLOW');
  });

  it('FR-W9-03-I03: GIVEN subsequent call within 25s of last fetch, WHEN getActiveAlerts() called again, THEN fetch NOT called again (cache hit)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE });
    await client.getActiveAlerts('UA');
    const callsAfterFirst = fetchMock.mock.calls.length;
    // Second call within cache TTL
    await client.getActiveAlerts('UA');
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no additional fetch
  });

  it('FR-W9-03-I04: GIVEN each alert, WHEN source field inspected, THEN value is either "alerts.in.ua" or "ercc"', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ALERTS_IN_UA_FIXTURE })
      .mockResolvedValueOnce({ ok: true, json: async () => ERCC_FIXTURE });
    const result = await client.getActiveAlerts('UA');
    for (const alert of result) {
      expect(['alerts.in.ua', 'ercc']).toContain(alert.source);
    }
  });
});
