import type { WallSegment } from "@crowdsim/core-gpu";
import type { ScenePoint } from "@crowdsim/scene-schema";
import type { SceneWorldBounds } from "./sceneGeometry";
import { createWallIndex, forEachCellOnSegment, type WallIndex } from "./wallIndex";

/**
 * Routing for every walker, to whatever it is walking to.
 *
 * The engine used to route only agents that were leaving or evacuating, with a
 * 2 m, 4-neighbour breadth-first field per exit, walls marked by sampling points
 * along them (a diagonal wall could leave gaps). Everyone else walked a straight
 * line and slid along whatever wall was in the way, which is why a stall
 * detector had to send stuck shoppers home.
 *
 * Now each distinct target gets an octile distance field (8-neighbour Dijkstra,
 * no corner cutting) on a grid of about 1 m, with walls marking every cell they
 * pass through. Fields are built the first time someone walks to that target
 * and kept, least recently used first out, up to a fixed number.
 */

/** Finest routing cell, metres. */
export const routeCellSizeMeters = 1;
/** Cells per field at most; bigger worlds get coarser cells instead of more memory. */
export const maxRouteCells = 40_000;
/** Fields kept at once. */
export const maxRouteFields = 64;

const diagonalCost = Math.SQRT2;
const wallClearanceTollMeters = 0.5;
/** Room for a body beside a straight line to the target, metres. */
const bodyClearanceMeters = 0.35;

type RouteField = {
  cell: number;
  distances: Float32Array;
  /** Per cell: 0 not yet known, 1 clear straight line to the target, 2 not. */
  sight: Uint8Array;
};

/**
 * Whether a walker in `cell` can head straight for the target: the line from
 * the cell centre keeps half a cell diagonal (covering any start point in the
 * cell) plus a body's width away from every wall. Without that margin, lines
 * grazing a wall end had walkers scraping round corners. Cached per cell.
 */
function hasLineOfSight(
  grid: Grid,
  walls: WallIndex,
  field: RouteField,
  cell: number,
  to: ScenePoint,
) {
  if (field.sight[cell] === 0) {
    const x = (cell % grid.columns) * grid.cellSize + grid.cellSize / 2;
    const y = Math.floor(cell / grid.columns) * grid.cellSize + grid.cellSize / 2;
    const clearance = grid.cellSize * Math.SQRT1_2 + bodyClearanceMeters;
    const segment = { x1: x, y1: y, x2: to.x, y2: to.y };
    field.sight[cell] = walls.clearOf(segment, clearance) ? 1 : 2;
  }
  return field.sight[cell] === 1;
}

type Grid = {
  blocked: Uint8Array;
  /** Extra metres charged for stepping into a cell that touches a wall. */
  clearance: Float32Array;
  cellSize: number;
  columns: number;
  rows: number;
};

export type Router = {
  /** Unit direction to walk from `from` toward `to`, around walls. */
  direction: (from: ScenePoint, to: ScenePoint) => ScenePoint;
  /** Walking distance in metres; Infinity when walls cut `from` off from `to`. */
  distance: (from: ScenePoint, to: ScenePoint) => number;
  /** Distance fields currently held (for tests and diagnostics). */
  fieldCount: () => number;
};

