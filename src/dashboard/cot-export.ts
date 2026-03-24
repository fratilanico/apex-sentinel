// APEX-SENTINEL — CoT Export
// W4 C2 Dashboard — FR-W4-08

import type { DashboardTrack } from './track-store.js';

const THREAT_TYPE_MAP: Record<string, string> = {
  fpv_drone: 'a-h-A-M-F-Q',
  shahed: 'a-h-A-C-F',
  helicopter: 'a-h-A-M-H',
  unknown: 'a-u-A',
};

function getCotType(threatClass: string): string {
  return THREAT_TYPE_MAP[threatClass] ?? THREAT_TYPE_MAP['unknown'];
}

function toIsoTime(ms: number): string {
  return new Date(ms).toISOString();
}

export function exportTrackAsCot(track: DashboardTrack): string {
  const lat = parseFloat(track.lat.toFixed(5));
  const lon = parseFloat(track.lon.toFixed(5));
  const cotType = getCotType(track.threatClass);
  const time = toIsoTime(track.lastUpdatedAt);
  const start = toIsoTime(track.firstSeenAt);
  const stale = toIsoTime(track.lastUpdatedAt + 60000);

  return (
    `<event version="2.0" uid="${track.trackId}" type="${cotType}" ` +
    `time="${time}" start="${start}" stale="${stale}" how="m-g">` +
    `<point lat="${lat}" lon="${lon}" hae="${track.altM}" ce="${track.errorM}" le="999999"/>` +
    `<detail>` +
    `<track speed="${track.speedMs}" course="${track.headingDeg}"/>` +
    `<status readiness="${track.state}"/>` +
    `<confidence value="${track.confidence}"/>` +
    `<threatClass value="${track.threatClass}"/>` +
    `<nodeCount value="${track.nodeCount}"/>` +
    `</detail>` +
    `</event>`
  );
}

export function exportBulkCot(tracks: DashboardTrack[]): string {
  return tracks.map((t) => exportTrackAsCot(t)).join('\n');
}

export interface CotValidationResult {
  valid: boolean;
  trackCount: number;
  errors: string[];
}

export function validateExportedCot(xml: string): CotValidationResult {
  const errors: string[] = [];

  if (!xml.includes('event')) {
    errors.push('Missing event element');
  }

  const matches = xml.match(/<event\b/g);
  const trackCount = matches ? matches.length : 0;

  return {
    valid: errors.length === 0 && trackCount > 0,
    trackCount,
    errors,
  };
}

export function buildCotFilename(trackId: string): string {
  return `${trackId}.cot`;
}

export function stripPiiFromCot(xml: string): string {
  return xml.replace(/\s*nodeId="[^"]*"/g, '');
}
