import { defineConfig } from 'vitest/config';

// ---------------------------------------------------------------------------
// Regression tier tags
//
// P0 (smoke)  — run on every commit: unit + acoustic basics
// P1 (core)   — run on every PR: detection, ML, integration
// P2 (full)   — nightly: adversarial, chaos, full regression
//
// Usage:
//   P0:  vitest run --project p0
//   P1:  vitest run --project p0 --project p1
//   P2:  vitest run   (no --project flag → all projects)
//   CI:  See docs/runbooks/testing-tiers.md
// ---------------------------------------------------------------------------

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    // Default include — used when no --project flag is given (P2 / full regression)
    include: ['tests/**/*.test.ts'],
    reporter: ['verbose'],
    projects: [
      // -----------------------------------------------------------------------
      // P0 — Smoke suite. Run on every commit. Target: < 60 seconds.
      // Covers unit tests and acoustic basics only.
      // -----------------------------------------------------------------------
      {
        name: 'p0',
        test: {
          name: 'P0 Smoke',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/acoustic/**/*.test.ts',
            'tests/bdd/**/*.test.ts',
          ],
          reporters: ['verbose'],
        },
      },
      // -----------------------------------------------------------------------
      // P1 — Core suite. Run on every PR. Target: < 5 minutes.
      // Covers detection, ML pipeline, integration journey tests, and BDD scenarios.
      // -----------------------------------------------------------------------
      {
        name: 'p1',
        test: {
          name: 'P1 Core',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/acoustic/**/*.test.ts',
            'tests/bdd/**/*.test.ts',
            'tests/detection/**/*.test.ts',
            'tests/ml/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/fusion/**/*.test.ts',
            'tests/rf/**/*.test.ts',
            'tests/prediction/**/*.test.ts',
            'tests/output/**/*.test.ts',
          ],
          reporters: ['verbose'],
        },
      },
      // -----------------------------------------------------------------------
      // P2 — Full regression. Run nightly. No time budget — thoroughness first.
      // Covers everything including adversarial, chaos, edge deployment,
      // privacy, and pipeline-level stress tests.
      // -----------------------------------------------------------------------
      {
        name: 'p2',
        test: {
          name: 'P2 Full Regression',
          include: [
            'tests/**/*.test.ts',
          ],
          reporters: ['verbose'],
        },
      },
    ],
  },
});