export function createRouter(
  world: SceneWorldBounds | undefined,
  walls: readonly WallSegment[],
): Router {
  if (!world || walls.length === 0) return straightLineRouter();

  const grid = createGrid(world, walls);
  const wallIndex = createWallIndex(walls);
  const fields = new Map<number, RouteField>();

  function fieldFor(target: ScenePoint) {
    const cell = cellOf(grid, target.x, target.y);
    const existing = fields.get(cell);
    if (existing) {
      // Map keeps insertion order: re-insert to mark as recently used.
      fields.delete(cell);
      fields.set(cell, existing);
      return existing;
    }
    const field: RouteField = {
      cell,
      distances: buildDistanceField(grid, cell),
      sight: new Uint8Array(grid.columns * grid.rows),
    };
    fields.set(cell, field);
    if (fields.size > maxRouteFields) {
      fields.delete(fields.keys().next().value!);
    }
    return field;
  }

  return {
    direction(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const straight = Math.hypot(dx, dy);
      if (straight < 1e-9) return { x: 0, y: 0 };
      const direct = { x: dx / straight, y: dy / straight };
      const field = fieldFor(to);
      const cell = cellOf(grid, from.x, from.y);
      if (cell === field.cell) return direct;
      if (hasLineOfSight(grid, wallIndex, field, cell, to)) return direct;
      return descentDirection(grid, field.distances, cell) ?? direct;
    },
    distance(from, to) {
      const field = fieldFor(to).distances;
      const cell = cellOf(grid, from.x, from.y);
      let best = field[cell];
      if (!Number.isFinite(best)) {
        // Standing in a wall cell (hugging a wall, or in a doorway jamb): walk
        // out through the best open neighbour.
        const next = bestNeighbour(grid, field, cell);
        best = next < 0 ? Infinity : field[next] + grid.cellSize;
      }
      return best;
    },
    fieldCount: () => fields.size,
  };
}

function straightLineRouter(): Router {
  return {
    direction(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      return length < 1e-9 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
    },
    distance: (from, to) => Math.hypot(to.x - from.x, to.y - from.y),
    fieldCount: () => 0,
  };
}

function createGrid(world: SceneWorldBounds, walls: readonly WallSegment[]): Grid {
  const cellSize = Math.max(
    routeCellSizeMeters,
    Math.sqrt((world.width * world.height) / maxRouteCells),
  );
  const columns = Math.max(1, Math.ceil(world.width / cellSize));
  const rows = Math.max(1, Math.ceil(world.height / cellSize));
  const blocked = new Uint8Array(columns * rows);
  const clearance = new Float32Array(columns * rows);
  const grid = { blocked, cellSize, clearance, columns, rows };
  for (const wall of walls) {
    forEachCellOnSegment(grid, wall, (cell) => {
      blocked[cell] = 1;
    });
  }
  // Shortest paths hug corners; people do not, and a path through the cell next
  // to a wall end has walkers fighting the wall's push. A small toll on cells
  // touching a wall keeps routes a cell off walls where there is room, and still
  // lets them through a doorway where there is not.
  for (let cell = 0; cell < blocked.length; cell++) {
    if (!blocked[cell]) continue;
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = column + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
        clearance[r * columns + c] = wallClearanceTollMeters;
      }
    }
  }
  return grid;
}

function cellOf(grid: Grid, x: number, y: number) {
  const column = Math.min(grid.columns - 1, Math.max(0, Math.floor(x / grid.cellSize)));
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / grid.cellSize)));
  return row * grid.columns + column;
}

const neighbourOffsets = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, diagonalCost],
  [1, -1, diagonalCost],
  [-1, 1, diagonalCost],
  [-1, -1, diagonalCost],
] as const;

/**
 * Downhill direction at a cell: every open neighbour that is closer to the
 * target contributes, weighted by how much closer per metre stepped.
 *
 * Steering at the single best neighbour made walkers zigzag: octile fields are
 * full of equally good neighbours, and which one "wins" flips as a walker
 * crosses a cell boundary. Averaging the descents gives one smooth heading.
 */
function descentDirection(grid: Grid, field: Float32Array, cell: number) {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  let reference = field[cell];
  if (!Number.isFinite(reference)) {
    const best = bestNeighbour(grid, field, cell);
    if (best < 0) return undefined;
    reference = field[best] + grid.cellSize * diagonalCost;
  }
  let x = 0;
  let y = 0;
  for (const [dc, dr, cost] of neighbourOffsets) {
    const next = neighbourCell(grid, column, row, dc, dr);
    if (next < 0) continue;
    const drop = (reference - field[next]) / (cost * grid.cellSize);
    if (!(drop > 0)) continue;
    x += (dc / cost) * drop;
    y += (dr / cost) * drop;
  }
  const length = Math.hypot(x, y);
  return length < 1e-9 ? undefined : { x: x / length, y: y / length };
}

