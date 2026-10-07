/**
 * Where the Amap key comes from, and where a key the user typed goes.
 *
 * Two sources, in order: what the user typed into this app, then what the
 * build shipped with. A key typed here is stored in `localStorage` rather than
 * kept in memory, because the alternative is asking for it on every reload of
 * a form that takes three steps to reach.
 *
 * **A key entered here is stored in plain text in this browser, and so is the
 * one from the build.** That is not a quirk of storing it here: a browser that
 * can call Amap has to hold the key, and `VITE_AMAP_KEY` is compiled into the
 * JavaScript bundle where anyone can read it. The two are equally exposed, and
 * the honest consequence is the same — this key needs a referer-restricted
 * type, and a deployment that shares the bundle shares the built-in key.
 *
 * The difference between the two is where they go afterwards. A typed key stays
 * in this browser's `localStorage`: it is not written into an exported project,
 * not uploaded, and does not travel with the app. The build-time one is public
 * the moment the app is published. Both facts are stated in the UI rather than
 * here, because a reader deciding what to paste into a text box needs to know
 * them and a comment in a module is not where they will look.
 */

const STORAGE_KEY = "crowdsim.amapKey.v1";

/**
 * The key to use, or null.
 *
 * The typed one wins over the build-time one because someone who typed a key
 * meant to replace it — the common case is a deployment whose baked-in key
 * has expired or hit its quota.
 */
export function readAmapKey(): string | null {
  return typedKey() ?? buildKey();
}

/** Remember a key the user typed, or clear it with an empty string. */
export function writeAmapKey(key: string): boolean {
  const trimmed = key.trim();

  try {
    if (typeof localStorage === "undefined") return false;

    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY);

      return true;
    }

    localStorage.setItem(STORAGE_KEY, trimmed);

    return true;
  } catch {
    // Private mode refusing writes. The key is still usable for this session
    // through the caller's own state, so a false here is not fatal — it just
    // means the next reload asks again.
    return false;
  }
}

/** Where the key in use came from, for the UI that explains what is running. */
export function amapKeySource(): "typed" | "build" | null {
  if (typedKey()) return "typed";

  return buildKey() ? "build" : null;
}

function buildKey(): string | null {
  const configured = import.meta.env?.VITE_AMAP_KEY;

  return typeof configured === "string" && configured.length > 0 ? configured : null;
}

function typedKey(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;

    const stored = localStorage.getItem(STORAGE_KEY);

    return typeof stored === "string" && stored.trim().length > 0
      ? stored.trim()
      : null;
  } catch {
    // Reading can throw in some private modes as well as writing.
    return null;
  }
}
