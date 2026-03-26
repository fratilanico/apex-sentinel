// APEX-SENTINEL — W9 Feed Integration End-to-End Tests
// FR-W9 | tests/integration/FR-W9-integration-feeds.test.ts
// Covers full feed pipeline: broker startup, enrichment, context scoring, teardown, privacy.
// TDD-RED: all imports reference non-existent modules — tests MUST fail initially.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdsbExchangeClient } from '../../src/feeds/adsb-exchange-client.js';
import { CivilProtectionClient } from '../../src/feeds/civil-protection-client.js';
import { OpenMeteoClient } from '../../src/feeds/open-meteo-client.js';
import { DataFeedBroker } from '../../src/feeds/data-feed-broker.js';
import { ThreatContextEnricher } from '../../src/detection/threat-context-enricher.js';

// ---------------------------------------------------------------------------
// NATS mock
// ---------------------------------------------------------------------------

const makeNatsMock = () => ({
  publish: vi.fn(),
  subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
});

// ---------------------------------------------------------------------------
// Feed client mocks
// ---------------------------------------------------------------------------

const makeAdsbMock = () => ({
  getAircraft: vi.fn().mockResolvedValue([
    {
      icao24: 'AABBCC',
      callsign: 'TEST01',
      lat: 44.4,
      lon: 26.1,
      alt_baro: 600,
      velocity: 95,
      heading: 315,
      onGround: false,
      squawk: '1200',
    },
  ]),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn(),
});

const makeCivilProtMock = () => ({
  getActiveAlerts: vi.fn().mockResolvedValue([
    {
      id: 'ALERT-RO-001',
      severity: 'critical',
      message: 'Active military exercise zone — no-fly corridor',
      bbox: { latMin: 43.8, lonMin: 24.5, latMax: 45.2, lonMax: 27.3 },
      ts: Date.now(),
    },
  ]),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
});

