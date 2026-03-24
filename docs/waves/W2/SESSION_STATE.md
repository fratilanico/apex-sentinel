# APEX-SENTINEL — Session State
## W2 | PROJECTAPEX Doc 12/21 | 2026-03-24

---

## 1. Current Wave Status

| Field | Value |
|-------|-------|
| Wave | W2 |
| Phase | plan (PROJECTAPEX 20-doc suite in progress) |
| Started | 2026-03-24 |
| Target Complete | Week 18 (approx 2026-05-26) |
| Blockers | None — open questions documented below |
| Last Committed Doc | SESSION_STATE.md (this file) |

W1 status: COMPLETE. All 7 W1 PROJECTAPEX docs written. W1 edge detection pipeline (YAMNet, Gate 1/2/3, EKF on-device, GPS-PPS sync client, TypeScript SDK stub) is the foundation W2 builds on.

---

## 2. What W2 Builds On from W1

### 2.1 Reused TypeScript Types (from W1 `src/types/sentinel.ts`)

W2 extends, not replaces, all W1 types.

```typescript
// W1 exports consumed by W2:
type SentinelEvent            → extended with: mesh_relay, ble_relay, tdoa_eligible, geo_sector
type GateResult               → unchanged, referenced in ingest-event validator
type NodeConfig               → extended with: nats_creds, jwt, tier, cert_fingerprint, firmware_version
type AudioMeta                → unchanged, embedded in SentinelEvent.audio_meta
type EKFState                 → unchanged, used by Track Manager in W2
type GPSCoordinate            → unchanged, used in node registration (lat, lon, alt)
type TimingTier               → NEW in W2: enum { GPS_PPS = 1, SDR = 5000, PHONE = 50000 }
type TDoAWindow               → NEW in W2
type TrackRecord              → NEW in W2
type NodeHeartbeat            → NEW in W2
```

### 2.2 Reused W1 Modules

| W1 Module | W2 Usage | Status |
|-----------|----------|--------|
| `src/detection/yamnet.ts` | No change — edge-only, not touched by W2 | Stable |
| `src/detection/gate1.ts` | No change | Stable |
| `src/detection/gate2.ts` | No change | Stable |
| `src/detection/gate3.ts` | `gate3_event_id` field added to output — backward-compatible | W2 extends |
| `src/sync/gps-pps-client.ts` | Consumed by Tier-1 node SDK; `time_precision_us` sourced from here | Stable |
| `src/sdk/node-client.ts` | Extended in W2 with `register()`, `publish()`, `heartbeat()` methods | W2 extends |
| `tests/fixtures/audio_meta_samples.json` | Reused in W2 ingest-event integration tests | Reused |

### 2.3 Extended Gate 3 Output

W1 Gate 3 emits: `{ confidence, timestamp_us, audio_meta }`.

W2 Gate 3 emit (backward-compatible addition):
```typescript
{
  confidence: number,
  timestamp_us: number,
  audio_meta: AudioMeta,
  gate3_event_id: string,   // NEW: UUID assigned at Gate 3 fire, used as TDoA group key
  geo_sector: string,        // NEW: geohash-6 of node position at event time
  tdoa_eligible: boolean,    // NEW: true if timing_weight > 0 and time_precision_us ≤ 60000
  timing_weight: number      // NEW: 1.0 | 0.7 | 0.3 per ADR-W2-08
}
```

Any W1 consumer of Gate 3 output ignores unknown fields — JSON deserialization is forward-compatible.

---

## 3. Decisions Made (Locked for W2)

These decisions are ACCEPTED ADRs — do not revisit in W2 without creating a new SUPERSEDED ADR.

| Decision | ADR | Locked Value |
|----------|-----|-------------|
| Backbone broker | ADR-W2-01 | NATS JetStream, 5-node Raft |
| API layer | ADR-W2-02 | Supabase Edge Functions (Deno) |
| Geo partitioning | ADR-W2-03 | Geohash precision 6 |
| LoRa mesh | ADR-W2-04 | Meshtastic 2.3.x |
| TDoA window | ADR-W2-05 | 500ms |
| DB partitioning | ADR-W2-06 | pg_partman monthly on `created_at` |
| Cert rotation | ADR-W2-07 | 90 days, 14-day pre-expiry alert |
| Node tiers | ADR-W2-08 | Tier 0/1/2/4 (Tier 3 reserved) |
| Track Manager assignment | ADR-W2-09 | Consistent hash ring on geo_sector |
| Sensor fusion | ADR-W2-10 | Weighted mean (DST deferred to W3) |
| Supabase project | — | `bymfcnwfyxuivinuzurr`, eu-west-2 |
| NATS cluster name | — | `sentinel-cluster` |
| Streams count | — | 8 streams (see ARCHITECTURE.md §2) |
| Heartbeat interval | — | 60s publish, DEGRADED at 90s, OFFLINE at 300s |
| Dedup key | — | `sha256(node_id + ":" + timestamp_us + ":" + gate)` |
| Geo coarsening | — | ±50m (PostgreSQL function in migration 009) |
| Timestamp coarsening | — | nearest 100μs for anon-role queries |

