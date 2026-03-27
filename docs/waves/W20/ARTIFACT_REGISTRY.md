# W20 ARTIFACT REGISTRY — Operator Workflow Engine

## Source Artifacts

| Artifact | Path | Status | Wave |
|----------|------|--------|------|
| AlertAcknowledgmentEngine | src/workflow/alert-acknowledgment-engine.ts | NOT STARTED | W20 |
| IncidentManager | src/workflow/incident-manager.ts | NOT STARTED | W20 |
| EscalationMatrix | src/workflow/escalation-matrix.ts | NOT STARTED | W20 |
| OperatorShiftHandover | src/workflow/operator-shift-handover.ts | NOT STARTED | W20 |
| SlaComplianceTracker | src/workflow/sla-compliance-tracker.ts | NOT STARTED | W20 |
| AuditTrailExporter | src/workflow/audit-trail-exporter.ts | NOT STARTED | W20 |
| MultiSiteOperatorView | src/workflow/multi-site-operator-view.ts | NOT STARTED | W20 |
| W20OperatorWorkflowPipeline | src/workflow/w20-operator-workflow-pipeline.ts | NOT STARTED | W20 |

## Type Definition Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| W20 domain types | src/workflow/types.ts | NOT STARTED |
| Alert, Incident, Escalation interfaces | src/workflow/types.ts | NOT STARTED |
| ShiftHandover, SlaRecord, AuditEntry interfaces | src/workflow/types.ts | NOT STARTED |
| OperatorWorkflowState | src/workflow/types.ts | NOT STARTED |

## Test Artifacts

| Artifact | Path | Tests | Status |
|----------|------|-------|--------|
| Alert acknowledgment tests | infra/__tests__/sentinel-w20-alert-acknowledgment.test.cjs | 13 | NOT STARTED |
| Incident manager tests | infra/__tests__/sentinel-w20-incident-manager.test.cjs | 14 | NOT STARTED |
| Escalation matrix tests | infra/__tests__/sentinel-w20-escalation-matrix.test.cjs | 12 | NOT STARTED |
| Shift handover tests | infra/__tests__/sentinel-w20-shift-handover.test.cjs | 10 | NOT STARTED |
| SLA compliance tracker tests | infra/__tests__/sentinel-w20-sla-compliance-tracker.test.cjs | 11 | NOT STARTED |
| Audit trail exporter tests | infra/__tests__/sentinel-w20-audit-trail-exporter.test.cjs | 11 | NOT STARTED |
| Multi-site operator view tests | infra/__tests__/sentinel-w20-multi-site-operator-view.test.cjs | 12 | NOT STARTED |
| Workflow pipeline tests | infra/__tests__/sentinel-w20-workflow-pipeline.test.cjs | 13 | NOT STARTED |
| Test fixtures | infra/__tests__/sentinel-w20-fixtures.cjs | N/A | NOT STARTED |

## Documentation Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| DESIGN.md | docs/waves/W20/DESIGN.md | COMPLETE |
| PRD.md | docs/waves/W20/PRD.md | COMPLETE |
| ARCHITECTURE.md | docs/waves/W20/ARCHITECTURE.md | COMPLETE |
| DATABASE_SCHEMA.md | docs/waves/W20/DATABASE_SCHEMA.md | COMPLETE |
| API_SPECIFICATION.md | docs/waves/W20/API_SPECIFICATION.md | COMPLETE |
| AI_PIPELINE.md | docs/waves/W20/AI_PIPELINE.md | COMPLETE |
| PRIVACY_ARCHITECTURE.md | docs/waves/W20/PRIVACY_ARCHITECTURE.md | COMPLETE |
| ROADMAP.md | docs/waves/W20/ROADMAP.md | COMPLETE |
| TEST_STRATEGY.md | docs/waves/W20/TEST_STRATEGY.md | COMPLETE |
| ACCEPTANCE_CRITERIA.md | docs/waves/W20/ACCEPTANCE_CRITERIA.md | COMPLETE |
| DECISION_LOG.md | docs/waves/W20/DECISION_LOG.md | COMPLETE |
| SESSION_STATE.md | docs/waves/W20/SESSION_STATE.md | COMPLETE |
| ARTIFACT_REGISTRY.md | docs/waves/W20/ARTIFACT_REGISTRY.md | COMPLETE (this file) |
| DEPLOY_CHECKLIST.md | docs/waves/W20/DEPLOY_CHECKLIST.md | COMPLETE |
| LKGC_TEMPLATE.md | docs/waves/W20/LKGC_TEMPLATE.md | COMPLETE |
| IMPLEMENTATION_PLAN.md | docs/waves/W20/IMPLEMENTATION_PLAN.md | COMPLETE |
| HANDOFF.md | docs/waves/W20/HANDOFF.md | COMPLETE |
| FR_REGISTER.md | docs/waves/W20/FR_REGISTER.md | COMPLETE |
| RISK_REGISTER.md | docs/waves/W20/RISK_REGISTER.md | COMPLETE |
| INTEGRATION_MAP.md | docs/waves/W20/INTEGRATION_MAP.md | COMPLETE |

## Supabase Migration Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| operator_audit_log table | supabase/migrations/YYYYMMDD_w20_operator_audit_log.sql | NOT STARTED |
| operator_sla_records table | supabase/migrations/YYYYMMDD_w20_operator_sla_records.sql | NOT STARTED |
| operator_shift_handovers table | supabase/migrations/YYYYMMDD_w20_operator_shift_handovers.sql | NOT STARTED |

## Downstream Artifacts (produced by W20 at runtime)

| Artifact | Location | Format | Retention |
|----------|----------|--------|-----------|
| AuditTrail export | /var/apex-sentinel/exports/audit-YYYYMMDD.json | JSON | 90 days raw |
| AACR CSV export | /var/apex-sentinel/exports/aacr-YYYYMMDD.csv | CSV | 90 days raw |
| IncidentReport | /var/apex-sentinel/reports/incident-{id}.json | JSON | 90 days raw |
| ShiftHandover archive | /var/apex-sentinel/handovers/handover-{id}.json | JSON | 90 days raw |
| NATS workflow.state | nats://localhost:4222 | JSON | ephemeral |

## Dependency Artifacts (from upstream waves)

| Artifact | Wave | Path | Used by |
|----------|------|------|---------|
| ThreatIntelPicture type | W19 | src/intel/types.ts | W20 pipeline input |
| ZoneBreach type | W19 | src/intel/types.ts | Alert creation |
| AwningLevel type | W19 | src/intel/types.ts | Escalation trigger |
| AuditEventLogger | W15 | src/system/audit-event-logger.ts | AuditTrailExporter |
| TelegramBot.sendMessage() | W13 | src/output/telegram-bot.ts | Escalation notifications |
| DashboardSSE.push() | W14 | src/dashboard/sse-emitter.ts | Workflow state push |
| ConfigurationManager | W16 | src/system/configuration-manager.ts | Zone config, SLA config |
