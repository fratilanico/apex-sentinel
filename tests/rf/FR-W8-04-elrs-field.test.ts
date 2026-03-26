// APEX-SENTINEL — W8 ELRS RF Field Validation Tests
// FR-W8-04 | tests/rf/FR-W8-04-elrs-field.test.ts
// TDD RED phase — ELRS 900MHz field validation envelope

import { describe, it, expect } from 'vitest';

// ElrsFieldValidator does not exist yet — RED
// import { ElrsFieldValidator } from '../../src/rf/elrs-field-validator.js';

describe('FR-W8-04: ELRS RF Field Validation', () => {

  // ── Unit tests ──────────────────────────────────────────────────────────────

  it.todo('FR-W8-04-U01: GIVEN synthetic 900MHz FHSS capture, WHEN detectElrs called, THEN ELRS pattern detected (recall ≥0.95)');

  it.todo('FR-W8-04-U02: GIVEN packet rate threshold configurable, WHEN ENV set, THEN custom threshold used (not hardcoded 450pps)');

  it.todo('FR-W8-04-U03: GIVEN synthetic 2.4GHz WiFi capture, WHEN detectElrs called, THEN no ELRS detection (not triggered)');

  it.todo('FR-W8-04-U04: GIVEN synthetic LoRa 868MHz capture, WHEN detectElrs called, THEN no ELRS detection');

  it.todo('FR-W8-04-U05: GIVEN field validation run, THEN returns FPR estimate with sample counts');

  // ── Integration tests ────────────────────────────────────────────────────────

  it.todo('FR-W8-04-I01: GIVEN synthetic RTL-SDR IQ capture, WHEN processed, THEN FHSS burst pattern identified correctly');

  it.todo('FR-W8-04-I02: GIVEN 1000 non-ELRS synthetic samples, WHEN validation runs, THEN FPR <2%');

  it.todo('FR-W8-04-I03: GIVEN 100 synthetic ELRS FHSS samples, WHEN validation runs, THEN recall >95%');

  it.todo('FR-W8-04-I04: GIVEN field tuning complete, WHEN parameters saved, THEN persisted to NATS KV rf:elrs:config');

  it.todo('FR-W8-04-I05: GIVEN field tuning parameters updated, WHEN health check runs, THEN parameters validated successfully');
});
