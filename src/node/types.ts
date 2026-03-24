// APEX-SENTINEL — Node Types
// W1 | src/node/types.ts

export type NodeTier = 0 | 1 | 2;
// Tier 0: RPi + RTL-SDR fixed (GPS-PPS ±1μs)
// Tier 1: Smartphone (GPS ±50ms)
// Tier 2: ESP32 LoRa relay

export type NodeCapability =
  | 'acoustic'
  | 'rf_wifi'
  | 'sdr_900mhz'
  | 'camera_yolo'
  | 'doppler_radar'
  | 'lora_relay';

export interface NodeRegistration {
  nodeId: string;
  tier: NodeTier;
  capabilities: NodeCapability[];
  lat: number;
  lon: number;
  alt: number;
  timePrecisionUs: number;
  gateLevel: number;
  directEndpoint?: string;
  registeredAt: bigint;
}

export interface NodeHeartbeat {
  nodeId: string;
  timestampUs: bigint;
  lat: number;
  lon: number;
  batteryPercent?: number;
  signalStrength?: number;
  activeCapabilities: NodeCapability[];
}

export interface NodeRegistryEntry extends NodeRegistration {
  lastHeartbeatUs: bigint;
  isOnline: boolean;
  missedHeartbeats: number;
}
