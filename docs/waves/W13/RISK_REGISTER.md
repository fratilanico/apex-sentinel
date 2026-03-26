# W13 RISK REGISTER

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Telegram API rate limit (30 msg/sec global) | Medium | High | AlertRateLimiter + in-memory queue |
| R2 | Bot token leaked | Low | Critical | Token in env var, never in code |
| R3 | NATS subject mismatch with W10 | Low | High | Integration test FR-W13-08 verifies |
| R4 | Alert fatigue — operators ignore alerts | Medium | High | Rate limiter + SITREP aggregation |
| R5 | In-memory state lost on restart | High | Low | Acceptable for rate limiter (short window) |
| R6 | MarkdownV2 escaping errors | Medium | Medium | Escape function tested with special chars |
| R7 | /trajectory with invalid coords | Low | Low | OperatorCommandParser validates lat/lon |
