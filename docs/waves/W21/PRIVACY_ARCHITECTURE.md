# W21 PRIVACY ARCHITECTURE — Operator UI Data Handling

## Scope

This document covers privacy and data protection architecture for the W21 operator
dashboard (apex-sentinel-demo, a Next.js application running on Vercel). It addresses:

1. What data the UI displays
2. What data the UI stores (client-side)
3. What data is logged by the API layer
4. GDPR Article 25 compliance (privacy by design and by default)
5. GDPR Article 32 compliance (security of processing)

The underlying data processing (track storage, retention, anonymisation) is governed by
the W19 GDPR module. This document covers the presentation layer only.

---

## Data Classification

### Data Displayed in the UI

| Data type | Personal data? | Basis for display | Retention in browser |
|-----------|---------------|-------------------|----------------------|
| Aircraft ICAO24 codes | Potentially (aircraft-operator linkable) | Public ADS-B | In-memory only, no localStorage |
| Aircraft callsigns | Potentially | Public ADS-B | In-memory only |
| Threat track coordinates | No (anonymised Cat-A by W19) | Legitimate interest (security) | In-memory only |
| NOTAM text | No | Public airspace data | In-memory only |
| Alert messages | No (no personal data in alert content) | Legitimate interest | In-memory only |
| Incident timelines | Operator IDs (if logged in) | Contract (employment) | In-memory only |
| Operator acknowledgment logs | Operator username | Contract (employment) | Not displayed in W21 |
| Sensor node locations | No (fixed infrastructure) | Legitimate interest | In-memory only |
| Weather data | No | Public data | In-memory only |

### Data the UI Does NOT Display

The following data exists in the backend but is never returned to or stored in the browser:

- Raw acoustic sensor waveforms
- Raw RF signal data
- Individual person identity linked to aircraft registration
- Operator passwords or auth tokens (beyond session cookies)
- W19 GDPR audit log entries in full (summary statistics only, shown in ComplianceDashboard)
- Supabase database row IDs for sensor readings

---

## Client-Side Storage Policy

**No persistent client-side storage is used.**

| Storage mechanism | W21 usage |
|-------------------|-----------|
| `localStorage` | PROHIBITED — no usage |
| `sessionStorage` | PROHIBITED — no usage |
| IndexedDB | PROHIBITED — no usage |
| Service Worker cache | PROHIBITED — no usage |
| Cookies (set by W21) | None — session cookie is set by login, read-only to W21 |
| Browser memory | Allowed — React state, cleared on page close or refresh |

The rationale: the operator dashboard displays security-sensitive data (threat
classifications, zone locations, sensor configurations). Persisting this data in browser
storage creates a risk that a shared workstation leaks data to the next user.

Implementation in Next.js:
- No `localStorage.setItem` calls anywhere in W21 components or hooks
- No service worker registration
- `next.config.ts` does not configure any SW or cache strategies
- ESLint rule added: `no-restricted-globals` for `localStorage`, `sessionStorage`

---

## Server-Side Data Minimisation

### API Route Responses

W21 API routes apply data minimisation before returning responses to the browser:

1. **GET /api/aircraft** — The raw W18 AircraftPositionAggregator response includes
   owner/operator data from ICAO database lookup. W21 API route strips this before
   returning. The browser receives only: ICAO24, callsign, position, speed, altitude,
   threat score, category.

2. **GET /api/alerts** — Operator acknowledgment history includes operator system IDs.
   W21 returns `acknowledgedByOperator` as a display name (first name + role), never
   system username or email.

3. **GET /api/incidents** — Full incident includes raw sensor data references. W21 returns
   only: timeline entries, alert IDs, zone IDs, escalation chain. No raw sensor readings.

4. **GET /api/stream** — SSE events never include raw sensor payloads. Aircraft updates
   include only: ICAO24, position, threat score. All upstream correlation details are
   processed server-side and the result is what the UI receives.

### Anonymised Cat-A Tracks

