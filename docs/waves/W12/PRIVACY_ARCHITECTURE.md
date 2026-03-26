# W12 PRIVACY ARCHITECTURE

## Threat Model
RF packet captures can contain MAC addresses and device serial numbers that are
personally identifying under GDPR Art. 4(1). The RF layer must not publish these
downstream.

## Controls

### MAC Address Hashing (FR-W12-07)
- Algorithm: SHA-256 with daily rotating key.
- Key derivation: HMAC-SHA256(secret, ISO-date-string).
- Same device MAC on the same day produces the same hash — enables session
  correlation without persistent re-identification.
- Key rotates at 00:00 UTC daily — cross-day linkage is broken.

### Raw Packet Content Stripping
- `rawPacketContent` field is removed before NATS publish.
- Only frequency, RSSI, timestamp, and bearing estimates are published.

### Bearing Estimate Privacy
- Bearing estimates are coarsened to 100 m grid before publication.
- Sub-100 m precision is only available within the local node process.

### Session ID Ephemerality
- Session IDs (`RF-{YYYYMMDD}-{seq}`) are in-process only.
- Not persisted to Supabase (session metadata written to JSONB, not as a FK).
- Session IDs cannot be linked to persistent device or operator identifiers.

## GDPR Compliance
- Processing basis: Art. 6(1)(e) — public task / security.
- No special category data processed (RF frequencies ≠ biometric data).
- Data minimisation: only frequency/RSSI/bearing retained post-filter.
- Retention: in-process session state cleared after 60 s inactivity.
