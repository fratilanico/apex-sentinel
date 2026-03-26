// APEX-SENTINEL — W8 Simpson's Paradox Consistency Oracle Tests
// FR-W8-02 | tests/ml/FR-W8-02-simpsons-oracle.test.ts
// TDD RED phase — prevent aggregate recall masking per-class failure

import { describe, it, expect } from 'vitest';

// ConsistencyOracle does not exist yet — RED
// import { ConsistencyOracle } from '../../src/ml/consistency-oracle-w8.js';

describe('FR-W8-02: Simpson\'s Paradox Consistency Oracle', () => {

  // ── Unit tests ──────────────────────────────────────────────────────────────

  it.todo('FR-W8-02-U01: GIVEN balanced dataset, THEN weighted and unweighted macro recall agree within 5%');

  it.todo('FR-W8-02-U02: GIVEN imbalanced dataset where quad_rotor is 80% of samples, THEN paradox detected when shahed_238 recall is 0.72');

  it.todo('FR-W8-02-U03: GIVEN per-class metrics, THEN each class reported independently (not averaged before gating)');

  it.todo('FR-W8-02-U04: GIVEN rare class shahed_238 with low recall, THEN oracle reports it not diluted by high-volume classes');

  it.todo('FR-W8-02-U05: GIVEN stratified sampling, THEN class distribution matches expected proportions within 5%');

  it.todo('FR-W8-02-U06: GIVEN paradox detected, THEN failure message includes failing class name');

  // ── Integration tests ────────────────────────────────────────────────────────

  it.todo('FR-W8-02-I01: GIVEN imbalanced dataset, WHEN full pipeline runs, THEN PARADOX_DETECTED thrown even when aggregate recall >90%');

  it.todo('FR-W8-02-I02: GIVEN balanced dataset, WHEN full pipeline runs, THEN oracle passes with no paradox warning');

  it.todo('FR-W8-02-I03: GIVEN oracle integration in FR-W8-01 gate, THEN consistency oracle runs as part of oracle gate (not separate)');

  it.todo('FR-W8-02-I04: GIVEN oracle run, THEN per-class count visible in oracle report output');

  it.todo('FR-W8-02-I05: GIVEN CI run, THEN CI output includes per-class breakdown table');

  it.todo('FR-W8-02-I06: GIVEN paradox detected, THEN gate blocked even when aggregate recall exceeds 90%');
});
