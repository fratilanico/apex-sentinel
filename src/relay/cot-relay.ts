// APEX-SENTINEL — Cursor on Target (CoT) Relay
// FR-W2-11: Buffers and relays CoT XML packets over TCP/UDP

import * as net from 'net';
import * as dgram from 'dgram';

export interface CotRelayConfig {
  host: string;
  port: number;
  protocol: 'tcp' | 'udp';
  reconnectMs: number;
  maxRetries: number;
}

export interface CotPacket {
  xml: string;
  trackId: string;
  timestamp: number;
}

/**
 * Validates a CoT XML string using regex-based checks (no full XML parser).
 * Returns { valid: true } for well-formed CoT events, or { valid: false, reason } otherwise.
 */
export function validateCotXml(xml: string): { valid: boolean; reason?: string } {
  if (!xml || xml.trim() === '') {
    return { valid: false, reason: 'empty' };
  }

  if (!/uid\s*=\s*"[^"]*"/.test(xml)) {
    return { valid: false, reason: 'missing uid attribute' };
  }

  if (!/type\s*=\s*"[^"]*"/.test(xml)) {
    return { valid: false, reason: 'missing type attribute' };
  }

  if (!/<point/.test(xml)) {
    return { valid: false, reason: 'missing point element' };
  }

  return { valid: true };
}

export class CotRelay {
  private readonly config: CotRelayConfig;
  private buffer: CotPacket[] = [];
  private connected: boolean = false;
  private tcpSocket: net.Socket | null = null;

  constructor(config: CotRelayConfig) {
    this.config = { ...config };
  }

  async connect(): Promise<void> {
    if (this.config.protocol === 'tcp') {
      return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.connect(this.config.port, this.config.host, () => {
          this.tcpSocket = socket;
          this.connected = true;
          resolve();
        });
        socket.on('error', (err) => {
          this.connected = false;
          reject(err);
        });
        socket.on('close', () => {
          this.connected = false;
          this.tcpSocket = null;
        });
      });
    }
    // UDP is connectionless — mark as connected immediately
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    if (this.tcpSocket) {
      this.tcpSocket.destroy();
      this.tcpSocket = null;
    }
  }

  async send(packet: CotPacket): Promise<boolean> {
    if (!this.connected) {
      this.bufferPacket(packet);
      return false;
    }

    if (this.config.protocol === 'tcp' && this.tcpSocket) {
      return new Promise((resolve) => {
        this.tcpSocket!.write(packet.xml + '\n', (err) => {
          if (err) {
            this.bufferPacket(packet);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    }

    if (this.config.protocol === 'udp') {
      return new Promise((resolve) => {
        const client = dgram.createSocket('udp4');
        const data = Buffer.from(packet.xml);
        client.send(data, this.config.port, this.config.host, (err) => {
          client.close();
          if (err) {
            this.bufferPacket(packet);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    }

    return false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getQueueSize(): number {
    return this.buffer.length;
  }

  bufferPacket(packet: CotPacket): void {
    this.buffer.push(packet);
  }

  flushBuffer(): CotPacket[] {
    const packets = [...this.buffer];
    this.buffer = [];
    return packets;
  }
}
