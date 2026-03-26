# W13 PRD — Telegram Operator Bot

## Problem
APEX-SENTINEL detects threats and computes AWNING levels in real-time, but operators have no notification channel. Operators must manually poll dashboards, causing delayed responses.

## Solution
A Telegram-based operator notification system that delivers AWNING alerts instantly with role-based routing, rate limiting, and command-driven queries.

## User Stories
- As a **commander**, I receive de-escalation (WHITE) notifications and RED alerts
- As an **operator**, I receive YELLOW and RED alerts in real-time
- As an **analyst**, I receive hourly SITREPs and YELLOW/RED alerts
- As any operator, I can send /status /sitrep /awning /trajectory /silence commands
- As a system, I do not spam operators — max 3 RED/5min/sector, 1 YELLOW/2min/drone

## Acceptance Criteria
- RED alert delivered to all 3 roles < 2 seconds after AWNING trigger
- Rate limiter suppresses duplicate alerts correctly
- /silence suppresses non-RED for N minutes (max 60)
- Audit log stores metadata only (no message content) — GDPR compliant
- Box-drawing tables render correctly in Telegram
- All 8 FRs pass with ≥10 tests each (~100 total)
