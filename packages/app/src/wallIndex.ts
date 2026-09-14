import type { WallSegment } from "@crowdsim/core-gpu";

/**
 * Walls bucketed by the cells they pass through, so a walker only tests the
 * walls near it. Every step used to test every wall in the scene for every
 * agent, which is fine for the demo's fifteen segments and hopeless for an
 * imported DXF plan with thousands.
 */
export type WallIndex = {
  /** Walls with any part within `radius` metres of the cell block around (x, y). */
  near: (x: number, y: number, radius: number) => readonly WallSegment[];
  /** True when no wall comes within `clearance` metres of the segment. */
  clearOf: (segment: WallSegment, clearance: number) => boolean;
};

const bucketSizeMeters = 2;

export function createWallIndex(walls: readonly WallSegment[]): WallIndex {
  if (walls.length === 0) {
    return { clearOf: () => true, near: () => walls };
  }
  const minX = Math.min(...walls.flatMap((wall) => [wall.x1, wall.x2]));
  const minY = Math.min(...walls.flatMap((wall) => [wall.y1, wall.y2]));
  const maxX = Math.max(...walls.flatMap((wall) => [wall.x1, wall.x2]));
  const maxY = Math.max(...walls.flatMap((wall) => [wall.y1, wall.y2]));
  const originX = Math.floor(minX / bucketSizeMeters) * bucketSizeMeters;
  const originY = Math.floor(minY / bucketSizeMeters) * bucketSizeMeters;
  const columns = Math.floor((maxX - originX) / bucketSizeMeters) + 1;
  const rows = Math.floor((maxY - originY) / bucketSizeMeters) + 1;
  const buckets = new Map<number, number[]>();

  walls.forEach((wall, index) => {
    const local = {
      x1: wall.x1 - originX,
      y1: wall.y1 - originY,
      x2: wall.x2 - originX,
      y2: wall.y2 - originY,
    };
    forEachCellOnSegment(
      { cellSize: bucketSizeMeters, columns, rows },
      local,
      (cell) => {
        const bucket = buckets.get(cell);
        if (bucket) bucket.push(index);
        else buckets.set(cell, [index]);
      },
    );
  });

  // Stamp per wall so a wall spanning several buckets is returned once.
  const stamps = new Uint32Array(walls.length);
  let stamp = 0;

  const nextStamp = () => {
    if (++stamp === 0xffffffff) {
      stamps.fill(0);
      stamp = 1;
    }
  };
  const bucketsNear = (
    x: number,
    y: number,
    radius: number,
    visit: (index: number) => void,
  ) => {
    const reach = Math.ceil(radius / bucketSizeMeters);
    const column = Math.floor((x - originX) / bucketSizeMeters);
    const row = Math.floor((y - originY) / bucketSizeMeters);
    for (let r = row - reach; r <= row + reach; r++) {
      if (r < 0 || r >= rows) continue;
      for (let c = column - reach; c <= column + reach; c++) {
        if (c < 0 || c >= columns) continue;
        for (const index of buckets.get(r * columns + c) ?? []) {
          if (stamps[index] === stamp) continue;
          stamps[index] = stamp;
          visit(index);
        }
      }
    }
  };

  return {
    clearOf(segment, clearance) {
      nextStamp();
      // Sample the segment at bucket spacing and gather walls around each
      // sample; with a reach of clearance + one bucket, nothing within
      // `clearance` of any point on the segment is missed.
      const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
      const samples = Math.max(1, Math.ceil(length / bucketSizeMeters));
      let clear = true;
      for (let sample = 0; sample <= samples && clear; sample++) {
        const t = sample / samples;
        const x = segment.x1 + (segment.x2 - segment.x1) * t;
        const y = segment.y1 + (segment.y2 - segment.y1) * t;
        bucketsNear(x, y, clearance + bucketSizeMeters, (index) => {
          if (clear && segmentDistance(segment, walls[index]) < clearance)
            clear = false;
        });
      }
      return clear;
    },
    near(x, y, radius) {
      nextStamp();
      const found: WallSegment[] = [];
      bucketsNear(x, y, radius, (index) => found.push(walls[index]));
      return found;
    },
  };
}

/**
 * Every cell a segment passes through, corners included (a supercover walk,
 * after Amanatides & Woo). The routing grid marks walls with it and the wall
 * index buckets them with it.
 */
export function forEachCellOnSegment(
  grid: { cellSize: number; columns: number; rows: number },
  wall: WallSegment,
  visit: (cell: number) => void,
) {
  const size = grid.cellSize;
  let column = Math.floor(wall.x1 / size);
  let row = Math.floor(wall.y1 / size);
  const endColumn = Math.floor(wall.x2 / size);
  const endRow = Math.floor(wall.y2 / size);
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = stepX === 0 ? Infinity : size / Math.abs(dx);
  const deltaY = stepY === 0 ? Infinity : size / Math.abs(dy);
  let maxX =
    stepX === 0 ? Infinity : ((stepX > 0 ? column + 1 : column) * size - wall.x1) / dx;
  let maxY =
    stepY === 0 ? Infinity : ((stepY > 0 ? row + 1 : row) * size - wall.y1) / dy;
  const mark = (c: number, r: number) => {
    if (c >= 0 && r >= 0 && c < grid.columns && r < grid.rows) {
      visit(r * grid.columns + c);
    }
  };
  mark(column, row);
  let guard = Math.abs(endColumn - column) + Math.abs(endRow - row) + 2;
  while ((column !== endColumn || row !== endRow) && guard-- > 0) {
    if (Math.abs(maxX - maxY) < 1e-12) {
      // Passing exactly through a corner touches both side cells.
      mark(column + stepX, row);
      mark(column, row + stepY);
      column += stepX;
      row += stepY;
      maxX += deltaX;
      maxY += deltaY;
    } else if (maxX < maxY) {
      column += stepX;
      maxX += deltaX;
    } else {
      row += stepY;
      maxY += deltaY;
    }
    mark(column, row);
  }
}

/** Shortest distance between two segments (0 when they cross). */
export function segmentDistance(a: WallSegment, b: WallSegment) {
  if (segmentsCross(a, b)) return 0;
  return Math.min(
    pointSegmentDistance(a.x1, a.y1, b),
    pointSegmentDistance(a.x2, a.y2, b),
    pointSegmentDistance(b.x1, b.y1, a),
    pointSegmentDistance(b.x2, b.y2, a),
  );
}

/** The point on segment `s` nearest to (x, y). */
export function closestPointOnSegment(x: number, y: number, s: WallSegment) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq > 0
      ? Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / lengthSq))
      : 0;
  return { x: s.x1 + dx * t, y: s.y1 + dy * t };
}

function pointSegmentDistance(x: number, y: number, s: WallSegment) {
  const closest = closestPointOnSegment(x, y, s);
  return Math.hypot(x - closest.x, y - closest.y);
}

function segmentsCross(a: WallSegment, b: WallSegment) {
  const d1 = orientation(b, a.x1, a.y1);
  const d2 = orientation(b, a.x2, a.y2);
  const d3 = orientation(a, b.x1, b.y1);
  const d4 = orientation(a, b.x2, b.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function orientation(s: WallSegment, x: number, y: number) {
  return (s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1);
}
