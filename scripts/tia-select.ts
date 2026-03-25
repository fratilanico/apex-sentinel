#!/usr/bin/env tsx
/**
 * TIA-Select: Test Impact Analysis selector for APEX-SENTINEL CI
 *
 * Implements Change-Driven Testing (Amann & Juergens, Chapter 1 of "The Future of SQA").
 * Empirically validated: 90%+ bug-finding rate on 2% of suite runtime.
 *
 * Usage:
 *   tsx scripts/tia-select.ts [changed-file1] [changed-file2] ...
 *
 * Output:
 *   Prints vitest run arguments selecting only the impacted test files.
 *
 * CI integration (in .github/workflows or CI script):
 *   CHANGED=$(git diff --name-only HEAD~1 HEAD | grep "^src/")
 *   TESTS=$(tsx scripts/tia-select.ts $CHANGED)
 *   npx vitest run $TESTS --coverage
 *
 * If CHANGED is empty (non-src change) or output is "--all", run full suite.
 *
 * Full suite always runs:
 *   - On PR merge to main
 *   - Nightly (cron)
 *   - When wave-formation checkpoint is called
 */

/**
 * Impact Map: src module → test files that MUST run when the module changes.
 *
 * Rules:
 * 1. A test file appears in a module's list if it directly imports or exercises that module.
 * 2. Safety-critical modules (FalsePositiveGuard, TerminalPhaseDetector) pull in integration
 *    tests because a regression in those modules can cascade to pipeline-level failures.
 * 3. New modules must be added here when they are created (W7+ obligation).
 */
const IMPACT_MAP: Record<string, string[]> = {
  // ── Acoustic / ML layer ─────────────────────────────────────────────────
  'src/acoustic/AcousticProfileLibrary.ts': [
    'tests/ml/FR-W6-01-acoustic-profile.test.ts',
    'tests/ml/FR-W7-02-acoustic-profile-expansion.test.ts',
    'tests/integration/FR-W6-journey-acoustic-intel.test.ts',
    'tests/integration/FR-W6-08-sentinel-pipeline.test.ts',
    'tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts',
  ],

  'src/ml/YAMNetFineTuner.ts': [
    'tests/ml/FR-W6-02-yamnnet-finetuner.test.ts',
    'tests/acoustic/FR-04-yamnet-inference.test.ts',
    'tests/acoustic/FR-08-pipeline-integration.test.ts',
  ],

  'src/detection/FalsePositiveGuard.ts': [
    'tests/ml/FR-W6-03-false-positive-guard.test.ts',
    'tests/integration/FR-W6-journey-acoustic-intel.test.ts',
    'tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts',
    // safety-critical: also run pipeline integration
    'tests/integration/FR-W6-08-sentinel-pipeline.test.ts',
  ],

  'src/ml/DatasetPipeline.ts': [
    'tests/ml/FR-W6-04-dataset-pipeline.test.ts',
    'tests/ml/FR-W7-01-dataset-pipeline-16khz.test.ts',
    'tests/ml/FR-W7-15-label-audit.test.ts',
  ],

  // ── Detection / Terminal Phase ──────────────────────────────────────────
  'src/detection/TerminalPhaseDetector.ts': [
    'tests/detection/FR-W7-03-terminal-phase-detector.test.ts',
    'tests/integration/FR-W7-journey-hardware-integration.test.ts',
    // safety-critical: pull in full journey test
    'tests/integration/FR-W6-journey-acoustic-intel.test.ts',
  ],

  // ── Acoustic signal processing ──────────────────────────────────────────
  'src/acoustic/VadFilter.ts': [
    'tests/acoustic/FR-02-vad-filter.test.ts',
    'tests/acoustic/FR-08-pipeline-integration.test.ts',
  ],

  'src/acoustic/FftAnalyzer.ts': [
    'tests/acoustic/FR-03-fft-analysis.test.ts',
    'tests/acoustic/FR-08-pipeline-integration.test.ts',
  ],

  // ── Fusion / Prediction ─────────────────────────────────────────────────
  'src/fusion/MultiNodeFusion.ts': [
    'tests/fusion/FR-W6-05-multi-node-fusion.test.ts',
    'tests/integration/FR-W6-08-sentinel-pipeline.test.ts',
    'tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts',
  ],

  'src/fusion/BearingTriangulator.ts': [
    'tests/fusion/FR-W7-05-bearing-triangulator.test.ts',
    'tests/fusion/FR-W6-05-multi-node-fusion.test.ts',
  ],

  'src/prediction/MonteCarloPropagator.ts': [
    'tests/prediction/FR-W6-06-monte-carlo.test.ts',
    'tests/prediction/FR-W5-04-05-09-predictor.test.ts',
    'tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts',
  ],

  'src/prediction/EKFTracker.ts': [
    'tests/prediction/FR-W5-01-02-03-ekf.test.ts',
    'tests/prediction/FR-W5-04-05-09-predictor.test.ts',
    'tests/prediction/FR-W5-06-impact.test.ts',
    'tests/prediction/FR-W5-07-08-publisher.test.ts',
    'tests/prediction/FR-W5-10-11-manager.test.ts',
  ],

  // ── Pipeline / Output ───────────────────────────────────────────────────
  'src/pipeline/SentinelPipeline.ts': [
    'tests/integration/FR-W6-08-sentinel-pipeline.test.ts',
    'tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts',
    'tests/integration/FR-W6-journey-acoustic-intel.test.ts',
    'tests/integration/FR-W7-journey-hardware-integration.test.ts',
  ],

  'src/output/CursorOfTruth.ts': [
    'tests/output/FR-W6-09-cursor-of-truth.test.ts',
    'tests/integration/FR-W6-08-sentinel-pipeline.test.ts',
  ],

  'src/output/BRAVE1Format.ts': [
    'tests/output/FR-W6-10-brave1-format.test.ts',
  ],

  'src/output/PtzSlaveOutput.ts': [
    'tests/output/FR-W7-06-ptz-slave-output.test.ts',
    'tests/integration/FR-W7-journey-hardware-integration.test.ts',
  ],

  'src/output/JammerActivation.ts': [
    'tests/output/FR-W7-07-jammer-activation.test.ts',
    'tests/integration/FR-W7-journey-hardware-integration.test.ts',
  ],

  'src/output/PhysicalInterceptCoordinator.ts': [
    'tests/output/FR-W7-08-physical-intercept-coordinator.test.ts',
    'tests/integration/FR-W7-journey-hardware-integration.test.ts',
  ],

  // ── RF layer ────────────────────────────────────────────────────────────
  'src/rf/ElrsRfFingerprint.ts': [
    'tests/rf/FR-W7-04-elrs-rf-fingerprint.test.ts',
    'tests/rf/FR-rf-rssi-baseline.test.ts',
  ],

  // ── Correlation / Tracking ───────────────────────────────────────────────
  'src/correlation/TdoaCorrelator.ts': [
    'tests/correlation/FR-W2-08-tdoa-correlator.test.ts',
    'tests/tracking/FR-14-tdoa-triangulation.test.ts',
  ],

  'src/tracking/TrackManager.ts': [
    'tests/tracking/FR-track-manager.test.ts',
    'tests/dashboard/FR-W4-02-track-store.test.ts',
  ],

  // ── Edge / Node ──────────────────────────────────────────────────────────
  'src/edge/EdgeDeployer.ts': [
    'tests/deploy/FR-W6-07-edge-deployer.test.ts',
    'tests/edge/FR-W2-04-register-node.test.ts',
    'tests/edge/FR-W2-05-ingest-event.test.ts',
  ],

  'src/node/NodeRegistry.ts': [
    'tests/node/FR-11-node-registry.test.ts',
    'tests/edge/FR-W2-04-register-node.test.ts',
  ],

  // ── Alerts / CoT ─────────────────────────────────────────────────────────
  'src/alerts/CotGenerator.ts': [
    'tests/alerts/FR-18-cot-generator.test.ts',
    'tests/relay/FR-W2-11-cot-relay.test.ts',
    'tests/dashboard/FR-W4-08-cot-export.test.ts',
  ],

  'src/alerts/TelegramBot.ts': [
    'tests/alerts/FR-W2-09-telegram-bot.test.ts',
  ],

  // ── Privacy ──────────────────────────────────────────────────────────────
  'src/privacy/LocationCoarsener.ts': [
    'tests/privacy/FR-24-privacy.test.ts',
  ],

  // ── NATS / Infra ─────────────────────────────────────────────────────────
  'src/nats/StreamConfig.ts': [
    'tests/nats/FR-W2-02-stream-config.test.ts',
  ],

  'src/infra/CircuitBreaker.ts': [
    'tests/infra/FR-W2-14-circuit-breaker.test.ts',
  ],
};

