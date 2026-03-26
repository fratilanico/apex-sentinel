// FR-W14-03: DetectionSerializer — privacy-safe detection serialization

export type AwningLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface TrajectoryPoint {
  lat: number;
  lon: number;
  altM: number;
  ts: number;
}

export interface RawDetection {
  id: string;
  droneType: string;
  awningLevel: AwningLevel;
  stage: number;
  lat?: number;
  lon?: number;
  trajectory?: TrajectoryPoint[];
  ts: number;
  // Fields to strip
  icao24?: string;
  uasId?: string;
  rfSessionId?: string;
}

export interface SerializedDetection {
  id: string;
  droneType: string;
  awningLevel: AwningLevel;
  stage: number;
  approxLat?: number;
  approxLon?: number;
  trajectory?: TrajectoryPoint[];
  ts: number;
}

export class DetectionSerializer {
  serialize(raw: RawDetection, currentAwningLevel?: AwningLevel): SerializedDetection {
    const effectiveAwning = currentAwningLevel ?? raw.awningLevel;

    const base: SerializedDetection = {
      id: raw.id,
      droneType: raw.droneType,
      awningLevel: raw.awningLevel,
      stage: raw.stage,
      ts: raw.ts,
    };

    if (raw.stage === 1) {
      // Stage 1: single sensor, not confirmed — strip all position data
      return base;
    }

    if (raw.stage === 2) {
      // Stage 2: coarsen to 0.01° (~1km)
      if (raw.lat !== undefined && raw.lon !== undefined) {
        base.approxLat = Math.round(raw.lat * 100) / 100;
        base.approxLon = Math.round(raw.lon * 100) / 100;
      }
      return base;
    }

    // Stage 3+: precise position + trajectory
    if (raw.lat !== undefined && raw.lon !== undefined) {
      base.approxLat = raw.lat;
      base.approxLon = raw.lon;
    }

    if (raw.trajectory) {
      base.trajectory = raw.trajectory;
    }

    // AWNING RED override: always include trajectory
    if (effectiveAwning === 'RED' && raw.trajectory) {
      base.trajectory = raw.trajectory;
    }

    return base;
  }

  serializeMany(raws: RawDetection[], currentAwningLevel?: AwningLevel): SerializedDetection[] {
    return raws.map(r => this.serialize(r, currentAwningLevel));
  }
}
