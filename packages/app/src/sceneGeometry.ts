import type { WallSegment } from "@crowdsim/core-gpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";

export type SceneWorldBounds = {
  height: number;
  width: number;
};

export type MovementConstraintResult = {
  blocked: boolean;
  x: number;
  y: number;
};

const intersectionEpsilon = 1e-6;
const contactEpsilonMeters = 1e-6;

export function wallSegmentsFromScene(scene: CrowdSimScene): WallSegment[] {
  return scene.walls.flatMap((wall) => {
    const points = wall.geometry.points;
    const segments: WallSegment[] = [];

    for (let index = 1; index < points.length; index++) {
      segments.push({
        x1: points[index - 1].x,
        y1: points[index - 1].y,
        x2: points[index].x,
        y2: points[index].y,
      });
    }

    if (wall.geometry.type === "polygon") {
      const first = points[0];
      const last = points[points.length - 1];

      segments.push({
        x1: last.x,
        y1: last.y,
        x2: first.x,
        y2: first.y,
      });
    }

    return segments;
  });
}

export function constrainMovement(
  start: ScenePoint,
  end: ScenePoint,
  walls: readonly WallSegment[],
  world?: SceneWorldBounds,
): MovementConstraintResult {
  const clampedEnd = clampPointToWorld(end, world);
  const hit = firstWallIntersection(start, clampedEnd, walls);

  if (!hit) {
    return { blocked: false, ...clampedEnd };
  }

  const slide = slideAlongWall(start, clampedEnd, hit.wall, world);

  if (!firstWallIntersection(start, slide, walls)) {
    return { blocked: true, ...slide };
  }

  return { blocked: true, ...clampPointToWorld(start, world) };
}

export function clampPointToWorld(
  point: ScenePoint,
  world?: SceneWorldBounds,
): ScenePoint {
  if (!world) {
    return point;
  }

  return {
    x: clamp(point.x, 0, world.width),
    y: clamp(point.y, 0, world.height),
  };
}

function firstWallIntersection(
  start: ScenePoint,
  end: ScenePoint,
  walls: readonly WallSegment[],
) {
  let earliest:
    | {
        t: number;
        wall: WallSegment;
      }
    | undefined;

  for (const wall of walls) {
    const hit = segmentIntersectionParameter(start, end, wall);

    if (hit === undefined) {
      continue;
    }

    if (!earliest || hit < earliest.t) {
      earliest = { t: hit, wall };
    }
  }

  return earliest;
}

function segmentIntersectionParameter(
  start: ScenePoint,
  end: ScenePoint,
  wall: WallSegment,
) {
  const rayX = end.x - start.x;
  const rayY = end.y - start.y;
  const wallX = wall.x2 - wall.x1;
  const wallY = wall.y2 - wall.y1;
  const denominator = cross(rayX, rayY, wallX, wallY);

  if (Math.abs(denominator) < intersectionEpsilon) {
    return undefined;
  }

  const offsetX = wall.x1 - start.x;
  const offsetY = wall.y1 - start.y;
  const t = cross(offsetX, offsetY, wallX, wallY) / denominator;
  const u = cross(offsetX, offsetY, rayX, rayY) / denominator;
  // Ignore a wall the agent is already standing on (so it can always step away
  // from it), measured as a distance rather than as a fraction of the step. The
  // fraction (2% of a step) let an agent that had crept to within ~3 mm walk
  // straight through a solid wall, which is how shoppers ended up in rooms they
  // could never leave.
  const rayLength = Math.hypot(rayX, rayY);
  const minT = rayLength > 0 ? contactEpsilonMeters / rayLength : 0;

  if (t > minT && t <= 1 && u >= 0 && u <= 1) {
    return t;
  }

  return undefined;
}

function slideAlongWall(
  start: ScenePoint,
  end: ScenePoint,
  wall: WallSegment,
  world?: SceneWorldBounds,
): ScenePoint {
  const moveX = end.x - start.x;
  const moveY = end.y - start.y;
  const wallX = wall.x2 - wall.x1;
  const wallY = wall.y2 - wall.y1;
  const wallLength = Math.hypot(wallX, wallY);

  if (wallLength <= intersectionEpsilon) {
    return clampPointToWorld(start, world);
  }

  const tangentX = wallX / wallLength;
  const tangentY = wallY / wallLength;
  const projectedDistance = moveX * tangentX + moveY * tangentY;

  return clampPointToWorld(
    {
      x: start.x + tangentX * projectedDistance,
      y: start.y + tangentY * projectedDistance,
    },
    world,
  );
}

function cross(ax: number, ay: number, bx: number, by: number) {
  return ax * by - ay * bx;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
