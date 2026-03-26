# W13 DECISION LOG

## DEC-W13-01: Raw fetch over npm telegram library
- **Decision**: Use global fetch + raw HTTP POST to Telegram API
- **Reason**: No new npm packages allowed per tech constraints
- **Trade-off**: More boilerplate but zero dependency risk

## DEC-W13-02: Injectable httpClient for testability
- **Decision**: TelegramBotGateway constructor accepts optional httpClient mock
- **Reason**: Enables unit tests without real Telegram API calls
- **Pattern**: Same as existing NATS mock patterns in W10-W12

## DEC-W13-03: In-memory state only (no DB in W13)
- **Decision**: Audit log, rate limiter, operator registry all in-memory
- **Reason**: Supabase DDL needs PAT + adds latency; W13 scope is notification delivery
- **Future**: W14 will persist audit log to Supabase

## DEC-W13-04: Object.freeze for audit entries
- **Decision**: Each AuditEntry is frozen after creation
- **Reason**: Audit trail must be immutable (legal/operational requirement)
- **Pattern**: Same pattern as StageTransitionAudit.record() in W10

## DEC-W13-05: Rate limiter uses wall-clock time, no external state
- **Decision**: Rate limiter accepts optional `nowMs` for testing
- **Reason**: Enables deterministic tests without sleep(); follows KB-06 (created_at not updated on retry)

## DEC-W13-06: Box-drawing chars ONLY in all Telegram messages
- **Decision**: Pipe chars (|) forbidden in all formatted output
- **Reason**: Pipe tables do not render in Telegram (Knowledge Brief + CLAUDE.md rule 15)
