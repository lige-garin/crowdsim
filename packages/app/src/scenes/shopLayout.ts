import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

/**
 * Furniture footprints and the clear gaps around them, in metres.
 *
 * **Every number in this block is self-chosen and uncalibrated.** They are
 * ordinary restaurant furniture sizes and circulation clearances, quoted
 * because a layout has to have some geometry, and not measured from any
 * source. Nothing computed from them is a prediction of footfall.
 *
 * What they *are* good for is the comparison this whole feature sells: the
 * same tables in the same lot either fit or they do not, and two layouts that
 * both fit leave different aisle widths. That difference survives the fact
 * that these dimensions are invented; an absolute "you will serve 120 covers"
 * would not.
 */
const tableSize = {
  twoSeat: { width: 0.8, height: 0.8, seats: 2 },
  fourSeat: { width: 1.2, height: 1.2, seats: 4 },
  sixSeat: { width: 1.8, height: 1.2, seats: 6 },
  privateRoom10: { width: 4, height: 4, seats: 10 },
} as const;

/** Clear walkway between the door and the first row of tables. */
const mainAisleMeters = 1.2;
/** Clear gap between rows. */
const rowGapMeters = 0.9;
/** Clear gap between neighbouring tables in a row. */
const tableGapMeters = 0.7;
/** How far in from the lot's own walls furniture may start. */
const wallInsetMeters = 0.3;

export type TableCounts = {
  twoSeat?: number;
  fourSeat?: number;
  sixSeat?: number;
  privateRoom10?: number;
};

export type DoorEdge = "south" | "north" | "east" | "west";

export type ShopLayoutSpec = {
  /** The lot's rectangle, in metres. */
  lot: { x: number; y: number; width: number; height: number };
  tables: TableCounts;
  /** Which side of the lot the door opens on. Default `"south"`. */
  doorEdge?: DoorEdge;
};

export type PlacedTable = {
  kind: keyof typeof tableSize;
  /** Four corners, in scene metres, closed. */
  points: ScenePoint[];
  seats: number;
};

export type ShopLayout = {
  capacity: number;
  /** Where people step in: the middle of the door edge. */
  entrancePosition: ScenePoint;
  /** Where a queue forms: outside the door, in the corridor. */
  queueAnchor: ScenePoint;
  tables: PlacedTable[];
  /**
   * Private rooms, as three-sided walls open towards the aisle. A closed room
   * would need a doorway cut, and this project only cuts doorways through a
   * `building`'s footprint — a `wall` has no way to open (see
   * `wallSegmentsFromScene`), so an enclosed room would be one nobody could
   * walk into.
   */
  rooms: { points: ScenePoint[] }[];
  /** Floor the tables themselves occupy, excluding every gap. */
  tableAreaSquareMeters: number;
  lotAreaSquareMeters: number;
};

/**
 * Lay a shop's tables out inside its lot.
 *
 * Throws when they do not fit. That rejection is a real result, not an error
 * path: "this area cannot hold these tables" is a check a scheme can be run
 * through, and it is one of the few things here that is arithmetic rather
 * than inference.
 *
 * Throws on an empty table mix for the same reason, one step earlier: a shop
 * with no tables has no capacity, and `shopSchema.capacity` is positive, so
 * writing one would be a scene the schema rejects. Said here, it arrives as
 * the answer it is instead of a validation error thrown from inside `apply`.
 */
