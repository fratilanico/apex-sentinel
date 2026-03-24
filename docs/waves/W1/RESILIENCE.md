# APEX-SENTINEL — Resilience Architecture
## W1 | PROJECTAPEX Doc 21/21 | 2026-03-24

---

## 1. Resilience Mandate

APEX-SENTINEL operates in **active conflict-adjacent environments**. The network must function during:
- Power grid failures (sustained outages)
- Internet backbone disruption
- Active jamming of 2.4GHz/5GHz/GPS frequencies
- Physical destruction of nodes (≥45% simultaneous node loss)
- Coordinated cyberattack on backend infrastructure
- Swarm attacks exceeding normal detection capacity

**Target**: Detection capability MUST NOT degrade below 60% effectiveness even when 55% of infrastructure is destroyed or offline.

---

## 2. The 8 Network Pillars — Implementation Spec

### Pillar 1: Redundancy (N+2 Active-Active)

**NATS JetStream Cluster**:
```yaml
# 5-node Raft cluster — survives loss of any 2 nodes
nats_cluster:
  nodes: [nats-1, nats-2, nats-3, nats-4, nats-5]
  quorum: 3  # Raft majority — cluster functional with 3/5 nodes
  replication_factor: 3  # every stream replicated to 3 nodes
  deployment: distributed across 3 geographic zones
```

**Supabase**:
- Primary: `bymfcnwfyxuivinuzurr` (eu-west-2, London)
- Read replica: eu-central-1 (Frankfurt) — auto-promotes on primary failure
- PITR: 7-day point-in-time recovery
- Connection pooling: PgBouncer (max_client_conn: 1000)

**APEX-SENTINEL Services** (all active-active):
| Service | Instances | Load Balancer | Failover Time |
|---------|-----------|--------------|---------------|
| Detection Aggregator | 3 | NATS subject partitioning | <500ms |
| Track Manager | 3 | Consistent hash ring (geo_sector) | <1s |
| Alert Router | 2 | NATS consumer group | <100ms |
| C2 API | 3 | Round-robin (Nginx upstream) | <200ms |

### Pillar 2: Resilience (Circuit Breakers + Bulkheads + DLQ)

**Circuit Breaker Configuration** (all inter-service calls):
```typescript
const breaker = new CircuitBreaker(serviceCall, {
  timeout: 3000,        // 3s timeout per call
  errorThresholdPercentage: 50,  // open at 50% error rate
  resetTimeout: 30000,  // try again after 30s
  volumeThreshold: 10,  // minimum 10 calls before evaluating
});
```

**Bulkhead Isolation**:
- Acoustic processing pool: 8 workers (isolated threadpool)
- RF processing pool: 4 workers (isolated threadpool)
- Gate 4 EKF/LSTM: dedicated queue, never starved by ingestion
- C2 WebSocket connections: max 500 per instance, queue overflow to next

**Dead Letter Queue**:
```
sentinel.gate3.detection → DLQ after 3 failed processing attempts
DLQ retention: 24h
DLQ consumer: hourly replay with manual inspection flag
Alert operator if DLQ depth > 1000 events
```

**Graceful Degradation Levels**:
```
LEVEL 0 (Normal):     All gates operational, full prediction
LEVEL 1 (Degraded):   Gate 1 offline — no radar cueing, Gates 2-5 active
LEVEL 2 (Degraded):   Gates 1-2 offline — acoustic/RF only (INDIGO mode)
LEVEL 3 (Emergency):  Backend offline — nodes operate autonomously, local alerts
LEVEL 4 (Survival):   Internet dead — Meshtastic LoRa mesh, local broadcasts
```

Each degradation level is auto-detected and triggers a system-wide mode change via NATS `sentinel.system.mode` subject.

### Pillar 3: High Availability (99.99% Target)

**Error Budget**: 52.6 minutes downtime/year
**SLO Tracking**: Prometheus + Grafana with SLO burn rate alerts

**Health Check Endpoints**:
```
GET /healthz → liveness (always 200 if process alive)
GET /readyz  → readiness (200 if all deps healthy)
GET /metrics → Prometheus scrape
```

**Deployment Strategy** (zero-downtime):
```yaml
rolling_deploy:
  max_unavailable: 0      # never reduce capacity during deploy
  max_surge: 1            # add 1 extra pod, drain old, repeat
  readiness_probe:
    initial_delay_seconds: 10
    period_seconds: 5
    failure_threshold: 3
```

**Uptime Monitoring**:
- External: UptimeRobot (1-min checks, 5 global locations)
- Internal: Prometheus blackbox exporter
- Alerting: PagerDuty escalation → Telegram → SMS fallback

### Pillar 4: Scalability (Consistent Hash Ring + Auto-Scaling)

**Horizontal Scaling**:
- All services stateless (state in NATS JetStream + Supabase)
- Track Manager: consistent hash ring by `geo_sector` (8-char geohash prefix)
  - Adding instances: rehash only affected sectors — no global re-partition
  - Removing instances: sectors reassigned to neighbours in O(k) time
- Detection Aggregator: partition by `contributing_nodes` hash