---

## 4. Open Questions

These are unresolved as of W2 plan phase. Each has an owner and a target resolution date. W2 execution may not proceed on affected components until the question is resolved.

### OQ-W2-01 — Meshtastic Channel Encryption Key Distribution
**Question:** How are AES-256 channel PSKs rotated for field-deployed Tier-4 nodes? The W2 design distributes the key at enrollment via `register-node` response (encrypted with node cert public key). But if the channel PSK is compromised, rotating it requires reaching every enrolled Tier-4 node — which may be offline (LoRa-only, no internet).

**Options under consideration:**
1. Fixed PSK per deployment (simple, insecure if compromised)
2. Monthly PSK rotation via NATS command on reconnect
3. Meshtastic Managed Mode PKI (per-node keys, not shared PSK — requires Meshtastic 3.x)

**Target resolution:** Before M2.6 implementation (end of week 14).
**Owner:** Nico / security review.

### OQ-W2-02 — NATS Cluster Hosting: Self-Hosted VMs vs Managed (Synadia Cloud)
**Question:** W2 design assumes self-hosted NATS on 5 VMs (Azure or Hetzner). Synadia Cloud offers managed NATS JetStream. The trade-off is operational control vs managed reliability. Cost and latency impact unknown for eu-west-2 region.

**Blockers if unresolved:** M2.1 cannot begin until hosting is decided (IP addresses, TLS cert SANs depend on final hostnames).

**Target resolution:** Before week 8 (M2.1 start).
**Owner:** Nico.

**Current leaning:** Self-hosted on Hetzner (Germany) for latency to UK sensors; Synadia Cloud as failover option in W3.

### OQ-W2-03 — NATS WebSocket Endpoint for Deno Edge Functions
**Question:** Supabase Edge Functions run Deno, which cannot use the standard NATS TCP client. NATS requires a WebSocket endpoint exposed on the cluster. Enabling WebSocket on NATS requires `websocket { port: 8080 }` in server config and mTLS certs that include the WSS hostname.

**Implication for ADR-W2-02:** Edge Function → NATS publishing is feasible but adds WSS config complexity. Alternative: Edge Functions write to Supabase Realtime, and a separate relay service (Node.js on VM) publishes from Supabase to NATS.

**Target resolution:** Before M2.3 implementation (week 10).
**Owner:** Backend lead.

### OQ-W2-04 — TDoA Accuracy Validation Methodology
**Question:** The ±62m accuracy claim for 3-node TDoA requires validation against a real-world scenario. The synthetic fixture (`3-node-tdoa-scenario.json`) uses computed arrival times — not real hardware noise. GPS position error, clock drift, and atmospheric delay are not modelled in the synthetic fixture.

**Implication:** M2.5 acceptance test (±62m) passes with synthetic data but may not reflect field accuracy. A field validation test is needed before W3 operational claims are made.

**Target resolution:** Field test scheduled in week 17 (M2.8 prep).
**Owner:** Nico / field ops.

### OQ-W2-05 — Supabase Realtime at 50 inserts/second Throughput
**Question:** AC-13-04 requires Realtime subscription stability at 50 inserts/s. Supabase Realtime is known to have per-channel throughput limits on the free/Pro tier. Project `bymfcnwfyxuivinuzurr` is on Pro tier — limit is documented as 200 concurrent connections, but per-channel message throughput is not publicly specified.

**Implication:** If Realtime cannot sustain 50 msg/s, the CesiumJS live feed (W3) will require a different delivery mechanism (polling or SSE fallback).

**Target resolution:** Load test during M2.4 implementation (week 11).
**Owner:** Backend lead.

---

## 5. Explicitly Deferred to W3

The following items were considered for W2 and explicitly removed from scope. Do not implement these in W2. Any W2 code that appears to implement these is scope creep and must be reverted.

| Item | Reason for Deferral | W3 milestone |
|------|---------------------|-------------|
| CesiumJS 3D threat map UI | Requires stable W2 data API first | M3.3 |
| Android/iOS mobile apps | BLE + LoRa SDK requires W2 NATS creds format locked | M3.1 |
| EKF + LSTM Gate 4 | Requires W2 Track Manager stable with ≥72h soak data | M3.5 |
| Multi-tenant C2 dashboard | RBAC design requires W2 node registry stable | M3.4 |
| TAK server CoT integration | alert-router CoT schema defined in W2; TAK server deploy in W3 | M3.6 |
| Synadia Cloud managed NATS | Contingency if self-hosted proves unstable | M3.0 option |
| DST multi-sensor fusion | Only acoustic sensor active in W2; DST needs ≥2 types | ADR-W3-01 |
| EKF state persistence (Redis) | Track Manager stateless recovery sufficient for W2 | M3.2 |
| WCAG 2.1 AA full audit | Fleet dashboard meets baseline; full audit in W3 | M3.4 |
| Rate limiting per IP | Per-node rate limiting is sufficient for W2 | M3.security |

