// APEX-SENTINEL — W11 IntelligencePackBuilder
// FR-W11-05 | src/intel/intelligence-pack-builder.ts

import { OsintCorrelationEngine } from './osint-correlation-engine.js';
import type { OsintEvent, DetectionEvent as OsintDetectionEvent } from './osint-correlation-engine.js';
import { SectorThreatMap } from './sector-threat-map.js';
import type { GridCell } from './sector-threat-map.js';
import { ThreatTimelineBuilder } from './threat-timeline-builder.js';
import type { TimelineEntry } from './threat-timeline-builder.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type AwningLevel = 'WHITE' | 'YELLOW' | 'RED';

export interface IntelPackDetection {
  lat: number;
  lon: number;
  ts: number;
  droneType?: string;
}

export interface IntelPackContext {
  awningLevel: AwningLevel;
  awningTs: number;          // timestamp of the awning level reading
  detections: IntelPackDetection[];
  osintEvents: OsintEvent[];
  timelineWindow: number;    // ms — window for recent events
}

export interface IntelBrief {
  threatLevel: AwningLevel;
  activeSectors: GridCell[];
  recentEvents: TimelineEntry[];
  osintSummary: string;
  ts: string;                // ISO-8601
}

// ── Constants ────────────────────────────────────────────────────────────────

const AWNING_RED_WINDOW_MS = 5 * 60 * 1000; // RED valid for 5 min

// ── IntelligencePackBuilder ──────────────────────────────────────────────────

export class IntelligencePackBuilder {
  private readonly osintEngine = new OsintCorrelationEngine();

  /**
   * Assembles a full IntelBrief from context.
   */
  build(ctx: IntelPackContext): IntelBrief {
    const now = Date.now();

    // Threat level: RED only if awningLevel is RED within last 5 minutes
    let threatLevel: AwningLevel = 'WHITE';
    const awningAge = now - ctx.awningTs;
    if (ctx.awningLevel === 'RED' && awningAge <= AWNING_RED_WINDOW_MS) {
      threatLevel = 'RED';
    } else if (ctx.awningLevel === 'YELLOW') {
      threatLevel = 'YELLOW';
    }

    // Build sector threat map from detections
    const sectorMap = new SectorThreatMap();
    for (const det of ctx.detections) {
      sectorMap.update(det);
    }
    const activeSectors = sectorMap.getHotspots(0);

    // Build recent timeline from detections
    const timeline = new ThreatTimelineBuilder();
    for (const det of ctx.detections) {
      timeline.addEntry({
        ts: det.ts,
        eventType: 'acoustic_detection',
        severity: 50,
        summary: `Detection at ${det.lat.toFixed(2)},${det.lon.toFixed(2)}${det.droneType ? ` (${det.droneType})` : ''}`,
      });
    }
    const recentEvents = timeline.getRecentTimeline(ctx.timelineWindow);

    // OSINT correlation — correlate each detection with OSINT events
    let totalSpatialDensity = 0;
    let conflictCount = 0;
    for (const det of ctx.detections) {
      const result = this.osintEngine.correlate(
        det as OsintDetectionEvent,
        ctx.osintEvents,
      );
      totalSpatialDensity += result.spatialDensity;
      conflictCount += result.correlatedEvents.filter(
        e => e.goldsteinScale !== undefined && e.goldsteinScale < -5,
      ).length;
    }

    const osintSummary = this._buildOsintSummary(
      ctx.osintEvents.length,
      totalSpatialDensity,
      conflictCount,
      threatLevel,
    );

    return {
      threatLevel,
      activeSectors,
      recentEvents,
      osintSummary,
      ts: new Date().toISOString(),
    };
  }

  private _buildOsintSummary(
    totalEvents: number,
    spatialDensity: number,
    conflictCount: number,
    level: AwningLevel,
  ): string {
    const levelEmoji = level === 'RED' ? '█' : level === 'YELLOW' ? '▓' : '░';
    const lines = [
      `┌─ OSINT SUMMARY ─────────────────`,
      `│ Threat Level : ${levelEmoji} ${level}`,
      `│ OSINT Events : ${totalEvents}`,
      `│ Spatial Score: ${spatialDensity.toFixed(2)}`,
      `│ Conflict Evts: ${conflictCount}`,
      `└─────────────────────────────────`,
    ];
    return lines.join('\n');
  }
}
