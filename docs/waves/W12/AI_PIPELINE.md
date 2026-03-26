# W12 AI PIPELINE

## RF Classification Pipeline (no ML model — rule-based + statistical)

W12 uses deterministic signal processing algorithms, not neural networks.
This is intentional: RF protocol fingerprinting at this fidelity level does not
require a trained model — the frequency bands and hop intervals are published
specifications.

## Confidence Scoring
MultiProtocolRfClassifier uses a weighted scoring function:
  confidence = w_freq * freqMatch + w_hop * hopMatch + w_rssi * rssiStability

Weights (empirically chosen, validated by INDIGO team):
  w_freq = 0.50  (primary discriminator — bands do not overlap)
  w_hop  = 0.35  (hop interval is protocol-specific)
  w_rssi = 0.15  (RSSI stability indicates coherent source)

## Integration with AI Testing Layer
- `non-determinism.test.cjs` — classifier must return same result ±0.01 on repeated
  identical inputs (deterministic rule-based system → ND deviation = 0).
- `data-drift.test.cjs` — if background RF environment changes significantly,
  SpectrumAnomalyDetector should flag it before classifier degrades.

## Future ML Hook (W13+)
If field data warrants it, replace the rule-based MultiProtocolRfClassifier with a
1D-CNN trained on spectral features. The interface contract is identical — no
downstream changes required.
