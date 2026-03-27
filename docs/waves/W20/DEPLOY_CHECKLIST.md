# W20 DEPLOY CHECKLIST — Operator Workflow Engine

## Pre-Deploy Gates (must ALL pass before deploy)

```
[ ] npx tsc --noEmit — 0 errors
[ ] node --test infra/__tests__/sentinel-w20-*.test.cjs — 96/96 GREEN
[ ] node --test infra/__tests__/sentinel-w*.test.cjs — 3035/3035 GREEN (2939 + 96)
[ ] node --test --experimental-test-coverage — ≥80% all W20 files
[ ] AuditTrailExporter.verifyChain() smoke test on 100-entry chain
[ ] W20OperatorWorkflowPipeline smoke test with mock ThreatIntelPicture
[ ] git status clean — no uncommitted changes
[ ] git push origin main — confirmed
```

---

## Supabase Migration

```
[ ] Apply migration: supabase/migrations/YYYYMMDD_w20_operator_audit_log.sql
    Verify: SELECT COUNT(*) FROM operator_audit_log → 0 (table exists, empty)

[ ] Apply migration: supabase/migrations/YYYYMMDD_w20_operator_sla_records.sql
    Verify: SELECT COUNT(*) FROM operator_sla_records → 0

[ ] Apply migration: supabase/migrations/YYYYMMDD_w20_operator_shift_handovers.sql
    Verify: SELECT COUNT(*) FROM operator_shift_handovers → 0

[ ] Verify RLS policies applied on all 3 tables
    Policy: operators can only SELECT their own records (operatorId match)
    Policy: service role can INSERT/SELECT/UPDATE all records

[ ] Set up retention jobs:
    [ ] Scheduled function: prune_operator_audit_log (runs daily, deletes rows >90 days old with zone_type NOT IN ('nuclear', 'military'))
    [ ] Scheduled function: prune_sla_records (runs daily, deletes rows >90 days old)
```

---

## Edge Node Deployment (RPi4 / Jetson Nano)

```
[ ] Pull latest origin/main on edge node:
    git -C /opt/apex-sentinel pull origin main

[ ] Verify new files present:
    ls /opt/apex-sentinel/src/workflow/
    → 8 .ts files expected

[ ] Rebuild TypeScript:
    cd /opt/apex-sentinel && npm run build

[ ] Verify dist/workflow/ contains compiled JS:
    ls /opt/apex-sentinel/dist/workflow/

[ ] Memory budget check:
    node -e "const { W20OperatorWorkflowPipeline } = require('./dist/workflow/w20-operator-workflow-pipeline');
             const p = new W20OperatorWorkflowPipeline();
             console.log(process.memoryUsage().heapUsed / 1024 / 1024, 'MB');"
    → Must be <30MB baseline

[ ] Restart apex-sentinel.service:
    sudo systemctl restart apex-sentinel.service
    sudo systemctl status apex-sentinel.service
    → Active: active (running)

[ ] Verify W20 module loaded (check logs):
    sudo journalctl -u apex-sentinel.service -n 50 | grep W20
    → "W20OperatorWorkflowPipeline initialized"

[ ] NATS subscription check:
    nats sub workflow.state --count 1
    → Receives JSON payload within 35 seconds
```

---

## Integration Verification

```
[ ] Send test ThreatIntelPicture via test harness:
    node scripts/test-w20-smoke.js
    → Alert created, logged to Supabase
    → SLA timer started
    → NATS workflow.state published

[ ] Verify Telegram notification:
    Trigger test escalation
    → Escalation message received in Telegram channel within 5 seconds

[ ] Verify audit log write-through:
    SELECT * FROM operator_audit_log ORDER BY sequence_no DESC LIMIT 1;
    → Row exists with correct hash

[ ] Verify shift handover at boundary:
    Set clock to 05:59:55 UTC+2 (14h shift boundary)
    → handover_ready event fires within 10 seconds
    → Telegram message sent
    → Row in operator_shift_handovers

[ ] Verify SLA breach detection:
    Create TEST alert with airport zone
    Wait 65 seconds without acknowledging
    → sla_breach event emitted
    → sla_records row with result=BREACH
    → escalation_triggered event (Level 2: AACR)
    Delete test alert from store after verification
```

---

## Rollback Plan

If W20 deploy causes regression:

```
[ ] Identify failing component: journalctl -u apex-sentinel.service -n 200

[ ] If W20 module crash: disable W20 in config
    Edit /opt/apex-sentinel/config/sentinel-config.json
    Set "enableW20": false
    sudo systemctl restart apex-sentinel.service
    → System reverts to W19 output without W20 workflow layer

[ ] If Supabase migration causes issues:
    Apply rollback migration: supabase/migrations/YYYYMMDD_w20_rollback.sql
    → Drops 3 W20 tables (data loss acceptable — W20 is append-only, no state survives rollback)

[ ] Git rollback if needed:
    git revert HEAD (creates new commit reverting W20)
    git push origin main
    Pull on edge nodes
```

---

## Post-Deploy Monitoring (24h window)

```
[ ] Monitor SLA compliance rate (first 24h):
    SELECT
      event_type,
      COUNT(*) FILTER (WHERE result = 'COMPLIANT') AS compliant,
      COUNT(*) FILTER (WHERE result = 'BREACH') AS breach
    FROM operator_sla_records
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY event_type;
    → Ack compliance target ≥95%

[ ] Monitor audit log chain integrity:
    Node script: AuditTrailExporter.verifyChain() on production chain
    → Must return {valid: true}

[ ] Monitor memory on edge node:
    watch -n 60 "ps aux | grep apex-sentinel | awk '{print \$6}'"
    → Resident memory must not exceed 150MB (full system)

[ ] Verify escalation Telegram deliveries:
    Check Telegram channel message history
    → No missed escalation notifications

[ ] Check NATS workflow.state publish frequency:
    nats sub workflow.state --count 5 --timeout 200s
    → 5 messages received within 200s (publishes every 30s)
```

---

## Approvals Required Before Production

| Approver | Role | Sign-off required for |
|----------|------|----------------------|
| Nico (founder) | Technical owner | W20 wave complete |
| EUDIS demo lead | Hackathon | Demo environment deploy |
| Site DPO | Privacy | Supabase retention policy deployment |
| AACR contact | Regulatory | Audit trail CSV format acceptance |
