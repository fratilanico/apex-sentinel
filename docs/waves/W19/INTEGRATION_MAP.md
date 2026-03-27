# APEX-SENTINEL W19 — INTEGRATION MAP

## Theme: Romania/EU Threat Intelligence Layer

---

## Integration Overview

W19 sits at the centre of the APEX-SENTINEL intelligence chain. It consumes from W3–W18 and produces for W10, W20, and W21.

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║  APEX-SENTINEL INTEGRATION MAP — W19 POSITION                                   ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║  INPUTS TO W19                              OUTPUTS FROM W19                    ║
║  ─────────────────────────────              ──────────────────────────────────  ║
║                                                                                  ║
║  W3/W4 YAMNet                               → W10 AWNING Engine                 ║
║  acoustic drone confidence                   (via NATS sentinel.intel.awning_   ║
║  ──────────────────────────────              change → W10 subscribes)            ║
║           │                                                                      ║
║  W5/W6 RF Fingerprint                        → W20 Operator Dashboard           ║
║  model match, confidence                     (ThreatIntelPicture,               ║
║  ──────────────────────────────              ZoneBreach, ZoneAwningState)        ║
║           │                                                                      ║
║  W7 Multi-Modal Fusion                       → W20 AACR Dispatch Queue          ║
║  fusionThreatProbability                     (AacrNotification,                 ║
║  ──────────────────────────────              7 SIRA fields)                      ║
║           │                                                                      ║
║  W8 Threat Probability                       → W20 ROMATSA Secure Channel       ║
║  level (LOW/MEDIUM/HIGH/CRIT)                (RomatsaCoordinationMessage,       ║
║  ──────────────────────────────              TLP:RED)                            ║
║           │                                                                      ║
║  W9 DataFeedBroker (NATS)                    → W20 Supabase Audit Logger        ║
║  feed infrastructure                         (ThreatIntelPicture snapshots,     ║
║  ──────────────────────────────              breach event log)                   ║
║           │                                                                      ║
║  W18 EuDataIntegrationPipeline               → W21 NATO/SMAp Coordination       ║
║  EuSituationalPicture (all feeds)            (ZoneBreach.natoSensitive=true,   ║
║  ──────────────────────────────              AacrNotification for military)      ║
║           │                                                                      ║
║           └─────────► W19 W19ThreatIntelPipeline                                ║
║                        (orchestrates FR-W19-01 through FR-W19-07)               ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## Input Integrations

### W3/W4: YAMNet Acoustic Classifier → W19

| Field | Source | Destination | Use |
|-------|--------|-------------|-----|
| `acousticDroneConfidence` | W3/W4 NATS sentinel.detection.acoustic | FR-W19-01 EasaCategoryClassifier | Boost confidence for non-cooperative aircraft classification |
| `acousticModelVersion` | W3/W4 | FR-W19-01 | Audit trail |

**Integration mechanism**: W19's `MlSignalCollector` subscribes to `sentinel.detection.acoustic`. It correlates signals by detection node proximity to aircraft positions from W18. Assembled into `MlSignalBundle` per aircraft.

**If W3/W4 offline**: Classification uses ADS-B-only or heuristic path. `classificationBasis='ads-b-emitter-category'` or `'heuristic-velocity'`. No degradation to AWNING logic.

---

### W5/W6: RF Fingerprint → W19

| Field | Source | Destination | Use |
|-------|--------|-------------|-----|
| `rfFingerprintMatch` | W5/W6 NATS sentinel.detection.rf | FR-W19-01 | Confirm cat-d-unknown for unregistered drones |
| `rfMatchedModel` | W5/W6 | FR-W19-01 | Include in AacrNotification aircraftDescription |
| `rfFingerprintConfidence` | W5/W6 | FR-W19-01 | Set CategoryResult.confidence |

**If W5/W6 offline**: No RF signal in MlSignalBundle. Classification falls to ADS-B/heuristic. No AWNING degradation.

---

### W7: Multi-Modal Fusion → W19

| Field | Source | Destination | Use |
|-------|--------|-------------|-----|
| `fusionThreatProbability` | W7 NATS sentinel.detection.fusion | FR-W19-01, FR-W19-03 | Advisory check; confidence boost; ML divergence log |

**If W7 offline**: No fusion advisory. Scores are purely rule-based. This is the nominal path — W7 is advisory only.

---

### W8: Threat Probability → W19

| Field | Source | Destination | Use |
|-------|--------|-------------|-----|
| `threatLevel` (LOW/MEDIUM/HIGH/CRITICAL) | W8 NATS sentinel.detection.probability | FR-W19-03 | ML divergence check (log only; does not change score) |

**If W8 offline**: No divergence check. No impact on W19 outputs.

---

### W9: DataFeedBroker → W19

