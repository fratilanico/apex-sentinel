// APEX-SENTINEL — W21 Production Operator UI
// src/ui/api-transformers.ts
// Pure data transformation functions: backend types → API response shapes

import type { AircraftState } from '../feeds/types.js';
import type { Alert, Incident } from '../workflow/types.js';

// ---------------------------------------------------------------------------
// Aircraft transformer
// ---------------------------------------------------------------------------

export interface ApiAircraftItem {
  icao24: string;
  callsign: string | null;
  lat: number;
  lng: number;
  altitudeM: number;
  groundSpeedKt: number;
  trackDeg: number;
  verticalRateMs: number;
  squawk: string | null;
  onGround: boolean;
  lastSeenAt: string;
  threatScore: number | null;
  droneCategory: string | null;
  isConventionalAircraft: boolean;
}

// Drone category keywords — if transponderMode contains one of these prefixes it's a drone category
const DRONE_CATEGORY_PREFIXES = ['cat-a', 'cat-b', 'cat-c', 'cat-d'];

function isDroneCategoryString(value: string): boolean {
  return DRONE_CATEGORY_PREFIXES.some(p => value.toLowerCase().startsWith(p));
}

export function transformAircraftState(
  aircraft: AircraftState,
  threatScore?: number | null,
): ApiAircraftItem {
  const transponder = aircraft.transponderMode ?? null;
  const droneCategory =
    transponder && isDroneCategoryString(transponder) ? transponder : null;

  // isConventionalAircraft = true when transponderMode is present AND not a drone category
  const isConventionalAircraft = transponder !== null && !isDroneCategoryString(transponder ?? '');

  return {
    icao24: aircraft.icao24,
    callsign: aircraft.callsign ?? null,
    lat: aircraft.lat,
    lng: aircraft.lon,
    altitudeM: aircraft.altitudeM,
    groundSpeedKt: aircraft.velocityMs * 1.944,
    trackDeg: aircraft.headingDeg,
    verticalRateMs: 0, // AircraftState does not carry vertical rate; default 0
    squawk: null, // not in AircraftState; kept for API shape completeness
    onGround: aircraft.onGround,
    lastSeenAt: new Date(aircraft.timestampMs).toISOString(),
    threatScore: threatScore ?? null,
    droneCategory,
    isConventionalAircraft,
  };
}

// ---------------------------------------------------------------------------
// Alert transformer
// ---------------------------------------------------------------------------

export interface ApiAlertItem {
  alertId: string;
  zoneId: string;
  zoneType: string;
  awningLevel: string;
  status: string;
  detectedAt: string; // ISO
  slaAckRemainingMs: number;
  slaResolveRemainingMs: number;
  aacrRequired: boolean;
}

export function transformAlert(alert: Alert, nowMs?: number): ApiAlertItem {
  const now = nowMs ?? Date.now();
  return {
    alertId: alert.alertId,
    zoneId: alert.zoneId,
    zoneType: alert.zoneType,
    awningLevel: alert.awningLevel,
    status: alert.status,
    detectedAt: new Date(alert.detectedAt).toISOString(),
    slaAckRemainingMs: alert.slaAckDeadline - now,
    slaResolveRemainingMs: alert.slaResolveDeadline - now,
    aacrRequired: alert.aacrNotificationRequired,
  };
}

// ---------------------------------------------------------------------------
// AWNING colour map
// ---------------------------------------------------------------------------

const AWNING_COLOUR_MAP: Record<string, string> = {
  GREEN: '#22c55e',
  YELLOW: '#eab308',
  ORANGE: '#f97316',
  RED: '#ef4444',
};
const AWNING_COLOUR_DEFAULT = '#6b7280'; // grey for CLEAR / unknown

export function awningToColour(level: string): string {
  return AWNING_COLOUR_MAP[level] ?? AWNING_COLOUR_DEFAULT;
}

// ---------------------------------------------------------------------------
// Zone health transformer
// ---------------------------------------------------------------------------

export interface ApiZoneHealth {
  zoneId: string;
  name: string;
  awningLevel: string;
  awningColour: string;
  activeAlerts: number;
  activeThreatScore: number | null;
  breachCount24h: number;
  lat: number;
  lon: number;
  radiusKm: number;
}

