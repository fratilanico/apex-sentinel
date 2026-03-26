// FR-W14-06: DemoScenarioEngine — scripted hackathon demo scenarios

import { EventEmitter } from 'node:events';

export type ScenarioName = 'SCENARIO_OSINT_SURGE' | 'SCENARIO_SHAHED_APPROACH' | 'SCENARIO_TRAJECTORY_PREDICTION';

export interface ScenarioDescriptor {
  name: ScenarioName;
  description: string;
  durationMs: number;
}

// Romania theater center
const RO_LAT = 44.4;
const RO_LON = 26.1;

const SCENARIOS: ScenarioDescriptor[] = [
  {
    name: 'SCENARIO_OSINT_SURGE',
    description: 'OSINT events near grid cell → AWNING YELLOW escalation',
    durationMs: 8000,
  },
  {
    name: 'SCENARIO_SHAHED_APPROACH',
    description: 'Shahed-136 acoustic detection → Stage 2 → Stage 3 → AWNING RED',
    durationMs: 15000,
  },
  {
    name: 'SCENARIO_TRAJECTORY_PREDICTION',
    description: 'Stage 3.5 trajectory prediction with 30/60/120s ETA countdown',
    durationMs: 12000,
  },
];

export class DemoScenarioEngine {
  private activeTimers: ReturnType<typeof setTimeout>[] = [];
  private activeScenario: ScenarioName | null = null;
  private _isCancelled = false;

  getScenarioList(): ScenarioDescriptor[] {
    return [...SCENARIOS];
  }

  getActiveScenario(): ScenarioName | null {
    return this.activeScenario;
  }

  runScenario(name: ScenarioName, emitter: EventEmitter, speedMultiplier = 1): void {
    this.cancelScenario();
    this.activeScenario = name;
    this._isCancelled = false;

    if (name === 'SCENARIO_OSINT_SURGE') {
      this.runOsintSurge(emitter, speedMultiplier);
    } else if (name === 'SCENARIO_SHAHED_APPROACH') {
      this.runShahedApproach(emitter, speedMultiplier);
    } else if (name === 'SCENARIO_TRAJECTORY_PREDICTION') {
      this.runTrajectoryPrediction(emitter, speedMultiplier);
    }
  }

  cancelScenario(): void {
    this._isCancelled = true;
    for (const t of this.activeTimers) {
      clearTimeout(t);
    }
    this.activeTimers = [];
    this.activeScenario = null;
  }

  private schedule(fn: () => void, delayMs: number): void {
    const t = setTimeout(() => {
      if (!this._isCancelled) fn();
    }, delayMs);
    this.activeTimers.push(t);
  }

  private runOsintSurge(emitter: EventEmitter, mult: number): void {
    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'osint',
        source: 'telegram_channel',
        gridCell: `${RO_LAT.toFixed(2)},${RO_LON.toFixed(2)}`,
        ts: Date.now(),
      });
    }, 500 / mult);

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'osint',
        source: 'twitter_monitor',
        gridCell: `${RO_LAT.toFixed(2)},${RO_LON.toFixed(2)}`,
        ts: Date.now(),
      });
    }, 2000 / mult);

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'awning_update',
        level: 'YELLOW',
        reason: 'OSINT surge threshold exceeded',
        ts: Date.now(),
      });
    }, 4000 / mult);

    this.schedule(() => {
      emitter.emit('scenario_complete', { name: 'SCENARIO_OSINT_SURGE' });
      this.activeScenario = null;
    }, 6000 / mult);
  }

  private runShahedApproach(emitter: EventEmitter, mult: number): void {
    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'detection',
        stage: 1,
        droneType: 'Shahed-136',
        nodeId: 'Node-RO-01',
        ts: Date.now(),
      });
    }, 500 / mult);

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'detection',
        stage: 2,
        droneType: 'Shahed-136',
        lat: RO_LAT + 0.3,
        lon: RO_LON - 0.2,
        ts: Date.now(),
      });
    }, 3000 / mult);

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'detection',
        stage: 3,
        droneType: 'Shahed-136',
        lat: RO_LAT + 0.1,
        lon: RO_LON - 0.05,
        trajectory: [
          { lat: RO_LAT + 0.3, lon: RO_LON - 0.2, altM: 150, ts: Date.now() - 3000 },
          { lat: RO_LAT + 0.1, lon: RO_LON - 0.05, altM: 120, ts: Date.now() },
        ],
        ts: Date.now(),
      });
    }, 7000 / mult);

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'awning_update',
        level: 'RED',
        reason: 'Stage 3 Shahed-136 confirmed — trajectory computed',
        ts: Date.now(),
      });
    }, 10000 / mult);

    this.schedule(() => {
      emitter.emit('scenario_complete', { name: 'SCENARIO_SHAHED_APPROACH' });
      this.activeScenario = null;
    }, 13000 / mult);
  }

  private runTrajectoryPrediction(emitter: EventEmitter, mult: number): void {
    const baseLat = RO_LAT + 0.4;
    const baseLon = RO_LON - 0.3;

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'trajectory_prediction',
        droneType: 'Unknown-UAS',
        stage: 3.5,
        currentLat: baseLat,
        currentLon: baseLon,
        speedMs: 55,
        headingDeg: 135,
        eta: [
          { seconds: 30, lat: baseLat - 0.04, lon: baseLon + 0.05 },
          { seconds: 60, lat: baseLat - 0.08, lon: baseLon + 0.10 },
          { seconds: 120, lat: baseLat - 0.16, lon: baseLon + 0.20 },
        ],
        ts: Date.now(),
      });
    }, 500 / mult);

    this.schedule(() => {
      emitter.emit('scenario_event', {
        type: 'trajectory_prediction',
        droneType: 'Unknown-UAS',
        stage: 3.5,
        currentLat: baseLat - 0.04,
        currentLon: baseLon + 0.05,
        speedMs: 55,
        headingDeg: 135,
        eta: [
          { seconds: 30, lat: baseLat - 0.08, lon: baseLon + 0.10 },
          { seconds: 60, lat: baseLat - 0.12, lon: baseLon + 0.15 },
          { seconds: 120, lat: baseLat - 0.20, lon: baseLon + 0.25 },
        ],
        ts: Date.now(),
      });
    }, 5000 / mult);

    this.schedule(() => {
      emitter.emit('scenario_complete', { name: 'SCENARIO_TRAJECTORY_PREDICTION' });
      this.activeScenario = null;
    }, 10000 / mult);
  }
}
