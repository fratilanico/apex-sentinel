# APEX-SENTINEL — Deployment Checklist

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Format:** Ordered checklist — complete each item in sequence. Never skip. Initial box = operator signature.

---

## Pre-Deployment Requirements (All Waves)

```
[ ] All acceptance criteria for the wave are passing (ACCEPTANCE_CRITERIA.md)
[ ] Test coverage ≥ 80% all axes (vitest --coverage + jacoco + xcov)
[ ] No TypeScript errors (npx tsc --noEmit)
[ ] No Kotlin compile errors (./gradlew compileReleaseKotlin)
[ ] No Swift compile errors (xcodebuild build)
[ ] No open critical or high bugs in the wave
[ ] DECISION_LOG updated
[ ] ARTIFACT_REGISTRY updated
[ ] SESSION_STATE updated
[ ] Git: all changes committed and pushed to origin/main
[ ] .env.local / local.properties NOT committed (verify with: git status --porcelain | grep -E '\.env|local\.properties')
```

---

## Wave 1 Deployment Checklist

### Step 1: Supabase Setup

#### 1.1 Confirm Project Access

```bash
# Verify Supabase project is accessible
curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/" | jq .

# Expected: JSON response with table listing or empty {}
# If error: check service role key is correct
```

```
[ ] Supabase project bymfcnwfyxuivinuzurr responds to API calls
[ ] SUPABASE_SERVICE_ROLE_KEY set in local environment
[ ] SUPABASE_ANON_KEY set in local environment
```

#### 1.2 Apply Migrations — Sequence Order (DO NOT SKIP, DO NOT REORDER)

```bash
# Install Supabase CLI if not present
npm install -g supabase

# Link to project
supabase link --project-ref bymfcnwfyxuivinuzurr

# Apply migrations in order
supabase db push

# Verify: check migration history
supabase migration list
```

**Migration 001 — detections table:**

```sql
-- supabase/migrations/001_create_detections.sql
CREATE TABLE IF NOT EXISTS public.detections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id       TEXT NOT NULL,
  confidence    FLOAT4 NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  detection_type TEXT NOT NULL CHECK (detection_type IN ('acoustic', 'rf', 'fusion')),
  lat           FLOAT8 NOT NULL CHECK (lat >= -90 AND lat <= 90),
  lng           FLOAT8 NOT NULL CHECK (lng >= -180 AND lng <= 180),
  altitude_m    FLOAT4,
  raw_features  JSONB,
  adsb_correlation JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- BRIN index for time-range queries
CREATE INDEX IF NOT EXISTS idx_detections_created_at_brin ON public.detections USING BRIN (created_at);
-- BTREE for node_id filter
CREATE INDEX IF NOT EXISTS idx_detections_node_id ON public.detections (node_id);
-- Confidence filter
CREATE INDEX IF NOT EXISTS idx_detections_confidence ON public.detections (confidence DESC);

-- Row-level security
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;

-- Policy: nodes can insert their own detections
CREATE POLICY "nodes_insert_own_detections"
  ON public.detections FOR INSERT
  WITH CHECK (node_id = current_setting('app.current_node_id', true));

-- Policy: service role sees all
CREATE POLICY "service_role_all"
  ON public.detections FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: authenticated dashboard reads all
CREATE POLICY "authenticated_read_all"
  ON public.detections FOR SELECT
  USING (auth.role() = 'authenticated');
```

**Migration 002 — nodes table:**

