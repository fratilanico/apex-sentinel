# APEX-SENTINEL W19 — HANDOFF

## W19 → W20 Interface Contracts

---

## Handoff Summary

W19 completes when all 98 tests are GREEN and the full suite has no regressions. The handoff from W19 to W20 is defined by the `ThreatIntelPicture` TypeScript interface and the NATS subjects published by W19.

W20 (Operator Workflow + Regulatory Dispatch) consumes everything W19 produces.

---

## W19 Outputs — W20 Must Consume All

### 1. ThreatIntelPicture (Full Picture)

**NATS Subject**: `sentinel.intel.picture_update`
**Frequency**: Every 10 seconds (matching W18 cycle rate)
**Consumer**: W20 OperatorDashboardBackend

```typescript
interface ThreatIntelPicture {
  timestamp: string;
  cycleSequence: number;
  pipelineLatencyMs: number;
  breaches: ZoneBreach[];
  scores: ThreatScore[];
  awningLevels: Map<string, ZoneAwningState>;
  notifications: AacrNotification[];
  coordinationMessages: RomatsaCoordinationMessage[];
  anonymisedTracks: AnonymisedTrack[];
  totalAircraftObserved: number;
  totalBreachesDetected: number;
  highestAwningLevel: AwningLevel;
  zonesAtRed: string[];
  zonesAtOrange: string[];
  feedHealthSnapshot: FeedHealth[];
  privacyBreachFlag: boolean;
  gdprExemptTrackCount: number;
  degradedMode: boolean;
  degradedComponents: string[];
}
```

---

### 2. ZoneBreach (Per-Breach Events)

**NATS Subject**: `sentinel.intel.breach_detected`
**Frequency**: On each new breach detection
**Consumer**: W20 OperatorDashboardBackend (real-time map overlay), W20 SupabaseAuditLogger

Key fields W20 must display:
- `breachType` (ENTERING/INSIDE/EXITING) — map indicator style
- `distanceM` — numeric display
- `ttBreachS` — countdown timer for ENTERING breaches
- `natoSensitive` — flag for special handling indicator

---

### 3. ZoneAwningState (AWNING Level Changes)

**NATS Subject**: `sentinel.intel.awning_change`
**Frequency**: On AWNING level change (not every cycle — only when level changes)
**Consumer**: W20 OperatorDashboardBackend (zone colour update), W10 AwningLevelPublisher (already subscribes)

Key fields W20 must display:
- `zoneId` — which zone changed
- `level` — new AWNING level
- `previousLevel` — for transition animation
- `drivingScore` — tooltip showing why level changed

---

### 4. AacrNotification (Regulatory Incident Reports)

**NATS Subject**: `sentinel.intel.aacr_notification`
**Frequency**: On each ORANGE/RED AWNING event
**Consumer**: W20 AacrDispatchQueue

**CRITICAL**: W20 must:
1. Queue notifications in Supabase `sentinel_aacr_notifications` table (W20 adds this)
2. Require operator confirmation before dispatching to AACR SIRA API (for all records with `operatorConfirmationRequired=true`)
3. Track dispatch status (QUEUED/CONFIRMED/DISPATCHED/ACKNOWLEDGED)
4. Set retry logic for SIRA API failures (W19 does not retry; W20 owns dispatch reliability)
5. Never lose a notification (W19 in-memory buffer has 24h TTL; W20 must persist before TTL)

**AACR SIRA API** (W20 implements):
- Endpoint: (to be confirmed with AACR DSAS department)
- Auth: (to be confirmed)
- Format: All 7 SIRA fields from AacrNotification

---

### 5. RomatsaCoordinationMessage (ATC Coordination)

**NATS Subject**: `sentinel.intel.romatsa_coordination`
**Frequency**: On RED AWNING at airport zones
**Consumer**: W20 RomatsaSecureChannel

**CRITICAL**: W20 must:
1. Persist to Supabase `sentinel_romatsa_messages` table
2. Dispatch via secure channel (VPN or AFTN — to be confirmed with ROMATSA)
3. Mark `TLP:RED` — message content must never be transmitted over unencrypted channels
4. Log acknowledgement from ROMATSA controller
5. Linked AacrNotification via `linkedAacrIncidentId` — W20 must maintain this cross-reference

---

### 6. AnonymisedTrack (GDPR-Compliant Positions)

