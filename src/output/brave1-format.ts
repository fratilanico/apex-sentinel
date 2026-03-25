// APEX-SENTINEL — W6 BRAVE1 Format
// FR-W6-10 | src/output/brave1-format.ts
//
// NATO BRAVE-1 compatible tactical output format.
// Encodes TacticalReport → BRAVE1Message (JSON).
// Supports encode, decode, validate, transmit.

export interface BRAVE1Message {
  type: string;      // NATO threat classification code (e.g. "a-h-A-M-F-U")
  uid: string;       // unique identifier
  time: string;      // ISO8601
  stale: string;     // ISO8601 — when message expires
  lat: number;       // WGS84
  lon: number;
  ce: number;        // circular error (meters)
  hae: number;       // height above ellipsoid (meters)
  speed: number;     // m/s
  course: number;    // degrees true
  callsign: string;
  how: string;       // how generated: "m-g" = machine generated
  remarks: string;
}

export interface TacticalReport {
  trackId: string;
  classification: string;
  confidence: number;
  location: { lat: number; lon: number; coarsened: true };
  velocity: { speedKmh: number; heading: number; altitude: number };
  impactProjection: { timeToImpactSeconds: number; lat: number; lon: number } | null;
  timestamp: string;
  nodeCount: number;
  narrative: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Transmitter {
  post: (url: string, body: unknown) => Promise<{ status: number }>;
}

export class BRAVE1ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BRAVE1ValidationError';
  }
}

// NATO threat type codes for drone classification
const THREAT_TYPE_MAP: Record<string, string> = {
  'shahed-136': 'a-h-A-M-F-U',   // hostile air munition fixed wing UAS
  'lancet-3':   'a-h-A-M-F-U',   // hostile air munition
  'orlan-10':   'a-h-A-M-R-U',   // hostile air reconnaissance UAS
  'mavic-mini': 'a-u-A-M-F-U',   // unknown air UAS
};

const DEFAULT_TYPE = 'a-u-A-M-F-U'; // unknown UAS fallback
const STALE_MS_DEFAULT = 5 * 60 * 1000; // 5 minutes

export class BRAVE1Format {
  private readonly transmitter: Transmitter;

  constructor(options: { transmitter: Transmitter }) {
    this.transmitter = options.transmitter;
  }

  encode(report: TacticalReport): BRAVE1Message {
    const type = THREAT_TYPE_MAP[report.classification] ?? DEFAULT_TYPE;
    const uid = `APEX-SENTINEL-${report.trackId}-${new Date(report.timestamp).getTime()}`;
    const msgTime = new Date(report.timestamp);

    // Stale time: T + impact time if known, otherwise T + 5 minutes
    const staleMs = report.impactProjection
      ? msgTime.getTime() + (report.impactProjection.timeToImpactSeconds * 1000) + 30_000 // +30s buffer
      : msgTime.getTime() + STALE_MS_DEFAULT;
    const staleTime = new Date(staleMs).toISOString();

    // Speed: km/h → m/s
    const speedMs = report.velocity.speedKmh / 3.6;

    // CE (circular error): 50m as per LocationCoarsener GDPR ±50m
    const ce = 50.0;

    let remarks = `${report.classification} detected. Conf: ${(report.confidence * 100).toFixed(0)}%.`;
    if (report.impactProjection) {
      remarks += ` Impact T-${report.impactProjection.timeToImpactSeconds.toFixed(0)}s.`;
    }
    if (report.narrative) {
      remarks += ` ${report.narrative}`;
    }

    return {
      type,
      uid,
      time: report.timestamp,
      stale: staleTime,
      lat: report.location.lat,
      lon: report.location.lon,
      ce,
      hae: report.velocity.altitude,
      speed: speedMs,
      course: report.velocity.heading,
      callsign: `APEX-${report.trackId}`,
      how: 'm-g',
      remarks: remarks.trim(),
    };
  }

  decode(msg: BRAVE1Message): Partial<TacticalReport> {
    const speedKmh = msg.speed * 3.6;
    return {
      location: { lat: msg.lat, lon: msg.lon, coarsened: true },
      velocity: { speedKmh, heading: msg.course, altitude: msg.hae },
      timestamp: msg.time,
      narrative: msg.remarks,
    };
  }

  validate(msg: BRAVE1Message): ValidationResult {
    const errors: string[] = [];

    if (!msg.type) errors.push('type: required field missing or empty');
    if (!msg.uid) errors.push('uid: required field missing or empty');
    if (!msg.time) errors.push('time: required field missing or empty');
    if (!msg.stale) errors.push('stale: required field missing or empty');
    if (msg.lat < -90 || msg.lat > 90) errors.push(`lat: value ${msg.lat} out of range [-90, 90]`);
    if (msg.lon < -180 || msg.lon > 180) errors.push(`lon: value ${msg.lon} out of range [-180, 180]`);
    if (msg.ce < 0) errors.push(`ce: circular error must be ≥ 0, got ${msg.ce}`);

    return { valid: errors.length === 0, errors };
  }

  async transmit(msg: BRAVE1Message, endpoint: string): Promise<void> {
    await this.transmitter.post(endpoint, msg);
  }
}
