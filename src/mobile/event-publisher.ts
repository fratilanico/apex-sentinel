// APEX-SENTINEL — Mobile Event Publisher + Offline Buffer
// FR-W3-06

export interface PublishResult {
  success: boolean;
  error?: string;
}

export interface PendingEvent {
  subject: string;
  payload: string;
  createdAt: number;
}

export class EventPublisher {
  private readonly maxBufferSize: number;
  private pendingEvents: PendingEvent[] = [];

  constructor(maxBufferSize: number) {
    this.maxBufferSize = maxBufferSize;
  }

  buildDetectionPayload(
    nodeId: string,
    droneConfidence: number,
    lat: number,
    lon: number,
    altM: number,
  ): string {
    const truncatedLat = parseFloat(lat.toFixed(5));
    const truncatedLon = parseFloat(lon.toFixed(5));
    const timestampUs = String(Date.now() * 1000);

    return JSON.stringify({
      nodeId,
      droneConfidence,
      lat: truncatedLat,
      lon: truncatedLon,
      altM,
      timestampUs,
    });
  }

  validatePayload(payload: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      errors.push('invalid JSON: parse error');
      return { valid: false, errors };
    }

    if (!parsed['nodeId']) {
      errors.push('missing required field: nodeId');
    }

    return { valid: errors.length === 0, errors };
  }

  bufferEvent(subject: string, payload: string): void {
    this.pendingEvents.push({
      subject,
      payload,
      createdAt: Date.now(),
    });
  }

  flushPending(): PendingEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  getPendingCount(): number {
    return this.pendingEvents.length;
  }

  isBufferFull(): boolean {
    return this.pendingEvents.length >= this.maxBufferSize;
  }

  pruneOldEvents(maxAgeMs: number): number {
    const now = Date.now();
    const before = this.pendingEvents.length;
    this.pendingEvents = this.pendingEvents.filter(
      (event) => now - event.createdAt <= maxAgeMs,
    );
    return before - this.pendingEvents.length;
  }
}
