// APEX-SENTINEL — FR-W12-03: RF Bearing Estimator
// src/rf2/rf-bearing-estimator.ts
//
// Estimates transmitter position from multi-node RSSI observations
// using free-space path loss least-squares minimisation.
//
// Free-space path loss model:
//   RSSI = txPower - 20*log10(d) - 20*log10(f) - 32.45
//   => d = 10^((txPower - RSSI - 20*log10(f) - 32.45) / 20)

export interface NodeObservation {
  nodeId: string;
  lat: number;
  lon: number;
  rssi: number;  // dBm
}

export interface BearingEstimate {
  estimatedLat: number;
  estimatedLon: number;
  accuracy_m: number;
  confidence: number;
}

export class InsufficientNodesError extends Error {
  constructor(count: number) {
    super(`InsufficientNodesError: need ≥3 nodes, got ${count}`);
    this.name = 'InsufficientNodesError';
  }
}

// Assumed transmit power (typical FPV drone)
const TX_POWER_DBM = 20;
// Assumed centre frequency (used for path loss constant)
const FREQ_MHZ = 900;
// Metres per degree of latitude (approximate)
const M_PER_DEG_LAT = 111320;

export class RfBearingEstimator {
  estimate(nodes: NodeObservation[]): BearingEstimate {
    if (nodes.length < 3) {
      throw new InsufficientNodesError(nodes.length);
    }

    // Estimate distances from each node using free-space path loss
    const distances = nodes.map(n => rssiToDistance(n.rssi, TX_POWER_DBM, FREQ_MHZ));

    // Initial guess: centroid of node positions
    const initLat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length;
    const initLon = nodes.reduce((s, n) => s + n.lon, 0) / nodes.length;

    // Simple weighted centroid as least-squares approximation
    // Weight = 1/distance (closer nodes are more accurate)
    const weights = distances.map(d => 1 / Math.max(d, 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const estimatedLat = nodes.reduce((sum, n, i) => sum + n.lat * weights[i]!, 0) / totalWeight;
    const estimatedLon = nodes.reduce((sum, n, i) => sum + n.lon * weights[i]!, 0) / totalWeight;

    // Accuracy: residual RMS of distance errors
    const residuals = nodes.map((n, i) => {
      const actualDist = haversineMetres(estimatedLat, estimatedLon, n.lat, n.lon);
      return Math.abs(actualDist - distances[i]!);
    });
    const rmsResidual = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
    const accuracy_m = Math.max(50, rmsResidual);

    // Confidence: inverse of normalised accuracy; more nodes → higher confidence
    const nodeBonus = Math.min(0.2, (nodes.length - 3) * 0.05);
    const rawConf = Math.max(0, 1 - accuracy_m / 5000) + nodeBonus;
    const confidence = Math.min(1, Math.max(0, rawConf));

    return { estimatedLat, estimatedLon, accuracy_m, confidence };
  }
}

function rssiToDistance(rssiDbm: number, txPowerDbm: number, freqMHz: number): number {
  // d = 10^((txPower - RSSI - 20*log10(f) - 32.45) / 20)
  const pathLoss = txPowerDbm - rssiDbm;
  const freqTerm = 20 * Math.log10(freqMHz);
  const exponent = (pathLoss - freqTerm - 32.45) / 20;
  return Math.pow(10, exponent) * 1000; // metres
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
