// APEX-SENTINEL — Telegram Alert Bot
// FR-W2-09: Formats and gates threat alerts for Telegram delivery

export interface ThreatAlert {
  trackId: string;
  threatClass: 'fpv_drone' | 'shahed' | 'helicopter' | 'unknown';
  lat: number;
  lon: number;
  altM: number;
  confidence: number;
  speedMs: number;
  headingDeg: number;
  detectedAt: string;
  nodeCount: number;
  errorM: number;
}

/**
 * Formats a plain-text Telegram message from a threat alert.
 * MUST NOT contain '|' characters — Telegram does not render pipe tables.
 * Uses box-drawing or plain layout only.
 */
export function formatTelegramMessage(alert: ThreatAlert): string {
  const confidencePct = Math.round(alert.confidence * 100);
  const lines = [
    `APEX SENTINEL ALERT`,
    `Threat: ${alert.threatClass}`,
    `Track: ${alert.trackId}`,
    `Confidence: ${confidencePct}%`,
    `Lat: ${alert.lat}  Lon: ${alert.lon}`,
    `Alt: ${alert.altM}m`,
    `Speed: ${alert.speedMs} m/s  Heading: ${alert.headingDeg} deg`,
    `Nodes: ${alert.nodeCount}  Error: ${alert.errorM}m`,
    `Detected: ${alert.detectedAt}`,
  ];
  return lines.join('\n');
}

/**
 * Formats a Markdown-formatted Telegram message from a threat alert.
 * Uses bold (*text*) and code (`text`) markers.
 */
export function formatTelegramMarkdown(alert: ThreatAlert): string {
  const confidencePct = Math.round(alert.confidence * 100);
  const lines = [
    `*APEX SENTINEL ALERT*`,
    `*Threat:* ${alert.threatClass}`,
    `*Track:* \`${alert.trackId}\``,
    `*Confidence:* ${confidencePct}%`,
    `*Lat:* ${alert.lat}  *Lon:* ${alert.lon}`,
    `*Alt:* ${alert.altM}m`,
    `*Speed:* ${alert.speedMs} m/s  *Heading:* ${alert.headingDeg} deg`,
    `*Nodes:* ${alert.nodeCount}  *Error:* ${alert.errorM}m`,
    `*Detected:* ${alert.detectedAt}`,
  ];
  return lines.join('\n');
}

/**
 * Returns true if the alert should be sent over Telegram.
 * Suppresses alerts for unknown threat class or below minimum confidence threshold.
 */
export function shouldSendAlert(alert: ThreatAlert, minConfidence: number): boolean {
  if (alert.threatClass === 'unknown') {
    return false;
  }
  return alert.confidence >= minConfidence;
}

/**
 * Builds a deduplication key for an alert, incorporating the trackId.
 */
export function buildAlertKey(alert: ThreatAlert): string {
  return `alert:${alert.trackId}:${alert.threatClass}`;
}
