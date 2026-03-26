# W13 ARCHITECTURE — Telegram Operator Bot

## Component Diagram

```
NATS (awning.alert, intel.brief)
        │
        ▼
TelegramOperatorPipeline
        │
        ├─► AlertRateLimiter ──► (suppress/pass)
        │
        ├─► TelegramAlertComposer ──► formatted MarkdownV2 string
        │
        ├─► OperatorNotificationRouter ──► [chatId, chatId, ...]
        │
        └─► TelegramBotGateway ──► Telegram Bot API (raw HTTP POST)
                │
                └─► NotificationAuditLog (metadata only)

Telegram incoming webhook:
        │
        ▼
OperatorCommandParser ──► HourlyStatusReporter / Stage35TrajectoryPredictor / etc.
```

## Data Flow
1. NATS publishes `awning.alert` with AwningAlert payload
2. Pipeline receives, passes to AlertRateLimiter.shouldDeliver()
3. If deliver=true: TelegramAlertComposer.composeAlert() → MarkdownV2 string
4. OperatorNotificationRouter.routeAlert() → list of operator chatIds by role
5. TelegramBotGateway.sendAlert() for each chatId
6. NotificationAuditLog records metadata

## No External Dependencies
- HTTP calls via global `fetch` (Node 18+)
- No npm telegram packages
- Injectable httpClient for unit tests
