import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { createMallSkeleton } from "../scenes/mallSkeleton";
import { sizeForArea } from "../scenes/shopLayout";
import {
  describeDemandInference,
  poiCountsToArrivalProfile,
} from "../site/demandInference";
import type { ProjectDetails } from "./ProjectDetailsForm";

/**
 * Turn "a place, described in a form" into a scene the engine can run.
 *
 * This is the one place a `planSource` becomes geometry, and the choice is
 * forced by what each source can honestly produce:
 *
 * - **`skeleton`** really does generate — `createMallSkeleton` cuts the floor
 *   description into walls, store lots, shops and the vertical circulation. The
 *   escalator positions inside it are its own, and the record says the plan
 *   source is "generated" so nobody reads them as surveyed.
 * - **`drawn` / `dxf` / `glb`** produce **nothing here**. A drawn plan does not
 *   exist yet, a DXF is a file the editor has not been given, and a GLB has no
 *   walls in it at all (see `sceneModelAssets.ts` — it is a render asset). So
 *   all three open an empty world with the project's own footprint as its size.
 *
 * That empty world is the honest result: it is what the user sees before they
 * draw anything, and the editor opens with the wall tool waiting. Growing walls
 * from the area and floor count instead would produce a building that looked
 * surveyed and was invented — the same failure the site-bundle import refuses
 * to make.
 */

export function sceneForNewProject(
  details: ProjectDetails,
  place: { lat: number; lng: number; radiusMeters: number },
): CrowdSimScene {
  if (details.planSource === "skeleton") {
    return withSiteDemand(skeleton(details, place), details);
  }

  return withSiteDemand(emptyWorld(details, place), details);
}

function withSiteDemand(scene: CrowdSimScene, details: ProjectDetails): CrowdSimScene {
  if (!details.siteDemand) return scene;

  const counts = Object.fromEntries(
    details.siteDemand.poi.layers.map((layer) => [
      layer.key,
      layer.reportedTotal ?? layer.count ?? 0,
    ]),
  );
  const demand = poiCountsToArrivalProfile(counts, {
    coefficients: details.siteDemand.coefficients,
  });
  const existingSources = scene.entrances.filter(
    (entrance) => entrance.kind !== "sink",
  );
  const sourceCount = Math.max(1, existingSources.length);
  const entrances =
    scene.entrances.length > 0
      ? scene.entrances.map((entrance) =>
          entrance.kind === "sink"
            ? entrance
            : {
                ...entrance,
                arrivalRatePerMinute: demand.ratesPerMinute[0] / sourceCount,
                arrivalProfile: {
                  intervalMinutes: demand.slotMinutes,
                  ratesPerMinute: demand.ratesPerMinute.map(
                    (rate) => rate / sourceCount,
                  ),
                },
              },
        )
      : [
          {
            id: `${scene.id}-source`,
            name: "待确认入口",
            kind: "source" as const,
            position: { x: 1, y: scene.world.height / 2 },
            width: 2,
            arrivalRatePerMinute: demand.ratesPerMinute[0],
            arrivalProfile: {
              intervalMinutes: demand.slotMinutes,
              ratesPerMinute: demand.ratesPerMinute,
            },
          },
          {
            id: `${scene.id}-sink`,
            name: "待确认出口",
            kind: "sink" as const,
            position: { x: scene.world.width - 1, y: scene.world.height / 2 },
            width: 2,
          },
        ];

  return parseScene({
    ...scene,
    entrances,
    customParameters: {
      ...scene.customParameters,
      siteDemand: {
        source: "Amap POI listings",
        queriedRadiusMeters: details.siteDemand.poi.radiusMeters,
        counts,
        coefficients: details.siteDemand.coefficients,
        coefficientsAreCalibrated: false,
        siteVisitsPerDay: demand.siteVisitsPerDay,
        slotMinutes: demand.slotMinutes,
        ratesPerMinute: demand.ratesPerMinute,
        notes: describeDemandInference(demand),
      },
    },
  });
}

/**
 * A footprint-sized world with nothing in it.
 *
 * The size comes from the area the form asked for, at the same 2:3 ratio
 * `sizeForArea` uses everywhere else in the app, so a shop entered here
 * occupies the same ground as one resized in the layout panel. That ratio is
 * self-chosen and documented at its source; what it produces is *a* rectangle
 * to work in, and the walls the user draws inside it are what the simulation
 * will see.
 */
function emptyWorld(
  details: ProjectDetails,
  place: { lat: number; lng: number; radiusMeters: number },
): CrowdSimScene {
  const size = sizeForArea(details.areaSquareMeters);

  return baseScene(details, place, {
    height: Math.max(10, Math.ceil(size.height)),
    width: Math.max(10, Math.ceil(size.width)),
  });
}

