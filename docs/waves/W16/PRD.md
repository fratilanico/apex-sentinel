# W16 PRD — Edge Deployment Optimization + System Integration Hardening

## Problem
APEX-SENTINEL has 15 completed waves with 2840 passing tests. The system has never been validated as a cohesive unit — each wave was tested in isolation. Before the March 28 hackathon demo the system must:
- Boot deterministically in a known order
- Stay within memory constraints on RPi4 (1 GB heap)
- Surface a real-time health score to operators
- Be deployable with tamper-evident manifests

## User Stories
- As an operator, I want the system to boot in a predictable order so I know what went wrong if a phase fails.
- As a field engineer, I want SLA alerts when acoustic inference exceeds 200ms p99 so I can replace a failing node.
- As a demo presenter, I want a single health score (0–100) to show system vitality during the hackathon presentation.
- As a DevOps engineer, I want deployment manifests with SHA-256 checksums so I can verify OTA package integrity.
- As a QA engineer, I want automated cross-system validation scenarios so I can confirm the pipeline is intact before demo.

## Acceptance Criteria Summary
- FR-W16-01: boot() completes all 8 phases within 10s each; shutdown() reverses order
- FR-W16-02: p50/p95/p99 from rolling 1000-sample window; SLA gates reject > 200ms p99
- FR-W16-03: score 0–100 with documented deduction rules; publishes to NATS every 30s
- FR-W16-04: ENV > file > defaults precedence; validate() catches missing fields
- FR-W16-05: 3 built-in scenarios (NOMINAL/DEGRADED/CRITICAL) each with 5s step timeout
- FR-W16-06: budget enforcement per component; enforceGc() triggers pruneOld()
- FR-W16-07: SHA-256 per file; verifyManifest() detects mismatches
- FR-W16-08: 8+ E2E scenarios covering full W9–W16 surface

## Non-Goals
- No new npm packages
- No database schema changes
- No UI changes
- No changes to existing W1–W15 source files
