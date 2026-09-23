# Security Policy

## Scope

CrowdSim Web is a browser-based pedestrian/crowd simulation engine. The parts
that matter most for security:

- `packages/app`: runs entirely client-side. It persists user work to
  `localStorage` and file downloads; it makes **no network requests** in a
  default build (no `backendClient` is wired into `App.tsx`).
- `packages/backend` / `packages/collab`: an optional, self-hosted project/
  version/share-link API. It is not deployed anywhere by this repository and
  is not required to run the app. `POST /api/auth/login` is fail-closed by
  default — it returns `503` unless the deployer supplies a real credential
  verifier (see `packages/backend/src/auth.ts`). If you deploy this package,
  you are responsible for wiring in real authentication before exposing it.

## Reporting a Vulnerability

If you find a security issue, please **do not open a public GitHub issue**.
Instead, use GitHub's private vulnerability reporting for this repository
(Security tab → "Report a vulnerability"). If that is not available, open an
issue titled only "security: please contact" with no details, and a
maintainer will follow up privately.

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a minimal repro scene/script
- Which package(s) are affected (`app`, `backend`, `collab`, `scene-schema`,
  `core-gpu`, `core-behavior`)

We will acknowledge reports within a reasonable time and credit reporters
(unless you prefer otherwise) once a fix ships.

## Known, disclosed limitations (not vulnerabilities to report)

These are documented tradeoffs, not bugs:

- `packages/backend` ships with no deployment configuration (no
  `wrangler.toml`, no `export default { fetch }`); it is not currently
  deployable as-is. Treat it as a reference implementation, not a hosted
  service.
- The app requires COOP/COEP response headers for `SharedArrayBuffer` to
  work at full performance (see `docs/DEPLOYMENT.md`); without them it
  degrades to a slower per-frame-copy fallback rather than failing insecurely.