/** The open neighbour with the lowest distance-to-go, or -1. */
function bestNeighbour(grid: Grid, field: Float32Array, cell: number) {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  let best = -1;
  let bestValue = Infinity;
  for (const [dc, dr, cost] of neighbourOffsets) {
    const next = neighbourCell(grid, column, row, dc, dr);
    if (next < 0) continue;
    const value = field[next] + cost * grid.cellSize;
    if (value < bestValue) {
      bestValue = value;
      best = next;
    }
  }
  return Number.isFinite(bestValue) ? best : -1;
}

/** Neighbour cell id, or -1 if outside, blocked, or a diagonal that cuts a wall corner. */
function neighbourCell(
  grid: Grid,
  column: number,
  row: number,
  dc: number,
  dr: number,
) {
  const c = column + dc;
  const r = row + dr;
  if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) return -1;
  if (grid.blocked[r * grid.columns + c]) return -1;
  if (dc !== 0 && dr !== 0) {
    if (
      grid.blocked[row * grid.columns + c] ||
      grid.blocked[r * grid.columns + column]
    ) {
      return -1;
    }
  }
  return r * grid.columns + c;
}

/** Walking distance (metres) from every cell to `targetCell`; Infinity if cut off. */
function buildDistanceField(grid: Grid, targetCell: number): Float32Array {
  const field = new Float32Array(grid.columns * grid.rows).fill(Infinity);
  const heap = new MinHeap(grid.columns * grid.rows);
  // The target stays reachable even when it sits on a wall line (a shop door
  // marked on its facade): it is where the walk ends, not a place to cross.
  field[targetCell] = 0;
  heap.push(targetCell, 0);
  while (heap.size > 0) {
    const cell = heap.pop();
    const value = field[cell];
    const column = cell % grid.columns;
    const row = Math.floor(cell / grid.columns);
    for (const [dc, dr, cost] of neighbourOffsets) {
      const next = neighbourCell(grid, column, row, dc, dr);
      if (next < 0) continue;
      const candidate = value + cost * grid.cellSize + grid.clearance[next];
      if (candidate < field[next]) {
        field[next] = candidate;
        heap.push(next, candidate);
      }
    }
  }
  return field;
}

/** Binary min-heap of (cell, priority) with lazy deletion of stale entries. */
class MinHeap {
  size = 0;
  private cells: Int32Array;
  private priorities: Float32Array;

  constructor(capacity: number) {
    this.cells = new Int32Array(capacity * 2);
    this.priorities = new Float32Array(capacity * 2);
  }

  push(cell: number, priority: number) {
    if (this.size === this.cells.length) this.grow();
    let index = this.size++;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.priorities[parent] <= priority) break;
      this.cells[index] = this.cells[parent];
      this.priorities[index] = this.priorities[parent];
      index = parent;
    }
    this.cells[index] = cell;
    this.priorities[index] = priority;
  }

  pop() {
    const top = this.cells[0];
    const lastCell = this.cells[--this.size];
    const lastPriority = this.priorities[this.size];
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.size) break;
      const right = left + 1;
      const child =
        right < this.size && this.priorities[right] < this.priorities[left]
          ? right
          : left;
      if (this.priorities[child] >= lastPriority) break;
      this.cells[index] = this.cells[child];
      this.priorities[index] = this.priorities[child];
      index = child;
    }
    this.cells[index] = lastCell;
    this.priorities[index] = lastPriority;
    return top;
  }

  private grow() {
    const cells = new Int32Array(this.cells.length * 2);
    const priorities = new Float32Array(this.priorities.length * 2);
    cells.set(this.cells);
    priorities.set(this.priorities);
    this.cells = cells;
    this.priorities = priorities;
  }
}
