# W12 API SPECIFICATION

## FhssPatternAnalyzer
```typescript
analyze(samples: FrequencySample[]): FhssResult | null
// Returns null if < 3 samples
interface FrequencySample { frequencyMHz: number; ts: number; rssi: number }
interface FhssResult { protocol: string; hopInterval_ms: number; bandMHz: [number, number]; confidence: number }
```

## MultiProtocolRfClassifier
```typescript
classify(samples: FrequencySample[]): ClassifierResult[]
interface ClassifierResult { protocol: string; confidence: number; evidence: string[] }
// Returns empty array if no protocol exceeds 0.60 confidence threshold
```

## RfBearingEstimator
```typescript
estimate(nodes: NodeObservation[]): BearingEstimate
// Throws InsufficientNodesError if nodes.length < 3
interface NodeObservation { nodeId: string; lat: number; lon: number; rssi: number }
interface BearingEstimate { estimatedLat: number; estimatedLon: number; accuracy_m: number; confidence: number }
```

## SpectrumAnomalyDetector
```typescript
detect(samples: SpectrumSample[]): AnomalyResult
interface SpectrumSample { frequencyMHz: number; powerDbm: number; ts: number; packetHash?: string }
interface AnomalyResult { anomalyType: 'jamming'|'gps_spoofing'|'replay_attack'|'none'; severity: number; affectedBandMHz?: [number, number] }
```

## RfFusionEngine
```typescript
fuse(rf: RfDetection, acoustic: AcousticDetection): FusionResult
interface FusionResult { fusedConfidence: number; conflict: boolean; sources: string[] }
```

## RfSessionTracker
```typescript
ingest(detection: RfDetection): void
getActiveSessions(): RfSession[]
getSessionHistory(windowMs: number): RfSession[]
interface RfSession { sessionId: string; startTs: number; lastTs: number; protocol: string; positionHistory: Position[]; preterminalFlag: boolean }
```

## RfPrivacyFilter
```typescript
filter(raw: RawRfEvent): FilteredRfEvent
// MAC → SHA-256 daily-keyed hash; strips rawPacketContent
```

## RfPipelineIntegration
```typescript
// Subscribes to RF detection events via EventEmitter
// Publishes filtered events to NATS subject sentinel.rf.detections
// Triggers AWNING stage upgrade on ELRS 900 confirmation
```