export function planShopLayout(spec: ShopLayoutSpec): ShopLayout {
  const edge = spec.doorEdge ?? "south";
  const usable = inset(spec.lot, wallInsetMeters);

  if (usable.width <= 0 || usable.height <= 0) {
    throw new Error(
      `Lot is too small to inset (${spec.lot.width} x ${spec.lot.height} m)`,
    );
  }

  const region = minusAisle(usable, edge, mainAisleMeters);

  if (region.width <= 0 || region.height <= 0) {
    throw new Error(
      `Lot leaves no room behind the ${mainAisleMeters} m aisle (${spec.lot.width} x ${spec.lot.height} m)`,
    );
  }

  // Last of the three refusals, so a lot too small to hold anything still says
  // that rather than complaining about the tables it was never going to hold.
  if (countTables(spec.tables) === 0) {
    throw new Error(
      "No tables to place. A shop with no tables has no capacity, and a " +
        "capacity of zero is not a shop — give it at least one table.",
    );
  }

  // Lay out in a frame where `u` runs along the door edge and `v` runs away
  // from it, so one algorithm covers all four door sides.
  const frame = edgeFrame(region, edge);
  const tables: PlacedTable[] = [];
  const rooms: ShopLayout["rooms"] = [];
  let tableArea = 0;
  let u = 0;
  let v = 0;
  let rowDepth = 0;

  for (const kind of ["privateRoom10", "sixSeat", "fourSeat", "twoSeat"] as const) {
    const size = tableSize[kind];

    for (let placed = 0; placed < (spec.tables[kind] ?? 0); placed++) {
      if (u > 0 && u + size.width > frame.span + 1e-9) {
        v += rowDepth + rowGapMeters;
        u = 0;
        rowDepth = 0;
      }

      if (v + size.height > frame.depth + 1e-9) {
        throw new Error(
          `${spec.tables.twoSeat ?? 0}+${spec.tables.fourSeat ?? 0}+` +
            `${spec.tables.sixSeat ?? 0}+${spec.tables.privateRoom10 ?? 0} tables ` +
            `do not fit in a ${spec.lot.width} x ${spec.lot.height} m lot`,
        );
      }

      const corners = [
        frame.toPoint(u, v),
        frame.toPoint(u + size.width, v),
        frame.toPoint(u + size.width, v + size.height),
        frame.toPoint(u, v + size.height),
      ];

      tables.push({ kind, points: corners, seats: size.seats });
      tableArea += size.width * size.height;

      if (kind === "privateRoom10") {
        // Three sides, open on the aisle-facing one.
        rooms.push({
          points: [
            frame.toPoint(u, v + size.height),
            frame.toPoint(u, v),
            frame.toPoint(u + size.width, v),
            frame.toPoint(u + size.width, v + size.height),
          ],
        });
      }

      u += size.width + tableGapMeters;
      rowDepth = Math.max(rowDepth, size.height);
    }
  }

  return {
    capacity: tables.reduce((sum, table) => sum + table.seats, 0),
    entrancePosition: edgeMidpoint(spec.lot, edge),
    queueAnchor: outsideDoor(spec.lot, edge),
    tables,
    rooms,
    tableAreaSquareMeters: tableArea,
    lotAreaSquareMeters: spec.lot.width * spec.lot.height,
  };
}

/**
 * Write a layout into a shop that has **no store lot** — a street site, where
 * the shop's own rectangle is all the geometry there is.
 *
 * The furniture is still placed: an `obstacle` is a polygon on a floor like
 * any other and needs no lot to hold it. What is missing here is the lot's
 * frontage, so which side the door opens on is the form's choice rather than
 * something read off a building. `size` resizes the shop as it lays out, so a
 * form that asks for a different area gets a different shop rather than the
 * same shop with a number changed next to it.
 */
export function applyShopLayoutToShop(
  scene: CrowdSimScene,
  shopId: string,
  spec: ShopLayoutSpec,
  options: LayoutOptions = {},
): CrowdSimScene {
  const shop = scene.shops.find((candidate) => candidate.id === shopId);

  if (!shop) {
    throw new Error(`Unknown shop: ${shopId}`);
  }

  const size = options.size ?? shop.size;
  const layout = planShopLayout({
    ...spec,
    lot: {
      x: shop.position.x - size.width / 2,
      y: shop.position.y - size.height / 2,
      width: size.width,
      height: size.height,
    },
  });

  return writeLayout(
    scene,
    {
      floorId: shop.floorId,
      id: shop.id,
      label: shop.name ?? shop.id,
      size,
    },
    layout,
    spec,
    options,
  );
}

/**
 * An area in square metres as a rectangle, 2:3.
 *
 * The ratio is a stand-in for a floor plan nobody has drawn yet, and it is
 * the one arbitrary number here a reader could mistake for a rule. It is
 * not: it exists so that an area produces *a* rectangle to lay tables out
 * in, and the layout it produces is what is compared, never its shape.
 */
export function sizeForArea(areaSquareMeters: number) {
  const height = Math.sqrt(areaSquareMeters / 1.5);

  return { width: Math.max(2, height * 1.5), height: Math.max(2, height) };
}

