# W13 API SPECIFICATION

## TelegramAlertComposer
```typescript
composeAlert(awningAlert: AwningAlert): string
composeIntelBrief(intelBrief: IntelBrief): string
composeHourlyStatus(stats: SitrepStats): string
```

## TelegramBotGateway
```typescript
constructor(config: { botToken: string; chatId: string; httpClient?: HttpClient })
sendAlert(text: string): Promise<SendResult>
sendSilent(text: string): Promise<SendResult>
getStats(): GatewayStats
// GatewayStats: { sent, failed, dropped, rateLimited }
// SendResult: { ok: boolean; error?: string }
```

## OperatorNotificationRouter
```typescript
addOperator(operatorId: string, role: OperatorRole, chatId: string): void
removeOperator(operatorId: string): void
routeAlert(awningAlert: AwningAlert): Promise<string[]>  // returns notified operatorIds
// OperatorRole: 'commander' | 'operator' | 'analyst'
```

## AlertRateLimiter
```typescript
shouldDeliver(alert: RateLimitInput, history: AlertHistory): RateLimitResult
getAlertCooldown(sector: string, level: 'RED' | 'YELLOW'): number
// RateLimitResult: { deliver: boolean; reason?: string; cooldownMs?: number }
```

## HourlyStatusReporter
```typescript
generateSitrep(stats: SitrepStats): string
// SitrepStats: { detectionCount, awningHistory: AwningEntry[], dominantDroneType, coveragePercent }
```

## OperatorCommandParser
```typescript
parse(text: string): ParsedCommand
// ParsedCommand: { command, args, valid, error? }
// Commands: /status /sitrep /awning /trajectory /silence
```

## NotificationAuditLog
```typescript
record(entry: AuditEntry): void
getRecentNotifications(windowMs: number): AuditEntry[]
getDeliveryRate(windowMs: number): { sent: number; failed: number; rate: number }
```

## Telegram Bot API (raw HTTP)
POST `https://api.telegram.org/bot{TOKEN}/sendMessage`
Body: `{ chat_id, text, parse_mode: 'MarkdownV2', disable_notification? }`
