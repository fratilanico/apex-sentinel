# APEX-SENTINEL W4 — NETWORK TOPOLOGY
## W4 | PROJECTAPEX Doc (supplementary) | 2026-03-24

> Wave: W4 — C2 Dashboard
> This document maps the complete network topology, connection types, ports,
> CORS/CSP configuration, and bandwidth estimates for the W4 C2 Dashboard.

---

## 1. Full Network Topology Diagram

```
  OPERATOR WORKSTATION                VERCEL CDN (lhr1)
  ──────────────────                  ─────────────────
  Browser (Chrome/Firefox)
       │
       │  HTTPS/443 (TLS 1.3)
       │  TCP keep-alive
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Vercel Edge Network (lhr1 — London)                           │
  │                                                                │
  │  ┌────────────────────────────────────────────────────────┐   │
  │  │  Next.js Middleware (Edge Runtime — V8 isolate)        │   │
  │  │  • Supabase JWT verification                           │   │
  │  │  • RBAC route enforcement                              │   │
  │  │  • IP allowlist check (optional)                       │   │
  │  │  Latency: ~10ms per request                            │   │
  │  └────────────────────────────────────────────────────────┘   │
  │                                                                │
  │  ┌────────────────────────────────────────────────────────┐   │
  │  │  Next.js App (Node.js 20.x)                            │   │
  │  │  • Server Components (RSC) for layout + auth pages     │   │
  │  │  • Client Components (CesiumGlobe, stores) via CSR     │   │
  │  │  • Static assets: CesiumJS (~15MB), app JS (~2MB)      │   │
  │  │  • Cache-Control: public,max-age=31536000 (static)     │   │
  │  └────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────┘
         │                        │                      │
         │                        │                      │
         ▼                        ▼                      ▼
  ┌──────────────┐      ┌──────────────────┐    ┌──────────────────┐
  │  SUPABASE    │      │  NATS.WS PROXY   │    │  CESIUM ION /    │
  │  eu-west-2   │      │  nats.apex-      │    │  OSM TILES CDN   │
  │  London      │      │  sentinel.io     │    │                  │
  │              │      │  Port 443        │    │  assets.cesium   │
  │  ┌─────────┐ │      │  (nginx)         │    │  .com            │
  │  │Realtime │ │      │       │           │    │  OR              │
  │  │WebSocket│ │      │       │ TCP       │    │  tile.osm.org    │
  │  │wss://   │ │      │       ▼           │    │  HTTPS/443       │
  │  │bymf...  │ │      │  ┌──────────┐    │    └──────────────────┘
  │  │.supabase│ │      │  │  NATS    │    │
  │  │.co:443  │ │      │  │  Cluster │    │
  │  └─────────┘ │      │  │  (W2)    │    │
  │              │      │  │  TCP 4222│    │
  │  ┌─────────┐ │      │  └──────────┘    │
  │  │Auth     │ │      └──────────────────┘
  │  │WebSocket│ │
  │  │/auth/v1 │ │
  │  └─────────┘ │
  │              │
  │  ┌─────────┐ │
  │  │PostgREST│ │
  │  │HTTPS    │ │
  │  │/rest/v1 │ │
  │  └─────────┘ │
  │              │
  │  ┌─────────┐ │
  │  │Edge Fn  │ │
  │  │HTTPS    │ │
  │  │/fns/v1/ │ │
  │  └─────────┘ │
  └──────────────┘
```

---

