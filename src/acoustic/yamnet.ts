// APEX-SENTINEL — YAMNet TFLite Inference Engine
// W1 | src/acoustic/yamnet.ts
//
// In production: wraps @tensorflow/tfjs-tflite or Android TFLite Interpreter.
// In Node.js (test/server): uses frequency-domain heuristics as surrogate.
// The 480KB INT8 YAMNet model runs ON-DEVICE — this module is the abstraction layer.

import { SpectralAnalysis, YamNetResult } from './types.js';

// YAMNet class indices relevant to APEX-SENTINEL
const CLASS_DRONE = 427;
const CLASS_HELICOPTER = 430;
const CLASS_MECHANICAL = 342;

// Drone frequency signature: energy peaks 80–900Hz, harmonic structure
function scoreDrone(spectral: SpectralAnalysis): number {
  const { fftMagnitudes, peakFrequencyHz, rmsLevel } = spectral;
  if (rmsLevel < 0.001) return 0;

  let score = 0;

  // Peak frequency in drone range (80–900Hz)
  if (peakFrequencyHz > 80 && peakFrequencyHz < 900) score += 0.40;

  // Detect harmonic content in drone frequency bands
  // binWidth estimate: assumes 16kHz / (magnitudes.length * 2)
  const sampleRate = 16000;
  const binWidth = sampleRate / (fftMagnitudes.length * 2);
  // Threshold: 20% of RMS level. Ambient noise has uniform spectrum (peak ≈ RMS level
  // per bin, stored as Float32 = 0.009999... which is BELOW Float64 threshold 0.01).
  // Drone harmonics concentrate energy at discrete bins (peak >> 20% of total RMS).
  const PEAK_THRESHOLD = Math.max(0.001, rmsLevel * 0.2);

  // Check for energy in fundamental + 2nd + 3rd harmonic bands
  const harmonicBands = [
    { min: 80, max: 500 },   // fundamental FPV rotor
    { min: 150, max: 1000 }, // 2nd harmonic
    { min: 250, max: 1500 }, // 3rd harmonic
  ];
  let harmonicHits = 0;
  for (const band of harmonicBands) {
    const startBin = Math.floor(band.min / binWidth);
    const endBin = Math.ceil(band.max / binWidth);
    let peak = 0;
    for (let i = startBin; i < Math.min(endBin, fftMagnitudes.length); i++) {
      if (fftMagnitudes[i] > peak) peak = fftMagnitudes[i];
    }
    if (peak > PEAK_THRESHOLD) harmonicHits++;
  }
  if (harmonicHits >= 2) score += 0.35;
  if (harmonicHits >= 3) score += 0.15;

  return Math.min(score, 0.98);
}

function scoreHelicopter(spectral: SpectralAnalysis): number {
  const { peakFrequencyHz, rmsLevel } = spectral;
  if (rmsLevel < 0.01) return 0;
  // Helicopter: slow rotor 5–30Hz fundamental, more mid-band energy
  if (peakFrequencyHz > 5 && peakFrequencyHz < 80) return 0.60;
  return 0.05;
}

function scoreMechanical(spectral: SpectralAnalysis): number {
  const { energyBands, rmsLevel } = spectral;
  if (rmsLevel < 0.01) return 0;
  // Mechanical noise: broadband energy distribution
  const spread = Math.min(energyBands.low, energyBands.mid, energyBands.high);
  if (spread > 0.01) return 0.25;
  return 0.05;
}

export class YamNetInferenceEngine {
  private modelLoaded = false;
  private inferenceLatencies: number[] = [];
  readonly modelSizeKb = 480;

  async loadModel(_modelPath: string): Promise<void> {
    // In production: TFLite loadModel(_modelPath)
    // Here: mark loaded (model path validation would happen in native code)
    await new Promise(resolve => setTimeout(resolve, 10)); // simulate I/O
    this.modelLoaded = true;
  }

  async infer(spectral: SpectralAnalysis): Promise<YamNetResult> {
    if (!this.modelLoaded) {
      throw new Error('MODEL_NOT_LOADED: call loadModel() before infer()');
    }

    const start = Date.now();

    // Surrogate inference using frequency-domain heuristics
    // In production: this calls TFLite session.run()
    const droneConf = scoreDrone(spectral);
    const heliConf = scoreHelicopter(spectral);
    const mechConf = scoreMechanical(spectral) * (1 - droneConf); // normalise

    const latencyMs = Date.now() - start;
    this.inferenceLatencies.push(latencyMs);

    // Normalise so scores sum to ≤ 1.0 (softmax-like clamping)
    const total = droneConf + heliConf + mechConf;
    const norm = total > 1.0 ? total : 1.0;
    const dNorm = droneConf / norm;
    const hNorm = heliConf / norm;
    const mNorm = mechConf / norm;

    const scores: Array<[string, number]> = [
      ['drone', dNorm],
      ['helicopter', hNorm],
      ['mechanical', mNorm],
    ];
    const topClass = scores.sort((a, b) => b[1] - a[1])[0][0];

    return {
      droneConfidence: dNorm,
      helicopterConfidence: hNorm,
      mechanicalNoiseConfidence: mNorm,
      topClass,
      latencyMs,
      timestampUs: spectral.timestampUs,
    };
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  getLatencyMs(): number {
    if (this.inferenceLatencies.length === 0) throw new Error('NO_INFERENCES_YET');
    return this.inferenceLatencies.reduce((a, b) => a + b, 0) / this.inferenceLatencies.length;
  }
}
