# W12 DATABASE SCHEMA

## No new Supabase migrations in W12.

All RF session state is held in-process (RfSessionTracker). Persistence is handled
by the existing `openclaw_tasks_v2` queue and NATS event bus. If session history
needs to be archived, it is written to the existing `sentinel_events` table via the
pipeline integration layer with event_type = 'rf_session'.

## Existing tables used (read-only from RF layer)
- `sensor_nodes` — node lat/lon for RfBearingEstimator
- `sentinel_events` — RF session events appended here by RfPipelineIntegration

## Field additions (non-breaking, additive)
```sql
-- Append to sentinel_events.metadata JSONB:
-- { rf_session_id, protocol, estimated_lat, estimated_lon, accuracy_m, anomaly_type }
```
No migration required — JSONB metadata column already present.
