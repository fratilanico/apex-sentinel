# W21 LKGC TEMPLATE — Last Known Good Configuration

## Purpose

This document captures the Last Known Good Configuration for W21. It is updated when
the wave reaches a stable GREEN state and before any breaking changes are made.

---

## LKGC-W21-001: Post-Init (Docs Complete, Tests Not Written)

**Date:** 2026-03-27
**Git commit:** TBD (will be set when TDD RED commit is made)
**Status:** PLANNED

```
State: W21 docs written, implementation not started
All 20 PROJECTAPEX docs present in docs/waves/W21/
No test files created yet
No component files created yet
```

---

## LKGC-W21-002: TDD RED (Tests Written, All Failing)

**Date:** TBD
**Git commit:** TBD
**Status:** PLANNED

```
State: All 71 test files written, all tests FAILING (expected at RED phase)
  - 24 test/mock files created
  - 0 component or API route implementations
  - Tests describe expected behaviour, not implemented behaviour
Verification: npx vitest run → 71 failures (0 passes)
```

**To restore this state:**
```bash
git checkout [commit-hash]
cd /Users/nico/projects/apex-sentinel-demo
npm install
npx vitest run
# Expected: 71 failures
```

---

## LKGC-W21-003: API Routes GREEN (Backend Layer Complete)

**Date:** TBD
**Git commit:** TBD
**Status:** PLANNED

```
State: All 11 API routes implemented and passing their tests
  - 13 API route tests pass
  - Component tests still RED (components not yet built)
  - TypeScript: 0 errors in api/ directory
Verification: npx vitest run --reporter=verbose | grep api
```

This is the first stable checkpoint after the API-first build order.

---

## LKGC-W21-004: Component Layer GREEN (All 71 Tests Pass)

**Date:** TBD
**Git commit:** TBD
**Status:** PLANNED

```
State: All 71 tests GREEN
  npx vitest run --coverage
  → 71/71 pass
  → Branch ≥80%
  → Function ≥80%
  → Line ≥80%
  → Statement ≥80%

  npx tsc --noEmit → 0 errors
  npm run build → succeeds

Vercel preview URL: TBD
```

**Full restoration procedure:**
```bash
git checkout [commit-hash]
cd /Users/nico/projects/apex-sentinel-demo
npm install
npx vitest run --coverage   # should be 71/71 GREEN
npx tsc --noEmit            # should be 0 errors
npm run build               # should succeed
```

---

## LKGC-W21-005: Production Deployed (Final Stable State)

**Date:** TBD
**Vercel Deployment ID:** TBD
**Git commit:** TBD
**Status:** PLANNED

```
State: W21 deployed to production Vercel URL
  All smoke tests pass (see DEPLOY_CHECKLIST.md section 6)
  WCAG 2.1 AA: 0 violations
  Real data flowing: zones, aircraft, alerts, NOTAMs, weather
  No simulation content present
  All environment variables set in Vercel

Production URL: https://apex-sentinel-demo.vercel.app
```

---

## Configuration Snapshot (to be filled at LKGC-W21-005)

### Dependency Versions (package.json)

```json
{
  "dependencies": {
    "clsx": "TBD",
    "framer-motion": "TBD",
    "leaflet": "TBD",
    "leaflet.heat": "TBD",
    "lucide-react": "TBD",
    "next": "TBD",
    "react": "TBD",
    "react-dom": "TBD",
    "recharts": "TBD"
  },
  "devDependencies": {
    "@testing-library/react": "TBD",
    "@testing-library/user-event": "TBD",
    "@testing-library/jest-dom": "TBD",
    "@vitest/coverage-v8": "TBD",
    "happy-dom": "TBD",
    "msw": "TBD",
    "vitest": "TBD",
    "vitest-axe": "TBD"
  }
}
```

### Environment Variables Active in Vercel (keys only — no values)

```
ADSBX_API_KEY
OPENWEATHER_API_KEY
NOTAM_API_TOKEN
ACLED_API_KEY
APEX_SENTINEL_API_URL
SESSION_SECRET
NEXT_PUBLIC_APP_ENV
NEXT_PUBLIC_MAP_CENTER_LAT
NEXT_PUBLIC_MAP_CENTER_LNG
NEXT_PUBLIC_MAP_ZOOM
```

### Node.js Runtime

```
Node version: 20.x
Vercel runtime: nodejs20.x
Edge runtime: (Vercel latest) for /api/stream
Region: fra1 (Frankfurt)
```

---

## Rollback Procedure

To roll back from any LKGC to the previous one:

```bash
git log --oneline docs/waves/W21/LKGC_TEMPLATE.md  # find LKGC commits
git checkout [LKGC-commit-hash] -- .               # restore files
```

For Vercel rollback: use the Vercel Dashboard → Deployments → Promote to Production on
the previous deployment (no code changes required).

---

## Known Limitations at W21 Final

The following known limitations exist at W21 completion. They are documented here for
the operations team and future wave engineers:

1. **No direct ROMATSA feed** — aircraft data is from OpenSky (30-second delay). Real-time
   aircraft data requires ROMATSA bilateral agreement (post-W21).

2. **PDF export is browser print** — clicking [EXPORT PDF] opens browser print dialog.
   Direct PDF download requires jspdf (deferred to post-W21 patch).

3. **No offline mode** — dashboard requires internet connection. Airport operations
   rooms are assumed to have stable connectivity.

4. **Single organisation** — no multi-tenant support. All operators see all zones.
   Per-organisation access control is W24.

5. **16kHz acoustic pipeline not fixed** — W17 fix deferred post-hackathon. The 22050Hz
   vs 16kHz mismatch noted by INDIGO team exists in the backend but does not affect the W21
   UI layer. UI correctly displays whatever classifications the backend provides.

6. **window.print() print CSS** — The incident PDF print stylesheet needs testing on
   Windows Chrome and Edge (the primary operator browser targets). Mac Safari print output
   may differ.

---

*Document version: W21-LKGC_TEMPLATE-v1.0*
*Last updated: 2026-03-27*
