# W13 DESIGN — Telegram Operator Bot + Field Alert Notifications

## Overview
W13 adds a real-time Telegram operator notification layer to APEX-SENTINEL. The system detects threats and computes AWNING levels; this wave delivers those alerts to human operators via Telegram with rate limiting, command parsing, audit logging, and hourly SITREPs.

## Components
1. **TelegramAlertComposer** — formats AWNING alerts as MarkdownV2 Telegram messages with box-drawing tables
2. **TelegramBotGateway** — raw HTTP client wrapping Telegram Bot API (no npm libs)
3. **OperatorNotificationRouter** — role-based routing (commander/operator/analyst)
4. **AlertRateLimiter** — prevents alert fatigue: 3 RED/5min/sector, 1 YELLOW/2min/drone type
5. **HourlyStatusReporter** — SITREP generation with box-drawing structure
6. **OperatorCommandParser** — parses /status /sitrep /awning /trajectory /silence commands
7. **NotificationAuditLog** — immutable ring buffer, GDPR-compliant metadata only
8. **TelegramOperatorPipeline** — full integration: NATS subscribe → compose → route → deliver

## Key Design Decisions
- No npm telegram packages — raw fetch only (no external deps added)
- Injectable httpClient for testability
- Box-drawing chars only (no pipe tables)
- Immutable audit entries (Object.freeze)
- Rate limiter is purely in-memory (O(1) lookup via Map)
- Pipeline subscribes to NATS subjects: `awning.alert`, `intel.brief`
