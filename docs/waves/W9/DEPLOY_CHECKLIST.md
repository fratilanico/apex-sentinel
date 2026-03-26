# W9 — DEPLOY_CHECKLIST
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## Pre-Deploy Gates (ALL must pass)

- [ ] `npx vitest run --coverage` — 1988 tests GREEN (1860 W1-W8 + 128 W9)
- [ ] Coverage: ≥80% statements, branches, functions, lines — check per-module for feeds/ and detection/
- [ ] `npx tsc --noEmit` — 0 TypeScript errors
- [ ] `npm run build` — build completes without error
- [ ] `npx vitest run --project p2` — P2 integration project GREEN

---

## NATS Configuration

- [ ] Verify JetStream is enabled on the NATS server
- [ ] Create or verify the following subjects exist in JetStream config:
  - `feed.adsb.aircraft`
  - `feed.weather.current`
  - `feed.alerts.active`
  - `feed.osint.events`
  - `feed.rf.remote_id`
  - `feed.fused`
  - `feed.broker.health`
  - `detection.enriched`
- [ ] Verify NATS consumer groups for `detection.enriched` (ThreatContextEnricher → Supabase writer)

---

## Supabase Migration

- [ ] Run: `supabase db push` or apply migration manually via Supabase MCP
- [ ] Verify tables created: `feed_adsb_snapshots`, `feed_weather_snapshots`, `feed_alerts_active`, `feed_osint_events`, `detection_enriched`
- [ ] Verify RLS policies applied correctly:
  - `feed_alerts_active`: anonymous SELECT enabled
  - All other tables: service_role only
- [ ] Verify indexes created (check `pg_indexes` for idx_adsb_snapshots_ts etc.)
- [ ] Verify pg_cron retention jobs scheduled (or add manually):
  ```sql
  SELECT cron.schedule('adsb-retention', '*/30 * * * *',
    'DELETE FROM feed_adsb_snapshots WHERE ts < now() - interval ''4 hours''');
  SELECT cron.schedule('weather-retention', '*/30 * * * *',
    'DELETE FROM feed_weather_snapshots WHERE ts < now() - interval ''4 hours''');
  SELECT cron.schedule('osint-retention', '*/30 * * * *',
    'DELETE FROM feed_osint_events WHERE ts < now() - interval ''24 hours''');
  SELECT cron.schedule('alerts-retention', '*/30 * * * *',
    'DELETE FROM feed_alerts_active WHERE valid_until < now()');
  ```

---

## Environment Configuration

- [ ] `ADSB_BOUNDING_BOX` set (default: `43.6,22.1,48.3,30.0` for Romania — adjust for deployment theater)
- [ ] `ALERTS_COUNTRIES` set (default: `RO,UA`)
- [ ] `REMOTE_ID_INTERFACE` set to `mock` for CI, or actual BLE interface name for hardware deployment
- [ ] `REMOTE_ID_DAILY_SALT` set (auto-generated if not set, but should be explicitly managed in production)
- [ ] All existing W1-W8 env vars still present and valid

---

## Smoke Tests (Post-Deploy)

- [ ] `DataFeedBroker.start()` returns without error
- [ ] First `feed.fused` NATS event received within 10 seconds of broker start
- [ ] `feed.broker.health` event received within 35 seconds confirming all feeds UP
- [ ] `detection.enriched` event appears on NATS within 200ms of a test detection event being published
- [ ] `feed_alerts_active` table queryable via anonymous Supabase REST endpoint (RLS smoke test)
- [ ] DemoDashboardApi SSE stream includes `feed_state` field in response

---

## Rollback Plan

If W9 deploy breaks existing W1-W8 functionality:

1. `git revert` to W8 LKGC commit (see LKGC_TEMPLATE.md)
2. `supabase db push` with rollback migration (drop W9 tables)
3. Restart services

See LKGC_TEMPLATE.md for exact commit hashes after W9 gates pass.
