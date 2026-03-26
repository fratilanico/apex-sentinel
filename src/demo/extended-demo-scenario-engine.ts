// APEX-SENTINEL — W17 ExtendedDemoScenarioEngine
// FR-W17-01 | src/demo/extended-demo-scenario-engine.ts

import { EventEmitter } from 'node:events';

// ── Types ────────────────────────────────────────────────────────────────────

export type ExtendedScenarioName =
  | 'CHALLENGE_01_PERIMETER'
  | 'CHALLENGE_01_SWARM'
  | 'CHALLENGE_02_URBAN'
  | 'CHALLENGE_02_TRAJECTORY'
  | 'NATO_AWNING_ESCALATION'
  | 'FULL_PIPELINE';

export interface AwningTransition {
  from: string;
  to: string;
  at_s: number;
}

export interface ScenarioManifestEntry {
  name: ExtendedScenarioName;
  description: string;
  challenge: 'C01' | 'C02' | 'NATO' | 'FULL';
  duration_s: number;
  expectedAwningTransitions: AwningTransition[];
  coordinates: { lat: number; lon: number };
}

export interface ScenarioEvent {
  type: string;
  [key: string]: unknown;
}

// ── Romania theater: lat 44.0-44.8, lon 26.0-26.8 ────────────────────────────

const SCENARIOS: ScenarioManifestEntry[] = [
  {
    name: 'CHALLENGE_01_PERIMETER',
    description: 'Challenge 01 perimeter defence: single Shahed-136 approach from border, AWNING escalation to RED',
    challenge: 'C01',
    duration_s: 30,
    expectedAwningTransitions: [
      { from: 'WHITE', to: 'YELLOW', at_s: 5 },
      { from: 'YELLOW', to: 'RED', at_s: 15 },
    ],
    coordinates: { lat: 44.1, lon: 26.1 },
  },
  {
    name: 'CHALLENGE_01_SWARM',
    description: 'Challenge 01: 3-drone swarm detected within 60s, AWNING RED',
    challenge: 'C01',
    duration_s: 60,
    expectedAwningTransitions: [
      { from: 'WHITE', to: 'YELLOW', at_s: 10 },
      { from: 'YELLOW', to: 'RED', at_s: 30 },
    ],
    coordinates: { lat: 44.2, lon: 26.3 },
  },
  {
    name: 'CHALLENGE_02_URBAN',
    description: 'Challenge 02 urban: civilian false positive suppression, Wild Hornets discrimination',
    challenge: 'C02',
    duration_s: 45,
    expectedAwningTransitions: [
      { from: 'WHITE', to: 'YELLOW', at_s: 8 },
      { from: 'YELLOW', to: 'WHITE', at_s: 20 },
    ],
    coordinates: { lat: 44.5, lon: 26.5 },
  },
  {
    name: 'CHALLENGE_02_TRAJECTORY',
    description: 'Challenge 02: Stage 3.5 trajectory prediction, 30s intercept window',
    challenge: 'C02',
    duration_s: 50,
    expectedAwningTransitions: [
      { from: 'WHITE', to: 'YELLOW', at_s: 5 },
      { from: 'YELLOW', to: 'RED', at_s: 20 },
    ],
    coordinates: { lat: 44.4, lon: 26.6 },
  },
  {
    name: 'NATO_AWNING_ESCALATION',
    description: 'Full NATO AWNING WHITE→YELLOW→RED→WHITE cycle with hysteresis',
    challenge: 'NATO',
    duration_s: 60,
    expectedAwningTransitions: [
      { from: 'WHITE', to: 'YELLOW', at_s: 10 },
      { from: 'YELLOW', to: 'RED', at_s: 25 },
      { from: 'RED', to: 'YELLOW', at_s: 45 },
      { from: 'YELLOW', to: 'WHITE', at_s: 55 },
    ],
    coordinates: { lat: 44.3, lon: 26.2 },
  },
  {
    name: 'FULL_PIPELINE',
    description: 'All sensors active, all feeds live, full intelligence brief generated',
    challenge: 'FULL',
    duration_s: 90,
    expectedAwningTransitions: [
      { from: 'WHITE', to: 'YELLOW', at_s: 10 },
      { from: 'YELLOW', to: 'RED', at_s: 30 },
    ],
    coordinates: { lat: 44.4, lon: 26.1 },
  },
];

