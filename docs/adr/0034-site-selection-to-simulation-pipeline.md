# ADR 0034: Site selection → generated 3D scene → POI-driven simulation

- Status: **Proposed — design only, no code written** (2026-10-05). Awaiting  
  approval. Everything below is a decision record and a data contract, not a  
  claim that any of it works.
- Touches: nothing yet. Proposed homes are listed under Stage plan.
- Related: ADR-0006 (no silent degradation; labelled fallbacks), ADR-0011  
  (population profiles), ADR-0008 (entrance/exit constraints),  
  ADR-0033 (the 2,000-agent cap this design has to respect),  
  `docs/CLAIMS_LEDGER.md` (every inferred quantity must be disclosed there).

## Context

The product shape changes: instead of the user hand-building a scene, the  
user picks a place on a map and the app produces both the scene and its  
demand.

The user's flow, verbatim:

> 用户在地图上输入一个位置，或者点一个位置，或者搜索出来一个位置 → 我们自动  
> 生成一个区域，例如范围 3 公里 → 生成模型（依据真实数据，例如多少学校，多少  
> 办公楼，多少商场，公交站点；以后可能会接入百度热力图，或者美团的 APIKEY）  
> → 用户填店铺信息的表单 → 做仿真。

Two existing codebases are involved, both read and verified in this session  
(baseline `HEAD`, not the working tree):

### `caidian` — the user's other project (`lige-garin/caidian`, private)

An Express + Prisma + PostgreSQL/Redis + React/Vite site-selection SaaS with  
one commit (`8cd12a5`, 2026-06-05). What matters here:

- `packages/backend/src/services/amapService.ts` (1,500 lines) genuinely does  
  the work: `fetchAllLayers` fans out 12 POI layers  
  (competitor / subway / bus / school / residential / office / hospital /  
  mall / hotel / bank / market / population) with four distinct de-duplication  
  passes (school campuses, residential communities, office tenants in one  
  tower, bus stops at one intersection), three-ring coverage scoring, a  
  mall-interior supplement search, radius filtering, and QPS batching.
- `packages/backend/src/services/analysisService.ts` scores five dimensions  
  (population 25% / competition 20% / transport 20% / amenity 15% / consumer  
  20%) and emits `estimatedResidents`, `estimatedDaytimeWorkers`,  
  `estimatedDailyFlow`, `competitionLevel`, and a rent band, all with  
  distance weighting `0.25 + 0.75·(1−ratio)^1.3`.
- **It has no geometry at all.** Grepping `building|footprint|3d|geometry`  
  across `amapService.ts`, `routes/analysis.ts` and `prisma/schema.prisma`  
  returns zero hits. It is POI _points_ only.
- **Its coefficients are invented, not calibrated.** `AVG_HOUSEHOLDS = 780`,  
  `AVG_PERSONS = 2.7`, `AVG_OFFICE_WORKERS = 560`, `AVG_SCHOOL_PERSONS = 780`,  
  and the `estimateDailyFlow` weights (subway ×11000, bus ×260, mall ×7600,  
  office ×280, residential ×130) carry no citation anywhere in the file.  
  This is fine for a scoring heuristic and is **not** fine to present as  
  measured demand. It is the single most important thing this ADR has to  
  contain.

### `map3d` (`cartesiancs/map3d`, 2,436 stars, MIT) — the reference for "框选生成 3D"

The user pointed at "在地图上框选一个区域，点击生成，就可以生成这个区域的 3D  
模型" and this is the project that does exactly that, verified by reading its  
source:

- Leaflet `Rectangle` drag → bounds → generate → optional GLB export.
- **Data comes from Overpass, directly and with no key**:  
  `way["building"](bbox); relation["building"](bbox); out body geom;` and  
  `way["highway"](bbox)` against `https://overpass-api.de/api/interpreter`.
- Geometry is `THREE.Shape` → `ExtrudeGeometry({ depth: height })`, with  
  height from `tags.height`, else `building:levels × 2.2`, else a flat  
  **10 m default**.
- Its projection is `x = (lng − refLng) · scale · cos(refLat·π/180)`,  
  `y = (lat − refLat) · scale` with **`scale = 51000`**. That is a display  
  constant, not metres (1° of latitude is ≈111,320 m). Its scenes are  
  therefore not to scale.
- GLB export is local (`GLTFExporter` from `three/examples/jsm`); only the  
  "upload to a fleet space" branch calls its own closed backend.
- Its README states outright that it cannot guarantee data accuracy because  
  OSM heights are missing or wrong.

### What CrowdSim already has that this can stand on

