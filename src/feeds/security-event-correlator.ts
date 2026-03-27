import { haversineKm } from '../geo/romania-bbox.js';
import type { SecurityEvent, ProtectedZone } from './types.js';

const ACLED_URL = 'https://api.acleddata.com/acled/read';
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const GDELT_URL = 'https://api.gdeltproject.org/api/v2/geo/geo';

// Romania bounding box: latMin, lonMin, latMax, lonMax
const RO_BBOX = { latMin: 43.5, lonMin: 20.2, latMax: 48.5, lonMax: 30.0 };

export class SecurityEventCorrelator {
  private events: SecurityEvent[] = [];
  private fetchFn: typeof fetch | null;

  constructor(fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn ?? null;
  }

  private get http(): typeof fetch {
    return this.fetchFn ?? globalThis.fetch;
  }

  // Inject events into internal state (used by getRecentEvents / getEventsNearZone)
  injectEvents(events: SecurityEvent[]): void {
    this.events = events;
  }

  correlateWithZones(events: SecurityEvent[], zones: ProtectedZone[]): SecurityEvent[] {
    return events.map((evt) => {
      if (zones.length === 0) {
        return { ...evt, distanceToNearestZoneKm: null as unknown as number, affectedZoneId: null };
      }

      let minDist = Infinity;
      let nearestZoneId: string | null = null;

      for (const zone of zones) {
        const d = haversineKm(evt.lat, evt.lon, zone.lat, zone.lon);
        if (d < minDist) {
          minDist = d;
          nearestZoneId = zone.id;
        }
      }

      const affectedZoneId = minDist <= 20 ? nearestZoneId : null;

      return {
        ...evt,
        distanceToNearestZoneKm: minDist === Infinity ? (null as unknown as number) : minDist,
        affectedZoneId,
      };
    });
  }

  async fetchAcled(): Promise<SecurityEvent[]> {
    const apiKey = process.env.ACLED_API_KEY;
    const email = process.env.ACLED_EMAIL;

    if (!apiKey || !email) {
      // Fallback to GDELT when no API key
      return this.fetchGdelt();
    }

    const params = new URLSearchParams({
      key: apiKey,
      email,
      country: 'Romania',
      limit: '50',
    });

    const url = `${ACLED_URL}?${params.toString()}`;

    try {
      const response = await this.http(url);
      if (!response.ok) return [];

      const data = await response.json() as { data?: unknown[] };
      const rows = data.data ?? [];

      return rows.map((row: unknown) => {
        const r = row as Record<string, string>;
        return {
          id: `acled-${r['event_id_cnty'] ?? Math.random()}`,
          source: 'acled' as const,
          lat: parseFloat(r['latitude'] ?? '0'),
          lon: parseFloat(r['longitude'] ?? '0'),
          timestampMs: new Date(r['event_date'] ?? Date.now()).getTime(),
          type: r['event_type'] ?? 'UNKNOWN',
          description: r['notes'] ?? '',
          distanceToNearestZoneKm: null as unknown as number,
          affectedZoneId: null,
        } satisfies SecurityEvent;
      });
    } catch {
      return [];
    }
  }

