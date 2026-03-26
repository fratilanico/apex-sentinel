// APEX-SENTINEL — FR-W12-08: RF Pipeline Integration
// src/rf2/rf-pipeline-integration.ts
//
// Integrates RF layer with AWNING stage classifier and ThreatContextEnricher.
// Subscribes to RF detection events via EventEmitter interface.
// Publishes filtered events and triggers AWNING stage upgrades.

import { EventEmitter } from 'node:events';
import { RfPrivacyFilter } from './rf-privacy-filter.js';
import { RfSessionTracker } from './rf-session-tracker.js';

export interface PipelineRfDetection {
  protocol: string;
  frequencyMHz: number;
  rssi: number;
  lat: number;
  lon: number;
  confidence: number;
  ts: number;
  macAddress?: string;
}

export interface PipelineAnomalyInput {
  anomalyType: 'jamming' | 'gps_spoofing' | 'replay_attack' | 'none';
  severity: number;
  affectedBandMHz?: [number, number];
}

export interface PipelineEvent {
  type: 'stage_upgrade' | 'threat_context' | 'rf_publish' | 'anomaly_alert';
  payload: Record<string, unknown>;
  ts: number;
}

// Protocols that trigger AWNING stage 2 upgrade
const STAGE2_PROTOCOLS = new Set(['elrs_900', 'elrs_2400']);
// Silence duration (ms) after ELRS session that triggers stage 3
const RF_SILENCE_STAGE3_MS = 5000;

export class RfPipelineIntegration {
  private readonly emitter = new EventEmitter();
  private readonly privacyFilter = new RfPrivacyFilter();
  private readonly sessionTracker = new RfSessionTracker();
  private lastElrsTs: number | null = null;
  private stage3Triggered = false;

  on(event: 'event', listener: (e: PipelineEvent) => void): void {
    this.emitter.on(event, listener);
  }

  ingest(detection: PipelineRfDetection): void {
    // 1. Privacy filter and publish
    const rawEvent = {
      frequencyMHz: detection.frequencyMHz,
      rssi: detection.rssi,
      ts: detection.ts,
      macAddress: detection.macAddress,
      bearingEstimate: { lat: detection.lat, lon: detection.lon },
    };
    const filtered = this.privacyFilter.filter(rawEvent);
    this.emit({
      type: 'rf_publish',
      payload: { ...filtered, protocol: detection.protocol },
      ts: detection.ts,
    });

    // 2. Threat context enrichment
    this.emit({
      type: 'threat_context',
      payload: {
        protocol: detection.protocol,
        confidence: detection.confidence,
        lat: detection.lat,
        lon: detection.lon,
        ts: detection.ts,
      },
      ts: detection.ts,
    });

    // 3. Session tracking
    this.sessionTracker.ingest({
      protocol: detection.protocol,
      lat: detection.lat,
      lon: detection.lon,
      confidence: detection.confidence,
      ts: detection.ts,
    });

    // 4. AWNING stage upgrade for confirmed ELRS 900
    if (STAGE2_PROTOCOLS.has(detection.protocol)) {
      this.lastElrsTs = detection.ts;
      this.stage3Triggered = false;
      this.emit({
        type: 'stage_upgrade',
        payload: { stage: 2, reason: `${detection.protocol} confirmed`, confidence: detection.confidence },
        ts: detection.ts,
      });
    }
  }

  ingestAnomaly(anomaly: PipelineAnomalyInput): void {
    if (anomaly.anomalyType === 'none') return;
    this.emit({
      type: 'anomaly_alert',
      payload: {
        anomalyType: anomaly.anomalyType,
        severity: anomaly.severity,
        affectedBandMHz: anomaly.affectedBandMHz,
      },
      ts: Date.now(),
    });
  }

  tick(nowMs: number): void {
    this.sessionTracker.tick(nowMs);

    // RF silence after active ELRS session → stage 3
    if (
      this.lastElrsTs !== null &&
      !this.stage3Triggered &&
      nowMs - this.lastElrsTs >= RF_SILENCE_STAGE3_MS
    ) {
      this.stage3Triggered = true;
      this.emit({
        type: 'stage_upgrade',
        payload: { stage: 3, reason: 'RF silence after ELRS session', silenceDurationMs: nowMs - this.lastElrsTs },
        ts: nowMs,
      });
    }
  }

  private emit(event: PipelineEvent): void {
    this.emitter.emit('event', event);
  }
}
