// APEX-SENTINEL — PTZ Slave Output
// FR-W7-06 | src/output/ptz-slave-output.ts
//
// Drives PTZ cameras via ONVIF RelativeMove commands.
// Receives EKF track state and computes predictive bearing with look-ahead.
// Transport is injected for testability (real transport: ONVIF HTTP over LAN).
//
// INDIGO spec: publish at 100Hz, 8ms look-ahead for Dahua IPC-HFW cameras.

import type { EKFState } from '../prediction/types.js';

const DEG2RAD = Math.PI / 180;

export interface PtzConfig {
  onvifEndpoint: string;
  publishRateHz: number;
  lookAheadMs: number;
  transport: { send: (xml: string) => Promise<{ status: number }> };
}

export interface CameraPosition {
  lat: number;
  lon: number;
}

export interface PtzBearingEvent {
  bearingDeg: number;
  elevationDeg: number;
  timestampMs: number;
}

type PtzEventName = 'bearing';
type PtzListener = (event: PtzBearingEvent) => void;

export class PtzSlaveOutput {
  readonly config: PtzConfig;
  private readonly listeners = new Map<PtzEventName, PtzListener[]>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: PtzConfig) {
    this.config = config;
  }

  /**
   * Build ONVIF RelativeMove XML for a PTZ command.
   * bearingDeg is wrapped to [0, 360). elevationDeg is clamped to [-90, 90].
   */
  buildOnvifXml(bearingDeg: number, elevationDeg: number): string {
    const pan = ((bearingDeg % 360) + 360) % 360;
    const tilt = Math.max(-90, Math.min(90, elevationDeg));
    return (
      `<PTZRelativeMove xmlns="http://www.onvif.org/ver20/ptz/wsdl">` +
      `<ProfileToken>Profile_1</ProfileToken>` +
      `<Translation>` +
      `<PanTilt x="${pan.toFixed(4)}" y="${tilt.toFixed(4)}" />` +
      `</Translation>` +
      `</PTZRelativeMove>`
    );
  }

  /**
   * Compute predictive bearing from camera to predicted drone position at lookAheadMs.
   * Uses EKF velocity (vLat, vLon in °/s) to extrapolate position.
   */
  predictBearing(state: EKFState, lookAheadMs: number, camera: CameraPosition): number {
    const dt = lookAheadMs / 1000; // seconds
    const futureLat = state.lat + state.vLat * dt;
    const futureLon = state.lon + state.vLon * dt;

    const dLat = (futureLat - camera.lat) * DEG2RAD;
    const dLon = (futureLon - camera.lon) * DEG2RAD;
    const bearingRad = Math.atan2(dLon, dLat);
    const bearingDeg = ((bearingRad / DEG2RAD) + 360) % 360;
    return bearingDeg;
  }

  /** Publish a bearing command to the ONVIF transport. */
  async publishBearing(bearingDeg: number, elevationDeg: number): Promise<void> {
    const xml = this.buildOnvifXml(bearingDeg, elevationDeg);
    await this.config.transport.send(xml);
    this.emit('bearing', {
      bearingDeg,
      elevationDeg,
      timestampMs: Date.now(),
    });
  }

  /** Start periodic publishing of bearing updates. */
  start(state: EKFState, camera: CameraPosition): void {
    const intervalMs = 1000 / this.config.publishRateHz;
    this.intervalId = setInterval(() => {
      const bearing = this.predictBearing(state, this.config.lookAheadMs, camera);
      this.publishBearing(bearing, 0).catch(() => { /* ignore transport errors in periodic loop */ });
    }, intervalMs);
  }

  /** Stop periodic publishing. */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  on(event: PtzEventName, listener: PtzListener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  private emit(event: PtzEventName, payload: PtzBearingEvent): void {
    const ls = this.listeners.get(event) ?? [];
    for (const l of ls) l(payload);
  }
}
