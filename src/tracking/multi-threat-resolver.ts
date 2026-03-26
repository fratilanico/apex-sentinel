// APEX-SENTINEL — W8 Multi-Threat Resolver
// FR-W8-07 | src/tracking/multi-threat-resolver.ts
//
// Extends TrackManager for 8+ concurrent threats.
// Swarm detection at ≥3 simultaneous tracks.
// Collision detection at <10m separation.
// Track eviction at 30s stale timeout.

import { randomUUID } from 'crypto';

export interface ThreatTrack {
  trackId: string;
  position: { lat: number; lon: number; altM: number };
  acousticSignature: string;
  droneProfile?: string;
  isTerminalPhase: boolean;
  createdAtMs: number;
  lastUpdatedMs: number;
}

export interface SwarmEvent {
  type: 'swarm.detected';
  trackCount: number;
  trackIds: string[];
  detectedAt: number;
}

export interface CollisionEvent {
  type: 'track.multi.collision';
  trackIdA: string;
  trackIdB: string;
  separationM: number;
  detectedAt: number;
}

export interface MultiThreatSession {
  sessionId: string;
  peakTrackCount: number;
  swarmDetected: boolean;
  startedAt: number;
  tracks: string[];
}

const DEG_TO_M = 111_000;
const SWARM_THRESHOLD = 3;
const COLLISION_THRESHOLD_M = 10;
const STALE_TIMEOUT_MS = 30_000;

function distanceM(a: ThreatTrack['position'], b: ThreatTrack['position']): number {
  const dLat = (a.lat - b.lat) * DEG_TO_M;
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dLon = (a.lon - b.lon) * DEG_TO_M * cosLat;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export type MultiThreatEvent = SwarmEvent | CollisionEvent;

export class MultiThreatResolver {
  private tracks = new Map<string, ThreatTrack>();
  private eventHandlers: ((event: MultiThreatEvent) => void)[] = [];
  private session: MultiThreatSession | null = null;
  private natsClient: { publish: (subject: string, payload: unknown) => void } | null = null;
  private supabaseClient: { insert: (table: string, row: object) => Promise<void> } | null = null;
  private telegramClient: { sendAlert: (msg: string) => Promise<void> } | null = null;

  setNatsClient(client: { publish: (subject: string, payload: unknown) => void }): void {
    this.natsClient = client;
  }

  setSupabaseClient(client: { insert: (table: string, row: object) => Promise<void> }): void {
    this.supabaseClient = client;
  }

  setTelegramClient(client: { sendAlert: (msg: string) => Promise<void> }): void {
    this.telegramClient = client;
  }

  onEvent(handler: (event: MultiThreatEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: MultiThreatEvent): void {
    for (const h of this.eventHandlers) h(event);
    // NATS publish
    if (event.type === 'swarm.detected') {
      this.natsClient?.publish('track.swarm.detected', event);
    } else if (event.type === 'track.multi.collision') {
      this.natsClient?.publish('track.multi.collision', event);
    }
  }

  addTrack(position: ThreatTrack['position'], acousticSignature: string, isTerminalPhase = false): ThreatTrack {
    // Check for existing track at same position + same signature (update, not new)
    for (const existing of this.tracks.values()) {
      const dist = distanceM(existing.position, position);
      if (dist < 1 && existing.acousticSignature === acousticSignature) {
        // Update existing track
        existing.position = position;
        existing.lastUpdatedMs = Date.now();
        return existing;
      }
    }

    const trackId = `MT-${randomUUID().substring(0, 8).toUpperCase()}`;
    const track: ThreatTrack = {
      trackId,
      position,
      acousticSignature,
      isTerminalPhase,
      createdAtMs: Date.now(),
      lastUpdatedMs: Date.now(),
    };
    this.tracks.set(trackId, track);

    this.checkSwarm();
    this.checkCollisions(track);
    this.updateSession();

    return track;
  }

  private checkSwarm(): void {
    const count = this.tracks.size;
    if (count >= SWARM_THRESHOLD) {
      const event: SwarmEvent = {
        type: 'swarm.detected',
        trackCount: count,
        trackIds: Array.from(this.tracks.keys()),
        detectedAt: Date.now(),
      };
      this.emit(event);

      // Persist swarm session to Supabase
      this.supabaseClient?.insert('multi_threat_sessions', {
        session_id: this.session?.sessionId ?? randomUUID(),
        peak_track_count: count,
        swarm_detected: true,
        track_ids: Array.from(this.tracks.keys()),
        created_at: new Date().toISOString(),
      });

      // Telegram alert
      this.telegramClient?.sendAlert(`🚨 SWARM DETECTED: ${count} concurrent threats`);
    }
  }

  private checkCollisions(newTrack: ThreatTrack): void {
    for (const existing of this.tracks.values()) {
      if (existing.trackId === newTrack.trackId) continue;
      const dist = distanceM(existing.position, newTrack.position);
      if (dist < COLLISION_THRESHOLD_M) {
        const event: CollisionEvent = {
          type: 'track.multi.collision',
          trackIdA: newTrack.trackId,
          trackIdB: existing.trackId,
          separationM: dist,
          detectedAt: Date.now(),
        };
        this.emit(event);
      }
    }
  }

  private updateSession(): void {
    if (!this.session) {
      this.session = {
        sessionId: randomUUID(),
        peakTrackCount: 0,
        swarmDetected: false,
        startedAt: Date.now(),
        tracks: [],
      };
    }
    if (this.tracks.size > this.session.peakTrackCount) {
      this.session.peakTrackCount = this.tracks.size;
    }
    if (this.tracks.size >= SWARM_THRESHOLD) {
      this.session.swarmDetected = true;
    }
  }

  evictStaleTracks(nowMs?: number): string[] {
    const now = nowMs ?? Date.now();
    const evicted: string[] = [];
    for (const [id, track] of this.tracks.entries()) {
      if (now - track.lastUpdatedMs > STALE_TIMEOUT_MS) {
        this.tracks.delete(id);
        evicted.push(id);
      }
    }
    return evicted;
  }

  getActiveTracks(): ThreatTrack[] {
    return Array.from(this.tracks.values());
  }

  getPriorityTrack(): ThreatTrack | null {
    const tracks = Array.from(this.tracks.values());
    if (tracks.length === 0) return null;
    // Terminal phase always wins
    const terminal = tracks.find(t => t.isTerminalPhase);
    return terminal ?? tracks[0];
  }

  getSession(): MultiThreatSession | null {
    return this.session;
  }

  reset(): void {
    this.tracks.clear();
    this.session = null;
  }
}
