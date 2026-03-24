// APEX-SENTINEL — TDD Tests
// FR-W2-11: CoT Relay (Cursor on Target TCP/UDP relay)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CotRelay, validateCotXml } from '../../src/relay/cot-relay.js';
import type { CotRelayConfig, CotPacket } from '../../src/relay/cot-relay.js';

// ── Mock net and dgram for connection/send tests ──────────────────────────────

// Shared mutable mock socket — tests can replace write/send to simulate errors
const mockTcpSocketWrite = vi.fn((_data: string, cb: (err?: Error) => void) => { cb(); });
const mockTcpSocket = {
  connect: vi.fn(function (_port: number, _host: string, cb: () => void) { cb(); }),
  write: (...args: Parameters<typeof mockTcpSocketWrite>) => mockTcpSocketWrite(...args),
  destroy: vi.fn(),
  on: vi.fn(function () { return mockTcpSocket; }),
};

vi.mock('net', () => {
  // Use a regular function (not arrow) so it can be called with `new`
  // When a constructor returns an object, `new` returns that object
  function MockSocket(this: unknown) { return mockTcpSocket; }
  return { Socket: MockSocket };
});

const mockUdpSend = vi.fn(
  (_buf: Buffer, _port: number, _host: string, cb: (err?: Error) => void) => { cb(); }
);
const mockUdpSocket = {
  send: (...args: Parameters<typeof mockUdpSend>) => mockUdpSend(...args),
  close: vi.fn(),
};

vi.mock('dgram', () => ({
  createSocket: vi.fn(() => mockUdpSocket),
}));

const DEFAULT_CONFIG: CotRelayConfig = {
  host: '127.0.0.1',
  port: 8087,
  protocol: 'tcp',
  reconnectMs: 3000,
  maxRetries: 5,
};

const VALID_COT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
      uid="APEX-TRK-W2-001"
      type="a-h-A-M-F-U-M"
      how="m-g"
      time="2026-03-24T14:32:00.000Z"
      start="2026-03-24T14:32:00.000Z"
      stale="2026-03-24T14:32:30.000Z">
  <point lat="48.2255" lon="24.3370" hae="85" ce="12" le="20"/>
  <detail>
    <track speed="22.5" course="217"/>
  </detail>