**NATS Subject**: Not published separately — included in `ThreatIntelPicture.anonymisedTracks`
**Consumer**: W20 OperatorDashboardBackend (map display)

**CRITICAL GDPR obligations for W20**:
- NEVER display precise aircraft positions (W19 provides grid-snapped positions only for Cat-A)
- Cat-D tracks: `EXEMPT` status means full position available for security display — but MUST be restricted to authorised operators only
- `privacyBreachFlag=true` in ThreatIntelPicture → W20 must trigger ANSPDCP notification workflow
- W20 UI must enforce: only authenticated AACR/ROMATSA operators see Cat-D precise positions

---

## W19 State That Does NOT Survive Restart

W19 is in-memory only. On restart:
- All `ZoneBreach` history: LOST
- All `AnonymisedTrack` timers: RESET (all aircraft re-enter 30s PENDING period)
- All `ZoneAwningState`: RESET to GREEN (cold start)
- `sequenceCounter` for incident IDs: RESET to 0

**W20 implications**:
- If APEX-SENTINEL restarts, W20 dashboard shows all zones GREEN until first W19 cycle completes
- W20 should display a "RESTARTED — awaiting first detection cycle" banner for the first 10–30s after restart
- Open incidents in AACR dispatch queue remain in Supabase (W20 persistence) — they are not lost
- W20 should NOT cancel pending AACR notifications if W19 restarts

---

## W20 New Type Requirements

W20 must add to the type system:

```typescript
// Supabase row types (W20 adds these)
interface SupabaseAacrNotificationRow {
  id: string;                     // UUID primary key
  incident_id: string;            // AacrNotification.incidentId
  notification_json: string;      // Full AacrNotification serialised
  status: 'QUEUED' | 'CONFIRMED' | 'DISPATCHED' | 'ACKNOWLEDGED' | 'FAILED';
  operator_confirmed_by: string | null;
  operator_confirmed_at: string | null;
  dispatched_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

interface SupabaseRomatsaMessageRow {
  id: string;
  message_id: string;             // RomatsaCoordinationMessage.messageId
  message_json: string;
  status: 'QUEUED' | 'DISPATCHED' | 'ACKNOWLEDGED';
  dispatched_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

interface SupabaseThreatIntelSnapshot {
  id: string;
  cycle_sequence: number;
  snapshot_json: string;          // ThreatIntelPicture serialised
  highest_awning_level: AwningLevel;
  zones_at_red: string[];
  created_at: string;
}
```

---

## W20 FRs That Depend on W19 (All)

| W20 FR | W19 Dependency | Critical Interface |
|--------|---------------|-------------------|
| FR-W20-01 OperatorDashboardBackend | All W19 NATS subjects | ThreatIntelPicture, ZoneBreach, ZoneAwningState |
| FR-W20-02 AacrDispatchQueue | sentinel.intel.aacr_notification | AacrNotification (all 7 SIRA fields) |
| FR-W20-03 RomatsaSecureChannel | sentinel.intel.romatsa_coordination | RomatsaCoordinationMessage (TLP:RED) |
| FR-W20-04 SupabaseAuditLogger | sentinel.intel.picture_update | ThreatIntelPicture |
| FR-W20-05 HumanApprovalWorkflow | AacrNotification.operatorConfirmationRequired | GDPR Art.22 flag |
| FR-W20-06 OperatorDashboardUI | REST/WebSocket from W20-01 | All W19 types via W20-01 |
| FR-W20-07 PrivacyNoticePortal | AnonymisedTrack.legalBasis | Art.6(1)(e) exemption display |
| FR-W20-08 W20EndToEndIntegration | Full W19 pipeline | EuSituationalPicture → ThreatIntelPicture |

---

## Compatibility Commitment

W19 commits to **backwards-compatible changes only** for the lifetime of W20 development. Specifically:

- No removal or renaming of fields in `ThreatIntelPicture`, `ZoneBreach`, `ThreatScore`, `ZoneAwningState`, `AacrNotification`, or `RomatsaCoordinationMessage`
- No change to NATS subject names (`sentinel.intel.*`)
- No change to AWNING level string values (`GREEN`, `YELLOW`, `ORANGE`, `RED`)
- AWNING threshold values MAY change (follow threshold change protocol in LKGC_TEMPLATE.md)
- New optional fields may be added to any type (additive, non-breaking)

If a breaking change is required, it is a W21+ concern with a migration plan.
