# W16 DESIGN — Edge Deployment Optimization + System Integration Hardening

## Overview
W16 is the final integration wave before the EUDIS hackathon demo (March 28, 2026). It focuses on hardening system startup, monitoring edge node performance, enforcing memory budgets on constrained hardware (RPi4/Jetson), and validating end-to-end pipeline correctness across all W9–W15 modules.

## Design Goals
1. Deterministic ordered boot with phase timeouts (SentinelBootSequencer)
2. Sub-200ms inference p99 on RPi4 (EdgePerformanceProfiler + SLA gates)
3. Unified health score visible on dashboard (SystemHealthDashboard)
4. Single source of truth for configuration (ConfigurationManager)
5. Automated cross-system validation before demo (CrossSystemIntegrationValidator)
6. OOM prevention on 1 GB RPi4 heap (MemoryBudgetEnforcer)
7. Tamper-evident OTA packages (DeploymentPackager + SHA-256 manifest)
8. E2E regression guard covering W9–W16 (W16EndToEndIntegration)

## Architectural Decisions
- All modules in `src/system/` — orthogonal to existing feature modules
- No new npm deps — use `node:crypto`, `node:fs/promises`, `node:events`
- ConfigurationManager sits above all other W16 modules (loaded first in boot)
- MemoryBudgetEnforcer uses UTF-16 byte approximation (JSON.stringify * 2) — sufficient for budget enforcement, no native heap introspection required
- DeploymentPackager reuses crypto.createHash('sha256') — same pattern as OTA controller

## Key Interfaces
```
SentinelBootSequencer   → boot(), shutdown(), getBootStatus(), getBootManifest()
EdgePerformanceProfiler → recordLatency(), checkSla(), getReport()
SystemHealthDashboard   → getSystemScore(), getHealthReport(), startPublishing()
ConfigurationManager    → get(), validate(), getSentinelConfig()
CrossSystemIntegrationValidator → runValidation(scenario)
MemoryBudgetEnforcer    → checkBudget(), enforceGc()
DeploymentPackager      → generateManifest(), verifyManifest()
W16EndToEndIntegration  → (test harness only)
```
