// APEX-SENTINEL — W8 PTZ Hardware Integration Client
// FR-W8-03 | src/output/ptz-integration-client.ts
// ONVIF PTZ integration with command queue, timeout→home, and NATS event bridge.

import { randomUUID } from 'crypto';

export interface PtzCommand {
  commandId: string;
  bearing: number;  // 0–360°
  tilt: number;     // -90–90°
  issuedAt: number; // Date.now()
}

export interface PtzAck {
  commandId: string;
  acknowledgedAt: number;
  success: boolean;
  error?: string;
}

export interface OnvifClient {
  sendAbsoluteMove(bearing: number, tilt: number): Promise<{ ack: boolean }>;
}

export interface NatsClient {
  publish(subject: string, payload: unknown): void;
  subscribe(subject: string, handler: (payload: unknown) => void): void;
}

export const HOME_BEARING = 0;
export const HOME_TILT = 0;
export const ONVIF_TIMEOUT_MS = 2000;
export const COMMAND_SEND_TIMEOUT_MS = 200;

export class PtzIntegrationClient {
  private onvifClient: OnvifClient | null = null;
  private natsClient: NatsClient | null = null;
  private commandQueue: PtzCommand[] = [];
  private activeCommand: PtzCommand | null = null;
  private isProcessing = false;
  readonly ONVIF_TIMEOUT_MS = ONVIF_TIMEOUT_MS;

  setOnvifClient(client: OnvifClient): void {
    this.onvifClient = client;
  }

  setNatsClient(client: NatsClient): void {
    this.natsClient = client;
    // Listen for NATS bearing commands
    this.natsClient.subscribe('ptz.command.bearing', (payload: unknown) => {
      const cmd = payload as { bearing: number; tilt?: number };
      this.sendBearing(cmd.bearing, cmd.tilt ?? 0).catch(() => {});
    });
  }

  async sendBearing(bearing: number, tilt: number): Promise<{ commandId: string; status: string }> {
    if (bearing < 0 || bearing > 360) {
      throw new Error('INVALID_BEARING: bearing must be 0–360°');
    }

    const command: PtzCommand = {
      commandId: randomUUID(),
      bearing,
      tilt,
      issuedAt: Date.now(),
    };

    this.commandQueue.push(command);

    if (!this.isProcessing) {
      this.processQueue();
    }

    return { commandId: command.commandId, status: 'queued' };
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift()!;
      this.activeCommand = command;

      try {
        await this.executeCommand(command);
      } catch {
        // Error already handled in executeCommand
      }
    }

    this.isProcessing = false;
    this.activeCommand = null;
  }

  private async executeCommand(command: PtzCommand): Promise<void> {
    if (!this.onvifClient) throw new Error('ONVIF client not configured');

    // Enforce COMMAND_SEND_TIMEOUT_MS for the actual send
    const sendPromise = this.onvifClient.sendAbsoluteMove(command.bearing, command.tilt);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ONVIF_TIMEOUT')), this.ONVIF_TIMEOUT_MS)
    );

    try {
      const result = await Promise.race([sendPromise, timeoutPromise]);
      if (result.ack) {
        // Publish ACK to NATS
        this.natsClient?.publish(`ptz.command.ack.${command.commandId}`, {
          commandId: command.commandId,
          acknowledgedAt: Date.now(),
          success: true,
        });
      }
    } catch {
      // Timeout or error → return to home
      await this.returnToHome(command.commandId);
    }
  }

  private async returnToHome(commandId: string): Promise<void> {
    if (!this.onvifClient) return;
    try {
      await this.onvifClient.sendAbsoluteMove(HOME_BEARING, HOME_TILT);
      this.natsClient?.publish(`ptz.command.ack.${commandId}`, {
        commandId,
        acknowledgedAt: Date.now(),
        success: false,
        error: 'TIMEOUT_RETURNED_HOME',
      });
    } catch {
      // Best effort
    }
  }

  getActiveCommand(): PtzCommand | null {
    return this.activeCommand;
  }

  getQueueDepth(): number {
    return this.commandQueue.length;
  }
}
