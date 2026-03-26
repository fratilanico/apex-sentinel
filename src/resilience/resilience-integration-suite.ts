/**
 * FR-W15-08: ResilienceIntegrationSuite
 * Re-exports all resilience components for easy integration and testing.
 */

export { InputSanitizationGateway } from './input-sanitization-gateway.js';
export type { SanitizationSchema, SanitizationResult, FieldRule } from './input-sanitization-gateway.js';

export { MessageIntegrityVerifier } from './message-integrity-verifier.js';
export type { SignedMessage, VerificationResult, VerificationReason } from './message-integrity-verifier.js';

export { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
export type { CircuitBreakerState, CircuitBreakerOptions } from './circuit-breaker.js';

export { WatchdogMonitor } from './watchdog-monitor.js';
export type { HealthCheckable, HealthReport, WatchdogOptions, ComponentHealth } from './watchdog-monitor.js';

export { AuditEventLogger } from './audit-event-logger.js';
export type { AuditEntry, EventType, AuditLoggerOptions } from './audit-event-logger.js';

export { ConfigSecretManager } from './config-secret-manager.js';
export type { StartupValidationResult } from './config-secret-manager.js';

export { GracefulShutdownManager } from './graceful-shutdown-manager.js';
export type { ShutdownStatus, ShutdownPhase, GracefulShutdownOptions } from './graceful-shutdown-manager.js';
