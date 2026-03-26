// APEX-SENTINEL — W9
// FR-W9-04: GDELT Event Feed

export interface OsintEvent {
  eventId: string;
  lat: number;
  lon: number;
  ts: string;
  eventCode: string;
  sourceUrl: string;
  goldsteinScale: number;
}

export type BoundingBox =
  | [number, number, number, number]   // [minLat, minLon, maxLat, maxLon]
  | { minLat: number; minLon: number; maxLat: number; maxLon: number };

export interface GdeltClientOptions {
  bbox: BoundingBox;
  keywords: string[];
  windowMinutes?: number;
  httpClient?: typeof fetch;
}

export interface GetEventsOptions {
  keywords?: string[];
}

export interface GridCell {
  count: number;
  gridLat: number;
  gridLon: number;
}

function normalizeBbox(
  bbox: BoundingBox,
): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  if (Array.isArray(bbox)) {
    const [minLat, minLon, maxLat, maxLon] = bbox;
    return { minLat, minLon, maxLat, maxLon };
  }
  return bbox;
}

export class GdeltClient {
  private readonly bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  private readonly keywords: string[];
  private readonly windowMinutes: number;
  private readonly httpClient?: typeof fetch;

  constructor(options: GdeltClientOptions) {
    this.bbox = normalizeBbox(options.bbox);
    this.keywords = options.keywords;
    this.windowMinutes = options.windowMinutes ?? 60;
    this.httpClient = options.httpClient;
  }

  async getEvents(opts?: GetEventsOptions): Promise<OsintEvent[]> {
    const fetchFn = this.httpClient ?? fetch;
    const { minLat, minLon, maxLat, maxLon } = this.bbox;

    const url =
      `https://api.gdeltproject.org/api/v2/geo/geo` +
      `?query=${encodeURIComponent(this.keywords.join(' OR '))}` +
      `&mode=PointData` +
      `&format=json` +
      `&BBOX=${minLon},${minLat},${maxLon},${maxLat}`;

    try {
      const response = await fetchFn(url);
      const data = (await response.json()) as { events?: OsintEvent[] };
      const raw: OsintEvent[] = data.events ?? [];

      const keywords = opts?.keywords ?? this.keywords;
      const inBbox = this.filterByBbox(raw, this.bbox);
      const inWindow = this.filterByWindow(inBbox, this.windowMinutes);

      if (keywords.length > 0) {
        return inWindow.filter((ev) =>
          keywords.some(
            (kw) =>
              ev.eventCode.includes(kw) || ev.sourceUrl.toLowerCase().includes(kw.toLowerCase()),
          ),
        );
      }

      return inWindow;
    } catch {
      return [];
    }
  }

  filterByBbox(
    events: OsintEvent[],
    bbox: BoundingBox,
  ): OsintEvent[] {
    const { minLat, minLon, maxLat, maxLon } = normalizeBbox(bbox);
    return events.filter(
      (ev) =>
        ev.lat >= minLat &&
        ev.lat <= maxLat &&
        ev.lon >= minLon &&
        ev.lon <= maxLon,
    );
  }

  filterByWindow(events: OsintEvent[], windowMinutes: number): OsintEvent[] {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    return events.filter((ev) => new Date(ev.ts).getTime() >= cutoff);
  }

  isConflictEvent(event: OsintEvent): boolean {
    return event.goldsteinScale < 0;
  }

  aggregateToGrid(
    events: OsintEvent[],
    cellDeg: number = 0.1,
  ): Record<string, GridCell> {
    const grid: Record<string, GridCell> = {};

    for (const ev of events) {
      const gridLat = Math.floor(ev.lat / cellDeg) * cellDeg;
      const gridLon = Math.floor(ev.lon / cellDeg) * cellDeg;
      const key = `${gridLat.toFixed(4)},${gridLon.toFixed(4)}`;

      if (grid[key]) {
        grid[key].count += 1;
      } else {
        grid[key] = { count: 1, gridLat, gridLon };
      }
    }

    return grid;
  }
}
