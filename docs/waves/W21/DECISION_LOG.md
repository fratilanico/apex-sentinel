# W21 DECISION LOG — Production Operator UI

## AD-W21-01: Next.js App Router as Framework

**Decision:** Use Next.js 16 with App Router (already in repo) rather than switching to
Vite + React SPA.

**Context:** The apex-sentinel-demo repo already runs Next.js 16. The build is working.
Vercel deployment is configured and live. Changing the framework would require rewriting
the entire project from scratch.

**Alternatives considered:**
1. Vite + React SPA — faster dev server, simpler SSE handling. Rejected: would require
   Vercel config change, losing all existing deployment configuration, and rebuilding auth.
2. Remix — server-side rendering with co-located loaders. Rejected: no existing knowledge
   in the project; W21 is the final wave, not a time for framework exploration.

**Rationale for Next.js App Router specifically (vs Pages Router):**
- SSE responses require Response streaming, which only App Router supports natively.
- `useOptimistic` (React 19) requires the App Router render model.
- All W18-W20 integration hooks work as standard async server functions in route handlers.

**Consequence:** Leaflet requires `dynamic(() => import(...), { ssr: false })` workaround
on every map component. This is an accepted overhead.

---

## AD-W21-02: Leaflet over Mapbox

**Decision:** Use Leaflet 1.9 (already in repo) for all map rendering.

**Alternatives considered:**
1. Mapbox GL JS — vector tiles, smooth zoom, 3D terrain support. Rejected: requires paid
   API key, licence costs scale with usage, data is sent to Mapbox servers.
2. deck.gl — WebGL-based, excellent performance for thousands of points. Rejected: overkill
   for our use case (<50 aircraft, <20 zones); adds 180KB to bundle.
3. Google Maps JavaScript API — familiar to operators. Rejected: significant per-request
   cost, Google receives all map interaction data (privacy concern for a security system).
4. OpenLayers — open source, powerful. Rejected: larger API surface than Leaflet; no
   existing familiarity in the project.

**Rationale:**
- Leaflet is already in package.json (already being used for LiveMap.tsx).
- OpenStreetMap tiles are free (with attribution), no key required.
- All required layers (circles, polygons, markers, heat) are supported by Leaflet core
  plus leaflet.heat (already installed).
- For our data density (max 50 aircraft, 20 zones, 10 NOTAMs), Leaflet canvas performance
  is sufficient. WebGL is not required.

**Consequence:** Leaflet uses window/document — requires SSR guard on all map components.
Accepted; pattern is well-established in project.

---

## AD-W21-03: SSE over WebSocket for Real-Time Updates

**Decision:** Use Server-Sent Events (SSE) via `EventSource` for all real-time data push
from server to browser.

**Alternatives considered:**
1. WebSocket — bidirectional, full duplex, supported everywhere. Rejected: the operator
   dashboard only needs server → client data flow. The one bidirectional action (acknowledge)
   is a standard REST POST. WebSocket adds complexity for no benefit.
2. Polling (setInterval + fetch) — simplest approach. Rejected: 5-15 second polling
   intervals create unacceptable latency for AWNING level changes and new alerts.
3. Long polling — compromise between SSE and polling. Rejected: more complex to implement
   correctly than SSE; same latency characteristics as SSE but worse reconnect behaviour.
4. GraphQL Subscriptions (via WebSocket) — typed, schema-driven. Rejected: no GraphQL
   anywhere in the stack; introducing it for W21 creates a cross-cutting dependency.

**Rationale:**
- SSE is HTTP/1.1 compatible — no WebSocket upgrade required, no proxy issues on operator
  networks which may have strict firewall rules.
- Vercel Edge Functions support SSE (streaming `Response` with `text/event-stream`).
- Browser `EventSource` reconnects automatically.
- For Romanian airport networks (may use corporate proxies), SSE over HTTPS has better
  compatibility than WebSocket.
- The `Last-Event-ID` header enables reliable event recovery after reconnection.

**Consequence:** SSE is unidirectional. Any future bidirectional feature (e.g. operator
typing a note that is broadcast to other operators) would require WebSocket. This is
acceptable — W21 scope does not include collaborative features.

---

## AD-W21-04: Vercel Serverless for API Routes

**Decision:** Deploy all 11 API routes as Vercel Serverless Functions (Node.js 20 runtime),
except the SSE endpoint which uses Vercel Edge Runtime.

**Alternatives considered:**
1. Separate Express.js backend — decouple API from Next.js. Rejected: introduces a second
   deployment and a second service to operate. The operator dashboard is a read-heavy UI;
   Vercel serverless is appropriate.
2. Vercel Edge for all routes — faster cold start, lower latency. Rejected: W18-W20 engines
   use Node.js-specific APIs (node:crypto, node:events). Edge runtime is a subset of Node.js
   and does not support all Node.js built-ins.

**Rationale:**
- Next.js route handlers in `app/api/` are the simplest integration point for W18-W20
  Node.js modules.
