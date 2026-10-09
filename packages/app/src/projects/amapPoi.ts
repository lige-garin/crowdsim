/**
 * Amap POI counts around a point, fetched from the browser.
 *
 * **This is the same API `caidian` uses, minus the parts that need a server.**
 * `caidian` is Express + Redis: it fans out 12 layers with multi-centre
 * sampling, four de-duplication passes, QPS pacing between pages and a Redis
 * cache in front. A browser has none of those, so what is borrowed is only
 * what belongs to Amap rather than to `caidian` — the layer → type-code table
 * (`amapService.ts:125`) and the `/place/around` request shape
 * (`amapService.ts:875`). Everything that makes `caidian`'s counts reliable is
 * absent here, and the results say so.
 *
 * Three consequences, all of them visible in the UI rather than buried:
 *
 * 1. **No de-duplication.** Amap returns one POI per listing, and a campus
 *    with six gates is six POIs. `caidian` merges those; these counts do not,
 *    so a residential figure is a listing count, not a community count.
 * 2. **One page per layer.** `offset` is 25 and no paging follows, so a dense
 *    layer is truncated at 25 and the count is a floor, not a total. Anything
 *    that wants a real total has to page, which costs more quota.
 * 3. **No cache.** Every click spends quota. That is why the query is a
 *    button and not something the form does on its own.
 *
 * The coordinates are **GCJ-02**, the same system the place/around endpoint
 * takes and the same one the rest of this flow uses. Converting to WGS-84
 * before searching would place the centre ~570 m off in Shenyang, which is a
 * fifth of the 3 km catchment.
 */

const AMAP_BASE = "https://restapi.amap.com/v3/place/around";

/** Amap's own page limit for this endpoint. One page is all this fetches. */
const PAGE_SIZE = 25;

/**
 * The layers to count, and the type code each one means.
 *
 * Codes are Amap's, verified against the live API by `caidian`; the file it
 * came from is cited so a change there has an obvious counterpart here. This
 * is a deliberately short list: these are the layers a footfall estimate is
 * about, not everything `caidian` scores a site on.
 */
export const POI_LAYERS = [
  { key: "residential", code: "120302", labelZh: "住宅小区", labelEn: "Residential" },
  { key: "school", code: "141200", labelZh: "学校", labelEn: "Schools" },
  { key: "office", code: "120201", labelZh: "写字楼", labelEn: "Offices" },
  { key: "mall", code: "060100", labelZh: "商场", labelEn: "Malls" },
  { key: "subway", code: "150500", labelZh: "地铁站", labelEn: "Subway" },
  { key: "bus", code: "150700", labelZh: "公交站", labelEn: "Bus stops" },
  {
    key: "competitor",
    code: "060000",
    labelZh: "购物餐饮",
    labelEn: "Shops to compete with",
  },
] as const;

export type PoiLayerKey = (typeof POI_LAYERS)[number]["key"];

/**
 * What one layer's query produced.
 *
 * `count` is what Amap reported, `truncated` says whether there were more
 * than we asked for, and `failure` is set when the layer did not come back.
 * A failed layer is not a zero: those are different facts and the UI shows
 * them differently.
 */
export type PoiLayerResult = {
  key: PoiLayerKey;
  labelZh: string;
  labelEn: string;
  /** Listings Amap reported, capped at the page size. Null when the call failed. */
  count: number | null;
  /** Amap's own total, which may exceed the page we fetched. Null on failure. */
  reportedTotal: number | null;
  truncated: boolean;
  /** Why this layer has no number, when it has none. */
  failure?: string;
};

export type PoiQueryResult = {
  radiusMeters: number;
  layers: PoiLayerResult[];
  /** Layers that came back, out of the ones asked for. */
  succeeded: number;
  requested: number;
};

export type FetchLike = (input: string) => Promise<{
  json: () => Promise<unknown>;
}>;

/**
 * Count POIs per layer around a point.
 *
 * Layers are fetched **sequentially, not in parallel**: Amap's QPS quota is
 * per key, and seven simultaneous requests are how a key gets throttled into
 * returning `status: "0"` for the rest of the day. Sequential keeps it to one
 * request in flight and costs about a second in total.
 */
export async function queryPoisAround(options: {
  key: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  fetchImpl?: FetchLike;
}): Promise<PoiQueryResult> {
  const { key, lat, lng, radiusMeters } = options;
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);

  if (!doFetch) {
    throw new Error("This browser cannot make the POI request.");
  }

  const layers: PoiLayerResult[] = [];

  for (const layer of POI_LAYERS) {
    layers.push(await queryLayer(layer, { key, lat, lng, radiusMeters, doFetch }));
  }

  return {
    radiusMeters,
    layers,
    succeeded: layers.filter((layer) => layer.count !== null).length,
    requested: layers.length,
  };
}

async function queryLayer(
  layer: (typeof POI_LAYERS)[number],
  context: {
    key: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    doFetch: FetchLike;
  },
): Promise<PoiLayerResult> {
  const { key, lat, lng, radiusMeters, doFetch } = context;
  const base = {
    key: layer.key,
    labelZh: layer.labelZh,
    labelEn: layer.labelEn,
  };

  // Amap's radius is metres and capped at 50,000; a catchment past that is not
  // a catchment this tool reasons about, and asking is a rejected request.
  const radius = Math.min(50_000, Math.max(1, Math.round(radiusMeters)));

  try {
    const url =
      `${AMAP_BASE}?key=${encodeURIComponent(key)}` +
      `&location=${lng},${lat}` +
      `&radius=${radius}` +
      `&types=${encodeURIComponent(layer.code)}` +
      `&offset=${PAGE_SIZE}` +
      `&page=1` +
      `&extensions=base` +
      `&output=JSON`;

    const response = await doFetch(url);
    const body = (await response.json()) as {
      status?: string;
      info?: string;
      count?: string;
      pois?: unknown[];
    };

    if (body.status !== "1") {
      // Amap puts quota exhaustion, a bad key and a bad type code all in
      // `info`, and the message is worth showing verbatim: the fix differs
      // completely for each.
      return {
        ...base,
        count: null,
        reportedTotal: null,
        truncated: false,
        failure: body.info ?? `AMap refused this layer (status ${body.status ?? "?"})`,
      };
    }

    const fetched = Array.isArray(body.pois) ? body.pois.length : 0;
    const reportedTotal = Number.isFinite(Number(body.count))
      ? Number(body.count)
      : fetched;

    return {
      ...base,
      count: fetched,
      reportedTotal,
      // Amap's `count` is the total it found, so anything above the page we
      // read is a number this app has not seen the locations of.
      truncated: reportedTotal > fetched,
    };
  } catch (error) {
    return {
      ...base,
      count: null,
      reportedTotal: null,
      truncated: false,
      failure: error instanceof Error ? error.message : "the request failed",
    };
  }
}