## 2. Browser-to-Server Connection Summary

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  ALL BROWSER CONNECTIONS FROM C2 DASHBOARD                                    │
│                                                                                │
│  Connection  Protocol  Host                              Port  Type            │
│  ─────────── ──────── ──────────────────────────────── ───── ──────────────── │
│  1. App shell HTTPS   dashboard.apex-sentinel.io         443  HTTP/2, CDN      │
│  2. Realtime  WSS     bymfcnwfyxuivinuzurr.supabase.co   443  WebSocket, perm  │
│  3. Auth      HTTPS   bymfcnwfyxuivinuzurr.supabase.co   443  HTTP/2           │
│  4. REST API  HTTPS   bymfcnwfyxuivinuzurr.supabase.co   443  HTTP/2           │
│  5. Edge Fns  HTTPS   bymfcnwfyxuivinuzurr.supabase.co   443  HTTP/2           │
│  6. NATS.ws   WSS     nats.apex-sentinel.io               443  WebSocket, perm  │
│  7. Tiles     HTTPS   assets.cesium.com (Ion)             443  HTTP/2, CDN      │
│               OR                                                               │
│               HTTPS   tile.openstreetmap.org (fallback)   443  HTTP/2, CDN     │
│  8. Sentry    HTTPS   o{N}.ingest.sentry.io               443  HTTP/2           │
│                                                                                │
│  Persistent connections: [2] Supabase Realtime, [6] NATS.ws                   │
│  All connections: TLS 1.3 minimum, certificate pinning NOT used                │
│  (certificate pinning would break Vercel/Supabase cert rotation)               │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Port Reference

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  PORTS IN USE                                                                  │
│                                                                                │
│  Browser-facing (all 443 — TLS required):                                     │
│    443  dashboard.apex-sentinel.io     → Vercel CDN (Next.js app)              │
│    443  *.supabase.co                  → Supabase (Realtime + REST + Auth)     │
│    443  nats.apex-sentinel.io          → NATS.ws proxy (nginx WebSocket)        │
│    443  assets.cesium.com             → Cesium Ion CDN                         │
│    443  tile.openstreetmap.org         → OSM tiles fallback                    │
│    443  *.ingest.sentry.io             → Sentry error reporting                │
│                                                                                │
│  Server-side (not browser-facing):                                             │
│    4222  NATS TCP                       internal — proxy to NATS cluster       │
│    5432  PostgreSQL                     internal — Supabase managed            │
│    6543  PostgreSQL Supabase Pooler     internal — pgBouncer                   │
│    8080  Supabase Auth internal API     internal                               │
│    9000  Supabase Kong API gateway      internal                               │
│                                                                                │
│  Dev-only (not in production):                                                 │
│    3000  Next.js dev server             localhost                              │
│    54321 Supabase CLI local dev         localhost                              │
│    54322 Supabase PostgreSQL local      localhost                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. CORS Configuration

### 4.1 Supabase Edge Functions CORS
```typescript
// Applied to ALL W4 Edge Functions (export-cot, get-track-history,
// get-coverage-stats, get-node-status-batch)

const ALLOWED_ORIGINS = [
  'https://dashboard.apex-sentinel.io',
  // Dev: add 'http://localhost:3000' via ALLOWED_ORIGINS env var
  ...(Deno.env.get('ALLOWED_ORIGINS')?.split(',') ?? []),
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// OPTIONS preflight handler (required for all Edge Functions)
if (req.method === 'OPTIONS') {
  return new Response('ok', {
    status: 200,
    headers: getCorsHeaders(req.headers.get('Origin')),
  });
}
```

### 4.2 Supabase Realtime CORS
```
Supabase Realtime does not use standard HTTP CORS.
WebSocket connection uses subprotocol authentication via apikey query parameter.
The anon key is passed as a query param on the WebSocket URL.
Supabase validates the origin on the server side (not browser CORS check).

WebSocket URL format:
  wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket
    ?apikey=<anon_key>
    &vsn=1.0.0

No CORS preflight for WebSocket (WebSocket upgrade is not subject to CORS).
```

### 4.3 NATS.ws Proxy CORS
```nginx
# NATS.ws proxy nginx config
# WebSocket connections are not subject to CORS preflight.
# Origin validation is handled by NATS NKey authentication.

server {
  listen 443 ssl http2;
  server_name nats.apex-sentinel.io;

  ssl_certificate     /etc/ssl/nats.apex-sentinel.io/fullchain.pem;
  ssl_certificate_key /etc/ssl/nats.apex-sentinel.io/privkey.pem;
  ssl_protocols       TLSv1.3 TLSv1.2;
  ssl_ciphers         HIGH:!aNULL:!MD5;

  location / {
    proxy_pass         http://127.0.0.1:4222;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
    # NATS WebSocket keepalive: proxy_read_timeout must be > NATS pingInterval
    # NATS dashboard client: pingInterval=30s → proxy_read_timeout=90s (3× buffer)
  }
}
```

---

## 5. Content Security Policy (CSP)

