# W13 DATABASE SCHEMA

## In-Memory Only
W13 operator notification layer is fully in-memory. No new Supabase migrations required.

## NotificationAuditLog Ring Buffer
- Max 500 entries (configurable)
- Each entry: `{ ts, operatorId, alertId, awningLevel, delivered, error? }`
- Object.freeze — immutable entries
- No message content stored (GDPR compliance)

## AlertRateLimiter State
- `sectorHistory: Map<string, number[]>` — timestamps of RED alerts per sector
- `droneTypeHistory: Map<string, number>` — last YELLOW timestamp per drone type
- Cleared on process restart (acceptable — rate limits are short-window)

## OperatorNotificationRouter Registry
- `operators: Map<operatorId, { role, chatId }>` — in-memory only
- Populated via addOperator() at startup from config

## Future (W14 candidate)
- Persist audit log to Supabase `notification_audit` table
- Persist operator registry to `operator_registry` table