```sql
-- supabase/migrations/002_create_nodes.sql
CREATE TABLE IF NOT EXISTS public.nodes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id       TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_type   TEXT,
  app_version   TEXT,
  lat           FLOAT8,
  lng           FLOAT8,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'offline')),
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_node_id ON public.nodes (node_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON public.nodes (status);

ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nodes_upsert_own"
  ON public.nodes FOR INSERT
  WITH CHECK (node_id = current_setting('app.current_node_id', true));

CREATE POLICY "nodes_update_own"
  ON public.nodes FOR UPDATE
  USING (node_id = current_setting('app.current_node_id', true))
  WITH CHECK (node_id = current_setting('app.current_node_id', true));

CREATE POLICY "service_role_all_nodes"
  ON public.nodes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "authenticated_read_nodes"
  ON public.nodes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Trigger: update updated_at on row update (NEVER touch created_at)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_nodes_updated_at
  BEFORE UPDATE ON public.nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Migration 003 — node_health table:**

```sql
-- supabase/migrations/003_create_node_health.sql
CREATE TABLE IF NOT EXISTS public.node_health (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id         TEXT NOT NULL REFERENCES public.nodes(node_id) ON DELETE CASCADE,
  battery_pct     INT CHECK (battery_pct >= 0 AND battery_pct <= 100),
  signal_strength INT,  -- RSSI dBm for mesh signal
  detection_count INT DEFAULT 0,
  uptime_s        BIGINT,
  app_version     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_node_health_node_id ON public.node_health (node_id);
CREATE INDEX IF NOT EXISTS idx_node_health_created_at ON public.node_health USING BRIN (created_at);

ALTER TABLE public.node_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nodes_insert_own_health"
  ON public.node_health FOR INSERT
  WITH CHECK (node_id = current_setting('app.current_node_id', true));

CREATE POLICY "service_role_all_health"
  ON public.node_health FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "authenticated_read_health"
  ON public.node_health FOR SELECT
  USING (auth.role() = 'authenticated');
```

**Migration verification:**

```bash
# Verify all 3 tables exist
psql "$(supabase status | grep DB URL | awk '{print $3}')" \
  -c "\dt public.*"

# Expected output includes: detections, nodes, node_health

# Verify RLS is enabled
psql "$DB_URL" \
  -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"

# Verify indexes exist
psql "$DB_URL" \
  -c "\di public.*"
```

```
[ ] Migration 001 applied successfully (detections table + RLS + indexes)
[ ] Migration 002 applied successfully (nodes table + RLS + updated_at trigger)
[ ] Migration 003 applied successfully (node_health table + RLS)
[ ] All 3 tables visible in Supabase dashboard (Table Editor)
[ ] RLS enabled on all 3 tables (verified via SQL check above)
[ ] Realtime enabled for `detections` table (Supabase dashboard → Database → Replication → select `detections`)
```

#### 1.3 Enable Supabase Realtime

```
Supabase Dashboard → Database → Replication
→ Add table: public.detections
→ Action: INSERT
→ Save
```

```bash
# Verify realtime channel works (test from CLI)
node scripts/test-realtime.js
# Should log: "Received detection event" within 30s of manual insert
```

```
[ ] Realtime enabled for public.detections (INSERT events)
[ ] Realtime channel test script passes
```

---

### Step 2: Dashboard Deployment (Vercel)

#### 2.1 Environment Variables — Vercel

Set in Vercel project settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL           = https://bymfcnwfyxuivinuzurr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY      = <anon_key>
SUPABASE_SERVICE_ROLE_KEY          = <service_role_key>  [server-side only]
NEXT_PUBLIC_MAP_CENTER             = 51.5074,-0.1278
NEXT_PUBLIC_MAP_ZOOM               = 12
```

#### 2.2 Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to staging
cd /Users/nico/projects/apex-sentinel
vercel --env NEXT_PUBLIC_SUPABASE_URL="https://bymfcnwfyxuivinuzurr.supabase.co" \
       --env NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"

# Deploy to production
vercel --prod
```

#### 2.3 Dashboard Health Check

```bash
# Check dashboard is up
curl -s -o /dev/null -w "%{http_code}" https://apex-sentinel-staging.vercel.app/
# Expected: 200

# Check no console errors (manual: open browser, check console)
# Check map renders (manual)
# Check detection list renders (manual, may be empty if no detections yet)
```

```
[ ] Vercel environment variables set (all 5)
[ ] vercel --prod deploys successfully (exit 0)
[ ] Dashboard URL returns HTTP 200
[ ] Dashboard loads without JavaScript errors (browser console check)
[ ] MapLibre GL map renders (visual check)
[ ] Detection list panel renders (may be empty — that's OK at deploy time)
[ ] Auth redirect works: /dashboard → /login if not authenticated
```

---

### Step 3: Android APK Build and Distribution

#### 3.1 Pre-Build Checks

```bash
cd android/

# Verify model file present
ls -la app/src/main/assets/yamnet_classification.tflite
# Expected: 480KB file

ls -la app/src/main/assets/drone_classifier_head.tflite
# Expected: ≤ 50KB file

# Verify local.properties has keys (but NOT committed)
grep -l 'SUPABASE' local.properties && echo "Keys present" || echo "MISSING KEYS"
```

#### 3.2 Build Release APK

```bash
# Clean build
./gradlew clean

# Build release APK
./gradlew assembleRelease

# Verify APK exists
ls -la app/build/outputs/apk/release/app-release.apk

# Verify APK size is reasonable (< 30MB)
du -sh app/build/outputs/apk/release/app-release.apk
```

#### 3.3 APK Signing

```bash
# Sign with release keystore (keystore generated once, stored securely)
# DO NOT commit keystore to git

jarsigner \
  -verbose \
  -sigalg SHA256withRSA \
  -digestalg SHA-256 \
  -keystore keystore/apex-sentinel-release.jks \
  -storepass "$KEYSTORE_PASSWORD" \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  apex-sentinel-key

# Verify signature
jarsigner -verify -verbose app/build/outputs/apk/release/app-release.apk

# Zipalign
zipalign -v 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  app/build/outputs/apk/release/app-release-signed.apk
```

#### 3.4 Distribution (Enterprise MDM / Sideload)

```bash
# For sideload distribution: upload to private server or share directly
# For enterprise MDM: upload to MDM portal (e.g., Microsoft Intune, VMware Workspace ONE)

# Sideload install command (device must have "unknown sources" enabled)
adb install -r app/build/outputs/apk/release/app-release-signed.apk
```

```
[ ] yamnet_classification.tflite present in assets (480KB)
[ ] drone_classifier_head.tflite present in assets (≤ 50KB)
[ ] ./gradlew assembleRelease succeeds (exit 0)
[ ] APK size < 30MB
[ ] APK signed with release keystore
[ ] jarsigner -verify passes
[ ] APK installs on test device (Pixel 6 or equivalent)
[ ] App launches without crash on target device
[ ] Microphone permission requested and granted flow works
[ ] Detection engine starts (check logcat: "AcousticDetectionEngine started")
[ ] Test detection: play synthetic drone audio from speaker, verify Supabase insert
```

---

### Step 4: iOS TestFlight Distribution

#### 4.1 Pre-Build

```bash
cd ios/

# Verify model file present
ls -la APEX-SENTINEL/Resources/yamnet_classification.tflite

# Verify bundle ID matches Apple Developer account
grep -r "PRODUCT_BUNDLE_IDENTIFIER" APEX-SENTINEL.xcodeproj/
# Expected: uk.apex.sentinel (or configured bundle ID)
```

#### 4.2 Archive and Upload

```bash
# Clean
xcodebuild clean -scheme APEX-SENTINEL -configuration Release

# Archive
xcodebuild \
  -scheme APEX-SENTINEL \
  -configuration Release \
  -archivePath build/APEX-SENTINEL.xcarchive \
  archive \
  DEVELOPMENT_TEAM="<TEAM_ID>" \
  CODE_SIGN_IDENTITY="Apple Distribution"

# Export for TestFlight
xcodebuild \
  -exportArchive \
  -archivePath build/APEX-SENTINEL.xcarchive \
  -exportOptionsPlist ExportOptions-TestFlight.plist \
  -exportPath build/

# Upload to App Store Connect (TestFlight)
xcrun altool \
  --upload-app \
  --type ios \
  --file build/APEX-SENTINEL.ipa \
  --username "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

**ExportOptions-TestFlight.plist:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>destination</key>
    <string>upload</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
```

```
[ ] Xcode archive succeeds (exit 0)
[ ] IPA exported successfully
[ ] IPA uploaded to App Store Connect
[ ] Build appears in TestFlight within 15 minutes (App Store processing)
[ ] TestFlight invite sent to internal testers
[ ] App installs via TestFlight on iPhone 12+ (iOS 16+)
[ ] Microphone permission flow works
[ ] Background audio mode active (verify: app continues working when screen off)
[ ] Test detection passes on iOS device
```

---

### Step 5: Grafana Setup (W3 — complete at W3 deploy)

```bash
# Start Grafana via Docker
docker run -d \
  --name apex-sentinel-grafana \
  -p 3001:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD="$GRAFANA_ADMIN_PASSWORD" \
  -v grafana-storage:/var/lib/grafana \
  grafana/grafana:10.4.0

# Add Supabase PostgreSQL as data source
# Grafana → Configuration → Data Sources → Add → PostgreSQL
# Host: db.bymfcnwfyxuivinuzurr.supabase.co:5432
# Database: postgres
# User: postgres
# Password: $SUPABASE_DB_PASSWORD
# SSL Mode: require
```

**W3 Grafana Dashboards to import:**

```
dashboards/
├── apex-sentinel-overview.json     # Detection rate, node count, uptime
├── apex-sentinel-nodes.json        # Per-node health, battery, signal
└── apex-sentinel-alerts.json       # Alert history, false positive rate
```

```
[ ] Grafana running and accessible
[ ] Supabase PostgreSQL data source connected
[ ] Overview dashboard imported and showing data
[ ] Node health dashboard imported
[ ] Alert rule: node offline > 30s → Grafana alert → notify
```

---

### Step 6: FreeTAKServer Deployment (W4)

```bash
# Pull and start FTS via Docker
docker pull freetakteam/freetakserver:2.1.0

docker run -d \
  --name freetakserver \
  -p 8087:8087/tcp \
  -p 8088:8088/tcp \
  -p 19023:19023/tcp \
  -e FTS_MAIN_IP="$FTS_HOST" \
  -e FTS_WEBMAP_IP="$FTS_HOST" \
  -v fts-data:/opt/fts \
  freetakteam/freetakserver:2.1.0

# Test CoT event injection
curl -X POST http://$FTS_HOST:19023/ManageData/API/SystemUsers \
  -H "Content-Type: application/json" \
  -d '{"Users": [{"Name": "apex-sentinel", "Password": "'$FTS_API_PASSWORD'", "Token": ""}]}'
```

```
[ ] FTS container running and healthy
[ ] FTS TCP port 8087 accessible from APEX-SENTINEL backend
[ ] FTS API port 19023 accessible
[ ] Test CoT event received in ATAK client
[ ] APEX-SENTINEL CoT edge function configured with FTS_HOST + FTS_API_PASSWORD
```

---

### Step 7: Post-Deployment Health Checks (All Waves)

#### Automated Health Check Script

```bash
#!/bin/bash
# scripts/health-check.sh

SUPABASE_URL="https://bymfcnwfyxuivinuzurr.supabase.co"
DASHBOARD_URL="https://apex-sentinel-staging.vercel.app"

echo "=== APEX-SENTINEL Health Check ==="

# 1. Supabase REST API
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/nodes?limit=1")
echo "Supabase REST API: $HTTP"
[ "$HTTP" = "200" ] || echo "FAIL: Supabase REST"

# 2. Dashboard
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL")
echo "Dashboard: $HTTP"
[ "$HTTP" = "200" ] || echo "FAIL: Dashboard"

# 3. Test detection insert
RESULT=$(curl -s -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"node_id":"health-check-node","confidence":0.99,"detection_type":"acoustic","lat":51.5,"lng":-0.1}' \
  "$SUPABASE_URL/rest/v1/detections")
echo "Detection insert: $RESULT"

# 4. Realtime (manual check — cannot automate easily)
echo "MANUAL: Verify realtime subscription in browser dashboard"

echo "=== Health Check Complete ==="
```

```
[ ] health-check.sh passes all automated checks
[ ] Supabase REST API returns 200
[ ] Dashboard returns 200
[ ] Test detection insert succeeds
[ ] Realtime subscription verified (manual: insert test row, see pin appear in dashboard within 2s)
[ ] Android app sends detection successfully (logcat: "Detection inserted: UUID")
[ ] iOS app sends detection successfully (Xcode console: "Detection inserted: UUID")
```

---

### Rollback Procedures

#### Dashboard Rollback

```bash
# Vercel: roll back to previous deployment
vercel rollback [deployment-url]

# Or: revert git commit + redeploy
git revert HEAD
git push origin main
# Vercel auto-deploys on push
```

#### Supabase Migration Rollback

```bash
# Supabase does not auto-rollback migrations
# Manual rollback: run reverse SQL

# Rollback migration 003 (node_health)
psql "$DB_URL" -c "DROP TABLE IF EXISTS public.node_health CASCADE;"

# Rollback migration 002 (nodes)
psql "$DB_URL" -c "DROP TABLE IF EXISTS public.nodes CASCADE;"

# Rollback migration 001 (detections)
psql "$DB_URL" -c "DROP TABLE IF EXISTS public.detections CASCADE;"

# WARNING: This deletes all data. Only use in staging or confirmed disaster scenario.
# Production rollback: restore from Supabase point-in-time recovery (PITR) — available on Pro plan.
```

**PITR Restore (Pro plan):**

```
Supabase Dashboard → Database → Backups → Point-in-time Recovery
→ Select restore point (before problematic migration)
→ Confirm restore
→ Note: restore takes 5–30 minutes for < 1GB database
```

#### Android APK Rollback

```bash
# Keep previous signed APK in releases/ directory
# To roll back: re-distribute previous APK via MDM or adb
adb install -r releases/v1.0.0-previous/app-release-signed.apk
```

---

### Environment Variables Reference

| Variable | Value | Where Set | Committed? |
|----------|-------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bymfcnwfyxuivinuzurr.supabase.co` | `.env.local`, Vercel | NO |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon_key>` | `.env.local`, Vercel | NO |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service_role_key>` | `.env.local` (server-only) | NO |
| `NEXT_PUBLIC_MAP_CENTER` | `51.5074,-0.1278` | `.env.local`, Vercel | YES (safe) |
| `NEXT_PUBLIC_MAP_ZOOM` | `12` | `.env.local`, Vercel | YES (safe) |
| `SUPABASE_URL` (Android) | `https://bymfcnwfyxuivinuzurr.supabase.co` | `android/local.properties` | NO |
| `SUPABASE_ANON_KEY` (Android) | `<anon_key>` | `android/local.properties` | NO |
| `GRAFANA_ADMIN_PASSWORD` | `<strong_password>` | server env | NO |
| `FTS_HOST` | `<fts_ip>` | server env | NO |
| `FTS_API_PASSWORD` | `<fts_password>` | server env | NO |
| `APPLE_ID` | `<apple_id>` | CI env only | NO |
| `APPLE_APP_SPECIFIC_PASSWORD` | `<app_specific_pwd>` | CI env only | NO |

---

### Final Sign-Off — Wave 1 Production Release

```
Deployer: ___________________  Date: ____________

[ ] All Supabase migrations applied and verified
[ ] RLS policies tested (node isolation confirmed)
[ ] Realtime enabled on detections table
[ ] Dashboard deployed to Vercel production
[ ] Dashboard health check passing
[ ] Android APK signed, distributed, and smoke-tested on real device
[ ] iOS IPA distributed via TestFlight and smoke-tested
[ ] Test detection end-to-end: Android → Supabase → Dashboard pin visible
[ ] Test detection end-to-end: iOS → Supabase → Dashboard pin visible
[ ] No critical or high bugs open
[ ] ARTIFACT_REGISTRY updated with final artifact hashes
[ ] MEMORY.md updated: APEX-SENTINEL W1 COMPLETE
[ ] Git tag created: git tag v1.0.0-w1 && git push --tags
```

---

*Deployment checklist owner: Nico Fratila. Completed checklist archived in `docs/waves/W1/deploy-records/`.*
