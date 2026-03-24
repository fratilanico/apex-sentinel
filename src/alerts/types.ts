// APEX-SENTINEL — Alert Types
// W1 | src/alerts/types.ts

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertChannel = 'telegram' | 'cot_freetek' | 'nats' | 'local';

export interface AlertEvent {
  alertId: string;
  trackId: string;
  severity: AlertSeverity;
  timestamp: bigint;
  message: string;
  position: { lat: number; lon: number; altM: number };
  confidence: number;
  channels: AlertChannel[];
}

export interface CotXmlEvent {
  uid: string;
  type: string;
  lat: number;
  lon: number;
  hae: number;
  ce: number;
  le: number;
  time: Date;
  stale: Date;
  callsign: string;
  remarks: string;
}