- Vercel Serverless handles the cold start penalty via Vercel's Instance Warmup.
- The SSE endpoint must be Edge to support streaming response flushing.

**Cold start mitigation:**
- /api/zones and /api/weather use `next: { revalidate: 60 }` cache (ISR pattern)
  to avoid cold-starting on every request.

---

## AD-W21-05: No New npm Dependencies

**Decision:** W21 introduces no new production npm packages. All required functionality
is achievable with the existing dependency set (Next.js, React, Leaflet, Recharts,
Framer Motion, Tailwind, Lucide) plus devDependencies (Vitest, RTL, MSW).

**Alternatives considered:**
1. `react-query` / `@tanstack/query` — managed server state with caching, refetching, SSE
   support. Rejected: the SSE reducer pattern is simpler for our specific use case and adds
   zero bundle weight.
2. `react-map-gl` — React wrapper for Mapbox GL. Rejected per AD-W21-02 (Leaflet decision).
3. `jspdf` — PDF generation for incident export. Deferred: PDF export (FR-W21-03's
   export button) in W21 generates a formatted HTML print view using `window.print()`.
   Full PDF generation with jspdf is a W22+ enhancement.
4. `date-fns` / `dayjs` — date formatting. Rejected: all date formatting in W21 is simple
   enough to implement with vanilla JS `Intl.DateTimeFormat`. Not worth adding a dependency.

**Rationale:**
- Zero new dependencies = zero supply chain risk
- Bundle size stays the same as current demo (already fast on Vercel edge CDN)
- Deployment does not require any npm install changes on Vercel side

---

## AD-W21-06: No External State Library (No Zustand/Redux)

**Decision:** Use React's built-in `useReducer` + `useContext` for dashboard state.

**Alternatives considered:**
1. Zustand — lightweight, zero-boilerplate global state. Considered: would be acceptable.
   Rejected for consistency: W21 is a UI wave on top of a backend-heavy project. Adding
   Zustand sets a precedent that future waves need to follow.
2. Redux Toolkit — enterprise-grade state management. Rejected: massive overkill for a
   single-page dashboard with 8 components.
3. Jotai — atomic state model. Rejected: no existing familiarity in project.

**Rationale:**
- `useReducer` with typed action union is sufficient for the DashboardState shape defined
  in DATABASE_SCHEMA.md.
- Context passes state to all components without prop drilling.
- No new dependency.
- The SSE reducer pattern maps naturally to `useReducer` — each SSE event type maps to a
  dispatch action type.

---

## AD-W21-07: Happy-DOM over JSDOM for Tests

**Decision:** Use `happy-dom` as the Vitest test environment (not `jsdom`).

**Rationale:**
- Leaflet v1.9 accesses `window.devicePixelRatio` and `document.createElement('canvas')`.
  JSDOM does not implement the Canvas API. happy-dom has better Canvas stubbing.
- Happy-DOM runs ~3x faster than JSDOM in benchmarks for DOM manipulation tests.
- Vitest documentation recommends happy-dom for most browser-simulating tests.

**Consequence:** Any test that relies on JSDOM-specific quirks (rare) may need adjustment.
None identified in W21 test suite.

---

## AD-W21-08: human-readable Drone Category Labels (Not Internal Codes)

**Decision:** Display drone categories using human-readable operator labels, not internal
codes (Cat-A through Cat-D), not weapon system names.

**Label mapping:**
- Cat-A → "Commercial UAS" (DJI-class, registered, likely operator error)
- Cat-B → "Modified UAS" (custom-built or modified commercial, higher capability concern)
- Cat-C → "Surveillance UAS" (purpose-built, likely deliberate incursion)
- Cat-D → "Unknown Contact" (insufficient data to classify)

**Rationale:**
1. Ukraine-war specific weapon names (Shahed, Lancet) are inappropriate for EU civilian
   airspace protection. They imply military threat context not present in Romanian civilian ops.
2. Internal codes (Cat-A) are meaningless to airport security officers.
3. The "Commercial UAS / Modified UAS / Surveillance UAS / Unknown Contact" vocabulary
   aligns with EASA's UAS category framework (C0-C6) terminology style.
4. "Unknown Contact" is borrowed from maritime and aviation radar terminology — operators
   understand it immediately without training.

---

## AD-W21-09: window.print() for PDF Export (Not jspdf)

**Decision:** Implement incident export as a browser print view, not a full PDF library.

**Rationale:**
- `window.print()` with a print-specific CSS stylesheet produces professional-quality output.
- No jspdf dependency (200KB+ bundle addition).
- Print layout can use the same React component tree as the incident detail — no duplication.
- Modern browsers support "Save as PDF" natively from the print dialog.

**Limitation:** The operator must click "Save as PDF" in the browser print dialog. There
is no "direct download as .pdf" without a library. This is acceptable for W21. If direct
download is required, jspdf can be added in a post-W21 patch.

---

*Document version: W21-DECISION_LOG-v1.0*
*Status: APPROVED*
