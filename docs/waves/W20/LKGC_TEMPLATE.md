# W20 LKGC TEMPLATE — Last Known Good Configuration

## Purpose

This template captures the exact configuration state at the last known good configuration point for W20. Use this to restore a working state after a failed deploy or configuration drift.

---

## LKGC Record Format

```
LKGC-W20-{YYYYMMDD}-{SEQUENCE}
Recorded by: {operatorId}
Recorded at: {ISO-8601}
System state: VERIFIED_GOOD
Test suite: {N}/3035 GREEN
```

---

## Configuration Snapshot

### W20 Module Configuration

```json
{
  "w20": {
    "enabled": true,
    "alertFsmConfig": {
      "slaThresholds": {
        "airport":    { "ackMs": 60000,  "resolveMs": 1800000 },
        "nuclear":    { "ackMs": 30000,  "resolveMs": 1800000 },
        "military":   { "ackMs": 30000,  "resolveMs": 1800000 },
        "government": { "ackMs": 120000, "resolveMs": 1800000 }
      },
      "aacrNotifSlaMs": 900000,
      "archiveAfterMs": 86400000
    },
    "incidentManagerConfig": {
      "correlationWindowMs": 600000,
      "maxAlertsPerIncident": 50,
      "autoCloseAfterMs": 3600000
    },
    "escalationConfig": {
      "enabled": true,
      "dryRun": false,
      "telegramChannelIds": {
        "airport":    "${TELEGRAM_CHANNEL_AIRPORT}",
        "nuclear":    "${TELEGRAM_CHANNEL_NUCLEAR}",
        "military":   "${TELEGRAM_CHANNEL_MILITARY}",
        "government": "${TELEGRAM_CHANNEL_GOVERNMENT}"
      }
    },
    "shiftHandoverConfig": {
      "shiftBoundariesUtc": ["04:00", "12:00", "20:00"],
      "timezoneOffsetHours": 2,
      "telegramEnabled": true,
      "archiveHandovers": true
    },
    "slaTrackerConfig": {
      "windowMs": 86400000,
      "maxRecords": 10000,
      "evictionRatio": 0.1
    },
    "auditConfig": {
      "supabaseWriteThrough": true,
      "exportDir": "/var/apex-sentinel/exports",
      "retentionDays": {
        "standard": 90,
        "nuclear": 2555,
        "military": 1825
      }
    },
    "multiSiteConfig": {
      "healthScorePenalties": {
        "awning": { "CLEAR": 0, "YELLOW": 15, "ORANGE": 30, "RED": 50 },
        "perUnackedAlert": 5,
        "maxAlertPenalty": 30,
        "perOpenIncident": 10,
        "maxIncidentPenalty": 20
      }
    },
    "natsConfig": {
      "subjects": {
        "workflowState": "workflow.state",
        "escalation": "workflow.escalation"
      },
      "publishIntervalMs": 30000
    }
  }
}
```

---

## Supabase Schema Snapshot

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'operator_audit_log',
  'operator_sla_records',
  'operator_shift_handovers'
);
-- Expected: 3 rows

-- Verify indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'operator_audit_log';
-- Expected: idx_operator_audit_log_operator, idx_operator_audit_log_resource, idx_operator_audit_log_ts

-- Verify retention function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name LIKE 'prune_%';
-- Expected: prune_operator_audit_log, prune_sla_records
```

---

## Node.js / Runtime Snapshot

```
Node.js version: v20.x LTS (≥20.0.0)
npm version: ≥10.0.0
TypeScript version: ≥5.0.0
NATS server: ≥2.10.0

Process memory baseline (W20 initialized, no alerts): <30MB heapUsed
Process memory under load (1000 alerts, 100 incidents): <80MB heapUsed
```

---

## Service State

```bash
# Systemd unit status
sudo systemctl is-active apex-sentinel.service
# Expected: active

# Verify W20 loaded
sudo journalctl -u apex-sentinel.service | grep "W20OperatorWorkflowPipeline"
# Expected: line containing "initialized"

# NATS publish healthy
nats sub workflow.state --count 1 --timeout 35s
# Expected: JSON payload received

# Supabase connection healthy
curl -s "${SUPABASE_URL}/rest/v1/operator_audit_log?select=count" \
  -H "apikey: ${SUPABASE_ANON_KEY}" | jq '.[0].count'
# Expected: "0" or numeric string (not an error)
```

---

## Known-Good Test Results

At LKGC snapshot time:

```
W20 unit tests:    96/96 GREEN
Full suite:     3035/3035 GREEN (2939 pre-W20 + 96 W20)
TypeScript:     0 errors (npx tsc --noEmit)
Coverage:       ≥80% all W20 source files
Chain verify:   {valid: true} on 1000-entry test chain
```

---

## Recovery Procedure

If system drifts from LKGC:

1. Pull last known good commit:
   ```bash
   git log --oneline | grep "feat(W20): wave complete"
   git checkout {commit-hash} -- src/workflow/ infra/__tests__/sentinel-w20-*.cjs
   ```

2. Restore configuration:
   ```bash
   cp /var/apex-sentinel/backups/sentinel-config-LKGC.json /opt/apex-sentinel/config/sentinel-config.json
   ```

3. Rebuild and restart:
   ```bash
   cd /opt/apex-sentinel && npm run build
   sudo systemctl restart apex-sentinel.service
   ```

4. Verify recovery:
   ```bash
   node --test infra/__tests__/sentinel-w20-*.test.cjs
   # Must be 96/96 GREEN
   ```
