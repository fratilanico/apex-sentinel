# APEX-SENTINEL W8 — Artifact Registry

> Wave: W8 | Date: 2026-03-26

---

## Source Artifacts (to be created in W8)

### New TypeScript Modules

| Artifact | Path | FR | Description |
|----------|------|----|-------------|
| RecallOracleGate | `src/ml/recall-oracle-gate.ts` | W8-01 | Per-profile recall gate runner |
| ConsistencyOracle | `src/ml/consistency-oracle-w8.ts` | W8-02 | Simpson's paradox detection |
| OtaController | `src/node/ota-controller.ts` | W8-08 | Firmware OTA via NATS JetStream KV |
| WildHornetsLoader | `src/ml/wild-hornets-loader.ts` | W8-09 | Dataset loader + augmentation |
| PromotionGate (additions to YAMNetFineTuner) | `src/ml/yamnet-finetuner.ts` | W8-10 | promoteModel() method |
| ModelHandleRegistry | `src/ml/model-handle-registry.ts` | W8-10 | Tracks valid promotion handles |
| MultiThreatResolver | `src/tracking/multi-threat-resolver.ts` | W8-07 | Track collision + swarm detection |
| PtzIntegrationClient | `src/output/ptz-integration-client.ts` | W8-03 | ONVIF command + ACK wrapper |
| ElrsFieldValidator | `src/rf/elrs-field-validator.ts` | W8-04 | Field tuning envelope |

### New Test Files

| Artifact | Path | FR | Tests |
|----------|------|----|-------|
| Recall oracle tests | `tests/ml/FR-W8-01-recall-oracle.test.ts` | W8-01 | 16 |
| Simpson oracle tests | `tests/ml/FR-W8-02-simpsons-oracle.test.ts` | W8-02 | 12 |
| PTZ integration tests | `tests/hardware/FR-W8-03-ptz-integration.test.ts` | W8-03 | 8 |
| ELRS field tests | `tests/rf/FR-W8-04-elrs-field.test.ts` | W8-04 | 10 |
| Mobile UI tests | `tests/mobile/FR-W8-05-mobile-ui.test.ts` | W8-05 | 35 |
| Dashboard UI tests | `tests/dashboard/FR-W8-06-dashboard-ui.test.ts` | W8-06 | 25 |
| Multi-threat tests | `tests/tracking/FR-W8-07-multi-threat.test.ts` | W8-07 | 20 |
| OTA controller tests | `tests/node/FR-W8-08-ota-controller.test.ts` | W8-08 | 12 |
| Wild hornets tests | `tests/ml/FR-W8-09-wild-hornets.test.ts` | W8-09 | 18 |
| Learning safety tests | `tests/unit/FR-W8-10-learning-safety-gate.test.ts` | W8-10 | 16 |
| Chaos tests | `tests/chaos/FR-W8-11-chaos.test.ts` | W8-11 | 20 |
| Privacy regression | `tests/privacy/FR-W8-privacy-regression.test.ts` | Cross-FR | 6 |

### Frontend Artifacts

| Artifact | Path | FR | Description |
|----------|------|----|-------------|
| Dashboard Next.js app | `dashboard/` | W8-06 | Next.js 14 App Router |
| Mobile Expo app | `mobile/` | W8-05 | Expo 51 managed workflow |

### Database Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| model_promotion_audit | `supabase/migrations/0086_model_promotion_audit.sql` | IEC 61508 audit trail |
| firmware_ota_log | `supabase/migrations/0087_firmware_ota_log.sql` | OTA history |
| per_profile_recall_metrics | `supabase/migrations/0088_per_profile_recall_metrics.sql` | CI recall metrics |
| multi_threat_sessions | `supabase/migrations/0089_multi_threat_sessions.sql` | Swarm events |

### Scripts

| Artifact | Path | Description |
|----------|------|-------------|
| Dataset download | `scripts/download-dataset.sh` | Downloads BRAVE1-v2.3-16khz from Supabase Storage |
| Wild Hornets download | `scripts/download-wild-hornets.sh` | Downloads Wild Hornets dataset |
| Model export gate | `scripts/export-model.sh` | Runs recall oracle, blocks on failure |
| Mutation test run | `scripts/test-mutation.sh` | Runs Stryker with CI gate |

---

## External Dependencies

| Dependency | Version | FR | Source |
|------------|---------|-----|--------|
| onvif-simulator | ^1.0 | W8-03 | npm |
| expo | 51.x | W8-05 | npm |
| @react-navigation/native | ^6 | W8-05 | npm |
| next | ^14 | W8-06 | npm |
| leaflet | ^1.9 | W8-06 | npm |
| leaflet.heat | ^0.2 | W8-06 | npm |
| @stryker-mutator/core | ^8 | W8-12 | npm (exists) |

---

## Datasets (external, must be pinned before W8 TDD-RED)

| Dataset | Version | Usage | Location |
|---------|---------|-------|----------|
| BRAVE1 acoustic corpus | v2.3-16khz | Recall oracle gates | Supabase Storage: bymfcnwfyxuivinuzurr |
| Wild Hornets | 3.1 | FPR calibration | Public acoustic ecology database |
