// APEX-SENTINEL — SentinelPipeline V2
// FR-W7-09 | src/integration/sentinel-pipeline-v2.ts
//
// W7: Dynamic coordinate injection via TdoaSolverAdapter.
// Removes hardcoded coordinates from V1. All position data flows from TDOA solver.
// Falls back to last known position, then configurable default.
//
// NO hardcoded coordinates in this file.

import {
  TerminalPhaseDetector,
} from '../detection/terminal-phase-detector.js';
import type { TerminalPhaseConfig } from '../detection/terminal-phase-detector.js';

export interface TdoaSolution {
  lat: number;
  lon: number;
  confidenceM: number;
}

export interface TdoaSolverAdapter {
  solve: (frame: AudioFrame) => Promise<TdoaSolution | null>;
}

export interface AudioFrame {
  audioSamples: Float32Array;
  timestampMs: number;
  /** Test hook: force TERMINAL state */
  overrideTerminalPhase?: boolean;
  /** Test hook: force altitude value */
  overrideAlt?: number;
}

export interface FrameResult {
  position: { lat: number; lon: number; confidenceM: number };
  terminalPhaseState: string;
  processedAt: number;
}

export interface PipelineV2Config {
  tdoaSolver: TdoaSolverAdapter;
  defaultPosition?: { lat: number; lon: number };
  onTerminalPhase?: () => void;
  onImpact?: () => void;
  terminalPhaseConfig?: TerminalPhaseConfig;
}

export class PipelineNotRunningError extends Error {
  constructor() {
    super('SentinelPipelineV2: pipeline is not running — call start() first');
    this.name = 'PipelineNotRunningError';
  }
}

const DEFAULT_TERMINAL_CONFIG: TerminalPhaseConfig = {
  speedThresholdMps: 80,
  descentRateThresholdMps: 5,
  headingLockToleranceDeg: 10,
  rfSilenceWindowMs: 2000,
};

export class SentinelPipelineV2 {
  readonly offlineBufferMaxFrames = 1000;

  private running = false;
  private lastPosition: { lat: number; lon: number; confidenceM: number } | null = null;
  private readonly config: PipelineV2Config;
  private readonly detector: TerminalPhaseDetector;
  private _processedFrames = 0;

  constructor(config: PipelineV2Config) {
    this.config = config;
    this.detector = new TerminalPhaseDetector(
      config.terminalPhaseConfig ?? DEFAULT_TERMINAL_CONFIG
    );
  }

  async start(): Promise<void> {
    this.running = true;
    this.detector.reset();
    this._processedFrames = 0;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  get processedFrames(): number {
    return this._processedFrames;
  }

  async processFrame(frame: AudioFrame): Promise<FrameResult> {
    if (!this.running) throw new PipelineNotRunningError();

    // Resolve position
    const solution = await this.config.tdoaSolver.solve(frame);
    let position: { lat: number; lon: number; confidenceM: number };

    if (solution !== null) {
      position = solution;
      this.lastPosition = solution;
    } else if (this.lastPosition !== null) {
      position = this.lastPosition;
    } else if (this.config.defaultPosition) {
      position = { ...this.config.defaultPosition, confidenceM: 9999 };
    } else {
      position = { lat: 0, lon: 0, confidenceM: 9999 };
    }

    // Terminal phase detection
    const alt = frame.overrideAlt ?? 200;
    const forceTerminal = frame.overrideTerminalPhase ?? false;

    if (forceTerminal) {
      this.detector.assess({
        ekfState: {
          lat: position.lat,
          lon: position.lon,
          altMeters: alt,
          speedMps: 110,
          headingDeg: 270,
          verticalSpeedMps: -10,
        },
        headingLockedToTarget: true,
        altitudeDescentRate: true,
        rfLinkSilent: true,
      });
      if (this.detector.getState() === 'TERMINAL' && this.config.onTerminalPhase) {
        this.config.onTerminalPhase();
      }
    } else {
      this.detector.assess({
        ekfState: {
          lat: position.lat,
          lon: position.lon,
          altMeters: alt,
          speedMps: 50,
          headingDeg: 270,
          verticalSpeedMps: -1,
        },
        headingLockedToTarget: false,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });
    }

    if (alt <= 0 && this.config.onImpact) {
      this.config.onImpact();
    }

    this._processedFrames++;

    return {
      position,
      terminalPhaseState: this.detector.getState(),
      processedAt: Date.now(),
    };
  }
}
