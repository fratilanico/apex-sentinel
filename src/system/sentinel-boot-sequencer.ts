// APEX-SENTINEL — W16 SentinelBootSequencer
// FR-W16-01 | src/system/sentinel-boot-sequencer.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type PhaseHandler = () => Promise<void>;

export interface PhaseDefinition {
  phase: number;
  name: string;
  handler: PhaseHandler;
}

export interface PhaseResult {
  phase: number;
  name: string;
  elapsed_ms: number;
  success: boolean;
  error?: string;
}

export interface BootManifest {
  phases: PhaseResult[];
  totalElapsed_ms: number;
  success: boolean;
}

export interface BootStatus {
  phase: number;
  phaseName: string;
  elapsed_ms: number;
  errors: string[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const PHASE_TIMEOUT_MS = 10_000;

// ── SentinelBootSequencer ─────────────────────────────────────────────────────

export class SentinelBootSequencer {
  private phases: PhaseDefinition[] = [];
  private manifest: BootManifest | null = null;
  private currentPhase = 0;
  private currentPhaseName = 'idle';
  private bootStartMs = 0;
  private errors: string[] = [];
  private _isBooted = false;

  /**
   * Register a phase handler. Phases execute in registration order.
   */
  registerPhase(phase: number, name: string, handler: PhaseHandler): void {
    this.phases.push({ phase, name, handler });
    // Keep sorted by phase number
    this.phases.sort((a, b) => a.phase - b.phase);
  }

  /**
   * Boot all registered phases in order.
   */
  async boot(): Promise<BootManifest> {
    this.bootStartMs = Date.now();
    this.errors = [];
    const results: PhaseResult[] = [];
    let overallSuccess = true;

    for (const phaseDef of this.phases) {
      this.currentPhase = phaseDef.phase;
      this.currentPhaseName = phaseDef.name;

      const phaseStart = Date.now();

      try {
        await this._withTimeout(phaseDef.handler(), PHASE_TIMEOUT_MS, phaseDef.name);
        const elapsed_ms = Date.now() - phaseStart;
        results.push({ phase: phaseDef.phase, name: phaseDef.name, elapsed_ms, success: true });
      } catch (err) {
        const elapsed_ms = Date.now() - phaseStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.errors.push(`Phase ${phaseDef.phase} (${phaseDef.name}): ${errorMsg}`);
        results.push({ phase: phaseDef.phase, name: phaseDef.name, elapsed_ms, success: false, error: errorMsg });
        overallSuccess = false;
        // Abort boot on phase failure
        break;
      }
    }

    this.manifest = {
      phases: results,
      totalElapsed_ms: Date.now() - this.bootStartMs,
      success: overallSuccess,
    };

    if (overallSuccess) {
      this._isBooted = true;
      this.currentPhase = this.phases.length;
      this.currentPhaseName = 'complete';
    }

    return this.manifest;
  }

  /**
   * Shutdown in reverse boot order.
   */
  async shutdown(): Promise<void> {
    const reversedPhases = [...this.phases].reverse();
    for (const phaseDef of reversedPhases) {
      // Each phase can optionally provide a shutdown handler
      // For now, we just mark as shut down
      this.currentPhase = phaseDef.phase;
      this.currentPhaseName = `shutdown:${phaseDef.name}`;
    }
    this._isBooted = false;
    this.currentPhase = 0;
    this.currentPhaseName = 'idle';
  }

  getBootStatus(): BootStatus {
    return {
      phase: this.currentPhase,
      phaseName: this.currentPhaseName,
      elapsed_ms: this.bootStartMs ? Date.now() - this.bootStartMs : 0,
      errors: [...this.errors],
    };
  }

  getBootManifest(): BootManifest | null {
    return this.manifest;
  }

  isBooted(): boolean {
    return this._isBooted;
  }

  private _withTimeout<T>(promise: Promise<T>, timeoutMs: number, phaseName: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Phase "${phaseName}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err as Error); },
      );
    });
  }
}

// ── Factory: Default 8-phase boot with no-op handlers ─────────────────────────

export function createDefaultBootSequencer(
  handlers?: Partial<Record<number, PhaseHandler>>,
): SentinelBootSequencer {
  const seq = new SentinelBootSequencer();

  const defaultPhases: Array<[number, string]> = [
    [1, 'Config validation'],
    [2, 'NATS connect'],
    [3, 'Feed clients'],
    [4, 'Detection pipeline'],
    [5, 'NATO layer'],
    [6, 'Intel layer'],
    [7, 'Operator notifications'],
    [8, 'Dashboard API'],
  ];

  for (const [phase, name] of defaultPhases) {
    const handler = handlers?.[phase] ?? (() => Promise.resolve());
    seq.registerPhase(phase, name, handler);
  }

  return seq;
}
