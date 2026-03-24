// APEX-SENTINEL — TDD RED Tests
// FR-W3-15: OTA Model Manager
// Status: RED — implementation in src/mobile/model-manager.ts does NOT exist yet

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  ModelManager,
  type ModelMetadata,
  type UpdateCheckResult,
} from '../../src/mobile/model-manager.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// SHA-256 of an empty byte array (known constant)
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const BASE_METADATA: ModelMetadata = {
  version: '1.2.0',
  sha256: EMPTY_SHA256,
  sizeBytes: 4_096_000,
  downloadUrl: 'https://cdn.sentinel.io/models/drone-detector-v1.2.0.tflite',
  releasedAt: '2026-03-01T00:00:00Z',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W3-15-00: OTA Model Manager', () => {

  describe('FR-W3-15-01: getCurrentVersion returns constructor version', () => {
    it('returns the version string passed to the constructor', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      expect(manager.getCurrentVersion()).toBe('1.0.0');
    });

    it('preserves semver pre-release tags verbatim', () => {
      const manager = new ModelManager('2.0.0-beta.1', EMPTY_SHA256);
      expect(manager.getCurrentVersion()).toBe('2.0.0-beta.1');
    });
  });

  describe('FR-W3-15-02: getCurrentSha256 returns constructor sha256', () => {
    it('returns the sha256 string passed to the constructor', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      expect(manager.getCurrentSha256()).toBe(EMPTY_SHA256);
    });
  });

  describe('FR-W3-15-03: needsUpdate returns true when latest.version differs from current', () => {
    it('returns true when latest version is higher than current', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      expect(manager.needsUpdate({ ...BASE_METADATA, version: '1.2.0' })).toBe(true);
    });

    it('returns true when latest version is a different string', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      expect(manager.needsUpdate({ ...BASE_METADATA, version: '1.0.1' })).toBe(true);
    });
  });

  describe('FR-W3-15-04: needsUpdate returns false when versions match', () => {
    it('returns false when latest.version equals currentVersion', () => {
      const manager = new ModelManager('1.2.0', EMPTY_SHA256);
      expect(manager.needsUpdate({ ...BASE_METADATA, version: '1.2.0' })).toBe(false);
    });
  });

  describe('FR-W3-15-05: verifyIntegrity returns true for correct sha256', () => {
    it('returns true for empty Uint8Array with its known sha256', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const data = new Uint8Array(0);
      expect(manager.verifyIntegrity(data, EMPTY_SHA256)).toBe(true);
    });

    it('returns true for non-empty data with matching sha256', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      const correct = sha256Hex(data);
      expect(manager.verifyIntegrity(data, correct)).toBe(true);
    });
  });

  describe('FR-W3-15-06: verifyIntegrity returns false for wrong sha256', () => {
    it('returns false when expected sha256 does not match data', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      expect(manager.verifyIntegrity(data, EMPTY_SHA256)).toBe(false);
    });

    it('returns false for completely wrong hash string', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const data = new Uint8Array([0x01]);
      expect(manager.verifyIntegrity(data, 'not-a-real-hash')).toBe(false);
    });
  });

  describe('FR-W3-15-07: parseUpdateCheckResponse returns updateAvailable=true when versions differ', () => {
    it('returns updateAvailable=true when response has newer version', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const response = {
        currentVersion: '1.0.0',
        latestVersion: '1.2.0',
        metadata: { ...BASE_METADATA, version: '1.2.0' },
      };
      const result = manager.parseUpdateCheckResponse(response);
      expect(result.updateAvailable).toBe(true);
    });

    it('result includes the latestVersion string', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const response = {
        currentVersion: '1.0.0',
        latestVersion: '1.3.0',
        metadata: { ...BASE_METADATA, version: '1.3.0' },
      };
      const result = manager.parseUpdateCheckResponse(response);
      expect(result.latestVersion).toBe('1.3.0');
    });
  });

  describe('FR-W3-15-08: parseUpdateCheckResponse returns updateAvailable=false when versions same', () => {
    it('returns updateAvailable=false when current equals latest', () => {
      const manager = new ModelManager('1.2.0', EMPTY_SHA256);
      const response = {
        currentVersion: '1.2.0',
        latestVersion: '1.2.0',
        metadata: { ...BASE_METADATA, version: '1.2.0' },
      };
      const result = manager.parseUpdateCheckResponse(response);
      expect(result.updateAvailable).toBe(false);
    });
  });

  describe('FR-W3-15-09: parseUpdateCheckResponse returns updateAvailable=false for null/invalid response', () => {
    it('returns updateAvailable=false for null input', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const result = manager.parseUpdateCheckResponse(null);
      expect(result.updateAvailable).toBe(false);
    });

    it('returns updateAvailable=false for undefined input', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const result = manager.parseUpdateCheckResponse(undefined);
      expect(result.updateAvailable).toBe(false);
    });

    it('returns updateAvailable=false for empty object', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const result = manager.parseUpdateCheckResponse({});
      expect(result.updateAvailable).toBe(false);
    });

    it('returns updateAvailable=false for non-object primitives', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      expect(manager.parseUpdateCheckResponse(42).updateAvailable).toBe(false);
      expect(manager.parseUpdateCheckResponse('string').updateAvailable).toBe(false);
      expect(manager.parseUpdateCheckResponse(true).updateAvailable).toBe(false);
    });

    it('does not throw for any input type', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      expect(() => manager.parseUpdateCheckResponse(null)).not.toThrow();
      expect(() => manager.parseUpdateCheckResponse(undefined)).not.toThrow();
      expect(() => manager.parseUpdateCheckResponse({ garbage: true })).not.toThrow();
    });
  });

  describe('FR-W3-15-10: verifyIntegrity handles empty Uint8Array', () => {
    it('empty Uint8Array with EMPTY_SHA256 returns true', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const empty = new Uint8Array(0);
      expect(manager.verifyIntegrity(empty, EMPTY_SHA256)).toBe(true);
    });

    it('empty Uint8Array with wrong hash returns false', () => {
      const manager = new ModelManager('1.0.0', EMPTY_SHA256);
      const empty = new Uint8Array(0);
      const wrongHash = 'a'.repeat(64);
      expect(manager.verifyIntegrity(empty, wrongHash)).toBe(false);
    });

    it('EMPTY_SHA256 constant matches Node.js crypto output for empty buffer', () => {
      // self-verifying: confirms the constant used in tests is correct
      expect(sha256Hex(new Uint8Array(0))).toBe(EMPTY_SHA256);
    });
  });

});
