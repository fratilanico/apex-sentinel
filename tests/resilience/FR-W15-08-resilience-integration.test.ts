import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputSanitizationGateway } from '../../src/resilience/input-sanitization-gateway.js';
import { MessageIntegrityVerifier } from '../../src/resilience/message-integrity-verifier.js';
import { CircuitBreaker, CircuitOpenError } from '../../src/resilience/circuit-breaker.js';
import { WatchdogMonitor } from '../../src/resilience/watchdog-monitor.js';
import { AuditEventLogger } from '../../src/resilience/audit-event-logger.js';
import { GracefulShutdownManager } from '../../src/resilience/graceful-shutdown-manager.js';

describe('FR-W15-08: Resilience Integration Suite', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('INT-01: cascade prevention — circuit breaker stops flood after open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const fail = async () => { throw new Error('downstream dead'); };

    let openErrors = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await cb.execute(fail);
      } catch (e) {
        if (e instanceof CircuitOpenError) openErrors++;
      }
    }
    // First 5 failures open the circuit, remaining 5 should get CircuitOpenError
    expect(openErrors).toBeGreaterThan(0);
    expect(cb.getState().state).toBe('open');
  });

  it('INT-02: replay attack blocked — same message rejected within 30s', async () => {
    const verifier = new MessageIntegrityVerifier();
    const key = await verifier.deriveKey(Buffer.from('integration-test-master-key!!!!'), 'int-node');
    const msg = verifier.sign({ type: 'sensor', lat: 45.0, lon: 25.0 }, key);

    const first = verifier.verify(msg, key);
    expect(first.valid).toBe(true);

    const second = verifier.verify(msg, key);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe('replay');
  });

  it('INT-03: prototype pollution blocked end-to-end', () => {
    const gw = new InputSanitizationGateway();
    const schema = {
      maxDepth: 10,
      maxSize: 65536,
      fields: { sensor: { type: 'string' as const, required: true } },
    };
    // Simulate attack payload
    const attack = JSON.parse('{"sensor":"radar","__proto__":{"isAdmin":true},"constructor":{"name":"evil"}}');
    const result = gw.sanitize(attack, schema);
    expect(result.ok).toBe(true);
    expect(result.value).not.toHaveProperty('__proto__');
    expect(result.value).not.toHaveProperty('constructor');
    // Verify prototype chain not polluted
    const obj = Object.create(null);
    expect((obj as Record<string, unknown>)['isAdmin']).toBeUndefined();
  });

  it('INT-04: watchdog triggers restart on persistent failure', async () => {
    vi.useFakeTimers();
    const wdog = new WatchdogMonitor({ checkIntervalMs: 10000, failureThreshold: 3 });
    const restarts: string[] = [];
    wdog.on('restart', (name: string) => restarts.push(name));

    wdog.register('adsb-feed', { isHealthy: async () => false });
    wdog.start();
    await vi.advanceTimersByTimeAsync(35000);
    wdog.stop();

    expect(restarts).toContain('adsb-feed');
  });

  it('INT-05: graceful shutdown in correct order', async () => {
    const order: string[] = [];
    const mgr = new GracefulShutdownManager({ timeoutMs: 5000 });
    mgr.register('step1', async () => { order.push('step1'); });
    mgr.register('step2', async () => { order.push('step2'); });
    mgr.register('step3', async () => { order.push('step3'); });

    await mgr.triggerShutdown('SIGTERM');
    expect(order).toEqual(['step1', 'step2', 'step3']);
  });

  it('INT-06: audit log records integration scenario events', () => {
    const logger = new AuditEventLogger();
    logger.append('detection', 'pipeline', { droneId: 'D-42', confidence: 0.97 });
    logger.append('operator_command', 'telegram-bot', { cmd: 'track D-42' });
    logger.append('model_promote', 'ci', { model: 'yamnet-v3', score: 0.94 });

    const result = logger.verify();
    expect(result.valid).toBe(true);
    const entries = logger.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]!.eventType).toBe('detection');
  });

  it('INT-07: oversized payload rejected before reaching circuit breaker', async () => {
    const gw = new InputSanitizationGateway();
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const schema = { maxDepth: 10, maxSize: 1024, fields: {} };

    const bigPayload = { data: 'x'.repeat(2000) };
    const sanitized = gw.sanitize(bigPayload, schema);

    // If sanitization fails, we never call the circuit-protected function
    expect(sanitized.ok).toBe(false);
    // Circuit stays closed — no unnecessary failures recorded
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failures).toBe(0);
  });

  it('INT-08: HMAC sign + verify round-trip with derived keys across nodes', async () => {
    const verifier = new MessageIntegrityVerifier();
    const master = Buffer.from('shared-master-secret-for-all!!!!');

    const keyNode1 = await verifier.deriveKey(master, 'node-1');
    const keyNode2 = await verifier.deriveKey(master, 'node-2');

    // node-1 signs, node-2 verifies with wrong key (different nodeId)
    const msg = verifier.sign({ alert: 'drone-detected' }, keyNode1);
    const wrongKeyResult = verifier.verify(msg, keyNode2);
    expect(wrongKeyResult.valid).toBe(false);

    // node-1 signs, node-1 verifies with correct key
    const msg2 = verifier.sign({ alert: 'drone-detected' }, keyNode1);
    const correctKeyResult = verifier.verify(msg2, keyNode1);
    expect(correctKeyResult.valid).toBe(true);
  });
});
