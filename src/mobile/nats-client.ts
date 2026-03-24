// APEX-SENTINEL — Mobile NATS Client Wrapper
// FR-W3-05

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type SubjectType = 'detections' | 'health';

export interface NatsClientConfig {
  serverUrls: string[];
  credentialsFile: string;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  heartbeatIntervalMs: number;
}

export class NatsClient {
  private readonly config: NatsClientConfig;
  private state: ConnectionState = 'disconnected';
  private reconnectCount: number = 0;

  constructor(config: NatsClientConfig) {
    this.config = config;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getServerUrls(): string[] {
    return [...this.config.serverUrls];
  }

  getReconnectCount(): number {
    return this.reconnectCount;
  }

  resetReconnectCount(): void {
    this.reconnectCount = 0;
  }

  shouldReconnect(): boolean {
    return this.reconnectCount < this.config.maxReconnectAttempts;
  }

  buildSubject(nodeId: string, type: SubjectType): string {
    if (!nodeId || nodeId.trim().length === 0) {
      throw new Error('nodeId must not be empty or whitespace');
    }
    return `sentinel.${type}.${nodeId}`;
  }
}
