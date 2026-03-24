// APEX-SENTINEL — CoT XML Generator (FreeTAKServer compatible)
// W1 | src/alerts/cot-generator.ts
// STUB — implementation pending (TDD RED)

import { Track } from '../tracking/types.js';
import { CotXmlEvent } from './types.js';

export class CotGenerator {
  generateFromTrack(_track: Track): CotXmlEvent {
    throw new Error('NOT_IMPLEMENTED');
  }

  toXmlString(_event: CotXmlEvent): string {
    throw new Error('NOT_IMPLEMENTED');
  }

  isValidCotXml(_xml: string): boolean {
    throw new Error('NOT_IMPLEMENTED');
  }
}
