import { afterEach, describe, expect, it, vi } from "vitest";
import { amapKeySource, readAmapKey, writeAmapKey } from "./amapKey";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("where the Amap key comes from", () => {
  it("is nothing at all when neither place has one", () => {
    // A build with no key must still run: the flow behind this map does not
    // require one, so "absent" is a supported state and not an error.
    expect(readAmapKey()).toBeNull();
    expect(amapKeySource()).toBeNull();
  });

  it("uses the build's key when that is all there is", () => {
    vi.stubEnv("VITE_AMAP_KEY", "build-key");

    expect(readAmapKey()).toBe("build-key");
    expect(amapKeySource()).toBe("build");
  });

  it("prefers a typed key over the build's, because typing one meant to replace it", () => {
    // The common case is a deployment whose baked-in key expired or ran out of
    // quota. Silently preferring the build's key would leave the user staring
    // at a failure they have already typed a fix for.
    vi.stubEnv("VITE_AMAP_KEY", "build-key");

    expect(writeAmapKey("typed-key")).toBe(true);

    expect(readAmapKey()).toBe("typed-key");
    expect(amapKeySource()).toBe("typed");
  });

  it("falls back to the build's key once the typed one is cleared", () => {
    vi.stubEnv("VITE_AMAP_KEY", "build-key");

    writeAmapKey("typed-key");
    writeAmapKey("");

    expect(readAmapKey()).toBe("build-key");
    expect(amapKeySource()).toBe("build");
  });

  it("trims what was typed, because a pasted key carries whitespace", () => {
    // Pasting out of a console is the normal way this arrives, and a trailing
    // newline in a query string is a 400 from Amap with no useful message.
    writeAmapKey("  typed-key\n");

    expect(readAmapKey()).toBe("typed-key");
  });

  it("treats whitespace as no key at all", () => {
    // Storing " " would pass the non-empty check and then fail every request.
    expect(writeAmapKey("   ")).toBe(true);
    expect(readAmapKey()).toBeNull();
  });

  it("stores the key where anyone can read it, which is why the UI has to say so", () => {
    // Not a claim that it should be hidden — a browser that can call Amap holds
    // the key either way, and `VITE_AMAP_KEY` is in the bundle in plain text
    // too. The difference is that this one does not travel with a published
    // build, and that is the sentence the key field has to carry.
    writeAmapKey("typed-key");

    expect(localStorage.getItem("crowdsim.amapKey.v1")).toBe("typed-key");
  });

  it("reports a refused write rather than throwing in private mode", () => {
    const original = Storage.prototype.setItem;

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "crowdsim.amapKey.v1") {
        throw new DOMException("quota", "QuotaExceededError");
      }

      return original.call(this, key, value);
    });

    // Not fatal: the caller keeps the key in its own state for this session,
    // it just asks again on the next reload.
    expect(writeAmapKey("typed-key")).toBe(false);
    expect(readAmapKey()).toBeNull();
  });
});
