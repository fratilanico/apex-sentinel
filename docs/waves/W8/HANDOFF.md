# APEX-SENTINEL W8 — Handoff Document

> Wave: W8 | Status: PLAN PHASE (not yet complete)
> This doc will be completed at wave:complete

---

## W7 → W8 Handoff (entering W8)

### What W7 Delivered

1619 tests, 96.19% coverage, 19/19 mind-the-gap.

Drone threat profiles (16kHz, validated with INDIGO team):
- quad_rotor: multi-rotor signature
- shahed_136: piston/propwash hybrid
- shahed_131: higher RPM piston
- shahed_238: turbine 3-8kHz (highest lethality)
- gerbera: piston 167-217Hz

Hardware effector stubs operational:
- PtzSlaveOutput: ONVIF bearing commands
- JammerActivation: RF jammer frequency selection
- PhysicalInterceptCoordinator: SkyNet intercept handoff

15 `.todo()` tests in FR-W7-18: IEC 61508 learning-safety gates — deliberate deferral.
These resolve in W8-10 (promoteModel() gate).

### Critical W8 Pre-conditions

1. BRAVE1-v2.3-16khz dataset must be pinned before recall oracle tests can run
   → Pin in Supabase Storage bymfcnwfyxuivinuzurr before tdd-red phase
2. onvif-simulator npm package must be verified compatible before PTZ tests
3. Wild Hornets dataset URL must be confirmed (acoustic ecology database)

---

## W8 → W9 Handoff (placeholder — to be completed)

To be filled at wave:complete with:
- Final test count
- Coverage numbers
- Any .todo() remaining (target: 0)
- Remaining gaps for W9
- Field trial results
- Model version promoted
- Recall gate results per profile

---

## Carry-Forward Items for W9

(from W8 planning analysis)

1. **IEC 61508 full certification** — W8 implements SIL-2 gates. W9 completes formal audit documentation.
2. **GPS anti-jam** — RTK fallback not in W8 scope. W9 or W10.
3. **ATAK native plugin** — CoT XML output is compatible; native .apk plugin is W9.
4. **NATO ADatP-3** — message format compliance is W10.
5. **Multi-language dashboard** — Romanian + Ukrainian dashboard text is W9 (translation layer).
6. **Autonomous intercept authorization** — human-in-the-loop maintained throughout W8. W9 reviews.
