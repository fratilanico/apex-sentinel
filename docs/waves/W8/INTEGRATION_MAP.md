# APEX-SENTINEL W8 — Integration Map

> Wave: W8 | Date: 2026-03-26

---

## Internal Integration Dependencies (W8)

```
FR-W8-01 (Recall Oracle)
  uses: AcousticProfileLibrary.classify()      [existing src/ml/]
  uses: DatasetPipeline.load()                  [existing src/ml/]
  writes: per_profile_recall_metrics            [new Supabase table]
  blocks: npm run export-model                  [new script]
  called by: FR-W8-02 (Simpson oracle)

FR-W8-02 (Simpson Oracle)
  uses: FR-W8-01 per-class metrics
  runs inside: RecallOracleGate pipeline

FR-W8-03 (PTZ Integration)
  uses: PtzSlaveOutput.sendBearing()            [existing src/output/]
  uses: onvif-simulator npm package             [new dep]
  uses: NATS ptz.command.bearing subject        [existing]

FR-W8-04 (ELRS RF Field)
  uses: ElrsRfFingerprint.detect()              [existing src/rf/]
  writes: NATS KV rf:elrs:config                [new KV key]

FR-W8-05 (Mobile UI)
  uses: NatsClientFSM                           [existing src/mobile/]
  uses: CalibrationStateMachine                 [existing src/node/]
  uses: BatteryOptimizer                        [existing src/mobile/]
  uses: NATS acoustic.event subject             [existing]

FR-W8-06 (Dashboard UI)
  uses: DashboardAPI HTTP server                [existing src/ui/]
  uses: NATS track updates                      [existing]
  calls: FR-W8-03 PTZ bearing via HTTP          [new]

FR-W8-07 (Multi-Threat)
  uses: TrackManager                            [existing src/tracking/]
  uses: TdoaSolver.solve()                      [existing src/tracking/]
  writes: multi_threat_sessions                 [new Supabase table]
  writes: NATS track.swarm.detected             [new subject]

FR-W8-08 (OTA)
  uses: NATS JetStream KV                       [existing]
  uses: ModelManager.load()                     [existing src/deploy/]
  writes: firmware_ota_log                      [new Supabase table]
  writes: NATS firmware.node.<id>.status        [new subject]

FR-W8-09 (Wild Hornets)
  uses: DatasetPipeline.augment()               [existing src/ml/]
  uses: FalsePositiveGuard.setThreshold()       [existing src/ml/]

FR-W8-10 (Learning Safety)
  uses: YAMNetFineTuner.train()                 [existing src/ml/]
  modifies: YAMNetFineTuner → adds promoteModel()
  modifies: AcousticProfileLibrary → adds setActiveModel()
  writes: model_promotion_audit                 [new Supabase table]
  resolves: tests/unit/FR-W7-18 .todo() tests  [15 tests]

FR-W8-11 (Chaos)
  uses: NATS partition simulation               [nats.ws test helper]
  uses: all major modules                       [wide integration]

FR-W8-12 (Stryker)
  uses: stryker.config.json                     [existing]
  modifies: package.json → adds test:mutation
  modifies: CI pipeline → adds mutation gate
```

---

## External System Integrations

| System | W8 Touch | Notes |
|--------|----------|-------|
| Supabase bymfcnwfyxuivinuzurr | 4 new tables, 4 migrations | Use PAT Management API for DDL |
| NATS JetStream (fortress) | 6 new subjects, 1 new KV bucket | Existing TLS auth |
| ONVIF cameras (Dahua etc.) | Integration tested via simulator in W8; real hardware in field trial | onvif-simulator npm |
| RTL-SDR 900MHz | ELRS field validation uses passive capture | Foxeer TRX1003 FHSS |
| Expo EAS Build | Mobile CI | Separate from core CI |
| GitHub Actions | Stryker mutation gate added | Existing CI file |
| INDIGO AirGuard WhatsApp group | Status updates via apex-claude-vm bot | 120363426393254203@g.us |

---

## NATS Subject Map (full, W7 baseline + W8 additions)

```
Existing (W1-W7):
  acoustic.event.<nodeId>       — YAMNet detection events
  tdoa.event                    — TDoA correlation events
  track.update                  — TrackManager state updates
  alert.telegram                — Telegram alert dispatch
  cot.relay                     — CoT XML relay to ATAK
  ptz.command.bearing           — PTZ bearing command
  ptz.command.ack.<commandId>   — PTZ ACK
  node.registry.<nodeId>        — Node registration

New (W8):
  firmware.manifest.update      — OTA manifest broadcast
  firmware.node.<id>.status     — Per-node OTA status
  firmware.node.<id>.rollback   — Per-node rollback notification
  model.promotion.request       — Gate passed, swap pending
  model.promotion.ack           — Swap confirmed
  track.multi.collision         — Two tracks converge <10m
  track.swarm.detected          — ≥3 simultaneous tracks
  rf.elrs.config.update         — ELRS threshold update
```
