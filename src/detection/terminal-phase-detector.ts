// APEX-SENTINEL — Terminal Phase Detector
// FR-W7-03 | src/detection/terminal-phase-detector.ts
//
// 4-indicator FSM for drone terminal-phase (impact run) classification.
// Indicators: speedExceedsThreshold, headingLockedToTarget, altitudeDescentRate, rfLinkSilent
// States: CRUISE → APPROACH → TERMINAL → IMPACT
//
// INDIGO team spec: operators cut RF link 2-10s before impact (ELRS 900MHz / GPS silence).
// Require 3-of-4 for APPROACH, 4-of-4 for TERMINAL. IMPACT forced when altMeters ≤ 0.

export type TerminalPhaseState = 'CRUISE' | 'APPROACH' | 'TERMINAL' | 'IMPACT';

export interface EkfState {
  lat: number;
  lon: number;
  altMeters: number;
  speedMps: number;
  headingDeg: number;
  verticalSpeedMps: number;
}

export interface TerminalPhaseConfig {
  /** Speed above which speedExceedsThreshold is automatically true. Default: 80 m/s */
  speedThresholdMps: number;
  /** Descent rate (negative vertical speed) above which altitudeDescentRate is flagged. Default: 5 m/s */
  descentRateThresholdMps: number;
  /** Heading lock tolerance in degrees. Default: 10° */
  headingLockToleranceDeg: number;
  /** RF silence window in ms. Default: 2000ms */
  rfSilenceWindowMs: number;
}

export interface AssessInput {
  ekfState: EkfState;
  headingLockedToTarget: boolean;
  altitudeDescentRate: boolean;
  rfLinkSilent: boolean;
}

export interface TerminalPhaseEvent {
  state: TerminalPhaseState;
  confidence: number;
  timestampMs: number;
  ekfState: EkfState;
}

type EventName = 'terminal' | 'approach' | 'impact';
type Listener = (event: TerminalPhaseEvent) => void;

export class TerminalPhaseDetector {
  private state: TerminalPhaseState = 'CRUISE';
  private confidence = 0;
  private readonly config: TerminalPhaseConfig;
  private readonly listeners = new Map<EventName, Listener[]>();
  private consecutiveTerminalCount = 0;

  constructor(config: TerminalPhaseConfig) {
    this.config = config;
  }

  getState(): TerminalPhaseState {
    return this.state;
  }

  getConfidence(): number {
    return this.confidence;
  }

  reset(): void {
    this.state = 'CRUISE';
    this.confidence = 0;
    this.consecutiveTerminalCount = 0;
  }

  on(event: EventName, listener: Listener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  assess(input: AssessInput): void {
    const { ekfState, headingLockedToTarget, altitudeDescentRate, rfLinkSilent } = input;

    // IMPACT: altitude at or below ground
    if (ekfState.altMeters <= 0) {
      this.state = 'IMPACT';
      this.confidence = 1.0;
      this.emit('impact', { state: 'IMPACT', confidence: 1.0, timestampMs: Date.now(), ekfState });
      return;
    }

    // Compute speed indicator
    const speedExceedsThreshold = ekfState.speedMps >= this.config.speedThresholdMps;

    // Count active indicators
    const activeIndicators = [
      speedExceedsThreshold,
      headingLockedToTarget,
      altitudeDescentRate,
      rfLinkSilent,
    ].filter(Boolean).length;

    if (activeIndicators === 4) {
      // All 4 — TERMINAL
      this.consecutiveTerminalCount++;
      // Base confidence 0.9, increasing with consecutive assessments (max 1.0)
      this.confidence = Math.min(1.0, 0.9 + (this.consecutiveTerminalCount - 1) * 0.025);

      const prevState = this.state;
      this.state = 'TERMINAL';

      if (prevState !== 'TERMINAL') {
        this.emit('terminal', {
          state: 'TERMINAL',
          confidence: this.confidence,
          timestampMs: Date.now(),
          ekfState,
        });
      }
    } else if (activeIndicators >= 3) {
      // 3 of 4 — APPROACH
      this.consecutiveTerminalCount = 0;
      const prevState = this.state;
      this.state = 'APPROACH';
      this.confidence = 0.6 + activeIndicators * 0.05;

      if (prevState !== 'APPROACH') {
        this.emit('approach', {
          state: 'APPROACH',
          confidence: this.confidence,
          timestampMs: Date.now(),
          ekfState,
        });
      }
    } else {
      // 0–2 indicators — CRUISE
      this.consecutiveTerminalCount = 0;
      this.state = 'CRUISE';
      this.confidence = activeIndicators * 0.15;
    }
  }

  private emit(event: EventName, payload: TerminalPhaseEvent): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const l of listeners) {
      l(payload);
    }
  }
}
