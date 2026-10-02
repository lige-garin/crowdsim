# Deploying CrowdSim

CrowdSim is a **static site**: no server runtime, no database, no API of its
own. A deployment is a host serving `packages/app/dist` — HTML, JS, WASM,
JSON and CC0 character models. One hard constraint applies (COOP/COEP,
below), and exactly one outbound network call exists from the app (the
optional weather panel, which degrades silently offline).

## Build

From the repo root:

```bash
pnpm install --frozen-lockfile
pnpm build:wasm   # Rust + wasm-pack (CI pins 0.15.0), wasm32 target
pnpm build        # -> packages/app/dist
```

`build:wasm` needs the Rust toolchain with the `wasm32-unknown-unknown`
target — the same versions CI pins (`.github/workflows/ci.yml`). There is no
dist without it: the decision-runtime WASM ends up in the bundle as
`assets/crowdsim_core_behavior_bg-*.wasm`.

Measured sizes of what ships (2026-10-02, this repository):

| What | Size | Notes |
| --- | --- | --- |
| Main bundle | ~2.4 MB | loads on first paint |
| web-ifc chunk | ~3.4 MB | lazy — fetched only on an IFC import |
| Character models | ~23 MB | `assets/characters/quaternius/`, CC0, license file included |

## The one hard constraint: COOP/COEP (SharedArrayBuffer)

The simulation streams live agent positions to the renderer over a
**SharedArrayBuffer** overlay (zero-copy). `SharedArrayBuffer` is only available
in a **cross-origin-isolated** context, which the browser grants only when the
app's document is served with **both** of these response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If either is missing on the document response:

- `globalThis.crossOriginIsolated` is `false`.
- `runSharedArrayBufferProbe()` (`packages/app/src/sharedArrayBufferProbe.ts`)
  returns `status: "fallback"`, and the in-app engineering signal shows
  `SAB fallback | not-isolated`.
- The zero-copy SAB overlay is unavailable, so live agent positions fall back to
  a per-frame copy path — functional but slower, and not the intended path.

This is an on-launch hard constraint, not a nice-to-have.

> `require-corp` means every cross-origin subresource must itself opt in
> (via CORP/CORS). Keep that in mind when adding third-party assets (map
> tiles, fonts); they must be served cross-origin-isolation-compatible or
> proxied.

### Dev / preview already set the headers

`packages/app/vite.config.ts` applies both headers to the Vite **dev** and
**preview** servers. Production hosting must be configured separately —
Vite's config does not affect your production host.

## Host recipes

### Cloudflare Pages

`packages/app/public/_headers` ships in this repository and Vite copies it
into `dist/`, so Pages applies the two headers with **zero host-side
configuration**. Two ways to deploy:

1. **From CI / local build (recommended).** Build with the steps above, then:

   ```bash
   npx wrangler pages deploy packages/app/dist
   ```

   This sidesteps the Rust question entirely — your build machine already
   has the toolchain.

2. **Pages Git integration.** Build command `pnpm build:wasm && pnpm build`,
   output directory `packages/app/dist`. Verify the build image has
   `cargo`/`wasm-pack` (`cargo --version` in a build log) before relying on
   this route; if it does not, use route 1.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name crowdsim.example.com;
    root /var/www/crowdsim/dist;
    index index.html;

    # add_header does NOT inherit into a location that declares its own —
    # that is why the isolation pair repeats inside /assets/.
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    location /assets/ {
        # Hashed filenames: safe to cache forever.
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        types { application/wasm wasm; }
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Any other static host

Serve `packages/app/dist` as-is and send the two headers above on the
document response. Nothing else is required — no server code, no env vars,
no database.

## Pre-launch smoke checklist

Run against the production URL (or `pnpm preview` for a final local pass —
the preview server sends the same two headers as production should):

1. `curl -sI https://YOUR_HOST/ | grep -i cross-origin` — **both** headers present.
2. Browser console: `crossOriginIsolated === true`.
3. Homepage loads, "进入运营台" opens the workbench — no blank screen, no
   console errors.
4. Pick a template, press play: agent count rises above zero and agents are
   visible in the viewport.
5. The engineering signal row "Shared memory" reads SAB ready, not
   `SAB fallback`.
6. In the 2D editor: draw an object, 保存, reload the page, load the saved
   scene — the drawing survives.
7. File menu → 导入 IFC: the lazy web-ifc chunk actually fetches (~3.4 MB
   in the network tab) and the import dialog opens.
8. Offline / firewall test: with the network blocked after load, everything
   except the weather panel keeps working (it is the only outbound call).
9. One keyboard pass: Delete deletes the selected object, Ctrl+Z undoes.
10. Resize the window once — the viewport re-lays out without overlap.

## CI

CI (`.github/workflows/ci.yml`) runs the full gate suite — format, lint,
WASM build, Rust tests, typecheck, unit tests, e2e, production build — on
every push to `main` and every PR. Deploy only from commits where that
pipeline is green.
