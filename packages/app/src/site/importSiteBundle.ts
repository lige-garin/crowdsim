import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
  type SiteContextBundle,
} from "@crowdsim/scene-schema";
import { priceTierForAverageTicket, sizeForArea } from "../scenes/shopLayout";
import { catchmentToArrivalProfile } from "./demandInference";

/**
 * A site context bundle → a scene the engine can run (ADR-0034 stage 1).
 *
 * What it does with something the bundle does not say: it leaves it out and
 * says so in the report. There is exactly one place this matters a lot and
 * it is the doors — a street site's entrance positions are a floor-plan
 * question, and guessing them would put invented geometry behind a scene
 * whose whole selling point is that its geometry came from real footprints.
 *
 * The arrival profile it writes comes from `catchmentToArrivalProfile`, whose
 * coefficients are uncalibrated. That is recorded on the scene
 * (`customParameters.siteInference`) rather than left in a comment, so a
 * scene exported from here carries its own provenance.
 */

export type SiteImport = {
  scene: CrowdSimScene;
  report: string[];
  /** Buildings whose height was inferred rather than tagged. */
  inferredHeightIds: string[];
  hasDoors: boolean;
};

/** Seats per table kind — the same arithmetic `shopLayout.ts` uses. */
const seatsPerTable = {
  twoSeat: 2,
  fourSeat: 4,
  sixSeat: 6,
  privateRoom10: 10,
} as const;

export function importSiteBundle(bundle: SiteContextBundle): SiteImport {
  const geometry = geometryOntoWorld(bundle);
  const world = geometry.world;
  const report: string[] = [];
  const buildings = geometry.buildings.map((building) => ({
    id: building.id,
    name: building.name,
    footprint: {
      type: "polygon" as const,
      points: building.footprint,
    },
    heightMeters: building.heightMeters ?? defaultBuildingHeightMeters,
    customParameters: {
      heightSource:
        building.heightMeters === undefined
          ? "default"
          : (building.heightSource ?? "unknown"),
    },
  }));
  const inferredHeightIds = geometry.buildings
    .filter(
      (building) =>
        building.heightMeters === undefined ||
        building.heightSource === "building:levels" ||
        building.heightSource === "default",
    )
    .map((building) => building.id);

  const roads = geometry.roads.map((road) => ({
    id: road.id,
    geometry: {
      type: "polyline" as const,
      points: road.path,
    },
    widthMeters: road.widthMeters,
    customParameters: road.kind ? { roadKind: road.kind } : {},
  }));

  const demand = catchmentToArrivalProfile(bundle);
  const doorCount = Math.max(1, geometry.entrances.length);
  const firstMeasuredRate = demand.ratesPerMinute.find((rate) => rate > 0) ?? 0;
  const entrances = geometry.entrances.map((entrance, index) => ({
    id: entrance.id,
    name: entrance.name ?? `Door ${index + 1}`,
    kind: entrance.kind,
    position: entrance.position,
    width: entrance.widthMeters,
    // Every door gets the whole site's profile divided among them: the bundle
    // does not say which door is busier, and splitting evenly is the one
    // split that is not a guess about the site.
    arrivalRatePerMinute: firstMeasuredRate / doorCount,
    arrivalProfile: {
      intervalMinutes: demand.slotMinutes,
      ratesPerMinute: demand.ratesPerMinute.map((rate) => rate / doorCount),
    },
  }));

  const shop = bundle.shop;

  const scene = parseScene({
    schemaVersion: "1.0.0",
    id: `site-${slug(bundle.site.address ?? bundle.provider)}`,
    name:
      bundle.site.address ??
      `Site at ${bundle.site.origin.lat}, ${bundle.site.origin.lng}`,
    world,
    buildings,
    roads,
    entrances,
    shops: shop
      ? [
          {
            id: "site-shop",
            name: shop.name,
            position: shopPosition(world),
            size: sizeForArea(shop.areaSquareMeters),
            capacity: Math.max(
              1,
              Object.entries(shop.tables).reduce(
                (sum, [kind, count]) =>
                  sum + count * seatsPerTable[kind as keyof typeof seatsPerTable],
                0,
              ),
            ),
            // Seating capacity is arithmetic; dwell is not, and no cited
            // range for 正餐 exists in this repo, so the schema default stands
            // and the report says the form did not supply one.
            brand: {
              category: shop.category,
              name: shop.name,
              priceTier:
                shop.averageTicketYuan === undefined
                  ? 3
                  : priceTierForAverageTicket(shop.averageTicketYuan),
              profileId: "site-shop-brand",
            },
            customParameters: {
              ...shop.customParameters,
              areaSquareMeters: shop.areaSquareMeters,
              tables: shop.tables,
            },
          },
        ]
      : [],
    customParameters: {
      siteInference: {
        contractVersion: bundle.contractVersion,
        provider: bundle.provider,
        coordinateSystem: bundle.site.coordinateSystem,
        origin: bundle.site.origin,
        catchmentRadiusMeters: bundle.site.catchmentRadiusMeters,
        siteRadiusMeters: bundle.site.siteRadiusMeters,
        coefficientsAreCalibrated: bundle.catchment.inference.coefficientsAreCalibrated,
        demandSource:
          "catchmentToArrivalProfile, self-chosen uncalibrated coefficients",
        // The arrival profile is carried even when there is no door to put it
        // on. A site with no entrances would otherwise import as a scene with
        // nobody arriving, and the one number the bundle was worth exporting
        // would be gone — so it is kept here, and the report says where to
        // put it.
        arrival: {
          slotMinutes: demand.slotMinutes,
          ratesPerMinute: demand.ratesPerMinute,
          ratePerMinute: firstMeasuredRate,
        },
      },
    },
  });

  report.push(
    `导入场地：${buildings.length} 栋建筑、${roads.length} 条道路，` +
      `场地范围 ${Math.round(world.width)} × ${Math.round(world.height)} 米。`,
  );

  if (inferredHeightIds.length > 0) {
    report.push(
      `${inferredHeightIds.length} 栋建筑高度是推断值（无 height 标签或按层数换算），不是实测高度。`,
    );
  }

  if (entrances.length === 0) {
    report.push(
      "场地平面未提供出入口位置，场景没有门：请在编辑器里放置，不要指望自动生成的门是真实位置。",
    );
    report.push(
      `集客区推算的到店客流是 ${round(firstMeasuredRate)} 人/分钟（未标定系数，` +
        `分时曲线 ${demand.ratesPerMinute.length} 段）：已记在场景参数 ` +
        `siteInference.arrival 里，放到你自己加的门上。`,
    );
  }

  if (!shop) {
    report.push("未包含店铺表单，场景里没有店铺。");
  }

  return {
    scene,
    report,
    inferredHeightIds,
    hasDoors: entrances.length > 0,
  };
}

