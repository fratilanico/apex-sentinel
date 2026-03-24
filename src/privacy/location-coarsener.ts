// APEX-SENTINEL — Location Coarsener
// W1 | src/privacy/location-coarsener.ts
// STUB — implementation pending (TDD RED)

import { RawLocation, CoarsenedLocation } from './types.js';

export class LocationCoarsener {
  constructor(private readonly precisionM: number = 50) {}

  coarsen(_location: RawLocation): CoarsenedLocation {
    throw new Error('NOT_IMPLEMENTED');
  }

  /**
   * Verify coarsened output doesn't reveal exact position.
   * Returns true if coarsening introduces ≥ precisionM/2 grid uncertainty.
   */
  isPrivacyPreserving(_raw: RawLocation, _coarsened: CoarsenedLocation): boolean {
    throw new Error('NOT_IMPLEMENTED');
  }
}
