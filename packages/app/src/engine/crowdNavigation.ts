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

/**
 * Finest routing cell, metres. A cell this size or larger that a wall so
 * much as touches is marked fully blocked (see `createGrid`); a gap between
 * two walls narrower than this can end up sealed on both sides even though
 * physically passable. This used to be 1 m, which sealed any gap under
 * ~2 m — verified directly (a 1 m gap let nobody through a 60 s check; 2.4 m
 * did), and several RiMEA test scenes (8, 9, 11, 12, 15) widen their doors
 * past the guideline's own numbers to route around it, each declaring the
 * substitution in its own criterion string. Lowered to resolve literature
 * door widths down to 0.8 m with margin (0.8 / 0.2 = 4 cells across).
 *
 * `createGrid`'s actual cell size is `max(routeCellSizeMeters,
 * sqrt(area / maxRouteCells))`, so a small floor alone does not guarantee a
 * fine grid on a big world -- the `maxRouteCells` cap can still coarsen it
 * back past the point an 0.8 m door stays resolvable. This floor and
 * `maxRouteCells` were raised together and are meant to be read together;
 * see `maxRouteCells`'s own comment for the actual cell size this produces
 * on realistic scene sizes and where that guarantee stops holding.
 */
export const routeCellSizeMeters = 0.2;
/**
 * Cells per field at most; bigger worlds get coarser cells instead of more
 * memory. This used to be 40,000, sized for the old 1 m floor (cell size hit
 * 1 m below 40,000 m^2, so the cap rarely mattered for scenes this project
 * actually ships). Lowering the floor to resolve narrow doors, without
 * raising this, left the cap doing most of the work on ordinary scenes: at
 * 40,000 it coarsened this project's own example scenes (5,376-6,800 m^2,
 * `exampleScenes.ts`) to 0.37-0.41 m cells -- verified directly against
 * `forEachCellOnSegment`'s real rasterisation, an 0.8 m door at that cell
 * size is *not* reliably resolvable (it fails at some door-centre
 * alignments, though not all), undoing this file's whole reason for
 * existing on exactly the scenes it is meant to serve.
 *
 * Raised to 80,000, chosen by measurement rather than guesswork: it holds
 * those same example scenes at 0.26-0.29 m (verified robust for an 0.8 m
 * door at every alignment scanned), costs ~0.34 ms to rasterise walls into
 * (`createGrid` itself, run on every scene edit) and ~20-23 ms for one
 * `buildDistanceField` Dijkstra solve on a scene that size (a one-off per
 * distinct target, cached below by `maxRouteFields` -- not a per-frame
 * cost), and holds each cached field to ~390 KB (`distances` + `sight`),
 * ~25 MB for a full 64-field cache in the worst case.
 *
 * This is calibrated against this project's own known scene sizes, not
 * against an unbounded one: a scene large enough to still get coarsened
 * past ~0.37 m cells at this cap can still have an 0.8 m door sealed. No
 * scene shipped in this repository is that large today.
 */
export const maxRouteCells = 80_000;
/** Fields kept at once. */
export const maxRouteFields = 64;

