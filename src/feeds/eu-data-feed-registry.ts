// APEX-SENTINEL W18 — FR-W18-01: EuDataFeedRegistry

import type { FeedDescriptor, FeedHealth, FeedId, FeedStatus } from './types.js';

export class EuDataFeedRegistry {
  private descriptors = new Map<FeedId, FeedDescriptor>();
  private health = new Map<FeedId, FeedHealth>();

  register(descriptor: FeedDescriptor): void {
    if (this.descriptors.has(descriptor.feedId)) {
      throw new Error(`Feed '${descriptor.feedId}' already registered`);
    }
    this.descriptors.set(descriptor.feedId, descriptor);
    this.health.set(descriptor.feedId, {
      feedId: descriptor.feedId,
      status: 'unknown',
      lastSuccessTs: null,
      errorCount: 0,
      latencyMs: 0,
    });
  }

  deregister(feedId: FeedId): void {
    this.descriptors.delete(feedId);
    this.health.delete(feedId);
  }

  getHealth(feedId: FeedId): FeedHealth | undefined {
    return this.health.get(feedId);
  }

  recordSuccess(feedId: FeedId, latencyMs: number): void {
    const h = this.health.get(feedId);
    if (!h) return;
    h.status = 'healthy';
    h.lastSuccessTs = Date.now();
    h.latencyMs = latencyMs;
    h.errorCount = 0;
  }

  recordError(feedId: FeedId, _error?: Error): void {
    const h = this.health.get(feedId);
    if (!h) return;
    h.errorCount += 1;
    if (h.errorCount >= 5) {
      h.status = 'down';
    } else if (h.errorCount >= 3) {
      h.status = 'degraded';
    }
  }

  getAllHealth(): FeedHealth[] {
    return Array.from(this.health.values());
  }

  getHealthyFeeds(): FeedDescriptor[] {
    const result: FeedDescriptor[] = [];
    for (const [feedId, h] of this.health.entries()) {
      if (h.status === 'healthy' || h.status === 'degraded') {
        const descriptor = this.descriptors.get(feedId);
        if (descriptor) result.push(descriptor);
      }
    }
    return result;
  }

  reset(feedId?: FeedId): void {
    if (feedId !== undefined) {
      const descriptor = this.descriptors.get(feedId);
      if (descriptor) {
        this.health.set(feedId, {
          feedId,
          status: 'unknown',
          lastSuccessTs: null,
          errorCount: 0,
          latencyMs: 0,
        });
      }
    } else {
      this.descriptors.clear();
      this.health.clear();
    }
  }
}