// ── ExtendedDemoScenarioEngine ────────────────────────────────────────────────

export class ExtendedDemoScenarioEngine {
  private activeTimers: ReturnType<typeof setTimeout>[] = [];
  private activeScenario: ExtendedScenarioName | null = null;
  private _isCancelled = false;

  getScenarioManifest(): ScenarioManifestEntry[] {
    return [...SCENARIOS];
  }

  getActiveScenario(): ExtendedScenarioName | null {
    return this.activeScenario;
  }

  getScenarioByName(name: ExtendedScenarioName): ScenarioManifestEntry | null {
    return SCENARIOS.find(s => s.name === name) ?? null;
  }

  runScenario(name: ExtendedScenarioName, emitter: EventEmitter, speedMultiplier = 1): void {
    this.cancelScenario();
    this.activeScenario = name;
    this._isCancelled = false;

    switch (name) {
      case 'CHALLENGE_01_PERIMETER': this._runPerimeter(emitter, speedMultiplier); break;
      case 'CHALLENGE_01_SWARM': this._runSwarm(emitter, speedMultiplier); break;
      case 'CHALLENGE_02_URBAN': this._runUrban(emitter, speedMultiplier); break;
      case 'CHALLENGE_02_TRAJECTORY': this._runTrajectory(emitter, speedMultiplier); break;
      case 'NATO_AWNING_ESCALATION': this._runNatoEscalation(emitter, speedMultiplier); break;
      case 'FULL_PIPELINE': this._runFullPipeline(emitter, speedMultiplier); break;
    }
  }

  cancelScenario(): void {
    this._isCancelled = true;
    for (const t of this.activeTimers) clearTimeout(t);
    this.activeTimers = [];
    this.activeScenario = null;
  }

  private schedule(fn: () => void, delayMs: number): void {
    const t = setTimeout(() => {
      if (!this._isCancelled) fn();
    }, delayMs);
    this.activeTimers.push(t);
  }

  private emit(emitter: EventEmitter, event: ScenarioEvent): void {
    emitter.emit('scenario_event', event);
  }

  // ── CHALLENGE_01_PERIMETER ────────────────────────────────────────────────