/**
 * Modules where a change always triggers full suite (too many downstream consumers).
 * These are the "hub" modules in the dependency graph.
 */
const FULL_SUITE_TRIGGERS = new Set([
  'src/pipeline/SentinelPipeline.ts',
  'src/infra/AuthConfig.ts',
  'src/nats/NatsClient.ts',
]);

function selectTests(changedFiles: string[]): string[] {
  if (changedFiles.length === 0) return [];

  const selectedTests = new Set<string>();

  for (const file of changedFiles) {
    // Normalize to relative path from repo root
    const normalized = file.replace(/^.*apex-sentinel\//, '').replace(/^\.\//, '');

    // Full suite triggers
    if (FULL_SUITE_TRIGGERS.has(normalized)) {
      return ['--all'];
    }

    // Direct impact lookup
    const impacted = IMPACT_MAP[normalized];
    if (impacted) {
      impacted.forEach(t => selectedTests.add(t));
    } else {
      // Unknown src file — conservative: run full suite
      console.error(`[tia-select] WARNING: No impact mapping for ${normalized} — triggering full suite`);
      return ['--all'];
    }
  }

  return Array.from(selectedTests);
}

// CLI entry point
const changedFiles = process.argv.slice(2);

if (changedFiles.length === 0) {
  console.error('[tia-select] No changed files provided. Usage: tsx scripts/tia-select.ts src/foo.ts src/bar.ts');
  process.exit(1);
}

const selected = selectTests(changedFiles);

if (selected[0] === '--all') {
  console.log('');  // empty = caller should run full suite
  process.exit(0);
}

if (selected.length === 0) {
  console.log('');  // no tests needed (non-src change)
  process.exit(0);
}

// Output: space-separated list of test file paths — pipe directly into vitest
console.log(selected.join(' '));
