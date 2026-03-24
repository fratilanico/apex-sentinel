export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

export class CircuitBreaker {
  private name: string;
  private options: CircuitBreakerOptions;
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private openedAt: number = 0;

  constructor(name: string, options: CircuitBreakerOptions) {
    this.name = name;
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from open to half-open based on elapsed time
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.options.timeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker "${this.name}" is open — requests are being short-circuited`);
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.successCount += 1;
        if (this.successCount >= this.options.successThreshold) {
          this.state = 'closed';
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else {
        // closed: reset failure count on success
        this.failureCount = 0;
      }

      return result;
    } catch (err) {
      if (this.state === 'half-open') {
        // Probe failed — re-open the circuit
        this.state = 'open';
        this.openedAt = Date.now();
        this.successCount = 0;
      } else {
        // closed
        this.failureCount += 1;
        if (this.failureCount >= this.options.failureThreshold) {
          this.state = 'open';
          this.openedAt = Date.now();
        }
      }
      throw err;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = 0;
  }
}

export interface DLQItem {
  subject: string;
  payload: unknown;
  reason: string;
  timestamp: number;
}

export class DeadLetterQueue {
  private maxSize: number;
  private queue: DLQItem[] = [];

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: DLQItem): void {
    if (this.queue.length >= this.maxSize) {
      // Evict oldest (front of queue)
      this.queue.shift();
    }
    this.queue.push(item);
  }

  pop(): DLQItem | null {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue.shift()!;
  }

  size(): number {
    return this.queue.length;
  }

  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }
}
