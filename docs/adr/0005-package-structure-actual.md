# ADR 0005: Actual package structure (engine folded into app)

- Status: Accepted (2026-06-19)

## Context
projectplan.md §6 specifies a dedicated `engine` package; CLAUDE.md still
lists `packages/engine`. It does not exist — orchestration lives in
packages/app/src (simulationEngine.ts, simulationOrchestrator.ts,
simulationMovementBridge.ts, simulationWorkerClient.ts, useSimulation* hooks).
Two unplanned packages exist: `backend` and `collab`.

## Decision
Accept the current layout: core-gpu, core-behavior, scene-schema, app,
backend, collab. No `engine` package. We do NOT split engine back out now
(YAGNI); if app/src orchestration grows unwieldy it may be extracted later.

## Consequences
- ARCHITECTURE.md and CLAUDE.md describe the real layout.
- CLAUDE.md's "packages/engine" line is corrected (Task 5).
