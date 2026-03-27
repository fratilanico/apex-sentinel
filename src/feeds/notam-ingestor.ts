// APEX-SENTINEL W18 — NotamIngestor
// FR-W18-03 | src/feeds/notam-ingestor.ts

import type { NotamRestriction } from './types.js';
import { NotamParser } from './notam-parser.js';

const FAA_NOTAM_BASE = 'https://external-api.faa.gov/notamapi/v1/notams';

const ROMANIAN_AIRPORTS = ['LROP', 'LRCL', 'LRTR', 'LRCK', 'LRBS', 'LRIA', 'LRSB', 'LRTM'];

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class NotamIngestor {
  private cache: Map<string, { data: NotamRestriction[]; ts: number }> = new Map();
  private parser = new NotamParser();
  private injected: NotamRestriction[] | null = null;

  async fetchForAirport(icao: string): Promise<NotamRestriction[]> {
    // Check cache
    const cached = this.cache.get(icao);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data;
    }

    const url = `${FAA_NOTAM_BASE}?icaoLocation=${icao}&pageSize=50`;
    try {
      const resp = await fetch(url, {
        headers: {
          accept: 'application/json',
          client_id: 'apex-sentinel',
          client_secret: 'apex-sentinel',
        },
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          // Rate limited — return cached if available
          const stale = this.cache.get(icao);
          return stale ? stale.data : [];
        }
        return [];
      }

      const body = (await resp.json()) as { items?: Array<{ notamText?: string }> };
      const items = body.items ?? [];

      const restrictions: NotamRestriction[] = items
        .filter((item) => typeof item.notamText === 'string' && item.notamText.length > 0)
        .map((item) => this.parser.parseNotam(item.notamText as string));

      this.cache.set(icao, { data: restrictions, ts: Date.now() });
      return restrictions;
    } catch (err) {
      console.error(`[NotamIngestor] fetchForAirport(${icao}) failed:`, err);
      const stale = this.cache.get(icao);
      return stale ? stale.data : [];
    }
  }

  async fetchAll(): Promise<NotamRestriction[]> {
    const results = await Promise.all(
      ROMANIAN_AIRPORTS.map((icao) => this.fetchForAirport(icao))
    );
    return results.flat();
  }

  /** Inject pre-parsed NOTAMs directly (for testing) */
  injectParsed(notams: NotamRestriction[]): void {
    this.injected = notams;
  }

  getActiveRestrictions(atTime: Date = new Date()): NotamRestriction[] {
    const source = this.injected ?? this.getAllCached();
    return source.filter((n) => this.parser.isActive(n, atTime));
  }

  private getAllCached(): NotamRestriction[] {
    const all: NotamRestriction[] = [];
    for (const entry of this.cache.values()) {
      all.push(...entry.data);
    }
    return all;
  }
}
