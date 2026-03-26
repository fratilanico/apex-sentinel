// APEX-SENTINEL — W9
// FR-W9-05: Remote ID BLE/WiFi Receiver (ASTM F3411)

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

export interface RemoteIdBeacon {
  uasId: string;          // SHA-256 hashed with daily salt
  operatorLat: number;    // coarsened to ±50m grid
  operatorLon: number;    // coarsened to ±50m grid
  altM: number;
  intent: string;
  receivedAt: string;     // UTC ISO8601
}

export interface RemoteIdReceiverOptions {
  interfaces?: string[];
}

export interface MockScanner {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  onFrame: (cb: (frame: unknown) => void) => void;
}

export interface RemoteIdReceiverDeps {
  scanner?: MockScanner;
}

/** ASTM F3411 BLE service UUID */
const F3411_UUID = '0000fffa-0000-1000-8000-00805f9b34fb';

/** Coarsening grid size in degrees (0.0005° ≈ 55m) */
const COORD_GRID = 0.0005;

/** Dedup window in milliseconds */
const DEDUP_WINDOW_MS = 10_000;

interface RawPayload {
  uasId: string;
  operatorLat: number;
  operatorLon: number;
  altM: number;
  intent: string;
}

interface BleFrame {
  uuid?: string;
  payload?: Buffer | string;
  transport?: string;
}

function getDailySalt(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function hashUasId(rawId: string): string {
  const salt = getDailySalt();
  return createHash('sha256').update(salt + rawId).digest('hex');
}

function coarsen(coord: number): number {
  return Math.round(coord / COORD_GRID) * COORD_GRID;
}

export class RemoteIdReceiver extends EventEmitter {
  private readonly interfaces: string[];
  private readonly scanner: MockScanner;

  /** Map of hashedUasId -> timestamp of last emission (for dedup) */
  private readonly seen = new Map<string, number>();

  constructor(
    options: RemoteIdReceiverOptions,
    deps?: RemoteIdReceiverDeps,
  ) {
    super();
    this.interfaces = options.interfaces ?? [];
    this.scanner = deps?.scanner ?? this.createDefaultScanner();
  }

  async start(): Promise<void> {
    await this.scanner.start();
    this.scanner.onFrame((frame: unknown) => this.handleFrame(frame as BleFrame));
  }

  async stop(): Promise<void> {
    await this.scanner.stop();
  }

  private handleFrame(frame: BleFrame): void {
    // Only process F3411 UUID frames (BLE or WiFi Aware)
    const uuid = frame.uuid?.toLowerCase();
    if (uuid !== F3411_UUID.toLowerCase()) {
      return;
    }

    // Parse payload
    let raw: RawPayload;
    try {
      const payloadStr =
        Buffer.isBuffer(frame.payload)
          ? frame.payload.toString('utf8')
          : String(frame.payload ?? '');
      raw = JSON.parse(payloadStr) as RawPayload;
    } catch {
      return; // malformed payload — ignore
    }

    const hashedId = hashUasId(raw.uasId);
    const now = Date.now();

    // Dedup: skip if same hashed ID seen within 10s, unless emergency
    if (raw.intent !== 'emergency') {
      const lastSeen = this.seen.get(hashedId);
      if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) {
        return;
      }
    }

    this.seen.set(hashedId, now);

    const beacon: RemoteIdBeacon = {
      uasId: hashedId,
      operatorLat: parseFloat(coarsen(raw.operatorLat).toFixed(4)),
      operatorLon: parseFloat(coarsen(raw.operatorLon).toFixed(4)),
      altM: raw.altM,
      intent: raw.intent,
      receivedAt: new Date().toISOString(),
    };

    this.emit('beacon', beacon);
  }

  private createDefaultScanner(): MockScanner {
    // No-op default scanner (real hardware not available)
    return {
      start: async () => { /* no-op */ },
      stop: async () => { /* no-op */ },
      onFrame: (_cb: (frame: unknown) => void) => { /* no-op */ },
    };
  }
}