```
CesiumJS requires several unusual CSP directives:
  - blob: in script-src and worker-src (WebWorker scripts loaded as blob URLs)
  - unsafe-eval in script-src (CesiumJS compiles GLSL shaders with eval)
  - blob: in img-src (terrain textures decoded as blob URLs)

Full CSP header (set in vercel.json for all routes):

Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cesium.com;
  worker-src blob:;
  connect-src 'self'
    wss://bymfcnwfyxuivinuzurr.supabase.co
    https://bymfcnwfyxuivinuzurr.supabase.co
    wss://nats.apex-sentinel.io:443
    https://*.cesium.com
    https://tile.openstreetmap.org
    https://events.mapbox.com
    https://api.mapbox.com
    https://*.ingest.sentry.io;
  img-src 'self' data: blob:
    https://*.cesium.com
    https://api.mapbox.com
    https://*.mapbox.com
    https://tile.openstreetmap.org;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self' https://bymfcnwfyxuivinuzurr.supabase.co;

NOTES:
  - unsafe-eval is REQUIRED for CesiumJS (GLSL shader compilation).
    Cannot be eliminated without rewriting CesiumJS internals.
    This is a known CesiumJS limitation — documented in their FAQ.
  - unsafe-inline in script-src: required for Next.js inline scripts
    (nonce-based CSP would be more secure — W5 enhancement if needed).
  - frame-ancestors 'none': prevents clickjacking (dashboard must not be embedded in iframes).
  - All CSP violations are logged to Sentry (report-uri omitted for brevity — add via Sentry CSP integration).
```

---

## 6. Security Headers

```
All responses include:

Header                          Value                           Purpose
─────────────────────────────── ─────────────────────────────── ─────────────────────────────
Strict-Transport-Security       max-age=31536000;               Force HTTPS 1 year
                                includeSubDomains; preload
X-Frame-Options                 DENY                            Prevent iframe embedding
X-Content-Type-Options          nosniff                         Prevent MIME sniffing
Referrer-Policy                 strict-origin-when-cross-origin Limit Referer header
Permissions-Policy              camera=(), microphone=(),       Restrict browser APIs
                                geolocation=()
Content-Security-Policy         (see Section 5 above)           XSS / injection protection
Cache-Control (sensitive pages) no-store, no-cache, private     Prevent sensitive data caching
Cache-Control (static assets)   public, max-age=31536000,       Aggressive static caching
                                immutable

NOTE: Cache-Control: no-store on /dashboard, /tracks, /nodes, /alerts, /analytics.
      Static assets (CesiumJS bundles, CSS, fonts): public, max-age=31536000.
```

---

## 7. TLS Configuration

```
Vercel TLS:
  Certificate:  Managed by Vercel (Let's Encrypt)
  Protocol:     TLS 1.3 (preferred), TLS 1.2 (fallback)
  Cipher:       ECDHE-RSA-AES256-GCM-SHA384 preferred
  HSTS:         31536000s + preload (Section 6)
  Renew:        Automatic (Vercel handles)

Supabase TLS:
  Certificate:  AWS Certificate Manager (ACM)
  Protocol:     TLS 1.3
  WebSocket:    wss:// (TLS required — Supabase does not serve ws://)

NATS.ws Proxy TLS:
  Certificate:  Let's Encrypt (Certbot auto-renew, 90-day cycle)
  Protocol:     TLS 1.3 + TLS 1.2
  Renewal:      Certbot cron: 0 0 1 * * certbot renew (monthly check)
  Alert:        Certificate expiry alert set 14 days before expiry
```

---

