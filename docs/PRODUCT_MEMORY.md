# Product Memory

> 已纳入 `docs/superpowers/specs/2026-06-19-city-sim-engine-design.md`；以该 spec 与 `docs/adr/` 为准。

This file records durable product direction and design intent that should guide
future CrowdSim work. Treat it as project memory, not as a temporary note.

## 2026-06-14 Direction: 2.5D Mall Simulator Editor

The target product experience should move toward a 2.5D, city-builder-like
interface inspired by games such as Cities: Skylines, adapted for indoor malls,
stations, venues, and commercial pedestrian simulation.

Core user workflow:

1. User uploads a first-floor mall plan, CAD export, satellite image, or floor
   plan image.
2. The editor shows the plan as a calibrated basemap.
3. User traces or circle-selects a larger commercial zone.
4. User assigns the zone type, such as jewelry, cosmetics, dining, fashion,
   service, entertainment, anchor store, corridor, atrium, or emergency area.
5. Inside that zone, user box-selects or draws store lots.
6. The system automatically grows those lots into 2.5D storefronts, counters,
   shelves, signs, display windows, entrances, queue areas, and visual blocks.
7. Each generated store remains editable: name, brand, category, size,
   attraction, capacity, dwell time, service rate, price tier, promotion,
   visibility, queue geometry, opening hours, conversion rates, and any custom
   parameters.
8. User defines or links a brand profile for each store.
9. Brand parameters feed directly into the agent decision model and analytics:
   brand power, persona affinity, loyalty, novelty, promotion strength,
   visibility, price fit, social pull, queue penalty, crowd penalty, and
   distance cost.
10. The simulation then shows how agents move, browse, queue, enter stores,
    abandon queues, respond to events, and evacuate.

The editor should feel like a practical simulation workbench, not a marketing
page. The first screen after project load should be the actual usable 2.5D
scene editor.

## 2.5D Interaction Requirements

- Use an isometric or oblique 2.5D scene for day-to-day editing and playback.
- Keep floor-plan tracing precise in a top-down mode, with a quick switch to
  2.5D visualization.
- Zone selection should support freehand lasso, polygon drawing, rectangle
  selection, and snapping to detected plan boundaries.
- Store lots should be auto-generated from zone boundaries where possible, but
  every generated lot must be manually editable.
- Storefront generation should be deterministic from scene seed, zone type, and
  brand/store parameters.
- Generated storefronts are visual and semantic objects: they must create
  simulation targets, entrance points, queue anchors, dwell areas, and analytics
  IDs.
- The user should be able to define arbitrary custom fields on stores and
  brands without breaking the core schema.

## Brand And Store Semantics

The store model should support:

- store name
- brand name
- category and subcategory
- brand power
- persona affinity by customer type
- price tier
- novelty
- promotion strength
- visibility
- frontage width
- entrance position
- capacity
- dwell time distribution
- service time distribution
- queue patience effects
- opening and closing schedule
- conversion probability
- repeat-visit or loyalty effects
- social-media or event boost
- custom parameters

These values should feed both visual generation and behavior:

- High visibility increases route-side awareness.
- Strong brand power increases long-distance attraction.
- Persona affinity changes store choice by agent type.
- Price mismatch lowers probability for unsuitable budgets.
- Promotion strength creates event-driven spikes.
- Queue length and crowding reduce entry probability.
- Jewelry, cosmetics, dining, and service categories should have distinct dwell,
  browsing, and group behavior defaults.

## Environment And Natural Factor Layer

Add a separate environmental disturbance layer rather than hard-coding weather
inside agent behavior.

Environmental factors should include:

- weather: clear, rain, snow, fog, heat, cold, wind, storm
- natural hazards: smoke, fire, flood, earthquake, collapse, lightning, extreme
  heat
- facility disruptions: escalator outage, elevator outage, gate failure,
  exit closure, construction barrier, power outage, staff guidance, announcement
- social/operational shocks: promotion event, concert release, train delay,
  school dismissal, holiday surge, rumor, lost companion, sudden crowd wave

The environment layer should affect:

- route cost maps and Flow Field costs
- walking speed and acceleration
- visibility distance
- ground friction and passability
- perceived risk
- patience and queue abandonment
- store dwell time
- exit choice
- group cohesion and companion search
- staff-guided routing

Initial MVP factors:

1. rain
2. fog
3. smoke
4. exitClosed
5. escalatorOutage
6. promotionSurge

Future real-weather requirement:

- Add a weather provider interface that can receive live weather from an MCP
  tool or real weather API.
- The provider should return a normalized weather snapshot with location,
  timestamp, condition, precipitation, temperature, wind, and visibility.
- The normalized snapshot should convert into `environmentFactors` such as rain,
  fog, snow, storm, heat, cold, or wind.
- Weather ingestion must remain replaceable: MCP, public weather APIs, national
  weather services, or private commercial providers should all map through the
  same adapter.
- Live weather must be recorded into scene/report metadata so simulation results
  are reproducible.

Each factor should expose:

- id
- kind
- severity
- affected area or target entity
- startsAtSeconds
- endsAtSeconds
- speedMultiplier
- visibilityMultiplier
- routeCostMultiplier
- riskScore
- behaviorTags

## Agent Human-Likeness Direction

Agents should become human-like through layered constraints:

1. Body: speed, radius, acceleration, fatigue, mobility limits.
2. Perception: field of view, visibility, signage, local density, queue length,
   shop visibility, hazard awareness.
3. Cognition: intent, time pressure, budget, patience, risk avoidance, loyalty,
   curiosity, sociality.
4. Memory: previous store visits, known exits, familiar routes, failed queues,
   seen hazards, companion location.
5. Social behavior: family/group following, waiting, regrouping, herd behavior,
   panic contagion, staff compliance.
6. Physics: Social Force / ORCA / Flow Field remains the auditable movement
   backbone.
7. Data-driven residuals: small ML models may calibrate residual behavior, but
   must remain toggleable and benchmark-gated.

LLMs should not run per agent per frame. Use LLMs for scene drafting, event
authoring, scenario explanation, persona generation, and slow strategic
decisions for representative agents. Large-scale behavior should compile those
outputs into deterministic parameters and rules.

## Near-Term Implementation Plan

1. Extend `scene-schema` with environment factors, zones, store lots, brand
   custom parameters, and optional 2.5D visual metadata.
2. Add a floor-plan import and calibration workflow: upload image, set scale,
   trace zones, detect low-confidence boundaries, and store basemap metadata.
3. Add zone and lot editing to the scene editor: polygon/lasso/rectangle tools,
   snapping, category assignment, and generated store entities.
4. Add deterministic store visual generation from zone type and brand profile.
5. Connect generated stores to existing brand attraction and dashboard signals.
6. Add environment factors to event scripts and Flow Field route-cost updates.
7. Build scenario comparison presets: clear day, rain, fog, smoke, exit closed,
   promotion surge, escalator outage.
8. Keep every change covered by focused tests, especially schema parsing,
   deterministic generation, route-cost effects, and behavior-score changes.

## Design Guardrails

- Prefer real usable tools over landing pages.
- The editor should be dense, clear, and operational.
- 2.5D visuals should help users understand stores, zones, queues, and crowd
  movement, but precise geometry editing must remain available.
- Store/brand parameters must be explainable in analytics.
- Weather and hazard effects must be visible in reports, not just visual
  decoration.
- Simulation credibility is more important than spectacular visuals.
