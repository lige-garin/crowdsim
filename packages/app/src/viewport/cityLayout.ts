import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { clamp } from "../numberUtils";
import { mulberry32 } from "../engine/simulationEngineRandom";

/** Axis-aligned rectangle in scene coordinates (metres, y down). */
export type Rect = { maxX: number; maxY: number; minX: number; minY: number };

export type CityStreet = {
  rect: Rect;
  /** Centre line, for lane markings. */
  from: ScenePoint;
  to: ScenePoint;
};

export type CityBuildingStyle = "tower" | "office" | "brick" | "plaster" | "shopfront";

export type CityBuilding = {
  floors: number;
  heightMeters: number;
  rect: Rect;
  style: CityBuildingStyle;
  /** 0..1, picks a tint within the style's palette. */
  tint: number;
  /** Small boxes on the roof: plant, water tanks, lift housing. */
  roofUnits: Rect[];
};

export type CityBlock = { rect: Rect; use: "built" | "park" };

export type CityProp = { rotation: number; scale: number; x: number; y: number };

export type CityLayout = {
  blocks: CityBlock[];
  bounds: Rect;
  buildings: CityBuilding[];
  district: Rect;
  lamps: CityProp[];
  streets: CityStreet[];
  trees: CityProp[];
};

/**
 * A city around the simulated district, generated so it never touches it.
 *
 * The viewport used to fill the world with a uniform grid of identical boxes
 * (in the demo scene's former streetscape GLB, since removed) — it read as a
 * warehouse yard, and
 * because it filled the same ground the crowd walks on, depth-sorting fought
 * the agents. Here the scene's world rectangle is the district: only the
 * scene's own geometry is drawn inside it, plus plaza trees that stay clear of
 * everything people walk to. The generated city lives outside it — a street
 * grid, blocks, lots, a downtown height gradient — so the district reads as one
 * quarter of a living city rather than a slab floating in fog.
 *
 * Pure and seeded: the same scene always produces the same city.
 */
export function createCityLayout(scene: CrowdSimScene) {
  const ring = 150;
  const rng = mulberry32((scene.seed ?? 1) * 2654435761);
  const characterOffset = characterOffsetFor(scene);
  const district: Rect = {
    maxX: scene.world.width,
    maxY: scene.world.height,
    minX: 0,
    minY: 0,
  };
  const perimeter = 12;
  const inner = expand(district, perimeter);
  const bounds = expand(district, ring);

  const streets: CityStreet[] = [];
  const blocks: CityBlock[] = [];
  const buildings: CityBuilding[] = [];
  const trees: CityProp[] = [];
  const lamps: CityProp[] = [];

  // Ring road around the district, then a grid outward from it.
  const streetWidth = 10;
  const avenueWidth = 16;
  const xLines = gridLines(inner.minX, inner.maxX, bounds.minX, bounds.maxX, 42, rng);
  const yLines = gridLines(inner.minY, inner.maxY, bounds.minY, bounds.maxY, 38, rng);

  // The ring road and every third line are avenues.
  const lineWidth = (lines: number[], index: number, low: number, high: number) =>
    lines[index] === low || lines[index] === high || index % 3 === 0
      ? avenueWidth
      : streetWidth;

  xLines.forEach((x, index) => {
    const width = lineWidth(xLines, index, inner.minX, inner.maxX);
    streets.push({
      from: { x, y: bounds.minY },
      rect: {
        maxX: x + width / 2,
        maxY: bounds.maxY,
        minX: x - width / 2,
        minY: bounds.minY,
      },
      to: { x, y: bounds.maxY },
    });
  });
  yLines.forEach((y, index) => {
    const width = lineWidth(yLines, index, inner.minY, inner.maxY);
    streets.push({
      from: { x: bounds.minX, y },
      rect: {
        maxX: bounds.maxX,
        maxY: y + width / 2,
        minX: bounds.minX,
        minY: y - width / 2,
      },
      to: { x: bounds.maxX, y },
    });
  });

  const centre = { x: district.maxX / 2, y: district.maxY / 2 };
  const reach = Math.hypot(ring + district.maxX / 2, ring + district.maxY / 2);

  for (let xi = 0; xi < xLines.length - 1; xi++) {
    for (let yi = 0; yi < yLines.length - 1; yi++) {
      const cell: Rect = {
        maxX: xLines[xi + 1] - lineWidth(xLines, xi + 1, inner.minX, inner.maxX) / 2,
        maxY: yLines[yi + 1] - lineWidth(yLines, yi + 1, inner.minY, inner.maxY) / 2,
        minX: xLines[xi] + lineWidth(xLines, xi, inner.minX, inner.maxX) / 2,
        minY: yLines[yi] + lineWidth(yLines, yi, inner.minY, inner.maxY) / 2,
      };
      if (width(cell) < 12 || height(cell) < 12) continue;
      if (overlaps(cell, inner)) continue; // the district and its ring road

      const cx = (cell.minX + cell.maxX) / 2;
      const cy = (cell.minY + cell.maxY) / 2;
      // Downtown gradient: tall near the district, low towards the edge.
      const nearness =
        1 - Math.min(1, Math.hypot(cx - centre.x, cy - centre.y) / reach);
      const isPark = rng() < 0.12 && nearness < 0.8;
      blocks.push({ rect: cell, use: isPark ? "park" : "built" });

      if (isPark) {
        scatterTrees(cell, 7, rng, trees);
        continue;
      }
      fillBlock(cell, nearness, characterOffset, rng, buildings);
      lineStreetTrees(cell, rng, trees);
    }
  }

  // Lamps along every street, on both kerbs, clear of the district.
  for (const street of streets) {
    const horizontal = street.from.y === street.to.y;
    const length = horizontal
      ? street.rect.maxX - street.rect.minX
      : street.rect.maxY - street.rect.minY;
    const half = horizontal
      ? (street.rect.maxY - street.rect.minY) / 2
      : (street.rect.maxX - street.rect.minX) / 2;
    for (let along = 14; along < length; along += 28) {
      for (const side of [-1, 1]) {
        const x = horizontal
          ? street.rect.minX + along
          : street.from.x + side * (half + 1.2);
        const y = horizontal
          ? street.from.y + side * (half + 1.2)
          : street.rect.minY + along;
        if (contains(inner, x, y)) continue;
        lamps.push({
          rotation: horizontal
            ? side > 0
              ? Math.PI / 2
              : -Math.PI / 2
            : side > 0
              ? 0
              : Math.PI,
          scale: 1,
          x,
          y,
        });
      }
    }
  }

  plazaTrees(scene, district, rng, trees);

  return {
    blocks,
    bounds,
    buildings,
    district,
    lamps,
    streets,
    trees,
  } satisfies CityLayout;
}

