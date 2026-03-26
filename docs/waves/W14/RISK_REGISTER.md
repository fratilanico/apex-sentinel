# W14 RISK_REGISTER

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R1 | SSE client leak on disconnect | Medium | High | Test cleanup in FR-W14-02 |
| R2 | Port 8080 conflict on demo machine | Low | High | Make port configurable via env |
| R3 | Demo scenario timing too fast for judges | Medium | Medium | Configurable interval multiplier |
| R4 | NATS not available in demo environment | Medium | High | Demo scenarios work without NATS |
| R5 | Rate limiter blocks legitimate judge traffic | Low | Medium | High limit (60/min) + SSE exempt |
