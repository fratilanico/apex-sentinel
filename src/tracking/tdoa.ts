// APEX-SENTINEL — TDOA Triangulation
// W1 | src/tracking/tdoa.ts
// STUB — implementation pending (TDD RED)

import { TdoaInput, TdoaResult } from './types.js';

const SPEED_OF_SOUND_MS = 343; // m/s at 20°C

export class TdoaSolver {
  /**
   * Solve TDOA using hyperbolic equations (Newton-Raphson).
   * Requires ≥3 nodes for 3D solution, 2 for bearing-only.
   */
  solve(inputs: TdoaInput[]): TdoaResult {
    throw new Error('NOT_IMPLEMENTED');
  }

  /**
   * Centroid fallback when only 2 nodes available.
   */
  centroidFallback(inputs: TdoaInput[]): TdoaResult {
    throw new Error('NOT_IMPLEMENTED');
  }

  /**
   * Calculate position error ellipse from timing uncertainties.
   */
  estimateError(inputs: TdoaInput[]): number {
    throw new Error('NOT_IMPLEMENTED');
  }
}
