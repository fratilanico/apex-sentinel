# W20 IMPLEMENTATION PLAN — Operator Workflow Engine

## Implementation Approach

TDD RED → GREEN. No production code written until all 96 tests are committed in failing state.

Implementation sequence follows data dependency order: FSM first (AlertAcknowledgmentEngine), then consumers (IncidentManager), then orchestrator (W20OperatorWorkflowPipeline).

---

## Phase 0: Shared Types (Day 1, Morning)

**File:** `src/workflow/types.ts`

Create all shared TypeScript interfaces before writing any implementation. This file is the contract between all W20 modules.

```typescript
// Export order (consumers depend on earlier types)
export type AlertStatus = ...
export type ZoneType = ...
export type AwningLevel = ...
export type IncidentStatus = ...
export type EscalationAuthority = ...
export type SlaEventType = ...
export type OperatorActionType = ...
export interface AlertTransition { ... }
export interface Alert { ... }
export interface IncidentTimeline { ... }
export interface IncidentReport { ... }
export interface Incident { ... }
export interface EscalationLevel { ... }
export interface EscalationChain { ... }
export interface Escalation { ... }
export interface ShiftHandover { ... }
export interface SlaRecord { ... }
export interface SlaStatus { ... }
export interface SlaBreachEvent { ... }
export interface AuditEntry { ... }
export interface OperatorAction { ... }
export interface OperatorWorkflowState { ... }
```

**Estimated time:** 2 hours
**Verification:** `npx tsc --noEmit` → 0 errors

---

## Phase 1: TDD RED — Write All 96 Failing Tests (Day 1, Afternoon)

Write all 8 test files. Each test must FAIL (import module that does not exist yet).

```bash
# After writing each test file, verify it fails correctly:
node --test infra/__tests__/sentinel-w20-alert-acknowledgment.test.cjs
# → MODULE_NOT_FOUND or all tests FAIL — correct
```

Commit RED state:
```bash
git add infra/__tests__/sentinel-w20-*.test.cjs
git commit -m "test(W20): TDD RED — 96 failing tests for operator workflow engine"
```

**Estimated time:** 4 hours
**Verification:** All 96 tests failing for the right reason (module not found, not runtime errors)

---

## Phase 2: FR-W20-01 AlertAcknowledgmentEngine (Day 2)

**File:** `src/workflow/alert-acknowledgment-engine.ts`

### Step 1: Skeleton class (30 min)
```typescript
export class AlertAcknowledgmentEngine extends EventEmitter {
  private alertStore: Map<string, Alert> = new Map();
  private clockFn: () => number;

  constructor(options: { clockFn?: () => number } = {}) {
    super();
    this.clockFn = options.clockFn ?? Date.now;
  }
}
```

### Step 2: ingestAlert (45 min)
- Validate correlationId uniqueness → DuplicateAlertError
- Compute slaAckDeadline from zone type lookup
- Create Alert in NEW status
- Emit 'alert_new'

### Step 3: acknowledge (30 min)
- Validate operatorId non-empty
- Check Alert is in NEW status → InvalidTransitionError
- Record SlaRecord (COMPLIANT/BREACH based on elapsed vs slaAckDeadline)
- Emit 'sla_breach' if BREACH

### Step 4: beginInvestigation (20 min)
- Validate actionNote non-empty
- Check Alert is in ACKNOWLEDGED → InvalidTransitionError

### Step 5: resolveAlert (30 min)
- Check Alert is in INVESTIGATING → InvalidTransitionError
- Record SlaRecord (RESOLVE event type)
- Emit nothing (resolution event propagated via IncidentManager)

### Step 6: getActiveAlerts + filter (20 min)

**Run tests:** `node --test infra/__tests__/sentinel-w20-alert-acknowledgment.test.cjs`
**Target:** 13/13 GREEN

---

## Phase 3: FR-W20-05 SlaComplianceTracker (Day 2, Afternoon)

**File:** `src/workflow/sla-compliance-tracker.ts`