**NATS JetStream Partitioning**:
```
Stream: SENTINEL_GATE3
  Subject: sentinel.gate3.detection.{geo_sector}
  Consumers: Track Manager instances subscribe to their hash ring sectors
  Max Age: 24h | Max Bytes: 10GB | Storage: File (disk-backed)
```

**Node Scaling**:
- New phone nodes: self-register via `sentinel.node.register`, immediate participation
- Node discovery: NATS KV store `sentinel.nodes.{node_id}` — eventually consistent
- No central node registry required — mesh auto-heals

### Pillar 5: Modularity (Zero-Impact Add/Remove)

**Module Contract**:
```
Each module publishes to: sentinel.{module_name}.output.{event_type}
Each module subscribes to: sentinel.{upstream_module}.output.*
No module calls another module directly — NATS pub/sub only
Backbone (NATS) = orchestration ONLY, never carries data payloads >64KB
```

**Adding a new sensor gate**:
1. Implement sensor adapter → publish to `sentinel.gate_new.detection`
2. Register module in `sentinel.modules.registry` KV
3. Track Manager auto-subscribes (wildcard consumer)
4. Zero changes to existing modules

**Removing a module**:
1. Stop publishing — consumer groups auto-detect silence
2. Remove from registry
3. Downstream adapts via circuit breaker open → degraded mode

**Canary Deploy Protocol**:
```
10% nodes receive new model/firmware → 24h soak
Monitor: false positive rate, detection rate, crash rate
If no regression: 50% → 100% rollout
Rollback: NATS `sentinel.model.rollback` → all nodes revert in <60s
```

### Pillar 6: Accessibility (Zero-Trust mTLS + RBAC)

**Zero-Trust Network**:
- Every service-to-service call requires valid mTLS client cert
- No implicit trust between services in same network segment
- Service identity = client certificate (SPIFFE/SVID compliant)

**RBAC Matrix**:
| Role | C2 Dashboard | Detection Data | Node Mgmt | Admin |
|------|-------------|---------------|-----------|-------|
| Civilian Node | — | — | Self only | — |
| Operator | View | View | None | — |
| Supervisor | Full | Full | All | — |
| Admin | Full | Full | Full | Full |
| Readonly | View | View | None | — |

**Node Enrolment** (<2s target):
```
1. Node generates key pair in Secure Enclave / Android Keystore
2. CSR → APEX-SENTINEL CA (NATS `sentinel.pki.enroll`)
3. CA signs cert → returns to node via mTLS bootstrap
4. Node stores cert in Keystore
Total: ~800ms on LTE
```

### Pillar 7: Fault Tolerance (Runs DURING Failure)

**Definition**: System CONTINUES to function (degraded but operational) DURING a failure — not just after recovery.

**FPV Attack Scenario** (hardest case):
```
T+0s:   FPV drone launched, GPS jamming starts (GPS nodes lose lock)
T+5s:   Acoustic nodes detect: YAMNet fires on 45% of mesh
T+8s:   Gate 3 event emitted despite GPS loss (NTP-only clock, ±1ms)
T+10s:  Gate 4 EKF tracking with reduced positional accuracy
T+15s:  Alert issued — 85% confidence, ±150m position (degraded from ±62m)
        System did NOT wait for GPS to recover
```

**Failure modes and mitigations**:
| Failure | Behaviour | Recovery |
|---------|-----------|----------|
| NATS node failure | Raft auto-elects, JetStream continues on remaining 3 | <5s, transparent |
| Supabase connection lost | In-memory event buffer (10min), NATS DLQ | Auto-reconnect |
| GPS jamming | Fall back to NTP sync, increase position error ellipse | Automatic |
| 45% node loss | Remaining nodes redistribute, coverage gaps logged | Automatic |
| ML model crash | Fall back to threshold-based detection (no ML) | <1s |
| Internet loss | Meshtastic LoRa + local alert broadcast | Auto mode switch |
| DDoS on C2 | CloudFlare DDoS protection, rate limiting | Automatic |

### Pillar 8: Load Distribution (No Hotspots)

**Consistent Hash Ring** prevents single-sector hotspot:
```
geo_sector = geohash(lat, lon, precision=8)
ring_position = xxhash64(geo_sector) mod RING_SIZE (1024)
owner = binary search on sorted ring → assigned Track Manager instance
```

**JetStream Partitioned Consumers**:
- 8 consumers per stream (configurable)
- Each consumer assigned 1/8 of subjects (by hash)
- Rebalance on consumer add/remove: O(n/8) messages re-routed

**Database Load Distribution**:
- Write path: Supabase primary (via PgBouncer, max 1000 clients)
- Read path: Supabase read replica for dashboard queries
- Heavy analytics: pg_partitioning on `created_at` (monthly partitions)
- Indexes: GiST on `position` (geography), BRIN on `created_at`

**C2 Dashboard CDN**:
- Static assets: CloudFlare CDN (global edge)
- CZML WebSocket: sticky sessions on Track Manager instance (by operator location)
- No single API server handles all dashboard connections

---

## 3. Network Resilience Under Attack

