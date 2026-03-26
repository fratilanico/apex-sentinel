# APEX-SENTINEL W8 — Risk Register

> Wave: W8 | Date: 2026-03-26

---

## Risk Matrix

| ID | Risk | Likelihood | Impact | Score | Owner | Mitigation |
|----|------|-----------|--------|-------|-------|------------|
| R-W8-01 | BRAVE1 dataset not available before tdd-red | Medium | High | 6 | Nico | Pin dataset to Supabase Storage before wave starts |
| R-W8-02 | Wild Hornets dataset license restricts defence use | Low | Medium | 2 | Nico | Check license (CC BY 4.0 expected); if restricted use synthetic replacement |
| R-W8-03 | ELRS RF field validation blocked by permit | Medium | Medium | 4 | INDIGO team | Use RTL-SDR as passive receiver only; coordinate transmit with APEX drone |
| R-W8-04 | Mobile React Native build fails on CI (EAS) | Medium | Low | 2 | Dev | Use Expo EAS managed builds; decouple mobile CI from core test CI |
| R-W8-05 | ONVIF simulator does not replicate real camera behaviour | Low | Medium | 2 | Dev | Add integration note: field test with real camera required post-W8 |
| R-W8-06 | promoteModel() IEC 61508 implementation too strict (blocks valid models) | Medium | Medium | 4 | Dev | Test with realistic metric ranges; thresholds based on W7 oracle results |
| R-W8-07 | Multi-threat (8 concurrent) causes NATS backpressure | Low | High | 3 | Dev | Benchmark under load; NATS JetStream has 1M msg/s capacity |
| R-W8-08 | OTA firmware bricks a node (rollback fails) | Low | Critical | 5 | Dev | Double test rollback path; require health check ACK before marking done |
| R-W8-09 | Hackathon judges ask for live hardware demo (not available) | High | Medium | 6 | Nico | Prepare synthetic demo with real acoustic recordings from INDIGO |
| R-W8-10 | W8 scope creep (mobile + dashboard blocking core QA) | High | Medium | 6 | Nico | Timebox mobile/dashboard to W8.2; core W8 = FRs 1,2,7,8,10,12 |

---

## Risk Details

### R-W8-08 — OTA firmware bricks a node

**Context:** OTA writes to filesystem, then calls platform-specific installer. If power is cut during write, node could be left in partially-upgraded state.

**Mitigation:**
1. Download to `/tmp/firmware.tar.gz` first (never overwrite in-place)
2. Verify SHA-256 before extraction
3. Extract to `/tmp/firmware-new/`
4. Atomic symlink swap: `ln -sfn /tmp/firmware-new /usr/local/apex-sentinel`
5. Health check within 30 seconds
6. If health check fails: `ln -sfn /usr/local/apex-sentinel-backup /usr/local/apex-sentinel` → restart

**Test coverage:** FR-W8-08 includes power-cut simulation (process kill during apply).

### R-W8-10 — Scope Creep

**Recommended W8 core scope (week 1-2):**
- FR-W8-01, W8-02, W8-07, W8-08, W8-10, W8-12

**Deferred to W8.2 (week 3-4):**
- FR-W8-03, W8-04, W8-05, W8-06, W8-09, W8-11

This ensures P0 quality gates and the learning-safety resolution land before mobile/dashboard UX.
