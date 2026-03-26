// APEX-SENTINEL — FR-W12-08: RfPipelineIntegration Tests
// tests/rf2/FR-W12-08-rf-pipeline.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RfPipelineIntegration,
  type PipelineRfDetection,
  type PipelineEvent,
} from '../../src/rf2/rf-pipeline-integration.js';

describe('FR-W12-08: RfPipelineIntegration', () => {
  let pipeline: RfPipelineIntegration;
  const emittedEvents: PipelineEvent[] = [];

  beforeEach(() => {
    emittedEvents.length = 0;
    pipeline = new RfPipelineIntegration();
    pipeline.on('event', (e: PipelineEvent) => emittedEvents.push(e));
  });

  const elrsDetection: PipelineRfDetection = {
    protocol: 'elrs_900',
    frequencyMHz: 900,
    rssi: -65,
    lat: 51.500,
    lon: 0.000,
    confidence: 0.85,
    ts: 1000,
  };

  const unknownDetection: PipelineRfDetection = {
    protocol: 'unknown',
    frequencyMHz: 400,
    rssi: -80,
    lat: 51.500,
    lon: 0.000,
    confidence: 0.40,
    ts: 1000,
  };

  const djiDetection: PipelineRfDetection = {
    protocol: 'dji_ocusync_2g',
    frequencyMHz: 2440,
    rssi: -70,
    lat: 51.500,
    lon: 0.000,
    confidence: 0.80,
    ts: 1000,
  };

  // ── ELRS 900 → Stage upgrade ──────────────────────────────────────────────

  it('FR-W12-08-T01: ELRS 900 detection emits stage_upgrade event', () => {
    pipeline.ingest(elrsDetection);
    const stageEvents = emittedEvents.filter(e => e.type === 'stage_upgrade');
    expect(stageEvents.length).toBeGreaterThan(0);
  });

  it('FR-W12-08-T02: ELRS 900 stage upgrade specifies stage 2', () => {
    pipeline.ingest(elrsDetection);
    const stageEvent = emittedEvents.find(e => e.type === 'stage_upgrade');
    expect(stageEvent).toBeDefined();
    expect(stageEvent!.payload.stage).toBe(2);
  });

  it('FR-W12-08-T03: unknown protocol does NOT emit stage_upgrade', () => {
    pipeline.ingest(unknownDetection);
    const stageEvents = emittedEvents.filter(e => e.type === 'stage_upgrade');
    expect(stageEvents.length).toBe(0);
  });

  // ── RF silence → Stage 3 ─────────────────────────────────────────────────

  it('FR-W12-08-T04: RF silence after active ELRS session triggers stage 3', () => {
    pipeline.ingest({ ...elrsDetection, ts: 1000 });
    // Advance time — ELRS link goes silent
    pipeline.tick(10000);
    const stage3Events = emittedEvents.filter(
      e => e.type === 'stage_upgrade' && e.payload.stage === 3,
    );
    expect(stage3Events.length).toBeGreaterThan(0);
  });

  // ── ThreatContextEnricher injection ──────────────────────────────────────

  it('FR-W12-08-T05: emits threat_context event for classified detection', () => {
    pipeline.ingest(elrsDetection);
    const contextEvents = emittedEvents.filter(e => e.type === 'threat_context');
    expect(contextEvents.length).toBeGreaterThan(0);
  });

  it('FR-W12-08-T06: threat_context event includes protocol', () => {
    pipeline.ingest(elrsDetection);
    const contextEvent = emittedEvents.find(e => e.type === 'threat_context');
    expect(contextEvent).toBeDefined();
    expect(contextEvent!.payload.protocol).toBe('elrs_900');
  });

  // ── Privacy filtering before publish ─────────────────────────────────────

  it('FR-W12-08-T07: published events do not contain raw MAC addresses', () => {
    const detectionWithMac: PipelineRfDetection = {
      ...elrsDetection,
      macAddress: 'AA:BB:CC:DD:EE:FF',
    };
    pipeline.ingest(detectionWithMac);
    const publishedEvents = emittedEvents.filter(e => e.type === 'rf_publish');
    for (const e of publishedEvents) {
      expect((e.payload as any).macAddress).toBeUndefined();
    }
  });

  // ── DJI detection ─────────────────────────────────────────────────────────

  it('FR-W12-08-T08: DJI OcuSync detection emits threat_context with dji protocol', () => {
    pipeline.ingest(djiDetection);
    const contextEvent = emittedEvents.find(e => e.type === 'threat_context');
    expect(contextEvent).toBeDefined();
    expect(contextEvent!.payload.protocol).toBe('dji_ocusync_2g');
  });

  // ── Multi-detection scenario ──────────────────────────────────────────────

  it('FR-W12-08-T09: multiple ingestions produce multiple context events', () => {
    pipeline.ingest(elrsDetection);
    pipeline.ingest({ ...elrsDetection, ts: 2000 });
    pipeline.ingest({ ...elrsDetection, ts: 3000 });
    const contextEvents = emittedEvents.filter(e => e.type === 'threat_context');
    expect(contextEvents.length).toBeGreaterThanOrEqual(3);
  });

  // ── Anomaly forwarding ────────────────────────────────────────────────────

  it('FR-W12-08-T10: spectrum anomaly injected from pipeline emits anomaly_alert', () => {
    pipeline.ingestAnomaly({ anomalyType: 'jamming', severity: 0.9, affectedBandMHz: [850, 950] });
    const anomalyEvents = emittedEvents.filter(e => e.type === 'anomaly_alert');
    expect(anomalyEvents.length).toBeGreaterThan(0);
  });

  it('FR-W12-08-T11: anomaly_alert payload includes anomalyType', () => {
    pipeline.ingestAnomaly({ anomalyType: 'gps_spoofing', severity: 0.7 });
    const anomalyEvent = emittedEvents.find(e => e.type === 'anomaly_alert');
    expect(anomalyEvent).toBeDefined();
    expect(anomalyEvent!.payload.anomalyType).toBe('gps_spoofing');
  });

  // ── Event bus ─────────────────────────────────────────────────────────────

  it('FR-W12-08-T12: pipeline emits events via EventEmitter interface', () => {
    expect(typeof pipeline.on).toBe('function');
    expect(typeof pipeline.ingest).toBe('function');
    expect(typeof pipeline.tick).toBe('function');
  });

  it('FR-W12-08-T13: none anomaly type does not emit anomaly_alert', () => {
    pipeline.ingestAnomaly({ anomalyType: 'none', severity: 0 });
    const anomalyEvents = emittedEvents.filter(e => e.type === 'anomaly_alert');
    expect(anomalyEvents.length).toBe(0);
  });
});