/**
 * Everything inside the district that people walk to, walk along, or queue at,
 * padded. Plaza dressing must stay out of these or the crowd walks through it.
 */
export function districtKeepOut(scene: CrowdSimScene): Rect[] {
  const rects: Rect[] = [];
  const around = (point: ScenePoint, radius: number) =>
    rects.push({
      maxX: point.x + radius,
      maxY: point.y + radius,
      minX: point.x - radius,
      minY: point.y - radius,
    });

  for (const road of scene.roads) {
    const pad = road.widthMeters / 2 + 3;
    const points = road.geometry.points;
    for (let index = 0; index < points.length - 1; index++) {
      rects.push(expand(rectOf([points[index], points[index + 1]]), pad));
    }
  }
  for (const building of scene.buildings)
    rects.push(expand(rectOf(building.footprint.points), 3));
  for (const shop of scene.shops) {
    rects.push(
      expand(
        {
          maxX: shop.position.x + shop.size.width / 2,
          maxY: shop.position.y + shop.size.height / 2,
          minX: shop.position.x - shop.size.width / 2,
          minY: shop.position.y - shop.size.height / 2,
        },
        3,
      ),
    );
    if (shop.entrancePosition) around(shop.entrancePosition, 5);
    if (shop.queueAnchor) around(shop.queueAnchor, 6);
  }
  for (const entrance of scene.entrances)
    around(entrance.position, entrance.width / 2 + 6);
  for (const point of scene.servicePoints) around(point.position, point.width / 2 + 5);
  for (const stop of scene.transitStops) around(stop.position, 8);
  for (const hazard of scene.hazards) around(hazard.position, hazard.radiusMeters + 2);
  for (const wall of scene.walls) rects.push(expand(rectOf(wall.geometry.points), 2));
  for (const obstacle of scene.obstacles)
    rects.push(expand(rectOf(obstacle.geometry.points), 2));

  // The walking corridor between every place a person is sent.
  const stops = [
    ...scene.entrances.map((entrance) => entrance.position),
    ...scene.shops.map((shop) => shop.entrancePosition ?? shop.position),
    ...scene.servicePoints.map((point) => point.position),
  ];
  if (stops.length >= 2) rects.push(expand(rectOf(stops), 6));

  return rects;
}

