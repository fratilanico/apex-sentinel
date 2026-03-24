// APEX-SENTINEL — TDD RED Tests
// FR-W2-13: NATS Auth & TLS Configuration
// Status: RED — implementation in src/nats/auth-config.ts does NOT exist yet

import { describe, it, expect } from 'vitest';
import {
  buildAuthConfig,
  validateCertPaths,
  getServerUrls,
  type NatsAuthConfig,
} from '../../src/nats/auth-config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_NODE_ID = 'node-abc123';
const TEST_CERTS_DIR = '/etc/apex-sentinel/certs';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W2-13-00: NATS Auth & TLS Configuration', () => {

  describe('FR-W2-13-01: buildAuthConfig returns config with all 3 TLS file paths set', () => {
    it('returns an object with tlsConfig.certFile, tlsConfig.keyFile, tlsConfig.caFile', () => {
      const config = buildAuthConfig(TEST_NODE_ID, TEST_CERTS_DIR);
      expect(config.tlsConfig).toBeDefined();
      expect(typeof config.tlsConfig.certFile).toBe('string');
      expect(config.tlsConfig.certFile.length).toBeGreaterThan(0);
      expect(typeof config.tlsConfig.keyFile).toBe('string');
      expect(config.tlsConfig.keyFile.length).toBeGreaterThan(0);
      expect(typeof config.tlsConfig.caFile).toBe('string');
      expect(config.tlsConfig.caFile.length).toBeGreaterThan(0);
    });

    it('all TLS paths start with the certsDir prefix', () => {
      const config = buildAuthConfig(TEST_NODE_ID, TEST_CERTS_DIR);
      expect(config.tlsConfig.certFile).toContain(TEST_CERTS_DIR);
      expect(config.tlsConfig.keyFile).toContain(TEST_CERTS_DIR);
      expect(config.tlsConfig.caFile).toContain(TEST_CERTS_DIR);
    });
  });

  describe('FR-W2-13-02: certFile path includes nodeId (node-specific certificate)', () => {
    it('certFile contains the nodeId string', () => {
      const config = buildAuthConfig(TEST_NODE_ID, TEST_CERTS_DIR);
      expect(config.tlsConfig.certFile).toContain(TEST_NODE_ID);
    });

    it('different nodeIds produce different certFile paths', () => {
      const config1 = buildAuthConfig('node-111', TEST_CERTS_DIR);
      const config2 = buildAuthConfig('node-222', TEST_CERTS_DIR);
      expect(config1.tlsConfig.certFile).not.toBe(config2.tlsConfig.certFile);
    });
  });

  describe('FR-W2-13-03: credentialsFile path ends with ".creds"', () => {
    it('credentialsFile ends with ".creds"', () => {
      const config = buildAuthConfig(TEST_NODE_ID, TEST_CERTS_DIR);
      expect(config.credentialsFile).toMatch(/\.creds$/);
    });

    it('credentialsFile is a non-empty string', () => {
      const config = buildAuthConfig(TEST_NODE_ID, TEST_CERTS_DIR);
      expect(config.credentialsFile.length).toBeGreaterThan(0);
    });
  });

  describe('FR-W2-13-04: getServerUrls() returns 5 URLs (one per NATS node)', () => {
    it('returns exactly 5 URLs', () => {
      const urls = getServerUrls();
      expect(urls).toHaveLength(5);
    });

    it('returns an array of strings', () => {
      const urls = getServerUrls();
      for (const url of urls) {
        expect(typeof url).toBe('string');
      }
    });
  });

  describe('FR-W2-13-05: all server URLs use "nats://" scheme and port 4222', () => {
    it('every URL starts with "nats://"', () => {
      const urls = getServerUrls();
      for (const url of urls) {
        expect(url).toMatch(/^nats:\/\//);
      }
    });

    it('every URL ends with ":4222"', () => {
      const urls = getServerUrls();
      for (const url of urls) {
        expect(url).toMatch(/:4222$/);
      }
    });
  });

  describe('FR-W2-13-06: validateCertPaths returns valid=false and lists missing files', () => {
    it('returns valid=false when cert paths do not exist on disk', () => {
      const config: NatsAuthConfig = {
        tlsConfig: {
          certFile: '/nonexistent/path/node.crt',
          keyFile:  '/nonexistent/path/node.key',
          caFile:   '/nonexistent/path/ca.crt',
        },
        credentialsFile: '/nonexistent/path/node.creds',
        serverUrls: ['nats://nats1:4222'],
      };
      const result = validateCertPaths(config);
      expect(result.valid).toBe(false);
    });

    it('missing array contains all absent file paths', () => {
      const missingCert = '/nonexistent/path/node.crt';
      const missingKey  = '/nonexistent/path/node.key';
      const missingCa   = '/nonexistent/path/ca.crt';
      const config: NatsAuthConfig = {
        tlsConfig: {
          certFile: missingCert,
          keyFile:  missingKey,
          caFile:   missingCa,
        },
        credentialsFile: '/nonexistent/path/node.creds',
        serverUrls: [],
      };
      const result = validateCertPaths(config);
      expect(result.missing).toContain(missingCert);
      expect(result.missing).toContain(missingKey);
      expect(result.missing).toContain(missingCa);
    });

    it('missing array is non-empty when paths do not exist', () => {
      const config: NatsAuthConfig = {
        tlsConfig: {
          certFile: '/does/not/exist.crt',
          keyFile:  '/does/not/exist.key',
          caFile:   '/does/not/exist-ca.crt',
        },
        credentialsFile: '/does/not/exist.creds',
        serverUrls: [],
      };
      const result = validateCertPaths(config);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });

  describe('FR-W2-13-07: serverUrls include nats1 through nats5 hostnames', () => {
    it('URLs contain hostnames nats1 through nats5', () => {
      const urls = getServerUrls();
      for (let i = 1; i <= 5; i++) {
        const hasHost = urls.some((url) => url.includes(`nats${i}`));
        expect(hasHost, `Expected a URL containing "nats${i}"`).toBe(true);
      }
    });

    it('no duplicate URLs', () => {
      const urls = getServerUrls();
      const unique = new Set(urls);
      expect(unique.size).toBe(urls.length);
    });
  });

});
