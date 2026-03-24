# APEX-SENTINEL — Design
## W2 | PROJECTAPEX Doc 01/21 | 2026-03-24

---

## 1. Design Philosophy

APEX-SENTINEL W2 backend is designed for operators who work under stress, in low-light environments, with partial information. The backend operator interface must communicate system state at a glance and surface actionable information immediately. The system feels like a well-maintained NOC (Network Operations Centre): calm when healthy, loud when broken, silent only when explicitly silenced.

Three design principles govern everything:

**1. Trust is earned, not assumed.** Every node must prove identity (mTLS certificate) and health (heartbeat) continuously. The UI reflects this: nodes turn grey the moment heartbeats stop, not after a timeout period. Operators never wonder if a node is down; they know.

**2. Silence is a signal.** A node that stops detecting in an area where drones have previously been detected is as interesting as one that starts detecting. The design surfaces absence, not just presence.

**3. Latency is UX.** A detection event that takes 2 seconds to appear on the C2 dashboard is not a UX problem, it is a tactical failure. Every design decision is evaluated against the <100ms NATS-to-WebSocket latency target.

---

## 2. Backend Operator Experience

### 2.1 The Operator Mental Model

The backend operator (DevOps/SRE role) has three zones of concern:

```
Zone 1 — Infrastructure Health
  NATS cluster status, Raft leader, stream lag, consumer groups

Zone 2 — Node Fleet Health
  Online/offline counts, heartbeat freshness, geo distribution

Zone 3 — Data Pipeline Health
  Event ingestion rate, TDoA solver success rate, track quality
```

The operator should be able to answer these questions within 5 seconds of opening the dashboard:
- Is the NATS cluster healthy?
- How many nodes are currently online?
- Is the detection pipeline processing events?
- Are there any active alerts?

If the answer to any of these is "I need to dig deeper to know", the design has failed.

### 2.2 Operator Workflows

**Workflow A — Morning Health Check (< 2 minutes)**
```
1. Open dashboard → Status bar shows all-green or specific red indicators
2. Glance at Node Fleet map → All expected nodes show heartbeat within 60s
3. Check NATS stream metrics → Lag < 100 messages on all consumers
4. Review overnight alert log → Filter by severity HIGH+
5. Sign off
```

**Workflow B — Node Enrollment (< 2 minutes end-to-end)**
```
1. Field engineer triggers register-node API (from device)
2. Operator sees new node appear in "Pending" state on dashboard
3. Operator approves node (or auto-approval if certificate chain valid)
4. Node transitions to "Online" state
5. Heartbeats begin appearing in node-health stream
```

**Workflow C — Incident Response**
```
1. Alert fires: severity HIGH on track_id abc123
2. Operator clicks alert → sees track on map, contributing nodes highlighted
3. Operator drills to raw detection events → sees confidence scores, timestamps
4. Operator dispatches CoT XML via alert-router → acknowledged in < 500ms
5. Operator adds note to audit log
```

---

## 3. NATS Dashboard Design

### 3.1 Cluster Health Panel

The NATS dashboard uses a 5-slot visual for the cluster nodes. Each slot shows:

```
┌─────────────────────────────────────────────┐
│  NATS CLUSTER                    ● HEALTHY  │
├──────────┬──────────┬──────────┬────────────┤
│ NODE-01  │ NODE-02  │ NODE-03  │ NODE-04    │
│ LEADER   │ FOLLOWER │ FOLLOWER │ FOLLOWER   │
│ ██████   │ ██████   │ ██████   │ ██████     │
│ 12ms     │ 14ms     │ 11ms     │ 13ms       │
│ 42MB/s   │ 38MB/s   │ 40MB/s   │ 39MB/s    │
├──────────┴──────────┴──────────┴────────────┤
│ NODE-05: ██████ FOLLOWER 11ms 37MB/s        │
├─────────────────────────────────────────────┤
│ Raft Term: 142  |  Quorum: 5/5  |  Last commit: 2ms ago │
└─────────────────────────────────────────────┘
```

Stream health is shown in a table ordered by consumer lag (highest lag at top, red if > 1000):

```
STREAM                          MESSAGES    CONSUMERS   MAX LAG   STATUS
sentinel.gate3.detection.*      1,247,832   8           42        ● OK
sentinel.node.heartbeat         892,441     3           12        ● OK
sentinel.track.update           234,109     5           7         ● OK
sentinel.alert.*                1,204       2           0         ● OK
```

### 3.2 Consumer Group Panel

Each consumer group shows:
- Delivery subject
- Ack pending count (red if > 100)
- Redelivery count (orange if > 0)
- Last delivered age

### 3.3 KV Store Panel

