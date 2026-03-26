# W16 API SPECIFICATION

## SentinelBootSequencer
```typescript
boot(): Promise<BootManifest>
shutdown(): Promise<void>
getBootStatus(): BootStatus
getBootManifest(): BootManifest | null

interface BootStatus {
  phase: number;          // 0-8
  phaseName: string;
  elapsed_ms: number;
  errors: string[];
}

interface PhaseResult {
  phase: number;
  name: string;
  elapsed_ms: number;
  success: boolean;
  error?: string;
}

interface BootManifest {
  phases: PhaseResult[];
  totalElapsed_ms: number;
  success: boolean;
}
```

## EdgePerformanceProfiler
```typescript
recordLatency(component: string, latency_ms: number): void
checkSla(component: string): SlaResult
getReport(): Record<string, SlaResult>

interface SlaResult {
  pass: boolean;
  p50: number;
  p95: number;
  p99: number;
  sla: number;
  samples: number;
}
```

## SystemHealthDashboard
```typescript
getSystemScore(): number          // 0-100
getHealthReport(): HealthReport
startPublishing(intervalMs?: number): void
stopPublishing(): void

interface ComponentHealth {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  detail?: string;
}

interface HealthReport {
  score: number;
  components: ComponentHealth[];
  degradations: string[];
}
```

## ConfigurationManager
```typescript
get<T>(key: string, defaultValue?: T): T
validate(): ValidationResult
getSentinelConfig(): SentinelConfig

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

## CrossSystemIntegrationValidator
```typescript
runValidation(scenario: IntegrationScenario): Promise<ValidationReport>

type IntegrationScenario = 'NOMINAL' | 'DEGRADED' | 'CRITICAL'

interface StepResult {
  step: string;
  pass: boolean;
  elapsed_ms: number;
  error?: string;
}

interface ValidationReport {
  pass: boolean;
  scenario: IntegrationScenario;
  steps: StepResult[];
  totalElapsed_ms: number;
}
```

## MemoryBudgetEnforcer
```typescript
checkBudget(componentName: string, estimatedBytes: number): BudgetResult
enforceGc(component: PruneableComponent): void
registerBudget(componentName: string, budgetBytes: number): void

interface BudgetResult {
  ok: boolean;
  used: number;
  budget: number;
  componentName: string;
}

interface PruneableComponent {
  pruneOld(): void;
}
```

## DeploymentPackager
```typescript
generateManifest(files: string[]): Promise<DeploymentManifest>
verifyManifest(manifest: DeploymentManifest, actualFiles: string[]): Promise<VerifyResult>

interface DeploymentManifest {
  version: string;
  ts: string;
  files: { path: string; sha256: string }[];
  totalFiles: number;
}

interface VerifyResult {
  valid: boolean;
  mismatches: string[];
}
```
