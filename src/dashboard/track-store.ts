// APEX-SENTINEL — Track Store
// W4 C2 Dashboard — FR-W4-02

export interface DashboardTrack {
  trackId: string;
  threatClass: string;
  lat: number;
  lon: number;
  altM: number;
  confidence: number;
  speedMs: number;
  headingDeg: number;
  state: 'confirmed' | 'tentative' | 'coasted' | string;
  nodeCount: number;
  errorM: number;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export class TrackStore {
  private tracks: Map<string, DashboardTrack> = new Map();

  upsertTrack(track: DashboardTrack): void {
    this.tracks.set(track.trackId, { ...track });
  }

  removeTrack(trackId: string): void {
    this.tracks.delete(trackId);
  }

  getTrack(trackId: string): DashboardTrack | null {
    return this.tracks.get(trackId) ?? null;
  }

  getAllTracks(): DashboardTrack[] {
    return Array.from(this.tracks.values());
  }

  count(): number {
    return this.tracks.size;
  }

  clear(): void {
    this.tracks.clear();
  }

  getConfirmedTracks(): DashboardTrack[] {
    return Array.from(this.tracks.values()).filter((t) => t.state === 'confirmed');
  }

  filterByThreatClass(threatClass: string): DashboardTrack[] {
    return Array.from(this.tracks.values()).filter((t) => t.threatClass === threatClass);
  }

  sortByConfidence(descending: boolean): DashboardTrack[] {
    const all = Array.from(this.tracks.values());
    return all.slice().sort((a, b) =>
      descending ? b.confidence - a.confidence : a.confidence - b.confidence,
    );
  }

  getStaleTrackIds(maxAgeMs: number): string[] {
    const threshold = Date.now() - maxAgeMs;
    return Array.from(this.tracks.values())
      .filter((t) => t.lastUpdatedAt < threshold)
      .map((t) => t.trackId);
  }
}