```
KV STORE: sentinel.nodes                      847 keys
KV STORE: sentinel.config                      23 keys
Last compaction: 4h ago  |  Storage: 12.4 MB
```

---

## 4. Supabase Operations Dashboard

### 4.1 Node Fleet Table

Primary operator view. Sortable by: last_seen_at, geo_sector, tier, missed_heartbeats.

Columns: Node ID (truncated) | Tier | State Badge | Last Heartbeat | Battery | Signal | Geo Sector | Gate Level | Location (coarsened)

Filter chips: ALL / ONLINE / OFFLINE / DEGRADED / MESH-ONLY / PENDING-APPROVAL

**Quick actions per row:**
- View heartbeat history (sparkline, 24h)
- View detection events (last 100)
- Force offline (admin only)
- Revoke certificate (admin only)

### 4.2 Event Stream Panel

Live WebSocket subscription to `detection_events`. Shows:
- Sliding 60-second window of events
- Colour-coded by fused_confidence
- Geo-sector grouped view (toggle)
- Track linkage column (click → track detail)

### 4.3 Alert Queue Panel

```
┌─────────────────────────────────────────────────────────────┐
│ ACTIVE ALERTS                                    3 PENDING  │
├─────────┬──────────┬──────────────────┬──────────┬──────────┤
│ TIME    │ SEVERITY │ TRACK            │ LOCATION │ CHANNELS │
├─────────┼──────────┼──────────────────┼──────────┼──────────┤
│ 14:23:01│ ■ HIGH   │ TRK-A3F2         │ SW-SECTOR│ TAK, SMS │
│ 14:22:47│ ■ MEDIUM │ TRK-B119         │ NE-SECTOR│ TAK      │
│ 14:19:33│ ■ LOW    │ TRK-C004         │ N-SECTOR │ LOG      │
└─────────┴──────────┴──────────────────┴──────────┴──────────┘
```

---

## 5. Mesh Topology Visualisation

### 5.1 Mesh Graph Concept

The mesh topology view renders nodes as force-directed graph nodes with edges representing active relay links. This is not a map view (geographic accuracy not needed here); it is a connectivity view.

Node visual encoding:
```
Node size       → detection event rate (last 5 min)
Node fill       → state colour (see Section 7)
Edge thickness  → link quality (RSSI normalised 0–1)
Edge colour     → link type: solid blue = IP, dashed orange = LoRa, dotted green = BLE
Edge animation  → pulsing if messages flowing in last 30s
```

Layout algorithm: Fruchterman-Reingold force layout. Stable after ~500ms on 50-node graph.

### 5.2 Mesh Partition Detection

When the graph splits into two disconnected components, each component is drawn inside a red dashed border labelled "PARTITION". An alert is raised automatically.

### 5.3 LoRa Channel View

Secondary panel showing LoRa channel utilisation per node:
```
NODE-07 (mesh relay)
  Channel 0 (868.1 MHz): ██████░░ 72% utilised
  Channel 1 (868.3 MHz): ████░░░░ 48% utilised
  Duty cycle: 0.8% (limit: 1.0%)
  Queue depth: 3 messages
```

---

## 6. Edge Function Error UX

### 6.1 Error Response Format

All Edge Functions return errors in a consistent envelope:

```json
{
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "Node nde_abc123 is not registered in this deployment",
    "detail": "Verify node_id and ensure registration completed before sending heartbeats",
    "request_id": "req_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "docs_url": "https://sentinel.apex-os.io/docs/errors/NODE_NOT_FOUND"
  }
}
```

Error codes are human-readable ALL_CAPS strings, never numeric only. The `detail` field provides operator-actionable guidance, not a stack trace.

### 6.2 Error Taxonomy

```
Category: AUTH (401, 403)
  MISSING_JWT           — Authorization header absent
  INVALID_JWT           — JWT signature/expiry invalid
  INSUFFICIENT_ROLE     — Valid JWT but role lacks permission
  MTLS_CERT_INVALID     — Client certificate rejected
  MTLS_CERT_EXPIRED     — Client certificate past NotAfter
  MTLS_CERT_REVOKED     — Certificate found in CRL

Category: VALIDATION (422)
  MISSING_REQUIRED_FIELD — Required field absent from body
  INVALID_FIELD_TYPE     — Field type mismatch
  FIELD_OUT_OF_RANGE     — Numeric field outside accepted bounds
  RAW_AUDIO_REJECTED     — Payload contains audio bytes (privacy block)
  OVERSIZED_PAYLOAD      — Body exceeds 64KB limit

Category: RESOURCE (404, 409)
  NODE_NOT_FOUND         — node_id does not exist
  NODE_ALREADY_EXISTS    — Registration collision
  TRACK_NOT_FOUND        — track_id does not exist

Category: CAPACITY (429, 503)
  RATE_LIMIT_EXCEEDED    — Client rate limit hit
  NATS_UNAVAILABLE       — NATS publish failed after 3 retries
  SUPABASE_UNAVAILABLE   — Database write failed
  CIRCUIT_OPEN           — Circuit breaker open on downstream

Category: INTERNAL (500)
  INTERNAL_ERROR         — Unexpected error; request_id for correlation
```