function plazaTrees(
  scene: CrowdSimScene,
  district: Rect,
  rng: () => number,
  out: CityProp[],
) {
  const keepOut = districtKeepOut(scene);
  const inset = expand(district, -4);
  for (let y = inset.minY; y <= inset.maxY; y += 11) {
    for (let x = inset.minX; x <= inset.maxX; x += 11) {
      // Every cell draws the same numbers whether or not it gets a tree. When
      // the keep-out test skipped the remaining draws, building anything in the
      // district shifted the random sequence of every later cell, and trees
      // across the whole plaza jumped, turned and resized on each placement.
      const jitterX = rng();
      const jitterY = rng();
      const skip = rng();
      const rotation = rng();
      const scale = rng();
      const px = x + (jitterX - 0.5) * 5;
      const py = y + (jitterY - 0.5) * 5;
      if (keepOut.some((rect) => contains(rect, px, py))) continue;
      if (skip < 0.35) continue;
      out.push({
        rotation: rotation * Math.PI * 2,
        scale: 0.8 + scale * 0.5,
        x: px,
        y: py,
      });
    }
  }
}

/**
 * How the scene's own declared buildings bias the *generated* ring city's
 * style, so a metro hall's or an airport's surroundings do not read as the
 * same downtown skyline as a mall's. Purely a nudge to `pickStyle`'s
 * `nearness` roll -- it changes which style table a block draws from, not
 * the block/lot layout itself.
 *
 * Only `scene.buildings` counts (the scene's own architecture, not the
 * generated city's), and only the majority `kind` -- one kiosk-sized
 * building should not tip a scene with a dozen mixed-use ones. No buildings,
 * or a majority of "mixedUse"/"retail"/"office"/"residential"/"utility"/
 * "shelter": zero offset, exactly this function's behaviour before this
 * bias existed (`defaultDemoScene`'s retail+mixedUse buildings land here).
 */
export function characterOffsetFor(scene: CrowdSimScene): number {
  if (scene.buildings.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const building of scene.buildings) {
    counts.set(building.kind, (counts.get(building.kind) ?? 0) + 1);
  }
  // A tie (e.g. one "civic" and one "transit" building) resolves to
  // whichever kind appears first in `scene.buildings` -- `Map` iteration
  // order is insertion order, and `>` (not `>=`) keeps the first kind seen
  // once a tie is reached. Deterministic and tested (`cityLayout.test.ts`),
  // but a scene author reordering otherwise-unrelated buildings can flip
  // which bias wins on an exact tie.
  let majorityKind = "";
  let majorityCount = 0;
  for (const [kind, count] of counts) {
    if (count > majorityCount) {
      majorityKind = kind;
      majorityCount = count;
    }
  }
  // Transit hubs sit in dense interchange districts; skew toward more
  // office/tower rolls. Civic buildings (hospitals, venues, stadiums) tend
  // toward calmer, lower surroundings; skew the other way.
  if (majorityKind === "transit") return 0.15;
  if (majorityKind === "civic") return -0.15;
  return 0;
}

function fillBlock(
  cell: Rect,
  nearness: number,
  characterOffset: number,
  rng: () => number,
  out: CityBuilding[],
) {
  const setback = 2.5;
  const lotTarget = nearness > 0.6 ? 22 : 16;
  const cols = Math.max(1, Math.round(width(cell) / lotTarget));
  const rows = Math.max(1, Math.round(height(cell) / lotTarget));
  const lotW = width(cell) / cols;
  const lotH = height(cell) / rows;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // Interior lots of a big block become a courtyard, not a building.
      if (cols > 2 && rows > 2 && c > 0 && c < cols - 1 && r > 0 && r < rows - 1)
        continue;
      const lot: Rect = {
        maxX: cell.minX + (c + 1) * lotW,
        maxY: cell.minY + (r + 1) * lotH,
        minX: cell.minX + c * lotW,
        minY: cell.minY + r * lotH,
      };
      const gap = 0.8 + rng() * 1.6;
      const rect: Rect = {
        maxX: lot.maxX - (c === cols - 1 ? setback : gap),
        maxY: lot.maxY - (r === rows - 1 ? setback : gap),
        minX: lot.minX + (c === 0 ? setback : gap),
        minY: lot.minY + (r === 0 ? setback : gap),
      };
      if (width(rect) < 6 || height(rect) < 6) continue;

      const biasedNearness = clamp(nearness + characterOffset, 0, 1);
      const style = pickStyle(biasedNearness, rng);
      const floors = floorsFor(style, biasedNearness, rng);
      const heightMeters =
        floors * (style === "tower" || style === "office" ? 3.6 : 3.1) + 1.2;
      out.push({
        floors,
        heightMeters,
        rect,
        roofUnits: roofUnits(rect, style, rng),
        style,
        tint: rng(),
      });
    }
  }
}

