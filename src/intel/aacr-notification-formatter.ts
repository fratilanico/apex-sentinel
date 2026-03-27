// APEX-SENTINEL — W19 AacrNotificationFormatter
// FR-W19-06 | src/intel/aacr-notification-formatter.ts

import { randomUUID } from 'crypto';
import type { AwningLevel, AacrNotification, ZoneBreach } from './types.js';

interface ZoneLike {
  id: string;
  name?: string;
  type?: string;
  icaoCode?: string | undefined;
  lat?: number;
  lon?: number;
  radiusKm?: number;
}

const ACTIONABLE_LEVELS: Set<string> = new Set(['ORANGE', 'RED']);

function recommendedAction(zoneType: string | undefined, awningLevel: AwningLevel): string {
  const type = zoneType ?? 'unknown';
  if (awningLevel === 'RED') {
    switch (type) {
      case 'nuclear': return 'Initiate CNCAN emergency protocol — evacuate exclusion radius immediately';
      case 'military': return 'Alert military command — activate air defence intercept readiness';
      case 'airport': return 'Suspend runway operations — issue NOTAM and alert ATC';
      default: return 'Immediate operator response required — escalate to national security authority';
    }
  }
  // ORANGE
  switch (type) {
    case 'nuclear': return 'Notify CNCAN duty officer — raise readiness level to ORANGE';
    case 'military': return 'Alert military command — monitor and prepare intercept';
    case 'airport': return 'Alert ATC — increase surveillance and prepare runway hold';
    default: return 'Operator assessment required — increase monitoring frequency';
  }
}

export class AacrNotificationFormatter {
  format(
    zoneBreach: ZoneBreach | null | undefined,
    awningLevel: AwningLevel | null | undefined,
    zone: ZoneLike | null | undefined,
  ): AacrNotification[] {
    try {
      if (!awningLevel || !ACTIONABLE_LEVELS.has(awningLevel)) {
        return [];
      }

      const safeZone = zone ?? { id: 'UNKNOWN' };
      const safeBreach = zoneBreach ?? {} as Partial<ZoneBreach>;

      const locationIcao = safeZone.icaoCode ?? safeZone.id ?? 'UNKNOWN';
      const aircraftCategory = (safeBreach as { aircraftCategory?: string }).aircraftCategory ?? 'UNKNOWN';
      const firstDetectedAt = (safeBreach as Partial<ZoneBreach>).firstDetectedAt ?? new Date().toISOString();
      const zoneType = safeZone.type;

      const cncanEscalationRequired =
        zoneType === 'nuclear' && awningLevel === 'RED';

      const notification: AacrNotification = {
        incidentId: randomUUID(),
        timestampUtc: firstDetectedAt,
        locationIcao,
        aircraftCategory,
        awningLevel,
        recommendedAction: recommendedAction(zoneType, awningLevel),
        operatorConfirmationRequired: true,
        ...(cncanEscalationRequired ? { cncanEscalationRequired: true } : {}),
      };

      return [notification];
    } catch {
      return [];
    }
  }
}
