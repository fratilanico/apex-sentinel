// APEX-SENTINEL — Model Handle Registry
// src/ml/model-handle-registry.ts
//
// IEC 61508 SIL-2: Promotion handles are opaque tokens issued only by promoteModel().
// AcousticProfileLibrary.setActiveModel() MUST verify the handle is registered here.
// Prevents unauthorized weight mutation.

export interface ModelMetrics {
  shahed_136: { recall: number; precision: number; f1: number; sampleCount: number };
  shahed_131: { recall: number; precision: number; f1: number; sampleCount: number };
  shahed_238: { recall: number; precision: number; f1: number; sampleCount: number };
  gerbera:    { recall: number; precision: number; f1: number; sampleCount: number };
  quad_rotor: { recall: number; precision: number; f1: number; sampleCount: number };
}

export interface ModelHandle {
  readonly version: string;
  readonly promotedAt: Date;
  readonly operatorId: string;
  readonly metrics: ModelMetrics;
  // Opaque token — not forgeable from outside this module
  readonly _token: symbol;
}

export interface PromotionResult {
  promoted: boolean;
  modelHandle?: ModelHandle;
  reason?: string;
  metrics: ModelMetrics;
  gate: Record<string, { threshold: number; passed: boolean; actual: number }>;
}

export const GATE_THRESHOLDS: Record<string, number> = {
  shahed_136: 0.87,
  shahed_131: 0.85,
  shahed_238: 0.95,
  gerbera:    0.92,
  quad_rotor: 0.88,
};

// Singleton registry of valid promotion handles
const _validHandles = new WeakSet<object>();

export function registerHandle(handle: ModelHandle): void {
  _validHandles.add(handle);
}

export function isValidHandle(candidate: unknown): candidate is ModelHandle {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return _validHandles.has(candidate);
}

export function evaluateGate(metrics: ModelMetrics): {
  passed: boolean;
  gate: PromotionResult['gate'];
  firstFailure: string | null;
} {
  const gate: PromotionResult['gate'] = {};
  let firstFailure: string | null = null;

  for (const [profile, threshold] of Object.entries(GATE_THRESHOLDS)) {
    const profileMetrics = metrics[profile as keyof ModelMetrics];
    const actual = profileMetrics?.recall ?? 0;
    const passed = actual >= threshold;
    gate[profile] = { threshold, passed, actual };
    if (!passed && firstFailure === null) {
      firstFailure = profile;
    }
  }

  return { passed: firstFailure === null, gate, firstFailure };
}
