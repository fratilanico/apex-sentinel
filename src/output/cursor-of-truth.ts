// APEX-SENTINEL — W6 Cursor of Truth
// FR-W6-09 | src/output/cursor-of-truth.ts
//
// Tactical situation awareness report generator.
// Calls Claude claude-sonnet-4-6 via VM gateway for narrative generation.
// Falls back to template if gateway is unavailable.
// NEVER use ANTHROPIC_API_KEY directly — always use the VM gateway.
// Location coarsened to ±50m per LocationCoarsener (GDPR).

import type { EKFState, ImpactEstimate } from '../prediction/types.js';

export interface TacticalReport {
  trackId: string;
  classification: string;
  confidence: number;
  location: {
    lat: number;
    lon: number;
    coarsened: true;
  };
  velocity: {
    speedKmh: number;
    heading: number;
    altitude: number;
  };
  impactProjection: {
    timeToImpactSeconds: number;
    lat: number;
    lon: number;
  } | null;
  timestamp: string;
  nodeCount: number;
  narrative: string;
}

export interface ClaudeGateway {
  chat: (options: { model: string; messages: Array<{ role: string; content: string }> }) => Promise<{ content: string }>;
}

export interface CursorOfTruthOptions {
  claudeGateway: ClaudeGateway;
  nodeCount?: number;
}

interface FormatInput {
  trackId: string;
  ekfState: EKFState;
  impactEstimate: ImpactEstimate | null;
}

// Degrees of coarsening: ±50m ≈ 0.00045°. Round to 4 decimal places.
const COARSEN_PRECISION = 4;

function coarsenCoord(coord: number): number {
  const factor = Math.pow(10, COARSEN_PRECISION);
  // Add a small random offset ≤ ±0.00045° (≈ ±50m)
  const jitter = (Math.random() - 0.5) * 0.0009;
  return Math.round((coord + jitter) * factor) / factor;
}

function computeSpeedKmh(vLat: number, vLon: number): number {
  // deg/s to km/h: 1 deg lat ≈ 111.32 km, 1 deg lon ≈ 71.7 km at 51°N
  const vLatKmh = vLat * 111_320 * 3.6;
  const vLonKmh = vLon * 71_700 * 3.6;
  return Math.sqrt(vLatKmh ** 2 + vLonKmh ** 2);
}

function computeHeading(vLat: number, vLon: number): number {
  const vLatKm = vLat * 111.32;
  const vLonKm = vLon * 71.7;
  const heading = (Math.atan2(vLonKm, vLatKm) * 180) / Math.PI;
  return (heading + 360) % 360;
}

function buildPrompt(trackId: string, state: EKFState, impact: ImpactEstimate | null): string {
  const speed = computeSpeedKmh(state.vLat, state.vLon).toFixed(0);
  const alt = state.alt.toFixed(0);
  const conf = (state.confidence * 100).toFixed(0);
  const impactStr = impact
    ? `Impact projected in ${impact.timeToImpactSeconds.toFixed(0)} seconds.`
    : 'NO IMPACT PROJECTED (ascending or level flight).';
  return `You are a tactical air defence situation awareness system. Generate a concise (2-3 sentence) threat report.
Track: ${trackId} | Confidence: ${conf}% | Altitude: ${alt}m | Speed: ${speed}km/h
${impactStr}
Output: professional military brevity, no markdown, under 150 words.`;
}

function buildTemplateNarrative(trackId: string, state: EKFState, impact: ImpactEstimate | null): string {
  const speed = computeSpeedKmh(state.vLat, state.vLon).toFixed(0);
  const alt = state.alt.toFixed(0);
  const conf = (state.confidence * 100).toFixed(0);
  if (impact) {
    return `TRACK ${trackId}: Aerial threat detected. Altitude ${alt}m, speed ${speed}km/h, confidence ${conf}%. Impact projected in ${impact.timeToImpactSeconds.toFixed(0)} seconds. Recommend immediate action.`;
  }
  return `TRACK ${trackId}: Aerial contact at ${alt}m altitude, ${speed}km/h. Confidence ${conf}%. NO IMPACT PROJECTED. Continue monitoring.`;
}

export class CursorOfTruth {
  private readonly gateway: ClaudeGateway;
  private readonly nodeCount: number;

  constructor(options: CursorOfTruthOptions) {
    this.gateway = options.claudeGateway;
    this.nodeCount = options.nodeCount ?? 1;
  }

  async format(trackId: string, ekfState: EKFState, impactEstimate: ImpactEstimate | null): Promise<TacticalReport> {
    const speedKmh = computeSpeedKmh(ekfState.vLat, ekfState.vLon);
    const heading = computeHeading(ekfState.vLat, ekfState.vLon);

    let narrative: string;
    try {
      const response = await this.gateway.chat({
        model: 'claude-sonnet-4-6',
        messages: [
          { role: 'user', content: buildPrompt(trackId, ekfState, impactEstimate) },
        ],
      });
      narrative = response.content;
    } catch {
      narrative = buildTemplateNarrative(trackId, ekfState, impactEstimate);
    }

    // Ensure "NO IMPACT PROJECTED" always present in narrative when no impact
    if (!impactEstimate && !narrative.includes('NO IMPACT')) {
      narrative += ' NO IMPACT PROJECTED.';
    }

    return {
      trackId,
      classification: 'unknown', // populated by calling context
      confidence: ekfState.confidence,
      location: {
        lat: coarsenCoord(ekfState.lat),
        lon: coarsenCoord(ekfState.lon),
        coarsened: true,
      },
      velocity: {
        speedKmh,
        heading,
        altitude: ekfState.alt,
      },
      impactProjection: impactEstimate
        ? {
            timeToImpactSeconds: impactEstimate.timeToImpactSeconds,
            lat: coarsenCoord(impactEstimate.lat),
            lon: coarsenCoord(impactEstimate.lon),
          }
        : null,
      timestamp: new Date(ekfState.timestamp).toISOString(),
      nodeCount: this.nodeCount,
      narrative,
    };
  }

  async formatBatch(inputs: FormatInput[]): Promise<TacticalReport[]> {
    const results: TacticalReport[] = [];
    for (const input of inputs) {
      try {
        const report = await this.format(input.trackId, input.ekfState, input.impactEstimate);
        results.push(report);
      } catch {
        // Continue on per-track error — pipeline resilience
        const fallbackNarrative = buildTemplateNarrative(input.trackId, input.ekfState, input.impactEstimate);
        const speedKmh = computeSpeedKmh(input.ekfState.vLat, input.ekfState.vLon);
        results.push({
          trackId: input.trackId,
          classification: 'unknown',
          confidence: input.ekfState.confidence,
          location: { lat: coarsenCoord(input.ekfState.lat), lon: coarsenCoord(input.ekfState.lon), coarsened: true },
          velocity: { speedKmh, heading: computeHeading(input.ekfState.vLat, input.ekfState.vLon), altitude: input.ekfState.alt },
          impactProjection: null,
          timestamp: new Date(input.ekfState.timestamp).toISOString(),
          nodeCount: this.nodeCount,
          narrative: fallbackNarrative,
        });
      }
    }
    return results;
  }
}
