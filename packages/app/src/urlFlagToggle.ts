/**
 * Flips a boolean URL query flag (present/absent, no value -- same shape as
 * `?gpumove`/`?mainsim`) and returns the resulting URL, for the ADR-0033
 * stage 3 GPU-movement toggle: this app reads flags like `gpumove` exactly
 * once at mount and never switches a running simulation reactively (the
 * "empty city" lesson `App.tsx` documents on `requestGpuMovement` itself),
 * so the only honest way to offer a clickable toggle is to change the URL
 * and force a real reload -- this function is the pure half of that, kept
 * separate from `window.location` so it can be tested without a DOM.
 */
export function toggleUrlFlag(url: string, flag: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has(flag)) {
    parsed.searchParams.delete(flag);
  } else {
    parsed.searchParams.set(flag, "");
  }
  return parsed.toString();
}
