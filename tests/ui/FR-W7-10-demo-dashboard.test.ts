// APEX-SENTINEL — W7 Demo Dashboard API Tests
// FR-W7-10 | tests/ui/FR-W7-10-demo-dashboard.test.ts
// Dashboard API layer: tracks, alerts, heatmap, operator auth, SSE event format

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DemoDashboardApi,
  DashboardConfig,
  TrackRecord,
  AlertRecord,
  HeatmapPoint,
  SseEvent,
} from '../../src/ui/demo-dashboard/api.js';

function makeTrack(overrides: Partial<TrackRecord> = {}): TrackRecord {
  return {
    id: 'TRK-001',
    lat: 51.5074,
    lon: 4.9034,
    classification: 'shahed-136',
    confidence: 0.92,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAlert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    id: 'ALT-001',
    message: 'Hostile UAS inbound on bearing 270',
    severity: 'critical' as const,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FR-W7-10: DemoDashboard API', () => {
  let api: DemoDashboardApi;
  const now = Date.now();

  beforeEach(() => {
    api = new DemoDashboardApi({
      refreshRateMs: 1000,
      maxTracksDisplayed: 50,
      heatmapResolution: 0.001,
    });
    // Seed some data
    api._seedTracks([
      makeTrack({ id: 'TRK-001', timestamp: now - 10_000 }),
      makeTrack({ id: 'TRK-002', timestamp: now - 30_000 }),
      makeTrack({ id: 'TRK-003', timestamp: now - 90_000 }), // older than 60s
    ]);
    api._seedAlerts([
      makeAlert({ id: 'ALT-001', timestamp: now - 5_000 }),
      makeAlert({ id: 'ALT-002', timestamp: now - 15_000 }),
      makeAlert({ id: 'ALT-003', timestamp: now - 25_000 }),
    ]);
  });

  // AC-01: getRecentTracks returns array from last 60s
  it('AC-01: getRecentTracks() returns array of tracks from last 60s', () => {
    const tracks = api.getRecentTracks();
    expect(Array.isArray(tracks)).toBe(true);
    // TRK-003 at -90s should be excluded
    expect(tracks.length).toBe(2);
    expect(tracks.every(t => t.id !== 'TRK-003')).toBe(true);
  });

  // AC-02: getRecentAlerts returns last N
  it('AC-02: getRecentAlerts(limit) returns last N alerts', () => {
    const alerts = api.getRecentAlerts(2);
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBe(2);
  });

  // AC-03: formatTrackForMap returns Leaflet-compatible shape
  it('AC-03: formatTrackForMap(track) returns {lat, lon, classification, confidence, timestamp}', () => {
    const track = makeTrack();
    const formatted = api.formatTrackForMap(track);
    expect(formatted).toHaveProperty('lat');
    expect(formatted).toHaveProperty('lon');
    expect(formatted).toHaveProperty('classification');
    expect(formatted).toHaveProperty('confidence');
    expect(formatted).toHaveProperty('timestamp');
    expect(typeof formatted.lat).toBe('number');
    expect(typeof formatted.lon).toBe('number');
    expect(typeof formatted.classification).toBe('string');
    expect(typeof formatted.confidence).toBe('number');
  });

  // AC-04: formatAlertForLog returns log-compatible shape
  it('AC-04: formatAlertForLog(alert) returns {id, message, severity, timestamp}', () => {
    const alert = makeAlert();
    const formatted = api.formatAlertForLog(alert);
    expect(formatted).toHaveProperty('id');
    expect(formatted).toHaveProperty('message');
    expect(formatted).toHaveProperty('severity');
    expect(formatted).toHaveProperty('timestamp');
    expect(typeof formatted.id).toBe('string');
    expect(typeof formatted.message).toBe('string');
    expect(typeof formatted.severity).toBe('string');
  });

  // AC-05: buildHeatmapData returns [lat, lon, weight] tuples
  it('AC-05: buildHeatmapData(tracks) returns array of [lat, lon, weight] tuples', () => {
    const tracks = [
      makeTrack({ lat: 51.50, lon: 4.90 }),
      makeTrack({ lat: 51.51, lon: 4.91 }),
    ];
    const heatmap = api.buildHeatmapData(tracks);
    expect(Array.isArray(heatmap)).toBe(true);
    expect(heatmap.length).toBeGreaterThan(0);
    // Each tuple: [lat, lon, weight]
    const point = heatmap[0] as HeatmapPoint;
    expect(point.length).toBe(3);
    expect(typeof point[0]).toBe('number'); // lat
    expect(typeof point[1]).toBe('number'); // lon
    expect(typeof point[2]).toBe('number'); // weight
  });

  // AC-06: authenticateOperator valid token
  it('AC-06: authenticateOperator({token}) returns {valid: true} for valid token', () => {
    const validToken = 'apex-sentinel-operator-2026';
    api._registerToken(validToken);
    const result = api.authenticateOperator({ token: validToken });
    expect(result.valid).toBe(true);
  });

  // AC-07: authenticateOperator invalid token
  it('AC-07: authenticateOperator({token: "invalid"}) returns {valid: false}', () => {
    const result = api.authenticateOperator({ token: 'invalid' });
    expect(result.valid).toBe(false);
  });

  // AC-08: getSystemStatus returns required fields
  it('AC-08: getSystemStatus() returns {natsConnected, activeNodes, tracksLast60s}', () => {
    const status = api.getSystemStatus();
    expect(status).toHaveProperty('natsConnected');
    expect(status).toHaveProperty('activeNodes');
    expect(status).toHaveProperty('tracksLast60s');
    expect(typeof status.natsConnected).toBe('boolean');
    expect(typeof status.activeNodes).toBe('number');
    expect(typeof status.tracksLast60s).toBe('number');
  });

  // AC-09: SSE event format
  it('AC-09: SSE event format has {type: "track_update"|"alert"|"system_status", data: ...}', () => {
    const trackEvt: SseEvent = api.buildSseEvent('track_update', makeTrack());
    const alertEvt: SseEvent = api.buildSseEvent('alert', makeAlert());
    const statusEvt: SseEvent = api.buildSseEvent('system_status', api.getSystemStatus());

    expect(['track_update', 'alert', 'system_status']).toContain(trackEvt.type);
    expect(['track_update', 'alert', 'system_status']).toContain(alertEvt.type);
    expect(['track_update', 'alert', 'system_status']).toContain(statusEvt.type);

    expect(trackEvt.type).toBe('track_update');
    expect(alertEvt.type).toBe('alert');
    expect(statusEvt.type).toBe('system_status');

    expect(trackEvt).toHaveProperty('data');
    expect(alertEvt).toHaveProperty('data');
    expect(statusEvt).toHaveProperty('data');
  });

  // AC-10: DashboardConfig accepts all fields
  it('AC-10: DashboardConfig accepts {refreshRateMs, maxTracksDisplayed, heatmapResolution}', () => {
    const config: DashboardConfig = {
      refreshRateMs: 500,
      maxTracksDisplayed: 100,
      heatmapResolution: 0.0005,
    };
    const instance = new DemoDashboardApi(config);
    expect(instance.config.refreshRateMs).toBe(500);
    expect(instance.config.maxTracksDisplayed).toBe(100);
    expect(instance.config.heatmapResolution).toBe(0.0005);
  });
});