/**
 * Price tier (1–5) from an average spend. **Self-chosen thresholds**, written
 * down because `brandProfileSchema.priceTier` is 1–5 and a yuan figure has to
 * land somewhere; they are a classification, not a measurement.
 */
export function priceTierForAverageTicket(averageTicketYuan: number): number {
  if (averageTicketYuan < 30) return 1;
  if (averageTicketYuan < 60) return 2;
  if (averageTicketYuan < 120) return 3;
  if (averageTicketYuan < 250) return 4;
  return 5;
}

type LayoutOptions = {
  averageTicketYuan?: number;
  dwellMeanSeconds?: number;
  name?: string;
  /** Only the no-lot path can resize the shop; a lot's size is its geometry. */
  size?: { width: number; height: number };
};

/**
 * Write a planned layout into the scene: the shop gains its capacity, door and
 * queue, and the furniture becomes obstacles that people have to walk around.
 *
 * Every entry point ends up here, so the furniture, the private rooms and the
 * shop's own fields are written exactly once. Writing them twice is how a fix
 * to one path quietly fails to reach the other.
 *
 * Furniture that blocks movement is the point — a layout that crowds the
 * aisles shows up as congestion, which is exactly the difference between two
 * layouts that this feature exists to measure.
 */
function writeLayout(
  scene: CrowdSimScene,
  target: {
    floorId: string | undefined;
    id: string;
    label: string;
    size: { width: number; height: number };
  },
  layout: ShopLayout,
  spec: ShopLayoutSpec,
  options: LayoutOptions,
): CrowdSimScene {
  return parseScene({
    ...scene,
    obstacles: [
      ...scene.obstacles.filter(
        (obstacle) => !obstacle.id.startsWith(`${target.id}-table-`),
      ),
      ...layout.tables.map((table, index) => ({
        id: `${target.id}-table-${index + 1}`,
        name: `${target.label} table ${index + 1}`,
        floorId: target.floorId,
        kind: "furniture" as const,
        geometry: { type: "polygon" as const, points: table.points },
      })),
    ],
    walls: [
      ...scene.walls.filter((wall) => !wall.id.startsWith(`${target.id}-room-`)),
      ...layout.rooms.map((room, index) => ({
        id: `${target.id}-room-${index + 1}`,
        name: `${target.label} private room ${index + 1}`,
        floorId: target.floorId,
        geometry: { type: "polyline" as const, points: room.points },
      })),
    ],
    shops: scene.shops.map((candidate) =>
      candidate.id === target.id
        ? {
            ...candidate,
            name: options.name ?? candidate.name,
            capacity: layout.capacity,
            entrancePosition: layout.entrancePosition,
            queueAnchor: layout.queueAnchor,
            dwellMeanSeconds: options.dwellMeanSeconds ?? candidate.dwellMeanSeconds,
            size: target.size,
            brand:
              options.averageTicketYuan === undefined || !candidate.brand
                ? candidate.brand
                : {
                    ...candidate.brand,
                    priceTier: priceTierForAverageTicket(options.averageTicketYuan),
                  },
            customParameters: {
              ...candidate.customParameters,
              // The form is the only place the ticket price exists — the
              // schema keeps a 1-5 tier, not yuan — so it is written back
              // next to the tables it came in with, or the form cannot be
              // reopened on the shop it just produced.
              ...(options.averageTicketYuan === undefined
                ? {}
                : { averageTicketYuan: options.averageTicketYuan }),
              tableAreaSquareMeters: layout.tableAreaSquareMeters,
              lotAreaSquareMeters: layout.lotAreaSquareMeters,
              tables: spec.tables,
              doorEdge: spec.doorEdge ?? "south",
            },
          }
        : candidate,
    ),
  });
}

export function applyShopLayoutToLot(
  scene: CrowdSimScene,
  lotId: string,
  spec: ShopLayoutSpec,
  options: {
    averageTicketYuan?: number;
    dwellMeanSeconds?: number;
    name?: string;
  } = {},
): CrowdSimScene {
  const lot = scene.storeLots.find((candidate) => candidate.id === lotId);

  if (!lot) {
    throw new Error(`Unknown store lot: ${lotId}`);
  }

  const shop = scene.shops.find((candidate) => candidate.storeLotId === lotId);

  if (!shop) {
    throw new Error(`Store lot ${lotId} has no shop on it`);
  }

  const layout = planShopLayout(layoutSpecFor(lot.geometry.points, spec));
  const bounds = lotBounds(lot.geometry.points);

  return writeLayout(
    scene,
    {
      floorId: lot.floorId,
      id: shop.id,
      label: shop.name ?? shop.id,
      size: { width: bounds.width, height: bounds.height },
    },
    layout,
    spec,
    options,
  );
}

