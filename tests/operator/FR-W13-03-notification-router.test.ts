// APEX-SENTINEL — W13
// FR-W13-03: OperatorNotificationRouter

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperatorNotificationRouter } from '../../src/operator/operator-notification-router.js';
import type { AwningAlert } from '../../src/nato/nato-alert-formatter.js';
import type { HttpClient } from '../../src/operator/telegram-bot-gateway.js';

describe('FR-W13-03: OperatorNotificationRouter', () => {
  const BOT_TOKEN = 'test-token';

  function makeHttpClient(): HttpClient {
    return { post: vi.fn(async () => ({ ok: true, result: {} })) };
  }

  const makeAlert = (level: AwningAlert['awningLevel']): AwningAlert => ({
    alertId: 'AWNING-20260326-0001',
    awningLevel: level,
    stage: 2,
    droneType: 'fpv_drone',
    ts: '2026-03-26T10:00:00.000Z',
    summary: 'test alert',
  });

  let router: OperatorNotificationRouter;
  let httpClient: HttpClient;

  beforeEach(() => {
    httpClient = makeHttpClient();
    router = new OperatorNotificationRouter({ botToken: BOT_TOKEN, httpClient });
    router.addOperator('cmd-1', 'commander', 'chat-100');
    router.addOperator('op-1', 'operator', 'chat-200');
    router.addOperator('an-1', 'analyst', 'chat-300');
  });

  it('addOperator registers operator', () => {
    const ops = router.getOperators();
    expect(ops).toHaveLength(3);
  });

  it('removeOperator removes operator', () => {
    router.removeOperator('op-1');
    expect(router.getOperators()).toHaveLength(2);
  });

  it('RED alert routes to all 3 roles', async () => {
    const notified = await router.routeAlert(makeAlert('RED'), '🚨 RED');
    expect(notified).toHaveLength(3);
  });

  it('RED alert includes commander', async () => {
    const notified = await router.routeAlert(makeAlert('RED'), '🚨 RED');
    expect(notified).toContain('cmd-1');
  });

  it('YELLOW alert routes to operator and analyst (not commander)', async () => {
    const notified = await router.routeAlert(makeAlert('YELLOW'), '⚠️ YELLOW');
    expect(notified).toContain('op-1');
    expect(notified).toContain('an-1');
    expect(notified).not.toContain('cmd-1');
  });

  it('WHITE de-escalation routes to commander only', async () => {
    const notified = await router.routeAlert(makeAlert('WHITE'), '✅ WHITE');
    expect(notified).toContain('cmd-1');
    expect(notified).not.toContain('op-1');
    expect(notified).not.toContain('an-1');
  });

  it('intel brief routes to analyst only', async () => {
    const notified = await router.routeIntelBrief('📋 Brief');
    expect(notified).toContain('an-1');
    expect(notified).not.toContain('cmd-1');
    expect(notified).not.toContain('op-1');
  });

  it('getOperatorsByRole returns matching operators', () => {
    const analysts = router.getOperatorsByRole('analyst');
    expect(analysts).toHaveLength(1);
    expect(analysts[0].operatorId).toBe('an-1');
  });

  it('routeAlert returns empty list if no operators registered', async () => {
    const emptyRouter = new OperatorNotificationRouter({ botToken: BOT_TOKEN, httpClient });
    const notified = await emptyRouter.routeAlert(makeAlert('RED'), 'RED');
    expect(notified).toHaveLength(0);
  });

  it('multiple operators of same role all notified', async () => {
    router.addOperator('op-2', 'operator', 'chat-201');
    const notified = await router.routeAlert(makeAlert('YELLOW'), '⚠️');
    const opNotified = notified.filter(id => id.startsWith('op-'));
    expect(opNotified).toHaveLength(2);
  });
});
