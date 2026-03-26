# APEX-SENTINEL W8 — Privacy Architecture

> Wave: W8 | GDPR compliance maintained | Date: 2026-03-26

---

## Privacy Guarantees (W7 baseline, W8 analysis)

All W7 privacy guarantees must survive W8 additions, particularly:
1. No raw audio transmission (W8-05 mobile app must not upload audio)
2. GDPR location coarsening ±50m grid survives firmware OTA (W8-08 regression test)
3. Wild Hornets dataset processing is local-only (W8-09)
4. Model promotion audit includes no personal data (W8-10)

---

## W8 Privacy Deltas

### Mobile App (FR-W8-05)
- Audio capture happens on-device. WAV/PCM never sent over network.
- Detection events sent over NATS contain only: timestamp, class, confidence, node_id.
- GPS position (if node has GPS): coarsened to ±50m before transmission — same as existing pipeline.
- React Native `expo-permissions` must request ONLY microphone. Location permission only if node GPS mode enabled by operator.

### OTA Firmware Downloads (FR-W8-08)
- Firmware packages downloaded from Supabase Storage (authenticated).
- SHA-256 verified before application.
- No telemetry in firmware update payloads.
- `firmware_ota_log` stores: node_id, version, status. No GPS position, no audio data.

### Wild Hornets Dataset (FR-W8-09)
- Dataset downloaded to local node storage only.
- Not uploaded to Supabase or any external service.
- Processing pipeline is local.
- `per_profile_recall_metrics` table stores only aggregate statistics (recall, precision, F1). No individual recordings.

### Model Promotion Audit (FR-W8-10)
- `model_promotion_audit` stores: operator_id (hashed or username, no PII), model version, metrics, gate result.
- No audio samples stored in audit table.
- Audit is append-only (no delete permission for service role).

---

## GDPR Article 22 Compliance (Automated Decision Making)

W8 adds the learning-safety gate which is directly relevant to Art. 22 (automated decisions with significant effects):

- PTZ/jammer activation decisions are still human-in-the-loop. The system recommends; a human operator confirms via dashboard (bearing control is manual send).
- Model promotion requires operator action (`promoteModel(metrics, operatorId)`). No automated model swap.
- The `iec_61508_sil` field in `model_promotion_audit` documents the safety integrity level for certification bodies.

---

## Privacy Regression Tests (W8)

```typescript
// tests/privacy/FR-W8-privacy-regression.test.ts

describe('FR-W8: Privacy regression — OTA + Mobile + Wild Hornets', () => {
  it('firmware manifest payload contains no audio data', ...)
  it('OTA log entry contains no GPS coordinates', ...)
  it('mobile detection event strips raw audio before NATS publish', ...)
  it('Wild Hornets processing pipeline emits only aggregate metrics', ...)
  it('model promotion audit entry contains no audio samples', ...)
  it('GDPR grid coarsening survives OTA firmware upgrade', ...)
})
```
