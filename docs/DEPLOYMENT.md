# Deployment notes

## COOP/COEP are a hard launch constraint (SharedArrayBuffer)

The simulation streams live agent positions to the renderer over a
**SharedArrayBuffer** overlay (zero-copy). `SharedArrayBuffer` is only available
in a **cross-origin-isolated** context, which the browser grants only when the
document is served with **both** of these response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Production must send both headers** on the app's document responses. If either
is missing:

- `globalThis.crossOriginIsolated` is `false`.
- `runSharedArrayBufferProbe()` (`packages/app/src/sharedArrayBufferProbe.ts`)
  returns `status: "fallback"` with message `"Cross-origin isolation required"`,
  and the in-app signal shows `SAB fallback | not-isolated`.
- The zero-copy SAB overlay is unavailable, so live agent positions fall back to
  a per-frame copy path — functional but slower, and not the intended path.

This is an on-launch hard constraint, not a nice-to-have.

### Dev / preview already set the headers

`packages/app/vite.config.ts` applies both headers to the Vite **dev** and
**preview** servers (`server.headers` and `preview.headers`). Production hosting
(CDN / reverse proxy / static host) must be configured to send the same two
headers — Vite's config does not affect your production host.

> Note: `require-corp` means every cross-origin subresource must itself opt in
> (via CORP/CORS). Keep that in mind when adding third-party assets (e.g. map
> tiles, fonts); they must be served cross-origin-isolation-compatible or
> proxied.

### Verifying

Dev (observed 2026-06-24 on the Vite dev server):

```
HTTP 200
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

In any environment, confirm in the browser console:

```js
crossOriginIsolated === true
```

and check the in-app SAB signal reads `SAB ready | isolated` (not
`SAB fallback`).
