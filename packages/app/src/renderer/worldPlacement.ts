import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";
import { screenToNdc } from "../agentPicking";
import { overlaps, rectOf, type Rect } from "../cityLayout";
import { pointInPolygon } from "../routeCostMap";
import { distanceToSegment } from "../sceneEditorGeometry";
import { addCountLineBetween } from "../sceneEditorAdders";
import {
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
  placeEditorTool,
  snapPoint,
  type EditorTool,
} from "../sceneEditorState";

/** Same grid the 2D editor snaps to, so both views land things identically. */
export const PLACEMENT_GRID_METERS = 2;

type ScreenRect = { height: number; left: number; top: number; width: number };

const ground = new Plane(new Vector3(0, 0, 1), 0);

/**
 * Where a screen point meets the ground, in scene metres (y-down), snapped.
 *
 * Null when the ray misses the ground (looking at the sky) or lands outside the
 * simulated world: the city dressing around the district is scenery the
 * simulation knows nothing about, so building there would silently do nothing.
 */
export function scenePointAtScreen(
  camera: Camera,
  rect: ScreenRect,
  clientX: number,
  clientY: number,
  world: CrowdSimScene["world"],
): ScenePoint | null {
  const ndc = screenToNdc(clientX, clientY, rect);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
  const hit = raycaster.ray.intersectPlane(ground, new Vector3());
  if (!hit) return null;
  // Inverse of toRenderX / toRenderY.
  const point = snapPoint(
    { x: hit.x + world.width / 2, y: world.height / 2 - hit.y },
    PLACEMENT_GRID_METERS,
    true,
  );
  if (point.x < 0 || point.y < 0 || point.x > world.width || point.y > world.height) {
    return null;
  }
  return point;
}

/** Tools that place with one click in the 3D world. */
export function placesInWorld(tool: EditorTool) {
  return tool !== "select" && tool !== "wall";
}

/**
 * The scene after one placement, or null when nothing may be placed there: the
 * tool does not place with a click, or something solid is in the way.
 */
export function placeInScene(
  scene: CrowdSimScene,
  tool: EditorTool,
  point: ScenePoint,
): CrowdSimScene | null {
  if (placementConflict(scene, tool, point)) return null;
  const placed = placeEditorTool(createEditorDocumentFromScene(scene), tool, point);
  return placed ? createSceneFromEditorDocument(scene, placed) : null;
}

/**
 * A count line between two chosen points, dragged out in the 3D world
 * (ADR-0031) — the same `addCountLineBetween` constructor the 2D editor's
 * own drag tool already uses, through the same scene round trip
 * `placeInScene` uses for every other 3D placement, so it swaps into the
 * running simulation the same way (ADR-0007). No conflict check: a count
 * line is an annotation, the same reason `placementConflict` already
 * returns null for the single-click `countLine` tool.
 */
export function placeCountLineBetween(
  scene: CrowdSimScene,
  start: ScenePoint,
  end: ScenePoint,
): CrowdSimScene {
  const placed = addCountLineBetween(createEditorDocumentFromScene(scene), start, end);
  return createSceneFromEditorDocument(scene, placed);
}

/**
 * Ground footprint of what a tool drops, in metres, for the placement ghost.
 * Mirrors the sizes in sceneEditorAdders; small markers get a readable pad.
 */
export function placementFootprint(tool: EditorTool): { depth: number; width: number } {
  switch (tool) {
    case "road":
      return { depth: 6, width: 20 };
    case "building":
      return { depth: 10, width: 16 };
    case "zone":
      return { depth: 10, width: 18 };
    case "shop":
      return { depth: 5, width: 8 };
    case "obstacle":
    case "countLine":
      return { depth: 1, width: 10 };
    case "hazard":
      return { depth: 16, width: 16 };
    default:
      return { depth: 3, width: 3 };
  }
}

