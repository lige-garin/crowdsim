# CrowdSim Web

A browser-based site-selection and pedestrian-flow sandbox. Pick a location,
query nearby residential compounds, schools, offices, malls and transit stops,
fill in the project assumptions, then draw/import the site model and run a
crowd scenario. The app runs and saves locally; inferred POI demand remains an
explicitly uncalibrated scenario until real gate counts replace it.

This README states plainly what is real and what is not. The project has a
documented habit of catching and correcting its own overstated claims — see
[`docs/CLAIMS_LEDGER.md`](docs/CLAIMS_LEDGER.md) for the full history and
[`docs/adr/`](docs/adr/) for the architecture decisions.

## Status, honestly

- **The pedestrian engine is real and runs on your machine's CPU**, not a
  server: a social-force model (Helbing-style, parameters fitted to the
  Weidmann 1993 fundamental diagram, not to real trajectories — see
  [`docs/calibration/`](docs/calibration/)), walking groups
  (Moussaïd et al. 2010), queueing with reneging/balking, multi-floor
  routing including stairs, escalators and elevators, smoke/incapacitation,
  vehicles on a single lane (IDM), and evacuation with reaction-time
  distributions and crowding-aware exit choice. It validates against
  **13 of the 16 tests** in the RiMEA 4.1.1 pedestrian-simulation
  verification guideline — 15 are built, 13 pass, 2 are disclosed, real
  failures (not bugs papered over — see `docs/adr/` and the ledger), and 1
  cannot be built because the guideline's own figure for it has no usable
  dimensions.
- **The GPU movement kernel is wired into the app — behind an experimental,
  default-off toggle — but the complete live path is currently slower than CPU.**
  `packages/core-gpu`'s `gpuSimCore` (benchmarked at 0.45 ms/step for
  100,000 agents in isolation) is connected to the live engine (ADR-0033):
  a labelled "GPU movement (experimental)" toggle / `?gpumove` URL flag,
  worker-side device lifecycle with CPU fallback on device loss, and
  fail-loud async APIs. The isolated kernel is fast, but the live worker → GPU
  submit → readback → UI path measured 31–48 ms/tick at 0–600 agents and lost
  to CPU in every reachable bucket tested. The shipping default therefore
  remains `movementBackend: "cpu-compat"`; "100k" is a kernel-only benchmark,
  not a claim about the running application. See
  `docs/adr/0033-gpu-core-engine-wiring.md`.
- **Pedestrians nearest the camera can be real skinned, animated 3D
  characters (CC0 assets, ADR-0032), not a claim about the whole crowd.**
  Only the closest 12 agents within 20 m of the camera get one; everyone
  else — the vast majority of a real crowd — is still the procedural
  low-poly figure `crowdFigures.ts` has always drawn. A skinned mesh can't
  be batched into an `InstancedMesh` the way those figures are, which is
  exactly why this stays a small, bounded, always-on tier rather than a
  crowd-wide swap.
- **"AI" surfaces are template/keyword logic, not a model call.** Scene
  drafting and the image-tracing example button construct text or run a
  fixed pipeline over three hardcoded fixtures; no LLM is ever invoked
  from the client. The three panels that once wrapped this in an "AI"
  label (a workflow panel, an image-geometry panel, a tiles-backdrop
  panel) were removed entirely in 2026-09 rather than kept around with a
  disclosure banner, once it was clear their surrounding surface added
  no real capability over the two buttons that survived. Each surviving
  module carries its own `HONESTY NOTE` explaining what it actually does.
- **Most of the analysis panel dock reports on built-in sample scenarios,
  not your project.** Fixture panels are labeled `dataSource: "fixture"`
  in the UI itself, not just in this README — the label is load-bearing,
  not decorative.
- **There is no account system, and none is required.** The app persists
  your work to `localStorage` and to files you export/import
  (`.csim.json`). Weather and POI lookups are user-triggered network calls;
  map/POI calls occur only when an Amap key is configured and the user opens
  or runs the corresponding action. An earlier optional backend for projects/versions/share
  links existed at one point but was never deployable as shipped and was
  never reachable from the client — it was removed rather than kept
  around unmaintained; see `docs/CLAIMS_LEDGER.md` if you're looking for
  it.
- **A base map appears only if you configure an Amap key, and it is a
  picking aid, not a dependency.** Step 2 of the new-project flow reads
  `VITE_AMAP_KEY` at build time; with no key the app shows a labelled
  pair of coordinate inputs and the flow completes identically, because
  the coordinate and catchment radius are the parts a project actually
  needs and the map only helps you choose them. With a key, the JS SDK
  (~400 KB) and its stylesheet are fetched from `webapi.amap.com` when
  you open that step. This is the one place a build can be given a
  network dependency by configuration, so it is called out here rather
  than left for someone to discover from the network tab. The key is
  embedded in the built JavaScript, so a public deployment needs a key
  type that restricts it by referer; a key without that restriction is
  usable by anyone who loads the page. Coordinates are **GCJ-02**
  throughout — the same system Amap serves and the direct POI query uses.
  It is not converted to WGS-84, which would move
  every point ~570 m in Shenyang.