- `packages/app/src/editor/storeLotGeneration.ts` — `generateStoreLotsForZone`  
  already creates a brand profile + shop + store lot triple from a zone, with  
  per-category persona affinity, price tier and dwell multipliers. `dining`  
  and `restaurant` already exist in `brandCategorySchema`  
  (`packages/scene-schema/src/sceneSchemaBase.ts:150`).
- `customParametersSchema` is `z.record(z.string(), z.unknown())`  
  (`sceneSchemaBase.ts:21`) — arbitrary shop-form fields can ride along  
  **without a schema change**.
- `entranceSchema.arrivalProfile` (`sceneSchemaBase.ts:103`) already takes  
  `intervalMinutes` + `ratesPerMinute[]`. This is the exact seam a demand  
  model writes into.
- `packages/app/src/editor/sceneEditorBasemap.ts` and `geojsonImport.ts`  
  already cover basemap and GeoJSON import.

### Three facts that constrain the design, and one that breaks a naive one

1. **`crowdBudget.maxAgents` is hard-capped at 2,000**  
   (`packages/app/src/engine/crowdBudget.ts:20`).
2. **README line 64 promises a default build makes no network requests.**  
   Wiring AMap/Overpass/Baidu into CrowdSim would void that.
3. **`geojsonImport.ts:99` writes `x: coordinate[0], y: coordinate[1]`** — it  
   copies longitude/latitude straight into scene metres. Shenyang is around  
   (123.4, 41.8), so a GeoJSON import today produces a ~123 m × 42 m scene.  
   Any map-driven flow needs a real projection layer first.
4. **A 3 km radius cannot be the simulation domain.** π·3000² is 28.3 km².  
   caidian's own estimator turns ~50 residential POIs into ~105,000 residents.  
   Even a 1%-a-day capture rate spread over a 12-hour day is ~1.5 people a  
   minute, which is simulatable — but the _scene_ would be 3 km across,  
   where nobody walks, and every arriving agent would have to be spawned  
   kilometres from the shop. Pedestrian simulation is meaningless at that  
   scale, and the arrival mechanism (car, bus, metro) is not modelled at all.

## Decision

### D1 — The two projects are coupled by a file, not by an API

`caidian` gains an "export for CrowdSim" action that writes a **site context  
bundle** (JSON). CrowdSim gains an importer. CrowdSim itself never calls AMap,  
Baidu, Meituan or Overpass.

Reasons, in the order that matters:

- It keeps README:64 true. "No network requests" is a real differentiator for  
  this project and is not worth trading away for convenience.
- Keys, quotas, membership tiers and payments already exist in caidian.  
  Moving them would duplicate all of it.
- **The seam becomes a pure data contract** — versionable, reviewable, and  
  unit-testable offline with a checked-in fixture. That fits this project's  
  rule that every assertion is verified without needing to mock a network.

### D2 — Two domains: a 3 km _catchment_ (demand) and a ~300 m _site_ (simulation)

This is the decision that makes the rest coherent, and it is a scale split,  
not a simplification:

|          | Catchment                                                   | Site                                          |
| -------- | ----------------------------------------------------------- | --------------------------------------------- |
| Radius   | 3 km (user-adjustable)                                      | ~300 m around the storefront, or the interior |
| Produces | POI counts, demand estimate, persona mix, competition split | The actual `CrowdSimScene`                    |
| Feeds    | `entrance.arrivalProfile`, `population.mix`                 | walls, shops, doors, queue anchors            |
| Contains | No pedestrians                                              | Every simulated agent                         |

The catchment exists only to compute **how many people arrive at the site  
door per minute, and who they are**. It contributes no geometry. The site is  
what gets simulated.

Consequence to state plainly: **the walk from a residential compound 2 km away  
is not simulated.** It is represented as an arrival rate at the site boundary.  
That is honest — the model has no car/bus/metro mode — and it must be  
disclosed rather than papered over with fake walking agents.

### D3 — Data sources are adapters behind one interface, and only two ship

One `SiteDataProvider` interface; implementations are added as they become  
legally and technically available.

| Source                   | Status                                     | Note                            |
| ------------------------ | ------------------------------------------ | ------------------------------- |
| AMap POI (via caidian)   | **Ships.** caidian already calls it        | GCJ-02 coordinates              |
| Overpass / OSM buildings | **Ships.** Free, no key, verified in map3d | WGS-84; needs GCJ-02 conversion |
| 百度热力图               | **Does not ship — no such open API**       | See below                       |
| 美团                     | **Does not ship**                          | No public footfall API          |

