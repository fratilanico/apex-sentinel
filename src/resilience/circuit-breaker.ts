/**
 * FR-W15-03: CircuitBreaker
 * Prevents cascade failures via open/closed/half-open FSM.
 * Opens after 5 consecutive failures. Half-open after 60s. Closes on probe success.
 */

export class CircuitOpenError extends Error {
  constructor(message = 'circuit is open — request rejected') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure?: number;
  nextProbeAt?: number;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;   // default 5
  openTimeout?: number;        // ms before transitioning open→half-open, default 60000
}

export class CircuitBreaker {
  private _state: CircuitState = 'closed';
  private _failures = 0;
  private _lastFailure?: number;
  private _openedAt?: number;
  private readonly _failureThreshold: number;
  private readonly _openTimeout: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this._failureThreshold = options.failureThreshold ?? 5;
    this._openTimeout = options.openTimeout ?? 60_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this._maybeTransitionToHalfOpen();

    if (this._state === 'open') {
      throw new CircuitOpenError();
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  getState(): CircuitBreakerState {
    this._maybeTransitionToHalfOpen();
    const base: CircuitBreakerState = {
      state: this._state,
      failures: this._failures,
    };
    if (this._lastFailure !== undefined) base.lastFailure = this._lastFailure;
    if (this._openedAt !== undefined && this._state !== 'closed') {
      base.nextProbeAt = this._openedAt + this._openTimeout;
    }
    return base;
  }

  private _onSuccess(): void {
    this._failures = 0;
    this._state = 'closed';
    this._openedAt = undefined;
  }

  private _onFailure(): void {
    this._failures++;
    this._lastFailure = Date.now();
    if (this._state === 'half-open' || this._failures >= this._failureThreshold) {
      this._state = 'open';
      this._openedAt = Date.now();
    }
  }

  private _maybeTransitionToHalfOpen(): void {
    if (
      this._state === 'open' &&
      this._openedAt !== undefined &&
      Date.now() >= this._openedAt + this._openTimeout
    ) {
      this._state = 'half-open';
    }
  }
}