---

## 6. Known Active Risks

Sourced from ROADMAP.md §6 risk register. Status at plan phase:

| Risk ID | Summary | Status | Mitigation Action Taken |
|---------|---------|--------|------------------------|
| R-W2-01 | NATS Raft split-brain at bootstrap | Open | Strict boot order documented in DEPLOY_CHECKLIST.md |
| R-W2-02 | Supabase DDL via wrong API | Mitigated | CI guard in migration test suite |
| R-W2-03 | Meshtastic firmware fragmentation | Open | Firmware 2.3.x locked; check in register-node validator |
| R-W2-04 | TDoA Newton-Raphson divergence | Mitigated | Divergence guard + centroid fallback implemented in spec |
| R-W2-05 | NATS cred key exposure | Mitigated | Key in Supabase Vault; audit log per issuance |
| R-W2-06 | pg_partman partition overflow | Mitigated | Retention in migration 010; monthly verify |
| R-W2-07 | Offline queue replay ordering | Open | Dedup key specified; Gate 3 priority ordering specified in AC-12-05 |
| R-W2-08 | mTLS cert expiry outage | Mitigated | 90-day rotation + 14-day pre-expiry alert automated |
| R-W2-09 | Edge Function cold start >2s | Open | Warm-up ping every 5min to be implemented in heartbeat service |
| R-W2-10 | BLE Nearby pairing friction | Open | QR-code fallback documented; mobile UX in W3 scope |

---

## 7. Integration Points with W1 TypeScript Modules

For each W2 service, the W1 modules it depends on and the interface contract:

### 7.1 ingest-event Edge Function
- Imports: `SentinelEvent` type from `@apex-sentinel/types` (W1 package)
- Validates: `gate`, `confidence`, `timestamp_us`, `audio_meta.hash` against W1 type definitions
- Does NOT import: YAMNet, EKF, Gate 1/2/3 implementation — those are edge-only

### 7.2 TDoA Correlator Service
- Imports: `GPSCoordinate`, `TimingTier` from W1 types
- Implements: Newton-Raphson using W1's `haversineDistance` utility function
- Does NOT import: YAMNet, audio processing — pure geometry service

### 7.3 Node SDK (W1 stub → W2 complete)
- W1 stub: `register(config: NodeConfig): Promise<void>` — no-op implementation
- W2 complete: `register(config: NodeConfig): Promise<{ jwt: string, nats_creds: string }>` — calls Edge Function
- W2 addition: `heartbeat(battery_pct: number): Promise<void>` — publishes to NATS
- W2 addition: `publishEvent(event: SentinelEvent): Promise<void>` — validates + publishes with JWT auth

### 7.4 Mesh Bridge
- Imports: `SentinelEvent` type for payload construction from Meshtastic protobuf decode
- Maps: Meshtastic `Position` → `GPSCoordinate` (W1 type)
- Maps: Meshtastic `Telemetry.battery_level` → `heartbeat.battery_pct`

---

## 8. W3 Handoff Requirements (What W2 Must Produce)

At W2 complete, the following must be true for W3 to begin cleanly:

1. **register-node API contract frozen:** No breaking changes to request/response schema for ≥14 days before W3 mobile SDK work begins.
2. **ingest-event API contract frozen:** Same.
3. **Supabase `tracks` table schema final:** W3 CesiumJS queries this table. Schema must be stable.
4. **NATS subject schema documented:** W3 services must know which subjects to subscribe to.
5. **NODE_SDK published to private npm:** W3 mobile SDK wraps the Node SDK; npm package must be published from W2 codebase.
6. **TDoA accuracy field contract:** `accuracy_m` nullable for centroid results; W3 CesiumJS handles null.
7. **Telegram bot credentials:** `@SentinelOpsBot` token must be in Supabase Vault and testable from W3 session.
8. **ARTIFACT_REGISTRY.md current:** All W2 artifacts listed with status COMPLETE.
9. **SESSION_STATE.md updated:** W3 open questions section populated; this file updated with final W2 status.
10. **No P0/P1 bugs open:** RISK_REGISTER.md clean.

---

## 9. Session Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | Nico | W2 plan phase opened; 14 PROJECTAPEX docs written (7 in W2 session) |
| — | — | NATS cluster hosting decision pending (OQ-W2-02) |
| — | — | ADR-W2-01 through ADR-W2-10 all ACCEPTED in this session |
