// APEX-SENTINEL — W9 Civil Protection Feed Client
// FR-W9-03 | src/feeds/civil-protection-client.ts
//
// Ingests civil protection alerts from alerts.in.ua and EU ERCC in parallel.
// Deduplicates by id, filters expired, derives AWNING threat level.

export type AlertLevel = 'WHITE' | 'YELLOW' | 'RED' | 'CRITICAL' | 'HIGH';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface Alert {
  id: string;
  level: AlertLevel;
  type: string;
  area?: string;
  polygon?: GeoJsonPolygon | null;
  validUntil: Date;
  source: 'alerts.in.ua' | 'ercc';
}

type HttpClient = (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

// alerts.in.ua raw format
interface RawUaAlert {
  id: string;
  alert_type: string;
  location_title?: string;
  polygon?: GeoJsonPolygon | null;
  started_at: string;
  finished_at?: string | null;
}

interface RawUaResponse {
  active_alerts?: RawUaAlert[];
}

// ERCC raw format
interface RawErccEvent {
  eventId: string;
  severity?: string;
  category?: string;
  affectedCountry?: string;
  affectedArea?: string;
  areaGeojson?: GeoJsonPolygon | null;
  expiresAt?: string;
}

interface RawErccResponse {
  events?: RawErccEvent[];
}

const UA_ALERT_TYPE_LEVEL: Record<string, AlertLevel> = {
  air_raid: 'CRITICAL',
  chemical: 'CRITICAL',
  artillery: 'HIGH',
};

function mapUaAlert(raw: RawUaAlert): Alert {
  const level: AlertLevel = UA_ALERT_TYPE_LEVEL[raw.alert_type] ?? 'HIGH';
  const validUntil = raw.finished_at ? new Date(raw.finished_at) : new Date(Date.now() + 86400_000);
  return {
    id: raw.id,
    level,
    type: raw.alert_type,
    area: raw.location_title,
    polygon: raw.polygon ?? null,
    validUntil,
    source: 'alerts.in.ua',
  };
}

function mapErccAlert(raw: RawErccEvent): Alert {
  let level: AlertLevel = 'HIGH';
  const category = (raw.category ?? '').toLowerCase();
  const severity = (raw.severity ?? '').toUpperCase();

  if (category === 'chemical' || category === 'air_raid') {
    level = 'CRITICAL';
  } else if (severity === 'HIGH' || severity === 'CRITICAL') {
    level = severity as AlertLevel;
  } else if (severity === 'LOW' || severity === 'MEDIUM') {
    level = 'HIGH';
  }

  const validUntil = raw.expiresAt ? new Date(raw.expiresAt) : new Date(Date.now() + 86400_000);
  return {
    id: raw.eventId,
    level,
    type: raw.category ?? 'unknown',
    area: raw.affectedArea,
    polygon: raw.areaGeojson ?? null,
    validUntil,
    source: 'ercc',
  };
}

export class CivilProtectionClient {
  private countries: string[];
  private cacheSeconds: number;
  private httpClient: HttpClient;
  private cachedAlerts: Alert[] = [];
  private cacheTimestamp = 0;

  constructor(countries: string[], httpClientOrCacheSeconds?: HttpClient | number, cacheSeconds = 25) {
    this.countries = countries;

    if (typeof httpClientOrCacheSeconds === 'function') {
      this.httpClient = httpClientOrCacheSeconds;
      this.cacheSeconds = cacheSeconds;
    } else if (typeof httpClientOrCacheSeconds === 'number') {
      this.cacheSeconds = httpClientOrCacheSeconds;
      this.httpClient = (url: string) => fetch(url) as unknown as ReturnType<HttpClient>;
    } else {
      this.cacheSeconds = cacheSeconds;
      this.httpClient = (url: string) => fetch(url) as unknown as ReturnType<HttpClient>;
    }
  }

  getCountries(): string[] {
    return [...this.countries];
  }

  async getActiveAlerts(country: string): Promise<Alert[]> {
    const now = Date.now();
    if (this.cacheTimestamp > 0 && (now - this.cacheTimestamp) < this.cacheSeconds * 1000) {
      return this.cachedAlerts;
    }

    const uaUrl = `https://alerts.in.ua/api/alerts/active.json?country=${country}`;
    const erccUrl = `https://ercc.ec.europa.eu/api/events?country=${country}`;

    const [uaResult, erccResult] = await Promise.allSettled([
      this.fetchUaAlerts(uaUrl),
      this.fetchErccAlerts(erccUrl),
    ]);

    const uaAlerts: Alert[] = uaResult.status === 'fulfilled' ? uaResult.value : [];
    const erccAlerts: Alert[] = erccResult.status === 'fulfilled' ? erccResult.value : [];

    // Merge and deduplicate by id
    const allAlerts = [...uaAlerts, ...erccAlerts];
    const seen = new Set<string>();
    const deduped: Alert[] = [];
    for (const alert of allAlerts) {
      if (!seen.has(alert.id)) {
        seen.add(alert.id);
        deduped.push(alert);
      }
    }

    // Filter expired alerts
    const active = deduped.filter(a => a.validUntil > new Date(now));

    this.cachedAlerts = active;
    this.cacheTimestamp = now;
    return active;
  }

  private async fetchUaAlerts(url: string): Promise<Alert[]> {
    const response = await this.httpClient(url);
    if (!response.ok) return [];
    const data = await response.json() as RawUaResponse;
    const raw = data.active_alerts ?? [];
    return raw.map(mapUaAlert);
  }

  private async fetchErccAlerts(url: string): Promise<Alert[]> {
    const response = await this.httpClient(url);
    if (!response.ok) return [];
    const data = await response.json() as RawErccResponse;
    const raw = data.events ?? [];
    return raw.map(mapErccAlert);
  }

  getAwningLevel(): AlertLevel {
    if (this.cachedAlerts.some(a => a.level === 'CRITICAL')) return 'RED';
    if (this.cachedAlerts.some(a => a.level === 'HIGH')) return 'YELLOW';
    return 'WHITE';
  }
}
