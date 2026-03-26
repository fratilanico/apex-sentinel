// APEX-SENTINEL — W9 ADS-B Exchange Live Feed Client
// FR-W9-01 | src/feeds/adsb-exchange-client.ts
//
// Ingests ADS-B data from adsb.lol, flags emergency squawks,
// suspicious aircraft, and altitude excursions. In-memory only — no
// coordinates written to logs or persistent store.

export interface AdsbBoundingBox {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}

export interface Aircraft {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  alt_baro: number;
  velocity: number;
  heading: number;
  onGround: boolean;
  squawk?: string;
  suspicious?: boolean;
  emergencyFlag?: 'hijack' | 'radio_failure' | 'emergency';
  altitudeExcursion?: boolean;
  verticalRate?: number;
}

export interface GetAircraftOptions {
  includeGround?: boolean;
  includeInvalidAlt?: boolean;
}

type HttpClient = (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

type EventHandler = (event: AdsbEvent) => void;

interface AdsbEvent {
  type: string;
  [key: string]: unknown;
}

const SQUAWK_FLAGS: Record<string, Aircraft['emergencyFlag']> = {
  '7500': 'hijack',
  '7600': 'radio_failure',
  '7700': 'emergency',
};

function validateBoundingBox(bbox: AdsbBoundingBox): void {
  if (
    bbox.latMin < -90 || bbox.latMin > 90 ||
    bbox.latMax < -90 || bbox.latMax > 90 ||
    bbox.lonMin < -180 || bbox.lonMin > 180 ||
    bbox.lonMax < -180 || bbox.lonMax > 180 ||
    bbox.latMin >= bbox.latMax ||
    bbox.lonMin >= bbox.lonMax
  ) {
    throw new RangeError(
      `Invalid bounding box: latMin=${bbox.latMin}, lonMin=${bbox.lonMin}, latMax=${bbox.latMax}, lonMax=${bbox.lonMax}`
    );
  }
}

export class AdsbExchangeClient {
  private bbox: AdsbBoundingBox;
  private pollIntervalMs: number;
  private httpClient: HttpClient;
  private cache: Aircraft[] = [];
  private logWriter: ((msg: string) => void) | null = null;
  private eventHandlers: EventHandler[] = [];
  private previousCount = 0;

  constructor(bbox: AdsbBoundingBox, pollIntervalMs = 5_000, httpClient?: HttpClient) {
    validateBoundingBox(bbox);
    this.bbox = bbox;
    this.pollIntervalMs = pollIntervalMs;
    this.httpClient = httpClient ?? ((url: string) => fetch(url) as unknown as ReturnType<HttpClient>);
  }

  getBoundingBox(): AdsbBoundingBox {
    return { ...this.bbox };
  }

  getPollIntervalMs(): number {
    return this.pollIntervalMs;
  }

  setLogWriter(fn: (msg: string) => void): void {
    this.logWriter = fn;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: AdsbEvent): void {
    for (const h of this.eventHandlers) {
      h(event);
    }
  }

  async getAircraft(options: GetAircraftOptions = {}): Promise<Aircraft[]> {
    const includeGround = options.includeGround ?? false;
    const includeInvalidAlt = options.includeInvalidAlt ?? false;

    const url = this.buildUrl();

    let raw: Aircraft[];
    try {
      const response = await this.httpClient(url);

      if (!response.ok) {
        // 429 or other error — return cache
        return this.cache;
      }

      const data = await response.json() as { aircraft?: unknown[] };
      raw = (data.aircraft ?? []) as Aircraft[];
    } catch {
      // Network timeout or rejection — return cache
      return this.cache;
    }

    // Deduplicate by icao24
    const seen = new Set<string>();
    const deduped: Aircraft[] = [];
    for (const ac of raw) {
      if (!seen.has(ac.icao24)) {
        seen.add(ac.icao24);
        deduped.push(ac);
      }
    }

    // Filter ground aircraft (unless includeGround)
    let filtered = includeGround ? deduped : deduped.filter(ac => !ac.onGround);

    // Filter negative altitude (unless includeInvalidAlt)
    if (!includeInvalidAlt) {
      filtered = filtered.filter(ac => ac.alt_baro >= 0);
    }

    // Annotate
    const annotated: Aircraft[] = filtered.map(ac => {
      const result: Aircraft = { ...ac };

      // Emergency squawk flags
      if (ac.squawk && SQUAWK_FLAGS[ac.squawk]) {
        result.emergencyFlag = SQUAWK_FLAGS[ac.squawk];
      }

      // Suspicious: airborne with no callsign and no squawk
      if (!ac.onGround && !ac.callsign && !ac.squawk) {
        result.suspicious = true;
      }

      // Altitude excursion: descending >500ft/min
      const vr = (ac as Aircraft & { verticalRate?: number }).verticalRate;
      if (typeof vr === 'number' && vr < -500) {
        result.altitudeExcursion = true;
      }

      return result;
    });

    // Detect no-transponder zone: had aircraft, now empty (all gone dark)
    const hadAircraft = this.previousCount > 0;
    const nowEmpty = annotated.length === 0;
    if (hadAircraft && nowEmpty) {
      this.emit({ type: 'adsb.no_transponder_zone', bbox: this.bbox });
    }
    this.previousCount = annotated.length;

    this.cache = annotated;
    return annotated;
  }

  private buildUrl(): string {
    const { latMin, lonMin, latMax, lonMax } = this.bbox;
    return `https://api.adsb.lol/v2/lat/${latMin}/lon/${lonMin}/dist/500?latMax=${latMax}&lonMax=${lonMax}`;
  }
}
