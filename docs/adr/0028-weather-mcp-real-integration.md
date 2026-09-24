# ADR-0028: Weather integration, stage 1 — a real live fetch, converted into scene environment factors

Status: accepted. Builds on `weatherCrowdImpact.ts`/`environmentEffects.ts`
(already real and wired) and the deleted `weatherIntegration.ts` (CLAUDE.md's
孤儿模块 section, removed 2026-08-30).

## Context

CLAUDE.md's V2 Progress section has described this since it was written:
"Weather integration is MCP-ready: normalized live weather snapshots can be
requested via a `weather.current` MCP contract and converted into scene
`environmentFactors`." That description was true of a _contract_, not a
running fetch — `weatherIntegration.ts` was deleted as an orphan
(2026-08-30) because nothing in the app ever called it and its own
justification leaned on an assumption ("the retail scene is indoors") that
does not hold once roads and vehicles (ADR-0016) put real outdoor geometry
in scope. This is item 6 of the ten-item backlog, picked up after ADR-0023
through ADR-0027.

`environmentFactorSchema` (`rain`/`fog`/`snow`/`storm`/`heat`/`cold`/`wind`
among its kinds) and `weatherCrowdImpact.ts`
(`calculateEnvironmentImpact` → `riskScore`/`storeAttractionMultiplier` →
a real dwell-time multiplier, already wired into
`simulationSceneConfig.ts`) are real and already carry a scene-authored
weather factor all the way into crowd behaviour. What was missing —
and what "real MCP" names — is producing those factors from an actual live
weather reading instead of only by hand-authoring them in the editor.

## Decision

### A real fetch to a real, live, public weather API

`weatherMcpClient.ts`'s `fetchCurrentWeather(latitude, longitude,
fetchImpl?)` calls Open-Meteo's forecast endpoint
(`api.open-meteo.com/v1/forecast`) — a real, public, keyless weather API,
not a mock or a fixture — and parses its actual current-conditions response
into a normalized snapshot (temperature, precipitation, wind speed, and the
WMO weather code the response carries). `fetchImpl` defaults to the
platform's own `fetch` but is an explicit parameter so a test can inject a
fake one returning a fixed, realistic response body — this project's
standing way of making a real network boundary decisively testable without
either mocking global state or skipping the assertion. A non-OK response or
a response missing an expected field throws rather than silently returning
a default reading — fail loud, the same standard `movementBackend.ts` and
`vehicleSimulation.ts` already hold.

This is real "MCP-style" integration in the sense the plan's own language
means: a live, external service is actually called and its actual response
is actually parsed. It is not literally the Model Context Protocol
transport — this project's client-side app has no MCP host to call into at
this layer, and inventing one only to wrap a plain HTTPS GET would be
protocol theatre; the honest claim is "the weather data feeding this scene
is now real and live," which is what the plan's own description was
actually asking for.

### WMO weather codes mapped to this project's own factor kinds

`weatherCodeToFactorKind` maps Open-Meteo's WMO weather interpretation
codes (the real, documented table the API itself is built on — fog:
45/48, drizzle/rain: 51-67/80-82, snow: 71-77/85-86, thunderstorm: 95-99)
onto `environmentFactorSchema`'s own kinds. Precipitation intensity
(mm/hour, a real field the API reports) sets `severity` and
`speedMultiplier` via a self-chosen, disclosed linear scaling — not a
fitted meteorological-to-pedestrian-impact model, the same class of
placeholder `weatherCrowdImpact.ts`'s own `0.7`/`0.5` coefficients already
are. Clear or merely cloudy conditions (codes 0-3, and mild temperature and
wind) produce no factor at all — a fair-weather reading correctly leaves a
scene's `environmentFactors` untouched rather than manufacturing a
zero-severity entry nothing downstream needs.

### What this is still not

- **Not continuous live polling inside a running simulation.** This is a
  one-shot conversion utility — call it, get back environment factors to
  place in a scene, the same "requested" framing the original CLAUDE.md
  description used. Nothing here wires a fetch loop into
  `simulationEngine.ts`'s synchronous step function; that would need an
  async-state-injection design this engine does not have anywhere else
  (every other live input — hazards, transit stops, traffic signals — is
  synchronous scene data, not an awaited network call mid-tick).
- ~~Not an editor panel.~~ **Done 2026-09-25**: `WeatherPanel.tsx` fetches
  and applies real weather to the open scene, replacing its own previous
  fetch's factors rather than accumulating them — the same "primitive
  first, UI wiring later" split this backlog's other items (Sobol,
  ADR-0027) already took. See `docs/CLAIMS_LEDGER.md`'s forty-third entry.
- **Not a fitted precipitation-to-severity model.** The linear scaling
  from mm/hour to `severity`/`speedMultiplier` is this project's own
  choice, disclosed as such, not a citation.

## Consequences

- `weatherMcpClient.ts` has no dependency on `simulationEngine.ts` or any
  running scene — it is a pure data-fetch-and-convert utility, callable
  from an editor action, a script, or a future panel with no coupling to
  when or whether a simulation is running.
- The network call itself is only exercised with a real `fetch` at actual
  runtime; every test in `weatherMcpClient.test.ts` injects `fetchImpl`, so
  the test suite makes no real network request and stays deterministic and
  offline, consistent with every other test in this project.
