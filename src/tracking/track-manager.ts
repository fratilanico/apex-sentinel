// APEX-SENTINEL — Track Manager
// W1 | src/tracking/track-manager.ts

import { Track, TrackState, Position4D, ThreatClass } from './types.js';
import { randomUUID } from 'crypto';

export interface TrackUpdate {
  position: Position4D;
  confidence: number;
  gate: number;
}

const DEG_TO_M = 111_000;
const CONFIRMED_THRESHOLD = 3;
const COAST_TIMEOUT_MS = 15_000;

function distanceM(a: Position4D, b: Position4D): number {
  const dLat = (a.lat - b.lat) * DEG_TO_M;
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dLon = (a.lon - b.lon) * DEG_TO_M * cosLat;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class TrackManager {
  private tracks = new Map<string, Track>();

  initiate(update: TrackUpdate): Track {
    const trackId = `TRK-${randomUUID().substring(0, 8).toUpperCase()}`;
    const now = update.position.timestampUs;
    const track: Track = {
      trackId,
      state: 'tentative',
      threatClass: 'unknown' as ThreatClass,
      position: update.position,
      velocity: { vLatMs: 0, vLonMs: 0, vAltMs: 0 },
      confidence: update.confidence,
      updateCount: 1,
      contributingGates: [update.gate],
      lastUpdatedUs: now,
      createdAt: now,
    };
    this.tracks.set(trackId, track);
    return track;
  }

  update(trackId: string, update: TrackUpdate): Track {
    const track = this.tracks.get(trackId);
    if (!track) throw new Error('TRACK_NOT_FOUND');

    // Estimate velocity from position delta
    const dtUs = Number(update.position.timestampUs - track.position.timestampUs);
    if (dtUs > 0) {
      const dtS = dtUs / 1_000_000;
      track.velocity = {
        vLatMs: ((update.position.lat - track.position.lat) * DEG_TO_M) / dtS,
        vLonMs: ((update.position.lon - track.position.lon) * DEG_TO_M) / dtS,
        vAltMs: (update.position.altM - track.position.altM) / dtS,
      };
    }

    track.position = update.position;
    track.lastUpdatedUs = update.position.timestampUs;
    track.updateCount++;

    // Blend confidence (exponential moving average, alpha=0.3)
    track.confidence = 0.7 * track.confidence + 0.3 * update.confidence;

    // Add gate to contributing list if not present
    if (!track.contributingGates.includes(update.gate)) {
      track.contributingGates.push(update.gate);
    }

    // State transition
    if (track.state === 'tentative' && track.updateCount >= CONFIRMED_THRESHOLD) {
      track.state = 'confirmed';
    } else if (track.state === 'coasted') {
      track.state = 'confirmed'; // resumed
    }

    return track;
  }

  getTrack(trackId: string): Track | null {
    return this.tracks.get(trackId) ?? null;
  }

  getConfirmedTracks(): Track[] {
    return Array.from(this.tracks.values()).filter(t => t.state === 'confirmed');
  }

  markOffline(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (track) track.state = 'coasted';
  }

  pruneCoasted(nowUs: bigint): number {
    let count = 0;
    for (const [id, track] of this.tracks) {
      if (track.state === 'coasted') {
        const ageMs = Number(nowUs - track.lastUpdatedUs) / 1000;
        if (ageMs > COAST_TIMEOUT_MS) {
          this.tracks.delete(id);
          count++;
        }
      }
    }
    return count;
  }

  associateByProximity(position: Position4D, radiusM: number): Track | null {
    let closest: Track | null = null;
    let minDist = radiusM + 1; // +1m tolerance for float rounding
    for (const track of this.tracks.values()) {
      if (track.state !== 'confirmed') continue;
      const dist = distanceM(position, track.position);
      if (dist <= minDist) {
        minDist = dist;
        closest = track;
      }
    }
    return closest;
  }
}
