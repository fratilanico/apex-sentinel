# W14 AI_PIPELINE

## No New AI Models in W14
W14 is a presentation layer. It consumes output from the existing AI pipeline (W1-W13).

## Data Consumed
- AWNING level decisions from W10 AWNING framework
- Detection enrichments from W11 Intel fusion
- RF fingerprinting from W12
- Trajectory predictions from W6 MonteCarloPropagator

## DemoScenarioEngine — Synthetic AI Pipeline
For demo purposes, DemoScenarioEngine simulates the AI pipeline output:
- SCENARIO_SHAHED_APPROACH: simulates acoustic → fusion → trajectory prediction sequence
- SCENARIO_OSINT_SURGE: simulates OSINT feed → AWNING escalation
- SCENARIO_TRAJECTORY_PREDICTION: simulates Stage 3.5 with ETA countdown

## Privacy Layer
DetectionSerializer applies stage-gated privacy rules at serialization time,
consistent with W8 privacy architecture.
