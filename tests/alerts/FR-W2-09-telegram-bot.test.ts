// APEX-SENTINEL — TDD RED Tests
// FR-W2-09: Telegram Alert Bot
// Status: RED — implementation in src/alerts/telegram-bot.ts NOT_IMPLEMENTED

import { describe, it, expect } from 'vitest';
import {
  formatTelegramMessage,
  formatTelegramMarkdown,
  shouldSendAlert,
  buildAlertKey,
} from '../../src/alerts/telegram-bot.js';
import type { ThreatAlert } from '../../src/alerts/telegram-bot.js';

function makeAlert(overrides: Partial<ThreatAlert> = {}): ThreatAlert {
  return {
    trackId: 'TRK-W2-001',
    threatClass: 'fpv_drone',
    lat: 48.2255,
    lon: 24.3370,
    altM: 85,
    confidence: 0.94,
    speedMs: 22.5,
    headingDeg: 217,
    detectedAt: '2026-03-24T14:32:00.000Z',
    nodeCount: 3,
    errorM: 12,
    ...overrides,
  };
}

describe('FR-W2-09-01: formatTelegramMessage includes threat class', () => {
  it('should include fpv_drone in the message output', () => {
    const msg = formatTelegramMessage(makeAlert({ threatClass: 'fpv_drone' }));
    expect(msg).toMatch(/fpv_drone|FPV|drone/i);
  });

  it('should include shahed in the message when threatClass is shahed', () => {
    const msg = formatTelegramMessage(makeAlert({ threatClass: 'shahed' }));
    expect(msg).toMatch(/shahed/i);
  });
});

describe('FR-W2-09-02: formatTelegramMessage includes lat/lon coordinates', () => {
  it('should contain the latitude value', () => {
    const alert = makeAlert({ lat: 48.2255, lon: 24.337 });
    const msg = formatTelegramMessage(alert);
    expect(msg).toContain('48');
  });

  it('should contain the longitude value', () => {
    const alert = makeAlert({ lat: 48.2255, lon: 24.337 });
    const msg = formatTelegramMessage(alert);
    expect(msg).toContain('24');
  });
});

describe('FR-W2-09-03: formatTelegramMessage includes confidence as percentage', () => {
  it('should render confidence 0.94 as "94%" in the message', () => {
    const msg = formatTelegramMessage(makeAlert({ confidence: 0.94 }));
    expect(msg).toContain('94%');
  });

  it('should render confidence 0.80 as "80%" in the message', () => {
    const msg = formatTelegramMessage(makeAlert({ confidence: 0.80 }));
    expect(msg).toContain('80%');
  });
});

describe('FR-W2-09-04: formatTelegramMessage includes altitude', () => {
  it('should include the altitude value in the message', () => {
    const msg = formatTelegramMessage(makeAlert({ altM: 85 }));
    expect(msg).toContain('85');
  });

  it('should contain a unit indicator for altitude (m or alt)', () => {
    const msg = formatTelegramMessage(makeAlert({ altM: 120 }));
    expect(msg).toMatch(/120.*m|alt.*120|120.*alt/i);
  });
});

describe('FR-W2-09-05: formatTelegramMarkdown uses Markdown bold/code syntax', () => {
  it('should contain asterisk (*) or backtick (`) for Markdown formatting', () => {
    const md = formatTelegramMarkdown(makeAlert());
    const hasMarkdown = md.includes('*') || md.includes('`');
    expect(hasMarkdown).toBe(true);
  });

  it('should contain threat class information', () => {
    const md = formatTelegramMarkdown(makeAlert({ threatClass: 'helicopter' }));
    expect(md).toMatch(/helicopter/i);
  });
});

describe('FR-W2-09-06: shouldSendAlert returns false when confidence < minConfidence', () => {
  it('should return false for confidence 0.70 with minConfidence 0.75', () => {
    const alert = makeAlert({ confidence: 0.70 });
    expect(shouldSendAlert(alert, 0.75)).toBe(false);
  });

  it('should return false for confidence 0.50 with minConfidence 0.90', () => {
    const alert = makeAlert({ confidence: 0.50 });
    expect(shouldSendAlert(alert, 0.90)).toBe(false);
  });
});

describe('FR-W2-09-07: shouldSendAlert returns true when confidence >= minConfidence', () => {
  it('should return true for confidence 0.94 with minConfidence 0.90', () => {
    const alert = makeAlert({ confidence: 0.94 });
    expect(shouldSendAlert(alert, 0.90)).toBe(true);
  });

  it('should return true when confidence exactly equals minConfidence', () => {
    const alert = makeAlert({ confidence: 0.80 });
    expect(shouldSendAlert(alert, 0.80)).toBe(true);
  });
});

describe('FR-W2-09-08: shouldSendAlert returns false for unknown threatClass regardless of confidence', () => {
  it('should return false for unknown threatClass even with high confidence', () => {
    const alert = makeAlert({ threatClass: 'unknown', confidence: 0.99 });
    expect(shouldSendAlert(alert, 0.50)).toBe(false);
  });

  it('should return false for unknown with minConfidence of 0', () => {
    const alert = makeAlert({ threatClass: 'unknown', confidence: 1.0 });
    expect(shouldSendAlert(alert, 0)).toBe(false);
  });
});

describe('FR-W2-09-09: buildAlertKey returns string containing trackId', () => {
  it('should contain the trackId in the key', () => {
    const key = buildAlertKey(makeAlert({ trackId: 'TRK-W2-001' }));
    expect(key).toContain('TRK-W2-001');
  });

  it('should return a non-empty string', () => {
    const key = buildAlertKey(makeAlert());
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});

describe('FR-W2-09-10: formatTelegramMessage does NOT contain pipe table characters', () => {
  it('should not contain pipe (|) characters — pipes break Telegram rendering', () => {
    const msg = formatTelegramMessage(makeAlert());
    expect(msg).not.toContain('|');
  });

  it('should remain pipe-free for all threat classes', () => {
    const classes: ThreatAlert['threatClass'][] = [
      'fpv_drone',
      'shahed',
      'helicopter',
      'unknown',
    ];
    for (const threatClass of classes) {
      const msg = formatTelegramMessage(makeAlert({ threatClass }));
      expect(msg).not.toContain('|');
    }
  });
});
