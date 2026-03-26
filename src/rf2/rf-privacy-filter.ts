// APEX-SENTINEL — FR-W12-07: RF Privacy Filter
// src/rf2/rf-privacy-filter.ts
//
// GDPR-compliant RF event filter.
// Strips MAC addresses (replaces with daily-keyed SHA-256 hash).
// Strips raw packet content. Retains frequency, RSSI, bearing data.

import { createHmac } from 'node:crypto';

export interface RawRfEvent {
  frequencyMHz: number;
  rssi: number;
  ts: number;
  macAddress?: string;
  rawPacketContent?: Buffer;
  bearingEstimate?: { lat: number; lon: number };
}

export interface FilteredRfEvent {
  frequencyMHz: number;
  rssi: number;
  ts: number;
  macHash?: string;
  bearingEstimate?: { lat: number; lon: number };
}

// In production this would be loaded from a secret store.
// For testing, a fixed secret is acceptable — the daily date provides the rotation.
const HMAC_SECRET = 'apex-sentinel-rf-privacy-2026';

export class RfPrivacyFilter {
  filter(raw: RawRfEvent): FilteredRfEvent {
    const result: FilteredRfEvent = {
      frequencyMHz: raw.frequencyMHz,
      rssi: raw.rssi,
      ts: raw.ts,
    };

    if (raw.macAddress !== undefined) {
      result.macHash = this.hashMac(raw.macAddress, raw.ts);
    }

    if (raw.bearingEstimate !== undefined) {
      result.bearingEstimate = {
        lat: raw.bearingEstimate.lat,
        lon: raw.bearingEstimate.lon,
      };
    }

    // rawPacketContent intentionally not copied

    return result;
  }

  private hashMac(mac: string, ts: number): string {
    // Daily key: HMAC-SHA256(secret, ISO-date-string)
    const isoDate = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
    const dailyKey = createHmac('sha256', HMAC_SECRET).update(isoDate).digest('hex');
    return createHmac('sha256', dailyKey).update(mac).digest('hex');
  }
}
