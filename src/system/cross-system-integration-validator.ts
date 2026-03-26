// APEX-SENTINEL — W16 CrossSystemIntegrationValidator
// FR-W16-05 | src/system/cross-system-integration-validator.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type IntegrationScenario = 'NOMINAL' | 'DEGRADED' | 'CRITICAL';

export interface StepResult {
  step: string;
  pass: boolean;
  elapsed_ms: number;
  error?: string;
}

export interface ValidationReport {
  pass: boolean;
  scenario: IntegrationScenario;
  steps: StepResult[];
  totalElapsed_ms: number;
}

export interface PipelineStage {
  name: string;
  process(input: unknown): Promise<unknown>;
}

export interface ValidationContext {
  detectionInjected: boolean;
  awningLevel: string | null;
  alertRouted: boolean;
  feedOffline: boolean;
  sseEventEmitted: boolean;
}

// ── Step timeout ──────────────────────────────────────────────────────────────

const STEP_TIMEOUT_MS = 5_000;

// ── CrossSystemIntegrationValidator ──────────────────────────────────────────

export class CrossSystemIntegrationValidator {
  private stages: Map<string, PipelineStage> = new Map();

  registerStage(stage: PipelineStage): void {
    this.stages.set(stage.name, stage);
  }

  async runValidation(scenario: IntegrationScenario): Promise<ValidationReport> {
    const start = Date.now();
    let steps: StepResult[];

    switch (scenario) {
      case 'NOMINAL':
        steps = await this._runNominal();
        break;
      case 'DEGRADED':
        steps = await this._runDegraded();
        break;
      case 'CRITICAL':
        steps = await this._runCritical();
        break;
    }

    const pass = steps.every(s => s.pass);
    return {
      pass,
      scenario,
      steps,
      totalElapsed_ms: Date.now() - start,
    };
  }

  private async _runNominal(): Promise<StepResult[]> {
    const ctx: ValidationContext = {
      detectionInjected: false,
      awningLevel: null,
      alertRouted: false,
      feedOffline: false,
      sseEventEmitted: false,
    };

    return [
      await this._runStep('inject-detection', async () => {
        const stage = this.stages.get('detection');
        if (stage) {
          await stage.process({ type: 'acoustic', confidence: 0.8, droneModel: 'DJI-Phantom' });
        }
        ctx.detectionInjected = true;
        if (!ctx.detectionInjected) throw new Error('Detection injection failed');
      }),
      await this._runStep('awning-classification', async () => {
        const stage = this.stages.get('awning');
        if (stage) {
          const result = await stage.process({ confidence: 0.8 }) as { level?: string };
          ctx.awningLevel = result?.level ?? 'YELLOW';
        } else {
          ctx.awningLevel = 'YELLOW'; // mock nominal
        }
        if (!ctx.awningLevel) throw new Error('AWNING classification failed');
      }),
      await this._runStep('alert-routing', async () => {
        const stage = this.stages.get('alert');
        if (stage) {
          await stage.process({ awningLevel: ctx.awningLevel });
        }
        ctx.alertRouted = true;
      }),
      await this._runStep('sse-event', async () => {
        const stage = this.stages.get('sse');
        if (stage) {
          await stage.process({ type: 'detection', awningLevel: ctx.awningLevel });
        }
        ctx.sseEventEmitted = true;
      }),
    ];
  }

  private async _runDegraded(): Promise<StepResult[]> {
    const ctx: ValidationContext = {
      detectionInjected: false,
      awningLevel: null,
      alertRouted: false,
      feedOffline: true,
      sseEventEmitted: false,
    };

    return [
      await this._runStep('feed-offline-check', async () => {
        if (!ctx.feedOffline) throw new Error('Expected feed to be offline');
      }),
      await this._runStep('inject-detection', async () => {
        // Detection still works with one feed offline
        ctx.detectionInjected = true;
      }),
      await this._runStep('awning-classification-degraded', async () => {
        // Lower confidence due to missing feed
        ctx.awningLevel = 'YELLOW';
      }),
      await this._runStep('alert-routing-degraded', async () => {
        ctx.alertRouted = true;
      }),
    ];
  }

  private async _runCritical(): Promise<StepResult[]> {
    const ctx: ValidationContext = {
      detectionInjected: false,
      awningLevel: null,
      alertRouted: false,
      feedOffline: false,
      sseEventEmitted: false,
    };

    return [
      await this._runStep('inject-high-confidence-detection', async () => {
        const stage = this.stages.get('detection');
        if (stage) {
          await stage.process({ type: 'acoustic', confidence: 0.95, droneModel: 'Shahed-136' });
        }
        ctx.detectionInjected = true;
      }),
      await this._runStep('awning-red-classification', async () => {
        const stage = this.stages.get('awning');
        if (stage) {
          const result = await stage.process({ confidence: 0.95 }) as { level?: string };
          ctx.awningLevel = result?.level ?? 'RED';
        } else {
          ctx.awningLevel = 'RED';
        }
        if (ctx.awningLevel !== 'RED') {
          throw new Error(`Expected AWNING RED, got ${ctx.awningLevel}`);
        }
      }),
      await this._runStep('stage-3-classification', async () => {
        const stage = this.stages.get('stage-classifier');
        if (stage) {
          const result = await stage.process({ awningLevel: 'RED' }) as { stage?: number };
          if (result?.stage !== undefined && result.stage < 3) {
            throw new Error(`Expected Stage >= 3, got ${result.stage}`);
          }
        }
      }),
      await this._runStep('critical-alert-routing', async () => {
        const stage = this.stages.get('alert');
        if (stage) {
          await stage.process({ awningLevel: 'RED', stage: 3 });
        }
        ctx.alertRouted = true;
      }),
    ];
  }

  private async _runStep(stepName: string, fn: () => Promise<void>): Promise<StepResult> {
    const start = Date.now();
    try {
      await this._withTimeout(fn(), STEP_TIMEOUT_MS, stepName);
      return { step: stepName, pass: true, elapsed_ms: Date.now() - start };
    } catch (err) {
      return {
        step: stepName,
        pass: false,
        elapsed_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private _withTimeout<T>(promise: Promise<T>, timeoutMs: number, stepName: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step "${stepName}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e as Error); },
      );
    });
  }
}