- **The four plan routes are not variations on one thing, and the app says
  what each one produced.** A DXF import yields walls with no door openings.
  The generated skeleton yields walls, shop lots, escalators and doors at
  positions its own layout logic chose — nobody surveyed them. A hand-drawn
  plan has no source file. A GLB is a **render asset with no walls in it**:
  it can be embedded, positioned, rotated and scaled, but the app blocks
  applying it until the user confirms walls, entrances/exits and walkable
  space. Embedded GLBs are capped at 1.5 MB total because the browser may keep
  both a project and an editor-autosave copy inside a roughly 5 MB local
  storage quota. Only the skeleton route generates geometry; the other three
  open an empty world sized to the footprint, because a scene whose walls were
  grown from an area and a floor count would be indistinguishable on screen
  from a measured one. Area and floor count are recorded and are **not** used to
  draw anything.

## Which browsers

**Only Chromium is actually tested.** `playwright.config.ts` runs a single
Chromium project, and every number in this README was measured there. The
rest of this section is what the code requires, not what anyone has run.

Two capabilities are optional, and both degrade rather than fail:

| Capability          | Needed for                                          | Without it                                                            |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| WebGPU              | The experimental, default-off GPU movement toggle   | Not offered; the CPU backend runs the same model and the same numbers |
| `SharedArrayBuffer` | The crowd overlay sharing memory instead of copying | Falls back to a per-frame copy; slower, same results                  |

`SharedArrayBuffer` additionally needs COOP/COEP **response headers**, which
is a server capability and not a browser one — see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). A browser that supports it will
still take the slow path on a host that cannot send the headers.

What that implies for other browsers is a reasonable expectation, not a
result: Firefox and Safari 17+ have everything the CPU path needs, and
Safari's WebGPU story is newer than Chrome's. **Nobody has loaded this app
in either of them.** If you deploy somewhere that has to support them, run
it once before promising it — and note that WebGPU is gated behind a
default-off toggle, so the only thing at risk is that toggle.

## Quickstart

Requires Node.js 24+ and pnpm 10 (see `packageManager` in `package.json`).
You do **not** need Rust — see [Rust/WASM](#rustwasm-optional) below.

```bash
pnpm install
pnpm dev
```

This starts a Vite dev server. The app needs COOP/COEP response headers to
use `SharedArrayBuffer` at full performance; the dev server sends them
already. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) before deploying —
plain GitHub Pages cannot send these headers and the app will silently fall
back to a slower per-frame-copy path rather than failing.

## Architecture

| Package                  | What it is                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app`           | The React app: 3D/2D viewport (three.js), scene editor, analysis panels, the CPU simulation engine and its Web Worker.                                           |
| `packages/scene-schema`  | The `.csim.json` scene format (Zod schema), shared TS/Rust types.                                                                                                |
| `packages/core-gpu`      | WGSL/WebGPU compute utilities, including the experimental default-off live movement backend and its CPU test mirrors.                                            |
| `packages/core-behavior` | A Rust→WASM discrete-event/state-machine behavior kernel. Real, tested (11 Rust tests), but not used by the shipping app's default decision backend — see below. |

## Testing

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # vitest across every package
pnpm e2e         # Playwright smoke tests
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for what's expected in a PR.

### Rust/WASM (optional)

`packages/app/src/wasm/core-behavior/` is generated by `wasm-pack` and is
**checked into this repository** so `pnpm dev`/`build`/`test`/`typecheck`
work without the Rust toolchain. The WASM decision backend it builds is real
and tested, but the app's default decision backend is a TypeScript one
(`mallCrowdDecisionBackend.ts`) — `wasmDecisionBackend` defaults to `false`
everywhere in the running app. You only need Rust + `wasm-pack` if you're
changing `packages/core-behavior/src`:

```bash
pnpm build:wasm   # regenerates packages/app/src/wasm/core-behavior/, commit the diff
pnpm test:rust    # cargo test
```

## Known limitations

A partial list — see `docs/adr/` (each ADR's "What this is not" section) and
`docs/CLAIMS_LEDGER.md` for the complete, dated record:

- Vehicles turn at intersections and stop for traffic signals
  (ADR-0023), but there is no route planning — every turn is a random,
  uniformly-weighted choice among the geometrically possible ones, and
  signals have no editor placement tool (JSON-only for now).
- Elevator dispatch boards continuously and balances load across multiple
  cars at a shaft's two floors (ADR-0029), but still does not look ahead
  or coordinate across a shaft serving more than two floors.
- Evacuation only routes people on a floor with an actually active hazard
  to the exits; a floor with no live hazard is unaffected (ADR-0025) — but
  there is still no adjacent-floor buffer evacuation, and a floor's
  evacuation cannot be cancelled once a hazard on it ends.
- Smoke/fire is a disclosed, non-CFD approximation (growing circle,
  self-authored dose model), not a validated hazard simulation.
- Social-force parameters are fitted to the Weidmann density-speed curve,
  not to real pedestrian trajectories — a real-trajectory fit was attempted
  and is documented as **not adopted**, because it made the density fit
  worse (`docs/calibration/`).
- Skinned, animated pedestrian characters (ADR-0032) only ever cover the
  closest 12 people to the camera, within 20 m — everyone else in the
  crowd is still the procedural low-poly figure, and every near-camera
  character currently looks like the same one person.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE) (one
dependency, `web-ifc`, is MPL-2.0).