  private _runPerimeter(emitter: EventEmitter, mult: number): void {
    const s = (sec: number) => sec * 1000 / mult;

    this.schedule(() => this.emit(emitter, {
      type: 'detection',
      stage: 1,
      threat: 'Shahed-136',
      lat: 44.1, lon: 26.1,
      confidence: 0.72,
      source: 'acoustic',
    }), s(2));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'acoustic_contact',
    }), s(5));

    this.schedule(() => this.emit(emitter, {
      type: 'detection',
      stage: 2,
      threat: 'Shahed-136',
      lat: 44.12, lon: 26.08,
      confidence: 0.88,
      source: 'rf+acoustic',
    }), s(10));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'RED',
      reason: 'confirmed_hostile',
    }), s(15));

    this.schedule(() => this.emit(emitter, {
      type: 'alert',
      severity: 'CRITICAL',
      message: 'Shahed-136 confirmed — perimeter breach imminent',
    }), s(16));

    this.schedule(() => this.emit(emitter, {
      type: 'scenario_complete',
      scenario: 'CHALLENGE_01_PERIMETER',
    }), s(30));
  }

  // ── CHALLENGE_01_SWARM ────────────────────────────────────────────────────

  private _runSwarm(emitter: EventEmitter, mult: number): void {
    const s = (sec: number) => sec * 1000 / mult;

    for (let i = 0; i < 3; i++) {
      this.schedule(() => this.emit(emitter, {
        type: 'detection',
        stage: 1,
        droneIndex: i,
        threat: 'Shahed-136',
        lat: 44.2 + i * 0.02, lon: 26.3 + i * 0.01,
        confidence: 0.7 + i * 0.05,
        source: 'acoustic',
      }), s(5 + i * 3));
    }

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'multiple_contacts',
    }), s(10));

    this.schedule(() => this.emit(emitter, {
      type: 'swarm_confirmation',
      droneCount: 3,
      formation: 'distributed',
    }), s(20));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'RED',
      reason: 'swarm_confirmed',
    }), s(30));

    this.schedule(() => this.emit(emitter, {
      type: 'scenario_complete',
      scenario: 'CHALLENGE_01_SWARM',
    }), s(60));
  }

  // ── CHALLENGE_02_URBAN ────────────────────────────────────────────────────

  private _runUrban(emitter: EventEmitter, mult: number): void {
    const s = (sec: number) => sec * 1000 / mult;

    this.schedule(() => this.emit(emitter, {
      type: 'detection',
      stage: 1,
      threat: 'UNKNOWN',
      lat: 44.5, lon: 26.5,
      confidence: 0.55,
      source: 'acoustic',
    }), s(3));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'acoustic_contact_unresolved',
    }), s(8));

    this.schedule(() => this.emit(emitter, {
      type: 'false_positive_suppression',
      classifier: 'WildHornets',
      result: 'CIVILIAN',
      confidence: 0.91,
    }), s(15));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'WHITE',
      reason: 'false_positive_cleared',
    }), s(20));

    this.schedule(() => this.emit(emitter, {
      type: 'scenario_complete',
      scenario: 'CHALLENGE_02_URBAN',
    }), s(45));
  }

  // ── CHALLENGE_02_TRAJECTORY ───────────────────────────────────────────────

  private _runTrajectory(emitter: EventEmitter, mult: number): void {
    const s = (sec: number) => sec * 1000 / mult;

    this.schedule(() => this.emit(emitter, {
      type: 'detection',
      stage: 3,
      threat: 'Shahed-136',
      lat: 44.4, lon: 26.6,
      confidence: 0.92,
      source: 'multi-sensor',
    }), s(3));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'stage3_detection',
    }), s(5));

    this.schedule(() => this.emit(emitter, {
      type: 'trajectory_prediction',
      stage: '3.5',
      eta_s: 30,
      intercept_window_s: 30,
      impact_lat: 44.45,
      impact_lon: 26.55,
      confidence: 0.89,
    }), s(10));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'RED',
      reason: 'trajectory_confirmed',
    }), s(20));

    this.schedule(() => this.emit(emitter, {
      type: 'eta_countdown',
      eta_s: 10,
    }), s(40));

    this.schedule(() => this.emit(emitter, {
      type: 'scenario_complete',
      scenario: 'CHALLENGE_02_TRAJECTORY',
    }), s(50));
  }

  // ── NATO_AWNING_ESCALATION ────────────────────────────────────────────────

  private _runNatoEscalation(emitter: EventEmitter, mult: number): void {
    const s = (sec: number) => sec * 1000 / mult;

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'initial_contact',
    }), s(10));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'RED',
      reason: 'threat_confirmed',
    }), s(25));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'threat_receding_hysteresis',
    }), s(45));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'WHITE',
      reason: 'all_clear_hysteresis',
    }), s(55));

    this.schedule(() => this.emit(emitter, {
      type: 'scenario_complete',
      scenario: 'NATO_AWNING_ESCALATION',
    }), s(60));
  }

  // ── FULL_PIPELINE ─────────────────────────────────────────────────────────

  private _runFullPipeline(emitter: EventEmitter, mult: number): void {
    const s = (sec: number) => sec * 1000 / mult;

    this.schedule(() => this.emit(emitter, {
      type: 'feed_status',
      feeds: ['ADS-B', 'OSINT', 'RF-deepening', 'acoustic'],
      status: 'all_active',
    }), s(1));

    this.schedule(() => this.emit(emitter, {
      type: 'detection',
      stage: 1,
      threat: 'Shahed-136',
      lat: 44.4, lon: 26.1,
      confidence: 0.75,
      source: 'acoustic',
    }), s(5));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'YELLOW',
      reason: 'acoustic_contact',
    }), s(10));

    this.schedule(() => this.emit(emitter, {
      type: 'intel_brief',
      classification: 'NATO-RESTRICTED',
      summary: 'Shahed-136 acoustic signature confirmed. RF correlation positive. ELRS 900MHz uplink detected.',
    }), s(20));

    this.schedule(() => this.emit(emitter, {
      type: 'awning_update',
      level: 'RED',
      reason: 'multi_sensor_confirmation',
    }), s(30));

    this.schedule(() => this.emit(emitter, {
      type: 'alert',
      channel: 'telegram+cot+sse',
      severity: 'CRITICAL',
    }), s(31));

    this.schedule(() => this.emit(emitter, {
      type: 'scenario_complete',
      scenario: 'FULL_PIPELINE',
    }), s(90));
  }
}
