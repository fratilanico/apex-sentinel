# W16 ARTIFACT REGISTRY

## Source Artifacts
| File | FR | Description |
|------|----|-------------|
| src/system/sentinel-boot-sequencer.ts | FR-W16-01 | Ordered system startup with phase timeouts |
| src/system/edge-performance-profiler.ts | FR-W16-02 | Rolling latency window + p50/p95/p99 + SLA gates |
| src/system/system-health-dashboard.ts | FR-W16-03 | Unified health score + NATS publish |
| src/system/configuration-manager.ts | FR-W16-04 | ENV > file > defaults config loading |
| src/system/cross-system-integration-validator.ts | FR-W16-05 | 3 built-in validation scenarios |
| src/system/memory-budget-enforcer.ts | FR-W16-06 | Per-component byte budget enforcement |
| src/system/deployment-packager.ts | FR-W16-07 | SHA-256 manifest generation + verification |
| src/system/w16-end-to-end-integration.ts | FR-W16-08 | E2E test harness |

## Test Artifacts
| File | FR | Tests |
|------|----|-------|
| tests/system/FR-W16-01-boot-sequencer.test.ts | FR-W16-01 | 12 |
| tests/system/FR-W16-02-performance-profiler.test.ts | FR-W16-02 | 12 |
| tests/system/FR-W16-03-system-health.test.ts | FR-W16-03 | 12 |
| tests/system/FR-W16-04-configuration-manager.test.ts | FR-W16-04 | 12 |
| tests/system/FR-W16-05-cross-system-validator.test.ts | FR-W16-05 | 12 |
| tests/system/FR-W16-06-memory-budget.test.ts | FR-W16-06 | 12 |
| tests/system/FR-W16-07-deployment-packager.test.ts | FR-W16-07 | 12 |
| tests/system/FR-W16-08-e2e-integration.test.ts | FR-W16-08 | 15 |

## Documentation Artifacts
| File | Type |
|------|------|
| docs/waves/W16/DESIGN.md | Design |
| docs/waves/W16/PRD.md | Product Requirements |
| docs/waves/W16/ARCHITECTURE.md | Architecture |
| docs/waves/W16/DATABASE_SCHEMA.md | DB Schema |
| docs/waves/W16/API_SPECIFICATION.md | API Spec |
| docs/waves/W16/AI_PIPELINE.md | AI Pipeline |
| docs/waves/W16/PRIVACY_ARCHITECTURE.md | Privacy |
| docs/waves/W16/ROADMAP.md | Roadmap |
| docs/waves/W16/TEST_STRATEGY.md | Test Strategy |
| docs/waves/W16/ACCEPTANCE_CRITERIA.md | Acceptance Criteria |
| docs/waves/W16/DECISION_LOG.md | Decision Log |
| docs/waves/W16/SESSION_STATE.md | Session State |
| docs/waves/W16/ARTIFACT_REGISTRY.md | Artifact Registry |
| docs/waves/W16/DEPLOY_CHECKLIST.md | Deploy Checklist |
| docs/waves/W16/LKGC_TEMPLATE.md | LKGC Template |
| docs/waves/W16/IMPLEMENTATION_PLAN.md | Implementation Plan |
| docs/waves/W16/HANDOFF.md | Handoff |
| docs/waves/W16/FR_REGISTER.md | FR Register |
| docs/waves/W16/RISK_REGISTER.md | Risk Register |
| docs/waves/W16/INTEGRATION_MAP.md | Integration Map |
