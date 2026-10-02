# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