const makeOpenMeteoMock = () => ({
  getWeather: vi.fn().mockResolvedValue({
    wind: { speedKts: 8, dirDeg: 180 },
    visibilityKm: 10,
    precipMm: 0,
    ts: Date.now(),
  }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Detection fixture
// ---------------------------------------------------------------------------

const MOCK_DETECTION = {
  id: 'DET-001',
  classificationLabel: 'UAV',
  confidence: 0.87,
  lat: 44.4,
  lon: 26.1,
  altM: 180,
  ts: Date.now(),
  sensorId: 'SENSOR-ALPHA-01',
};

const MOCK_DETECTION_NO_SQUAWK_CORR = {
  id: 'DET-002',
  classificationLabel: 'UAV',
  confidence: 0.72,
  lat: 47.5,
  lon: 23.0,
  altM: 300,
  ts: Date.now(),
  sensorId: 'SENSOR-BETA-02',
};

// ---------------------------------------------------------------------------

describe('FR-W9: Feed Integration — end-to-end', () => {

  let nats: ReturnType<typeof makeNatsMock>;
  let adsbClient: ReturnType<typeof makeAdsbMock>;
  let civilProtClient: ReturnType<typeof makeCivilProtMock>;
  let meteoClient: ReturnType<typeof makeOpenMeteoMock>;
  let broker: DataFeedBroker;
  let enricher: ThreatContextEnricher;

  beforeEach(() => {
    nats = makeNatsMock();
    adsbClient = makeAdsbMock();
    civilProtClient = makeCivilProtMock();
    meteoClient = makeOpenMeteoMock();

    broker = new DataFeedBroker({
      nats: nats as any,
      adsbClient: adsbClient as unknown as AdsbExchangeClient,
      civilProtectionClient: civilProtClient as unknown as CivilProtectionClient,
      openMeteoClient: meteoClient as unknown as OpenMeteoClient,
    });

    enricher = new ThreatContextEnricher(broker);
  });

  afterEach(async () => {
    await broker.stop();
    vi.clearAllMocks();
  });

  // ── Startup ───────────────────────────────────────────────────────────────

  it('FR-W9-I01: GIVEN mocked feed clients, WHEN broker.start() called, THEN a "feed.fused" event is emitted within 5 seconds', async () => {
    const fusedEvents: unknown[] = [];
    broker.on('feed.fused', (msg) => fusedEvents.push(msg));

    await broker.start();

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (fusedEvents.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(check); resolve(); }, 5_000);
    });

    expect(fusedEvents.length).toBeGreaterThan(0);
  }, 6_000);

  // ── Enricher latency ──────────────────────────────────────────────────────

  it('FR-W9-I02: GIVEN broker running with mocked feeds, WHEN enricher receives a detection, THEN enriched result returned within 200ms', async () => {
    await broker.start();

    const t0 = Date.now();
    const enriched = await enricher.enrich(MOCK_DETECTION);
    const elapsed = Date.now() - t0;

    expect(enriched).toBeDefined();
    expect(enriched.contextScore).toBeTypeOf('number');
    expect(elapsed).toBeLessThan(200);
  });

  // ── Context scoring — active CRITICAL alert ───────────────────────────────

  it('FR-W9-I03: GIVEN an active CRITICAL civil-protection alert overlapping the detection bbox, WHEN enricher enriches a detection in that zone, THEN contextScore ≥ 40', async () => {
    await broker.start();

    // Detection is within the mocked CRITICAL alert bbox (43.8–45.2 lat, 24.5–27.3 lon)
    const enriched = await enricher.enrich(MOCK_DETECTION);

    expect(enriched.contextScore).toBeGreaterThanOrEqual(40);
  });

  // ── Context scoring — squawk 7700 correlation ─────────────────────────────

  it('FR-W9-I04: GIVEN ADS-B client returns aircraft with squawk=7700 within the detection bbox, WHEN enricher enriches that detection, THEN contextScore ≥ 30', async () => {
    // Override adsb mock to return a squawk-7700 aircraft at the detection location
    adsbClient.getAircraft.mockResolvedValue([
      {
        icao24: 'ZZ1234',
        callsign: 'EMERG1',
        lat: 44.4,
        lon: 26.1,
        alt_baro: 600,
        velocity: 90,
        heading: 270,
        onGround: false,
        squawk: '7700',
        emergencyFlag: 'emergency',
      },
    ]);

    await broker.start();

    const enriched = await enricher.enrich(MOCK_DETECTION);
    expect(enriched.contextScore).toBeGreaterThanOrEqual(30);
  });

  // ── Clean teardown ────────────────────────────────────────────────────────

  it('FR-W9-I05: GIVEN all feed clients started via broker, WHEN broker.stop() called, THEN all client stop() methods are called without error', async () => {
    await broker.start();
    await broker.stop();

    expect(adsbClient.stop).toHaveBeenCalledOnce();
    expect(civilProtClient.stop).toHaveBeenCalledOnce();
    expect(meteoClient.stop).toHaveBeenCalledOnce();
  });

  // ── Privacy invariant ─────────────────────────────────────────────────────

  it('FR-W9-I06: GIVEN enriched detection payload, WHEN inspected at any depth, THEN payload must NOT contain lat, lon, or icao24 fields from ADS-B raw data', async () => {
    await broker.start();

    const enriched = await enricher.enrich(MOCK_DETECTION_NO_SQUAWK_CORR);

    // Recursively check the payload for forbidden keys
    const serialised = JSON.stringify(enriched);
    // Raw aircraft lat/lon fields must not appear under adsb context
    // (the enricher is allowed to echo back the detection's own lat/lon,
    // but must NOT embed the correlated aircraft's lat/lon or icao24)
    const parsed = JSON.parse(serialised);
    const forbiddenInContext = (obj: unknown, path = ''): void => {
      if (obj === null || typeof obj !== 'object') return;
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        const fullPath = path ? `${path}.${key}` : key;
        // adsb-sourced raw aircraft lat/lon/icao24 must not be nested under enrichment context
        if (fullPath.startsWith('adsbContext') || fullPath.startsWith('correlatedAircraft')) {
          expect(['lat', 'lon', 'icao24']).not.toContain(key);
        }
        forbiddenInContext(val, fullPath);
      }
    };
    forbiddenInContext(parsed);
  });
});
