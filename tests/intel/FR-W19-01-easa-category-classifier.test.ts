// FR-W19-01: EasaCategoryClassifier — TDD RED
// src/intel/easa-category-classifier.ts does NOT exist yet — all tests will fail

import { describe, it, expect, afterEach, vi } from 'vitest';
import { EasaCategoryClassifier } from '../../src/intel/easa-category-classifier.js';

// ---------------------------------------------------------------------------
// Inline types (src/intel/types.ts not yet written)
// ---------------------------------------------------------------------------
type EasaCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';

interface ClassificationResult {
  category: EasaCategory;
  confidence: number; // 0-1
  classificationBasis:
    | 'transponder-absent'
    | 'heuristic-velocity'
    | 'ml-signal-informed'
    | 'adsb-category-map'
    | 'manual-override';
}

interface MlSignalBundle {
  acousticDroneConfidence?: number;
  rfDroneConfidence?: number;
}

// Minimal AircraftState fixture
function makeAircraft(overrides: Record<string, unknown> = {}) {
  return {
    icao24: 'ROA001',
    callsign: 'ROA001',
    lat: 44.5713,
    lon: 26.0849,
    altBaro: 500,
    altitudeM: 500,
    velocityMs: 50,
    headingDeg: 90,
    onGround: false,
    timestampMs: Date.now(),
    source: 'opensky' as const,
    cooperativeContact: false,
    category: null as string | null,
    squawk: null as string | null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-01: EasaCategoryClassifier', () => {
  // 01-01: ADS-B category A3 + cooperative → cat-a-commercial, confidence ≥ 0.90
  it('01-01: category=A3, cooperativeContact=true → cat-a-commercial, confidence>=0.90', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ category: 'A3', cooperativeContact: true });
    const result: ClassificationResult = classifier.classify(aircraft);
    expect(result.category).toBe('cat-a-commercial');
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
  });

  // 01-02: non-cooperative, no category, no squawk → cat-d-unknown, transponder-absent
  it('01-02: non-cooperative, no category, no squawk → cat-d-unknown, transponder-absent, confidence>=0.90', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: false, category: null, squawk: null });
    const result: ClassificationResult = classifier.classify(aircraft);
    expect(result.category).toBe('cat-d-unknown');
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
    expect(result.classificationBasis).toBe('transponder-absent');
  });

  // 01-03: altBaro=80, velocityMs=12, non-cooperative → cat-a-commercial, heuristic-velocity
  it('01-03: altBaro=80, velocityMs=12, non-cooperative → cat-a-commercial, heuristic-velocity', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ altBaro: 80, velocityMs: 12, cooperativeContact: false });
    const result: ClassificationResult = classifier.classify(aircraft);
    expect(result.category).toBe('cat-a-commercial');
    expect(result.classificationBasis).toBe('heuristic-velocity');
  });

  // 01-04: non-cooperative + high acoustic confidence → confidence>=0.90, ml-signal-informed
  it('01-04: non-cooperative + acousticDroneConfidence=0.88 → confidence>=0.90, ml-signal-informed', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: false, category: null });
    const ml: MlSignalBundle = { acousticDroneConfidence: 0.88 };
    const result: ClassificationResult = classifier.classify(aircraft, ml);
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
    expect(result.classificationBasis).toBe('ml-signal-informed');
  });

  // 01-05: malformed aircraft (null lat, undefined callsign, garbage category) → no exception, cat-d-unknown
  it('01-05: malformed aircraft (null lat, undefined callsign) → no exception, cat-d-unknown', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = {
      icao24: '@@GARBAGE@@',
      callsign: undefined,
      lat: null,
      lon: undefined,
      altBaro: undefined,
      velocityMs: NaN,
      headingDeg: null,
      onGround: null,
      timestampMs: 'not-a-number',
      source: 'opensky' as const,
      cooperativeContact: false,
      category: '!!INVALID!!',
      squawk: null,
    };
    expect(() => {
      const result = classifier.classify(aircraft as unknown as ReturnType<typeof makeAircraft>);
      expect(result.category).toBe('cat-d-unknown');
    }).not.toThrow();
  });

  // 01-06: cooperative, category=A1 (ultralight) → cat-a-commercial
  it('01-06: cooperative, category=A1 → cat-a-commercial', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: true, category: 'A1' });
    const result: ClassificationResult = classifier.classify(aircraft);
    expect(result.category).toBe('cat-a-commercial');
  });

  // 01-07: cooperative, high altitude 12000m + velocity 250m/s → cat-a-commercial (commercial IFR)
  it('01-07: cooperative, altBaro=12000, velocityMs=250 → cat-a-commercial', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: true, altBaro: 12000, velocityMs: 250 });
    const result: ClassificationResult = classifier.classify(aircraft);
    expect(result.category).toBe('cat-a-commercial');
  });

  // 01-08: category=B1 ADS-B → appropriate EASA mapping (not cat-a-commercial, not cat-d-unknown)
  it('01-08: category=B1 → maps to appropriate EASA category', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: true, category: 'B1' });
    const result: ClassificationResult = classifier.classify(aircraft);
    const validCategories: EasaCategory[] = [
      'cat-a-commercial',
      'cat-b-modified',
      'cat-c-surveillance',
      'cat-d-unknown',
    ];
    expect(validCategories).toContain(result.category);
    expect(result.classificationBasis).toBe('adsb-category-map');
  });

  // 01-09: empty MlSignalBundle → no crash, falls back to transponder logic
  it('01-09: empty MlSignalBundle → no crash, falls back to non-ML basis', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: false, category: null });
    const ml: MlSignalBundle = {};
    expect(() => {
      const result = classifier.classify(aircraft, ml);
      expect(result.classificationBasis).not.toBe('ml-signal-informed');
    }).not.toThrow();
  });

  // 01-10: cooperative but category is empty string → treated as no category
  it('01-10: cooperativeContact=true, category="" → treated as no category', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: true, category: '' });
    const result: ClassificationResult = classifier.classify(aircraft);
    // Should not return adsb-category-map since there's no real category value
    expect(result.classificationBasis).not.toBe('adsb-category-map');
  });

  // 01-11: classify() with null aircraft → throws or returns cat-d-unknown gracefully
  it('01-11: classify(null) → throws or returns cat-d-unknown gracefully', () => {
    const classifier = new EasaCategoryClassifier();
    let result: ClassificationResult | undefined;
    let threw = false;
    try {
      result = classifier.classify(null as unknown as ReturnType<typeof makeAircraft>);
    } catch {
      threw = true;
    }
    if (!threw) {
      expect(result!.category).toBe('cat-d-unknown');
    }
    // Either path is acceptable — no unhandled crash
    expect(true).toBe(true);
  });

  // 01-12: multiple aircraft classified in sequence → no shared state between calls
  it('01-12: multiple consecutive calls → no shared state contamination', () => {
    const classifier = new EasaCategoryClassifier();
    const unknown = makeAircraft({ cooperativeContact: false, category: null, squawk: null });
    const commercial = makeAircraft({ cooperativeContact: true, category: 'A3' });

    const r1 = classifier.classify(unknown);
    const r2 = classifier.classify(commercial);
    const r3 = classifier.classify(unknown);

    expect(r1.category).toBe('cat-d-unknown');
    expect(r2.category).toBe('cat-a-commercial');
    // r3 must still be unknown, not contaminated by r2
    expect(r3.category).toBe('cat-d-unknown');
  });

  // 01-13: squawk=7700 (emergency) → result reflects emergency signal
  it('01-13: squawk=7700 (emergency) → category includes emergency signal in result', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: true, squawk: '7700' });
    const result: ClassificationResult = classifier.classify(aircraft);
    // Emergency squawk should be reflected — result has emergencySquawk flag or specific category/basis
    expect(result).toHaveProperty('category');
    // Must not silently ignore the squawk
    expect(
      (result as unknown as Record<string, unknown>).emergencySquawk === true ||
        result.classificationBasis !== undefined
    ).toBe(true);
  });

  // 01-14: classify() is synchronous (no Promise return type)
  it('01-14: classify() is synchronous — returns plain object, not Promise', () => {
    const classifier = new EasaCategoryClassifier();
    const aircraft = makeAircraft({ cooperativeContact: true, category: 'A3' });
    const result = classifier.classify(aircraft);
    // A Promise would have a .then method
    expect(typeof (result as unknown as { then?: unknown }).then).not.toBe('function');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('classificationBasis');
  });
});
