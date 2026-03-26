// APEX-SENTINEL — W13
// FR-W13-08: TelegramOperatorPipeline (integration)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramOperatorPipeline } from '../../src/operator/telegram-operator-pipeline.js';
import type { AwningAlert } from '../../src/nato/nato-alert-formatter.js';
import type { HttpClient } from '../../src/operator/telegram-bot-gateway.js';
import { EventEmitter } from 'events';

describe('FR-W13-08: TelegramOperatorPipeline', () => {
  const BOT_TOKEN = 'test-bot-token';

  function makeHttpClient(): HttpClient & { calls: unknown[] } {
    const calls: unknown[] = [];
    return {
      calls,
      post: vi.fn(async (_url: string, body: unknown) => {
        calls.push(body);
        return { ok: true, result: {} };
      }),
    };
  }

  function makeNats(): EventEmitter & { subscribe: (subject: string, handler: (msg: unknown) => void) => void } {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      subscribe(subject: string, handler: (msg: unknown) => void) {
        emitter.on(subject, handler);
      },
    });
  }

  const makeAlert = (level: AwningAlert['awningLevel'] = 'RED', droneType = 'fpv_drone'): AwningAlert => ({
    alertId: `AWNING-${Date.now()}`,
    awningLevel: level,
    stage: 3,
    droneType,
    ts: new Date().toISOString(),
    summary: 'Integration test alert',
  });

  let httpClient: ReturnType<typeof makeHttpClient>;
  let nats: ReturnType<typeof makeNats>;
  let pipeline: TelegramOperatorPipeline;

  beforeEach(() => {
    httpClient = makeHttpClient();
    nats = makeNats();
    pipeline = new TelegramOperatorPipeline({ botToken: BOT_TOKEN, nats, httpClient });
    pipeline.addOperator('cmd-1', 'commander', 'chat-100');
    pipeline.addOperator('op-1', 'operator', 'chat-200');
    pipeline.addOperator('an-1', 'analyst', 'chat-300');
    pipeline.start();
  });

  it('pipeline starts without error', () => {
    expect(pipeline).toBeDefined();
  });

  it('RED alert delivered to all 3 operators', async () => {
    const alert = makeAlert('RED');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    // 3 operators × 1 message = 3 HTTP calls
    expect(httpClient.calls.length).toBe(3);
  });

  it('RED alert message contains 🚨', async () => {
    const alert = makeAlert('RED');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    const firstBody = httpClient.calls[0] as Record<string, unknown>;
    expect(firstBody.text).toContain('🚨');
  });

  it('YELLOW alert delivered to operator and analyst only', async () => {
    const alert = makeAlert('YELLOW');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    expect(httpClient.calls.length).toBe(2);
  });

  it('rate-limited 4th RED in same sector is suppressed', async () => {
    // Send 3 RED alerts for same droneType (used as sector key in pipeline)
    for (let i = 0; i < 3; i++) {
      nats.emit('awning.alert', makeAlert('RED', 'fpv_drone'));
      await new Promise(r => setTimeout(r, 10));
    }
    const callsAfter3 = httpClient.calls.length; // 3 × 3 = 9

    // 4th RED — should be rate limited
    nats.emit('awning.alert', makeAlert('RED', 'fpv_drone'));
    await new Promise(r => setTimeout(r, 50));

    expect(httpClient.calls.length).toBe(callsAfter3); // no new calls
  });

  it('rate_limited event emitted when suppressed', async () => {
    const rateLimitedEvents: unknown[] = [];
    pipeline.on('rate_limited', (a) => rateLimitedEvents.push(a));

    for (let i = 0; i < 4; i++) {
      nats.emit('awning.alert', makeAlert('RED', 'drone_x'));
      await new Promise(r => setTimeout(r, 10));
    }

    expect(rateLimitedEvents.length).toBeGreaterThan(0);
  });

  it('WHITE de-escalation notifies commander only', async () => {
    const alert = makeAlert('WHITE');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    expect(httpClient.calls.length).toBe(1); // commander only
  });

  it('/sitrep command returns SITREP string', async () => {
    const result = await pipeline.handleCommand('/sitrep', 'op-1');
    expect(result).toContain('SITREP');
  });

  it('/status command returns operational message', async () => {
    const result = await pipeline.handleCommand('/status', 'op-1');
    expect(result).toContain('operational');
  });

  it('/silence activates silence mode', async () => {
    await pipeline.handleCommand('/silence 15', 'op-1');
    expect(pipeline.isSilenced()).toBe(true);
  });

  it('silenced YELLOW is suppressed', async () => {
    pipeline.setSilence(10); // 10 minutes
    const alert = makeAlert('YELLOW');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    const callCount = httpClient.calls.length;
    expect(callCount).toBe(0);
  });

  it('silenced RED is NOT suppressed (RED bypasses silence)', async () => {
    pipeline.setSilence(10);
    const alert = makeAlert('RED', 'bypass_drone');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    expect(httpClient.calls.length).toBeGreaterThan(0);
  });

  it('audit log records delivery after RED alert', async () => {
    const alert = makeAlert('RED', 'audit_drone');
    nats.emit('awning.alert', alert);
    await new Promise(r => setTimeout(r, 50));
    const entries = pipeline.auditLog.getAll();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].awningLevel).toBe('RED');
  });

  it('audit log records suppressed alert as delivered=false', async () => {
    for (let i = 0; i < 4; i++) {
      nats.emit('awning.alert', makeAlert('RED', 'suppress_test'));
      await new Promise(r => setTimeout(r, 10));
    }
    const failed = pipeline.auditLog.getAll().filter(e => !e.delivered);
    expect(failed.length).toBeGreaterThan(0);
  });
});
