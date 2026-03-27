// APEX-SENTINEL — W21 Production Operator UI
// src/ui/sse-event-builder.ts
// Server-Sent Events (SSE) formatting and event builders

import type { ApiAlertItem, ApiAircraftItem, ApiDashboardSummary } from './api-transformers.js';

// ---------------------------------------------------------------------------
// Core SSE types and formatter
// ---------------------------------------------------------------------------

export interface SseEvent {
  event: string;
  data: string; // JSON string
  id?: string;
}

/**
 * Serialises an SseEvent into the SSE wire format.
 * Format per spec: lines separated by \n, block terminated by \n\n
 */
export function formatSseEvent(event: SseEvent): string {
  const lines: string[] = [];
  if (event.id !== undefined) {
    lines.push(`id: ${event.id}`);
  }
  lines.push(`event: ${event.event}`);
  lines.push(`data: ${event.data}`);
  return lines.join('\n') + '\n\n';
}

// ---------------------------------------------------------------------------
// Typed event builders
// ---------------------------------------------------------------------------

export function buildAlertNewEvent(alert: ApiAlertItem): SseEvent {
  return {
    event: 'alert_new',
    data: JSON.stringify(alert),
  };
}

export function buildAlertUpdatedEvent(alertId: string, patch: Partial<ApiAlertItem>): SseEvent {
  return {
    event: 'alert_updated',
    data: JSON.stringify({ alertId, ...patch }),
  };
}

export function buildAircraftUpdateEvent(aircraft: ApiAircraftItem): SseEvent {
  return {
    event: 'aircraft_update',
    data: JSON.stringify(aircraft),
  };
}

export function buildAwningChangeEvent(
  zoneId: string,
  level: string,
  previousLevel: string,
): SseEvent {
  return {
    event: 'awning_change',
    data: JSON.stringify({ zoneId, level, previousLevel }),
  };
}

export function buildSnapshotEvent(summary: ApiDashboardSummary): SseEvent {
  return {
    event: 'snapshot',
    data: JSON.stringify(summary),
  };
}
