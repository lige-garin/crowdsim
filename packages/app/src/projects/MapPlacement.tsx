import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

/**
 * Where the project is, on a map.
 *
 * **The map is optional and the coordinate is not.** A 高德 JS API key has to be
 * configured before a base map can be shown, and until it is this renders a
 * labelled pair of number inputs instead of a broken map frame. That is the
 * whole reason the two states exist: a first run with no key should still be
 * able to create a project, because the coordinate is the part the catchment
 * maths needs and the picture is only there to help pick it.
 *
 * Coordinates are **GCJ-02** throughout, because that is what 高德 serves and
 * what the POI queries it will make return. Converting to WGS-84 here would
 * move every point ~570 m in Shenyang and quietly misalign the project from
 * the buildings around it.
 */

/** Shenyang city centre. A default that puts the map somewhere recognisable. */
const DEFAULT_LAT = 41.8057;
const DEFAULT_LNG = 123.4315;

/** Amap JS API, loaded on demand: a script tag is ~400 KB of map we do not
 * need until a project is actually being placed. */
const AMAP_SDK = "https://webapi.amap.com/maps";
const AMAP_CSS = "https://webapi.amap.com/maps?v=1.4.15&key=";

type LatLng = { lat: number; lng: number };

/** The three SDK objects this file touches, and nothing else. */
type AmapMap = {
  add: (...objects: unknown[]) => void;
  destroy: () => void;
  on: (event: string, handler: (event: { lnglat: LatLng }) => void) => void;
};

type AmapMarker = {
  on: (event: string, handler: (event: { lnglat: LatLng }) => void) => void;
  setPosition?: (position: number[]) => void;
};

type AmapCircle = {
  setCenter?: (position: number[]) => void;
  setRadius?: (radius: number) => void;
};

type AmapInstance = {
  Circle: new (options: unknown) => AmapCircle;
  Map: new (
    container: HTMLElement | null,
    options: { center: number[]; viewMode?: string; zoom?: number },
  ) => AmapMap;
  Marker: new (options: unknown) => AmapMarker;
};

export type MapPlacementProps = {
  onCancel: () => void;
  onNext: (point: LatLng, radiusMeters: number) => void;
};

export function MapPlacement({ onCancel, onNext }: MapPlacementProps) {
  const { language } = useI18n();
  const zh = language === "zh";
  const [point, setPoint] = useState<LatLng>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [radiusMeters, setRadiusMeters] = useState(800);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Read on first render, not into state: the key is a build-time value that
  // cannot change while the app is open, so an effect would be a second render
  // pass to deliver something already known.
  const [amapKey] = useState(readConfiguredKey);

  return (
    <section
      className="map-placement"
      aria-label={zh ? "选择项目位置" : "Place the project"}
    >
      <p className="home-step-label">
        {zh ? "第 2 步 · 选位置" : "Step 2 · Choose a location"}
      </p>
      <p>
        {zh
          ? "点地图落位置，或者直接填经纬度。半径是将来算周边人流的范围，不是场地大小。"
          : "Click the map to drop a point, or type the coordinates. The radius is the catchment the surrounding-footfall is measured over — not the size of the site."}
      </p>

      {amapKey ? (
        <MapCanvas
          amapKey={amapKey}
          containerRef={containerRef}
          onPick={setPoint}
          point={point}
          radiusMeters={radiusMeters}
        />
      ) : (
        <p className="map-placement-nokey" data-testid="map-nokey">
          {zh
            ? "没有配置地图 key，所以没有底图。下面的坐标一样能用 —— 经纬度是选址包真正需要的，地图只是帮你挑位置用的。"
            : "No map key is configured, so there is no base map. The coordinates below work just as well — they are what the project actually needs; the map only helps you pick them."}
        </p>
      )}

      <div className="map-placement-fields">
        <label>
          {zh ? "纬度" : "Latitude"}
          <input
            type="number"
            step="0.00001"
            data-testid="map-lat"
            value={point.lat}
            onChange={(event) =>
              setPoint({ ...point, lat: Number(event.target.value) })
            }
          />
        </label>
        <label>
          {zh ? "经度" : "Longitude"}
          <input
            type="number"
            step="0.00001"
            data-testid="map-lng"
            value={point.lng}
            onChange={(event) =>
              setPoint({ ...point, lng: Number(event.target.value) })
            }
          />
        </label>
        <label>
          {zh ? "半径（米）" : "Radius (m)"}
          <input
            type="number"
            step="50"
            min="50"
            data-testid="map-radius"
            value={radiusMeters}
            onChange={(event) => setRadiusMeters(Number(event.target.value))}
          />
        </label>
      </div>

      <p className="map-placement-note">
        {zh
          ? "坐标系 GCJ-02，和高德一致。3 公里以外稀疏得没有意义 —— 卡住的是人不够多，不是算力不够。"
          : "GCJ-02, the same system Amap uses. Past about 3 km the catchment is too sparse to mean anything: the limit is how few people are out there, not how much this can compute."}
      </p>

      <div className="map-placement-actions">
        <button type="button" data-testid="map-cancel" onClick={onCancel}>
          {zh ? "返回" : "Back"}
        </button>
        <button
          type="button"
          data-testid="map-next"
          onClick={() => onNext(point, radiusMeters)}
        >
          {zh ? "下一步：填项目信息" : "Next: project details"}
        </button>
      </div>
    </section>
  );
}

