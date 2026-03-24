// APEX-SENTINEL — Detection Stats
// W4 C2 Dashboard — FR-W4-09

export type ThreatClass = 'fpv_drone' | 'shahed' | 'helicopter' | 'unknown' | string;

export interface StatsSample {
  timestamp: number;
  trackCount: number;
  threatClass: ThreatClass;
  confidence: number;
}

export interface DetectionStats {
  totalTracks: number;
  confirmedTracks: number;
  detectionsPerHour: number;
  avgConfidence: number;
  activeNodeCount: number;
  coveragePercent: number;
  alertsSentToday: number;
  topThreatClass: ThreatClass | null;
}

export function detectionsPerHour(samples: StatsSample[], windowMs: number): number {
  if (samples.length === 0) return 0;
  const now = Date.now();
  const windowStart = now - windowMs;
  const inWindow = samples.filter((s) => s.timestamp >= windowStart);
  const count = inWindow.length;
  return Math.round((count / windowMs) * 3600000);
}

export function avgConfidence(samples: StatsSample[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((acc, s) => acc + s.confidence, 0);
  return sum / samples.length;
}

export function topThreatClass(samples: StatsSample[]): ThreatClass | null {
  if (samples.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const s of samples) {
    counts[s.threatClass] = (counts[s.threatClass] ?? 0) + 1;
  }
  const maxCount = Math.max(...Object.values(counts));
  const tied = Object.keys(counts)
    .filter((k) => counts[k] === maxCount)
    .sort();
  return tied[0];
}

export function calculateStats(samples: StatsSample[], windowMs: number): DetectionStats {
  return {
    totalTracks: samples.length,
    confirmedTracks: 0,
    detectionsPerHour: detectionsPerHour(samples, windowMs),
    avgConfidence: avgConfidence(samples),
    activeNodeCount: 0,
    coveragePercent: 0,
    alertsSentToday: 0,
    topThreatClass: topThreatClass(samples),
  };
}
