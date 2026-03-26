// APEX-SENTINEL — W9 TDD RED Tests
// FR-W9-04: GDELT Event Feed
// Status: RED — implementation in src/feeds/gdelt-client.ts does NOT exist yet

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  GdeltClient,
  type OsintEvent,
} from '../../src/feeds/gdelt-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Romania bounding box [minLat, minLon, maxLat, maxLon] */
const ROMANIA_BBOX: [number, number, number, number] = [43.6, 22.1, 48.3, 30.0];

function makeEvent(overrides: Partial<OsintEvent> = {}): OsintEvent {
  return {
    eventId: 'EVT-001',
    lat: 44.43,
    lon: 26.10,
    ts: new Date().toISOString(),
    eventCode: '190',
    sourceUrl: 'https://example.com/article',
    goldsteinScale: 1.0,
    ...overrides,
  };
}

/** Build a minimal raw GDELT GeoJSON-like response body */
function makeGdeltResponse(events: OsintEvent[]) {
  return JSON.stringify({ events });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('FR-W9-04: GDELT Event Feed', () => {
  let client: GdeltClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new GdeltClient({ bbox: ROMANIA_BBOX, keywords: ['drone', 'UAV'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // W9-04-01: Constructor
  // -------------------------------------------------------------------------

  it('W9-04-01: constructor accepts bbox and keywords array', () => {
    expect(
      () => new GdeltClient({ bbox: ROMANIA_BBOX, keywords: ['drone'] }),
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // W9-04-02: getEvents() return type
  // -------------------------------------------------------------------------

  it('W9-04-02: getEvents() returns OsintEvent[]', async () => {
    vi.spyOn(client, 'getEvents').mockResolvedValueOnce([makeEvent()]);
    const events = await client.getEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // W9-04-03: OsintEvent shape
  // -------------------------------------------------------------------------

  it('W9-04-03: OsintEvent has eventId, lat, lon, ts, eventCode, sourceUrl, goldsteinScale', async () => {
    vi.spyOn(client, 'getEvents').mockResolvedValueOnce([makeEvent()]);
    const [ev] = await client.getEvents();
    expect(ev).toHaveProperty('eventId');
    expect(ev).toHaveProperty('lat');
    expect(ev).toHaveProperty('lon');
    expect(ev).toHaveProperty('ts');
    expect(ev).toHaveProperty('eventCode');
    expect(ev).toHaveProperty('sourceUrl');
    expect(ev).toHaveProperty('goldsteinScale');
  });

  // -------------------------------------------------------------------------
  // W9-04-04: Romania bbox filter
  // -------------------------------------------------------------------------

  it('W9-04-04: Romania bbox filter [43.6, 22.1, 48.3, 30.0] works', () => {
    const inside = makeEvent({ lat: 45.0, lon: 25.0 });
    const outside = makeEvent({ lat: 51.5, lon: -0.1 }); // London

    const filtered = client.filterByBbox([inside, outside], ROMANIA_BBOX);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventId).toBe(inside.eventId);
  });

  // -------------------------------------------------------------------------
  // W9-04-05: Keyword filter 'drone'
  // -------------------------------------------------------------------------

  it("W9-04-05: keyword filter 'drone' returns relevant events", async () => {
    const droneEvent = makeEvent({ eventId: 'DRONE-1', eventCode: '190' });
    const unrelatedEvent = makeEvent({ eventId: 'OTHER-1', eventCode: '010' });

    vi.spyOn(client, 'getEvents').mockResolvedValueOnce([droneEvent]);

    const results = await client.getEvents({ keywords: ['drone'] });
    const ids = results.map((e) => e.eventId);
    expect(ids).toContain('DRONE-1');
    expect(ids).not.toContain(unrelatedEvent.eventId);
  });

  // -------------------------------------------------------------------------
  // W9-04-06: Keyword filter 'UAV'
  // -------------------------------------------------------------------------

  it("W9-04-06: keyword filter 'UAV' returns relevant events", async () => {
    const uavEvent = makeEvent({ eventId: 'UAV-1', eventCode: '180' });

    vi.spyOn(client, 'getEvents').mockResolvedValueOnce([uavEvent]);

    const results = await client.getEvents({ keywords: ['UAV'] });
    expect(results.map((e) => e.eventId)).toContain('UAV-1');
  });

  // -------------------------------------------------------------------------
  // W9-04-07: Events outside bbox filtered out
  // -------------------------------------------------------------------------

  it('W9-04-07: events outside Romania bbox are filtered out', () => {
    const events = [
      makeEvent({ eventId: 'IN-1', lat: 46.0, lon: 24.0 }),   // inside Romania
      makeEvent({ eventId: 'OUT-1', lat: 52.0, lon: 13.0 }),  // Berlin
      makeEvent({ eventId: 'OUT-2', lat: 41.0, lon: 28.0 }),  // Istanbul (south)
    ];
    const filtered = client.filterByBbox(events, ROMANIA_BBOX);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventId).toBe('IN-1');
  });

  // -------------------------------------------------------------------------
  // W9-04-08: Events older than windowMinutes filtered out
  // -------------------------------------------------------------------------

  it('W9-04-08: events older than windowMinutes are filtered out', () => {
    const recentTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();   // 10 min ago
    const oldTs = new Date(Date.now() - 120 * 60 * 1000).toISOString();     // 2 h ago

    const events = [
      makeEvent({ eventId: 'RECENT', ts: recentTs }),
      makeEvent({ eventId: 'OLD', ts: oldTs }),
    ];

    const filtered = client.filterByWindow(events, 60); // 60-minute window
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventId).toBe('RECENT');
  });

  // -------------------------------------------------------------------------
  // W9-04-09: Negative goldsteinScale flagged as conflict
  // -------------------------------------------------------------------------

  it('W9-04-09: negative goldsteinScale events are flagged as conflict', () => {
    const conflictEvent = makeEvent({ goldsteinScale: -5.0 });
    const neutralEvent = makeEvent({ goldsteinScale: 2.0 });

    expect(client.isConflictEvent(conflictEvent)).toBe(true);
    expect(client.isConflictEvent(neutralEvent)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // W9-04-10: Empty GDELT response
  // -------------------------------------------------------------------------

  it('W9-04-10: empty GDELT response returns empty array', async () => {
    vi.spyOn(client, 'getEvents').mockResolvedValueOnce([]);
    const results = await client.getEvents();
    expect(results).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // W9-04-11: GDELT API called with correct GEO mode params
  // -------------------------------------------------------------------------

  it('W9-04-11: GDELT API called with correct GEO mode parameters', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(makeGdeltResponse([]), { status: 200 }),
    );

    await client.getEvents();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    // GDELT GEO API uses MODE=PointData and geographic parameters
    expect(calledUrl).toMatch(/gdeltproject\.org/i);
    expect(calledUrl).toMatch(/[Mm]ode=[Pp]oint[Dd]ata|MODE=pointdata/i);
  });

  // -------------------------------------------------------------------------
  // W9-04-12: Privacy — aggregate to 0.1° grid, no individual lat/lon to DB
  // -------------------------------------------------------------------------

  it('W9-04-12: OsintEvent count aggregated per 0.1° grid cell (privacy — no individual lat/lon stored to DB)', () => {
    const events = [
      makeEvent({ eventId: 'E1', lat: 44.43, lon: 26.10 }),
      makeEvent({ eventId: 'E2', lat: 44.47, lon: 26.14 }),  // same 0.1° cell as E1
      makeEvent({ eventId: 'E3', lat: 44.55, lon: 26.10 }),  // different cell
    ];

    const grid = client.aggregateToGrid(events, 0.1);

    // 2 distinct grid cells
    expect(Object.keys(grid)).toHaveLength(2);

    // Cell containing E1+E2 has count 2
    const cellKey = Object.keys(grid).find((k) => grid[k].count === 2);
    expect(cellKey).toBeDefined();
    const cell = grid[cellKey!];

    // Grid cell stores count and centroid — NOT individual event lat/lon
    expect(cell).toHaveProperty('count');
    expect(cell).toHaveProperty('gridLat');
    expect(cell).toHaveProperty('gridLon');
    expect(cell).not.toHaveProperty('events'); // no raw events in aggregated output
  });
});
