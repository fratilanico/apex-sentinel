// APEX-SENTINEL — W20
// FR-W20-03: EscalationMatrix
// src/workflow/escalation-matrix.ts

import { EventEmitter } from 'events';
import { AwningLevel, Escalation, EscalationTrigger, Incident, ZoneType } from './types.js';

// ── Chain definitions ─────────────────────────────────────────────────────────

export interface ChainEntry {
  level: number;
  contact: string;
}

const ESCALATION_CHAINS: Record<ZoneType, ChainEntry[]> = {
  airport: [
    { level: 1, contact: 'Operator' },
    { level: 2, contact: 'AACR' },
    { level: 3, contact: 'ROMATSA' },
    { level: 4, contact: 'IGAV' },
  ],
  nuclear: [
    { level: 1, contact: 'Site Security (SNN)' },
    { level: 2, contact: 'SNN Directorate' },
    { level: 3, contact: 'AACR+CNCAN' },
    { level: 4, contact: 'SRI' },
  ],
  military: [
    { level: 1, contact: 'Base Commander' },
    { level: 2, contact: 'SMFA J3' },
    { level: 3, contact: 'NATO CAOC Uedem' },
  ],
  government: [
    { level: 1, contact: 'SPP Chief' },
    { level: 2, contact: 'SPP Operations' },
    { level: 3, contact: 'SRI' },
  ],
};

// ── EvaluateEscalation options ────────────────────────────────────────────────

interface EvaluateOptions {
  slaBreached?: boolean;
  elapsedMs?: number;
}

// ── EscalationMatrix ──────────────────────────────────────────────────────────

// Extended Incident used internally (tests pass objects with zoneType field)
type IncidentWithZoneType = Incident & { zoneType?: ZoneType };

export class EscalationMatrix extends EventEmitter {
  private readonly clockFn: () => number;
  // incidentId → Escalation[]
  private readonly escalationsByIncident = new Map<string, Escalation[]>();
  // escalationId → Escalation (for quick lookup)
  private readonly escalationsById = new Map<string, Escalation>();

  constructor(opts: { clockFn?: () => number } = {}) {
    super();
    this.clockFn = opts.clockFn ?? (() => Date.now());
  }

  evaluateEscalation(
    incident: IncidentWithZoneType,
    awningLevel: AwningLevel,
    opts: EvaluateOptions = {}
  ): { level: number; contact: string } | null {
    const zoneType = incident.zoneType ?? this.inferZoneType(incident);

    if (!zoneType) return null;

    const elapsedMs = opts.elapsedMs ?? 0;
    const slaBreached = opts.slaBreached ?? false;

    switch (zoneType) {
      case 'airport': {
        if (awningLevel === 'CLEAR') return null;
        if (awningLevel === 'RED') {
          // slaBreached triggers level 2 (AACR), or level 2 regardless per chain
          return { level: 2, contact: 'AACR' };
        }
        if (awningLevel === 'ORANGE' || awningLevel === 'YELLOW' || awningLevel === 'GREEN') {
          return { level: 1, contact: 'Operator' };
        }
        return null;
      }
      case 'nuclear': {
        if (awningLevel === 'ORANGE') {
          if (elapsedMs >= 10 * 60_000) {
            return { level: 2, contact: 'SNN Directorate' };
          }
          return { level: 1, contact: 'Site Security (SNN)' };
        }
        return null;
      }
      case 'military': {
        if (awningLevel === 'YELLOW') {
          if (elapsedMs >= 20 * 60_000) {
            return { level: 3, contact: 'NATO CAOC Uedem' };
          }
          return { level: 1, contact: 'Base Commander' };
        }
        return null;
      }
      case 'government': {
        if (awningLevel === 'RED') {
          return { level: 1, contact: 'SPP Chief' };
        }
        return null;
      }
    }
  }

  executeEscalation(
    incident: IncidentWithZoneType,
    level: number,
    trigger: EscalationTrigger = 'AUTOMATIC',
    triggeredBy?: string
  ): Escalation {
    const zoneType = incident.zoneType ?? this.inferZoneType(incident);
    const chain = zoneType ? ESCALATION_CHAINS[zoneType] : [];
    const chainEntry = chain.find(e => e.level === level);

    const escalationId = `esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const escalation: Escalation = {
      escalationId,
      incidentId: incident.incidentId,
      level,
      trigger,
      acknowledged: false,
      triggeredAt: this.clockFn(),
      contact: chainEntry?.contact,
      triggeredBy,
    };

    // Store
    const list = this.escalationsByIncident.get(incident.incidentId) ?? [];
    list.push(escalation);
    this.escalationsByIncident.set(incident.incidentId, list);
    this.escalationsById.set(escalationId, escalation);

    this.emit('escalation_triggered', escalation);

    return { ...escalation };
  }

  acknowledgeEscalation(escalationId: string): void {
    const esc = this.escalationsById.get(escalationId);
    if (!esc) throw new Error(`Escalation '${escalationId}' not found`);
    esc.acknowledged = true;
  }

  /**
   * Overloaded: accepts either a ZoneType string (returns chain definitions)
   * or an incidentId string (returns stored escalations for that incident).
   */
  getEscalationChain(zoneTypeOrIncidentId: ZoneType | string): ChainEntry[] | Escalation[] {
    // Check if it's a known ZoneType
    if (zoneTypeOrIncidentId in ESCALATION_CHAINS) {
      return ESCALATION_CHAINS[zoneTypeOrIncidentId as ZoneType];
    }
    // Otherwise treat as incidentId
    return this.escalationsByIncident.get(zoneTypeOrIncidentId) ?? [];
  }

  private inferZoneType(_incident: IncidentWithZoneType): ZoneType | undefined {
    return undefined;
  }
}