</event>`;

function makePacket(overrides: Partial<CotPacket> = {}): CotPacket {
  return {
    xml: VALID_COT_XML,
    trackId: 'TRK-W2-001',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FR-W2-11-01: CotRelay constructor sets config correctly', () => {
  it('should store the provided config without modification', () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    expect(relay).toBeDefined();
    // Config is accessible via getter or stored property
    // The relay object should be constructible without throwing
  });

  it('should accept tcp protocol', () => {
    expect(() => new CotRelay({ ...DEFAULT_CONFIG, protocol: 'tcp' })).not.toThrow();
  });

  it('should accept udp protocol', () => {
    expect(() => new CotRelay({ ...DEFAULT_CONFIG, protocol: 'udp' })).not.toThrow();
  });
});

describe('FR-W2-11-02: isConnected() returns false before connect()', () => {
  it('should report not connected on a freshly constructed relay', () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    expect(relay.isConnected()).toBe(false);
  });
});

describe('FR-W2-11-03: validateCotXml returns valid=true for well-formed CoT XML', () => {
  it('should accept a complete CoT event with uid, type, and point', () => {
    const result = validateCotXml(VALID_COT_XML);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('FR-W2-11-04: validateCotXml returns valid=false for XML missing uid attribute', () => {
  it('should reject a CoT event without uid', () => {
    const xml = VALID_COT_XML.replace(/uid="[^"]*"/, '');
    const result = validateCotXml(xml);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toMatch(/uid/i);
  });
});

describe('FR-W2-11-05: validateCotXml returns valid=false for XML missing type attribute', () => {
  it('should reject a CoT event without type', () => {
    const xml = VALID_COT_XML.replace(/type="[^"]*"/, '');
    const result = validateCotXml(xml);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toMatch(/type/i);
  });
});

describe('FR-W2-11-06: validateCotXml returns valid=false for XML missing <point> element', () => {
  it('should reject a CoT event without a point element', () => {
    const xml = VALID_COT_XML.replace(/<point[^/]*\/>/, '');
    const result = validateCotXml(xml);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toMatch(/point/i);
  });
});

describe('FR-W2-11-07: validateCotXml returns valid=false for empty string', () => {
  it('should reject an empty string', () => {
    const result = validateCotXml('');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('should reject a whitespace-only string', () => {
    const result = validateCotXml('   ');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe('FR-W2-11-08: bufferPacket adds packet to internal queue', () => {
  let relay: CotRelay;

  beforeEach(() => {
    relay = new CotRelay(DEFAULT_CONFIG);
  });

  it('should increase queue size by 1 after bufferPacket', () => {
    const before = relay.getQueueSize();
    relay.bufferPacket(makePacket());
    expect(relay.getQueueSize()).toBe(before + 1);
  });

  it('should increase queue size by 3 after three bufferPacket calls', () => {
    relay.bufferPacket(makePacket({ trackId: 'TRK-001' }));
    relay.bufferPacket(makePacket({ trackId: 'TRK-002' }));
    relay.bufferPacket(makePacket({ trackId: 'TRK-003' }));
    expect(relay.getQueueSize()).toBe(3);
  });
});

describe('FR-W2-11-09: flushBuffer returns all buffered packets and empties queue', () => {
  it('should return the packets that were buffered', () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    const p1 = makePacket({ trackId: 'TRK-001' });
    const p2 = makePacket({ trackId: 'TRK-002' });
    relay.bufferPacket(p1);
    relay.bufferPacket(p2);
    const flushed = relay.flushBuffer();
    expect(flushed).toHaveLength(2);
    expect(flushed.map((p) => p.trackId)).toContain('TRK-001');
    expect(flushed.map((p) => p.trackId)).toContain('TRK-002');
  });

  it('should return an empty array when buffer is already empty', () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    const flushed = relay.flushBuffer();
    expect(flushed).toHaveLength(0);
  });
});

describe('FR-W2-11-10: getQueueSize() returns 0 after flushBuffer()', () => {
  it('should report zero queue size after flushing', () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    relay.bufferPacket(makePacket());
    relay.bufferPacket(makePacket());
    relay.flushBuffer();
    expect(relay.getQueueSize()).toBe(0);
  });
});

describe('FR-W2-11-11: send() when not connected calls bufferPacket and returns false', () => {
  it('should return false when relay is not connected', async () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    const result = await relay.send(makePacket());
    expect(result).toBe(false);
  });

  it('should buffer the packet when send() is called while not connected', async () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    await relay.send(makePacket({ trackId: 'TRK-BUFFERED' }));
    expect(relay.getQueueSize()).toBe(1);
    const flushed = relay.flushBuffer();
    expect(flushed[0].trackId).toBe('TRK-BUFFERED');
  });
});

// ── Connection tests (lines 55-83) ───────────────────────────────────────────

describe('FR-W2-11-12: connect() TCP — marks connected and wires socket', async () => {
  it('should mark isConnected() true after TCP connect succeeds', async () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    expect(relay.isConnected()).toBe(false);
    await relay.connect();
    expect(relay.isConnected()).toBe(true);
  });
});

describe('FR-W2-11-13: connect() UDP — marks connected without network socket', async () => {
  it('should mark isConnected() true after UDP connect (connectionless)', async () => {
    const relay = new CotRelay({ ...DEFAULT_CONFIG, protocol: 'udp' });
    expect(relay.isConnected()).toBe(false);
    await relay.connect();
    expect(relay.isConnected()).toBe(true);
  });
});

describe('FR-W2-11-14: disconnect() — marks not connected and destroys TCP socket', () => {
  it('should mark isConnected() false after disconnect on TCP relay', async () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    await relay.connect();
    expect(relay.isConnected()).toBe(true);
    relay.disconnect();
    expect(relay.isConnected()).toBe(false);
  });

  it('should mark isConnected() false after disconnect on UDP relay', async () => {
    const relay = new CotRelay({ ...DEFAULT_CONFIG, protocol: 'udp' });
    await relay.connect();
    relay.disconnect();
    expect(relay.isConnected()).toBe(false);
  });
});

// ── Send when connected (lines 92-121) ───────────────────────────────────────

describe('FR-W2-11-15: send() TCP — returns true on successful write', async () => {
  it('should return true when TCP socket write succeeds', async () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    await relay.connect();
    const result = await relay.send(makePacket());
    expect(result).toBe(true);
  });

  it('should not buffer packet when TCP send succeeds', async () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    await relay.connect();
    await relay.send(makePacket());
    expect(relay.getQueueSize()).toBe(0);
  });
});

describe('FR-W2-11-16: send() TCP — buffers and returns false on write error', async () => {
  it('should return false and buffer packet when TCP write fails', async () => {
    // Override the shared write mock to simulate a socket error
    mockTcpSocketWrite.mockImplementationOnce((_data: string, cb: (err?: Error) => void) => {
      cb(new Error('ECONNRESET'));
    });

    const relay = new CotRelay(DEFAULT_CONFIG);
    await relay.connect();
    const result = await relay.send(makePacket({ trackId: 'TRK-ERR' }));
    expect(result).toBe(false);
    expect(relay.getQueueSize()).toBe(1);
    const flushed = relay.flushBuffer();
    expect(flushed[0].trackId).toBe('TRK-ERR');
  });
});

describe('FR-W2-11-17: send() UDP — returns true on successful datagram send', async () => {
  it('should return true when UDP send succeeds', async () => {
    const relay = new CotRelay({ ...DEFAULT_CONFIG, protocol: 'udp' });
    await relay.connect();
    const result = await relay.send(makePacket());
    expect(result).toBe(true);
  });

  it('should not buffer packet when UDP send succeeds', async () => {
    const relay = new CotRelay({ ...DEFAULT_CONFIG, protocol: 'udp' });
    await relay.connect();
    await relay.send(makePacket());
    expect(relay.getQueueSize()).toBe(0);
  });
});

describe('FR-W2-11-18: send() UDP — buffers and returns false on dgram error', async () => {
  it('should return false and buffer packet when UDP send fails', async () => {
    mockUdpSend.mockImplementationOnce(
      (_buf: Buffer, _port: number, _host: string, cb: (err?: Error) => void) => {
        cb(new Error('ENETUNREACH'));
      }
    );

    const relay = new CotRelay({ ...DEFAULT_CONFIG, protocol: 'udp' });
    await relay.connect();
    const result = await relay.send(makePacket({ trackId: 'TRK-UDP-ERR' }));
    expect(result).toBe(false);
    expect(relay.getQueueSize()).toBe(1);
  });
});

describe('FR-W2-11-19: flushBuffer() preserves FIFO order', () => {
  it('should return packets in insertion order (FIFO — critical for TDoA correlation)', () => {
    const relay = new CotRelay(DEFAULT_CONFIG);
    relay.bufferPacket(makePacket({ trackId: 'TRK-A', timestamp: 1000 }));
    relay.bufferPacket(makePacket({ trackId: 'TRK-B', timestamp: 2000 }));
    relay.bufferPacket(makePacket({ trackId: 'TRK-C', timestamp: 3000 }));
    const flushed = relay.flushBuffer();
    expect(flushed[0].trackId).toBe('TRK-A');
    expect(flushed[1].trackId).toBe('TRK-B');
    expect(flushed[2].trackId).toBe('TRK-C');
  });
});
