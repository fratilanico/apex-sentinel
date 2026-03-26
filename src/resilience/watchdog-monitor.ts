/**
 * FR-W15-04: WatchdogMonitor
 * Monitors system component health. Emits 'restart' after 3 consecutive failures.
 * Emits 'system_critical' if no health check has completed in deadManTimeoutMs (dead-man switch).
 */

import { EventEmitter } from 'node:events';

export interface HealthCheckable {
  isHealthy(): Promise<boolean>;
}

export interface ComponentHealth {
  healthy: boolean;
  consecutiveFailures: number;
}

export interface HealthReport {
  [name: string]: ComponentHealth;
}

export interface WatchdogOptions {
  checkIntervalMs?: number;   // default 10000
  failureThreshold?: number;  // default 3
  deadManTimeoutMs?: number;  // default 60000
}

interface ComponentEntry {
  component: HealthCheckable;
  consecutiveFailures: number;
  healthy: boolean;
}

export class WatchdogMonitor extends EventEmitter {
  private readonly _components = new Map<string, ComponentEntry>();
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _deadManTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastCompletedCheck = 0; // 0 means not yet started
  private _started = false;
  private readonly _checkIntervalMs: number;
  private readonly _failureThreshold: number;
  private readonly _deadManTimeoutMs: number;

  constructor(options: WatchdogOptions = {}) {
    super();
    this._checkIntervalMs = options.checkIntervalMs ?? 10_000;
    this._failureThreshold = options.failureThreshold ?? 3;
    this._deadManTimeoutMs = options.deadManTimeoutMs ?? 60_000;
  }

  register(name: string, component: HealthCheckable): void {
    this._components.set(name, { component, consecutiveFailures: 0, healthy: true });
  }

  unregister(name: string): void {
    this._components.delete(name);
  }

  getHealthReport(): HealthReport {
    const report: HealthReport = {};
    for (const [name, entry] of this._components) {
      report[name] = {
        healthy: entry.healthy,
        consecutiveFailures: entry.consecutiveFailures,
      };
    }
    return report;
  }

  start(): void {
    this._started = true;
    this._lastCompletedCheck = Date.now();
    this._scheduleDeadMan();
    this._timer = setInterval(() => void this._runChecks(), this._checkIntervalMs);
  }

  stop(): void {
    this._started = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._deadManTimer) {
      clearTimeout(this._deadManTimer);
      this._deadManTimer = null;
    }
  }

  private _scheduleDeadMan(): void {
    if (this._deadManTimer) clearTimeout(this._deadManTimer);
    this._deadManTimer = setTimeout(() => {
      if (!this._started) return;
      const elapsed = Date.now() - this._lastCompletedCheck;
      if (elapsed >= this._deadManTimeoutMs) {
        this.emit('system_critical');
      } else {
        // Re-schedule for remainder
        this._deadManTimer = setTimeout(() => {
          if (this._started) this.emit('system_critical');
        }, this._deadManTimeoutMs - elapsed);
      }
    }, this._deadManTimeoutMs);
  }

  private async _runChecks(): Promise<void> {
    const checkPromises: Promise<void>[] = [];
    for (const [name, entry] of this._components) {
      checkPromises.push(this._checkComponent(name, entry));
    }
    await Promise.allSettled(checkPromises);
    this._lastCompletedCheck = Date.now();
    // Reset dead-man since we just completed a cycle
    if (this._started) this._scheduleDeadMan();
  }

  private async _checkComponent(name: string, entry: ComponentEntry): Promise<void> {
    let healthy = false;
    try {
      const result = await Promise.race([
        entry.component.isHealthy(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('health check timeout')), this._deadManTimeoutMs),
        ),
      ]);
      healthy = result === true;
    } catch {
      healthy = false;
    }

    entry.healthy = healthy;
    if (healthy) {
      entry.consecutiveFailures = 0;
    } else {
      entry.consecutiveFailures++;
      if (entry.consecutiveFailures >= this._failureThreshold) {
        this.emit('restart', name);
        entry.consecutiveFailures = 0; // reset so we don't spam
      }
    }
  }
}