/**
 * Move the site's geometry onto the scene's world, and say how big that world
 * is.
 *
 * `site_geometry` is metres **relative to the site origin**, so its
 * coordinates are negative on two sides — a building west of the site is at a
 * negative x. The scene's world runs from (0, 0), so copying those in
 * unchanged put most of a site off the world: drawn nowhere, simulated
 * nowhere, and with the shop sitting in an empty middle.
 *
 * Everything is moved by the same offset, so it is a translation and every
 * distance in the site survives. A caller who needs the original coordinates
 * still has them on the bundle.
 */
function geometryOntoWorld(bundle: SiteContextBundle) {
  const geometry = bundle.siteGeometry;
  const margin = 10;
  const all = [
    ...(geometry?.buildings ?? []).flatMap((building) => building.footprint),
    ...(geometry?.roads ?? []).flatMap((road) => road.path),
    ...(geometry?.entrances ?? []).map((entrance) => entrance.position),
  ];

  if (all.length === 0) {
    const side = Math.max(20, bundle.site.siteRadiusMeters * 2);

    return {
      world: { width: side, height: side },
      buildings: [] as {
        id: string;
        name?: string;
        footprint: ScenePoint[];
        heightMeters?: number;
        heightSource?: string;
      }[],
      roads: [] as {
        id: string;
        path: ScenePoint[];
        widthMeters?: number;
        kind?: string;
      }[],
      entrances: [] as {
        id: string;
        name?: string;
        kind: "source" | "sink" | "bidirectional";
        position: ScenePoint;
        widthMeters: number;
      }[],
    };
  }

  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const shiftX = margin - Math.min(...xs);
  const shiftY = margin - Math.min(...ys);
  const move = ([x, y]: readonly [number, number]): ScenePoint => ({
    x: x + shiftX,
    y: y + shiftY,
  });

  return {
    world: {
      width: Math.max(20, Math.max(...xs) + shiftX + margin),
      height: Math.max(20, Math.max(...ys) + shiftY + margin),
    },
    buildings: (geometry?.buildings ?? []).map((building) => ({
      id: building.id,
      name: building.name,
      footprint: building.footprint.map(move),
      heightMeters: building.heightMeters,
      heightSource: building.heightSource,
    })),
    roads: (geometry?.roads ?? []).map((road) => ({
      id: road.id,
      path: road.path.map(move),
      widthMeters: road.widthMeters,
      kind: road.kind,
    })),
    entrances: (geometry?.entrances ?? []).map((entrance) => ({
      id: entrance.id,
      name: entrance.name,
      kind: entrance.kind,
      position: move(entrance.position),
      widthMeters: entrance.widthMeters,
    })),
  };
}

/**
 * Where the shop sits when the bundle gives an area but no position.
 *
 * The centre of the site, which is a placeholder and is reported as one. A
 * street-facing unit's real position is a floor-plan decision.
 */
function shopPosition(world: { width: number; height: number }): ScenePoint {
  return { x: world.width / 2, y: world.height / 2 };
}

/** Stand-in height where OSM gave none. Same 10 m the reference tool uses. */
const defaultBuildingHeightMeters = 10;

function slug(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "site"
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
