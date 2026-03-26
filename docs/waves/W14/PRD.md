# W14 PRD — Demo Dashboard API

## Problem
Hackathon judges need to SEE the APEX-SENTINEL system working in real time.
Current system has no HTTP interface. Judges cannot observe AWNING levels, detections, or trajectories.

## Solution
REST + SSE API backend that exposes the full threat picture.
Any browser-based frontend can connect and render the live picture.

## Success Criteria
- GET /health, /awning, /detections, /intel, /nodes all return valid JSON within 50ms
- SSE /stream delivers events within 100ms of internal state change
- Demo scenarios run end-to-end without manual intervention
- Privacy: Stage 1 detections never expose lat/lon to unauthenticated callers
- System handles 100 concurrent SSE clients without crashing

## Out of Scope
- Frontend HTML/JS (separate concern)
- Persistent storage (in-memory only for demo)
- Authentication (demo mode: CORS *)