### Step 1: SlaRecord ring buffer (30 min)
- records: SlaRecord[] with max 10_000 capacity
- Eviction: remove oldest 10% when full

### Step 2: recordEvent (20 min)
- Create SlaRecord
- Emit 'sla_breach' if result=BREACH

### Step 3: computeCompliance (30 min)
- Filter records to rolling windowMs
- Compute ack/resolve/aacrNotif compliance percentages separately

### Step 4: checkSla (20 min)
- Compute remaining time for an individual alert

**Run tests:** `node --test infra/__tests__/sentinel-w20-sla-compliance-tracker.test.cjs`
**Target:** 11/11 GREEN

---

## Phase 4: FR-W20-06 AuditTrailExporter (Day 3, Morning)

**File:** `src/workflow/audit-trail-exporter.ts`

### Step 1: Hash chain foundation (45 min)
```typescript
import { createHash } from 'node:crypto';

private computeHash(prevHash: string, action: OperatorAction, sequenceNo: number): string {
  return createHash('sha256')
    .update(prevHash)
    .update(String(action.ts))
    .update(action.operatorId)
    .update(action.actionType)
    .update(action.resourceId)
    .update(JSON.stringify(action.metadata))
    .digest('hex');
}
```

### Step 2: appendEntry (30 min)
- Compute hash from prevHash + action fields
- Increment sequenceNo
- Update prevHash

### Step 3: verifyChain (30 min)
- Iterate entries, recompute each hash
- Return {valid: false, firstInvalidAt: index} on first mismatch

### Step 4: exportJSON / exportCSV (30 min)
- JSON: filter by AuditFilter, return AuditEntry[]
- CSV: serialize with correct column headers

### Step 5: eraseOperator (20 min)
- Replace operatorId in all entries
- Recompute hashes for all affected entries and all subsequent entries (chain must remain valid)

**Run tests:** `node --test infra/__tests__/sentinel-w20-audit-trail-exporter.test.cjs`
**Target:** 11/11 GREEN

---

## Phase 5: FR-W20-02 IncidentManager (Day 3, Afternoon)

**File:** `src/workflow/incident-manager.ts`

### Step 1: Correlation key computation (20 min)
```typescript
private correlationKey(alert: Alert): string {
  const bucket = Math.floor(alert.detectedAt / this.correlationWindowMs);
  return `${alert.zoneId}:${bucket}`;
}
```

### Step 2: correlate (45 min)
- For each alert: compute key, find existing OPEN/ACTIVE incident
- If found: add alertId, update maxAwningLevel
- If not found: create new Incident, emit 'incident_opened'

### Step 3: Incident lifecycle auto-transitions (30 min)
- Watch constituent alert transitions
- ACTIVE when first alert ≠ NEW
- MONITORING when all alerts ≥ INVESTIGATING
- Auto-CLOSED trigger when all alerts RESOLVED (calls checkIncidentCompletion)

### Step 4: generateIncidentReport (30 min)
- Gather all transitions from constituent alerts
- Build chronological timeline
- Compute slaCompliant from constituent SlaRecords

**Run tests:** `node --test infra/__tests__/sentinel-w20-incident-manager.test.cjs`
**Target:** 14/14 GREEN

---

## Phase 6: FR-W20-03 EscalationMatrix (Day 4, Morning)

**File:** `src/workflow/escalation-matrix.ts`

### Step 1: Chain definitions (30 min)
Define all 4 chains as static configuration objects (see ARCHITECTURE.md for full chain definitions).

### Step 2: evaluateEscalation (45 min)
- Check incident.awningLevel ≥ chain.triggerAwning
- Check slaBreach duration ≥ chain.triggerSlaBreachMs
- Determine current escalation level (from incident.escalationLevel)
- Return next level action, or null

### Step 3: executeEscalation (30 min)
- Create Escalation record
- Emit 'escalation_triggered'
- Increment incident.escalationLevel

### Step 4: acknowledgeEscalation (15 min)

**Run tests:** `node --test infra/__tests__/sentinel-w20-escalation-matrix.test.cjs`
**Target:** 12/12 GREEN

---