Per W19 GDPR design: Category A (Commercial UAS) tracks are anonymised after 2 hours
(track ID replaced with a hash, coordinates rounded to 100m grid). The W21 dashboard
displays anonymised tracks with an indicator:

```
[TRACK-ANON-7f3a]  Commercial UAS  Confidence: 71%  [ANONYMISED]
```

The `[ANONYMISED]` badge is rendered in amber. Operators are trained that anonymised
tracks cannot be used in enforcement proceedings without re-identification through the
W19 re-identification process (which requires AACR authorisation).

---

## GDPR Legal Basis for Each Data Category

| Data displayed | Legal basis (GDPR Art.6) |
|---------------|-------------------------|
| Aircraft position data | Art.6(1)(e) — public task (airspace safety) |
| Threat track data | Art.6(1)(f) — legitimate interest (facility protection) |
| NOTAM data | Art.6(1)(e) — public task |
| Operator acknowledgment actions | Art.6(1)(b) — contract (employment) |
| Sensor node locations | Art.6(1)(f) — legitimate interest |

No special category data (GDPR Art.9) is processed or displayed by W21.

---

## GDPR Article 32 Technical Security Measures

### Transport Security

- All traffic is HTTPS (Vercel enforces TLS 1.3 minimum)
- SSE stream is over HTTPS
- HTTP Strict Transport Security (HSTS) header: max-age=31536000; includeSubDomains
- Content Security Policy (CSP) header is set in `next.config.ts`

### CSP Policy

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{nonce}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.tile.openstreetmap.org;
  connect-src 'self' https://opensky-network.org https://adsbexchange.com;
  font-src 'self' https://fonts.gstatic.com;
  frame-ancestors 'none';
```

`unsafe-inline` is required for Leaflet CSS. `unsafe-eval` is not permitted.

### Authentication

The dashboard is behind the existing session auth. W21 does not weaken the auth model.
Session cookies are `HttpOnly; Secure; SameSite=Strict`.

API routes check session validity on every request. A middleware file
(`middleware.ts`) redirects unauthenticated requests to `/login`.

### Operator Audit Trail

Every `POST /api/alerts/{id}/acknowledge` request is logged server-side with:
- Session operator ID (from session cookie)
- Alert ID
- Timestamp
- IP address (hashed — not stored in plain text)
- User-Agent (stored for forensic purposes)

This log is written to the W19 GDPR audit log system, not to browser storage.

---

## Data Subject Rights

The following data subject rights are relevant to W21:

### Right to Access (Art.15)
Operators can request their own acknowledgment history. This is fulfilled by W20
AuditTrailExporter, not by W21. W21 does not implement a self-service access portal.

### Right to Erasure (Art.17)
Track data is erased per W19 retention schedule (48h raw, then anonymised or deleted).
W21 cannot delete data — it is read-only.

### Right to Object (Art.21)
Not applicable: processing is on basis of public task (Art.6(1)(e)), not consent.

---

## EU AI Act Alignment

APEX-SENTINEL's classification functions may constitute a high-risk AI system under
EU AI Act Annex III (safety components of infrastructure). W21 surfaces AI transparency
requirements (Art.13) as described in AI_PIPELINE.md.

W21 UI obligations:
- Display confidence scores alongside all AI classifications (implemented)
- Maintain human oversight capability — acknowledge/escalate controls always available (implemented)
- Never auto-resolve alerts without operator interaction (implemented — W20 enforces this, W21 surfaces it)

---

## Privacy Impact Assessment Summary

A Data Protection Impact Assessment (DPIA) is required if systematic processing of
personal data at scale is involved. W21's determination:

**DPIA required:** No — W21 displays processed outputs. The aircraft position data it
receives is publicly available via ADS-B. Personal data (operator acknowledgment records)
are processed by W20 and stored in Supabase; W21 only displays anonymised summaries.

**Re-evaluation trigger:** If W21 is extended to display individual person identity
linked to aircraft (e.g. registered owner lookup), a DPIA becomes mandatory before
deployment of that feature.

---

*Document version: W21-PRIVACY_ARCHITECTURE-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
*Data Protection Officer review: PENDING*
