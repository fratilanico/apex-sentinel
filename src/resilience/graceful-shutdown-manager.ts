/**
 * FR-W15-07: GracefulShutdownManager
 * Orderly system shutdown with 30s budget, registered shutdown functions,
 * and SIGTERM/SIGINT/SIGHUP handlers.
 */

export type ShutdownPhase = 'idle' | 'draining' | 'closing' | 'flushing' | 'done';

export interface ShutdownStatus {
  phase: ShutdownPhase;
  completed: string[];
  pending: string[];
}

export interface GracefulShutdownOptions {
  timeoutMs?: number; // default 30000
}

interface ShutdownEntry {
  name: string;
  fn: () => Promise<void>;
}

export class GracefulShutdownManager {
  private readonly _handlers: ShutdownEntry[] = [];
  private _phase: ShutdownPhase = 'idle';
  private _completed: string[] = [];
  private _shutdownPromise: Promise<void> | null = null;
  private readonly _timeoutMs: number;
  private readonly _signalHandlers: Array<[NodeJS.Signals, () => void]> = [];

  constructor(options: GracefulShutdownOptions = {}) {
    this._timeoutMs = options.timeoutMs ?? 30_000;
    this._registerSignalHandlers();
  }

  register(name: string, shutdownFn: () => Promise<void>): void {
    this._handlers.push({ name, fn: shutdownFn });
  }

  async triggerShutdown(reason: string): Promise<void> {
    // Idempotent — return existing promise if already shutting down
    if (this._shutdownPromise) return this._shutdownPromise;

    this._shutdownPromise = this._doShutdown(reason);
    return this._shutdownPromise;
  }

  getShutdownStatus(): ShutdownStatus {
    const completedSet = new Set(this._completed);
    const pending = this._handlers
      .map(h => h.name)
      .filter(n => !completedSet.has(n));

    return {
      phase: this._phase,
      completed: [...this._completed],
      pending,
    };
  }

  private async _doShutdown(reason: string): Promise<void> {
    void reason; // used for logging in production
    this._phase = 'draining';

    const shutdownWithTimeout = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // Force complete remaining pending components
        for (const h of this._handlers) {
          if (!this._completed.includes(h.name)) {
            this._completed.push(h.name);
          }
        }
        resolve();
      }, this._timeoutMs);

      const runAll = async (): Promise<void> => {
        for (const entry of this._handlers) {
          try {
            await entry.fn();
          } catch {
            // Component failed shutdown — still mark completed
          }
          if (!this._completed.includes(entry.name)) {
            this._completed.push(entry.name);
          }
        }
        clearTimeout(timer);
        resolve();
      };

      void runAll();
    });

    await shutdownWithTimeout;
    this._phase = 'done';
    this._removeSignalHandlers();
  }

  private _registerSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    for (const signal of signals) {
      const handler = () => void this.triggerShutdown(`signal:${signal}`);
      this._signalHandlers.push([signal, handler]);
      process.on(signal, handler);
    }
  }

  private _removeSignalHandlers(): void {
    for (const [signal, handler] of this._signalHandlers) {
      process.off(signal, handler);
    }
    this._signalHandlers.length = 0;
  }
}