### 6.3 Client Retry Guidance

Errors include `retry_after_ms` when the client SHOULD retry:
- RATE_LIMIT_EXCEEDED: retry_after_ms = bucket refill time
- NATS_UNAVAILABLE: retry_after_ms = 500
- CIRCUIT_OPEN: retry_after_ms = circuit half-open estimate

Errors that must NOT be retried (no retry_after_ms):
- MISSING_REQUIRED_FIELD, INVALID_FIELD_TYPE, FIELD_OUT_OF_RANGE, RAW_AUDIO_REJECTED
- The payload is broken; retrying is wasteful.

---

## 7. Node State Colour System

### 7.1 State Definitions

```
ONLINE         — heartbeat within last 60s, all capabilities nominal
DEGRADED       — heartbeat within last 60s, ≥1 capability offline
MESH-ONLY      — no IP connectivity, relaying via LoRa/BLE
OFFLINE        — no heartbeat for >120s (2 missed intervals)
PENDING        — registered but not yet approved
REVOKED        — certificate revoked, permanently excluded
```

### 7.2 Colour Values

```
State          Hex        RGB              Usage
ONLINE         #22C55E    34, 197, 94      Green (Tailwind green-500)
DEGRADED       #F59E0B    245, 158, 11     Amber (Tailwind amber-500)
MESH-ONLY      #3B82F6    59, 130, 246     Blue (Tailwind blue-500)
OFFLINE        #6B7280    107, 114, 128    Grey (Tailwind gray-500)
PENDING        #A855F7    168, 85, 247     Purple (Tailwind purple-500)
REVOKED        #EF4444    239, 68, 68      Red (Tailwind red-500)
```

Colour-blindness: every state has a distinct symbol in addition to colour:
```
ONLINE       ● (filled circle)
DEGRADED     ◐ (half circle)
MESH-ONLY    ◈ (diamond)
OFFLINE      ○ (empty circle)
PENDING      ◌ (dotted circle)
REVOKED      ✕ (cross)
```

Dark mode: all colours as-defined (already optimised for dark backgrounds). Light mode: 10% darkened values.

### 7.3 Alert Severity Colours

```
CRITICAL       #DC2626    Red-600      — Immediate threat, confirmed track
HIGH           #F97316    Orange-500   — High-confidence detection, unconfirmed track
MEDIUM         #FBBF24    Amber-400    — Multi-node detection, low confidence
LOW            #34D399    Emerald-400  — Single-node, possible false positive
INFO           #60A5FA    Blue-400     — System event, no threat
```

---

## 8. Node Alert Notification Design

### 8.1 In-Dashboard Notifications

Toast notifications appear in top-right, stack vertically, auto-dismiss after 5s (CRITICAL: 10s, requires manual dismiss).

```
┌──────────────────────────────────────────┐
│ ■ HIGH   Track TRK-A3F2 confirmed        │
│   SW sector · 94.2% confidence           │
│   3 contributing nodes · 14:23:01 UTC    │
│                            [View] [Ack]  │
└──────────────────────────────────────────┘
```

Notification groups: when >5 alerts of same severity fire within 30s, they collapse to a group notification:
```
┌──────────────────────────────────────────┐
│ ■ HIGH   7 new track detections          │
│   Multiple sectors · 14:23:01 UTC        │
│                         [View All] [Ack] │
└──────────────────────────────────────────┘
```

### 8.2 Node Health Notifications

Specific templates per event type:

```
NODE OFFLINE
  Node nde_abc123 (SECTOR-NW) has missed 2 heartbeats
  Last seen: 4m 23s ago · Battery was 67% · Signal was -72 dBm
  [View Node] [Mark Expected]

NODE DEGRADED
  Node nde_def456 (SECTOR-SE): YAMNet processor offline
  Acoustic detection disabled on this node
  [View Node] [Restart Capability]

MESH RELAY ACTIVE
  Node nde_ghi789 switched to LoRa relay mode
  IP connectivity lost · Mesh path: nde_789 → nde_012 → nde_345
  Detection events still flowing via mesh
  [View Mesh Topology]

CERTIFICATE EXPIRING
  Node nde_jkl012 certificate expires in 7 days
  Automated rotation scheduled for 2026-03-30 02:00 UTC
  [View Certificate] [Trigger Rotation Now]
```

### 8.3 External Notification Channels

