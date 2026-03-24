// APEX-SENTINEL — FFT Spectral Analysis
// W1 | src/acoustic/fft.ts
// Pure-JS Cooley-Tukey FFT — no native deps, runs in Node/Android/iOS JS engine

import { PcmChunk, SpectralAnalysis } from './types.js';

// Drone rotor harmonic bands (Hz) — FPV: 100-400Hz fundamental + harmonics
const DRONE_HARMONIC_BANDS = [
  { min: 80, max: 450 },   // fundamental blade freq
  { min: 160, max: 900 },  // 2nd harmonic
  { min: 240, max: 1350 }, // 3rd harmonic
];

const ENERGY_BAND_LOW = { min: 500, max: 800 };
const ENERGY_BAND_MID = { min: 800, max: 1400 };
const ENERGY_BAND_HIGH = { min: 1400, max: 2000 };

export class FftAnalyser {
  constructor(
    private readonly windowSize: number = 2048,
    private readonly overlap: number = 0.5,
  ) {}

  analyse(chunk: PcmChunk): SpectralAnalysis {
    const { samples, sampleRate, timestampUs } = chunk;
    const float = this.normalise(samples);
    const windowed = this.applyHann(float.slice(0, this.windowSize));
    const magnitudes = this.computeFft(windowed);

    const peakFrequencyHz = this.findPeakFrequency(magnitudes, sampleRate);
    const rmsLevel = this.computeRms(float);
    const energyBands = this.computeEnergyBands(magnitudes, sampleRate);

    return {
      fftMagnitudes: magnitudes,
      peakFrequencyHz,
      energyBands,
      rmsLevel,
      timestampUs,
    };
  }

  detectDroneHarmonics(spectral: SpectralAnalysis): boolean {
    const sampleRate = 16000;
    const binWidth = sampleRate / (spectral.fftMagnitudes.length * 2);

    let harmonicMatches = 0;
    // Use peak magnitude in each band (not mean) — harmonics are narrow spectral peaks
    const PEAK_THRESHOLD = 0.002;
    for (const band of DRONE_HARMONIC_BANDS) {
      const startBin = Math.floor(band.min / binWidth);
      const endBin = Math.ceil(band.max / binWidth);
      let peakMag = 0;
      for (let i = startBin; i < Math.min(endBin, spectral.fftMagnitudes.length); i++) {
        if (spectral.fftMagnitudes[i] > peakMag) peakMag = spectral.fftMagnitudes[i];
      }
      if (peakMag > PEAK_THRESHOLD) {
        harmonicMatches++;
      }
    }

    // Peak must be below 2000Hz (drone range) and harmonics present in ≥2 bands
    return harmonicMatches >= 2 && spectral.peakFrequencyHz < 2000 && spectral.peakFrequencyHz > 50;
  }

  private normalise(samples: Int16Array): Float32Array {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = samples[i] / 32768;
    }
    return out;
  }

  private applyHann(samples: Float32Array): Float32Array {
    const out = new Float32Array(samples.length);
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      out[i] = samples[i] * w;
    }
    return out;
  }

  /**
   * Cooley-Tukey FFT — returns magnitude spectrum (half-spectrum, DC to Nyquist)
   */
  private computeFft(samples: Float32Array): Float32Array {
    const n = this.nextPowerOfTwo(samples.length);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < samples.length; i++) re[i] = samples[i];

    // Bit-reversal permutation
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }

    // FFT butterfly
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wRe = Math.cos(ang);
      const wIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let k = 0; k < len / 2; k++) {
          const uRe = re[i + k];
          const uIm = im[i + k];
          const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
          const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
          re[i + k] = uRe + vRe;
          im[i + k] = uIm + vIm;
          re[i + k + len / 2] = uRe - vRe;
          im[i + k + len / 2] = uIm - vIm;
          const newRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newRe;
        }
      }
    }

    // Return magnitude spectrum (half, DC to Nyquist)
    const half = n / 2;
    const magnitudes = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
    }
    return magnitudes;
  }

  private findPeakFrequency(magnitudes: Float32Array, sampleRate: number): number {
    let maxMag = 0;
    let peakBin = 0;
    const startBin = 1; // skip DC
    for (let i = startBin; i < magnitudes.length; i++) {
      if (magnitudes[i] > maxMag) {
        maxMag = magnitudes[i];
        peakBin = i;
      }
    }
    const binWidth = sampleRate / (magnitudes.length * 2);
    return peakBin * binWidth;
  }

  private computeEnergyBands(
    magnitudes: Float32Array,
    sampleRate: number,
  ): { low: number; mid: number; high: number } {
    const binWidth = sampleRate / (magnitudes.length * 2);
    return {
      low: this.bandEnergy(magnitudes, ENERGY_BAND_LOW.min, ENERGY_BAND_LOW.max, binWidth),
      mid: this.bandEnergy(magnitudes, ENERGY_BAND_MID.min, ENERGY_BAND_MID.max, binWidth),
      high: this.bandEnergy(magnitudes, ENERGY_BAND_HIGH.min, ENERGY_BAND_HIGH.max, binWidth),
    };
  }

  private bandEnergy(magnitudes: Float32Array, minHz: number, maxHz: number, binWidth: number): number {
    const startBin = Math.floor(minHz / binWidth);
    const endBin = Math.ceil(maxHz / binWidth);
    let energy = 0;
    for (let i = startBin; i < Math.min(endBin, magnitudes.length); i++) {
      energy += magnitudes[i] * magnitudes[i];
    }
    return Math.sqrt(energy);
  }

  private computeRms(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private nextPowerOfTwo(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }
}