On 百度热力图 specifically, because it was named: the Baidu Maps open platform  
heatmap is a **rendering** layer, not a data API — Baidu's own SDK doc draws  
the distinction explicitly ("自定义热力图 … 需要开发者传入自己的位置数据 …  
此处的'热力图功能'不同于'百度城市热力图'"), and getting the underlying point  
set is not offered. The real population/footfall data lives in **百度地图慧眼**  
(renqi.baidu.com), a **commercially licensed product** requiring application  
and approval, not an open API. It is therefore wrong to put it on a roadmap  
as if it were a key to paste in. The adapter interface is what we build; that  
provider is a business-development question, not an engineering one.

### D4 — A real projection layer, in metres, written down

A single module converts geographic coordinates to scene metres around a  
chosen origin, and its inverse. CrowdSim's force model is entirely in metres  
(Weidmann density–speed curve, 0.23 m body radius, desired speeds), so  
borrowing map3d's `scale = 51000` would put every simulation 2.2× out of  
scale. The layer owns:

- WGS-84 ↔ GCJ-02 conversion (AMap is GCJ-02, OSM is WGS-84; they differ by  
  hundreds of metres in China and cannot be mixed).
- A local tangent-plane projection to metres, origin at the site.
- Direction handling: OSM gives `lat/lon`; CrowdSim's renderer maps scene  
  coordinates through `toRenderX`/`toRenderY`  
  (`packages/app/src/viewport/simulationViewportGeometry.ts:21,25`). One  
  conversion, one place.

### D5 — Every inferred number is labelled as inferred

The chain "POI counts → people → arrivals per minute" contains at least four  
steps with **no measured basis** in either codebase:

1. POI count → population (caidian's 780 households / 2.7 persons / 560  
   office workers).
2. Population → visits per day (a capture rate that does not exist anywhere).
3. Visits per day → arrivals per 15-minute slot (the lunch/dinner peak shape;  
   caidian has **no** time-of-day data at all).
4. Competitor count → share of demand lost (no quantitative rule exists).

All four go into `docs/CLAIMS_LEDGER.md` as **not calibrated**. The ledger's  
own legend (`REAL` / `PARTIAL` / `FABRICATED` / `FAKE-GREEN`) has no row for  
"inferred from POI counts with no measured basis", and none of these four  
should borrow `REAL`; the honest entry is `PARTIAL` at best, with the  
derivation written out. Two precedents in the repo show the vocabulary to  
reuse: `:328` records fitted parameters as "a fit to a published curve, not to  
trajectories", and `:404` flatly states "Every new number here is self-chosen  
and uncalibrated". These four are that second case, and weaker — caidian's  
coefficients are not even fitted to anything.

Until any of them is calibrated, the honest output of this feature is  
**"a scenario shaped by real POI counts"**, never "a predicted footfall". The  
UI has to say so, not just the docs.

### D6 — The shop form maps onto existing schema fields where possible

| Form field                        | Destination                                                 | Status                                   |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| 店铺名称                          | `shop.name`                                                 | exists                                   |
| 面积                              | `shop.size.{width,height}` (with an aspect ratio to choose) | exists                                   |
| 客单价                            | `brand.priceTier` (1–5)                                     | exists — needs a documented ¥→tier table |
| 双人桌 / 4人桌 / 6人桌 / 10人包房 | `shop.capacity`                                             | **derivable**: `2n₂ + 4n₄ + 6n₆ + 10n₁₀` |
| 业态（中餐厅）                    | `brand.category = "restaurant"`                             | exists in the enum                       |
| —                                 | `shop.dwellMeanSeconds`                                     | **new**: needs a cited range for 正餐    |
| 桌型明细（保留原始数字）          | `shop.customParameters`                                     | exists, no schema change                 |

桌型 also gives something the engine has no notion of today: table-level  
service. That is deliberately **out of scope for stage 1** — it is a new  
agent behaviour, not a data-mapping problem.

## The contract: site context bundle (v1, draft)

Written by caidian, read by CrowdSim. Deliberately flat and boring.

```jsonc
{
  "contractVersion": 1,
  "generatedAt": "2026-10-05T15:04:05Z",
  "provider": "amap+overpass",

  // D4: everything geographic lives here, and only here
  "site": {
    "address": "...",
    "coordinateSystem": "GCJ-02",
    "origin": { "lat": 41.8, "lng": 123.4 },
    "catchmentRadiusMeters": 3000,
    "siteRadiusMeters": 300,
  },

  // D2: catchment statistics. Counts, not geometry.
  "catchment": {
    "layers": {
      "residential": { "count": 42, "weightedCount": 18.4, "ringCounts": [7, 14, 21] },
      "school": { "count": 6 },
      "office": { "count": 11 },
      "bus": { "count": 23 },
      "subway": { "count": 2 },
      "mall": { "count": 3 },
      "competitor": { "count": 17 },
    },
    // caidian's existing estimates, carried across verbatim and labelled
    "estimates": {
      "estimatedResidents": 38700,
      "estimatedDaytimeWorkers": 10800,
      "estimatedDailyFlow": 41000,
      "competitionLevel": "高",
      "rentEstimate": "100-200元/㎡/月",
    },
    // D5: these are the inferred ones. Nothing here is measured.
    "inference": {
      "coefficientsAreCalibrated": false,
      "source": "caidian analysisService, 2026-06-05",
    },
  },

  // D2: the simulated domain. Geometry, in metres, relative to site.origin.
  "site_geometry": {
    "coordinateSystem": "local-meters",
    "buildings": [
      {
        "id": "b1",
        "footprint": [
          [-40, -20],
          [-30, -20],
          [-30, -10],
          [-40, -10],
        ],
        "heightMeters": 18,
        "heightSource": "building:levels",
      },
    ],
    "roads": [
      {
        "id": "r1",
        "path": [
          [-120, 0],
          [120, 0],
        ],
        "kind": "primary",
      },
    ],
  },

  // D6: what the user typed
  "shop": {
    "name": "老四季中餐厅",
    "category": "restaurant",
    "areaSquareMeters": 320,
    "averageTicketYuan": 85,
    "tables": { "twoSeat": 6, "fourSeat": 10, "sixSeat": 4, "privateRoom10": 2 },
  },
}
```

Note `heightSource`. OSM `building:levels` coverage in China is patchy;  
map3d silently falls back to 10 m. Carrying the provenance per building lets  
CrowdSim **mark estimated heights in the UI** instead of presenting them as  
real, and lets a user correct one.

## Stage plan

- **Stage 0 — projection layer** (`geo/projection.ts` + inverse + GCJ-02 ↔  
  WGS-84). Pure, no network, fully unit-testable. Independent of everything  
  else and a prerequisite for all of it. Also fixes the  
  `geojsonImport.ts:99` metre bug for GeoJSON imports generally.
- **Stage 1 — contract + importer.** Ship the bundle schema, an importer that  
  turns it into a `CrowdSimScene`, and a checked-in fixture. No UI. Verified  
  by round-tripping the fixture and by a revert-verify that removing a field  
  breaks a test.
- **Stage 2 — demand inference**, as one pure function  
  `catchmentToArrivalProfile(bundle) → { arrivalProfile, population }`.  
  Every coefficient lives in one named, cited table. Disclosed in  
  `CLAIMS_LEDGER.md` in the same commit.
- **Stage 3 — OSM site geometry.** Overpass fetch (in caidian's backend, not  
  in CrowdSim), footprint → `polyline` walls for the sim + extruded masses for  
  the view. Height provenance carried through.
- **Stage 4 — UI.** Pick a point → set radius → review generated site → fill  
  the shop form → run.
- **Later, not now:** table-level service behaviour; Baidu/Meituan providers  
  via the adapter.

## What this ADR authorises and what it does not

**Authorised**: stage 0 and stage 1, once approved — the projection layer and  
the contract/importer. Neither makes a claim about demand.

**Not authorised**:

- Any network call from CrowdSim. This keeps README:64 true.
- Presenting any inferred demand number as measured or predicted. Stage 2 does  
  not ship until its ledger entries do.
- Raising or removing the 2,000-agent cap. D2 exists so the cap does not have  
  to be raised.
- Adding `百度热力图` or `美团` to any roadmap as an engineering task. The  
  adapter interface is the deliverable; those are commercial questions.
- Table-level dining behaviour, door-closing on doors, or any other agent  
  behaviour change — separate decisions each.

## Consequences

- CrowdSim gains a second way to get a scene (import a bundle) alongside  
  hand-building and DXF/GeoJSON/IFC import. The existing editor stays the  
  only place a scene can be edited once imported.
- `geojsonImport.ts` stops treating degrees as metres, which changes the  
  geometry of every GeoJSON scene imported before this lands. That is the fix,  
  but it is a visible behaviour change and belongs in the changelog.
- Two numbers now exist side by side in the UI and must never be  
  conflated: caidian's **scoring output** (a heuristic shopping score) and  
  CrowdSim's **simulation output** (a pedestrian-flow consequence of an  
  inferred arrival rate). They are not the same kind of statement and should  
  not be shown as if they corroborate each other.
