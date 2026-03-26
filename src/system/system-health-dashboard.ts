// APEX-SENTINEL — W16 SystemHealthDashboard
// FR-W16-03 | src/system/system-health-dashboard.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type ComponentStatusLevel = 'online' | 'degraded' | 'offline';

export interface ComponentHealth {
  name: string;
  status: ComponentStatusLevel;
  detail?: string;
}

export interface HealthReport {
  score: number;
  components: ComponentHealth[];
  degradations: string[];
}

export interface NatsPublishClient {
  publish(subject: string, data: unknown): void;
}

export interface FeedClientStatus {
  name: string;
  status: ComponentStatusLevel;
}

export interface NodeAggregator {
  getOfflineCount(): number;
}

// ── Deduction rules ───────────────────────────────────────────────────────────
// offline feed client: -20 per client
// NATS degraded: -40
// each additional offline sensor node (beyond first): -15

// ── SystemHealthDashboard ─────────────────────────────────────────────────────

export class SystemHealthDashboard {
  private natsStatus: ComponentStatusLevel = 'online';
  private feedClients: FeedClientStatus[] = [];
  private nodeAggregator: NodeAggregator | null = null;
  private natsClient: NatsPublishClient | null = null;
  private publishIntervalId: ReturnType<typeof setInterval> | null = null;

  setNatsClient(client: NatsPublishClient): void {
    this.natsClient = client;
  }

  setNatsStatus(status: ComponentStatusLevel): void {
    this.natsStatus = status;
  }

  setFeedClients(clients: FeedClientStatus[]): void {
    this.feedClients = [...clients];
  }

  setNodeAggregator(aggregator: NodeAggregator): void {
    this.nodeAggregator = aggregator;
  }

  getSystemScore(): number {
    let score = 100;
    const offlineFeeds = this.feedClients.filter(f => f.status === 'offline');
    score -= offlineFeeds.length * 20;

    if (this.natsStatus === 'degraded' || this.natsStatus === 'offline') {
      score -= 40;
    }

    if (this.nodeAggregator) {
      const offlineNodes = this.nodeAggregator.getOfflineCount();
      // deduct -15 per offline node beyond the first
      if (offlineNodes > 1) {
        score -= (offlineNodes - 1) * 15;
      }
    }

    return Math.max(0, score);
  }

  getHealthReport(): HealthReport {
    const score = this.getSystemScore();
    const components: ComponentHealth[] = [];
    const degradations: string[] = [];

    // NATS
    components.push({ name: 'NATS', status: this.natsStatus });
    if (this.natsStatus !== 'online') {
      degradations.push(`NATS is ${this.natsStatus} (-40 points)`);
    }

    // Feed clients
    for (const fc of this.feedClients) {
      components.push({ name: fc.name, status: fc.status });
      if (fc.status === 'offline') {
        degradations.push(`Feed ${fc.name} offline (-20 points)`);
      } else if (fc.status === 'degraded') {
        components[components.length - 1].detail = 'Partial data';
      }
    }

    // Node aggregator
    if (this.nodeAggregator) {
      const offlineCount = this.nodeAggregator.getOfflineCount();
      const nodeStatus: ComponentStatusLevel = offlineCount === 0 ? 'online' : offlineCount > 1 ? 'degraded' : 'online';
      components.push({ name: 'SensorNodes', status: nodeStatus, detail: `${offlineCount} offline` });
      if (offlineCount > 1) {
        degradations.push(`${offlineCount - 1} additional sensor nodes offline (-${(offlineCount - 1) * 15} points)`);
      }
    }

    return { score, components, degradations };
  }

  startPublishing(intervalMs = 30_000): void {
    if (this.publishIntervalId) return;
    this.publishIntervalId = setInterval(() => {
      if (this.natsClient) {
        const report = this.getHealthReport();
        this.natsClient.publish('system.health', {
          ...report,
          ts: Date.now(),
        });
      }
    }, intervalMs);
  }

  stopPublishing(): void {
    if (this.publishIntervalId) {
      clearInterval(this.publishIntervalId);
      this.publishIntervalId = null;
    }
  }

  publishNow(): void {
    if (this.natsClient) {
      const report = this.getHealthReport();
      this.natsClient.publish('system.health', { ...report, ts: Date.now() });
    }
  }
}
