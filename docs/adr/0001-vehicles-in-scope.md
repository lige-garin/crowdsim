# ADR 0001: Vehicles and traffic are in scope

- Status: Accepted (2026-06-19)
- Supersedes: projectplan.md §5 ("❌ 不做车辆/轨道仿真 —— 只做行人")

## Context
The product direction was changed to a Cities: Skylines-style living-city
simulation (see docs/superpowers/specs/2026-06-19-city-sim-engine-design.md).
The user explicitly chose a full traffic sandbox over pedestrian-only.

## Decision
Vehicle/traffic simulation (road network, lanes, intersections/signals,
car-following à la IDM/Krauss, vehicle routing, congestion) is now in scope,
delivered in sub-project SP-3. It is a SECOND simulation paradigm, decoupled
from social-force pedestrians; the two share the GPU + render foundation only.

## Consequences
- The projectplan.md §5 "pedestrians only" boundary is void.
- SP-3 gets its own spec before implementation.
- Pedestrian social-force work (SP-1) is unaffected and proceeds first.