/** How many tables the mix asks for, counting a missing kind as none. */
function countTables(tables: TableCounts) {
  return (["twoSeat", "fourSeat", "sixSeat", "privateRoom10"] as const).reduce(
    (sum, kind) => sum + (tables[kind] ?? 0),
    0,
  );
}

function inset(
  rect: { x: number; y: number; width: number; height: number },
  by: number,
) {
  return {
    x: rect.x + by,
    y: rect.y + by,
    width: rect.width - by * 2,
    height: rect.height - by * 2,
  };
}

function minusAisle(
  usable: { x: number; y: number; width: number; height: number },
  edge: DoorEdge,
  aisle: number,
) {
  if (edge === "south") {
    return { ...usable, height: usable.height - aisle };
  }

  if (edge === "north") {
    return {
      x: usable.x,
      y: usable.y + aisle,
      width: usable.width,
      height: usable.height - aisle,
    };
  }

  if (edge === "west") {
    return {
      x: usable.x + aisle,
      y: usable.y,
      width: usable.width - aisle,
      height: usable.height,
    };
  }

  return { ...usable, width: usable.width - aisle };
}

/**
 * `(u, v)` in a frame where `u` runs along the door edge and `v` runs away
 * from it, mapped back to scene coordinates.
 */
function edgeFrame(
  region: { x: number; y: number; width: number; height: number },
  edge: DoorEdge,
) {
  if (edge === "south") {
    return {
      span: region.width,
      depth: region.height,
      toPoint: (u: number, v: number): ScenePoint => ({
        x: region.x + u,
        y: region.y + v,
      }),
    };
  }

  if (edge === "north") {
    return {
      span: region.width,
      depth: region.height,
      toPoint: (u: number, v: number): ScenePoint => ({
        x: region.x + u,
        y: region.y + region.height - v,
      }),
    };
  }

  if (edge === "west") {
    return {
      span: region.height,
      depth: region.width,
      toPoint: (u: number, v: number): ScenePoint => ({
        x: region.x + region.width - v,
        y: region.y + u,
      }),
    };
  }

  return {
    span: region.height,
    depth: region.width,
    toPoint: (u: number, v: number): ScenePoint => ({
      x: region.x + v,
      y: region.y + u,
    }),
  };
}

function edgeMidpoint(
  rect: { x: number; y: number; width: number; height: number },
  edge: DoorEdge,
): ScenePoint {
  if (edge === "south") return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  if (edge === "north") return { x: rect.x + rect.width / 2, y: rect.y };
  if (edge === "west") return { x: rect.x, y: rect.y + rect.height / 2 };
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
}

/** A queue forms in the corridor, not in the shop: outside the door. */
function outsideDoor(
  rect: { x: number; y: number; width: number; height: number },
  edge: DoorEdge,
): ScenePoint {
  const door = edgeMidpoint(rect, edge);

  if (edge === "south") return { x: door.x, y: door.y + 2 };
  if (edge === "north") return { x: door.x, y: door.y - 2 };
  if (edge === "west") return { x: door.x - 2, y: door.y };
  return { x: door.x + 2, y: door.y };
}

/**
 * The rectangle to lay out in: the lot's own bounding box, taken from its
 * geometry rather than from the caller.
 *
 * Taking it from the caller was the obvious shape for this function and was
 * wrong: the caller's rectangle and the lot the shop actually sits on are two
 * different things, so the furniture landed at the origin while the shop
 * stayed where the lot is, and the tables had nothing to do with the store
 * they belonged to. A lot that is not a rectangle gets its bounding box,
 * which is a simplification, and is noted as one.
 */
function layoutSpecFor(
  points: readonly ScenePoint[],
  spec: ShopLayoutSpec,
): ShopLayoutSpec {
  const bounds = lotBounds(points);

  return {
    ...spec,
    lot: {
      x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y)),
      width: bounds.width,
      height: bounds.height,
    },
  };
}

function lotBounds(points: readonly ScenePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}