## Phase 7: FR-W20-04 OperatorShiftHandover (Day 4, Afternoon)

**File:** `src/workflow/operator-shift-handover.ts`

### Step 1: Shift boundary detection (30 min)
```typescript
private isNearShiftBoundary(nowMs: number): boolean {
  // boundaries: 04:00, 12:00, 20:00 UTC (= 06:00, 14:00, 22:00 UTC+2)
  // return true if within 5min of any boundary
}
```

### Step 2: generateHandover (45 min)
- Collect activeIncidents, unresolvedAlerts from passed-in state
- Compute detectionStats24h from SlaRecords
- Format telegramMessage (under 4096 chars)
- Emit 'handover_ready'

### Step 3: acknowledgeHandover (15 min)

**Run tests:** `node --test infra/__tests__/sentinel-w20-shift-handover.test.cjs`
**Target:** 10/10 GREEN

---

## Phase 8: FR-W20-07 MultiSiteOperatorView (Day 5, Morning)

**File:** `src/workflow/multi-site-operator-view.ts`

### Step 1: Site state store (20 min)
Map<zoneId, SiteState> with addZone/updateZoneState

### Step 2: Health score computation (30 min)
Implement penalty formula from ARCHITECTURE.md.

### Step 3: getOperatorView (30 min)
- Filter by operatorId's assigned zones (or all if no assignment filter)
- Sort by healthScore ascending
- Compute overallHealthScore = MIN
- Compute totalActiveIncidents, totalUnacknowledgedAlerts

**Run tests:** `node --test infra/__tests__/sentinel-w20-multi-site-operator-view.test.cjs`
**Target:** 12/12 GREEN

---

## Phase 9: FR-W20-08 W20OperatorWorkflowPipeline (Day 5, Afternoon)

**File:** `src/workflow/w20-operator-workflow-pipeline.ts`

### Step 1: Constructor + component wiring (30 min)
Instantiate all 7 sub-components, wire up internal event listeners.

### Step 2: process() (60 min)
- Convert ThreatIntelPicture.ZoneBreaches to Alert[]
- Dedup by correlationId (idempotent ingest)
- Call each sub-component in order
- Return OperatorWorkflowState

### Step 3: Event forwarding (20 min)
Sub-component events → pipeline events (alert_new, sla_breach, etc.)

### Step 4: NATS publish (20 min)
Publish workflow.state on each process() call + on 30s interval.

**Run tests:** `node --test infra/__tests__/sentinel-w20-workflow-pipeline.test.cjs`
**Target:** 13/13 GREEN

---

## Phase 10: Full Suite Verification (Day 6)

```bash
# Run all W20 tests
node --test infra/__tests__/sentinel-w20-*.test.cjs
# Target: 96/96 GREEN

# Run full suite
node --test infra/__tests__/sentinel-w*.test.cjs
# Target: 3035/3035 GREEN

# TypeScript check
npx tsc --noEmit
# Target: 0 errors

# Coverage
node --test --experimental-test-coverage infra/__tests__/sentinel-w20-*.test.cjs
# Target: ≥80% all files
```

Final commit:
```bash
git add src/workflow/ infra/__tests__/sentinel-w20-*.test.cjs
git commit -m "feat(W20): operator workflow engine — 96 tests GREEN"
```

---

## Time Estimates Summary

| Phase | Work | Estimate |
|-------|------|---------|
| Phase 0 | Types | 2h |
| Phase 1 | TDD RED (96 tests) | 4h |
| Phase 2 | AlertAcknowledgmentEngine | 3h |
| Phase 3 | SlaComplianceTracker | 1.5h |
| Phase 4 | AuditTrailExporter | 2.5h |
| Phase 5 | IncidentManager | 2h |
| Phase 6 | EscalationMatrix | 2h |
| Phase 7 | OperatorShiftHandover | 1.5h |
| Phase 8 | MultiSiteOperatorView | 1.5h |
| Phase 9 | W20OperatorWorkflowPipeline | 2h |
| Phase 10 | Full verification | 1h |
| **Total** | | **~23h (4 days)** |
