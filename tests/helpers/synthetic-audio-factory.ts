// APEX-SENTINEL — Synthetic Audio Factory
// tests/helpers/synthetic-audio-factory.ts
//
// Schema-based synthesis of drone acoustic test signals.
// All audio is generated from physical first principles (sinusoidal model + noise),
// NOT from real recordings. This is the correct strategy when field recordings
// are scarce, classified, or unavailable — GPS injection methodology (AI Testing
// book, BCS 2022, digital twin case study).
//
// Usage:
//   import { buildSyntheticTone, addGaussianNoise, ... } from '../helpers/synthetic-audio-factory.js'

export interface ToneParams {
  /** Fundamental frequency Hz */
  freqHz: number;
  /** Sample rate Hz — MUST be 16000 */
  sampleRate: number;
  /** Duration in seconds. Default 1.0 */
  durationS?: number;
  /** RMS amplitude of signal component. Default 0.1 */
  amplitudeRms?: number;
}

export interface HarmonicParams {
  /** Fundamental frequency Hz */
  fundamentalHz: number;
  /** Harmonic frequency list (including fundamental) */
  harmonics: number[];
  /** Sample rate Hz — MUST be 16000 */
  sampleRate: number;
  /** Duration in seconds. Default 1.0 */
  durationS?: number;
}

export interface PistonParams extends ToneParams {
  /**
   * Prop-wash amplitude modulation frequency Hz.
   * Default 5.0 (3-blade prop at ~100 RPM). Set 0 to disable.
   */
  propWashHz?: number;
  /** AM depth 0–1. Default 0.15 */
  propWashDepth?: number;
}

export interface NoiseParams {
  sigma: number;
}

export interface SnrParams {
  snrDb: number;
}

/**
 * Build a pure sine wave at the given frequency and sample rate.
 * Simulates a simplistic drone acoustic profile for MR testing.
 */
export function buildSyntheticTone(params: ToneParams): Float32Array {
  const {
    freqHz,
    sampleRate,
    durationS = 1.0,
    amplitudeRms = 0.1,
  } = params;
  if (sampleRate !== 16000) {
    throw new Error(
      `SyntheticAudioFactory: sampleRate must be 16000, got ${sampleRate}. ` +
      'W7 P0: all SENTINEL audio must be at 16kHz.'
    );
  }
  const n = Math.floor(sampleRate * durationS);
  const out = new Float32Array(n);
  const peakAmp = amplitudeRms * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    out[i] = peakAmp * Math.sin(2 * Math.PI * freqHz * i / sampleRate);
  }
  return out;
}

/**
 * Build a piston drone acoustic profile with:
 * - Fundamental + 2nd + 3rd harmonics (decay 1.0, 0.6, 0.3)
 * - Prop-wash amplitude modulation (default 5Hz, 15% depth)
 *
 * Models: Shahed-136, Shahed-131, Gerbera
 */
export function buildSyntheticPistonAudio(params: PistonParams): Float32Array {
  const {
    freqHz,
    sampleRate,
    durationS = 1.0,
    amplitudeRms = 0.1,
    propWashHz = 5.0,
    propWashDepth = 0.15,
  } = params;
  if (sampleRate !== 16000) {
    throw new Error(`sampleRate must be 16000, got ${sampleRate}`);
  }
  const n = Math.floor(sampleRate * durationS);
  const out = new Float32Array(n);
  const harmonicDecay = [1.0, 0.6, 0.3];
  const totalEnergy = harmonicDecay.reduce((s, d) => s + d * d, 0);
  const scale = amplitudeRms * Math.SQRT2 / Math.sqrt(totalEnergy);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Amplitude modulation from prop wash
    const am = propWashHz > 0
      ? 1 + propWashDepth * Math.sin(2 * Math.PI * propWashHz * t)
      : 1.0;
    // Harmonics
    let sample = 0;
    for (let h = 0; h < harmonicDecay.length; h++) {
      sample += harmonicDecay[h] * Math.sin(2 * Math.PI * freqHz * (h + 1) * t);
    }
    out[i] = scale * am * sample;
  }
  return out;
}

/**
 * Build a turbine drone acoustic profile (Shahed-238 / jet-engine class):
 * - Dominant energy 3000–8000 Hz (BPF sub-harmonic)
 * - Near-continuous broadband tone, minimal AM (no prop wash)
 * - Harmonics decay rapidly: [1.0, 0.1, 0.05]
 *
 * NOTE: fundamentalHz should be in 3000–8000 range for Shahed-238.
 */
