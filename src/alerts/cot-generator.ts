// APEX-SENTINEL — CoT XML Generator (FreeTAKServer compatible)
// W1 | src/alerts/cot-generator.ts

import { Track } from '../tracking/types.js';
import { CotXmlEvent } from './types.js';

// CoT type mapping for threat classes
const THREAT_TYPE_MAP: Record<string, string> = {
  fpv_drone: 'a-h-A-M-F',
  fixed_wing: 'a-h-A-F',
  helicopter: 'a-h-A-M-H',
  bird: 'a-n-A',
  unknown: 'a-u-A',
};

// Circular error (metres) based on confidence
function ceFromConfidence(confidence: number): number {
  // 1.0 confidence → 10m, 0.5 confidence → 200m
  return Math.round(10 + (1 - confidence) * 380);
}

export class CotGenerator {
  generateFromTrack(track: Track): CotXmlEvent {
    const time = new Date(Number(track.position.timestampUs / 1000n));
    const stale = new Date(time.getTime() + 5 * 60 * 1000);

    return {
      uid: `APEX-SENTINEL-${track.trackId}`,
      type: THREAT_TYPE_MAP[track.threatClass] ?? 'a-u-A',
      lat: track.position.lat,
      lon: track.position.lon,
      hae: track.position.altM,
      ce: ceFromConfidence(track.confidence),
      le: 9999, // vertical error — unknown without altimeter
      time,
      stale,
      callsign: `DRONE-${track.trackId}`,
      remarks: `APEX-SENTINEL: ${track.threatClass}, confidence ${track.confidence.toFixed(2)}, ` +
               `gates [${track.contributingGates.join(',')}], updates ${track.updateCount}`,
    };
  }

  toXmlString(event: CotXmlEvent): string {
    const timeStr = event.time.toISOString();
    const staleStr = event.stale.toISOString();

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<event version="2.0"`,
      `       uid="${this.escapeXml(event.uid)}"`,
      `       type="${this.escapeXml(event.type)}"`,
      `       how="m-g"`,
      `       time="${timeStr}"`,
      `       start="${timeStr}"`,
      `       stale="${staleStr}">`,
      `  <point lat="${event.lat.toFixed(7)}"`,
      `         lon="${event.lon.toFixed(7)}"`,
      `         hae="${event.hae.toFixed(1)}"`,
      `         ce="${event.ce}"`,
      `         le="${event.le}"/>`,
      `  <detail>`,
      `    <contact callsign="${this.escapeXml(event.callsign)}"/>`,
      `    <remarks>${this.escapeXml(event.remarks)}</remarks>`,
      `  </detail>`,
      `</event>`,
    ].join('\n');
  }

  isValidCotXml(xml: string): boolean {
    if (!xml || xml.trim() === '') return false;
    return (
      xml.includes('<event') &&
      xml.includes('<point') &&
      xml.includes('<detail') &&
      xml.includes('</event>')
    );
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