  async fetchFirms(): Promise<SecurityEvent[]> {
    const mapKey = process.env.FIRMS_MAP_KEY ?? 'nokey';

    // Romania bbox: W,S,E,N
    const bbox = `${RO_BBOX.lonMin},${RO_BBOX.latMin},${RO_BBOX.lonMax},${RO_BBOX.latMax}`;
    const url = `${FIRMS_URL}/${mapKey}/VIIRS_SNPP_NRT/${bbox}/1`;

    try {
      const response = await this.http(url);
      if (!response.ok) return [];

      const text = await response.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',');
      const latIdx = headers.indexOf('latitude');
      const lonIdx = headers.indexOf('longitude');
      const dateIdx = headers.indexOf('acq_date');
      const timeIdx = headers.indexOf('acq_time');
      const brightIdx = headers.indexOf('brightness');
      const confIdx = headers.indexOf('confidence');

      const events: SecurityEvent[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 2) continue;

        const lat = parseFloat(cols[latIdx] ?? '0');
        const lon = parseFloat(cols[lonIdx] ?? '0');
        const dateStr = cols[dateIdx] ?? '';
        const timeStr = cols[timeIdx] ?? '0000';

        const hh = timeStr.padStart(4, '0').slice(0, 2);
        const mm = timeStr.padStart(4, '0').slice(2, 4);
        const ts = new Date(`${dateStr}T${hh}:${mm}:00Z`).getTime();

        events.push({
          id: `firms-${i}-${Date.now()}`,
          source: 'firms' as const,
          lat,
          lon,
          timestampMs: isNaN(ts) ? Date.now() : ts,
          type: 'THERMAL_ANOMALY',
          description: `VIIRS thermal anomaly (brightness: ${cols[brightIdx] ?? '?'}, confidence: ${cols[confIdx] ?? '?'})`,
          distanceToNearestZoneKm: null as unknown as number,
          affectedZoneId: null,
        });
      }
      return events;
    } catch {
      return [];
    }
  }

  async fetchGdelt(): Promise<SecurityEvent[]> {
    const query = 'Romania drone airspace security';
    const params = new URLSearchParams({
      query,
      mode: 'pointdata',
      maxrecords: '50',
      format: 'json',
    });

    const url = `${GDELT_URL}?${params.toString()}`;

    try {
      const response = await this.http(url);
      if (!response.ok) return [];

      const data = await response.json() as { articles?: unknown[] };
      const articles = data.articles ?? [];

      return articles.map((art: unknown, idx: number) => {
        const a = art as Record<string, string>;
        const dateStr = a['seendate'] ?? '';
        // seendate format: 20260327T120000Z
        const ts = dateStr
          ? new Date(
              `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T` +
              `${dateStr.slice(9, 11)}:${dateStr.slice(11, 13)}:${dateStr.slice(13, 15)}Z`,
            ).getTime()
          : Date.now();

        return {
          id: `gdelt-${idx}-${Date.now()}`,
          source: 'gdelt' as const,
          lat: parseFloat(a['lat'] ?? '44.43'),
          lon: parseFloat(a['lon'] ?? '26.10'),
          timestampMs: isNaN(ts) ? Date.now() : ts,
          type: 'MEDIA_ALERT',
          description: a['title'] ?? a['url'] ?? '',
          distanceToNearestZoneKm: null as unknown as number,
          affectedZoneId: null,
        } satisfies SecurityEvent;
      });
    } catch {
      return [];
    }
  }

  mergeEvents(events: SecurityEvent[]): SecurityEvent[] {
    const merged: SecurityEvent[] = [];

    for (const evt of events) {
      const isDup = merged.some((existing) => {
        const distKm = haversineKm(evt.lat, evt.lon, existing.lat, existing.lon);
        const timeDiffMs = Math.abs(evt.timestampMs - existing.timestampMs);
        return distKm < 1 && timeDiffMs < 30 * 60 * 1000; // <1km and <30min
      });

      if (!isDup) {
        merged.push(evt);
      }
    }

    return merged;
  }

  getRecentEvents(windowHours: number): SecurityEvent[] {
    const cutoff = Date.now() - windowHours * 3600 * 1000;
    return this.events.filter((e) => e.timestampMs >= cutoff);
  }

  getEventsNearZone(zone: ProtectedZone, radiusKm: number): SecurityEvent[] {
    return this.events.filter((e) => {
      const d = haversineKm(e.lat, e.lon, zone.lat, zone.lon);
      return d <= radiusKm;
    });
  }

  async fetchAll(zones: ProtectedZone[]): Promise<SecurityEvent[]> {
    const [acledEvents, firmsEvents, gdeltEvents] = await Promise.all([
      this.fetchAcled(),
      this.fetchFirms(),
      this.fetchGdelt(),
    ]);

    const all = [...acledEvents, ...firmsEvents, ...gdeltEvents];
    const merged = this.mergeEvents(all);
    return this.correlateWithZones(merged, zones);
  }
}
