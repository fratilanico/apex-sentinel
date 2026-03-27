# APEX-SENTINEL W19 — DEPLOY CHECKLIST

## Theme: Romania/EU Threat Intelligence Layer

---

## Pre-Deploy Summary

W19 requires **one new environment variable** (`APEX_DEPLOY_SECRET`) and zero new API keys. All data sources are provided by W18's already-configured feeds.

---

## Environment Variables

### New in W19

| Variable | Required | Format | Purpose | Where to Set |
|----------|----------|--------|---------|-------------|
| `APEX_DEPLOY_SECRET` | YES | 32+ char random string | HMAC-SHA256 key for track pseudonymisation (GdprTrackAnonymiser) | `.env`, `.env.test`, systemd unit file |

**Generating a secure value:**
```bash
# Generate 32-byte random secret (base64 encoded)
openssl rand -base64 32
# Example output: 7K3mQj5+LvRbNxPqWzYdHcFuT8sAoI2eJgM6kE9hDlU=
```

**Security requirements:**
- Must be at least 32 characters (256-bit equivalent)
- Must be different per deployment (dev, staging, production)
- Must never be committed to git
- Rotation: if secret is compromised, all existing pseudonymised IDs become stale (new IDs generated on next track); this is acceptable — old anonymised data remains anonymised

### Inherited from W9/W18 (no changes needed)

| Variable | Required | Default | Inherited From |
|----------|----------|---------|----------------|
| `NATS_URL` | YES | `nats://localhost:4222` | W9 live data feed setup |
| `NOTAM_EAD_API_KEY` | For live NOTAM | — | W18 DEPLOY_CHECKLIST |
| `ADSBEXCHANGE_API_KEY` | For ADS-B Exchange | — | W18 DEPLOY_CHECKLIST |
| `OWM_API_KEY` | For OpenWeatherMap | — | W18 DEPLOY_CHECKLIST |

---

## Pre-Deploy Tests

### Gate 1: Unit Tests

```bash
# From repo root
npx vitest run tests/intel/
```

Expected: **98/98 GREEN**. No tests may be skipped.

### Gate 2: Full Suite Regression Check

```bash
npx vitest run
```

Expected: **3195+ tests GREEN** (W1–W19, no regressions). Any RED test in a pre-W19 file is a blocker.

### Gate 3: TypeScript Strict Mode

```bash
npx tsc --noEmit
```

Expected: **0 errors**. W19 must not introduce TypeScript errors in any file (including W1–W18 types).

### Gate 4: Coverage Gate

```bash
npx vitest run --coverage
```

Expected: All four metrics ≥ 80% for `src/intel/`:
- Branches: ≥ 80%
- Functions: ≥ 80%
- Lines: ≥ 80%
- Statements: ≥ 80%

### Gate 5: Build

```bash
npm run build
```

Expected: **0 errors, 0 warnings** (treat warnings as errors in CI).

---

## Deployment Steps

### Step 1: Set Environment Variable

```bash
# On edge node (e.g. fortress VM or Raspberry Pi deployment)
echo "APEX_DEPLOY_SECRET=$(openssl rand -base64 32)" >> /etc/apex-sentinel.env

# Verify it's set
grep APEX_DEPLOY_SECRET /etc/apex-sentinel.env
```

### Step 2: Update Systemd Service (if applicable)

Add `APEX_DEPLOY_SECRET` to the systemd unit EnvironmentFile:

```ini
[Service]
EnvironmentFile=/etc/apex-sentinel.env
ExecStart=/usr/bin/node /opt/apex-sentinel/dist/w19-threat-intel-pipeline.js
Restart=on-failure
RestartSec=5
```

```bash
systemctl daemon-reload
systemctl restart apex-sentinel-w19
```

### Step 3: Verify NATS Connectivity

```bash
# Verify W19 can subscribe to W18 output
nats sub sentinel.feeds.eu_picture --count=1
# Should receive an EuSituationalPicture JSON within 10s of W18 running
```

### Step 4: Verify Pipeline Start

```bash
# Check W19 pipeline is receiving pictures and emitting events
nats sub "sentinel.intel.>" --count=5
# Should receive breach_detected, awning_change, picture_update events
```

### Step 5: Verify AWNING Levels

After W19 starts, all zones should initially emit GREEN (no aircraft yet):

```bash
nats sub sentinel.intel.awning_change --count=8
# Expect 8 messages: one GREEN for each of the 8 canonical protected zones
```

---

## Rollback Plan

W19 is a purely additive layer. W18 continues to run independently. If W19 has a critical bug:

1. Stop W19 pipeline: `systemctl stop apex-sentinel-w19`
2. W18 feeds continue; W10 AWNING engine falls back to its own detection
3. No data loss (W19 is in-memory; no Supabase writes to undo)
4. Fix the bug, redeploy, restart

---

## No New API Keys Required

| Feed | API Key | Status |
|------|---------|--------|
| OpenSky Network | None (anonymous) | W18 already configured |
| ADS-B Exchange | ADSBEXCHANGE_API_KEY | W18 already configured |
| EAD NOTAM | NOTAM_EAD_API_KEY | W18 already configured |
| EASA drone.rules.eu | None (public API) | W18 already configured |
| OpenStreetMap Overpass | None (public) | W18 already configured |
| open-meteo | None (public) | W18 already configured |
| OpenWeatherMap | OWM_API_KEY | W18 already configured |
| ACLED | ACLED_EMAIL, ACLED_API_KEY | W18 already configured |

---

## Post-Deploy Verification

### Smoke Test

After deployment on any node, run the following manual check:

```bash
# Inject a test aircraft near LROP (should trigger breach)
# Position: 44.580°N, 26.085°E — 1km from LROP centre, inside 5km exclusion
# Expected: ZoneBreach INSIDE, AWNING ORANGE or RED for airport zone

nats pub sentinel.feeds.eu_picture '{
  "aircraft": [{
    "icao24": "test01",
    "callsign": null,
    "lat": 44.580,
    "lon": 26.085,
    "altBaro": 50,
    "velocityMs": 8,
    "headingDeg": 180,
    "cooperativeContact": false,
    "category": null,
    "squawk": null,
    "source": "test"
  }],
  "protectedZones": [/* use canonical ROMANIA_PROTECTED_ZONES */],
  "atmospheric": {"flyabilityScore": 80},
  "securityEvents": [],
  "notams": [],
  "uasZones": [],
  "feedHealth": []
}'

# Watch for:
nats sub sentinel.intel.breach_detected --count=1    # Should receive ZoneBreach
nats sub sentinel.intel.awning_change --count=1      # Should receive AwningLevel change
nats sub sentinel.intel.aacr_notification --count=1  # Should receive AacrNotification
```

### Health Metrics

W16 EdgePerformanceProfiler should show:
- `w19_pipeline_latency_p50` < 200ms
- `w19_pipeline_latency_p95` < 500ms

---

## GDPR Operational Checklist

Before W19 goes live with real aircraft data:

- [ ] APEX_DEPLOY_SECRET is set and is ≥ 32 characters
- [ ] APEX_DEPLOY_SECRET is NOT in git history
- [ ] Privacy notice drafted (W20 task — must publish before production)
- [ ] DPIA pre-assessment reviewed (PRIVACY_ARCHITECTURE.md)
- [ ] ANSPDCP notification timeline noted (DPIA required before large-scale production deployment)
- [ ] `operatorConfirmationRequired=true` verified in test output for ORANGE/RED events
- [ ] 24h buffer TTL enforcement tested (AnonymisedTrack.expiresAt respected)
- [ ] Cat-D EXEMPT status verified in test output for non-cooperative aircraft
