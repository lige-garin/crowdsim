import { describe, expect, it } from "vitest";
import { POI_LAYERS, queryPoisAround, type FetchLike } from "./amapPoi";

/**
 * A `fetch` that answers with what Amap would answer, and records what it was
 * asked. The layer list is driven by `POI_LAYERS` so a new layer shows up here
 * as a missing handler rather than as a silent pass.
 */
function fakeFetch(respond: (url: string) => unknown, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);

    return { json: async () => respond(url) };
  };
}

function ok(count: number, pois: number) {
  return { status: "1", count: String(count), pois: Array.from({ length: pois }) };
}

const place = { key: "test-key", lat: 41.8057, lng: 123.4315, radiusMeters: 800 };

describe("queryPoisAround", () => {
  it("asks Amap for the point, in the order Amap expects", async () => {
    const calls: string[] = [];

    await queryPoisAround({
      ...place,
      fetchImpl: fakeFetch(() => ok(0, 0), calls),
    });

    // `location` is `lng,lat` on this endpoint, which is the reverse of the
    // `lat,lng` everywhere else in this flow — getting it backwards silently
    // searches 400 km away and returns nothing rather than erroring.
    expect(calls[0]).toContain("location=123.4315,41.8057");
    expect(calls[0]).toContain("radius=800");
    expect(calls[0]).toContain("key=test-key");

    const byLayer = new Map(
      POI_LAYERS.map((layer, index) => [layer.key, calls[index] ?? ""]),
    );
    expect(byLayer.get("mall")).toContain("types=060100");
    expect(byLayer.get("bus")).toContain("types=150700");
  });

  it("reads a layer's listings, and does not confuse a failure with a zero", async () => {
    const calls: string[] = [];

    const result = await queryPoisAround({
      ...place,
      fetchImpl: fakeFetch((url) => {
        // One layer comes back empty, one comes back with listings, one fails.
        if (url.includes("types=150500")) return ok(0, 0);
        if (url.includes("types=120201")) return ok(12, 12);

        return { status: "0", info: "INVALID_USER_KEY" };
      }, calls),
    });

    const subway = result.layers.find((layer) => layer.key === "subway");
    const office = result.layers.find((layer) => layer.key === "office");
    const mall = result.layers.find((layer) => layer.key === "mall");

    // A zero is a fact about the map: nothing within 800 m.
    expect(subway?.count).toBe(0);
    expect(subway?.failure).toBeUndefined();

    expect(office?.count).toBe(12);
    expect(office?.truncated).toBe(false);

    // A refusal is not a zero. Showing 0 for a failed layer would put a real
    // number on screen that nobody measured.
    expect(mall?.count).toBeNull();
    expect(mall?.failure).toBe("INVALID_USER_KEY");
  });

  it("says a layer is truncated when Amap found more than it returned", async () => {
    // The count is a floor, not a total, and the UI has to be able to say so
    // rather than presenting 25 as "there are 25".
    const result = await queryPoisAround({
      ...place,
      fetchImpl: fakeFetch(() => ok(310, 25)),
    });

    const residential = result.layers.find((layer) => layer.key === "residential");

    expect(residential?.count).toBe(25);
    expect(residential?.reportedTotal).toBe(310);
    expect(residential?.truncated).toBe(true);
  });

  it("fetches one layer at a time, because the quota is per key", async () => {
    // Seven simultaneous requests is how a key gets throttled and then returns
    // `status: "0"` for the rest of the day.
    let inFlight = 0;
    let maxInFlight = 0;

    const fetchImpl: FetchLike = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;

      return { json: async () => ok(0, 0) };
    };

    await queryPoisAround({ ...place, fetchImpl });

    expect(maxInFlight).toBe(1);
    expect(POI_LAYERS.length).toBeGreaterThan(1);
  });

  it("survives a request that throws, rather than losing every layer with it", async () => {
    const result = await queryPoisAround({
      ...place,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    expect(result.succeeded).toBe(0);
    expect(result.requested).toBe(POI_LAYERS.length);

    for (const layer of result.layers) {
      expect(layer.count).toBeNull();
      expect(layer.failure).toBe("network down");
    }
  });

  it("caps the radius at what Amap accepts instead of asking for a rejection", async () => {
    const calls: string[] = [];

    await queryPoisAround({
      ...place,
      radiusMeters: 90_000,
      fetchImpl: fakeFetch(() => ok(0, 0), calls),
    });

    // Amap's own limit is 50,000 m. A catchment past it is not something this
    // app reasons about, and asking for one spends quota to be refused.
    expect(calls[0]).toContain("radius=50000");
  });

  it("reports how many layers came back, so a partial answer is visible", async () => {
    const result = await queryPoisAround({
      ...place,
      fetchImpl: fakeFetch((url) =>
        url.includes("types=120302") || url.includes("types=150700")
          ? ok(3, 3)
          : { status: "0", info: "quota" },
      ),
    });

    expect(result.succeeded).toBe(2);
    expect(result.requested).toBe(POI_LAYERS.length);
  });

  it("carries the radius it used, so the numbers on screen have a scale", async () => {
    const result = await queryPoisAround({
      ...place,
      fetchImpl: fakeFetch(() => ok(0, 0)),
    });

    expect(result.radiusMeters).toBe(800);
  });

  it("carries both labels, because a bare layer key is not a thing a person reads", async () => {
    const result = await queryPoisAround({
      ...place,
      fetchImpl: fakeFetch(() => ok(0, 0)),
    });

    for (const layer of result.layers) {
      expect(layer.labelZh).not.toBe("");
      expect(layer.labelEn).not.toBe("");
    }
  });

  it("does not fetch when there is no browser fetch to fetch with", async () => {
    const original = globalThis.fetch;

    // @ts-expect-error — removing the global to prove the guard, restored below.
    delete globalThis.fetch;

    await expect(queryPoisAround({ ...place, fetchImpl: undefined })).rejects.toThrow(
      /cannot make the POI request/,
    );

    globalThis.fetch = original;
  });
});
