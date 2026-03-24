// APEX-SENTINEL — Track Manager
// W1 | src/tracking/track-manager.ts
// STUB — implementation pending (TDD RED)

import { Track, TrackState, Position4D } from './types.js';

export interface TrackUpdate {
  position: Position4D;
  confidence: number;
  gate: number;
}

export class TrackManager {
  private tracks = new Map<string, Track>();
  private readonly TENTATIVE_THRESHOLD = 3;
  private readonly COAST_TIMEOUT_MS = 15_000;

  initiate(_update: TrackUpdate): Track {
    throw new Error('NOT_IMPLEMENTED');
  }

  update(_trackId: string, _update: TrackUpdate): Track {
    throw new Error('NOT_IMPLEMENTED');
  }

  getTrack(_trackId: string): Track | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  getConfirmedTracks(): Track[] {
    throw new Error('NOT_IMPLEMENTED');
  }

  pruneCoasted(_nowUs: bigint): number {
    throw new Error('NOT_IMPLEMENTED');
  }

  associateByProximity(_position: Position4D, _radiusM: number): Track | null {
    throw new Error('NOT_IMPLEMENTED');
  }
}
