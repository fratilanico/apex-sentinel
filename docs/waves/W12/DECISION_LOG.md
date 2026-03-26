# W12 DECISION LOG

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Put W12 sources in `src/rf2/` not `src/rf/` | Avoids breaking W7/W8 imports; clean separation | 2026-03-26 |
| 2 | Rule-based classifier, no ML | Frequency bands are published specs; ML adds latency with no accuracy gain at this stage | 2026-03-26 |
| 3 | Least-squares RSSI localisation, not TDOA | TDOA requires sub-microsecond time sync; RSSI-based is simpler and good enough for 500 m accuracy | 2026-03-26 |
| 4 | Daily-keyed MAC hash (not static hash) | Breaks cross-day linkage; GDPR data minimisation; still enables intra-day session correlation | 2026-03-26 |
| 5 | No new npm packages | Constraint from project brief; all required math is achievable with built-in JS/TS | 2026-03-26 |
| 6 | In-process session state only | Supabase writes add latency; session state is ephemeral by design; privacy benefit | 2026-03-26 |
| 7 | 60 s inactivity timeout for sessions | Matches drone operational tempo; long enough to survive brief RF dropouts | 2026-03-26 |
| 8 | Confidence threshold 0.60 for classification | Below this, false positive risk outweighs tactical value; return `unknown` | 2026-03-26 |