/**
 * What a placement would land on, as the id of the first thing in the way, or
 * null when the ground is free.
 *
 * Only solid things block, and only against what they physically cannot share
 * ground with. Shops sit inside buildings (that is what an arcade is), roads
 * meet other roads at junctions, and zones and markers are annotations laid
 * over whatever is there — none of those are conflicts.
 */
export function placementConflict(
  scene: CrowdSimScene,
  tool: EditorTool,
  point: ScenePoint,
): string | null {
  const blocks = BLOCKED_BY[tool];
  if (!blocks) return null;
  const size = placementFootprint(tool);
  const rect: Rect = {
    maxX: point.x + size.width / 2,
    maxY: point.y + size.depth / 2,
    minX: point.x - size.width / 2,
    minY: point.y - size.depth / 2,
  };

  if (blocks.has("road")) {
    for (const road of scene.roads) {
      if (polylineTouches(road.geometry.points, road.widthMeters / 2, rect))
        return road.id;
    }
  }
  if (blocks.has("building")) {
    for (const building of scene.buildings) {
      if (overlaps(rect, rectOf(building.footprint.points))) return building.id;
    }
  }
  if (blocks.has("shop")) {
    for (const shop of scene.shops) {
      const half = { x: shop.size.width / 2, y: shop.size.height / 2 };
      const shopRect = {
        maxX: shop.position.x + half.x,
        maxY: shop.position.y + half.y,
        minX: shop.position.x - half.x,
        minY: shop.position.y - half.y,
      };
      if (overlaps(rect, shopRect)) return shop.id;
    }
  }
  if (blocks.has("wall")) {
    for (const wall of scene.walls) {
      if (polylineTouches(wall.geometry.points, wall.thickness / 2, rect))
        return wall.id;
    }
  }
  if (blocks.has("obstacle")) {
    for (const obstacle of scene.obstacles) {
      const filled = obstacle.geometry.type === "polygon";
      if (polylineTouches(obstacle.geometry.points, 0, rect, filled))
        return obstacle.id;
    }
  }
  return null;
}

type Solid = "building" | "obstacle" | "road" | "shop" | "wall";

// Symmetric where both sides are solid: if A may not land on B, B may not land
// on A. A barrier may stand on a road (that is a road closure); it may not
// stand inside a building or a shop, just as those may not be built over it.
const BLOCKED_BY: Partial<Record<EditorTool, ReadonlySet<Solid>>> = {
  building: new Set(["building", "obstacle", "road", "shop", "wall"]),
  obstacle: new Set(["building", "shop"]),
  road: new Set(["building", "obstacle", "shop"]),
  shop: new Set(["obstacle", "road", "shop", "wall"]),
};

/** A polyline swept to `halfWidth` either side, against an axis-aligned rect. */
function polylineTouches(
  points: readonly ScenePoint[],
  halfWidth: number,
  rect: Rect,
  filled = false,
) {
  if (points.length === 1) return distanceToRect(points[0], rect) < halfWidth;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (segmentCrossesRect(a, b, rect) || segmentRectDistance(a, b, rect) < halfWidth) {
      return true;
    }
  }
  // A filled footprint that swallows the rect whole crosses none of its edges.
  // Roads and walls are never filled: a loop road does not pave its middle.
  const centre = { x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 };
  return filled && pointInPolygon(centre, points);
}

function segmentRectDistance(a: ScenePoint, b: ScenePoint, rect: Rect) {
  const corners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  return Math.min(
    distanceToRect(a, rect),
    distanceToRect(b, rect),
    ...corners.map((corner) => distanceToSegment(corner, a, b)),
  );
}

/** Liang–Barsky clip: does any part of the segment lie inside the rect? */
function segmentCrossesRect(a: ScenePoint, b: ScenePoint, rect: Rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.minX],
    [dx, rect.maxX - a.x],
    [-dy, a.y - rect.minY],
    [dy, rect.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function distanceToRect(point: ScenePoint, rect: Rect) {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dy = Math.max(rect.minY - point.y, 0, point.y - rect.maxY);
  return Math.hypot(dx, dy);
}