export function transformZoneHealth(
  zone: { id: string; name: string; lat: number; lon: number; radiusKm: number; type: string },
  awningLevel: string,
  activeAlerts: number,
  threatScore?: number | null,
): ApiZoneHealth {
  return {
    zoneId: zone.id,
    name: zone.name,
    awningLevel,
    awningColour: awningToColour(awningLevel),
    activeAlerts,
    activeThreatScore: threatScore ?? null,
    breachCount24h: 0, // not computed here; caller may override
    lat: zone.lat,
    lon: zone.lon,
    radiusKm: zone.radiusKm,
  };
}

// ---------------------------------------------------------------------------
// Feed health transformer
// ---------------------------------------------------------------------------

export interface ApiFeedHealth {
  feedId: string;
  status: string;
  tier: number;
  lastSuccessAt: string | null;
  errorCount: number;
  statusColour: string;
}

function feedStatusToColour(status: string): string {
  if (status === 'healthy') return 'green';
  if (status === 'degraded') return 'yellow';
  return 'red';
}

export function transformFeedHealth(feed: {
  feedId: string;
  status: string;
  tier?: number;
  lastSuccessAt?: number | null;
  errorCount?: number;
}): ApiFeedHealth {
  return {
    feedId: feed.feedId,
    status: feed.status,
    tier: feed.tier ?? 1,
    lastSuccessAt: feed.lastSuccessAt != null ? new Date(feed.lastSuccessAt).toISOString() : null,
    errorCount: feed.errorCount ?? 0,
    statusColour: feedStatusToColour(feed.status),
  };
}

// ---------------------------------------------------------------------------
// Incident transformer
// ---------------------------------------------------------------------------

export interface ApiIncidentItem {
  incidentId: string;
  zoneId: string;
  status: string;
  alertCount: number;
  maxAwningLevel: string;
  openedAt: string;
  durationMs: number | null;
}

export function transformIncident(incident: Incident, nowMs?: number): ApiIncidentItem {
  const now = nowMs ?? Date.now();
  const isClosed = incident.status === 'CLOSED';
  return {
    incidentId: incident.incidentId,
    zoneId: incident.zoneId,
    status: incident.status,
    alertCount: incident.alertIds.length,
    maxAwningLevel: incident.maxAwningLevel,
    openedAt: new Date(incident.openedAt).toISOString(),
    durationMs: isClosed ? null : now - incident.openedAt,
  };
}

// ---------------------------------------------------------------------------
// SLA countdown formatter
// ---------------------------------------------------------------------------

export function formatSlaCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'BREACHED';
  const totalSeconds = Math.floor(remainingMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export interface ApiDashboardSummary {
  activeAlerts: number;
  newAlerts: number;
  activeIncidents: number;
  worstAwningLevel: string;
  feedsHealthy: number;
  feedsTotal: number;
  aircraftTracked: number;
}

const AWNING_ORDER: Record<string, number> = {
  CLEAR: 0,
  GREEN: 1,
  YELLOW: 2,
  ORANGE: 3,
  RED: 4,
};

export function buildDashboardSummary(
  alerts: Alert[],
  incidents: Incident[],
  awningLevels: Record<string, string>,
  feedHealth: { feedId: string; status: string }[],
  aircraftCount: number,
): ApiDashboardSummary {
  const INACTIVE = new Set(['ARCHIVED', 'RESOLVED']);
  const active = alerts.filter(a => !INACTIVE.has(a.status));
  const newAlerts = alerts.filter(a => a.status === 'NEW');
  const activeIncidents = incidents.filter(i => i.status !== 'CLOSED');

  // Compute worst awning level from the awningLevels map
  let worstScore = -1;
  let worstLevel = 'CLEAR';
  for (const level of Object.values(awningLevels)) {
    const score = AWNING_ORDER[level] ?? -1;
    if (score > worstScore) {
      worstScore = score;
      worstLevel = level;
    }
  }

  const feedsHealthy = feedHealth.filter(f => f.status === 'healthy').length;

  return {
    activeAlerts: active.length,
    newAlerts: newAlerts.length,
    activeIncidents: activeIncidents.length,
    worstAwningLevel: worstLevel,
    feedsHealthy,
    feedsTotal: feedHealth.length,
    aircraftTracked: aircraftCount,
  };
}
