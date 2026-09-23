# Security Policy

## Scope

CrowdSim Web is a browser-based pedestrian/crowd simulation engine. The parts
that matter most for security:

- `packages/app`: runs entirely client-side. It persists user work to
  `localStorage` and file downloads; it makes **no network requests** in a
  default build. There is no server-side component and no account system.

## Reporting a Vulnerability

If you find a security issue, please **do not open a public GitHub issue**.
Instead, use GitHub's private vulnerability reporting for this repository
(Security tab → "Report a vulnerability"). If that is not available, open an
issue titled only "security: please contact" with no details, and a
maintainer will follow up privately.

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a minimal repro scene/script
- Which package(s) are affected (`app`, `scene-schema`, `core-gpu`,
  `core-behavior`)

We will acknowledge reports within a reasonable time and credit reporters
(unless you prefer otherwise) once a fix ships.

## Known, disclosed limitations (not vulnerabilities to report)

This is a documented tradeoff, not a bug: the app requires COOP/COEP
response headers for `SharedArrayBuffer` to work at full performance (see
`docs/DEPLOYMENT.md`); without them it degrades to a slower per-frame-copy
fallback rather than failing insecurely.
