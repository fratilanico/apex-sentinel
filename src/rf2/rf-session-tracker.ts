// APEX-SENTINEL — FR-W12-06: RF Session Tracker
// src/rf2/rf-session-tracker.ts
//
// Tracks RF link sessions. Session = continuous RF detections from same
// protocol+bearing within 60 s inactivity. Flags pre-terminal RF silence.

export interface RfDetection {
  protocol: string;
  lat: number;
  lon: number;
  confidence: number;
  ts: number;
}

export interface Position {
  lat: number;
  lon: number;
  ts: number;
}

export interface RfSession {
  sessionId: string;
  startTs: number;
  lastTs: number;
  protocol: string;
  positionHistory: Position[];
  preterminalFlag: boolean;
  closed: boolean;
}

export interface KnownTarget {
  lat: number;
  lon: number;
}

const INACTIVITY_TIMEOUT_MS = 60000;
const PRETERMINAL_RADIUS_M = 500;

export class RfSessionTracker {
  private sessions: RfSession[] = [];
  private closedSessions: RfSession[] = [];
  private knownTargets: KnownTarget[] = [];
  private sessionSeq = 0;
  private currentTs = 0;

  ingest(detection: RfDetection): void {
    this.currentTs = detection.ts;
    this.expireSessions(detection.ts);

    // Find matching active session (same protocol)
    const existing = this.sessions.find(s => s.protocol === detection.protocol && !s.closed);

    if (existing) {
      existing.lastTs = detection.ts;
      existing.positionHistory.push({ lat: detection.lat, lon: detection.lon, ts: detection.ts });
    } else {
      const sessionId = this.generateSessionId(detection.ts);
      this.sessions.push({
        sessionId,
        startTs: detection.ts,
        lastTs: detection.ts,
        protocol: detection.protocol,
        positionHistory: [{ lat: detection.lat, lon: detection.lon, ts: detection.ts }],
        preterminalFlag: false,
        closed: false,
      });
    }
  }

  tick(nowMs: number): void {
    this.currentTs = nowMs;
    this.expireSessions(nowMs);
  }

  registerKnownTarget(target: KnownTarget): void {
    this.knownTargets.push(target);
  }

  getActiveSessions(): RfSession[] {
    return this.sessions.filter(s => !s.closed);
  }

  getSessionHistory(windowMs: number): RfSession[] {
    const cutoff = this.currentTs - windowMs;
    const closed = this.closedSessions.filter(s => s.lastTs >= cutoff);
    const active = this.sessions.filter(s => !s.closed && s.startTs >= cutoff);
    return [...closed, ...active].sort((a, b) => a.startTs - b.startTs);
  }

  private expireSessions(nowMs: number): void {
    for (const session of this.sessions) {
      if (session.closed) continue;
      const idleMs = nowMs - session.lastTs;
      if (idleMs > INACTIVITY_TIMEOUT_MS) {
        session.closed = true;
        session.preterminalFlag = this.checkPreTerminal(session);
        this.closedSessions.push(session);
      }
    }
    this.sessions = this.sessions.filter(s => !s.closed);
  }

  private checkPreTerminal(session: RfSession): boolean {
    if (this.knownTargets.length === 0) return false;
    if (session.positionHistory.length === 0) return false;

    const lastPos = session.positionHistory[session.positionHistory.length - 1]!;
    for (const target of this.knownTargets) {
      const dist = haversineMetres(lastPos.lat, lastPos.lon, target.lat, target.lon);
      if (dist <= PRETERMINAL_RADIUS_M) return true;
    }
    return false;
  }

  private generateSessionId(ts: number): string {
    const date = new Date(ts);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    this.sessionSeq++;
    const seq = String(this.sessionSeq).padStart(4, '0');
    return `RF-${y}${m}${d}-${seq}`;
  }
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
