// APEX-SENTINEL — W10 NatoAlertFormatter Tests
// FR-W10-05 | tests/nato/FR-W10-05-nato-alert-formatter.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NatoAlertFormatter } from '../../src/nato/nato-alert-formatter.js';
import type { StageResult } from '../../src/nato/stage-classifier.js';
import type { TrajectoryPrediction } from '../../src/nato/stage35-trajectory-predictor.js';

describe('FR-W10-05: NatoAlertFormatter', () => {
  let formatter: NatoAlertFormatter;

  const mockStage: StageResult = {
    stage: 2,
    confidence: 0.85,
    evidence: ['acoustic', 'rf'],
  };

  const mockTrajectory: TrajectoryPrediction[] = [
    { lat: 45.123, lon: 26.456, altM: 150, confidenceRadius_m: 120, tSeconds: 30 },
    { lat: 45.198, lon: 26.521, altM: 148, confidenceRadius_m: 240, tSeconds: 60 },
  ];

  beforeEach(() => {
    formatter = new NatoAlertFormatter();
  });

  it('05-01: alertId matches AWNING-{YYYYMMDD}-{seq:04d} pattern', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136');
    expect(alert.alertId).toMatch(/^AWNING-\d{8}-\d{4}$/);
  });

  it('05-02: alertId increments monotonically', () => {
    const a1 = formatter.format('RED', mockStage, 'Unknown');
    const a2 = formatter.format('YELLOW', mockStage, 'Unknown');
    const seq1 = parseInt(a1.alertId.split('-')[2]);
    const seq2 = parseInt(a2.alertId.split('-')[2]);
    expect(seq2).toBe(seq1 + 1);
  });

  it('05-03: alert includes awningLevel', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136');
    expect(alert.awningLevel).toBe('RED');
  });

  it('05-04: alert includes stage number', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136');
    expect(alert.stage).toBe(2);
  });

  it('05-05: alert includes droneType', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136');
    expect(alert.droneType).toBe('Shahed-136');
  });

  it('05-06: ts is ISO-8601 string', () => {
    const alert = formatter.format('WHITE', mockStage, 'Unknown');
    expect(() => new Date(alert.ts)).not.toThrow();
    expect(new Date(alert.ts).toISOString()).toBe(alert.ts);
  });

  it('05-07: trajectory included when provided', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136', mockTrajectory);
    expect(alert.trajectory).toBeDefined();
    expect(alert.trajectory).toHaveLength(2);
  });

  it('05-08: trajectory undefined when not provided', () => {
    const alert = formatter.format('RED', mockStage, 'Unknown');
    expect(alert.trajectory).toBeUndefined();
  });

  it('05-09: summary contains awningLevel', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136', mockTrajectory);
    expect(alert.summary).toContain('RED');
  });

  it('05-10: summary contains ETA format when trajectory provided', () => {
    const alert = formatter.format('RED', mockStage, 'Shahed-136', mockTrajectory);
    expect(alert.summary).toMatch(/ETA \d+s/);
    expect(alert.summary).toMatch(/impact zone/);
    expect(alert.summary).toMatch(/±\d+m/);
  });

  it('05-11: reset resets sequence counter to 0', () => {
    formatter.format('RED', mockStage, 'X');
    formatter.format('RED', mockStage, 'X');
    formatter.reset();
    const alert = formatter.format('RED', mockStage, 'X');
    expect(alert.alertId).toMatch(/-0001$/);
  });
});
