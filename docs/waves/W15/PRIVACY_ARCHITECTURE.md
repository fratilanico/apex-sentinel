# W15 PRIVACY ARCHITECTURE

## Secret Non-Exposure

ConfigSecretManager enforces:
- Secrets stored as `process.env` variables only
- Secrets are non-enumerable and frozen — cannot appear in `JSON.stringify`
- No secret values in logs — only secret names logged (e.g. "TELEGRAM_BOT_TOKEN present")

## Audit Log Privacy

AuditEventLogger records:
- `actor`: service name, never PII
- `payload`: sanitized by InputSanitizationGateway before logging
- Hash chain ensures no retroactive deletion

## GDPR Compliance
- No personal data stored in resilience layer
- Audit entries do not contain user identifiers
- Retention: ring buffer auto-purges oldest entries at 10k

## HMAC Key Privacy
- Master key stored only in `HMAC_MASTER_KEY` env var
- Node-specific keys derived via HKDF — master key never transmitted
