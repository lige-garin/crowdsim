# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `createMallSkeleton` (`packages/app/src/scenes/mallSkeleton.ts`) builds a
  shopping centre from a floor-and-zone description: floors with elevations,
  a walled perimeter per floor, zones cut into store lots and shops, an
  escalator pair plus a lift between each adjacent floor pair, and doors on
  the ground floor. This is the first scene the project's multi-floor and
  connector schema has actually been exercised by — every example scene until
  now was single-level.

- `planShopLayout` / `applyShopLayoutToLot` (`packages/app/src/scenes/shopLayout.ts`)
  lays a shop's tables out inside its lot and writes them into a scene: table
  counts become a seat capacity, the door and queue land on the side asked
  for, private rooms become three-sided walls, and furniture becomes
  obstacles people have to walk around. It throws when the tables do not fit,
  which is arithmetic rather than inference. **The furniture dimensions and
  the aisle clearances it uses are self-chosen and uncalibrated** — they are
  there so two layouts can be compared against each other, not so an absolute
  number can be quoted.

- `obstacleSchema.kind` gained `"furniture"`, because tables and booths are
  neither construction barriers, debris, fences, planting, security lines nor
  water, and the previous six made no honest place to put them.

- `measureScenario` / `compareScenarioMeasures` / `describeComparison`
  (`packages/app/src/analytics/layoutComparison.ts`) run two layouts and
  report the difference between them: peak queue, visits, dwell, peak
  density, congestion share, throughput and journey length, each as a delta
  with a ratio. `compareScenarioMeasures` refuses to compare runs whose seeds
  differ, because a difference that is partly the random stream is not a
  difference in the layout. Visits are counted on entry rather than on
  completion, so a run shorter than the dwell still reports them.

- `calibrateArrivals` / `applyArrivalCalibration`
  (`packages/app/src/analytics/arrivalCalibration.ts`) turn a mall's own gate
  counts into the arrival profile a run spawns from. A door with no counter
  is left on its existing rate and reported as unmeasured — it is never
  filled in from the doors that were measured, because this is the one input
  here that can be measured rather than inferred.

- `siteContextBundle` (`packages/scene-schema`) and `importSiteBundle` /
  `catchmentToArrivalProfile` (`packages/app/src/site/`): the site context
  bundle contract of ADR-0034, an importer that turns one into a runnable
  scene, and the catchment → arrival-profile inference behind it. Everything
  the bundle does not say is left out rather than invented: no entrances means
  a scene with no doors, and a building with no height tag is listed as
  inferred. **Every coefficient in `demandInference.ts` is self-chosen and
  uncalibrated**, registered in `docs/CLAIMS_LEDGER.md` in the same change.

- `packages/app/src/geo/projection.ts`: WGS-84 ↔ GCJ-02 and a local
  tangent-plane projection to metres, with inverses. AMap and OSM points for
  the same place differ by hundreds of metres (measured: 569 m at Shenyang),
  so a bundle mixing them would have been off by more than a block.

- The 2D editor's file menu gained **导入选址包** ("Import site bundle"): pick
  the JSON a site tool exported, and the editor swaps its working scene for
  the one `importSiteBundle` builds from it. Everything the importer had to
  assume is listed under the file bar — inferred building heights, a site with
  no doors, a bundle with no shop — because a scene built from real footprints
  still has to say which parts of it are not. The list describes the scene on
  screen, so any later scene swap clears it. No network request is made: the
  bundle is read from the picked file, so the app's no-network default holds.

