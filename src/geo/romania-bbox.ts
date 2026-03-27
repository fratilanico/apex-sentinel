export const ROMANIA_BBOX = {
  latMin: 43.5, latMax: 48.5,
  lonMin: 20.2, lonMax: 30.0,
  centerLat: 45.9, centerLon: 24.9,
  zoom: 7,
};

export const PROTECTED_ZONES_HARDCODED = [
  { id: 'PZ-BUH', name: 'Henri Coandă Airport',    lat: 44.5713, lon: 26.0849, radiusKm: 5,  type: 'airport',    icaoCode: 'LROP' },
  { id: 'PZ-CLJ', name: 'Cluj-Napoca Airport',      lat: 46.7852, lon: 23.6862, radiusKm: 5,  type: 'airport',    icaoCode: 'LRCL' },
  { id: 'PZ-TSR', name: 'Timișoara Airport',        lat: 45.8099, lon: 21.3379, radiusKm: 5,  type: 'airport',    icaoCode: 'LRTR' },
  { id: 'PZ-MKK', name: 'Mihail Kogălniceanu',     lat: 44.3622, lon: 28.4883, radiusKm: 8,  type: 'military',   icaoCode: 'LRCK' },
  { id: 'PZ-CND', name: 'Cernavodă Nuclear Plant', lat: 44.3267, lon: 28.0606, radiusKm: 10, type: 'nuclear'  },
  { id: 'PZ-DVS', name: 'Deveselu NATO Base',       lat: 44.0986, lon: 24.1375, radiusKm: 8,  type: 'military' },
  { id: 'PZ-OTP', name: 'Bucharest Gov District',  lat: 44.4268, lon: 26.1025, radiusKm: 3,  type: 'government'},
] as const;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function isInRomaniaBbox(lat: number, lon: number): boolean {
  return lat >= ROMANIA_BBOX.latMin && lat <= ROMANIA_BBOX.latMax &&
         lon >= ROMANIA_BBOX.lonMin && lon <= ROMANIA_BBOX.lonMax;
}
