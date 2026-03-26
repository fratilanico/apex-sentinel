# W13 ACCEPTANCE CRITERIA

## FR-W13-01 TelegramAlertComposer
- AWNING RED message contains emoji 🚨, "AWNING RED", droneType, stage number
- AWNING YELLOW message contains ⚠️ and "Potential {droneType}"
- AWNING WHITE message contains ✅ and "All clear"
- Trajectory block uses box-drawing chars only (no pipe chars)
- Intel brief truncated to max 5 lines
- MarkdownV2 special chars escaped

## FR-W13-02 TelegramBotGateway
- sendAlert() POSTs to correct Telegram URL with parse_mode=MarkdownV2
- sendSilent() sets disable_notification=true
- Retries once on 429 response
- Rate limit: drops oldest if >20 messages/minute queued
- getStats() returns accurate counters

## FR-W13-03 OperatorNotificationRouter
- RED → all 3 roles notified
- YELLOW → operator + analyst only
- WHITE → commander only
- Intel brief → analyst only
- addOperator/removeOperator work correctly

## FR-W13-04 AlertRateLimiter
- RED: max 3 per 5 minutes per sector — 4th suppressed
- YELLOW: max 1 per 2 minutes per drone type — duplicate suppressed
- CRITICAL escalation bypasses rate limit
- shouldDeliver returns cooldownMs when suppressed

## FR-W13-05 HourlyStatusReporter
- SITREP contains SUMMARY, DETECTIONS, AWNING HISTORY, THREAT MATRIX sections
- Box-drawing chars used for structure
- dominantDroneType and coveragePercent appear in output

## FR-W13-06 OperatorCommandParser
- /status, /sitrep, /awning parse correctly (valid=true)
- /trajectory 48.5 23.1 → args={lat:'48.5', lon:'23.1'}
- /silence 30 → args={minutes:'30'}
- /silence 90 → error (max 60)
- Unknown command → valid=false

## FR-W13-07 NotificationAuditLog
- Ring buffer caps at 500 entries
- getRecentNotifications returns descending order
- getDeliveryRate calculates rate correctly
- No message content in entries

## FR-W13-08 TelegramOperatorPipeline
- RED alert triggers delivery to all roles
- Rate-limited alert is suppressed and not delivered
- /sitrep command triggers HourlyStatusReporter
- De-escalation (WHITE) notifies commander only
- Audit log records all delivery attempts
