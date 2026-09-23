# Contributing to CrowdSim Web

Thanks for your interest. This is a pnpm monorepo: a React/TypeScript
pedestrian-simulation app (`packages/app`), a scene schema (`packages/scene-schema`),
GPU/WGSL utilities (`packages/core-gpu`), and a Rust→WASM behavior kernel
(`packages/core-behavior`, not used at runtime by default — see below).

## Getting started

You need Node.js 24+ and pnpm 10 (`packageManager` in the root `package.json`
pins the exact version). You do **not** need Rust or `wasm-pack` for normal
development — the compiled WASM output is checked into the repo
(`packages/app/src/wasm/core-behavior/`) and is only ever loaded behind a
runtime flag that defaults off (`wasmDecisionBackend`, unused in production).
You only need the Rust toolchain if you're changing
`packages/core-behavior/src` itself.

```bash
pnpm install
pnpm dev
```

## Before you open a PR

```bash
pnpm format:check   # prettier
pnpm lint           # eslint
pnpm typecheck
pnpm test           # vitest, all packages
```

If you touched `packages/core-behavior/src` (Rust), also run:

```bash
pnpm build:wasm      # regenerate packages/app/src/wasm/core-behavior/, commit the diff
pnpm test:rust       # cargo test
```

`pnpm e2e` runs Playwright smoke tests; it needs `pnpm exec playwright install
--with-deps chromium` once.

## What we expect in a PR

- **Tests.** Every behavior change needs a test that would fail without the
  fix — CI enforces `pnpm test`, but a test that can't fail is not proof of
  anything. If you're fixing a bug, the cleanest way to show this is:
  temporarily revert your fix, confirm the new test fails, restore it.
- **No new dependency without a reason.** State it in the PR description if
  you add one — what it replaces, why the existing tools in the repo (or the
  platform) don't already cover it.
- **Honesty about what's real.** This project has a documented history of
  removing overstated claims (see `docs/CLAIMS_LEDGER.md`). If a feature is
  partial, fixture-only, or unverified, say so in the code (a short comment)
  and in the PR description — don't let a panel or label imply more than the
  code does.
- **Keep changes scoped.** A bug fix doesn't need an accompanying refactor;
  a new capability doesn't need speculative configuration for cases that
  don't exist yet.

## Where things are

`CLAUDE.md` at the repo root is the fullest single account of the project's
direction, architecture, and history — read it before large changes.
Architectural decisions are recorded as ADRs in `docs/adr/`; if your change
shifts a boundary the ADRs describe, open a new ADR rather than silently
diverging from it.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Security

Please report security issues privately — see [SECURITY.md](SECURITY.md).
