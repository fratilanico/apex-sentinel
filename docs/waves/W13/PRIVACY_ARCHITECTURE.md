# W13 PRIVACY ARCHITECTURE

## GDPR Compliance
- NotificationAuditLog stores metadata ONLY: { ts, operatorId, alertId, awningLevel, delivered }
- NO message content stored in audit log
- NO coordinates stored in audit log
- NO personal data of detected subjects stored

## Operator Data
- chatId is treated as personal data (Telegram user identifier)
- Stored in-memory only (no persistence to disk or Supabase in W13)
- removeOperator() fully purges operator from registry

## Alert Content
- AWNING alerts contain grid sector (not precise lat/lon in Telegram messages)
- Trajectory ETAs: time-to-impact only, not raw coordinates transmitted
- droneType: categorical classification, not personal data

## Data Retention
- Audit ring buffer: 500 entries max, automatically overwritten (FIFO)
- No log files written by W13 components
- Rate limiter state: cleared on process restart

## EU AI Act Alignment
- Human-in-the-loop preserved: operators receive alerts and must act
- /silence command gives operators control over notification flow
- All automated decisions are advisories; operators command responses