| Dependency | Source | Destination | Use |
|-----------|--------|-------------|-----|
| NATS connection | W9 NATS infrastructure | All W19 components with NATS clients | NATS publish/subscribe |

**If NATS offline**: W19 cannot receive EuSituationalPicture from W18. Pipeline pauses. Resumes on reconnection. Local EventEmitter events continue to fire.

---

### W18: EuDataIntegrationPipeline → W19

**Primary integration**: W18 publishes `EuSituationalPicture` to NATS subject `sentinel.feeds.eu_picture` every 10 seconds. W19 subscribes and calls `process()` on each message.

| W18 Component | Provides | W19 Consumer |
|---------------|----------|-------------|
| AircraftPositionAggregator (FR-W18-02) | `AircraftState[]` | FR-W19-01, FR-W19-02, FR-W19-05, FR-W19-07 |
| NotamIngestor (FR-W18-03) | `NotamRestriction[]` | FR-W19-07 (NOTAM cross-reference) |
| EasaUasZoneLoader (FR-W18-04) | `EasaUasZone[]` | FR-W19-02 (optional zone awareness) |
| CriticalInfrastructureLoader (FR-W18-05) | `ProtectedZone[]` | FR-W19-02, FR-W19-03, FR-W19-04, FR-W19-06, FR-W19-07 |
| AtmosphericConditionProvider (FR-W18-06) | `AtmosphericConditions` | FR-W19-03 (atmospheric bonus) |
| SecurityEventCorrelator (FR-W18-07) | `SecurityEvent[]` | FR-W19-03 (security context bonus) |
| EuDataFeedRegistry (FR-W18-01) | `FeedHealth[]` | FR-W19-08 (passthrough to ThreatIntelPicture) |

**If W18 offline**: No EuSituationalPicture published. W19 pipeline pauses. On reconnection, resumes with fresh data. No stale data accumulation.

---

## Output Integrations

### W19 → W10: AWNING Engine

**Subject**: `sentinel.intel.awning_change`
**Producer**: FR-W19-04 EuAwningLevelAssigner
**Consumer**: W10 AwningLevelPublisher

| W19 Field | W10 Use |
|-----------|---------|
| `ZoneAwningState.level` | Update system AWNING level |
| `ZoneAwningState.zoneId` | Per-zone AWNING display |
| `ZoneAwningState.changed=true` | Trigger W10 escalation state machine |

**Relationship**: W19 generates per-zone AWNING levels. W10 aggregates to a system-level AWNING. W10's state machine (escalation timers, hysteresis) remains the authoritative AWNING controller. W19 provides the per-zone inputs.

**Backward compatibility**: W10 must be able to receive W19 `ZoneAwningState` messages in addition to its existing input format. This is an additive W10 subscription — W10's existing behaviour is unchanged.

---

### W19 → W20: Operator Dashboard Backend

**Subjects consumed by W20**:
- `sentinel.intel.picture_update` → Full ThreatIntelPicture every 10s
- `sentinel.intel.breach_detected` → Real-time breach events for map overlay
- `sentinel.intel.awning_change` → Zone colour changes
- `sentinel.intel.aacr_notification` → AACR dispatch queue
- `sentinel.intel.romatsa_coordination` → ROMATSA dispatch queue

**W20 Dashboard Display Requirements** (derived from W19 outputs):

| W19 Output | Dashboard Feature |
|-----------|-------------------|
| `ZoneBreach.breachType=ENTERING` + `ttBreachS` | Zone approach countdown timer |
| `ZoneBreach.breachType=INSIDE` | Zone boundary pulsing red indicator |
| `ZoneAwningState.level` | Zone fill colour (GREEN/YELLOW/ORANGE/RED) |
| `ThreatScore.value` + `factors` | Expandable threat score card |
| `AacrNotification.incidentId` | Incident queue item |
| `RomatsaCoordinationMessage.messageId` | ATC coordination queue item |
| `AnonymisedTrack.gridLat/gridLon` | Aircraft dot on map (grid-snapped for Cat-A) |
| `ThreatIntelPicture.highestAwningLevel` | System-wide AWNING banner |
| `ThreatIntelPicture.pipelineLatencyMs` | System health indicator |

---

### W19 → W20: AACR Dispatch Queue

**W19 produces**: `AacrNotification` (7 SIRA fields, all populated)
**W20 consumes**: Queues in Supabase, requires operator confirmation, dispatches to AACR SIRA API

**Data flow**:
```
W19 AacrNotificationFormatter
  → NATS sentinel.intel.aacr_notification
  → W20 AacrDispatchQueue subscriber
    → INSERT into sentinel_aacr_notifications (Supabase)
    → operatorConfirmationRequired=true → hold in QUEUED state
    → W20 HumanApprovalWorkflow → operator confirms
    → status = CONFIRMED → W20 dispatches to AACR SIRA API
    → AACR acknowledges → status = ACKNOWLEDGED
```