Alert routing supports:
- **TAK/CoT XML**: formatted CoT event pushed to TAK server
- **Telegram**: Markdown message to configured chat_id
- **Webhook**: JSON POST to configured endpoint with HMAC-SHA256 signature
- **SMS (Twilio)**: text message to on-call roster
- **PagerDuty**: incident creation via Events API v2

Each channel has independent retry logic. A failed Telegram delivery does not block CoT dispatch.

---

## 9. API Response Format Standards

### 9.1 Success Envelope

All successful API responses use:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "processing_ms": 42
  }
}
```

List endpoints add pagination:
```json
{
  "data": [ ... ],
  "meta": {
    "request_id": "...",
    "timestamp": "...",
    "processing_ms": 18,
    "pagination": {
      "total": 1247,
      "page": 1,
      "per_page": 50,
      "has_more": true,
      "next_cursor": "cur_abc123"
    }
  }
}
```

### 9.2 Timestamp Standards

All timestamps are ISO 8601 UTC with millisecond precision in API responses.
Internal processing uses `timestamp_us` (microseconds since Unix epoch, INT8) for TDoA calculations where sub-millisecond precision is required.

Never mix epoch integers with ISO strings in the same response object.

### 9.3 ID Formats

```
Node IDs:       nde_{ulid}    — e.g. nde_01J9X4K2P3Q5R6S7T8U9V0W1X2
Event IDs:      evt_{ulid}
Track IDs:      trk_{ulid}
Alert IDs:      alt_{ulid}
Request IDs:    req_{ulid}
```

ULIDs provide: sortability, uniqueness, no UUID collision probability, human-distinguishable prefixes.

### 9.4 Field Naming

All API fields use `snake_case`. No camelCase in REST responses, no exceptions. NATS message subjects use dot-notation with lowercase segments.

### 9.5 HTTP Status Codes

```
200 OK              — GET success, POST with no side-effect
201 Created         — POST that created a resource
202 Accepted        — POST that queued async work (registration)
204 No Content      — DELETE success
400 Bad Request     — Malformed JSON
401 Unauthorized    — Missing/invalid auth
403 Forbidden       — Valid auth, insufficient permission
404 Not Found       — Resource does not exist
409 Conflict        — Resource already exists
422 Unprocessable   — Valid JSON, invalid semantics
429 Too Many Req    — Rate limit exceeded
500 Internal Error  — Unexpected server error
503 Unavailable     — Dependency (NATS/Supabase) unavailable
```

---

## 10. Operator Configuration UX

### 10.1 NATS Configuration

NATS stream and consumer configuration is version-controlled in `config/nats/streams/` as YAML files. Changes require:
1. PR review (2 approvers if production)
2. `nats stream update` command generated from diff
3. No destructive operations (drop + recreate) without maintenance window

### 10.2 Node Configuration

Per-node configuration stored in NATS KV `sentinel.config.{node_id}`. Fields:
- `gate_threshold_override`: float 0.0–1.0 (overrides global gate threshold)
- `heartbeat_interval_s`: integer 15–120
- `mesh_relay_enabled`: boolean
- `capabilities_enabled`: string[] subset of node capabilities

Configuration changes propagate to node within 2 heartbeat intervals via KV watch.

### 10.3 Geo-Sector Configuration

Geo-sector assignments are computed automatically from node lat/lon using geohash precision 8 (±38m accuracy). The consistent hash ring maps geo-sectors to Track Manager instances. This is not operator-configurable; it is computed at runtime and displayed read-only.

---

## 11. Accessibility

- WCAG 2.1 AA compliance for all dashboard components
- Colour is never the sole means of conveying state (symbols required per Section 7.2)
- Keyboard navigation: all interactive elements reachable via Tab, activated via Enter/Space
- Screen reader: all SVG/canvas elements have aria-label with state text
- Reduced motion: animations disabled when `prefers-reduced-motion: reduce`
- Minimum touch target: 44×44px on mobile views
- Font sizes: minimum 14px for data labels, 12px for micro-labels with sufficient contrast

---

## 12. Design Tokens Reference

```css
/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 48px;

/* Typography */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
--font-sans: 'Inter', system-ui, sans-serif;
--font-size-data: 13px;
--font-size-label: 11px;
--font-size-body: 14px;
--font-size-heading: 16px;

/* Borders */
--border-subtle: 1px solid rgba(255,255,255,0.08);
--border-component: 1px solid rgba(255,255,255,0.16);

/* Surface colours (dark mode) */
--surface-base: #0A0A0B;
--surface-raised: #111113;
--surface-overlay: #1A1A1D;

/* Data density: dashboard targets 85% information density */
/* Widget padding: 12px (not 16px) to fit more data without scrolling */
```
