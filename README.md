# CrowdSim Web

A browser-based, multi-agent pedestrian/crowd simulation engine: draw a floor
plan (or import one), populate it with a social-force crowd model, and watch
people walk, queue, shop, evacuate, and take the stairs — entirely client
side, no server required to run or save your work.

This README states plainly what is real and what is not. The project has a
documented habit of catching and correcting its own overstated claims — see
[`docs/CLAIMS_LEDGER.md`](docs/CLAIMS_LEDGER.md) for the full history, and
[`CLAUDE.md`](CLAUDE.md) for the complete, dated account of what was built
and why.

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
- **"100,000 agents on WebGPU" is a real, benchmarked number for the
  movement kernel alone (0.45 ms/step), and it is not wired into the app.**
  The shipping app runs up to 2,000 agents on the CPU path
  (`movementBackend: "cpu-compat"`); `packages/core-gpu`'s `gpuSimCore` has
  zero importers from `packages/app`. See `docs/adr/0015-scale-up-path-comparison.md`.
  Do not read "100k" anywhere else in this project as a claim about the
  running application.
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
  not your project.** 6 of 9 panels are labeled `dataSource: "fixture"`
  in the UI itself, not just in this README — the label is load-bearing,
  not decorative.
- **There is no account system, and none is required.** The app persists
  your work to `localStorage` and to files you export/import
  (`.csim.json`). It makes no network requests in a default build. An
  earlier optional backend for projects/versions/share links existed at
  one point but was never deployable as shipped and was never reachable
  from the client — it was removed rather than kept around unmaintained;
  see `docs/CLAIMS_LEDGER.md` if you're looking for it.

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
| `packages/core-gpu`      | WGSL/WebGPU compute utilities (spatial hashing, flow fields, a full 100k-agent movement kernel that is benchmarked but not wired into the app).                  |
| `packages/core-behavior` | A Rust→WASM discrete-event/state-machine behavior kernel. Real, tested (11 Rust tests), but not used by the shipping app's default decision backend — see below. |

## Testing

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # vitest across every package, ~1,200 tests
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
