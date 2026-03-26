/**
 * FR-W15-02: MessageIntegrityVerifier
 * HMAC-SHA256 signing and verification for inter-node NATS messages.
 * Prevents replay attacks (30s window) and future-dated messages (5s tolerance).
 */

import { createHmac, hkdf as _hkdf } from 'node:crypto';
import { promisify } from 'node:util';

const hkdfAsync = promisify(_hkdf);

export interface SignedMessage {
  sig: string;
  ts: number;
  [key: string]: unknown;
}

export type VerificationReason = 'invalid_sig' | 'replay' | 'future_ts';

export interface VerificationResult {
  valid: boolean;
  reason?: VerificationReason;
}

const REPLAY_WINDOW_MS = 30_000;
const FUTURE_TOLERANCE_MS = 5_000;

export class MessageIntegrityVerifier {
  // seenTokens maps "<sig>:<ts>" → ts for replay detection
  private readonly seenTokens = new Map<string, number>();

  /**
   * Derive a 32-byte key using HKDF-SHA256(masterSecret, nodeId as info).
   */
  async deriveKey(masterSecret: Buffer, nodeId: string): Promise<Buffer> {
    const derived = await hkdfAsync(
      'sha256',
      masterSecret,
      Buffer.alloc(0),       // no salt
      Buffer.from(nodeId, 'utf8'), // info
      32,
    );
    return Buffer.from(derived);
  }

  /**
   * Sign a payload object: appends sig (HMAC-SHA256 hex) and ts (Date.now()).
   */
  sign(payload: Record<string, unknown>, key: Buffer): SignedMessage {
    const ts = Date.now();
    const canonical = this._canonical({ ...payload, ts });
    const sig = createHmac('sha256', key).update(canonical).digest('hex');
    return { ...payload, sig, ts };
  }

  /**
   * Verify a signed message. Checks HMAC, replay, and future-ts.
   * Side-effect: records the message token so replays are detected.
   */
  verify(message: SignedMessage, key: Buffer): VerificationResult {
    const { sig, ts, ...rest } = message;

    // Check future timestamp first (before replay check)
    const now = Date.now();
    if (ts > now + FUTURE_TOLERANCE_MS) {
      return { valid: false, reason: 'future_ts' };
    }

    // Replay check: ts older than 30s
    if (ts < now - REPLAY_WINDOW_MS) {
      return { valid: false, reason: 'replay' };
    }

    // HMAC verification
    const canonical = this._canonical({ ...rest, ts });
    const expected = createHmac('sha256', key).update(canonical).digest('hex');
    if (!this._timingSafeEqual(expected, sig)) {
      return { valid: false, reason: 'invalid_sig' };
    }

    // Replay detection: same (sig, ts) token seen before?
    const token = `${sig}:${ts}`;
    if (this.seenTokens.has(token)) {
      return { valid: false, reason: 'replay' };
    }
    this.seenTokens.set(token, ts);
    this._pruneOldTokens(now);

    return { valid: true };
  }

  private _canonical(obj: Record<string, unknown>): string {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  private _timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    let diff = 0;
    for (let i = 0; i < bufA.length; i++) {
      diff |= bufA[i]! ^ bufB[i]!;
    }
    return diff === 0;
  }

  private _pruneOldTokens(now: number): void {
    for (const [token, ts] of this.seenTokens) {
      if (ts < now - REPLAY_WINDOW_MS - 1000) {
        this.seenTokens.delete(token);
      }
    }
  }
}
