// APEX-SENTINEL — FR-W12-02: MultiProtocolRfClassifier Tests
// tests/rf2/FR-W12-02-multi-protocol-classifier.test.ts

import { describe, it, expect } from 'vitest';
import {
  MultiProtocolRfClassifier,
  type FrequencySample,
  type ClassifierResult,
} from '../../src/rf2/multi-protocol-rf-classifier.js';

describe('FR-W12-02: MultiProtocolRfClassifier', () => {
  const classifier = new MultiProtocolRfClassifier();

  const elrs900Samples: FrequencySample[] = [
    { frequencyMHz: 868, ts: 0, rssi: -65 },
    { frequencyMHz: 890, ts: 1, rssi: -64 },
    { frequencyMHz: 910, ts: 2, rssi: -66 },
    { frequencyMHz: 875, ts: 3, rssi: -65 },
  ];

  const djiSamples: FrequencySample[] = [
    { frequencyMHz: 2412, ts: 0, rssi: -70 },
    { frequencyMHz: 2437, ts: 10, rssi: -69 },
    { frequencyMHz: 2462, ts: 20, rssi: -71 },
    { frequencyMHz: 2420, ts: 30, rssi: -70 },
  ];

  const crossfireSamples: FrequencySample[] = [
    { frequencyMHz: 869.0, ts: 0, rssi: -60 },
    { frequencyMHz: 869.5, ts: 4, rssi: -61 },
    { frequencyMHz: 870.0, ts: 8, rssi: -60 },
    { frequencyMHz: 869.2, ts: 12, rssi: -60 },
  ];

  const unknownSamples: FrequencySample[] = [
    { frequencyMHz: 400, ts: 0, rssi: -65 },
    { frequencyMHz: 420, ts: 5, rssi: -65 },
    { frequencyMHz: 440, ts: 10, rssi: -65 },
  ];

  // ── Classification correctness ────────────────────────────────────────────

  it('FR-W12-02-T01: classifies ELRS 900 MHz correctly', () => {
    const results = classifier.classify(elrs900Samples);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].protocol).toBe('elrs_900');
  });

  it('FR-W12-02-T02: classifies DJI OcuSync 2.4 GHz correctly', () => {
    const results = classifier.classify(djiSamples);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].protocol).toBe('dji_ocusync_2g');
  });

  it('FR-W12-02-T03: classifies TBS Crossfire correctly', () => {
    const results = classifier.classify(crossfireSamples);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].protocol).toBe('crossfire');
  });

  it('FR-W12-02-T04: returns empty array for unknown frequency band', () => {
    const results = classifier.classify(unknownSamples);
    // All protocols below 0.60 threshold → empty or unknown only
    const aboveThreshold = results.filter(r => r.confidence >= 0.60);
    expect(aboveThreshold.length).toBe(0);
  });

  // ── Confidence threshold ──────────────────────────────────────────────────

  it('FR-W12-02-T05: all returned results have confidence ≥ 0.60', () => {
    const results = classifier.classify(elrs900Samples);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.60);
    }
  });

  it('FR-W12-02-T06: top result confidence is highest in ranked list', () => {
    const results = classifier.classify(elrs900Samples);
    if (results.length > 1) {
      expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
    }
  });

  // ── Evidence field ────────────────────────────────────────────────────────

  it('FR-W12-02-T07: each result has non-empty evidence array', () => {
    const results = classifier.classify(elrs900Samples);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].evidence.length).toBeGreaterThan(0);
  });

  it('FR-W12-02-T08: evidence contains meaningful strings', () => {
    const results = classifier.classify(elrs900Samples);
    for (const r of results) {
      for (const e of r.evidence) {
        expect(typeof e).toBe('string');
        expect(e.length).toBeGreaterThan(0);
      }
    }
  });

  // ── Protocol set ─────────────────────────────────────────────────────────

  it('FR-W12-02-T09: supports all required protocol types', () => {
    const supportedProtocols = classifier.getSupportedProtocols();
    const required = ['elrs_900', 'elrs_2400', 'dji_ocusync_2g', 'dji_ocusync_5g', 'crossfire', 'wifi_24', 'bt_classic', 'unknown'];
    for (const p of required) {
      expect(supportedProtocols).toContain(p);
    }
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('FR-W12-02-T10: handles single sample (returns empty)', () => {
    const results = classifier.classify([{ frequencyMHz: 900, ts: 0, rssi: -65 }]);
    const aboveThreshold = results.filter(r => r.confidence >= 0.60);
    expect(aboveThreshold.length).toBe(0);
  });

  it('FR-W12-02-T11: handles empty sample array', () => {
    const results = classifier.classify([]);
    expect(Array.isArray(results)).toBe(true);
  });

  it('FR-W12-02-T12: ELRS 900 confidence > DJI confidence for ELRS samples', () => {
    const results = classifier.classify(elrs900Samples);
    const elrsResult = results.find(r => r.protocol === 'elrs_900');
    const djiResult = results.find(r => r.protocol === 'dji_ocusync_2g');
    if (elrsResult && djiResult) {
      expect(elrsResult.confidence).toBeGreaterThan(djiResult.confidence);
    }
  });

  it('FR-W12-02-T13: DJI 5G samples classified as dji_ocusync_5g', () => {
    const dji5gSamples: FrequencySample[] = [
      { frequencyMHz: 5180, ts: 0, rssi: -70 },
      { frequencyMHz: 5220, ts: 10, rssi: -69 },
      { frequencyMHz: 5260, ts: 20, rssi: -71 },
      { frequencyMHz: 5200, ts: 30, rssi: -70 },
    ];
    const results = classifier.classify(dji5gSamples);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].protocol).toBe('dji_ocusync_5g');
  });

  it('FR-W12-02-T14: result objects are plain (serialisable) objects', () => {
    const results = classifier.classify(elrs900Samples);
    const serialised = JSON.parse(JSON.stringify(results));
    expect(Array.isArray(serialised)).toBe(true);
  });
});
