// APEX-SENTINEL — TDOA Triangulation (Newton-Raphson solver)
// W1 | src/tracking/tdoa.ts
//
// Hyperbolic TDOA: for reference node R and sensor node S,
//   TDOA_distance = dist(source, S) - dist(source, R)
// Solve for source position using Newton-Raphson least squares.

import { TdoaInput, TdoaResult } from './types.js';

const SPEED_OF_SOUND_MS = 343; // m/s at 20°C
const METERS_PER_DEG_LAT = 111_000;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class TdoaSolver {
  solve(inputs: TdoaInput[]): TdoaResult {
    if (inputs.length < 2) {
      throw new Error('INSUFFICIENT_NODES: TDOA requires ≥2 nodes');
    }

    if (inputs.length === 2) {
      return this.centroidFallback(inputs);
    }

    const ref = inputs[0];

    // TDOA distances: dist(source, node_i) - dist(source, ref)
    const tdoaDistances = inputs.slice(1).map(node => {
      const dtUs = Number(node.timestampUs - ref.timestampUs);
      return dtUs * 1e-6 * SPEED_OF_SOUND_MS;
    });

    // Initial estimate: centroid of node positions
    let estLat = inputs.reduce((s, n) => s + n.lat, 0) / inputs.length;
    let estLon = inputs.reduce((s, n) => s + n.lon, 0) / inputs.length;

    // Newton-Raphson iterations
    // Constraint: f_i(x) = dist(x, node_i) - dist(x, ref) - tdoa_i = 0
    // Jacobian:   ∂f_i/∂lat = (estLat - node_i.lat)/dNode - (estLat - ref.lat)/dRef  [in metres]
    for (let iter = 0; iter < 100; iter++) {
      const dRef = Math.max(haversineM(estLat, estLon, ref.lat, ref.lon), 1e-6);
      const residuals: number[] = [];
      const jacRows: number[][] = [];

      for (let i = 0; i < inputs.slice(1).length; i++) {
        const node = inputs[i + 1];
        const dNode = Math.max(haversineM(estLat, estLon, node.lat, node.lon), 1e-6);

        // Residual: f_i = dNode - dRef - tdoa_i
        residuals.push(dNode - dRef - tdoaDistances[i]);

        // Partial derivatives in metres → convert back to degrees
        const cosLat = Math.max(Math.cos((estLat * Math.PI) / 180), 0.01);
        const dLatNode = ((estLat - node.lat) * METERS_PER_DEG_LAT) / dNode;
        const dLonNode = ((estLon - node.lon) * METERS_PER_DEG_LAT * cosLat) / dNode;
        const dLatRef  = ((estLat - ref.lat)  * METERS_PER_DEG_LAT) / dRef;
        const dLonRef  = ((estLon - ref.lon)  * METERS_PER_DEG_LAT * cosLat) / dRef;

        jacRows.push([dLatNode - dLatRef, dLonNode - dLonRef]);
      }

      // Least-squares: Δx = (JᵀJ)⁻¹ Jᵀ (−r)   [minimise f(x) + J Δx = 0]
      const J = jacRows;
      const r = residuals;
      const Jt00 = J.reduce((s, row) => s + row[0] * row[0], 0);
      const Jt01 = J.reduce((s, row) => s + row[0] * row[1], 0);
      const Jt11 = J.reduce((s, row) => s + row[1] * row[1], 0);
      const Jtr0 = J.reduce((s, row, k) => s + row[0] * r[k], 0);
      const Jtr1 = J.reduce((s, row, k) => s + row[1] * r[k], 0);

      const det = Jt00 * Jt11 - Jt01 * Jt01;
      if (Math.abs(det) < 1e-12) break;

      // Step = -(JᵀJ)⁻¹ Jᵀ r  (Newton step to minimise residuals)
      const dLat = -(Jt11 * Jtr0 - Jt01 * Jtr1) / det;
      const dLon = -(Jt00 * Jtr1 - Jt01 * Jtr0) / det;

      // Convert metre update back to degrees
      const cosLat = Math.max(Math.cos((estLat * Math.PI) / 180), 0.01);
      estLat += dLat / METERS_PER_DEG_LAT;
      estLon += dLon / (METERS_PER_DEG_LAT * cosLat);

      if (Math.abs(dLat) < 0.001 && Math.abs(dLon) < 0.001) break;
    }

    return {
      estimatedLat: estLat,
      estimatedLon: estLon,
      estimatedAltM: 0,
      positionErrorM: this.estimateError(inputs),
      contributingNodes: inputs.map(n => n.nodeId),
      solvable: true,
    };
  }

  centroidFallback(inputs: TdoaInput[]): TdoaResult {
    if (inputs.length < 2) {
      throw new Error('INSUFFICIENT_NODES: centroid fallback requires ≥2 nodes');
    }
    const estLat = inputs.reduce((s, n) => s + n.lat, 0) / inputs.length;
    const estLon = inputs.reduce((s, n) => s + n.lon, 0) / inputs.length;
    const avgDistM =
      inputs.reduce((s, n) => s + haversineM(estLat, estLon, n.lat, n.lon), 0) / inputs.length;

    return {
      estimatedLat: estLat,
      estimatedLon: estLon,
      estimatedAltM: 0,
      positionErrorM: Math.max(avgDistM, this.estimateError(inputs)),
      contributingNodes: inputs.map(n => n.nodeId),
      solvable: true,
    };
  }

  estimateError(inputs: TdoaInput[]): number {
    const avgPrecisionUs = inputs.reduce((s, n) => s + n.timePrecisionUs, 0) / inputs.length;
    const timingErrorM = (avgPrecisionUs * 1e-6) * SPEED_OF_SOUND_MS;
    return timingErrorM * Math.max(1, 3 / Math.sqrt(inputs.length));
  }
}
