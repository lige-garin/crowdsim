# ADR 0003: City-Sim Engine direction supersedes projectplan.md

- Status: Accepted (2026-06-19)

## Context
projectplan.md §4/§5 (pedestrian crowd MVP, hard boundaries) no longer match
the product. CLAUDE.md, PRODUCT_MEMORY.md, and V2_PLAN.md had diverged and
contradicted each other and the code.

## Decision
The single source of truth is
docs/superpowers/specs/2026-06-19-city-sim-engine-design.md plus docs/adr/.
projectplan.md becomes a historical record (header notice added in Task 5).
CLAUDE.md is corrected to point at the spec. PRODUCT_MEMORY.md and V2_PLAN.md
are annotated as inputs folded into / superseded by the spec.

## Consequences
- Future "what are we building" questions resolve to the spec, not projectplan.
- Boundary changes are recorded as new ADRs, not silent CLAUDE.md edits.