export function buildSyntheticTurbineAudio(params: ToneParams): Float32Array {
  const {
    freqHz,
    sampleRate,
    durationS = 1.0,
    amplitudeRms = 0.1,
  } = params;
  if (sampleRate !== 16000) {
    throw new Error(`sampleRate must be 16000, got ${sampleRate}`);
  }
  const n = Math.floor(sampleRate * durationS);
  const out = new Float32Array(n);
  const harmonicDecay = [1.0, 0.1, 0.05]; // turbine: rapid decay, no prop wash
  const totalEnergy = harmonicDecay.reduce((s, d) => s + d * d, 0);
  const scale = amplitudeRms * Math.SQRT2 / Math.sqrt(totalEnergy);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let h = 0; h < harmonicDecay.length; h++) {
      sample += harmonicDecay[h] * Math.sin(2 * Math.PI * freqHz * (h + 1) * t);
    }
    out[i] = scale * sample;
  }
  return out;
}

/**
 * Build audio with explicit harmonic frequency list.
 * Equal energy per harmonic. Use for turbine harmonic structure tests (MR-12).
 */
export function buildHarmonicAudio(params: HarmonicParams): Float32Array {
  const { harmonics, sampleRate, durationS = 1.0 } = params;
  if (sampleRate !== 16000) {
    throw new Error(`sampleRate must be 16000, got ${sampleRate}`);
  }
  const n = Math.floor(sampleRate * durationS);
  const out = new Float32Array(n);
  const amp = 0.1 / harmonics.length;
  for (const h of harmonics) {
    for (let i = 0; i < n; i++) {
      out[i] += amp * Math.sin(2 * Math.PI * h * i / sampleRate);
    }
  }
  return out;
}

/**
 * Add Gaussian noise using Box-Muller transform.
 */
export function addGaussianNoise(audio: Float32Array, params: NoiseParams): Float32Array {
  const { sigma } = params;
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    const u1 = Math.random() + 1e-10; // avoid log(0)
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out[i] = audio[i] + sigma * z;
  }
  return out;
}

/**
 * Add noise targeting a specific SNR in dB.
 * SNR = 10 * log10(signalPower / noisePower)
 */
export function addNoise(audio: Float32Array, params: SnrParams): Float32Array {
  const { snrDb } = params;
  const signalPower = audio.reduce((s, x) => s + x * x, 0) / audio.length;
  if (signalPower === 0) {
    // Silence — return as-is
    return new Float32Array(audio);
  }
  const noisePower = signalPower / Math.pow(10, snrDb / 10);
  const sigma = Math.sqrt(noisePower);
  return addGaussianNoise(audio, { sigma });
}

/** Scale all samples by a constant factor. */
export function scaleAmplitude(audio: Float32Array, factor: number): Float32Array {
  return Float32Array.from(audio, x => x * factor);
}

/** Reverse audio in time. MR-07: time reversal class preservation. */
export function reverseAudio(audio: Float32Array): Float32Array {
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    out[i] = audio[audio.length - 1 - i];
  }
  return out;
}

/**
 * Mix two audio buffers with given ratio.
 * out[i] = a[i] * ratio + b[i] * (1 - ratio)
 */
export function mixAudio(
  a: Float32Array,
  b: Float32Array,
  ratio: number
): Float32Array {
  const len = Math.min(a.length, b.length);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = a[i] * ratio + b[i] * (1 - ratio);
  }
  return out;
}

/**
 * Add DC offset to all samples.
 * MR-08: pipeline mel spectrogram frontend should remove DC offset.
 */
export function addDcOffset(audio: Float32Array, offset: number): Float32Array {
  return Float32Array.from(audio, x => x + offset);
}

/**
 * Compute spectral centroid of audio (Hz).
 * Uses DFT magnitude-weighted average frequency.
 * Approximation — uses only the first N/2 bins.
 */
export function computeSpectralCentroid(
  audio: Float32Array,
  sampleRate: number
): number {
  const n = audio.length;
  let weightedSum = 0;
  let magnitudeSum = 0;

  // Naive DFT for small n (for testing only — not production use)
  const halfN = Math.floor(n / 2);
  for (let k = 1; k < halfN; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      re += audio[t] * Math.cos(angle);
      im -= audio[t] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im);
    const freq = (k * sampleRate) / n;
    weightedSum += freq * mag;
    magnitudeSum += mag;
  }

  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

/**
 * Find peak frequency in audio via DFT.
 * Returns the frequency bin with maximum magnitude (Hz).
 */
export function findPeakFrequency(
  audio: Float32Array,
  sampleRate: number
): number {
  const n = audio.length;
  let maxMag = 0;
  let peakFreq = 0;
  const halfN = Math.floor(n / 2);

  for (let k = 1; k < halfN; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      re += audio[t] * Math.cos(angle);
      im -= audio[t] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im);
    if (mag > maxMag) {
      maxMag = mag;
      peakFreq = (k * sampleRate) / n;
    }
  }

  return peakFreq;
}
