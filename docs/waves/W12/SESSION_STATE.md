# W12 SESSION STATE

## Status: IN PROGRESS
## Phase: tdd-red → execute
## Date: 2026-03-26

## Completed
- [x] All 20 wave docs written
- [x] Wave-formation plan phase run
- [x] Directory structure created: src/rf2/, tests/rf2/

## In Progress
- [ ] TDD RED — write failing tests (8 test files)
- [ ] Source implementation (8 source files)
- [ ] All tests GREEN

## Blocked
- Nothing

## Key Decisions Made This Session
- src/rf2/ separate from src/rf/ to avoid breaking W7/W8
- Rule-based classifier (no ML) per brief constraint
- RSSI least-squares for bearing (no TDOA)

## Next Session Continuation
- Run `bash wave-formation.sh checkpoint W12`
- Verify all tests GREEN with `npx vitest run tests/rf2/`