## 8. Bandwidth Estimates

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  BANDWIDTH BUDGET PER OPERATOR SESSION (1 hour)                               │
│                                                                                │
│  Connection          Rate           1hr Volume  Notes                          │
│  ─────────────────── ────────────── ─────────── ─────────────────────────────  │
│  Initial page load   ~5MB           5MB (once)  CesiumJS bundle deferred      │
│  CesiumJS deferred   ~15MB          15MB (once) Workers + Assets initial load  │
│  Supabase Realtime   ~5 KB/s        18 MB       50 track updates/s × 100B ea  │
│  NATS.ws alerts      ~2 KB/s        7.2 MB      20 alert msgs/s × 100B ea     │
│  Terrain tiles       ~100 KB/min    6 MB        New tiles as operator pans    │
│  OpenMCT historical  ~500 KB/load   1-2 MB      On /analytics page visit      │
│  REST API polling    ~10 KB/30s     1.2 MB      Node status + coverage stats  │
│  Sentry              ~1 KB/error    ~0 MB       Only on errors (negligible)   │
│                                                 ─────────────                  │
│  TOTAL (1hr session):                           ~55 MB                         │
│                                                                                │
│  At 10 concurrent operators:                    ~550 MB/hr                     │
│  Monthly (10 ops × 8hr/day × 22 workdays):      ~968 GB/month                 │
│                                                                                │
│  Vercel Pro: 1TB bandwidth included. Sufficient for ≤10 operators/day.        │
│  Vercel Enterprise needed if >10 operators for full 8hr shifts.               │
│                                                                                │
│  Supabase Realtime bandwidth: included in Pro plan (no separate billing).     │
│  NATS.ws bandwidth: served from APEX-SENTINEL W2 VM (Azure egress costs).     │
│  Azure egress (W2 VM to internet): 5GB free, $0.087/GB after.                 │
│  Monthly NATS.ws egress: ~968GB × (7.2/55) ≈ 127GB. Cost: ~$10.6/month.      │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Network Failure Modes and Recovery

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  FAILURE MODE MATRIX                                                           │
│                                                                                │
│  Failure               User-visible Impact    Dashboard Behavior              │
│  ───────────────────── ─────────────────────── ─────────────────────────────  │
│  Supabase Realtime     Track data stops        Status badge → "Disconnected"   │
│  connection drop       updating                Auto-reconnect + full refresh    │
│                                                Tracks in store remain (stale   │
│                                                badge after 30s)                │
│                                                                                │
│  NATS.ws disconnect    No new alerts           AlertBanner shows "NATS:        │
│                                                Disconnected" in header          │
│                                                Auto-reconnect (nats.ws config) │
│                                                No alert data loss (NATS stores │
│                                                in JetStream — replayed on      │
│                                                reconnect if consumer durable)  │
│                                                                                │
│  Supabase PostgREST    Node list stale         NodeStore shows last-known      │
│  timeout               (30s polling missed)    nodes. Next poll auto-retries.  │
│                                                No user action needed.          │
│                                                                                │
│  Edge Function 5xx     Coverage stats blank    Error badge on stats section    │
│  (get-coverage-stats)                          TrackStore-derived stats OK     │
│                                                (active track count still live) │
│                                                                                │
│  Cesium Ion rate limit Terrain/imagery blank   Fallback to WGS84 ellipsoid +  │
│                        (black tiles)           OSM imagery automatically       │
│                                                Tracks still visible            │
│                                                                                │
│  Vercel CDN outage     Dashboard inaccessible  No recovery possible from       │
│                                                browser. Vercel SLA: 99.99%.   │
│                                                Status: https://vercel.com/     │
│                                                        status                  │
│                                                                                │
│  Supabase auth outage  Login impossible        "Service unavailable" on        │
│                        Existing sessions OK    /login page. Sessions not       │
│                        (JWT is valid until     affected (JWT local).           │
│                        expiry)                 Status: https://status.         │
│                                                supabase.com                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Next.js Middleware Network Decisions

```
Middleware runs in Vercel Edge Runtime (V8 isolate, <1ms cold start).

Decision flow for each request:
  1. Is request path in PROTECTED_PATHS? → Yes: check auth. No: skip.
  2. Is sb-auth-token cookie present? → No: redirect /login.
  3. Verify JWT (createMiddlewareClient + getSession).
  4. JWT valid? → No: redirect /login (session expired).
  5. Extract user.user_metadata.role.
  6. Is path in ROLE_RESTRICTED_PATHS? → Check role.
  7. Role insufficient? → Redirect /dashboard (not /login — user is authenticated).
  8. IP allowlist enabled (ALLOWED_IP_CIDRS env set)?
     → Check client IP (x-forwarded-for header, first IP).
     → Not in allowlist? → 403 Forbidden (no redirect).
  9. Pass through.

Total middleware latency target: <15ms.
JWT verification: Supabase JWT is RS256. Middleware verifies locally using Supabase
public key (fetched once and cached in Vercel edge — no round-trip to Supabase per request).
```

---

## 11. DNS and CDN Configuration

```
domain:         apex-sentinel.io (registrar: Cloudflare DNS)
subdomains:
  dashboard     CNAME → cname.vercel-dns.com      (C2 Dashboard)
  nats          A     → <NATS proxy VM IP>         (NATS.ws proxy)
  api           CNAME → bymfcnwfyxuivinuzurr.supabase.co (alias for docs — not used in code)

Cloudflare DNS settings:
  dashboard:    Proxy: OFF (orange cloud OFF — must be DNS-only for Vercel)
                TTL: 300s
  nats:         Proxy: OFF (WebSocket traffic requires direct TCP — no Cloudflare proxy)
                TTL: 300s

Vercel domain verification:
  TXT record: _vercel.apex-sentinel.io → <Vercel verification value>

Certificate issuance:
  dashboard.apex-sentinel.io: Vercel-managed Let's Encrypt (auto-renew)
  nats.apex-sentinel.io:       Certbot on nginx VM (auto-renew, cron)
```
