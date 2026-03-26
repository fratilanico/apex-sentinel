# W14 DECISION_LOG

## DEC-W14-01: Pure Node.js http, no Express
Rationale: Zero new npm packages. Hackathon constraint. http module is sufficient for 8 routes.

## DEC-W14-02: In-memory state only
Rationale: Demo context. Simplicity > durability. No Supabase dependency for dashboard layer.

## DEC-W14-03: CORS * for demo
Rationale: Judges may access from any origin. Post-hackathon: add auth.

## DEC-W14-04: SSE over WebSocket
Rationale: SSE is simpler (plain HTTP, no upgrade), sufficient for push-only updates.
Frontend can use EventSource API natively.

## DEC-W14-05: 0.01° coarsening for Stage 2
Rationale: 0.01° ≈ 1.1km at equator. Enough for situational awareness without precise targeting from unauthenticated endpoint.

## DEC-W14-06: DemoScenarioEngine emits via EventEmitter
Rationale: Decoupled from HTTP layer. Tests can subscribe to events without running HTTP server.

## DEC-W14-07: Token bucket per IP (in-memory)
Rationale: Protects against judge accidentally hammering the demo. No Redis needed for demo context.