const diagonalCost = Math.SQRT2;
const wallClearanceTollMeters = 0.5;
/**
 * How far from a wall the toll reaches, metres — not cells. `createGrid`
 * used to hardcode a 1-cell neighbourhood, which was fine by coincidence
 * while `routeCellSizeMeters` was 1 m (1 cell = 1 m) but silently shrank to
 * ~0.245 m of real toll once the grid got finer to resolve narrow doors —
 * agents started hugging walls far closer than intended, changing route
 * geometry in cheap, low-density scenes enough to flip RiMEA test 12d's
 * width-vs-clear-time monotonicity (verified: reverting to a fixed 1-cell
 * radius reproduces the flip; this fixed-metres radius does not).
 *
 * 1 m, matching the old grid's incidental radius, turned out to be too wide
 * on its own: test 1's own 2 m corridor has its centre line exactly 1 m from
 * either wall, so a 1 m radius tolled *every* cell in the corridor, everyone
 * generated inside a wall cell (about half of them, symmetric around the
 * centre line) found the toll-free open world outside the corridor's own
 * end cheaper than the tolled walk down it, and RiMEA test 7's population
 * lost several people to a corridor they physically could have walked
 * (verified directly: 6 of 50 never arrived, each one frozen from birth with
 * a routed heading pointing straight into the near wall). The coarse 1 m
 * grid never exposed this — one step off a wall cell there already crossed
 * most of a 2 m corridor's width, so `bestNeighbour` escaped the toll zone
 * in a single hop regardless of its radius; the finer grid needed to resolve
 * narrow doors no longer has that accident to hide behind.
 *
 * 0.3 m leaves most of a 2 m corridor's width genuinely untolled (verified:
 * `distance()` down its centre line comes back at exactly 40 m, the true
 * straight-line length, meaning no toll was ever added). Whether it leaves
 * an untolled cell in the narrowest 0.8 m literature door this project now
 * routes depends on exactly where the door sits on the grid, not just its
 * width: at the small-world floor `cellSize` (0.2 m), `Math.round` rounds
 * 0.3 / 0.2 down to a 1-cell radius rather than up to 2 (`0.3 / 0.2` is
 * `1.4999999999999998` in float64, not `1.5`), and a 1-cell radius from each
 * jamb happens to cover both of an 0.8 m gap's open cells when the door sits
 * exactly on a cell boundary (this file's own regression test uses that
 * alignment) -- but shift the same door by even a fraction of a cell and one
 * open cell escapes both jambs' radius untolled (verified directly against
 * `forEachCellOnSegment`'s real rasterisation at several offsets). Either
 * way the toll is a soft cost, not a block -- the door always routes, at
 * worst with a small (~0.1 m per cell here) preference against it that
 * widens as the door does -- so this
 * does not reopen the door-sealing bug this file exists to fix; it is a
 * narrower guarantee than the name suggests, recorded here rather than
 * papered over.
 */
const wallClearanceRadiusMeters = 0.3;
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
  // within `wallClearanceRadiusMeters` of a wall keeps routes off walls where
  // there is room, and still lets them through a doorway where there is not.
  // `clearance[]` is added once per cell in `buildDistanceField`'s
  // `candidate`, alongside `cost * cellSize` (the true metres for that step)
  // — so the per-cell toll must scale with `cellSize` too, or a finer grid
  // silently charges it far more often per metre walked. Verified directly:
  // an unscaled flat 0.5 toll made a 2 m corridor's Dijkstra field prefer a
  // detour through open space with no wall in it at all over walking straight
  // down the corridor (58 m "cost" for the detour vs. 143 for the 41 m direct
  // walk) once the grid got fine enough that ~4 cells span a metre — each one
  // separately taxed. Scaling by `cellSize` keeps the toll's real-world
  // strength (about `wallClearanceTollMeters` per metre spent within
  // `wallClearanceRadiusMeters` of a wall) constant regardless of resolution.
  const radiusCells = Math.max(1, Math.round(wallClearanceRadiusMeters / cellSize));
  const clearancePerCell = wallClearanceTollMeters * cellSize;
  for (let cell = 0; cell < blocked.length; cell++) {
    if (!blocked[cell]) continue;
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        const c = column + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
        clearance[r * columns + c] = clearancePerCell;
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
  // Once a cell is popped off the heap its distance is final (no negative
  // edges): re-relaxing it, or a neighbour that is already settled too, is
  // always wasted work. Below a few thousand cells that waste was cheap
  // enough to be invisible; on the tens-of-thousands-of-cells grids a small
  // `routeCellSizeMeters` can now produce, lazy deletion without this bitmap
  // let float32 rounding noise re-trigger "improvements" between neighbours
  // in a loop that never terminated on its own — verified directly (an open
  // 40,000-cell grid ran tens of millions of heap pushes without converging
  // and was killed; with `settled` it converges in roughly one push per
  // cell, same order of magnitude as the grid itself).
  const settled = new Uint8Array(grid.columns * grid.rows);
  const heap = new MinHeap(grid.columns * grid.rows);
  // The target stays reachable even when it sits on a wall line (a shop door
  // marked on its facade): it is where the walk ends, not a place to cross.
  field[targetCell] = 0;
  heap.push(targetCell, 0);
  while (heap.size > 0) {
    const cell = heap.pop();
    if (settled[cell]) continue;
    settled[cell] = 1;
    const value = field[cell];
    const column = cell % grid.columns;
    const row = Math.floor(cell / grid.columns);
    for (const [dc, dr, cost] of neighbourOffsets) {
      const next = neighbourCell(grid, column, row, dc, dr);
      if (next < 0 || settled[next]) continue;
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
