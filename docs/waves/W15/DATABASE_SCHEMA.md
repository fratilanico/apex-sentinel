# W15 DATABASE SCHEMA

## No New Database Tables

W15 is a pure in-process resilience layer. All state is held in memory:
- CircuitBreaker: in-memory FSM
- WatchdogMonitor: in-memory health state
- AuditEventLogger: in-memory ring buffer (10k entries) + JSONL export
- ConfigSecretManager: reads from process.env

## Existing Schema Compatibility
W15 components do not modify any existing Supabase tables.
AuditEventLogger exports JSONL that can be ingested into Supabase `audit_events` table if needed (future wave).

## JSONL Audit Export Format
```json
{"seq":1,"ts":1710000000000,"eventType":"detection","actor":"pipeline","payload":{},"prevHash":"0000...","hash":"abcd..."}
```