function pickStyle(nearness: number, rng: () => number): CityBuildingStyle {
  const roll = rng();
  if (nearness > 0.72)
    return roll < 0.45 ? "tower" : roll < 0.85 ? "office" : "shopfront";
  if (nearness > 0.5)
    return roll < 0.2
      ? "office"
      : roll < 0.55
        ? "brick"
        : roll < 0.8
          ? "plaster"
          : "shopfront";
  return roll < 0.5 ? "plaster" : roll < 0.85 ? "brick" : "shopfront";
}

function floorsFor(style: CityBuildingStyle, nearness: number, rng: () => number) {
  switch (style) {
    // Towers top out around 80m. Taller, and the default camera sits inside
    // the downtown ring instead of looking over it.
    case "tower":
      return Math.round(12 + rng() * rng() * 10 + nearness * 4);
    case "office":
      return Math.round(6 + rng() * 6);
    case "brick":
      return Math.round(4 + rng() * 4);
    case "plaster":
      return Math.round(3 + rng() * 4);
    case "shopfront":
      return Math.round(1 + rng() * 2);
  }
}

function roofUnits(rect: Rect, style: CityBuildingStyle, rng: () => number): Rect[] {
  if (style === "shopfront") return [];
  const units: Rect[] = [];
  const count =
    style === "tower" || style === "office"
      ? 2 + Math.floor(rng() * 3)
      : Math.floor(rng() * 2);
  for (let index = 0; index < count; index++) {
    const w = Math.min(width(rect) * 0.3, 2 + rng() * 3);
    const h = Math.min(height(rect) * 0.3, 2 + rng() * 3);
    const x = rect.minX + 1 + rng() * Math.max(0, width(rect) - w - 2);
    const y = rect.minY + 1 + rng() * Math.max(0, height(rect) - h - 2);
    units.push({ maxX: x + w, maxY: y + h, minX: x, minY: y });
  }
  return units;
}

function lineStreetTrees(cell: Rect, rng: () => number, out: CityProp[]) {
  const offset = 1.4;
  for (let x = cell.minX + 6; x < cell.maxX - 3; x += 9 + rng() * 3) {
    out.push({
      rotation: rng() * 6.28,
      scale: 0.7 + rng() * 0.3,
      x,
      y: cell.minY - offset,
    });
    out.push({
      rotation: rng() * 6.28,
      scale: 0.7 + rng() * 0.3,
      x,
      y: cell.maxY + offset,
    });
  }
}

function scatterTrees(cell: Rect, spacing: number, rng: () => number, out: CityProp[]) {
  for (let y = cell.minY + 3; y < cell.maxY - 2; y += spacing) {
    for (let x = cell.minX + 3; x < cell.maxX - 2; x += spacing) {
      if (rng() < 0.2) continue;
      out.push({
        rotation: rng() * 6.28,
        scale: 0.8 + rng() * 0.7,
        x: x + (rng() - 0.5) * spacing * 0.6,
        y: y + (rng() - 0.5) * spacing * 0.6,
      });
    }
  }
}

/** Grid lines from the district's edge outward, pitch jittered so blocks vary. */
function gridLines(
  innerMin: number,
  innerMax: number,
  outerMin: number,
  outerMax: number,
  pitch: number,
  rng: () => number,
) {
  const lines = [innerMin, innerMax];
  for (let at = innerMax + pitch; at < outerMax - 8; at += pitch * (0.8 + rng() * 0.4))
    lines.push(round1(at));
  for (let at = innerMin - pitch; at > outerMin + 8; at -= pitch * (0.8 + rng() * 0.4))
    lines.push(round1(at));
  lines.push(outerMin, outerMax);
  return [...new Set(lines)].sort((a, b) => a - b);
}

export function rectOf(points: readonly ScenePoint[]): Rect {
  return points.reduce<Rect>(
    (rect, point) => ({
      maxX: Math.max(rect.maxX, point.x),
      maxY: Math.max(rect.maxY, point.y),
      minX: Math.min(rect.minX, point.x),
      minY: Math.min(rect.minY, point.y),
    }),
    { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity },
  );
}

export function overlaps(a: Rect, b: Rect) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function contains(rect: Rect, x: number, y: number) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function expand(rect: Rect, by: number): Rect {
  return {
    maxX: rect.maxX + by,
    maxY: rect.maxY + by,
    minX: rect.minX - by,
    minY: rect.minY - by,
  };
}

const width = (rect: Rect) => rect.maxX - rect.minX;
const height = (rect: Rect) => rect.maxY - rect.minY;
const round1 = (value: number) => Math.round(value * 10) / 10;
