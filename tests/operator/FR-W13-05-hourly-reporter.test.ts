// APEX-SENTINEL — W13
// FR-W13-05: HourlyStatusReporter

import { describe, it, expect, beforeEach } from 'vitest';
import { HourlyStatusReporter, type SitrepStats, type AwningEntry } from '../../src/operator/hourly-status-reporter.js';

describe('FR-W13-05: HourlyStatusReporter', () => {
  let reporter: HourlyStatusReporter;

  const makeStats = (overrides: Partial<SitrepStats> = {}): SitrepStats => ({
    detectionCount: 12,
    awningHistory: [
      { ts: '2026-03-26T09:00:00.000Z', level: 'WHITE' },
      { ts: '2026-03-26T09:15:00.000Z', level: 'YELLOW', droneType: 'fpv_drone' },
      { ts: '2026-03-26T09:30:00.000Z', level: 'RED', droneType: 'fpv_drone' },
    ],
    dominantDroneType: 'fpv_drone',
    coveragePercent: 78,
    ...overrides,
  });

  beforeEach(() => {
    reporter = new HourlyStatusReporter();
  });

  it('generateSitrep returns a string', () => {
    const result = reporter.generateSitrep(makeStats());
    expect(typeof result).toBe('string');
  });

  it('SITREP contains SUMMARY section', () => {
    const result = reporter.generateSitrep(makeStats());
    expect(result).toContain('SUMMARY');
  });

  it('SITREP contains DETECTIONS section', () => {
    const result = reporter.generateSitrep(makeStats());
    expect(result).toContain('DETECTIONS');
  });

  it('SITREP contains AWNING HISTORY section', () => {
    const result = reporter.generateSitrep(makeStats());
    expect(result).toContain('AWNING HISTORY');
  });

  it('SITREP contains THREAT MATRIX section', () => {
    const result = reporter.generateSitrep(makeStats());
    expect(result).toContain('THREAT MATRIX');
  });

  it('SITREP shows detection count', () => {
    const result = reporter.generateSitrep(makeStats({ detectionCount: 42 }));
    expect(result).toContain('42');
  });

  it('SITREP shows dominant drone type', () => {
    const result = reporter.generateSitrep(makeStats({ dominantDroneType: 'shahed_136' }));
    expect(result).toContain('shahed_136');
  });

  it('SITREP shows coverage percent', () => {
    const result = reporter.generateSitrep(makeStats({ coveragePercent: 93 }));
    expect(result).toContain('93');
  });

  it('SITREP uses box-drawing chars for structure', () => {
    const result = reporter.generateSitrep(makeStats());
    expect(result).toContain('┌');
    expect(result).toContain('│');
    expect(result).toContain('└');
  });

  it('SITREP does not contain pipe chars in table structure', () => {
    const result = reporter.generateSitrep(makeStats());
    // Box-drawing │ is allowed; raw ASCII | is not
    const withoutBoxDrawing = result.replace(/[│├┤┼]/g, '');
    expect(withoutBoxDrawing).not.toContain('|');
  });

  it('SITREP history shows last 5 entries only', () => {
    const history: AwningEntry[] = Array.from({ length: 10 }, (_, i) => ({
      ts: `2026-03-26T0${i}:00:00.000Z`,
      level: 'RED',
    }));
    const result = reporter.generateSitrep(makeStats({ awningHistory: history }));
    // Should contain only 5 history rows — check by counting timestamp patterns
    const tsMatches = result.match(/\d{2}:\d{2}:\d{2}/g) ?? [];
    expect(tsMatches.length).toBeLessThanOrEqual(6); // 5 history + maybe header
  });

  it('SITREP with empty history shows no transitions message', () => {
    const result = reporter.generateSitrep(makeStats({ awningHistory: [] }));
    expect(result).toContain('No transitions');
  });
});
