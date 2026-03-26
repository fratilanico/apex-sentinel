# APEX-SENTINEL W8 — API Specification

> Wave: W8 | Date: 2026-03-26

---

## Internal TypeScript APIs (W8 additions)

### YAMNetFineTuner — promoteModel() (FR-W8-10)

```typescript
interface EvalMetrics {
  shahed_136: { recall: number; precision: number; f1: number; sampleCount: number };
  shahed_131: { recall: number; precision: number; f1: number; sampleCount: number };
  shahed_238: { recall: number; precision: number; f1: number; sampleCount: number };
  gerbera:    { recall: number; precision: number; f1: number; sampleCount: number };
  quad_rotor: { recall: number; precision: number; f1: number; sampleCount: number };
}

interface PromotionResult {
  promoted: boolean;
  modelHandle?: ModelHandle;   // present only if promoted === true
  reason?: string;             // present only if promoted === false
  metrics: EvalMetrics;
  gate: { [profile: string]: { threshold: number; passed: boolean } };
}

interface YAMNetFineTuner {
  train(dataset: AudioSample[]): Promise<void>;
  promoteModel(metrics: EvalMetrics, operatorId: string): Promise<PromotionResult>;
  getPromotionStatus(): PromotionStatus;
}
```

### AcousticProfileLibrary — setActiveModel() (FR-W8-10)

```typescript
interface ModelHandle {
  readonly version: string;
  readonly promotedAt: Date;
  readonly operatorId: string;
}

interface AcousticProfileLibrary {
  // ... existing methods ...
  setActiveModel(handle: ModelHandle): void;
  // Throws SAFETY_GATE_VIOLATION if handle was not created via promoteModel()
}
```

### OtaController (FR-W8-08)

```typescript
interface FirmwareManifest {
  version: string;
  sha256: string;
  url: string;
  audioCaptureSampleRate: number;
}

interface OtaController {
  checkForUpdate(): Promise<FirmwareManifest | null>;
  downloadAndVerify(manifest: FirmwareManifest): Promise<string>; // returns local path
  applyUpdate(localPath: string): Promise<void>;
  rollback(): Promise<void>;
  getStatus(): OtaStatus;
}

type OtaStatus = 'idle' | 'downloading' | 'applying' | 'health_check' | 'done' | 'rolled_back' | 'failed';
```

### RecallOracleGate (FR-W8-01)

```typescript
interface RecallGateConfig {
  datasetPath: string;
  datasetVersion: string;
  thresholds: {
    [profile: string]: { recall: number; precision: number };
  };
}

interface RecallGateResult {
  passed: boolean;
  metrics: EvalMetrics;
  failures: { profile: string; metric: string; actual: number; threshold: number }[];
}

async function runRecallOracleGate(
  library: AcousticProfileLibrary,
  config: RecallGateConfig
): Promise<RecallGateResult>
```

---

## HTTP API (Dashboard — W8-06)

### GET /api/tracks (SSE stream)

```
Content-Type: text/event-stream

event: track
data: {
  "id": "t_abc123",
  "latitude": 50.0234,
  "longitude": 36.1234,
  "altitude": 120,
  "speed": 185,
  "heading": 270,
  "profile": "shahed_136",
  "confidence": 0.94,
  "phase": "CRUISE",
  "updatedAt": "2026-03-26T10:01:23.456Z"
}

event: heartbeat
data: {"ts": "2026-03-26T10:01:24.000Z"}
```

Reconnection: client should reconnect with `Last-Event-ID` header if stream drops.

### GET /api/alerts

```
GET /api/alerts?limit=50&offset=0

Response 200:
{
  "alerts": [
    {
      "id": "a_xyz",
      "createdAt": "2026-03-26T10:01:23.456Z",
      "profile": "shahed_238",
      "severity": "critical",
      "phase": "TERMINAL",
      "trackId": "t_abc123",
      "message": "Terminal phase confirmed — intercept authority requested"
    }
  ],
  "total": 142
}
```

### POST /api/ptz/bearing

```
POST /api/ptz/bearing
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "azimuth": 270.5,
  "elevation": 15.0,
  "trackId": "t_abc123"
}

Response 202:
{
  "commandId": "cmd_001",
  "status": "accepted",
  "estimatedAckMs": 1200
}

Response 408 (ONVIF ACK timeout):
{
  "error": "ONVIF_ACK_TIMEOUT",
  "commandId": "cmd_001",
  "message": "PTZ command not acknowledged within 2000ms — camera returned to home"
}
```

### GET /health

```
GET /health

Response 200:
{
  "status": "ok",
  "tracks": 3,
  "nodes": { "online": 2, "total": 3 },
  "firmware": { "latest": "0.8.0", "nodesOnLatest": 2 },
  "modelVersion": "yamnet-w7-promoted-2026-03-25"
}
```

---

## NATS Subjects (W8 additions)

```
firmware.manifest.update      — OTA controller listens, nodes subscribe
firmware.node.<id>.status     — Node publishes OTA status
firmware.node.<id>.rollback   — Node publishes rollback notification

model.promotion.request       — YAMNetFineTuner publishes when gate passes
model.promotion.ack           — AcousticProfileLibrary confirms swap

ptz.command.bearing           — Dashboard publishes; PtzSlaveOutput subscribes
ptz.command.ack.<commandId>   — PtzSlaveOutput publishes ONVIF ACK

track.multi.collision         — TrackManager publishes when tracks converge <10m
track.swarm.detected          — TrackManager publishes when ≥3 tracks detected simultaneously
```