- Two live panels, both wired to the scene the app is actually running and
  registered in the panel dock:

  - **店铺布局** (`packages/app/src/panels/ShopLayoutPanel.tsx`): the shop
    form — name, area, average spend, dwell, table mix, door side — with the
    plan shown before anything is applied. It works on a **store lot** (the
    area comes from the lot's geometry and is not editable) and on a
    **standalone shop** (a street site from a site bundle, where the area is
    an input and changing it resizes the shop). "These tables do not fit" is
    shown as an answer and disables Apply; it is arithmetic, not inference.
  - **方案对比** (`packages/app/src/panels/LayoutComparePanel.tsx`): saves the
    open scene as scheme A or B, runs both, and prints `describeComparison` —
    now with the caveat as its **first** line. Both runs are forced onto one
    seed, because a difference that is partly the random stream is not a
    difference in the layout. It runs on the main thread; the panel says so
    rather than showing a spinner that cannot animate.

- `applyShopLayoutToShop` (`packages/app/src/scenes/shopLayout.ts`) lays a
  shop out inside its **own** rectangle, for shops that have no store lot. An
  `obstacle` needs no lot to hold it, so the furniture is still placed; what
  is missing is the lot's frontage, which is why the door side is the form's
  choice rather than something read off a building.

- `sizeForArea` is exported from `shopLayout.ts` instead of being a private
  copy in `importSiteBundle.ts`: one 2:3 stand-in rectangle, not two that can
  drift apart.

- A site bundle with **no entrances** now carries the arrival profile it
  inferred in `customParameters.siteInference.arrival`, and the report names
  the figure and where to put it. Before, such a site imported as a scene with
  nobody arriving — the one number the catchment was worth exporting had
  nowhere to go.

- `packages/app/src/site/fixtures/caidian-export-v1.json`: a bundle produced
  by the exporter now added to the caidian repo
  (`packages/frontend/src/utils/crowdSimExport.ts`), checked in here so the
  cross-repo contract is pinned from both ends. It carries catchment POI
  counts and **no geometry**: caidian has neither footprints nor door
  positions, and neither is invented on the way out.

### Changed

- **GeoJSON import now reads degrees as degrees.** `createSceneFromGeoJson`
  used to copy longitude and latitude straight into `x`/`y`, so a GeoJSON
  import of Shenyang (≈123.4, 41.8) produced a ~123 m × 42 m scene. RFC 7946
  says GeoJSON coordinates are WGS-84 unless the file says otherwise, so they
  are now projected onto a local plane in metres, and shifted so nothing lands
  off the world. **This changes the geometry of every GeoJSON scene imported
  before it**; a caller with metre-based coordinates passes
  `{ coordinateSystem: "meters" }` and gets the old behaviour back. A file
  carrying values no longitude can hold is refused rather than projected into
  something that looks plausible.

- `compareScenarioMeasures` now also refuses to compare runs of different
  lengths, not just different seeds. Every absolute measure it reports grows
  with the run, so a longer run would have shown up as a better layout.

- `ArrivalCalibration.coverageMinutes` is the length of the profile; how much
  of it was actually measured is `DoorCalibration.coveredMinutes` plus the new
  `startsAtMinutes`. They used to be one number that overstated coverage
  whenever a counter started late.

### Fixed

- `ShopLayoutPanel` applied a shop with no tables, and the schema rejected it:
  `shopSchema.capacity` is positive and an empty table mix sums to zero, so
  importing a site bundle and clicking "apply to scene" — the shortest possible
  path through the panel — threw a `ZodError` out of a click handler and took
  the workbench with it. `planShopLayout` now refuses an empty mix as plainly
  as it refuses tables that do not fit, and the panel catches anything else
  rather than letting it reach React.

- The same panel passed `averageTicketYuan: 0` for a shop that had never been
  given one, which `priceTierForAverageTicket` read as the cheapest tier. A
  site bundle's shop carries `priceTier: 3` and no yuan figure, so opening the
  panel and applying a layout silently reclassified a mid-market shop two
  tiers down. An untouched box is now `null` and is passed through as
  `undefined`, which is what `writeLayout`'s existing guard is for.

- `ShopLayoutPanel` and `LayoutComparePanel` were registered without a
  `key={scene.id}`, so their form and their report survived a scene swap: the
  next scene's first shop got the previous shop's name, table mix and ticket,
  or a comparison sat on screen under a scene it was not measured from.

- `importSiteBundle` copied `site_geometry` coordinates straight into the
  scene. Those are metres **relative to the site origin**, so they are
  negative on two sides; on the checked-in fixture 10 of 17 points landed
  outside the world the importer had just computed — buildings drawn and
  simulated nowhere, with the shop alone in an empty middle. The whole site is
  now translated onto the world by one offset, which preserves every distance
  in it.

- `applyArrivalCalibration` claimed a door is never left at a flat rate of 0,
  and then wrote 0 whenever the door's first slot held no counts — which is
  exactly what happens to a counter switched on after opening. It now falls
  back to the first rate that was actually measured.

- A coefficient in `catchmentToArrivalProfile` was hard-coded in the
  expression rather than in `demandCoefficients`, so it was missing from the
  claims ledger's list of uncalibrated coefficients. It is now
  `populationVisitRate`, in the table, with a test that fails if it is taken
  back out.

- `describeDelta` printed `-0.4%` as `0%` while still labelling the change
  "更差", which reads as if nothing had moved. A change that rounds to 0% now
  says 基本持平 and gives the absolute change instead.

- Generated store lots and shops carried no `floorId`, so a zone on an upper
  floor produced shops that `resolveFloorId` silently placed on the base
  floor: a multi-level mall's upper floors had no stores on them. Both now
  take the floor of the zone they were cut from.

- CI e2e suite was red: `reducedMotion: "reduce"` sat directly in Playwright's
  `use`, but the 1.61 runner only models colorScheme / viewport / userAgent /
  … as direct `use` keys — a bare `use.reducedMotion` is silently dropped, so
  the homepage hero animated at 30 fps under software WebGL on the 2-core CI
  runner, saturated the renderer's main thread, and starved every click until
  tests timed out. Moved under `use.contextOptions` (verified in the created
  context's trace: `reducedMotion: "reduce"`), restoring the intended single
  static hero frame.

- Typing a fractional shop capacity (e.g. `12.5`) in the editor's parameter
  panel took the whole workbench down to the error boundary: `capacity` is
  `z.number().int()` in the shop schema, and the value reaches
  `parseScene` inside a render-time `useMemo`. The mutation now rounds the
  head count (attraction and dwell stay fractional). Building and transit-stop
  numbers already rounded; the shop was the one that had been missed.
- Closing the trajectory replay by its own close button left the run stopped
  for good: only the play button cleared the pause, so the auto-start latch
  stayed set and the city sat frozen. Exiting the replay now resumes a run
  that was live when it opened, and leaves a run the user had already paused
  alone.
- A refused hot scene update in the simulation worker adopted the new scene's
  floors before the engine rejected it, so shared-memory snapshots wrote the
  wrong floor list until the re-init landed. The floors are now read only
  after the engine has accepted the scene.

- The contact-network view rebuilt its whole graph inside `AppStage`'s JSX, so
  it paid O(N²) over the entire crowd — two thousand people is two million
  pairs — on every snapshot, i.e. sixty times a second. The graph is now
  sampled from the crowd store twice a second instead.
- Every ECharts panel rebuilt its chart from scratch on every render: each
  panel builds its option inline in JSX, so the option is always a new object,
  and `setOption(option, true)` discards and re-creates every component. It now
  skips an option that says the same thing as the last one (functions compared
  by source, so a changed formatter still lands) and replaces only the series
  list, which is the one part whose length changes.
- The heatmap grid was recomputed at the rate samples arrive, four times a
  second: measured at 17.6 ms per call for 2 000 people over the default 30 s
  window, and once per floor again for the peak-density KPI. It is now
  re-gridded once a second. The samples themselves are untouched — the
  credibility report still reads every one of them.
- `disposeRenderObject` freed a mesh's geometry and material but not the
  textures that material maps: ground tiles are cloned per city and shop fronts
  paint their own canvas, so every rebuild of the viewport orphaned a set of
  GPU textures.
- Editing anything in the scene editor and applying it silently deleted every
  field the editor has no control for — a shop's `zoneId`, `storeLotId`,
  `conversionRate`, `serviceMeanSeconds`, `openingHours`, `visual`,
  `customParameters` and door; a zone's `personaAffinity`; a connector's
  `speedMetersPerSecond`; a wall's `name`; and more — because
  `createSceneFromEditorDocument` rebuilt each entity from the editor document
  alone. Each entity now starts from the matching entity in the scene it is
  replacing, the way the floor list already did, so anything the editor does
  not model is carried through instead of reset to the schema default. A
  wall's thickness was also pinned to 0.2 on the way out; it now keeps the
  value the scene author set.

- Placing an exit in the 3D world did nothing you could see. The placement
  landed — the entity reached the scene and the running simulation — but the
  render plan has no primitive for entrances, targets, service points,
  connectors, zones or count lines, so the click read as "it did not build",
  while a shop appeared at once because shop fronts are drawn separately. Point
  placements now draw as a disc on the ground with a post in 3D (a disc alone
  is invisible from any angle but straight down), zones as a translucent
  polygon, count lines as a line.

### Changed

- Two RiMEA tests asserted `expect(["pass", "fail"]).toContain(status)`,
  which reads as "the test passes" but only ever excluded `needs-scenario`, a
  status neither test can return. Both now say plainly that only a reached
  verdict is asserted, and why the verdict itself is left open.

## [0.1.0] — 2026-10-02

First tagged release: the open-source baseline, after the 2026-10-02 review's
P0/P1 shell fixes. The engine itself predates this tag by months —
`docs/CLAIMS_LEDGER.md` and `docs/adr/` carry the engine's full history, and
this changelog starts where public releases start.

### Added

- Multi-agent pedestrian simulation, browser-only: 4-package monorepo
  (React app, scene schema, GPU movement kernel, Rust→WASM decision layer).
- 2D scene editor (17 tools, undo/redo, snapping, DXF / GeoJSON / IFC /
  basemap import) and 3D viewport, both editing the same running scene.
- Live analytics: dashboard, heatmaps (Fruin LOS), count lines, journeys,
  trajectory recording and replay, evacuation mode, experiment sweeps with
  Monte-Carlo and Sobol sensitivity.
- Validation surface: RiMEA-named engine regression suite (15 built, 13 pass,
  2 disclosed real failures, 1 not buildable — see CLAIMS_LEDGER), Weidmann
  density-speed comparison, printable calibration report.
- Autosave with crash-recovery prompt (`crowdsim.autosave.v1` slot, separate
  from the manual save slot).
- User-level simulation-fault card with retry when the worker dies.
- Local diagnostics channel: error ring buffer + copy-to-clipboard bug report,
  no network, no telemetry.
- Full deployment story: COOP/COEP constraint, Cloudflare Pages `_headers`
  (shipped, Vite-copied), Nginx recipe, launch smoke checklist
  (`docs/DEPLOYMENT.md`).
- CI with eight gates (format, lint, WASM build, Rust tests, typecheck, unit
  tests, e2e, production build) plus failure and dist artifacts.

### Engineering facts worth knowing before trusting a run

- Engine hard cap: 2,000 agents (`crowdBudget.maxAgents`).
- GPU movement kernel (ADR-0033) is wired but **default-off**
  (`?gpumove` opt-in); measured crossover vs CPU: 750–1000 agents.
- Social-force parameters are fitted (held-out RMSE 0.079 m/s) with
  documented non-uniqueness; scenario geometries are self-authored.
- Everything above is tracked claim-by-claim in `docs/CLAIMS_LEDGER.md`.
