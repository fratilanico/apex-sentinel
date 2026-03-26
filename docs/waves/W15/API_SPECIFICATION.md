# W15 API SPECIFICATION

## InputSanitizationGateway

```typescript
sanitize<T>(raw: unknown, schema: SanitizationSchema): SanitizationResult<T>

interface SanitizationSchema {
  maxDepth: number;      // default 10
  maxSize: number;       // bytes, default 65536 (64KB)
  fields: Record<string, FieldRule>;
}

interface FieldRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}

interface SanitizationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}
```

## MessageIntegrityVerifier

```typescript
sign(payload: object, key: Buffer): SignedMessage
verify(message: SignedMessage, key: Buffer): VerificationResult
deriveKey(masterSecret: Buffer, nodeId: string): Promise<Buffer>

interface SignedMessage { sig: string; ts: number; [key: string]: unknown }
interface VerificationResult {
  valid: boolean;
  reason?: 'invalid_sig' | 'replay' | 'future_ts';
}
```

## CircuitBreaker

```typescript
execute<T>(fn: () => Promise<T>): Promise<T>  // throws CircuitOpenError if open
getState(): CircuitState

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: number;
  nextProbeAt?: number;
}
```

## WatchdogMonitor

```typescript
register(name: string, component: HealthCheckable): void
unregister(name: string): void
getHealthReport(): HealthReport
start(): void
stop(): void

interface HealthCheckable { isHealthy(): Promise<boolean> }
interface HealthReport { [name: string]: { healthy: boolean; consecutiveFailures: number } }
// Events: 'restart' (name), 'system_critical'
```

## AuditEventLogger

```typescript
append(eventType: EventType, actor: string, payload: unknown): AuditEntry
verify(): { valid: boolean; brokenAt?: number }
exportJsonl(): string
getEntries(): AuditEntry[]

type EventType = 'detection' | 'awning_change' | 'model_promote' | 'config_change' | 'auth_attempt' | 'operator_command'
```

## ConfigSecretManager

```typescript
getSecret(name: string): string           // throws if missing
getConfig<T>(name: string, defaultValue: T): T
validateStartup(): { ok: boolean; missing: string[] }
```

## GracefulShutdownManager

```typescript
register(name: string, shutdownFn: () => Promise<void>): void
triggerShutdown(reason: string): Promise<void>
getShutdownStatus(): ShutdownStatus

interface ShutdownStatus {
  phase: 'idle' | 'draining' | 'closing' | 'flushing' | 'done';
  completed: string[];
  pending: string[];
}
```