/**
 * A mall from the form's floor count and one zone per floor.
 *
 * The zones are placeholders sized to the footprint, because a form does not
 * say where the jewellery counter is. What the skeleton adds on its own —
 * perimeter walls, store lots, escalators, lifts and ground-floor doors — is
 * layout logic rather than a claim about this building, and it is placed by
 * that same logic whether or not anyone has drawn the real thing.
 */
function skeleton(
  details: ProjectDetails,
  place: { lat: number; lng: number; radiusMeters: number },
): CrowdSimScene {
  const size = sizeForArea(details.areaSquareMeters);
  const world = {
    height: Math.max(20, Math.ceil(size.height)),
    width: Math.max(20, Math.ceil(size.width)),
  };

  // Inset by 4 m on each side: the perimeter wall goes there, so a zone that
  // ran to the edge would be generated inside the wall.
  const zoneWidth = world.width - 8;
  const zoneHeight = world.height - 8;

  const scene = createMallSkeleton({
    id: sceneId(details),
    name: details.name,
    world,
    atrium: { x: world.width / 2, y: world.height / 2 },
    floors: Array.from({ length: Math.max(1, details.floors) }, (_, level) => ({
      id: `f${level + 1}`,
      level,
      zones: [
        {
          category: "dining" as const,
          rect: {
            x: 4,
            y: 4,
            // The whole inner area is one zone; the store-lot generator cuts it
            // into shops. Splitting it by hand is the editor's job.
            width: zoneWidth,
            height: zoneHeight,
          },
        },
      ],
    })),
  });

  // The generator takes a name but not a coordinate; both travel on
  // `customParameters` so nothing has to parse them back out of a wall.
  return withLocation(withBrand(scene, details), place);
}

function baseScene(
  details: ProjectDetails,
  place: { lat: number; lng: number; radiusMeters: number },
  world: { height: number; width: number },
): CrowdSimScene {
  return withLocation(
    withBrand(
      parseScene({
        schemaVersion: "1.0.0",
        id: sceneId(details),
        name: details.name,
        world,
      }),
      details,
    ),
    place,
  );
}

/**
 * One shop carrying the project's business category, so the engine has a
 * category to reason about before anyone has laid out tables. No capacity
 * claim: a shop with no plan has no seats to count.
 *
 * **It is a placeholder, and it is on screen from the first frame.** The engine
 * has nothing to simulate without a shop, so a new project opens with a box in
 * the middle of the world. The box is large — a third of the footprint in each
 * dimension — and it is the only shop on screen while `drawn` has produced no
 * geometry at all, which makes it read as a measured store rather than a
 * stand-in. So it says so in the two places a reader will actually look: its
 * own `name`, which every label reads, and `placeholderFor`, which is a
 * machine-readable answer to "why does this box exist" for anything reading
 * the scene later. `signText` would have been the natural place to show it in
 * 3D, but nothing in the renderer reads that field.
 */
function withBrand(scene: CrowdSimScene, details: ProjectDetails): CrowdSimScene {
  return parseScene({
    ...scene,
    shops: [
      {
        id: `${scene.id}-shop`,
        name: details.name,
        position: {
          x: scene.world.width / 2,
          y: scene.world.height / 2,
        },
        size: {
          height: Math.max(4, scene.world.height / 3),
          width: Math.max(4, scene.world.width / 3),
        },
        brand: {
          category: details.businessCategory,
          name: details.name,
          profileId: `${scene.id}-brand`,
        },
        customParameters: {
          placeholderFor: "no floor plan drawn yet",
          // So a reader can tell this box from a store somebody measured.
          sizeDerivedFrom: "world footprint / 3, not from a plan",
        },
      },
    ],
  });
}

/**
 * Where the site is, carried on the scene.
 *
 * `customParameters` rather than a new schema field: the engine has no use for
 * a coordinate, and adding one to say "this is where the project is" would be a
 * field nothing reads. It rides along so an exported scene still knows its own
 * site without the project record beside it.
 */
function withLocation(
  scene: CrowdSimScene,
  place: { lat: number; lng: number; radiusMeters: number },
): CrowdSimScene {
  return parseScene({
    ...scene,
    customParameters: {
      ...scene.customParameters,
      siteLocation: {
        catchmentRadiusMeters: place.radiusMeters,
        coordinateSystem: "GCJ-02",
        lat: place.lat,
        lng: place.lng,
      },
    },
  });
}

function sceneId(details: ProjectDetails) {
  return `project-${details.planSource}-${slug(details.name)}`;
}

/**
 * An id-safe fragment of the project name.
 *
 * `idSchema` allows letters, digits, `_` and `-` only, so a Chinese name
 * reduces to `untitled` — and two projects both named 中街商场 would collide.
 * The name is not lost: it is the scene's `name`, which is what every label
 * reads. The id only has to be unique among the projects a person makes, and
 * the plan source plus a slug of whatever ASCII the name has is enough for
 * that; the collision case is caught by `sceneForNewProject`'s own test rather
 * than pretended away here.
 */
function slug(name: string) {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return ascii || "untitled";
}
