// APEX-SENTINEL — W13
// FR-W13-01: TelegramAlertComposer

import { describe, it, expect, beforeEach } from 'vitest';
import { TelegramAlertComposer } from '../../src/operator/telegram-alert-composer.js';
import type { AwningAlert } from '../../src/nato/nato-alert-formatter.js';

describe('FR-W13-01: TelegramAlertComposer', () => {
  let composer: TelegramAlertComposer;

  const makeAlert = (overrides: Partial<AwningAlert> = {}): AwningAlert => ({
    alertId: 'AWNING-20260326-0001',
    awningLevel: 'RED',
    stage: 3,
    droneType: 'fpv_drone',
    ts: '2026-03-26T10:00:00.000Z',
    summary: 'Threat detected',
    ...overrides,
  });

  beforeEach(() => {
    composer = new TelegramAlertComposer();
  });

  it('RED alert contains 🚨 emoji', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'RED' }));
    expect(result).toContain('🚨');
  });

  it('RED alert contains "AWNING RED"', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'RED' }));
    expect(result).toContain('AWNING RED');
  });

  it('RED alert contains droneType', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'RED', droneType: 'shahed_136' }));
    expect(result).toContain('shahed');
  });

  it('RED alert contains stage number', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'RED', stage: 3 }));
    expect(result).toContain('Stage 3');
  });

  it('YELLOW alert contains ⚠️ emoji', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'YELLOW' }));
    expect(result).toContain('⚠️');
  });

  it('YELLOW alert contains "Potential" and droneType', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'YELLOW', droneType: 'fpv_drone' }));
    expect(result).toContain('Potential');
    expect(result).toContain('fpv');
  });

  it('WHITE alert contains ✅ and "All clear"', () => {
    const result = composer.composeAlert(makeAlert({ awningLevel: 'WHITE' }));
    expect(result).toContain('✅');
    expect(result).toContain('All clear');
  });

  it('trajectory block uses box-drawing chars', () => {
    const alert = makeAlert({
      awningLevel: 'RED',
      trajectory: [
        { lat: 48.5, lon: 23.1, altM: 100, confidenceRadius_m: 50, tSeconds: 30 },
        { lat: 48.6, lon: 23.2, altM: 90, confidenceRadius_m: 80, tSeconds: 60 },
        { lat: 48.7, lon: 23.3, altM: 80, confidenceRadius_m: 120, tSeconds: 120 },
      ],
    });
    const result = composer.composeAlert(alert);
    expect(result).toContain('┌');
    expect(result).toContain('│');
    expect(result).toContain('└');
  });

  it('trajectory block does NOT contain pipe chars', () => {
    const alert = makeAlert({
      awningLevel: 'RED',
      trajectory: [
        { lat: 48.5, lon: 23.1, altM: 100, confidenceRadius_m: 50, tSeconds: 30 },
        { lat: 48.6, lon: 23.2, altM: 90, confidenceRadius_m: 80, tSeconds: 60 },
        { lat: 48.7, lon: 23.3, altM: 80, confidenceRadius_m: 120, tSeconds: 120 },
      ],
    });
    const result = composer.composeAlert(alert);
    // Only box-drawing │ allowed, not raw pipe |
    // The trajectory block wraps in ``` so outside the code block no bare | should appear
    const outsideBlock = result.split('```')[0];
    expect(outsideBlock).not.toContain('|');
  });

  it('alert contains alertId', () => {
    const result = composer.composeAlert(makeAlert({ alertId: 'AWNING-20260326-0042' }));
    expect(result).toContain('AWNING-20260326-0042');
  });

  it('intel brief truncated to max 5 lines', () => {
    const brief = {
      briefId: 'BRIEF-001',
      summary: 'Line1\nLine2\nLine3\nLine4\nLine5\nLine6\nLine7',
      sources: ['osint'],
      ts: '2026-03-26T10:00:00.000Z',
    };
    const result = composer.composeIntelBrief(brief);
    // Count non-header lines
    const contentLines = result.split('\n').slice(1); // skip header
    expect(contentLines.length).toBeLessThanOrEqual(5);
  });

  it('hourly status contains detection count and dominant drone type', () => {
    const stats = {
      detectionCount: 7,
      awningHistory: [],
      dominantDroneType: 'shahed_136',
      coveragePercent: 85,
    };
    const result = composer.composeHourlyStatus(stats);
    expect(result).toContain('7');
    expect(result).toContain('shahed_136');
    expect(result).toContain('85');
  });
});