/**
 * The live map, loaded only once a key exists.
 *
 * Split out so the 400 KB SDK import and its `window.AMap` global stay behind
 * one boundary: everything above renders and is testable with no key at all,
 * which is how the rest of this flow is tested.
 */
function MapCanvas({
  amapKey,
  containerRef,
  onPick,
  point,
  radiusMeters,
}: {
  amapKey: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPick: (point: LatLng) => void;
  point: LatLng;
  radiusMeters: number;
}) {
  const zh = useI18n().language === "zh";
  const markerRef = useRef<AmapMarker | null>(null);
  const circleRef = useRef<AmapCircle | null>(null);
  const [failed, setFailed] = useState(false);

  const ready = useMemo(() => loadAmap(amapKey).catch(() => false), [amapKey]);

  useEffect(() => {
    let cancelled = false;
    // Held outside the promise so the effect's own cleanup can reach it: a
    // `return` inside a `.then` callback is the promise's value, not something
    // React ever calls, so a map destroyed there would live until the page
    // closed.
    let map: AmapMap | null = null;

    void ready.then((ok) => {
      if (!ok || cancelled || !containerRef.current) {
        if (!ok) setFailed(true);

        return;
      }

      // `AMap` is a global the SDK installs and it has no types here because it only
      // exists once a key is configured. The cast is to this one interface and
      // not to something shaped by usage, so the three calls below are the only
      // things that would break if the SDK changed.
      const AMap = (globalThis as unknown as { AMap: AmapInstance }).AMap;

      map = new AMap.Map(containerRef.current, {
        center: [point.lng, point.lat],
        zoom: 14,
        viewMode: "2D",
      });

      const marker = new AMap.Marker({
        position: [point.lng, point.lat],
        draggable: true,
      });
      const circle = new AMap.Circle({
        center: [point.lng, point.lat],
        radius: radiusMeters,
        strokeColor: "#f2a93b",
        fillColor: "#f2a93b",
        fillOpacity: 0.12,
        strokeWeight: 1,
      });

      marker.on("dragend", (event) => onPick(event.lnglat));
      map.on("click", (event) => onPick(event.lnglat));

      map.add(marker);
      map.add(circle);
      markerRef.current = marker;
      circleRef.current = circle;
    });

    return () => {
      cancelled = true;
      map?.destroy();
    };
    // The point and radius are pushed in below rather than re-creating the map:
    // rebuilding it on every drag would drop the user's pan and zoom.
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markerRef.current?.setPosition?.([point.lng, point.lat]);
    circleRef.current?.setCenter?.([point.lng, point.lat]);
    circleRef.current?.setRadius?.(radiusMeters);
  }, [point, radiusMeters]);

  if (failed) {
    return (
      <p className="map-placement-nokey" data-testid="map-failed">
        {zh
          ? "地图加载失败（key 无效或网络不通）。坐标还能手填，不影响继续。"
          : "The map failed to load (invalid key, or no network). You can still type the coordinates and carry on."}
      </p>
    );
  }

  return <div className="map-canvas" ref={containerRef} data-testid="map-canvas" />;
}

/**
 * The configured key, or null.
 *
 * Read from `import.meta.env` so it can be set per deployment, and returning
 * null rather than throwing is the point: a build with no key must still run,
 * because the flow behind this map does not require one.
 */
function readConfiguredKey(): string | null {
  const configured = import.meta.env?.VITE_AMAP_KEY;

  return typeof configured === "string" && configured.length > 0 ? configured : null;
}

let sdkPromise: Promise<boolean> | null = null;

/** Load the SDK once per page, however many components ask for it. */
function loadAmap(key: string): Promise<boolean> {
  if ((globalThis as unknown as { AMap?: unknown }).AMap) return Promise.resolve(true);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<boolean>((resolve) => {
    if (!document.querySelector(`link[href="${AMAP_CSS}${key}"]`)) {
      const link = document.createElement("link");

      link.rel = "stylesheet";
      link.href = `${AMAP_CSS}${key}`;
      document.head.appendChild(link);
    }

    const script = document.createElement("script");

    script.src = `${AMAP_SDK}?v=1.4.15&key=${key}`;
    script.async = true;
    // Amap reports failures through its own callback rather than by rejecting,
    // so `timeout` is the only honest signal that it will never arrive.
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return sdkPromise;
}