### 3.1 Anti-Jamming
| Frequency Jammed | Impact | Mitigation |
|-----------------|--------|------------|
| 2.4GHz / 5.8GHz (WiFi) | RF detection degraded | Acoustic + SDR still active |
| GPS L1 (1575MHz) | Location uncertainty ↑ | NTP fallback, cell tower location |
| LoRa 868MHz | Meshtastic degraded | WiFi mesh + cellular fallback |
| LTE/5G | Internet loss | Meshtastic LoRa only + local alerts |
| All RF | Comms blackout | Acoustic-only mode, local storage |

### 3.2 Cyber Attack Mitigations
- NATS: TLS 1.3 only, mTLS client certs, IP allowlist for servers
- Supabase: Row Level Security on all tables, service role keys in Vault
- C2 API: Rate limiting (100 req/s per IP), WAF rules, fail2ban
- Node credentials: Hardware-backed Keystore/Secure Enclave — non-exportable

### 3.3 Physical Destruction Scenario
```
Scenario: 60% of Tier 1 smartphone nodes go offline simultaneously

Response:
1. Track Manager detects node silence (heartbeat timeout: 30s)
2. Coverage map updated — dead zones marked in C2 dashboard
3. Remaining nodes increase detection sensitivity (lower threshold: 0.55 → 0.45)
4. NATS rebalances geo_sector assignments to active nodes
5. Alert: "Coverage degraded in sectors [X, Y, Z] — deploy mobile nodes"
6. Tier 2 ESP32 LoRa relay nodes extend mesh into dead zones
7. Detection continues in covered areas — 40% coverage maintains 60% effectiveness
```

---

## 4. SPOF Audit — Zero Confirmed

| Component | Potential SPOF | Resolution | Status |
|-----------|---------------|------------|--------|
| NATS | Single broker | 5-node Raft cluster | ✅ RESOLVED |
| Database | Single Supabase | Primary + replica + PITR | ✅ RESOLVED |
| Track Manager | Single instance | Consistent hash ring, 3 instances | ✅ RESOLVED |
| C2 Dashboard | Single server | CDN static + 3 API instances | ✅ RESOLVED |
| Internet uplink | Single ISP | Cellular fallback + Meshtastic | ✅ RESOLVED |
| GPS time | GPS jamming | NTP fallback + relative timing | ✅ RESOLVED |
| Power | Grid failure | Solar+UPS on fixed nodes (Tier 0/2) | ✅ RESOLVED |
| ML model | Corrupt model | Model versioning + rollback in <60s | ✅ RESOLVED |
| CA/PKI | CA compromise | Offline HSM root CA + intermediate | ✅ RESOLVED |

**Total confirmed SPOFs: 0**

---

## 5. Chaos Engineering Plan

All resilience properties must be continuously validated via chaos experiments:

| Experiment | Method | Frequency | Pass Criteria |
|------------|--------|-----------|---------------|
| NATS node kill | `kill -9` on nats-3 | Weekly | Track continuity, <5s disruption |
| 40% node offline | Shutdown 40% of test nodes | Monthly | Detection rate >60% |
| GPS signal loss | Hardware GPS shield | Monthly | NTP fallback active, alerts continue |
| Database primary fail | Supabase failover test | Monthly | <30s failover, no data loss |
| ML model rollback | Deploy bad model, trigger rollback | Monthly | <60s rollback to previous |
| Internet disconnect | Unplug WAN interface | Monthly | Meshtastic mode active, local alerts |
| DDoS simulation | Load test 10k req/s | Quarterly | Rate limiting active, service stable |

Chaos experiments run via `scripts/chaos-test.sh` in staging environment.

---

## 6. Observability Stack

```
Metrics:  Prometheus → Grafana dashboards + SLO burn alerts
Tracing:  OpenTelemetry → Jaeger (distributed trace per detection event)
Logging:  Structured JSON → Loki → Grafana Explore
Alerting: Alertmanager → PagerDuty → Telegram

Key dashboards:
  - Node fleet health (coverage map, heartbeat status)
  - Detection pipeline latency (P50/P95/P99 per gate)
  - SLO burn rate (99.99% target, 1h/6h/72h windows)
  - NATS stream lag (consumer group health)
  - Threat activity (active tracks, confidence distribution)
```

---

## 7. Resilience Acceptance Criteria

```
[ ] NATS cluster survives loss of any 2 nodes with <5s disruption
[ ] 45% node loss: detection rate remains >60% (INDIGO benchmark)
[ ] GPS jamming: NTP fallback activates within 10s, alerts continue
[ ] Internet loss: Meshtastic mode activates within 30s
[ ] ML model rollback: <60s from trigger to all nodes reverted
[ ] C2 dashboard: remains accessible during backend NATS failure (CDN static)
[ ] Zero SPOFs confirmed in production architecture
[ ] Chaos experiments all pass in staging before W1 complete
[ ] SLO: 99.9% uptime achieved in first 30 days of operation
```

---

*APEX-SENTINEL W1 | RESILIENCE.md | PROJECTAPEX Doc 21/21*