**W19 obligation**: Produce all 7 SIRA fields correctly. W19 never dispatches — only formats.

**Key W19 fields that drive W20 dispatch logic**:
- `operatorConfirmationRequired=true` → human approval gate
- `cncanEscalationRequired=true` → CNCAN notification path (separate from AACR)
- `natoSensitive=true` → NATO liaison notification path (W21)
- `timestampUtc` (= breach detection time, not report time) → AACR timestamp for SLA compliance

---

### W19 → W20: ROMATSA Secure Channel

**W19 produces**: `RomatsaCoordinationMessage` (TLP:RED)
**W20 consumes**: Dispatches via secure VPN channel to ROMATSA ACC Bucharest

**Data flow**:
```
W19 RomatsaCoordinationInterface
  → NATS sentinel.intel.romatsa_coordination
  → W20 RomatsaSecureChannel subscriber
    → INSERT into sentinel_romatsa_messages (Supabase)
    → Dispatch to ROMATSA via secure VPN (authenticated endpoint)
    → ROMATSA ATC controller acknowledges
    → status = ACKNOWLEDGED
```

**W19 obligation**: Correct TLP:RED marking, linked AacrNotification ID, accurate speed/altitude conversions.

---

### W19 → W21: NATO/SMAp Coordination

W21 is a future wave. W19 prepares the data that W21 will consume.

| W19 Field | W21 Use |
|-----------|---------|
| `ZoneBreach.natoSensitive=true` | Triggers W21 NATO liaison protocol |
| `AacrNotification` for military zones | Cross-filed to SMAp notification |
| `RomatsaCoordinationMessage` for LRCK | NATO Kogălniceanu coordination |
| `ThreatScore` for Deveselu NATO Base | NATO BMD security assessment |

W19 does not call any W21 APIs. W21 subscribes to existing W19 NATS subjects and adds handling for NATO-sensitive events.

---

## Romanian Regulatory Body Integration Map

```
APEX-SENTINEL W19 produces:
         │
         ├─► AACR (Autoritatea Aeronautică Civilă Română)
         │     Via: AacrNotification → W20 AACR dispatch
         │     Format: SIRA incident report (7 mandatory fields)
         │     Trigger: ORANGE or RED AWNING at any zone
         │     Timing: < 5s after AWNING level confirmed
         │
         ├─► ROMATSA (Regia Autonomă "Autoritatea Aeronautică Română")
         │     Via: RomatsaCoordinationMessage → W20 ROMATSA channel
         │     Format: ICAO Doc 4444 §10 ATC coordination
         │     Trigger: RED AWNING at airport zones (LROP/LRCL/LRTR/LRSB/LRCK)
         │     Timing: < 5s after RED confirmed at airport zone
         │
         ├─► CNCAN (Comisia Națională pentru Controlul Activităților Nucleare)
         │     Via: AacrNotification.cncanEscalationRequired=true → W20 CNCAN path
         │     Format: CNCAN security incident report (W20 implements format)
         │     Trigger: ANY AWNING level above GREEN at Cernavodă nuclear zone
         │     Timing: Immediate (W20 priority dispatch queue)
         │
         └─► SMAp (Statul Major al Apărării) — W21 FUTURE
               Via: AacrNotification for NATO_BASE zones → W21 NATO protocol
               Format: TBD (NATO STANAG messaging — W21 design)
               Trigger: Any ORANGE/RED at Deveselu, Kogălniceanu, Câmpia Turzii
               Timing: W21 scope
```

---

## NATS Subject Directory (W19 Complete View)

```
PRODUCES (W19 publishes):
  sentinel.intel.breach_detected        ZoneBreach JSON
  sentinel.intel.awning_change          ZoneAwningState JSON
  sentinel.intel.aacr_notification      AacrNotification JSON
  sentinel.intel.romatsa_coordination   RomatsaCoordinationMessage JSON
  sentinel.intel.picture_update         ThreatIntelPicture JSON
  sentinel.intel.pipeline_error         { component, error, timestamp }

CONSUMES (W19 subscribes):
  sentinel.feeds.eu_picture             EuSituationalPicture (from W18)
  sentinel.detection.acoustic           MlSignalBundle partial (from W3/W4)
  sentinel.detection.rf                 MlSignalBundle partial (from W5/W6)
  sentinel.detection.fusion             MlSignalBundle partial (from W7)
  sentinel.detection.probability        MlSignalBundle partial (from W8)

PASSES THROUGH (W19 includes in ThreatIntelPicture):
  feedHealthSnapshot                    FeedHealth[] from W18 EuDataFeedRegistry
```
